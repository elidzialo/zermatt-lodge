-- Admin host management (22 Nov 2026): soft delete for hosts, and the last Stripe check per host.
-- profiles/hosts rows of a deleted host stay (bookings, payouts and the audit log point at them); the auth user is banned
-- or, if the host never had a listing, booking or payout, deleted outright (rows cascade).
alter table bookhomes.profiles add column if not exists deleted_at timestamptz, add column if not exists deleted_by text;
alter table bookhomes.hosts add column if not exists deleted_at timestamptz,
  add column if not exists connect_waiting_on text check (connect_waiting_on is null or connect_waiting_on in ('host', 'stripe')),
  add column if not exists connect_checked_at timestamptz;
comment on column bookhomes.hosts.connect_waiting_on is 'Last admin Stripe refresh: who the pending account is waiting on (host = details still due, stripe = Stripe reviewing).';
