-- Book Homes "Feedback & bugs" chat (/admin/feedback/).
-- Eli reports bugs and asks for improvements; a triage agent (service role, via the bookhomes-feedback function) replies,
-- sets status, priority and who builds it. Non-destructive: only CREATE ... IF NOT EXISTS and new policies.

create table if not exists bookhomes.feedback (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  author          text not null,
  kind            text not null default 'bug' check (kind in ('bug', 'improvement', 'question')),
  page_url        text check (page_url is null or length(page_url) <= 2000),
  message         text not null check (length(message) between 1 and 5000),
  screenshot_path text check (screenshot_path is null or length(screenshot_path) <= 300),
  status          text not null default 'new' check (status in ('new', 'triaged', 'in_progress', 'done', 'wont_do')),
  priority        text check (priority is null or priority in ('P1', 'P2', 'P3')),
  assigned_to     text[] not null default '{}' check (assigned_to <@ array['backend', 'ux', 'optimiser', 'content']::text[]),
  agent_reply     text check (agent_reply is null or length(agent_reply) <= 5000)
);
create index if not exists feedback_status_idx on bookhomes.feedback (status, created_at desc);

create table if not exists bookhomes.feedback_messages (
  id          uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references bookhomes.feedback (id) on delete cascade,
  author      text not null check (author in ('eli', 'agent')),
  body        text not null check (length(body) between 1 and 5000),
  created_at  timestamptz not null default now()
);
create index if not exists feedback_messages_fid_idx on bookhomes.feedback_messages (feedback_id, created_at);

-- Admins only (email in zermatt.admins and 2-step verified). The service role bypasses RLS for the triage agent.
alter table bookhomes.feedback enable row level security;
alter table bookhomes.feedback_messages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'bookhomes' and tablename = 'feedback' and policyname = 'admin_all') then
    create policy admin_all on bookhomes.feedback for all to authenticated
      using ((select bookhomes.is_admin())) with check ((select bookhomes.is_admin()));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'bookhomes' and tablename = 'feedback_messages' and policyname = 'admin_all') then
    create policy admin_all on bookhomes.feedback_messages for all to authenticated
      using ((select bookhomes.is_admin())) with check ((select bookhomes.is_admin()));
  end if;
end $$;
grant select, insert, update on bookhomes.feedback, bookhomes.feedback_messages to authenticated;

-- Private bucket for screenshots. Uploads and views go through short-lived signed URLs from bookhomes-feedback.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('feedback', 'feedback', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

-- Open items Eli raised on 19 Nov 2026
insert into bookhomes.feedback (author, kind, message, status, priority, assigned_to)
select 'eli@zelr.co.uk', s.kind, s.message, s.status, s.priority, s.assigned
from (values
  ('bug', 'Desktop date picker jumps on hover', 'P1', array['ux'], 'triaged'),
  ('improvement', 'Logo needs to be much better, like Airbnb', 'P2', array['ux'], 'triaged'),
  ('improvement', 'Admin design and functions need to be much better; split Admin and My listings', 'P1', array['ux', 'backend'], 'triaged'),
  ('bug', 'Pending SQL supabase/PENDING_pricing_calendar.sql showed an error when run in the SQL editor', 'P1', array['backend'], 'done'),  -- applied and verified the same day
  ('improvement', 'Branded auth emails need Resend', 'P2', array['backend'], 'triaged')
) as s(kind, message, priority, assigned, status)
where not exists (select 1 from bookhomes.feedback f where f.message = s.message);
