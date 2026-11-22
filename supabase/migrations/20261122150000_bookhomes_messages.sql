-- Guest <-> host messaging ("Message the host" on every listing, host portal Messages tab, guest /trips/messages).
-- Writes only through the bookhomes-messages Edge Function (service connection). Clients may read their own rows
-- under RLS (host of the thread, the signed-in guest, or an admin), but never the guest link token or the
-- original text of a redacted message.

create table if not exists bookhomes.threads (
  id uuid primary key default gen_random_uuid(),
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  host_id uuid not null references bookhomes.hosts(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete set null,
  guest_name text not null check (length(guest_name) between 1 and 120),
  guest_email text not null check (length(guest_email) between 3 and 254),
  guest_phone text check (guest_phone is null or length(guest_phone) <= 30),
  booking_id uuid references bookhomes.bookings(id) on delete set null,
  check_in date,
  check_out date,
  guests integer check (guests is null or guests between 1 and 50),
  guest_token uuid not null default gen_random_uuid() unique,  -- private link for guests who are not signed in
  status text not null default 'open' check (status in ('open', 'archived', 'blocked')),
  flagged boolean not null default false,
  host_unread integer not null default 0,
  guest_unread integer not null default 0,
  last_message_at timestamptz not null default now(),
  last_sender text,
  last_preview text,
  created_at timestamptz not null default now()
);
create index if not exists threads_host_idx on bookhomes.threads (host_id, last_message_at desc);
create index if not exists threads_guest_user_idx on bookhomes.threads (guest_user_id, last_message_at desc);
create index if not exists threads_guest_email_idx on bookhomes.threads (lower(guest_email));
create index if not exists threads_listing_idx on bookhomes.threads (listing_id);

create table if not exists bookhomes.messages (
  id bigint generated always as identity primary key,
  thread_id uuid not null references bookhomes.threads(id) on delete cascade,
  sender text not null check (sender in ('guest', 'host', 'system')),
  sender_user_id uuid references auth.users(id) on delete set null,
  body text not null check (length(body) between 1 and 4000),
  redacted boolean not null default false,       -- phone numbers / emails hidden before a paid booking
  original_body text,                            -- admins only (disputes)
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists messages_thread_idx on bookhomes.messages (thread_id, created_at);

alter table bookhomes.threads enable row level security;
alter table bookhomes.messages enable row level security;

revoke all on bookhomes.threads from anon, authenticated;
revoke all on bookhomes.messages from anon, authenticated;
grant select (id, listing_id, host_id, guest_user_id, guest_name, guest_email, guest_phone, booking_id, check_in, check_out, guests,
              status, flagged, host_unread, guest_unread, last_message_at, last_sender, last_preview, created_at)
  on bookhomes.threads to authenticated;
grant select (id, thread_id, sender, body, redacted, created_at, read_at) on bookhomes.messages to authenticated;

drop policy if exists threads_participants on bookhomes.threads;
create policy threads_participants on bookhomes.threads for select to authenticated using (
  (select bookhomes.is_admin())
  or guest_user_id = (select auth.uid())
  or host_id in (select h.id from bookhomes.hosts h where h.user_id = (select auth.uid()))
);
drop policy if exists messages_participants on bookhomes.messages;
create policy messages_participants on bookhomes.messages for select to authenticated using (
  thread_id in (select t.id from bookhomes.threads t)  -- the threads policy decides
);
