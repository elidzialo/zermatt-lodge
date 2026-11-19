// Public listings API for /stays/ (and the static build script).
// GET  ?action=list                          approved listings with photos, rating, derived badges
// GET  ?action=get&slug=...                  one approved listing + its published reviews
// GET  ?action=search&check_in&check_out&guests   availability + all-in total per listing for those dates
// GET  ?action=review_info&t=<token>         for the review page (completed stays only)
// POST {action:"alert", email, slug, check_in, check_out, guests, consent}  "email me if these dates free up" (bookhomes.date_alerts; emailed by bookhomes-ical-sync)
// POST {action:"review", t, rating, comment}                         one review per completed, paid stay
// Never returns host emails/phones, street addresses or iCal tokens.
import { isValidIsoDate, ukToday } from "../_shared/util.ts";
import { EMAIL_RE, features, getSetting, handle, HttpError, int, jsonRes, readBody, slugify, sql, str, UUID_RE } from "../_shared/bh.ts";
import { lines, quote } from "../_shared/bh_quote.ts";

async function listAll(where?: { slug?: string }) {
  const ls = where?.slug
    ? await sql`select * from bookhomes.public_listings where slug = ${where.slug}`
    : await sql`select * from bookhomes.public_listings order by (legacy_source is null), approved_at`;
  if (!ls.length) return [];
  const ids = ls.map((l: { id: number }) => l.id);
  const photos = await sql`select listing_id, url, caption from bookhomes.listing_photos where listing_id = any(${ids}::bigint[]) order by listing_id, sort, created_at`;
  const stats = await sql`select listing_id, count(*)::int as n, round(avg(rating)::numeric, 2)::float8 as avg
                            from bookhomes.reviews where published and listing_id = any(${ids}::bigint[]) group by listing_id`;
  // Honest "from" price: the lowest nightly price actually bookable in the next 90 days (null = add dates to see prices)
  const froms = await sql`select x.id, (select min(c.price)::float8 from bookhomes.listing_calendar(x.id, bookhomes.uk_today(), bookhomes.uk_today() + 90) c
                                         where c.status = 'available') as p
                            from unnest(${ids}::bigint[]) as x(id)`;
  const featured = await getSetting<number[]>("featured_listings", []);
  // deno-lint-ignore no-explicit-any
  return ls.map((l: any) => {
    const st = stats.find((s: { listing_id: number }) => Number(s.listing_id) === Number(l.id));
    return {
      ...l,
      id: Number(l.id),
      base_price: l.base_price === null ? null : Number(l.base_price),
      weekend_price: l.weekend_price === null ? null : Number(l.weekend_price),
      cleaning_fee: Number(l.cleaning_fee),
      baths: Number(l.baths),
      lat: l.lat === null ? null : Number(l.lat),
      lng: l.lng === null ? null : Number(l.lng),
      url: l.page_url || `/${l.slug}`,
      photos: photos.filter((p: { listing_id: number }) => Number(p.listing_id) === Number(l.id)).map((p: { url: string; caption: string }) => ({ url: p.url, caption: p.caption })),
      reviews: st ? { count: st.n, average: st.avg } : { count: 0, average: null },
      from_price: froms.find((f: { id: number }) => Number(f.id) === Number(l.id))?.p ?? null,
      features: features(l),
      featured: featured.includes(Number(l.id)),
      ...(l.extra_guest_fee !== undefined ? { extra_guest_fee: Number(l.extra_guest_fee), pet_fee: Number(l.pet_fee) } : {}),
    };
  });
}

Deno.serve(handle(async (req) => {
  const u = new URL(req.url);
  if (req.method === "GET") {
    const action = u.searchParams.get("action") ?? "list";
    if (action === "list") {
      return jsonRes({ updated: new Date().toISOString(), listings: await listAll() }, 200, { "Cache-Control": "public, max-age=60" });
    }
    if (action === "get") {
      const slug = slugify(u.searchParams.get("slug") ?? "");
      const [l] = await listAll({ slug });
      if (!l) throw new HttpError(404, "Listing not found");
      const reviews = await sql`select rating, comment, guest_first_name, to_char(created_at, 'Month YYYY') as when
                                  from bookhomes.reviews where published and listing_id = ${l.id} order by created_at desc limit 30`;
      return jsonRes({ listing: l, reviews }, 200, { "Cache-Control": "public, max-age=60" });
    }
    if (action === "search") {
      const ci = u.searchParams.get("check_in"), co = u.searchParams.get("check_out");
      const guests = int(u.searchParams.get("guests"), 1, 30) ?? 1;
      if (!isValidIsoDate(ci) || !isValidIsoDate(co) || co <= ci || ci < ukToday()) throw new HttpError(400, "Choose valid dates");
      const ls = await sql`select id, legacy_source, max_guests, cleaning_fee from bookhomes.public_listings`;
      const out = [];
      for (const l of ls) {
        if (guests > l.max_guests) { out.push({ id: Number(l.id), available: false, reason: "guests" }); continue; }
        if (l.legacy_source) {
          // Zermatt Lodge: priced from its own live calendar (same as the home page) + its cleaning fee
          const c = await sql`select count(*)::int n, count(*) filter (where status <> 'available' or price is null)::int bad,
                                     coalesce(sum(price), 0)::float8 total, (array_agg(min_stay order by date))[1] as first_min,
                                     bool_or(closed_to_arrival and date = ${ci}::date) as cta
                                from bookhomes.listing_calendar(${l.id}, ${ci}::date, ${co}::date)`;
          const n = (Date.parse(co) - Date.parse(ci)) / 864e5;
          const ok = c[0].n === n && c[0].bad === 0 && !c[0].cta && n >= (c[0].first_min ?? 1);
          out.push({ id: Number(l.id), available: ok, total_pence: ok ? Math.round((c[0].total + Number(l.cleaning_fee)) * 100) : null, nights: n,
            nightly_subtotal_pence: ok ? Math.round(c[0].total * 100) : null, cleaning_fee_pence: ok ? Math.round(Number(l.cleaning_fee) * 100) : null });
          continue;
        }
        try {
          const q = await quote(Number(l.id), ci, co, guests, 0);
          out.push({ id: Number(l.id), available: true, total_pence: q.amount_pence, nights: q.nights, discount_pence: q.discount_pence,
            nightly_subtotal_pence: q.nights_pence, cleaning_fee_pence: q.cleaning_pence, extra_guest_pence: q.extra_guest_pence, lines: lines(q) });
        } catch (e) {
          out.push({ id: Number(l.id), available: false, reason: (e as { code?: string }).code ?? "NOT_AVAILABLE", message: e instanceof HttpError && e.status < 500 ? e.message : undefined });
        }
      }
      return jsonRes({ check_in: ci, check_out: co, guests, results: out }, 200, { "Cache-Control": "public, max-age=60" });
    }
    if (action === "review_info") {
      const t = u.searchParams.get("t") ?? "";
      if (!UUID_RE.test(t)) throw new HttpError(400, "That review link is not valid.");
      const r = await sql`select l.title, l.slug, b.check_in::text, b.check_out::text, b.status, b.check_out <= bookhomes.uk_today() as done,
                                 exists (select 1 from bookhomes.reviews v where v.booking_id = b.id) as reviewed
                            from bookhomes.bookings b join bookhomes.listings l on l.id = b.listing_id where b.review_token = ${t}::uuid`;
      if (!r.length || r[0].status !== "paid") throw new HttpError(404, "That review link is not valid.");
      return jsonRes(r[0]);
    }
    throw new HttpError(400, "Unknown action");
  }

  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const body = await readBody(req, 4000);
  if (body.action === "alert") {
    const email = (str(body.email, 200) ?? "").toLowerCase();
    const slug = slugify(String(body.slug ?? ""));
    const ci = body.check_in, co = body.check_out;
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Please enter a valid email.");
    if (!slug || !isValidIsoDate(ci) || !isValidIsoDate(co) || co <= ci) throw new HttpError(400, "Choose your dates first.");
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "";
    const ipHash = ip ? Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("bh-alert:" + ip))))
      .map((x) => x.toString(16).padStart(2, "0")).join("").slice(0, 32) : null;
    if (ipHash) {
      const recent = await sql`select count(*)::int n from bookhomes.date_alerts where ip_hash = ${ipHash} and created_at > now() - interval '1 hour'`;
      if (recent[0].n >= 8) throw new HttpError(429, "Too many requests. Please try again later.");
    }
    const l = await sql`select id from bookhomes.public_listings where slug = ${slug}`;
    if (!l.length) throw new HttpError(404, "Listing not found");
    const guests = int(body.guests, 1, 30) ?? 1;
    await sql`insert into bookhomes.date_alerts (email, listing_id, check_in, check_out, guests, consent, ip_hash)
              values (${email}, ${l[0].id}, ${ci}::date, ${co}::date, ${guests}, ${body.consent === true}, ${ipHash})`;
    await sql`insert into zermatt.leads (email, consent, source_page, ip_hash)
              values (${email}, ${body.consent === true}, ${`date alert /stays/${slug}/ ${ci} to ${co}`}, ${ipHash})`;
    return jsonRes({ ok: true });
  }
  if (body.action === "review") {
    const t = String(body.t ?? "");
    const rating = int(body.rating, 1, 5);
    const comment = str(body.comment, 2000);
    if (!UUID_RE.test(t) || !rating) throw new HttpError(400, "Please choose a star rating.");
    const r = await sql`select b.id, b.listing_id, b.guest_name from bookhomes.bookings b
                         where b.review_token = ${t}::uuid and b.status = 'paid' and b.check_out <= bookhomes.uk_today()`;
    if (!r.length) throw new HttpError(404, "Reviews open after a completed stay.");
    const first = String(r[0].guest_name).trim().split(/\s+/)[0].slice(0, 40);
    const ins = await sql`insert into bookhomes.reviews (booking_id, listing_id, rating, comment, guest_first_name)
                          values (${r[0].id}, ${r[0].listing_id}, ${rating}, ${comment}, ${first})
                          on conflict (booking_id) do nothing returning id`;
    if (!ins.length) throw new HttpError(409, "You have already reviewed this stay. Thank you!");
    return jsonRes({ ok: true });
  }
  throw new HttpError(400, "Unknown action");
}));
