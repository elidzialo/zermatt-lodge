-- Payout details, host bank accounts (encrypted) and SMS (22 Nov 2026, owner decisions).
-- 1. bookhomes.hosts gets a display-only copy of the Stripe payout account: bank name, last 4 digits, currency and a
--    payout schedule summary. Never a full number. Refreshed by bookhomes-connect-onboard (status) and the webhook.
-- 2. bookhomes.host_bank_accounts: bank details for hosts paid by manual bank transfer. Sort code and account number are
--    encrypted with pgcrypto (pgp_sym_encrypt) using a key held in Supabase Vault ('bookhomes_bank_key').
--    RLS on with no policies and no grants: only service-role functions (bookhomes-host, bookhomes-admin) can touch it.
-- 3. bookhomes.sms_log + profiles.sms_opt_out for transactional texts (off unless the Twilio secrets are set).

-- Vault key (created once, server side; never printed or returned).
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'bookhomes_bank_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'base64'), 'bookhomes_bank_key',
                                'BookHomes: encrypts host bank sort codes and account numbers (host_bank_accounts)');
  end if;
end $$;

alter table bookhomes.hosts
  add column if not exists payout_bank_name text,
  add column if not exists payout_bank_last4 text check (payout_bank_last4 is null or payout_bank_last4 ~ '^[0-9]{2,4}$'),
  add column if not exists payout_currency text,
  add column if not exists payout_schedule text,
  add column if not exists payout_details_at timestamptz;
comment on column bookhomes.hosts.payout_bank_last4 is 'Last 4 digits of the Stripe payout bank account (display only, never the full number).';

alter table bookhomes.profiles add column if not exists sms_opt_out boolean not null default false;
grant update (sms_opt_out) on bookhomes.profiles to authenticated;

create table if not exists bookhomes.host_bank_accounts (
  host_id uuid primary key references bookhomes.hosts(id) on delete cascade,
  holder_name text not null check (length(holder_name) between 2 and 70),
  sort_code_enc bytea not null,
  account_number_enc bytea not null,
  last4 text not null check (last4 ~ '^[0-9]{4}$'),
  sort_code_masked text not null check (sort_code_masked ~ '^\*\*-\*\*-[0-9]{2}$'),
  verified_format boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table bookhomes.host_bank_accounts is 'Host bank details for manual transfers. Encrypted (pgp_sym_encrypt, Vault key bookhomes_bank_key). Service role only.';
comment on column bookhomes.host_bank_accounts.verified_format is 'Sort code is 6 digits and account number 8 digits. Not a UK modulus check (that needs Vocalink data files).';
alter table bookhomes.host_bank_accounts enable row level security;
revoke all on bookhomes.host_bank_accounts from public, anon, authenticated;

-- Encrypt and save (insert or replace). Digits only; the function checks the format again.
create or replace function bookhomes.save_host_bank(p_host uuid, p_holder text, p_sort text, p_account text)
returns table (last4 text, sort_code_masked text)
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  if p_sort !~ '^[0-9]{6}$' or p_account !~ '^[0-9]{8}$' then raise exception 'bad bank format' using errcode = '22023'; end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'bookhomes_bank_key';
  if k is null then raise exception 'bank key missing'; end if;
  insert into bookhomes.host_bank_accounts as b (host_id, holder_name, sort_code_enc, account_number_enc, last4, sort_code_masked, verified_format, updated_at)
  values (p_host, p_holder, extensions.pgp_sym_encrypt(p_sort, k), extensions.pgp_sym_encrypt(p_account, k), right(p_account, 4),
          '**-**-' || right(p_sort, 2), true, now())
  on conflict (host_id) do update set holder_name = excluded.holder_name, sort_code_enc = excluded.sort_code_enc,
    account_number_enc = excluded.account_number_enc, last4 = excluded.last4, sort_code_masked = excluded.sort_code_masked,
    verified_format = excluded.verified_format, updated_at = now();
  return query select b.last4, b.sort_code_masked from bookhomes.host_bank_accounts b where b.host_id = p_host;
end $$;

-- Full details for an admin making a transfer (bookhomes-admin checks admin + aal2 and writes the audit log).
create or replace function bookhomes.reveal_host_bank(p_host uuid)
returns table (holder_name text, sort_code text, account_number text)
language plpgsql security definer set search_path = '' as $$
declare k text;
begin
  select decrypted_secret into k from vault.decrypted_secrets where name = 'bookhomes_bank_key';
  if k is null then raise exception 'bank key missing'; end if;
  return query select b.holder_name, extensions.pgp_sym_decrypt(b.sort_code_enc, k), extensions.pgp_sym_decrypt(b.account_number_enc, k)
                 from bookhomes.host_bank_accounts b where b.host_id = p_host;
end $$;

revoke all on function bookhomes.save_host_bank(uuid, text, text, text) from public, anon, authenticated;
revoke all on function bookhomes.reveal_host_bank(uuid) from public, anon, authenticated;
grant execute on function bookhomes.save_host_bank(uuid, text, text, text) to service_role;
grant execute on function bookhomes.reveal_host_bank(uuid) to service_role;

-- SMS log: one row per text we tried (or skipped). Numbers are masked; the message body has no secrets.
create table if not exists bookhomes.sms_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,
  to_masked text,
  email text,
  booking_id uuid,
  listing_id bigint,
  status text not null check (status in ('off', 'dry_run', 'opted_out', 'no_number', 'not_mobile', 'sent', 'failed')),
  provider_id text,
  error text,
  body text
);
create index if not exists sms_log_at on bookhomes.sms_log (at desc);
alter table bookhomes.sms_log enable row level security;
revoke all on bookhomes.sms_log from public, anon, authenticated;

-- One text per event (webhook retries, double clicks): dedupe_key such as 'payout:<id>'.
alter table bookhomes.sms_log add column if not exists dedupe_key text;
create unique index if not exists sms_log_dedupe on bookhomes.sms_log (dedupe_key) where dedupe_key is not null and status in ('sent', 'dry_run', 'off');
