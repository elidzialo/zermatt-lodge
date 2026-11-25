// SEO Boost core: facts, keyword research, prompts, Claude calls and the checks every answer must pass.
// No Deno or npm imports, so it runs under Node for tests (scripts/test_seo_core.mjs) and in the bookhomes-seo function.
// Rules (owner, 25 Nov 2026 + seo/next-posts.md community safety rule):
//   - answers use only the facts given (host questionnaire + listing data) and must name the facts they use
//   - no invented prices, distances, times or reviews: every number with a unit or a £ must appear in the facts
//   - no street address or postcode, no ranking guarantees, plain hyphens only
//   - kosher / Jewish content: no shul, mikvah, eruv, minyan, school or community locations, times or numbers

export interface Fact { id: string; label: string; text: string; source: "listing" | "host" }
export interface Pkg { price_pence: number; pages: number }
export interface SeoSettings {
  enabled: boolean; mini: Pkg; max: Pkg; max_pages_per_listing: number; pages_per_day: number[];
  model: string; usd_per_mtok_in: number; usd_per_mtok_out: number;
}
export const DEFAULT_SETTINGS: SeoSettings = {
  enabled: true, mini: { price_pence: 3000, pages: 5 }, max: { price_pence: 15000, pages: 30 },
  max_pages_per_listing: 30, pages_per_day: [2, 3], model: "claude-sonnet-5-5", usd_per_mtok_in: 3, usd_per_mtok_out: 15,
};
export function mergeSettings(v: unknown): SeoSettings {
  const s = (v && typeof v === "object" ? v : {}) as Partial<SeoSettings>;
  const pkg = (p: unknown, d: Pkg): Pkg => {
    const o = (p && typeof p === "object" ? p : {}) as Partial<Pkg>;
    return { price_pence: clampInt(o.price_pence, 0, 100000, d.price_pence), pages: clampInt(o.pages, 1, 30, d.pages) };
  };
  return {
    ...DEFAULT_SETTINGS, ...s,
    enabled: s.enabled !== false,
    mini: pkg(s.mini, DEFAULT_SETTINGS.mini), max: pkg(s.max, DEFAULT_SETTINGS.max),
    max_pages_per_listing: clampInt(s.max_pages_per_listing, 1, 30, 30),
    model: typeof s.model === "string" && /^[a-z0-9.-]{3,60}$/.test(s.model) ? s.model : DEFAULT_SETTINGS.model,
    usd_per_mtok_in: Number(s.usd_per_mtok_in) >= 0 ? Number(s.usd_per_mtok_in) : 3,
    usd_per_mtok_out: Number(s.usd_per_mtok_out) >= 0 ? Number(s.usd_per_mtok_out) : 15,
  };
}
function clampInt(v: unknown, min: number, max: number, d: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : d;
}

// ----------------------------------------------------------------------------- text hygiene
export function noDashes(s: string): string { return String(s ?? "").replace(/[\u2013\u2014\u2012\u2015]/g, "-"); }
const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const STREET_SUFFIX = "(?:Road|Rd|Street|St|Avenue|Ave|Lane|Ln|Close|Drive|Dr|Crescent|Grove|Terrace|Mews|Way|Place|Court|Walk|Row|Square|Hill|Vale|Rise|View|Parade|Gardens)";
const NUMBERED_STREET = new RegExp(`\\b\\d{1,4}[a-z]?,?\\s+(?:[A-Z][a-z']+\\s+){1,3}${STREET_SUFFIX}\\b`);
export function hasAddress(s: string): boolean { return POSTCODE.test(s) || NUMBERED_STREET.test(s); }
export function scrubAddress(s: string): string {
  return String(s ?? "").replace(new RegExp(NUMBERED_STREET.source, "g"), "[address hidden]")
    .replace(new RegExp(POSTCODE.source, "gi"), "[postcode hidden]");
}
export function clean(s: unknown, max = 1500): string {
  return noDashes(scrubAddress(String(s ?? ""))).replace(/\s+/g, " ").trim().slice(0, max);
}

// ----------------------------------------------------------------------------- facts
export const AUDIENCES: Record<string, string> = {
  families: "families with children", groups: "groups of friends or relatives", contractors: "contractors and work crews",
  business: "business travellers", couples: "couples", kosher: "guests who keep kosher or Shabbat",
  events: "people visiting for events, matches or concerts", medical: "hospital visitors and medical staff",
  relocation: "people relocating or house hunting", long_stay: "longer stays of a month or more",
};
const AMENITY: Record<string, string> = {
  wifi: "Wifi", parking: "free parking", kitchen: "a kitchen", washer: "a washing machine", dryer: "a tumble dryer", tv: "a TV",
  heating: "heating", aircon: "air conditioning", garden: "a garden", workspace: "a dedicated workspace", cot: "a cot",
  highchair: "a high chair", bath: "a bath", ev_charger: "an EV charger", pool_table: "a pool table", self_checkin: "self check-in",
  dishwasher: "a dishwasher", hot_tub: "a hot tub", bbq: "a barbecue", balcony: "a balcony", gym: "a gym", lift: "a lift",
  step_free: "step-free access", fireplace: "a fireplace", iron: "an iron", hairdryer: "a hairdryer",
};
const POLICY: Record<string, string> = {
  flexible: "Flexible cancellation: full refund up to 1 day before check-in.",
  moderate: "Moderate cancellation: full refund up to 5 days before check-in, 50% after that.",
  strict: "Strict cancellation: full refund up to 14 days before check-in, 50% up to 7 days before.",
};
const humanKey = (k: string) => k.replace(/_/g, " ");

// deno-lint-ignore no-explicit-any
export function buildFacts(l: any, answers: any): Fact[] {
  const f: Fact[] = [];
  const add = (label: string, text: unknown, source: "listing" | "host") => {
    const t = clean(text);
    if (t) f.push({ id: "F" + (f.length + 1), label, text: t, source });
  };
  const type = String(l.property_type || "home").toLowerCase();
  add("Name and type", `The home is "${l.title}", a ${type} in ${[l.area, l.city].filter((x, i, a) => x && a.indexOf(x) === i).join(", ")}, listed on Book Homes.`, "listing");
  const size = [l.bedrooms ? `${l.bedrooms} bedroom${l.bedrooms === 1 ? "" : "s"}` : "", l.beds ? `${l.beds} bed${l.beds === 1 ? "" : "s"}` : "",
    l.baths ? `${l.baths} bathroom${Number(l.baths) === 1 ? "" : "s"}` : "", l.max_guests ? `sleeps up to ${l.max_guests} guests` : ""].filter(Boolean);
  if (size.length) add("Size", `It has ${size.join(", ")}.`, "listing");
  const am = (Array.isArray(l.amenities) ? l.amenities : []).map((a: string) => AMENITY[a] || humanKey(String(a))).filter(Boolean);
  if (am.length) add("Amenities", `Amenities listed: ${am.join(", ")}.`, "listing");
  if (l.check_in_time || l.check_out_time) add("Check-in times", `Check-in from ${l.check_in_time || "the time shown on the listing"}, check-out by ${l.check_out_time || "the time shown on the listing"}.`, "listing");
  if (l.min_nights) add("Minimum stay", `Minimum stay ${l.min_nights} night${l.min_nights === 1 ? "" : "s"}${l.max_nights ? `, maximum ${l.max_nights} nights` : ""}.`, "listing");
  if (POLICY[l.cancellation_policy]) add("Cancellation", POLICY[l.cancellation_policy], "listing");
  add("Pets", l.pets_allowed ? "Pets are allowed (a pet fee may apply, shown at checkout)." : "Pets are not allowed.", "listing");
  if (l.weekly_discount_pct) add("Weekly discount", `Stays of 7 nights or more get ${l.weekly_discount_pct}% off.`, "listing");
  if (l.monthly_discount_pct) add("Monthly discount", `Stays of 28 nights or more get ${l.monthly_discount_pct}% off.`, "listing");
  if (l.house_rules) add("House rules (listing)", l.house_rules, "listing");
  if (l.description) add("Listing description", String(l.description).slice(0, 1800), "listing");
  const k = l.kosher && typeof l.kosher === "object" ? l.kosher : {};
  if (k.kitchen === true) add("Kosher kitchen", "The host says the home has a kosher kitchen.", "listing");
  const sh = k.shabbat && typeof k.shabbat === "object" ? k.shabbat : {};
  const shx = Object.entries({ hotplate: "a Shabbat hotplate", urn: "an urn", lamp_timers: "lamp timers", non_electric_key: "a non-electric key", no_motion_sensors: "no motion-sensor lights" })
    .filter(([key]) => sh[key] === true).map(([, v]) => v);
  if (shx.length) add("Shabbat features", `Shabbat features listed: ${shx.join(", ")}.`, "listing");
  // community safety: shul_name, shul_walk_mins, eruv, kosher_shops and mikvah are never used
  const b = l.business && typeof l.business === "object" ? l.business : {};
  const bx = Object.entries(b).filter(([, v]) => v === true).map(([key]) => humanKey(key));
  if (bx.length) add("Business features", `Work and business features: ${bx.join(", ")}.`, "listing");
  if (typeof b.wifi_mbps === "number") add("Wifi speed", `Wifi speed about ${b.wifi_mbps} Mbps (host's figure).`, "listing");

  const a = answers && typeof answers === "object" ? answers : {};
  if (a.special) add("What makes it special (host)", a.special, "host");
  const near = Array.isArray(a.nearby) ? a.nearby : [];
  for (const n of near.slice(0, 12)) {
    const name = clean(n?.name, 100), how = clean(n?.how, 200);
    if (name) add(`Nearby: ${name}`, `${name}${how ? ": " + how : ""} (host's own description).`, "host");
  }
  const who = (Array.isArray(a.guests) ? a.guests : []).filter((x: string) => AUDIENCES[x]).map((x: string) => AUDIENCES[x]);
  if (who.length) add("Who it suits (host)", `The host says the home suits ${who.join(", ")}.`, "host");
  if (a.parking) add("Parking (host)", a.parking, "host");
  if (a.checkin) add("Arrival and check-in (host)", a.checkin, "host");
  if (a.rules) add("House rules (host)", a.rules, "host");
  if (a.transport) add("Getting around (host)", a.transport, "host");
  if (a.extra) add("Anything else (host)", a.extra, "host");
  return f;
}
export function factsText(facts: Fact[]): string { return facts.map((x) => x.text).join("\n"); }
export function hasKosherFact(facts: Fact[]): boolean {
  return facts.some((x) => /kosher|shabbat/i.test(x.text) && (x.label.startsWith("Kosher") || x.label.startsWith("Shabbat") || x.label.startsWith("Who it suits")));
}

// ----------------------------------------------------------------------------- keyword research (Google Autocomplete)
// deno-lint-ignore no-explicit-any
export function keywordSeeds(l: any, answers: any, max = 14): string[] {
  const area = String(l.area || l.city || "").trim(), city = String(l.city || l.area || "").trim();
  const type = String(l.property_type || "house").toLowerCase();
  const who: string[] = Array.isArray(answers?.guests) ? answers.guests : [];
  const s: string[] = [`${type} ${area}`, `${area} accommodation`, `holiday home ${area}`, `short stay ${area}`, `where to stay in ${city}`,
    `things to do in ${area}`, `${area} with parking`];
  if (city && city !== area) s.push(`${city} accommodation`, `${type} to stay ${city}`);
  const near = (Array.isArray(answers?.nearby) ? answers.nearby : []).map((n: { name?: string }) => clean(n?.name, 60)).filter(Boolean);
  for (const n of near.slice(0, 5)) s.push(`stay near ${n}`, `${n}`);
  const AUD: Record<string, string[]> = {
    contractors: [`${area} for contractors`, `contractor accommodation ${city}`], families: [`family accommodation ${area}`],
    groups: [`group accommodation ${city}`, `large house to rent ${city}`], kosher: [`kosher accommodation ${city}`, `shabbat friendly accommodation ${city}`],
    business: [`business accommodation ${city}`], medical: [`accommodation near hospital ${city}`], events: [`stay ${city} for concerts`],
    long_stay: [`monthly rental ${area}`], relocation: [`moving to ${area}`],
  };
  for (const w of who) for (const x of AUD[w] || []) s.push(x);
  const out: string[] = [];
  for (const x of s) { const q = x.toLowerCase().replace(/\s+/g, " ").trim(); if (q.length > 3 && !out.includes(q)) out.push(q); }
  return out.slice(0, max);
}
export function parseAutocomplete(body: string): string[] {
  try {
    const j = JSON.parse(body);
    return Array.isArray(j) && Array.isArray(j[1]) ? j[1].filter((x: unknown) => typeof x === "string").map((x: string) => x.toLowerCase().trim()) : [];
  } catch { return []; }
}
export interface KeywordSet { source: "autocomplete" | "llm" | "mixed"; note: string; seeds: string[]; suggestions: { q: string; seed: string }[]; failed: number }
export async function autocomplete(seeds: string[], fetcher: typeof fetch = fetch, delayMs = 400): Promise<KeywordSet> {
  const seen = new Set<string>(); const suggestions: { q: string; seed: string }[] = []; let failed = 0, streak = 0;
  for (const seed of seeds) {
    if (streak >= 3) { failed++; continue; } // looks blocked: stop asking
    try {
      const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=en-GB&gl=uk&q=${encodeURIComponent(seed)}`;
      const r = await fetcher(url, { headers: { "Accept": "application/json", "Accept-Language": "en-GB,en;q=0.8", "User-Agent": "Mozilla/5.0 (compatible; BookHomesKeywordResearch/1.0)" } });
      const body = await r.text();
      const list = r.ok ? parseAutocomplete(body) : [];
      if (!r.ok) { failed++; streak++; } else streak = 0;
      for (const q of list) if (!seen.has(q)) { seen.add(q); suggestions.push({ q: noDashes(q), seed }); }
    } catch { failed++; streak++; }
    if (delayMs) await new Promise((res) => setTimeout(res, delayMs));
  }
  const blocked = suggestions.length === 0;
  return {
    source: blocked ? "llm" : "autocomplete", seeds, suggestions, failed,
    note: blocked ? `Google Autocomplete returned nothing (${failed} of ${seeds.length} requests failed): keyword ideas came from the AI model instead.`
      : `${suggestions.length} Google Autocomplete suggestions from ${seeds.length} seed searches (UK, en-GB)${failed ? `, ${failed} requests failed` : ""}.`,
  };
}

// ----------------------------------------------------------------------------- answer checks
const SAFE_PHRASE = /contact the local community or kashrut authority directly[^.]*\.?/gi;
const COMMUNITY = /\b(synagogues?|shuls?|mikva(?:h|ot|os)?|mikveh|eruv|minyan(?:im)?|yeshiv(?:a|ah|os)|kollel|cheder|jewish (?:population|school|community (?:lives|centre|center))|census|security patrol|cst\b|service times|shacharis|mincha|maariv)\b/i;
const CLAIMS = /\b(guarantee[ds]?|guaranteed|number one|#1|top[- ]ranked|best[- ](?:rated|reviewed)|five[- ]star|5[- ]star|rated \d|reviews? (?:say|rave)|guests (?:love|rave|say)|award[- ]winning)\b/i;
const NUM_UNIT = /(£\s?\d[\d,]*(?:\.\d+)?)|(\b\d+(?:\.\d+)?)\s*(?:-\s*\d+\s*)?(?:%|per ?cent|min(?:ute)?s?\b|hours?\b|hrs?\b|miles?\b|mi\b|km\b|kilomet(?:re|er)s?\b|metres?\b|meters?\b|mbps\b|nights?\b|guests?\b|bedrooms?\b|beds?\b|bathrooms?\b|stops?\b)/gi;
export function wordCount(s: string): number { return String(s).trim().split(/\s+/).filter(Boolean).length; }
function unitFamily(u: string): string {
  const x = u.toLowerCase().replace(/\s+/g, "");
  if (/^%|percent/.test(x)) return "%";
  if (/^min/.test(x)) return "min"; if (/^(hour|hr)/.test(x)) return "hour"; if (/^(mile|mi$)/.test(x)) return "mile";
  if (/^(km|kilomet)/.test(x)) return "km"; if (/^met/.test(x)) return "m"; if (/^mbps/.test(x)) return "mbps";
  if (/^night/.test(x)) return "night"; if (/^guest/.test(x)) return "guest"; if (/^bedroom/.test(x)) return "bedroom";
  if (/^bathroom/.test(x)) return "bathroom"; if (/^bed/.test(x)) return "bed"; if (/^stop/.test(x)) return "stop";
  return x;
}
function numberUnits(s: string): string[] {
  const out: string[] = [];
  for (const m of s.matchAll(NUM_UNIT)) {
    if (m[1]) { out.push("£" + Number(m[1].replace(/[£,\s]/g, ""))); continue; }
    const unit = m[0].slice(m[0].search(/[^\d.\s-]/)).trim();
    const nums = (m[0].match(/\d+(?:\.\d+)?/g) || []).map(Number);
    for (const n of nums) out.push(n + unitFamily(unit));
  }
  return out;
}
// Every "number + unit" (and every £ amount) in an answer must also appear, with the same kind of unit, in the facts.
export function ungroundedNumbers(answer: string, facts: string): string[] {
  const have = new Set(numberUnits(facts));
  return numberUnits(answer).filter((x) => !have.has(x));
}
export interface CheckOpts { facts: Fact[]; requireFacts: boolean; minWords?: number; maxWords?: number }
// Returns the reason an answer can't be published, or "" when it passes.
export function checkItem(q: string, a: string, ids: string[], o: CheckOpts): string {
  const text = `${q}\n${a}`;
  if (!q || q.length < 5 || !a) return "empty";
  const wc = wordCount(a);
  if (wc < (o.minWords ?? 60) || wc > (o.maxWords ?? 230)) return `length ${wc} words`;
  if (hasAddress(text)) return "street address or postcode";
  if (CLAIMS.test(text)) return "ranking, rating or review claim";
  const noSafe = text.replace(SAFE_PHRASE, "");
  if (COMMUNITY.test(noSafe)) return "community safety rule (shul, mikvah, eruv, times or locations)";
  if (/\bjewish (?:guests|families|visitors) (?:stay|use|choose|book|love)/i.test(noSafe)) return "community safety rule (says who stays)";
  if (/\bkosher\b/i.test(noSafe) && !hasKosherFact(o.facts)) return "kosher claim without a kosher fact";
  if (o.requireFacts) {
    const valid = new Set(o.facts.map((x) => x.id));
    if (!ids.length || ids.some((x) => !valid.has(x))) return "does not cite a real fact";
    const bad = ungroundedNumbers(a, factsText(o.facts));
    if (bad.length) return `number not in the facts: ${bad.slice(0, 3).join(", ")}`;
  }
  return "";
}

// ----------------------------------------------------------------------------- Claude
export interface Usage { input_tokens: number; output_tokens: number }
export async function claude(apiKey: string, model: string, system: string, user: string, maxTokens: number, fetcher: typeof fetch = fetch): Promise<{ text: string; usage: Usage }> {
  const r = await fetcher("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.4, system, messages: [{ role: "user", content: user }] }),
  });
  const body = await r.text();
  if (!r.ok) throw new Error(`Anthropic API ${r.status}: ${body.slice(0, 300)}`);
  const j = JSON.parse(body);
  const text = (j.content || []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return { text, usage: { input_tokens: j.usage?.input_tokens ?? 0, output_tokens: j.usage?.output_tokens ?? 0 } };
}
export function extractJson(text: string): unknown {
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s < 0 || e <= s) throw new Error("model reply had no JSON");
  return JSON.parse(text.slice(s, e + 1));
}
export function costUsd(u: Usage, s: SeoSettings): number {
  return (u.input_tokens * s.usd_per_mtok_in + u.output_tokens * s.usd_per_mtok_out) / 1e6;
}

const RULES = `House rules for everything you write:
- Use ONLY the numbered facts. Never invent facts, prices, distances, travel times, opening hours, reviews or ratings. If a fact is the host's own description, you may say "the host says".
- Never give a street address, house number or postcode. Area and city names are fine.
- Never promise rankings or results, and never say "best", "number one", "award-winning" or quote guests.
- British English, plain and helpful, written for a guest deciding where to stay. No marketing fluff. Use plain hyphens only, never en or em dashes.
- Prices change: say "see the live price on the listing" rather than quoting nightly prices.
- Community safety rule: never mention synagogues, shuls, mikvaot, eruvs, minyan or service times, Jewish schools, where the community lives, population numbers or security. Do not say Jewish guests use the home. If a kosher or Shabbat question needs those, say "contact the local community or kashrut authority directly for shul, mikvah and service details". Only call the home kosher or Shabbat-friendly if a fact says so.
- If a question cannot be answered from the facts, leave it out. Fewer honest answers beat padded ones.`;

export function planPrompt(o: { listingTitle: string; area: string; city: string; type: string; facts: Fact[]; keywords: string[]; existing: string[]; pages: number; llmKeywords: boolean }) {
  const system = `You plan guide pages for a holiday home on Book Homes (bookhomes.co.uk), a UK direct-booking site. Each page answers real questions people search for, using only the host's facts.\n\n${RULES}\n\nReply with JSON only.`;
  const user = `Home: ${o.listingTitle} (${o.type} in ${o.area}, ${o.city})

Facts (cite by id):
${o.facts.map((f) => `${f.id} [${f.label}]: ${f.text}`).join("\n")}

${o.llmKeywords ? "Google Autocomplete was not available. First list 30 to 60 searches real UK guests would type for this area and kind of stay (field \"candidate_queries\"), then plan from them." : `Real Google Autocomplete searches (UK):\n${o.keywords.slice(0, 160).join("\n")}`}
${o.existing.length ? `\nPages this home already has (do not repeat these topics):\n${o.existing.join("\n")}\n` : ""}
Plan up to ${o.pages} guide pages. Each page is one topic cluster (for example parking and arrival, the area for families, work stays, nearby places the host named, house rules and booking). Use the searches as the questions people ask, including "people also ask" style follow-ups. Give each page 5 to 7 candidate questions that the facts CAN answer; list the fact ids each would use. If the facts only support fewer good pages, plan fewer. Mark at most 2 questions per page with "faq": true for the short FAQ on the listing page itself (the most useful general ones).

JSON shape:
{${o.llmKeywords ? '"candidate_queries": ["..."], ' : ""}"pages": [{"slug": "short-url-words", "title": "Page title under 65 characters", "keyword": "main search phrase", "questions": [{"q": "Question?", "keyword": "search it matches", "facts": ["F1"], "faq": false}]}]}`;
  return { system, user };
}

export function writePrompt(o: { listingTitle: string; area: string; city: string; facts: Fact[]; page: { title: string; keyword?: string; questions: { q: string; facts?: string[] }[] } }) {
  const system = `You write one guide page for a holiday home on Book Homes (bookhomes.co.uk). The page answers real guest questions about the home and its area, using only the host's facts.\n\n${RULES}\n\nReply with JSON only.`;
  const user = `Home: ${o.listingTitle} (${o.area}, ${o.city})

Facts (cite by id):
${o.facts.map((f) => `${f.id} [${f.label}]: ${f.text}`).join("\n")}

Page: ${o.page.title}${o.page.keyword ? ` (main search: ${o.page.keyword})` : ""}
Candidate questions:
${o.page.questions.map((q, i) => `${i + 1}. ${q.q}${q.facts?.length ? ` (facts ${q.facts.join(", ")})` : ""}`).join("\n")}

Write 4 to 6 of these questions (reword them naturally if needed, keep the searcher's words). Each answer is 80 to 200 words, answers the question in the first sentence, and lists in "facts" every fact id it relies on. Drop any question the facts cannot answer. Also write a meta description (under 155 characters) and a 40 to 80 word intro.

JSON shape:
{"title": "...", "meta_description": "...", "intro": "...", "items": [{"q": "...", "a": "...", "facts": ["F2", "F7"]}]}`;
  return { system, user };
}

export function topicSlug(s: string, taken: Set<string>): string {
  let base = String(s || "guide").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "guide";
  let out = base, n = 2;
  while (taken.has(out)) out = `${base}-${n++}`;
  taken.add(out);
  return out;
}

// deno-lint-ignore no-explicit-any
export function validatePage(raw: any, facts: Fact[]): { title: string; meta: string; intro: string; items: { q: string; a: string; facts: string[] }[]; dropped: { q: string; why: string }[] } {
  const items: { q: string; a: string; facts: string[] }[] = [], dropped: { q: string; why: string }[] = [];
  const intro = clean(raw?.intro, 1100);
  for (const it of Array.isArray(raw?.items) ? raw.items : []) {
    const q = clean(it?.q, 190), a = clean(it?.a, 1900);
    const ids = (Array.isArray(it?.facts) ? it.facts : []).map((x: unknown) => String(x).trim().toUpperCase()).filter(Boolean);
    const why = checkItem(q, a, ids, { facts, requireFacts: true });
    if (why) dropped.push({ q, why }); else if (items.length < 6) items.push({ q, a, facts: [...new Set(ids)] as string[] });
  }
  const introBad = intro && (hasAddress(intro) || CLAIMS.test(intro) || COMMUNITY.test(intro.replace(SAFE_PHRASE, "")) || ungroundedNumbers(intro, factsText(facts)).length);
  return { title: clean(raw?.title, 110), meta: clean(raw?.meta_description, 160), intro: introBad ? "" : intro, items, dropped };
}

// Host/admin edits: same safety checks, but the host is the source, so no fact citation needed.
export function checkEdit(q: string, a: string, facts: Fact[]): string {
  return checkItem(clean(q, 190), clean(a, 1900), [], { facts, requireFacts: false, minWords: 15, maxWords: 300 });
}
