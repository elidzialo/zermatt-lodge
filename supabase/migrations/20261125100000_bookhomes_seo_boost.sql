-- SEO Boost (paid host feature, 25 Nov 2026): a host buys Mini (5 guide pages) or Max (30 guide pages) for one listing.
-- Each guide page answers 4-6 real questions from the host's own facts (questionnaire + listing data), built from keyword
-- research (Google Autocomplete, or LLM candidates when blocked). Host previews and edits, admin approves, then pages go live
-- 2-3 a day (pg_cron below) and the static build (build.py -> bh_seo.py) renders them at /<listing>/guide/<topic>.
-- Writes only through the bookhomes-seo Edge Function (service connection) and the security definer functions below.
-- Hosts may read their own rows under RLS; admins read everything.

create table if not exists bookhomes.seo_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  host_id uuid not null references bookhomes.hosts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  package text not null check (package in ('mini', 'max', 'upgrade')),
  pages_target integer not null check (pages_target between 1 and 30),
  price_pence integer not null check (price_pence >= 0),
  currency text not null default 'gbp',
  status text not null default 'checkout' check (status in ('checkout', 'paid', 'needs_setup', 'researching', 'planning', 'writing',
    'host_review', 'admin_review', 'publishing', 'published', 'failed', 'cancelled', 'refunded', 'expired')),
  answers jsonb not null default '{}'::jsonb,      -- host questionnaire
  facts jsonb,                                     -- [{id, label, text, source}] the only facts answers may use
  keywords jsonb,                                  -- {source, note, seeds, suggestions:[{q, seed}], questions:[...]}
  keyword_source text check (keyword_source in ('autocomplete', 'llm', 'mixed')),
  plan jsonb,                                      -- clusters chosen by the planning step
  step_index integer not null default 0,           -- next page to write
  attempts integer not null default 0,
  locked_until timestamptz,
  last_error text,
  stripe_session_id text unique,
  stripe_payment_intent text,
  paid_at timestamptz,
  receipt_sent_at timestamptz,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric(10, 4) not null default 0,
  model text,
  host_submitted_at timestamptz,
  approved_at timestamptz,
  approved_by text,
  cancelled_at timestamptz,
  refunded_at timestamptz,
  refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_orders_listing_idx on bookhomes.seo_orders (listing_id, created_at desc);
create index if not exists seo_orders_status_idx on bookhomes.seo_orders (status, updated_at);

create table if not exists bookhomes.seo_pages (
  id bigint generated always as identity primary key,
  order_id uuid not null references bookhomes.seo_orders(id) on delete cascade,
  listing_id bigint not null references bookhomes.listings(id) on delete cascade,
  topic_slug text not null check (topic_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(topic_slug) <= 80),
  title text not null check (length(title) between 5 and 120),
  meta_description text check (meta_description is null or length(meta_description) <= 170),
  intro text check (intro is null or length(intro) <= 1200),
  keyword text,
  position integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'removed', 'queued', 'published', 'unpublished')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (listing_id, topic_slug)
);
create index if not exists seo_pages_order_idx on bookhomes.seo_pages (order_id, position);
create index if not exists seo_pages_live_idx on bookhomes.seo_pages (status, listing_id);

create table if not exists bookhomes.seo_items (
  id bigint generated always as identity primary key,
  page_id bigint not null references bookhomes.seo_pages(id) on delete cascade,
  order_id uuid not null references bookhomes.seo_orders(id) on delete cascade,
  position integer not null default 0,
  question text not null check (length(question) between 5 and 200),
  answer text not null check (length(answer) between 20 and 2000),
  keyword text,
  fact_ids text[] not null default '{}',           -- which host/listing facts the answer uses
  on_listing boolean not null default false,       -- also shown in the FAQ block on the listing page
  removed boolean not null default false,
  edited_by_host boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists seo_items_page_idx on bookhomes.seo_items (page_id, position);
create index if not exists seo_items_order_idx on bookhomes.seo_items (order_id);

alter table bookhomes.seo_orders enable row level security;
alter table bookhomes.seo_pages enable row level security;
alter table bookhomes.seo_items enable row level security;
revoke all on bookhomes.seo_orders, bookhomes.seo_pages, bookhomes.seo_items from anon, authenticated;
grant select (id, listing_id, host_id, package, pages_target, price_pence, currency, status, answers, keyword_source, paid_at,
              host_submitted_at, approved_at, cancelled_at, refunded_at, created_at, updated_at) on bookhomes.seo_orders to authenticated;
grant select on bookhomes.seo_pages, bookhomes.seo_items to authenticated;

drop policy if exists seo_orders_own on bookhomes.seo_orders;
create policy seo_orders_own on bookhomes.seo_orders for select to authenticated using (
  (select bookhomes.is_admin()) or host_id in (select h.id from bookhomes.hosts h where h.user_id = (select auth.uid()))
);
drop policy if exists seo_pages_own on bookhomes.seo_pages;
create policy seo_pages_own on bookhomes.seo_pages for select to authenticated using (
  order_id in (select o.id from bookhomes.seo_orders o)  -- the orders policy decides
);
drop policy if exists seo_items_own on bookhomes.seo_items;
create policy seo_items_own on bookhomes.seo_items for select to authenticated using (
  order_id in (select o.id from bookhomes.seo_orders o)
);

-- Packages and limits (admin > SEO Boost > Settings). Prices in pence.
insert into bookhomes.settings (key, value, updated_at, updated_by)
values ('seo_boost', '{"enabled": true, "mini": {"price_pence": 3000, "pages": 5}, "max": {"price_pence": 15000, "pages": 30},
         "max_pages_per_listing": 30, "pages_per_day": [2, 3], "model": "claude-sonnet-5-5", "usd_per_mtok_in": 3, "usd_per_mtok_out": 15}'::jsonb,
        now(), 'migration')
on conflict (key) do nothing;

-- Drip publishing: every approved order gets 2 or 3 more pages live a day (3 while 9+ are waiting), oldest order first.
-- Returns how many pages went live. The site build (GitHub Action "SEO Boost publish", daily) turns them into static pages.
create or replace function bookhomes.seo_publish_due(p_order uuid default null) returns integer
language plpgsql security definer set search_path = bookhomes, public as $$
declare o record; n integer; total integer := 0; left_ integer;
begin
  for o in select id from bookhomes.seo_orders where status = 'publishing' and (p_order is null or id = p_order) order by approved_at loop
    select count(*) into left_ from bookhomes.seo_pages where order_id = o.id and status = 'queued';
    n := case when left_ >= 9 then 3 else 2 end;
    with nxt as (select id from bookhomes.seo_pages where order_id = o.id and status = 'queued' order by position, id limit n)
    update bookhomes.seo_pages p set status = 'published', published_at = now(), updated_at = now() from nxt where p.id = nxt.id;
    get diagnostics n = row_count;
    total := total + n;
    if not exists (select 1 from bookhomes.seo_pages where order_id = o.id and status = 'queued') then
      update bookhomes.seo_orders set status = 'published', updated_at = now() where id = o.id;
    end if;
    insert into bookhomes.audit_log (actor_email, action, entity, entity_id, details)
      values ('cron', 'seo_publish', 'seo_order', o.id::text, jsonb_build_object('pages', n));
  end loop;
  return total;
end $$;
revoke all on function bookhomes.seo_publish_due(uuid) from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname in ('bookhomes-seo-publish', 'bookhomes-seo-work');
-- 05:40 UTC daily; the GitHub Action builds the site at 06:10 UTC.
select cron.schedule('bookhomes-seo-publish', '40 5 * * *', $$ select bookhomes.seo_publish_due(); $$);
-- Generation worker: one step per call (research, plan, or one page), so no call runs long. Exits at once when idle.
select cron.schedule('bookhomes-seo-work', '*/2 * * * *', $$
  select net.http_post(
    url := 'https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-seo?action=work',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select value #>> '{}' from bookhomes.settings where key = 'cron_secret')),
    body := '{}'::jsonb, timeout_milliseconds := 150000);
$$);
