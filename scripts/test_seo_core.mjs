// Tests for supabase/functions/_shared/bh_seo_core.ts (no network: fetch is mocked).
// Run: node --experimental-strip-types scripts/test_seo_core.mjs
import assert from "node:assert/strict";
import * as C from "../supabase/functions/_shared/bh_seo_core.ts";

const listing = { title: "Zermatt Lodge", area: "Liverpool", city: "Liverpool", property_type: "house", bedrooms: 4, beds: 4, baths: 2, max_guests: 7,
  amenities: ["wifi", "parking", "pool_table"], check_in_time: "15:00", check_out_time: "11:00", min_nights: 2, cancellation_policy: "moderate",
  pets_allowed: false, house_rules: "No parties. 12 Example Road L1 2AB is private.", description: "Big house – games room.",
  kosher: { shul_name: "X", eruv: true, kitchen: false }, business: { desk: false, wifi_mbps: 60 } };
const answers = { special: "Games room with a pool table", nearby: [{ name: "Sefton Park", how: "about 10 minutes by car" }], guests: ["families", "contractors"], parking: "Driveway for 2 cars" };
const facts = C.buildFacts(listing, answers);
const ft = C.factsText(facts);
assert(!/Example Road/.test(ft) && !/L1 2AB/.test(ft), "address scrubbed");
assert(!/–/.test(ft), "dashes replaced");
assert(!/shul|eruv/i.test(ft), "community keys never used");
assert(/60 Mbps/.test(ft));
assert(!C.hasKosherFact(facts));
const seeds = C.keywordSeeds(listing, answers);
assert(seeds.includes("house liverpool") && seeds.includes("stay near sefton park") && seeds.some((s) => s.includes("contractor")));

// autocomplete: ok, then blocked
const okFetch = async (url) => ({ ok: true, text: async () => JSON.stringify([decodeURIComponent(url.split("q=")[1]), ["house liverpool to rent", "house liverpool airbnb"]]) });
let ks = await C.autocomplete(seeds.slice(0, 3), okFetch, 0);
assert.equal(ks.source, "autocomplete"); assert.equal(ks.suggestions.length, 2);
const badFetch = async () => ({ ok: false, status: 403, text: async () => "no" });
ks = await C.autocomplete(seeds, badFetch, 0);
assert.equal(ks.source, "llm"); assert(/AI model/.test(ks.note));

const longA = (s) => (s + " ").repeat(1) + "This home is a house in Liverpool with four bedrooms and room for families who want space to relax together after a day out. ".repeat(5);
const F = (n) => facts[n].id;
assert.equal(C.checkItem("Is there parking?", longA("Yes, a driveway for 2 cars."), [F(0)], { facts, requireFacts: true }), "");
assert.match(C.checkItem("Is there parking?", longA("Yes, 5 minutes from the station."), [F(0)], { facts, requireFacts: true }), /number not in the facts/);
assert.match(C.checkItem("Price?", longA("It costs £99 a night."), [F(0)], { facts, requireFacts: true }), /number not in the facts/);
assert.match(C.checkItem("Where?", longA("At 12 Example Road."), [F(0)], { facts, requireFacts: true }), /address/);
assert.match(C.checkItem("Shul?", longA("The synagogue is close."), [F(0)], { facts, requireFacts: true }), /community/);
assert.equal(C.checkItem("Is it kosher?", longA("We cannot say. Contact the local community or kashrut authority directly for shul, mikvah and service details."), [F(0)], { facts, requireFacts: true }).startsWith("kosher"), true);
assert.match(C.checkItem("Good?", longA("Guaranteed number one."), [F(0)], { facts, requireFacts: true }), /claim/);
assert.match(C.checkItem("Question?", longA("ok"), ["F999"], { facts, requireFacts: true }), /real fact/);
assert.match(C.checkItem("Question?", "Too short.", [F(0)], { facts, requireFacts: true }), /length/);

// Claude call mocked + page validation
const mockClaude = async (url, init) => {
  assert.equal(url, "https://api.anthropic.com/v1/messages");
  const b = JSON.parse(init.body); assert.equal(b.model, "claude-sonnet-5-5");
  const page = { title: "Parking and arrival at Zermatt Lodge", meta_description: "Parking – arrival.", intro: "What to expect when you arrive.",
    items: [{ q: "Is there parking?", a: longA("Yes, there is a driveway for 2 cars."), facts: ["F1"] }, { q: "Bad one?", a: longA("Rated 5 stars by guests."), facts: ["F1"] }] };
  return { ok: true, text: async () => JSON.stringify({ content: [{ type: "text", text: "Here:\n" + JSON.stringify(page) }], usage: { input_tokens: 3000, output_tokens: 1500 } }) };
};
const r = await C.claude("test-key", "claude-sonnet-5-5", "s", "u", 2000, mockClaude);
const v = C.validatePage(C.extractJson(r.text), facts);
assert.equal(v.items.length, 1); assert.equal(v.dropped.length, 1); assert.equal(v.meta, "Parking - arrival.");
assert(Math.abs(C.costUsd(r.usage, C.DEFAULT_SETTINGS) - 0.0315) < 1e-9);
const taken = new Set(["parking"]); assert.equal(C.topicSlug("Parking", taken), "parking-2");
const s = C.mergeSettings({ mini: { price_pence: 2500 } }); assert.equal(s.mini.price_pence, 2500); assert.equal(s.max.pages, 30);
const pp = C.planPrompt({ listingTitle: "Z", area: "A", city: "C", type: "house", facts, keywords: [], existing: [], pages: 5, llmKeywords: true });
assert(/candidate_queries/.test(pp.user) && !/[–—]/.test(pp.system + pp.user));
console.log("bh_seo_core: all tests passed");
