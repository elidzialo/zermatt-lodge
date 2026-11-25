// POST /functions/v1/bookhomes-seo   { action, ... }   SEO Boost (paid host feature, 25 Nov 2026). verify_jwt off: own auth per action.
//   public:  packages, public_pages (published pages for the site build, no auth, never addresses)
//   host:    host_status, host_order, host_checkout, host_confirm, host_edit_item, host_remove_item, host_remove_page, host_submit
//   admin:   admin_list, admin_order, admin_approve, admin_send_back, admin_edit_item, admin_remove_item, admin_remove_page,
//            admin_retry, admin_cancel, admin_settings, admin_publish_now     (admin email + 2-step, every change audit-logged)
//   worker:  work (pg_cron every 2 minutes, header x-cron-secret): Stripe reconcile, receipts, then one generation step at a time
// Packages: Mini (5 pages) and Max (30 pages), upgrade Mini -> Max pays the difference; at most 30 boost pages per listing.
// Payment: Stripe Checkout on the PLATFORM account (normal charge); bookhomes-stripe-webhook marks the order paid
// (metadata.bh_kind = seo_boost) and this worker double-checks open sessions. Claude: ANTHROPIC_API_KEY (else "needs_setup").
// Source: github.com/elidzialo/zermatt-lodge supabase/functions/bookhomes-seo (deployed pinned by commit).
import { adminClient, optionalEnv, siteUrl, stripeClient } from "../_shared/util.ts";
import { audit, getSetting, getUser, handle, HttpError, int, jsonRes, readBody, requireAdmin, returnBase, setSetting, sql, str, UUID_RE } from "../_shared/bh.ts";
import { sendLogged, sendToAdmins } from "../_shared/mailer.ts";
import { adminNotice } from "../_shared/bh_emails.ts";
import {
  AUDIENCES, autocomplete, buildFacts, checkEdit, claude, clean, costUsd, extractJson, type Fact, keywordSeeds, mergeSettings,
  planPrompt, type SeoSettings, topicSlug, validatePage, writePrompt,
} from "../_shared/bh_seo_core.ts";

const ACTIVE = ["paid", "needs_setup", "researching", "planning", "writing", "host_review", "admin_review", "publishing", "published", "failed"];
const money = (p: number) => "£" + (p / 100).toFixed(2).replace(/\.00$/, "");
async function settings(): Promise<SeoSettings> { return mergeSettings(await getSetting("seo_boost", {})); }
const bigint = (v: unknown) => int(v, 1, 1e12);

// ----------------------------------------------------------------------------- package maths per listing
async function listingState(listingId: number, s: SeoSettings) {
  const orders = await sql`select id, package, pages_target, price_pence, status from bookhomes.seo_orders
                            where listing_id = ${listingId} and status = any(${ACTIVE})`;
  const allocated = orders.reduce((n: number, o: { pages_target: number }) => n + o.pages_target, 0);
  const paidMini = orders.filter((o: { package: string }) => o.package === "mini").reduce((n: number, o: { price_pence: number }) => n + o.price_pence, 0);
  const hasMax = orders.some((o: { package: string }) => o.package !== "mini");
  const cap = s.max_pages_per_listing;
  const offers: { package: string; pages: number; price_pence: number; label: string }[] = [];
  if (allocated === 0) {
    offers.push({ package: "mini", pages: Math.min(s.mini.pages, cap), price_pence: s.mini.price_pence, label: "Mini" });
    offers.push({ package: "max", pages: Math.min(s.max.pages, cap), price_pence: s.max.price_pence, label: "Max" });
  } else if (!hasMax && paidMini > 0 && allocated < Math.min(s.max.pages, cap)) {
    offers.push({ package: "upgrade", pages: Math.min(s.max.pages, cap) - allocated, price_pence: Math.max(0, s.max.price_pence - paidMini), label: "Upgrade to Max" });
  }
  return { allocated, cap, offers };
}

// deno-lint-ignore no-explicit-any
function cleanAnswers(b: any) {
  const a = b && typeof b === "object" ? b : {};
  const nearby = (Array.isArray(a.nearby) ? a.nearby : []).slice(0, 12)
    .map((n: { name?: unknown; how?: unknown }) => ({ name: clean(n?.name, 100), how: clean(n?.how, 200) })).filter((n: { name: string }) => n.name);
  return {
    special: clean(a.special, 1200), nearby, guests: (Array.isArray(a.guests) ? a.guests : []).filter((x: string) => AUDIENCES[x]).slice(0, 10),
    parking: clean(a.parking, 500), checkin: clean(a.checkin, 600), rules: clean(a.rules, 800), transport: clean(a.transport, 600), extra: clean(a.extra, 1200),
  };
}

async function hostListing(userId: string, listingId: number) {
  const r = await sql`select l.id, l.title, l.slug, l.status, l.host_id, p.email from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id
                       join bookhomes.profiles p on p.user_id = h.user_id
                       where l.id = ${listingId} and h.user_id = ${userId} and l.deleted_at is null`;
  if (!r.length) throw new HttpError(404, "Listing not found");
  return r[0];
}
async function hostOrder(userId: string, orderId: unknown) {
  if (typeof orderId !== "string" || !UUID_RE.test(orderId)) throw new HttpError(400, "Invalid order");
  const r = await sql`select o.* from bookhomes.seo_orders o join bookhomes.hosts h on h.id = o.host_id where o.id = ${orderId} and h.user_id = ${userId}`;
  if (!r.length) throw new HttpError(404, "Order not found");
  return r[0];
}
async function orderPages(orderId: string, includeFactsFor: "host" | "admin") {
  const pages = await sql`select id, topic_slug, title, meta_description, intro, keyword, position, status, published_at from bookhomes.seo_pages
                           where order_id = ${orderId} order by position, id`;
  const items = await sql`select id, page_id, position, question, answer, keyword, fact_ids, on_listing, removed, edited_by_host from bookhomes.seo_items
                           where order_id = ${orderId} order by page_id, position, id`;
  const byPage = new Map<number, unknown[]>();
  for (const it of items) { const k = Number(it.page_id); if (!byPage.has(k)) byPage.set(k, []); byPage.get(k)!.push(it); }
  return pages.map((p: { id: number }) => ({ ...p, items: byPage.get(Number(p.id)) ?? [], _for: includeFactsFor }));
}
function publicOrder(o: Record<string, unknown>) {
  const { facts, keywords, plan, stripe_session_id: _s, stripe_payment_intent: _p, locked_until: _l, refund_id: _r, ...rest } = o;
  return { ...rest, facts: Array.isArray(facts) ? (facts as Fact[]).map((f) => ({ id: f.id, label: f.label, text: f.text })) : [],
    keyword_count: (keywords as { suggestions?: unknown[] } | null)?.suggestions?.length ?? 0 };
}

// ----------------------------------------------------------------------------- payments
async function settlePaid(orderId: string, sessionId: string, pi: string | null): Promise<boolean> {
  const r = await sql`update bookhomes.seo_orders set status = 'paid', paid_at = coalesce(paid_at, now()), stripe_payment_intent = coalesce(${pi}, stripe_payment_intent), updated_at = now()
                       where id = ${orderId} and stripe_session_id = ${sessionId} and status in ('checkout', 'expired') returning id`;
  if (r.length) await audit(null, "seo_paid", "seo_order", orderId, { session: sessionId });
  return r.length > 0;
}

async function checkout(req: Request, b: Record<string, unknown>): Promise<Response> {
  const user = await getUser(req, false);
  const s = await settings();
  if (!s.enabled) throw new HttpError(409, "SEO Boost is paused right now.");
  const listingId = bigint(b.listing_id);
  if (!listingId) throw new HttpError(400, "Choose a listing");
  const l = await hostListing(user.id, listingId);
  if (l.status !== "approved") throw new HttpError(409, "Your listing needs to be live before you can boost it.");
  const st = await listingState(listingId, s);
  const offer = st.offers.find((o) => o.package === b.package);
  if (!offer) throw new HttpError(409, st.allocated >= st.cap ? `This listing already has the most guide pages (${st.cap}).` : "That package is not available for this listing.");
  if (offer.price_pence < 30) throw new HttpError(409, "This package has no price set. Please contact Book Homes.");
  const answers = cleanAnswers(b.answers);
  if (!answers.special || answers.special.length < 30) throw new HttpError(400, "Tell us what makes your home special (a couple of sentences).");
  if (answers.nearby.length < 2) throw new HttpError(400, "Add at least 2 nearby places you know.");
  // close any unpaid checkout for this listing first, so two sessions can never both be paid
  const stripe = stripeClient();
  for (const o of await sql`select id, stripe_session_id from bookhomes.seo_orders where listing_id = ${listingId} and status = 'checkout'`) {
    try { if (o.stripe_session_id) await stripe.checkout.sessions.expire(o.stripe_session_id); }
    catch (_e) {
      const sess = o.stripe_session_id ? await stripe.checkout.sessions.retrieve(o.stripe_session_id).catch(() => null) : null;
      if (sess?.payment_status === "paid") { await settlePaid(o.id, sess.id, typeof sess.payment_intent === "string" ? sess.payment_intent : null); throw new HttpError(409, "A payment for this listing has just gone through. Refresh the page."); }
    }
    await sql`update bookhomes.seo_orders set status = 'expired', updated_at = now() where id = ${o.id} and status = 'checkout'`;
  }
  const order = (await sql`insert into bookhomes.seo_orders (listing_id, host_id, user_id, package, pages_target, price_pence, answers, model)
                           values (${listingId}, ${l.host_id}, ${user.id}, ${offer.package}, ${offer.pages}, ${offer.price_pence}, ${sql.json(answers)}, ${s.model})
                           returning id`)[0];
  const base = returnBase(req);
  const name = `SEO Boost ${offer.label} (${offer.pages} guide pages) - ${String(l.title).slice(0, 80)}`;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ quantity: 1, price_data: { currency: "gbp", unit_amount: offer.price_pence, product_data: { name, description: "Q&A guide pages written for your home and area. Rankings are not guaranteed." } } }],
      customer_email: user.email,
      metadata: { bh_kind: "seo_boost", seo_order_id: order.id, listing_id: String(listingId) },
      payment_intent_data: { metadata: { bh_kind: "seo_boost", seo_order_id: order.id }, description: name },
      success_url: `${base}/host/?seo=paid&order=${order.id}`,
      cancel_url: `${base}/host/?seo=cancelled&order=${order.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
    }, { idempotencyKey: `bh-seo-${order.id}` });
    await sql`update bookhomes.seo_orders set stripe_session_id = ${session.id}, updated_at = now() where id = ${order.id}`;
    await audit(user, "seo_checkout", "seo_order", order.id, { listing_id: listingId, package: offer.package, price_pence: offer.price_pence });
    return jsonRes({ url: session.url, order_id: order.id });
  } catch (e) {
    await sql`update bookhomes.seo_orders set status = 'expired', last_error = 'stripe_error', updated_at = now() where id = ${order.id}`;
    console.error("seo checkout failed", (e as Error).message);
    throw new HttpError(502, "The payment page could not be opened. You have not been charged. Please try again.");
  }
}

async function confirm(req: Request, b: Record<string, unknown>): Promise<Response> {
  const user = await getUser(req, false);
  const o = await hostOrder(user.id, b.order_id);
  if (o.status === "checkout" && o.stripe_session_id) {
    const sess = await stripeClient().checkout.sessions.retrieve(o.stripe_session_id);
    if (sess.payment_status === "paid") await settlePaid(o.id, sess.id, typeof sess.payment_intent === "string" ? sess.payment_intent : null);
  }
  const r = await sql`select status from bookhomes.seo_orders where id = ${o.id}`;
  return jsonRes({ status: r[0].status });
}

// ----------------------------------------------------------------------------- edits (host before approval, admin any time)
async function editItem(itemId: number | null, q: unknown, a: unknown, scope: { userId?: string; admin?: boolean }) {
  if (!itemId) throw new HttpError(400, "Invalid item");
  const r = await sql`select i.id, i.order_id, o.status, o.facts, h.user_id from bookhomes.seo_items i join bookhomes.seo_orders o on o.id = i.order_id
                       join bookhomes.hosts h on h.id = o.host_id where i.id = ${itemId}`;
  if (!r.length || (!scope.admin && r[0].user_id !== scope.userId)) throw new HttpError(404, "Not found");
  if (!scope.admin && r[0].status !== "host_review") throw new HttpError(409, "These pages are with Book Homes now, so they can't be changed here.");
  const question = clean(q, 190), answer = clean(a, 1900);
  const why = checkEdit(question, answer, (r[0].facts || []) as Fact[]);
  if (why) throw new HttpError(400, `This can't be published: ${why}.`);
  await sql`update bookhomes.seo_items set question = ${question}, answer = ${answer}, edited_by_host = ${!scope.admin}, updated_at = now() where id = ${itemId}`;
  return r[0].order_id as string;
}
async function removeItem(itemId: number | null, removed: boolean, scope: { userId?: string; admin?: boolean }) {
  if (!itemId) throw new HttpError(400, "Invalid item");
  const r = await sql`select i.order_id, o.status, h.user_id from bookhomes.seo_items i join bookhomes.seo_orders o on o.id = i.order_id
                       join bookhomes.hosts h on h.id = o.host_id where i.id = ${itemId}`;
  if (!r.length || (!scope.admin && r[0].user_id !== scope.userId)) throw new HttpError(404, "Not found");
  if (!scope.admin && r[0].status !== "host_review") throw new HttpError(409, "These pages are with Book Homes now, so they can't be changed here.");
  await sql`update bookhomes.seo_items set removed = ${removed}, updated_at = now() where id = ${itemId}`;
  return r[0].order_id as string;
}
async function removePage(pageId: number | null, removed: boolean, scope: { userId?: string; admin?: boolean }) {
  if (!pageId) throw new HttpError(400, "Invalid page");
  const r = await sql`select p.order_id, p.status as pstatus, o.status, h.user_id from bookhomes.seo_pages p join bookhomes.seo_orders o on o.id = p.order_id
                       join bookhomes.hosts h on h.id = o.host_id where p.id = ${pageId}`;
  if (!r.length || (!scope.admin && r[0].user_id !== scope.userId)) throw new HttpError(404, "Not found");
  if (!scope.admin && r[0].status !== "host_review") throw new HttpError(409, "These pages are with Book Homes now, so they can't be changed here.");
  const next = removed ? (r[0].pstatus === "published" ? "unpublished" : "removed") : (r[0].pstatus === "unpublished" ? "published" : r[0].status === "publishing" ? "queued" : "draft");
  await sql`update bookhomes.seo_pages set status = ${next}, published_at = case when ${next} = 'published' then coalesce(published_at, now()) else published_at end, updated_at = now() where id = ${pageId}`;
  return r[0].order_id as string;
}

// ----------------------------------------------------------------------------- worker
async function hostEmail(orderId: string): Promise<{ email: string; name: string; title: string; slug: string } | null> {
  const r = await sql`select p.email, coalesce(p.name, '') as name, l.title, l.slug from bookhomes.seo_orders o join bookhomes.listings l on l.id = o.listing_id
                       join bookhomes.hosts h on h.id = o.host_id join bookhomes.profiles p on p.user_id = h.user_id where o.id = ${orderId}`;
  return r[0] ?? null;
}
async function sendReceipt(o: { id: string; package: string; pages_target: number; price_pence: number; paid_at: string }) {
  const h = await hostEmail(o.id);
  if (!h?.email) return;
  const label = o.package === "mini" ? "Mini" : o.package === "max" ? "Max" : "Upgrade to Max";
  const email = adminNotice(`Your SEO Boost receipt - ${h.title}`.slice(0, 120), [
    `Thanks${h.name ? " " + h.name.split(" ")[0] : ""}. We have received your payment of ${money(o.price_pence)} for SEO Boost ${label} (${o.pages_target} guide pages) for ${h.title}.`,
    `Order reference: ${o.id.slice(0, 8).toUpperCase()}. Paid on ${new Date(o.paid_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}. Stripe sends a separate card receipt.`,
    "We research what guests search for in your area and write question-and-answer pages from the facts you gave us. You will get an email to check them before anything goes live, usually within a day.",
    "Rankings are not guaranteed: search engines decide what they show.",
  ], siteUrl(), "/host/");
  await sendLogged(adminClient(), { toRole: "guest", to: h.email, template: "bh_seo_receipt", email });
}

async function reconcile() {
  const open = await sql`select id, stripe_session_id, created_at from bookhomes.seo_orders where status = 'checkout' and stripe_session_id is not null
                          and created_at < now() - interval '2 minutes' order by created_at limit 3`;
  if (!open.length) return;
  const stripe = stripeClient();
  for (const o of open) {
    try {
      const sess = await stripe.checkout.sessions.retrieve(o.stripe_session_id);
      if (sess.payment_status === "paid") await settlePaid(o.id, sess.id, typeof sess.payment_intent === "string" ? sess.payment_intent : null);
      else if (sess.status === "expired") await sql`update bookhomes.seo_orders set status = 'expired', updated_at = now() where id = ${o.id} and status = 'checkout'`;
    } catch (e) { console.error("seo reconcile", o.id, (e as Error).message); }
  }
}

// deno-lint-ignore no-explicit-any
async function addUsage(orderId: string, u: { input_tokens: number; output_tokens: number }, s: SeoSettings) {
  await sql`update bookhomes.seo_orders set tokens_in = tokens_in + ${u.input_tokens}, tokens_out = tokens_out + ${u.output_tokens},
              cost_usd = cost_usd + ${costUsd(u, s)}, updated_at = now() where id = ${orderId}`;
}

// deno-lint-ignore no-explicit-any
async function step(o: any, s: SeoSettings, key: string | undefined): Promise<string> {
  const l = (await sql`select * from bookhomes.listings where id = ${o.listing_id}`)[0];
  if (!l) throw new Error("listing missing");
  if (o.status === "paid" || o.status === "needs_setup") {
    if (!key) {
      if (o.status !== "needs_setup") {
        await sql`update bookhomes.seo_orders set status = 'needs_setup', last_error = 'ANTHROPIC_API_KEY is not set', updated_at = now() where id = ${o.id}`;
        await sendToAdmins(adminClient(), "bh_seo_needs_setup", adminNotice("SEO Boost order waiting: AI key missing", [`A paid SEO Boost order for ${l.title} is waiting because the ANTHROPIC_API_KEY secret is not set in Supabase.`], siteUrl(), "/admin/"));
      }
      return "needs_setup";
    }
    const facts = buildFacts(l, o.answers);
    await sql`update bookhomes.seo_orders set status = 'researching', facts = ${sql.json(facts)}, last_error = null, updated_at = now() where id = ${o.id}`;
    return "facts";
  }
  if (o.status === "researching") {
    const seeds = keywordSeeds(l, o.answers, o.pages_target > 10 ? 24 : 14);
    const ks = await autocomplete(seeds);
    await sql`update bookhomes.seo_orders set keywords = ${sql.json(ks)}, keyword_source = ${ks.source}, status = 'planning', updated_at = now() where id = ${o.id}`;
    return "research";
  }
  if (!key) { await sql`update bookhomes.seo_orders set status = 'needs_setup', last_error = 'ANTHROPIC_API_KEY is not set', updated_at = now() where id = ${o.id}`; return "needs_setup"; }
  const facts = (o.facts || []) as Fact[];
  if (o.status === "planning") {
    const existing = (await sql`select title from bookhomes.seo_pages where listing_id = ${o.listing_id} and status <> 'removed'`).map((r: { title: string }) => r.title);
    const kw = (o.keywords?.suggestions || []).map((x: { q: string }) => x.q);
    const llmKw = o.keyword_source === "llm";
    const p = planPrompt({ listingTitle: l.title, area: l.area || l.city, city: l.city || l.area, type: l.property_type || "home", facts, keywords: kw, existing, pages: o.pages_target, llmKeywords: llmKw });
    const r = await claude(key, s.model, p.system, p.user, Math.min(12000, 1200 + o.pages_target * 450));
    await addUsage(o.id, r.usage, s);
    // deno-lint-ignore no-explicit-any
    const plan: any = extractJson(r.text);
    const pages = (Array.isArray(plan.pages) ? plan.pages : []).filter((pg: { questions?: unknown[] }) => Array.isArray(pg.questions) && pg.questions.length >= 3).slice(0, o.pages_target);
    if (!pages.length) throw new Error("plan had no usable pages");
    const keywords = llmKw ? { ...(o.keywords || {}), questions: (plan.candidate_queries || []).slice(0, 80).map((q: string) => clean(q, 120)) } : o.keywords;
    await sql`update bookhomes.seo_orders set plan = ${sql.json({ pages })}, keywords = ${sql.json(keywords)}, status = 'writing', step_index = 0, updated_at = now() where id = ${o.id}`;
    return "plan";
  }
  if (o.status === "writing") {
    const pages = o.plan?.pages || [];
    const i = o.step_index as number;
    if (i < pages.length) {
      const pg = pages[i];
      const p = writePrompt({ listingTitle: l.title, area: l.area || l.city, city: l.city || l.area, facts, page: pg });
      const r = await claude(key, s.model, p.system, p.user, 3500);
      await addUsage(o.id, r.usage, s);
      const v = validatePage(extractJson(r.text), facts);
      if (v.items.length >= 3 && v.title) {
        const taken = new Set<string>((await sql`select topic_slug from bookhomes.seo_pages where listing_id = ${o.listing_id}`).map((x: { topic_slug: string }) => x.topic_slug));
        const slug = topicSlug(pg.slug || v.title, taken);
        const faqQs = new Set((pg.questions || []).filter((q: { faq?: boolean }) => q.faq).map((q: { q: string }) => clean(q.q, 190).toLowerCase()));
        await sql.begin(async (tx: typeof sql) => {
          const page = (await tx`insert into bookhomes.seo_pages (order_id, listing_id, topic_slug, title, meta_description, intro, keyword, position)
                                 values (${o.id}, ${o.listing_id}, ${slug}, ${v.title}, ${v.meta || null}, ${v.intro || null}, ${clean(pg.keyword, 120) || null}, ${i}) returning id`)[0];
          let n = 0;
          for (const it of v.items) {
            await tx`insert into bookhomes.seo_items (page_id, order_id, position, question, answer, keyword, fact_ids, on_listing)
                     values (${page.id}, ${o.id}, ${n++}, ${it.q}, ${it.a}, ${clean(pg.keyword, 120) || null}, ${it.facts}, ${faqQs.has(it.q.toLowerCase()) || n === 1 && i < 4})`;
          }
        });
      }
      if (v.dropped.length) await audit(null, "seo_dropped", "seo_order", o.id, { page: pg.title, dropped: v.dropped });
      await sql`update bookhomes.seo_orders set step_index = step_index + 1, attempts = 0, updated_at = now() where id = ${o.id}`;
      return "page";
    }
    const made = (await sql`select count(*)::int as n from bookhomes.seo_pages where order_id = ${o.id}`)[0].n;
    if (!made) throw new Error("no page passed the checks");
    await sql`update bookhomes.seo_orders set status = 'host_review', updated_at = now() where id = ${o.id}`;
    const h = await hostEmail(o.id);
    if (h?.email) await sendLogged(adminClient(), { toRole: "guest", to: h.email, template: "bh_seo_ready", email: adminNotice(`Your guide pages are ready to check - ${h.title}`.slice(0, 120), [
      `We have written ${made} guide page${made === 1 ? "" : "s"} for ${h.title}${made < o.pages_target ? ` (${o.pages_target} were ordered: we only keep pages we can back with your facts, and Book Homes will be in touch about the rest)` : ""}.`,
      "Please read them, change or remove anything, then press Send for approval. Nothing goes live until you and Book Homes have checked it.",
    ], siteUrl(), `/host/#seo=${o.id}`) });
    return "done";
  }
  return "idle";
}

async function work(req: Request): Promise<Response> {
  const given = req.headers.get("x-cron-secret") ?? "";
  const row = await sql`select value #>> '{}' as v from bookhomes.settings where key = 'cron_secret'`;
  if (!row.length || !given || given !== row[0].v) throw new HttpError(401, "Not allowed");
  const t0 = Date.now(), done: string[] = [];
  await reconcile();
  for (const o of await sql`select id, package, pages_target, price_pence, paid_at from bookhomes.seo_orders where paid_at is not null and receipt_sent_at is null limit 5`) {
    await sql`update bookhomes.seo_orders set receipt_sent_at = now() where id = ${o.id}`;
    await sendReceipt(o);
  }
  const s = await settings();
  const key = optionalEnv("ANTHROPIC_API_KEY");
  while (Date.now() - t0 < 85000) {
    const o = (await sql`update bookhomes.seo_orders set locked_until = now() + interval '3 minutes'
                          where id = (select id from bookhomes.seo_orders
                                       where status = any(${key ? ["paid", "needs_setup", "researching", "planning", "writing"] : ["paid"]})
                                         and (locked_until is null or locked_until < now()) order by paid_at limit 1 for update skip locked)
                          returning *`)[0];
    if (!o) break;
    try { done.push(await step(o, s, key)); }
    catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      console.error("seo step failed", o.id, o.status, msg);
      await sql`update bookhomes.seo_orders set attempts = attempts + 1, last_error = ${msg},
                  status = case when attempts + 1 >= 4 then 'failed' else status end, updated_at = now() where id = ${o.id}`;
      done.push("error");
    } finally {
      await sql`update bookhomes.seo_orders set locked_until = null where id = ${o.id}`;
    }
    if (done[done.length - 1] === "needs_setup" || done[done.length - 1] === "error") break;
  }
  return jsonRes({ ok: true, steps: done, ms: Date.now() - t0 });
}

// ----------------------------------------------------------------------------- public
async function publicPages(): Promise<Response> {
  const pages = await sql`select p.id, p.topic_slug, p.title, p.meta_description, p.intro, p.keyword, p.position, p.published_at, l.slug as listing_slug, l.id as listing_id, l.title as listing_title, l.area, l.city
                           from bookhomes.seo_pages p join bookhomes.listings l on l.id = p.listing_id join bookhomes.seo_orders o on o.id = p.order_id
                           where p.status = 'published' and l.status = 'approved' and l.deleted_at is null and o.status in ('publishing', 'published')
                           order by l.id, p.published_at, p.position`;
  const ids = pages.map((p: { id: number }) => p.id);
  const items = ids.length ? await sql`select page_id, question, answer, on_listing from bookhomes.seo_items where page_id = any(${ids}) and not removed order by page_id, position, id` : [];
  const by = new Map<number, unknown[]>();
  for (const it of items) { const k = Number(it.page_id); if (!by.has(k)) by.set(k, []); by.get(k)!.push({ q: it.question, a: it.answer, on_listing: it.on_listing }); }
  return jsonRes({ pages: pages.map((p: { id: number }) => ({ ...p, items: by.get(Number(p.id)) ?? [] })).filter((p: { items: unknown[] }) => p.items.length) },
    200, { "Cache-Control": "public, max-age=300" });
}

// ----------------------------------------------------------------------------- router
Deno.serve(handle(async (req) => {
  const url = new URL(req.url);
  const b = req.method === "POST" ? await readBody(req) : {};
  const action = String(url.searchParams.get("action") || b.action || "");
  switch (action) {
    case "work": return await work(req);
    case "public_pages": return await publicPages();
    case "packages": {
      const s = await settings();
      return jsonRes({ enabled: s.enabled, mini: s.mini, max: s.max, max_pages_per_listing: s.max_pages_per_listing });
    }

    case "host_status": {
      const user = await getUser(req, false);
      const s = await settings();
      const ls = await sql`select l.id, l.title, l.slug, l.status from bookhomes.listings l join bookhomes.hosts h on h.id = l.host_id
                            where h.user_id = ${user.id} and l.deleted_at is null and l.status <> 'archived' order by l.id`;
      const orders = await sql`select o.id, o.listing_id, o.package, o.pages_target, o.price_pence, o.status, o.paid_at, o.created_at, o.host_submitted_at, o.approved_at,
                                 (select count(*)::int from bookhomes.seo_pages p where p.order_id = o.id and p.status not in ('removed', 'unpublished')) as pages,
                                 (select count(*)::int from bookhomes.seo_pages p where p.order_id = o.id and p.status = 'published') as live
                                from bookhomes.seo_orders o join bookhomes.hosts h on h.id = o.host_id
                                where h.user_id = ${user.id} and o.status not in ('checkout', 'expired') order by o.created_at desc`;
      const listings = [];
      for (const l of ls) listings.push({ ...l, ...(l.status === "approved" ? await listingState(l.id, s) : { allocated: 0, cap: s.max_pages_per_listing, offers: [] }) });
      return jsonRes({ enabled: s.enabled, packages: { mini: s.mini, max: s.max }, cap: s.max_pages_per_listing, listings, orders, audiences: AUDIENCES });
    }
    case "host_order": {
      const user = await getUser(req, false);
      const o = await hostOrder(user.id, b.order_id);
      return jsonRes({ order: publicOrder(o), pages: await orderPages(o.id, "host") });
    }
    case "host_checkout": return await checkout(req, b);
    case "host_confirm": return await confirm(req, b);
    case "host_edit_item": case "host_remove_item": case "host_remove_page": {
      const user = await getUser(req, false);
      const id = action === "host_edit_item" ? await editItem(bigint(b.item_id), b.question, b.answer, { userId: user.id })
        : action === "host_remove_item" ? await removeItem(bigint(b.item_id), b.removed !== false, { userId: user.id })
        : await removePage(bigint(b.page_id), b.removed !== false, { userId: user.id });
      await audit(user, action, "seo_order", id, { item: b.item_id ?? null, page: b.page_id ?? null, removed: b.removed ?? null });
      return jsonRes({ ok: true });
    }
    case "host_submit": {
      const user = await getUser(req, false);
      const o = await hostOrder(user.id, b.order_id);
      if (o.status !== "host_review") throw new HttpError(409, "These pages are not waiting for you.");
      const live = (await sql`select count(*)::int as n from bookhomes.seo_pages p where p.order_id = ${o.id} and p.status = 'draft'
                                and exists (select 1 from bookhomes.seo_items i where i.page_id = p.id and not i.removed)`)[0].n;
      if (!live) throw new HttpError(409, "Keep at least one page, or contact us if you would rather cancel.");
      await sql`update bookhomes.seo_orders set status = 'admin_review', host_submitted_at = now(), updated_at = now() where id = ${o.id}`;
      await audit(user, "seo_host_submit", "seo_order", o.id, { pages: live });
      const h = await hostEmail(o.id);
      await sendToAdmins(adminClient(), "bh_seo_review", adminNotice("SEO Boost pages to approve", [`${h?.title ?? "A listing"}: ${live} guide pages checked by the host and waiting for approval.`], siteUrl(), "/admin/"));
      return jsonRes({ ok: true, status: "admin_review" });
    }

    case "admin_list": {
      await requireAdmin(req);
      const rows = await sql`select o.id, o.listing_id, l.title as listing_title, l.slug, p.email as host_email, o.package, o.pages_target, o.price_pence, o.status,
                               o.keyword_source, o.cost_usd, o.tokens_in, o.tokens_out, o.last_error, o.paid_at, o.created_at, o.updated_at, o.refunded_at,
                               (select count(*)::int from bookhomes.seo_pages x where x.order_id = o.id and x.status not in ('removed', 'unpublished')) as pages,
                               (select count(*)::int from bookhomes.seo_pages x where x.order_id = o.id and x.status = 'published') as live,
                               (select count(*)::int from bookhomes.seo_items i where i.order_id = o.id and not i.removed) as items
                              from bookhomes.seo_orders o join bookhomes.listings l on l.id = o.listing_id join bookhomes.hosts h on h.id = o.host_id
                              join bookhomes.profiles p on p.user_id = h.user_id
                              where o.status <> 'expired' or o.created_at > now() - interval '7 days' order by o.created_at desc limit 300`;
      return jsonRes({ orders: rows, settings: await settings(), key_set: !!optionalEnv("ANTHROPIC_API_KEY") });
    }
    case "admin_order": {
      await requireAdmin(req);
      const id = String(b.order_id || "");
      if (!UUID_RE.test(id)) throw new HttpError(400, "Invalid order");
      const o = (await sql`select o.*, l.title as listing_title, l.slug, p.email as host_email from bookhomes.seo_orders o join bookhomes.listings l on l.id = o.listing_id
                            join bookhomes.hosts h on h.id = o.host_id join bookhomes.profiles p on p.user_id = h.user_id where o.id = ${id}`)[0];
      if (!o) throw new HttpError(404, "Order not found");
      const history = await sql`select at, actor_email, action, details from bookhomes.audit_log where entity = 'seo_order' and entity_id = ${id} order by at desc limit 100`;
      return jsonRes({ order: o, pages: await orderPages(id, "admin"), history });
    }
    case "admin_approve": case "admin_send_back": case "admin_retry": case "admin_cancel": case "admin_publish_now": {
      const admin = await requireAdmin(req);
      const id = String(b.order_id || "");
      if (!UUID_RE.test(id)) throw new HttpError(400, "Invalid order");
      const o = (await sql`select * from bookhomes.seo_orders where id = ${id}`)[0];
      if (!o) throw new HttpError(404, "Order not found");
      let out: Record<string, unknown> = {};
      if (action === "admin_approve") {
        if (!["admin_review", "host_review"].includes(o.status)) throw new HttpError(409, `Order is ${o.status}`);
        await sql`update bookhomes.seo_pages set status = 'queued', updated_at = now() where order_id = ${id} and status = 'draft'`;
        await sql`update bookhomes.seo_orders set status = 'publishing', approved_at = now(), approved_by = ${admin.email}, updated_at = now() where id = ${id}`;
        out.published_now = (await sql`select bookhomes.seo_publish_due(${id}::uuid) as n`)[0].n;
        const h = await hostEmail(id);
        if (h?.email) await sendLogged(adminClient(), { toRole: "guest", to: h.email, template: "bh_seo_approved", email: adminNotice(`Your guide pages are approved - ${h.title}`.slice(0, 120), [
          "Your guide pages are approved. The first ones go live with the next site update, then 2 or 3 more each day, so search engines see steady, genuine updates.",
          "Rankings are not guaranteed: search engines decide what they show.",
        ], siteUrl(), `/host/#seo=${id}`) });
      } else if (action === "admin_send_back") {
        if (o.status !== "admin_review") throw new HttpError(409, `Order is ${o.status}`);
        const note = str(b.note, 1000);
        await sql`update bookhomes.seo_orders set status = 'host_review', updated_at = now() where id = ${id}`;
        const h = await hostEmail(id);
        if (h?.email) await sendLogged(adminClient(), { toRole: "guest", to: h.email, template: "bh_seo_changes", email: adminNotice(`Please check your guide pages again - ${h.title}`.slice(0, 120),
          ["Book Homes has asked for a change to your guide pages before they go live.", ...(note ? [`Note: ${note}`] : [])], siteUrl(), `/host/#seo=${id}`) });
        out.note = note;
      } else if (action === "admin_retry") {
        if (!["failed", "needs_setup"].includes(o.status)) throw new HttpError(409, `Order is ${o.status}`);
        const back = o.plan ? "writing" : o.keywords ? "planning" : o.facts ? "researching" : "paid";
        await sql`update bookhomes.seo_orders set status = ${back}, attempts = 0, last_error = null, locked_until = null, updated_at = now() where id = ${id}`;
        out.status = back;
      } else if (action === "admin_publish_now") {
        if (o.status !== "publishing") throw new HttpError(409, `Order is ${o.status}`);
        out.published_now = (await sql`select bookhomes.seo_publish_due(${id}::uuid) as n`)[0].n;
      } else {
        if (["cancelled", "refunded"].includes(o.status)) throw new HttpError(409, "Already cancelled");
        const refund = b.refund === "full";
        if (refund) {
          if (!o.stripe_payment_intent) throw new HttpError(409, "No payment to refund (cancel without a refund instead).");
          const r = await stripeClient().refunds.create({ payment_intent: o.stripe_payment_intent, metadata: { seo_order_id: id } }, { idempotencyKey: `bh-seo-refund-${id}` });
          out.refund_id = r.id;
        }
        await sql`update bookhomes.seo_orders set status = ${refund ? "refunded" : "cancelled"}, cancelled_at = now(), refunded_at = ${refund ? new Date() : null},
                    refund_id = ${(out.refund_id as string) ?? null}, updated_at = now() where id = ${id}`;
        await sql`update bookhomes.seo_pages set status = case when status = 'published' then 'unpublished' else 'removed' end, updated_at = now()
                   where order_id = ${id} and status in ('draft', 'queued', 'published')`;
        out.reason = str(b.reason, 500);
      }
      await audit(admin, action, "seo_order", id, { from: o.status, ...out });
      return jsonRes({ ok: true, ...out });
    }
    case "admin_edit_item": case "admin_remove_item": case "admin_remove_page": {
      const admin = await requireAdmin(req);
      const id = action === "admin_edit_item" ? await editItem(bigint(b.item_id), b.question, b.answer, { admin: true })
        : action === "admin_remove_item" ? await removeItem(bigint(b.item_id), b.removed !== false, { admin: true })
        : await removePage(bigint(b.page_id), b.removed !== false, { admin: true });
      await audit(admin, action, "seo_order", id, { item: b.item_id ?? null, page: b.page_id ?? null, removed: b.removed ?? null });
      return jsonRes({ ok: true });
    }
    case "admin_settings": {
      const admin = await requireAdmin(req);
      if (b.settings && typeof b.settings === "object") {
        const before = await settings();
        const next = mergeSettings({ ...before, ...(b.settings as object) });
        await setSetting("seo_boost", next, admin.email);
        await audit(admin, "seo_settings", "settings", "seo_boost", { before, after: next });
        return jsonRes({ settings: next });
      }
      return jsonRes({ settings: await settings() });
    }
  }
  throw new HttpError(400, "Unknown action");
}));
