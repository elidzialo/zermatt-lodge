// POST /functions/v1/bookhomes-import-airbnb   { url, listing_id? }
// One-click import of a host's OWN public Airbnb listing into a Book Homes draft (the host reviews every step after).
// Reads the public page: embedded JSON (data-deferred-state / niobe client data) plus og: tags. Imports title,
// description, property type, guests, bedrooms, beds, baths, amenities, house rules, check-in/out times, city,
// approximate map pin and photos (copied into listing-photos/<user id>/<listing id>/, each with a 720px <name>.t.jpg card thumbnail). Price is only returned as a
// hint for the host; it is never saved. Reviews and ratings are never imported.
// Airbnb can block or change its pages: then the answer is { ok:false, code:"AIRBNB_UNREADABLE", manual:true }
// and the wizard switches to "paste your description" mode. The Airbnb calendar link can always be added for sync.
// Auth: the host's own token. Only imports into the caller's own draft (or a new draft). Rate limited.
import { asUser, getUser, handle, HttpError, jsonRes, rateLimit, readBody, slugify, sql } from "../_shared/bh.ts";
import { listingFields } from "../_shared/bh_listing.ts";
import { copyPhoto, fetchPage, MAX_PHOTOS, parseAirbnb, publicUrl, roomId } from "../_shared/bh_airbnb.ts";

Deno.serve(handle(async (req) => {
  if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
  const user = await getUser(req, false);
  const b = await readBody(req, 2000);
  const id = roomId(String(b.url ?? ""));
  if (!id) throw new HttpError(400, "Paste your Airbnb listing link. It looks like https://www.airbnb.co.uk/rooms/12345678", "BAD_URL");
  await rateLimit("import_airbnb", user.id, 6, 3600, "You've imported a few times already. Please wait an hour, or fill in the steps by hand.");

  // Target: the host's own draft, or a new draft
  const host = await asUser(user, (tx) => tx`select bookhomes.my_host_id() as id`);
  if (!host[0].id) throw new HttpError(403, "Finish your host profile first.");
  let listingId = b.listing_id ? Number(b.listing_id) : null;
  if (listingId) {
    const own = await asUser(user, (tx) => tx`select status from bookhomes.listings where id = ${listingId} and host_id = bookhomes.my_host_id() and legacy_source is null`);
    if (!own.length) throw new HttpError(404, "Listing not found");
    if (!["draft", "rejected"].includes(own[0].status)) throw new HttpError(409, "Import only works on a draft. Edit a live listing step by step instead.", "NOT_DRAFT");
  }

  let html: string;
  try {
    html = await fetchPage(id);
  } catch (e) {
    console.warn("airbnb fetch failed", id, (e as Error).message);
    return jsonRes({ ok: false, manual: true, code: "AIRBNB_UNREADABLE",
      error: "We couldn't read that Airbnb page automatically. Paste your listing description instead, and add your Airbnb calendar link in the calendar step to sync dates." });
  }
  const parsed = parseAirbnb(html);
  const got = Object.keys(parsed.fields);
  if (!got.includes("title") && !got.includes("description")) {
    return jsonRes({ ok: false, manual: true, code: "AIRBNB_UNREADABLE",
      error: "We couldn't read that Airbnb page automatically. Paste your listing description instead, and add your Airbnb calendar link in the calendar step to sync dates." });
  }

  // Validate exactly like the wizard (drops anything not allowed)
  const safe: Record<string, unknown> = {};
  const groups: Record<string, unknown>[] = [];
  for (const [k, v] of Object.entries(parsed.fields)) if (k !== "lat" && k !== "lng") groups.push({ [k]: v });
  if (parsed.fields.lat != null && parsed.fields.lng != null) groups.push({ lat: parsed.fields.lat, lng: parsed.fields.lng });
  for (const g of groups) {
    try { Object.assign(safe, listingFields(g)); } catch { /* skip a field that fails validation */ }
  }
  safe.airbnb_url = `https://www.airbnb.co.uk/rooms/${id}`;

  if (!listingId) {
    const title = String(safe.title ?? "My home");
    const slug = `${slugify(title + " " + String(safe.city ?? "")) || "home"}-${crypto.randomUUID().slice(0, 5)}`.replace(/^-+/, "");
    const r = await asUser(user, async (tx) => {
      const n = await tx`select count(*)::int n from bookhomes.listings where host_id = ${host[0].id}`;
      if (n[0].n >= 25) throw new HttpError(400, "Please contact us to add more than 25 listings.");
      return await tx`insert into bookhomes.listings ${tx({ ...safe, title, slug, host_id: host[0].id, status: "draft" })} returning id`;
    });
    listingId = Number(r[0].id);
  } else {
    await asUser(user, (tx) => tx`update bookhomes.listings set ${tx(safe)} where id = ${listingId} returning id`);
  }

  // Photos: copy into our own storage (Airbnb links are never shown to guests)
  const existing = (await sql`select count(*)::int n, coalesce(max(sort), -1) m from bookhomes.listing_photos where listing_id = ${listingId}`)[0];
  const room = Math.max(0, Math.min(MAX_PHOTOS, 40 - existing.n));
  const todo = parsed.photos.slice(0, room);
  const saved: { path: string; i: number; thumb: string | null }[] = [];
  const stamp = Date.now().toString(36);
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4).map(async (src, k) => {
      const path = `${user.id}/${listingId}/airbnb-${stamp}-${i + k}.jpg`;
      const r = await copyPhoto(src, path);
      if (r.ok) saved.push({ path, i: i + k, thumb: r.thumb });
    });
    await Promise.all(batch);
  }
  saved.sort((a, z) => a.i - z.i);
  if (saved.length) {
    await asUser(user, async (tx) => {
      let sort = existing.m + 1;
      for (const s of saved) {
        await tx`insert into bookhomes.listing_photos (listing_id, storage_path, url, thumb_url, sort) values (${listingId}, ${s.path}, ${publicUrl(s.path)}, ${s.thumb}, ${sort++})`;
      }
    });
  }

  // What the host still has to check or add (shown on the import summary screen)
  const total = existing.n + saved.length;
  const check: string[] = [];
  if (!safe.area || safe.area === safe.city) check.push("area");
  if (safe.lat == null) check.push("map_pin");
  check.push("price");
  if (total < 5) check.push("photos");
  if (!safe.description) check.push("description");
  if (!safe.title) check.push("title");
  if (!safe.house_rules) check.push("house_rules");

  return jsonRes({
    ok: true, listing_id: listingId, check, photos_total: total, imported: Object.keys(safe).filter((k) => k !== "airbnb_url"), photos: saved.length, photos_found: parsed.photos.length,
    price_hint: parsed.priceHint,
    note: "Check every step: we copied what Airbnb shows publicly. Please don't add your street address: guests get it after booking.",
  });
}));
