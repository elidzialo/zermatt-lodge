/* Book Homes marketplace ("/" and /kosher-homes): search bar (desktop) or pill + full-screen sheet (phones),
   auto-generated category row, filters sheet, photo-carousel cards with save, and a map of approximate areas.
   Listings are embedded at build time (#bh-data) and refreshed from /api/bh/listings, so homes approved since the
   last build still show. tagsFor() mirrors listing_tags() in build_listings.py: keep the two in step.
   With dates, the server returns live availability and the all-in total (no booking fees). */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n, c){ return '<svg class="' + (c || "ic") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(n){ n = +n || 0; return "£" + (n % 1 ? n.toFixed(2) : n.toLocaleString("en-GB")); }
function pad(n){ return (n < 10 ? "0" : "") + n; }
function iso(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parse(s){ var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
function plural(n, w){ n = +n || 0; return n + " " + w + (n === 1 ? "" : "s"); }
var fmtShort = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"});
var fmtMonth = new Intl.DateTimeFormat("en-GB", {month: "long", year: "numeric"});
var fmtLong = new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", year: "numeric"});
var today = iso(new Date());
var mqDesk = window.matchMedia("(min-width: 950px)");
var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

var D = JSON.parse($("#bh-data").textContent);
var TAGS = D.tags, PRESET = D.preset || [];
var S = {listings: D.listings, tag: "", where: "", ci: null, co: null, adults: 0, children: 0, infants: 0, pets: 0,
  f: {pmin: 0, pmax: null, bedrooms: 0, beds: 0, baths: 0, tags: {}, amen: {}}, results: null, map: false, flex: null};

/* ---------- tags: same rules as listing_tags() in build_listings.py ---------- */
function slugify(s){ return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""); }
function areaName(l){ var a = String(l.area || "").split(",")[0].trim(); return !a || a.toLowerCase() === String(l.city || "").trim().toLowerCase() ? "" : a; }
function feats(l){
  var k = l.kosher || {}, sh = k.shabbat || {}, b = l.business || {};
  var sc = ["hotplate", "urn", "lamp_timers", "non_electric_key", "no_motion_sensors"].filter(function(x){ return sh[x] === true; }).length;
  var walk = k.shul_walk_mins, near = typeof walk === "number" && walk <= 15;
  return {kosher_kitchen: k.kitchen === true, shabbat_friendly: sh.non_electric_key === true && sh.no_motion_sensors === true && sc >= 3, near_shul: near,
    business_ready: b.desk === true && typeof b.wifi_mbps === "number" && b.wifi_mbps >= 30,
    work_crew: b.separate_beds === true && (b.van_parking === true || (l.max_guests || 0) >= 4)};
}
function tagsFor(l){
  var f = feats(l), am = l.amenities || [], cats = l.categories || [], b = l.business || {}, out = [];
  function has(a, x){ return a.indexOf(x) >= 0; }
  if (l.city) out.push("city-" + slugify(l.city));
  if (areaName(l)) out.push("area-" + slugify(areaName(l)));
  var r = {
    "large-groups": (l.max_guests || 0) >= 6 || has(cats, "groups"), "family": has(cats, "family") || has(am, "cot") || has(am, "highchair"),
    "work-crews": f.work_crew || has(cats, "work"), "business": f.business_ready, "free-parking": has(am, "parking") || b.van_parking === true,
    "games-room": has(am, "pool_table"), "garden": has(am, "garden"),
    "long-stays": has(cats, "long_stay") || (l.monthly_discount_pct || 0) > 0 || b.monthly_rates === true || (l.max_nights || 0) >= 28,
    "hospital": has(cats, "hospital"), "events": has(cats, "events"), "city-centre": has(cats, "city"), "coast": has(cats, "coast"),
    "countryside": has(cats, "countryside"), "pet-friendly": has(am, "pets"), "hot-tub": has(am, "hot_tub"), "ev-charger": has(am, "ev_charger"),
    "step-free": has(am, "step_free"), "self-check-in": has(am, "self_checkin"),
    "kosher-kitchen": f.kosher_kitchen, "shabbat-friendly": f.shabbat_friendly, "near-shul": f.near_shul
  };
  Object.keys(TAGS).forEach(function(k){ if (r[k]) out.push(k); });
  return out;
}
function tagInfo(k){
  if (TAGS[k]) return {label: TAGS[k][0], icon: TAGS[k][1]};
  for (var i = 0; i < S.listings.length; i++){
    var l = S.listings[i];
    if (k === "city-" + slugify(l.city)) return {label: l.city, icon: "city"};
    if (k === "area-" + slugify(areaName(l))) return {label: areaName(l), icon: "pin"};
  }
  return {label: k.replace(/^(city|area)-/, "").replace(/-/g, " "), icon: "pin"};
}
function categoryRow(){
  var c = {}, order = Object.keys(TAGS);
  S.listings.forEach(function(l){ l.tags.forEach(function(t){ c[t] = (c[t] || 0) + 1; }); });
  function grp(k){ return k.indexOf("city-") === 0 ? 0 : k.indexOf("area-") === 0 ? 1 : 2; }
  return Object.keys(c).sort(function(a, b){
    var ga = grp(a), gb = grp(b); if (ga !== gb) return ga - gb;
    if (ga < 2) return c[b] - c[a] || (a < b ? -1 : 1);
    return order.indexOf(a) - order.indexOf(b);
  });
}
function pathFor(l){
  var s = slugify(l.slug) || ("home-" + l.id);
  return "/" + (D.reserved.indexOf(s) >= 0 ? s + "-liverpool" : s);
}

/* ---------- URL state ---------- */
var q = new URLSearchParams(location.search);
var dre = /^\d{4}-\d{2}-\d{2}$/;
if (q.get("tag")) S.tag = q.get("tag");
if (q.get("where")) S.where = q.get("where").slice(0, 60);
if (dre.test(q.get("check_in") || "") && dre.test(q.get("check_out") || "") && q.get("check_in") >= today && q.get("check_out") > q.get("check_in")){ S.ci = q.get("check_in"); S.co = q.get("check_out"); }
if (!S.ci && /^(weekend|week|month)$/.test(q.get("flex") || "")){
  S.flex = {kind: q.get("flex"), months: (q.get("months") || "").split(",").filter(function(m){ return /^\d{4}-\d{2}$/.test(m) && m >= today.slice(0, 7); }).slice(0, 6)};
}
["adults", "children", "infants", "pets"].forEach(function(k){ var v = q.get(k); if (/^\d{1,2}$/.test(v || "")) S[k] = Math.min(16, +v); });
if (!S.adults && /^\d{1,2}$/.test(q.get("guests") || "")) S.adults = Math.min(16, +q.get("guests"));
["bedrooms", "beds", "baths"].forEach(function(k){ var v = q.get(k); if (/^\d$/.test(v || "")) S.f[k] = +v; });
if (/^\d+$/.test(q.get("min_price") || "")) S.f.pmin = +q.get("min_price");
if (/^\d+$/.test(q.get("max_price") || "")) S.f.pmax = +q.get("max_price");
(q.get("f") || "").split(",").forEach(function(k){ if (TAGS[k]) S.f.tags[k] = true; });
(q.get("a") || "").split(",").forEach(function(k){ if (k && D.amenity_labels[k]) S.f.amen[k] = true; });
function guests(){ return S.adults + S.children; }
function pushUrl(){
  var p = new URLSearchParams();
  if (S.tag) p.set("tag", S.tag);
  if (S.where) p.set("where", S.where);
  if (S.ci && S.co){ p.set("check_in", S.ci); p.set("check_out", S.co); }
  else if (S.flex){ p.set("flex", S.flex.kind); if (S.flex.months.length) p.set("months", S.flex.months.join(",")); }
  ["adults", "children", "infants", "pets"].forEach(function(k){ if (S[k]) p.set(k, S[k]); });
  ["bedrooms", "beds", "baths"].forEach(function(k){ if (S.f[k]) p.set(k, S.f[k]); });
  if (S.f.pmin) p.set("min_price", S.f.pmin);
  if (S.f.pmax != null) p.set("max_price", S.f.pmax);
  var ft = Object.keys(S.f.tags).filter(function(k){ return S.f.tags[k]; }); if (ft.length) p.set("f", ft.join(","));
  var fa = Object.keys(S.f.amen).filter(function(k){ return S.f.amen[k]; }); if (fa.length) p.set("a", fa.join(","));
  var s = p.toString(); try { history.replaceState(null, "", location.pathname + (s ? "?" + s : "")); } catch (e) {}
}

/* ---------- filtering ---------- */
function whereMatch(l){
  if (!S.where) return true;
  var w = S.where.toLowerCase().trim();
  return [l.city, areaName(l), l.area].some(function(x){ return x && String(x).toLowerCase().indexOf(w) >= 0; });
}
function filterCount(){
  var f = S.f, n = 0;
  if (f.pmin || f.pmax != null) n++;
  ["bedrooms", "beds", "baths"].forEach(function(k){ if (f[k]) n++; });
  n += Object.keys(f.tags).filter(function(k){ return f.tags[k]; }).length + Object.keys(f.amen).filter(function(k){ return f.amen[k]; }).length;
  return n;
}
function passFilters(l, f){
  var price = +l.from_price || 0;
  if (f.pmin && price && price < f.pmin) return false;
  if (f.pmax != null && price && price > f.pmax) return false;
  if (f.bedrooms && (l.bedrooms || 0) < f.bedrooms) return false;
  if (f.beds && (l.beds || 0) < f.beds) return false;
  if (f.baths && (+l.baths || 0) < f.baths) return false;
  for (var t in f.tags) if (f.tags[t] && l.tags.indexOf(t) < 0) return false;
  for (var a in f.amen) if (f.amen[a] && (l.amenities || []).indexOf(a) < 0) return false;
  return true;
}
function visible(f){
  f = f || S.f;
  return S.listings.filter(function(l){
    if (S.tag){ if (l.tags.indexOf(S.tag) < 0) return false; }
    else if (PRESET.length && !PRESET.some(function(t){ return l.tags.indexOf(t) >= 0; })) return false;
    if (!whereMatch(l)) return false;
    if (guests() && l.max_guests < guests()) return false;
    if (S.pets && (l.amenities || []).indexOf("pets") < 0) return false;
    if (!passFilters(l, f)) return false;
    if (S.results){ var r = S.results[l.id]; if (!r || !r.available) return false; }
    return true;
  });
}

/* ---------- cards ---------- */
function img(u, w){ return /assets\.guesty\.com/.test(u || "") && /\/w_\d+,/.test(u) ? u.replace(/\/w_\d+,/, "/w_" + w + ",") : u; }
function srcset(u){ return /assets\.guesty\.com/.test(u || "") ? [480, 720, 1080].map(function(w){ return img(u, w) + " " + w + "w"; }).join(", ") : ""; }
function linkFor(l){
  var p = new URLSearchParams();
  var r = S.results && S.results !== "loading" && S.results[l.id];
  if (r && r.ci && r.co){ p.set("check_in", r.ci); p.set("check_out", r.co); }
  else if (S.ci && S.co){ p.set("check_in", S.ci); p.set("check_out", S.co); }
  if (guests()) p.set("guests", Math.min(guests(), l.max_guests));
  var s = p.toString(); return l.url + (s ? "?" + s : "");
}
function card(l, i){
  var ph = (l.card_photos && l.card_photos.length ? l.card_photos : (l.photos || [])).slice(0, 5), href = esc(linkFor(l));
  var r = S.results && S.results !== "loading" && S.results[l.id], rv = l.reviews || {};
  var slides = ph.map(function(p, k){
    var ss = srcset(p.url);
    return '<a class="sl" href="' + href + '" tabindex="' + (k ? -1 : 0) + '"' + (k ? ' aria-hidden="true"' : "") + '><img src="' + esc(img(p.url, 720)) + '"' +
      (ss ? ' srcset="' + esc(ss) + '" sizes="(max-width:640px) 92vw, (max-width:1100px) 45vw, 25vw"' : "") +
      ' alt="' + esc(p.caption || l.title) + '" width="720" height="684" ' + (i < 2 && !k ? 'fetchpriority="high"' : 'loading="lazy"') + ' decoding="async"></a>';
  }).join("");
  var dots = ph.length > 1 ? ph.map(function(p, k){ return k ? "<i></i>" : '<i class="on"></i>'; }).join("") : "";
  var nav = ph.length > 1 ? '<button type="button" class="cnav prev" aria-label="Previous photo" hidden>' + icon("chev_l") + '</button><button type="button" class="cnav next" aria-label="Next photo">' + icon("chev_r") + "</button>" : "";
  var place = [l.city, areaName(l)].filter(Boolean).join(", ");
  var rci = r && (r.ci || S.ci), rco = r && (r.co || S.co);
  var dates = r && rci && rco ? fmtShort.format(parse(rci)) + " to " + fmtShort.format(parse(rco)) : "No booking fees";
  var price = r && r.total_pence ? "" : l.from_price ? '<span class="from">From</span> <b>' + money(l.from_price) + "</b> night" : "<b>Add dates</b> for prices";
  var pbtn = r && r.total_pence ? '<button type="button" class="prbtn" aria-expanded="false" aria-label="Price details: ' + money(r.total_pence / 100) + ' total"><b>' + money(r.total_pence / 100) + "</b> total" + (r.nights ? " for " + plural(r.nights, "night") : "") + "</button>" : "";
  return '<article class="card" data-id="' + l.id + '"><div class="cph"><div class="track">' + slides + "</div>" + nav +
    '<button type="button" class="heart" aria-pressed="' + (isSaved(l.id) ? "true" : "false") + '" aria-label="Save ' + esc(l.title) + '">' + icon("heart") + "</button>" +
    '<div class="cdots" aria-hidden="true">' + dots + "</div></div>" +
    '<a class="meta" href="' + href + '"><span class="l1"><b>' + esc(place) + "</b>" + (rv.count ? '<span class="rt">' + icon("star", "ic st") + (+rv.average).toFixed(2) + " (" + rv.count + ")</span>" : "") + "</span>" +
    '<span class="l2">' + esc(l.title) + '</span><span class="l2">' + plural(l.bedrooms, "bedroom") + " · " + plural(l.max_guests, "guest") + "</span>" +
    '<span class="l2 l-d">' + dates + "</span>" + (price ? '<span class="pr">' + price + "</span>" : "") + "</a>" + (pbtn ? '<div class="pr">' + pbtn + "</div>" : "") + "</article>";
}
function saved(){ try { return JSON.parse(localStorage.getItem("bh_saved") || "[]"); } catch (e) { return []; } }
function isSaved(id){ return saved().indexOf(+id) >= 0; }
function toggleSaved(id){ var s = saved(), k = s.indexOf(+id); if (k >= 0) s.splice(k, 1); else s.push(+id); try { localStorage.setItem("bh_saved", JSON.stringify(s)); } catch (e) {} toast(k < 0 ? "Saved to your list" : "Removed from your list", k < 0); return k < 0; }
var toastT = null;
function toast(msg, link){
  var t = $("#bhToast");
  if (!t){ t = document.createElement("div"); t.id = "bhToast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.innerHTML = "<span>" + esc(msg) + "</span>" + (link ? '<a href="/saved">View</a>' : "");
  t.classList.remove("show"); void t.offsetWidth; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(function(){ t.classList.remove("show"); }, 3200);
}

/* ---------- render ---------- */
var grid = $("#grid");
function skeletons(n){
  var h = ""; for (var i = 0; i < n; i++) h += '<div class="card sk" aria-hidden="true"><div class="sk-ph"></div><div class="sk-l w60"></div><div class="sk-l w40"></div><div class="sk-l w30"></div></div>';
  return h;
}
function dateMisses(){
  /* homes that fit everything except the dates: candidates for a date alert */
  if (!S.results || S.results === "loading") return [];
  var r = S.results; S.results = null; var v = visible(); S.results = r;
  return v;
}
function emptyHtml(){
  var miss = (S.ci && S.co) || S.flex ? dateMisses() : [];
  if (miss.length){
    var when = S.flex ? flexTxt() : datesTxt();
    return '<div class="empty empty-alert"><span class="e-ic">' + icon("calendar") + '</span><h2>No homes free ' + esc(when) + "</h2>" +
      '<p>' + plural(miss.length, "home") + " match everything else. Get one email if " + (miss.length === 1 ? "it frees" : "one frees") + " up.</p>" +
      (S.ci && S.co ? '<form class="alert-in" id="emptyAlert" novalidate><input type="email" id="eaEmail" placeholder="Your email" autocomplete="email" inputmode="email" aria-label="Your email"><button class="btn" type="submit">Email me</button></form><p class="ea-msg" id="eaMsg" aria-live="polite"></p>' : "") +
      '<div class="e-acts"><button type="button" class="chipbtn" id="tryFlex">' + icon("calendar") + "Try flexible dates</button>" +
      '<button type="button" class="chipbtn" id="resetAll">' + icon("x") + "Clear dates and filters</button></div></div>";
  }
  var w = S.where ? " in " + esc(S.where) : "";
  return '<div class="empty"><h2>No homes match' + w + '</h2><p>' + (S.where && !S.listings.some(whereMatch) ? "There are no homes listed" + w + " yet. New homes appear as soon as hosts are approved." : "Try other dates, fewer filters or another category.") +
    '</p><p><button type="button" class="btn ghost" id="resetAll">Clear search and filters</button> <a class="btn" href="/become-a-host">List your property</a></p></div>';
}
function render(){
  var v = visible();
  var loading = S.results === "loading";
  grid.setAttribute("aria-busy", loading ? "true" : "false");
  grid.innerHTML = loading ? skeletons(Math.max(1, Math.min(v.length || 3, 8))) : v.length ? v.map(card).join("") : emptyHtml();
  var rb = $("#resetAll"); if (rb) rb.addEventListener("click", resetAll);
  var tf = $("#tryFlex"); if (tf) tf.addEventListener("click", function(){ setMode("flex"); openSearch("when"); });
  var ea = $("#emptyAlert"); if (ea) ea.addEventListener("submit", sendAlert);
  var c = $("#count");
  c.textContent = loading ? "Checking availability..." : plural(v.length, "home") + (S.ci && S.co ? " available " + fmtShort.format(parse(S.ci)) + " to " + fmtShort.format(parse(S.co)) : S.flex && S.results ? " free " + flexTxt() : "");
  $$(".cat").forEach(function(b){ b.setAttribute("aria-pressed", (b.getAttribute("data-tag") || "") === S.tag ? "true" : "false"); });
  var fc = filterCount();
  $$(".fcount").forEach(function(x){ x.textContent = fc; x.hidden = !fc; });
  paintSearch();
  if (S.map) drawMap(v);
}
function resetAll(){
  S.tag = ""; S.where = ""; S.ci = S.co = null; S.flex = null; S.adults = S.children = S.infants = S.pets = 0; S.results = null;
  S.f = {pmin: 0, pmax: null, bedrooms: 0, beds: 0, baths: 0, tags: {}, amen: {}};
  syncFilterUI(); pushUrl(); render();
}

/* ---------- category row ---------- */
var cats = $("#cats"), catsScroll = $("#catsScroll");
function drawCats(){
  var row = categoryRow(), html = '<button type="button" class="cat" data-tag="" aria-pressed="false">' + icon("all") + "<span>All homes</span></button>";
  row.forEach(function(k){ var t = tagInfo(k); html += '<button type="button" class="cat" data-tag="' + esc(k) + '" aria-pressed="false">' + icon(t.icon) + "<span>" + esc(t.label) + "</span></button>"; });
  cats.innerHTML = html; spaceCats();
}
cats.addEventListener("click", function(e){
  var b = e.target.closest(".cat"); if (!b) return;
  S.tag = b.getAttribute("data-tag") || ""; pushUrl(); render();
  b.scrollIntoView({behavior: reduce ? "auto" : "smooth", block: "nearest", inline: "nearest"});
});
function fades(){
  var el = catsScroll, max = el.scrollWidth - el.clientWidth;
  el.classList.toggle("fade-l", el.scrollLeft > 4);
  el.classList.toggle("fade-r", el.scrollLeft < max - 4);
  var n = $("#catNext"); if (n) n.hidden = !(el.scrollLeft < max - 4);
}
/* Space the icons so that, at rest, no label is cut mid-word at the right edge: the next one starts inside the fade */
function spaceCats(){
  var items = $$(".cat", cats); if (!items.length) return;
  cats.style.gap = "";
  var base = parseFloat(getComputedStyle(cats).columnGap) || 24, W = catsScroll.clientWidth, x = 0, k = 0;
  for (var i = 0; i < items.length; i++){ var w = items[i].offsetWidth; if (x + w > W - 8) break; x += w + base; k++; }
  if (k >= items.length || k < 2){ fades(); return; }
  var sum = 0; for (var j = 0; j < k; j++) sum += items[j].offsetWidth;
  var g = (W - 20 - sum) / k; /* k gaps: the (k+1)th item starts 20px before the edge, inside the fade */
  if (g >= base && g <= base * 2.2) cats.style.gap = g + "px";
  fades();
}
catsScroll.addEventListener("scroll", function(){ window.requestAnimationFrame(fades); }, {passive: true});
window.addEventListener("resize", spaceCats);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(spaceCats);
$("#catNext").addEventListener("click", function(){ catsScroll.scrollBy({left: catsScroll.clientWidth * 0.7, behavior: reduce ? "auto" : "smooth"}); });

/* ---------- card carousels and hearts ---------- */
grid.addEventListener("click", function(e){
  var pb = e.target.closest(".prbtn");
  if (pb){ e.preventDefault(); togglePop(pb); return; }
  var h = e.target.closest(".heart");
  if (h){ e.preventDefault(); var id = h.closest(".card").getAttribute("data-id"); h.setAttribute("aria-pressed", toggleSaved(id) ? "true" : "false"); return; }
  var n = e.target.closest(".cnav");
  if (n){ e.preventDefault(); var tr = $(".track", n.closest(".cph")); tr.scrollBy({left: (n.classList.contains("next") ? 1 : -1) * tr.clientWidth, behavior: reduce ? "auto" : "smooth"}); }
});
grid.addEventListener("scroll", function(e){
  var tr = e.target; if (!tr.classList || !tr.classList.contains("track")) return;
  var ph = tr.parentNode, i = Math.round(tr.scrollLeft / (tr.clientWidth || 1)), n = tr.children.length;
  $$(".cdots i", ph).forEach(function(d, k){ d.classList.toggle("on", k === i); });
  var p = $(".cnav.prev", ph), x = $(".cnav.next", ph); if (p) p.hidden = i <= 0; if (x) x.hidden = i >= n - 1;
}, true);

/* ---------- search: desktop bar + phone pill share one panel ---------- */
var sp = $("#sp"), scrim = $("#scrim"), topSearch = $(".top-search"), sbar = $("#sbar"), lastFocus = null;
var active = "where", open = false;
function guestTxt(){
  var g = guests(), t = g ? plural(g, "guest") : "";
  if (S.infants) t += (t ? ", " : "") + plural(S.infants, "infant");
  if (S.pets) t += (t ? ", " : "") + (S.pets === 1 ? "1 pet" : S.pets + " pets");
  return t;
}
var fmtMon = new Intl.DateTimeFormat("en-GB", {month: "short"});
function flexTxt(){
  if (!S.flex || !S.flex.kind) return "";
  var m = S.flex.months.map(function(x){ return fmtMon.format(parse(x + "-01")); });
  return "for a " + S.flex.kind + (m.length ? " in " + (m.length > 2 ? m.slice(0, 2).join(", ") + " +" + (m.length - 2) : m.join(" or ")) : "");
}
function whenTxt(){ return datesTxt() || (S.flex && S.flex.kind ? "Any " + flexTxt().replace(/^for a /, "") : ""); }
function datesTxt(){ return S.ci && S.co ? fmtShort.format(parse(S.ci)) + " to " + fmtShort.format(parse(S.co)) : S.ci ? fmtShort.format(parse(S.ci)) + " to ..." : ""; }
function paintSearch(){
  $("#sbWhere").value = document.activeElement === $("#sbWhere") ? $("#sbWhere").value : S.where;
  $("#sbCi").textContent = S.ci ? fmtShort.format(parse(S.ci)) : S.flex && S.flex.kind ? "Any " + S.flex.kind : "Add dates";
  $("#sbCo").textContent = S.co ? fmtShort.format(parse(S.co)) : S.flex && S.flex.months.length ? flexTxt().replace(/^for a \w+ in /, "") : "Add dates";
  $("#sbWho").textContent = guestTxt() || "Add guests";
  $("#mpWhere").textContent = S.where || "Where to?";
  $("#mpSub").textContent = (whenTxt() || "Any week") + " · " + (guestTxt() || "Add guests");
  $("#sumWhere").textContent = S.where || "Anywhere";
  $("#sumWhen").textContent = whenTxt() || "Any week";
  $("#sumWho").textContent = guestTxt() || "Add guests";
  ["adults", "children", "infants", "pets"].forEach(function(k){
    $("#n_" + k).textContent = S[k];
    var minus = $('[data-step="' + k + '"][data-d="-1"]'); if (minus) minus.disabled = S[k] <= 0 || (k === "adults" && S.adults <= 1 && (S.children || S.infants));
    var plus = $('[data-step="' + k + '"][data-d="1"]'); if (plus) plus.disabled = (k === "adults" || k === "children") ? guests() >= 16 : S[k] >= 5;
  });
  $$(".sg").forEach(function(s){ s.classList.toggle("on", open && mqDesk.matches && segFor(active) === s.getAttribute("data-p")); });
  if (sbar) sbar.classList.toggle("is-open", open && mqDesk.matches);
}
function segFor(a){ return a === "when" ? (S.ci && !S.co ? "co" : calPick === "co" ? "co" : "ci") : a; }
var calPick = "ci";
function setActive(a){
  active = a;
  $$(".spc", sp).forEach(function(c){ c.classList.toggle("on", c.getAttribute("data-p") === a); });
  sp.setAttribute("data-active", a);
  if (a === "when"){ drawCal(); drawFlex(); }
  if (a === "where") drawSugg();
  paintSearch();
}
function openSearch(a, focusEl){
  lastFocus = document.activeElement; open = true;
  if (mqDesk.matches){ topSearch.appendChild(sp); sp.className = "sp pop"; }
  else { document.body.appendChild(sp); sp.className = "sp sheet"; document.documentElement.classList.add("locked"); }
  sp.hidden = false; scrim.hidden = false;
  setActive(a || "where");
  setTimeout(function(){
    if (focusEl) return focusEl.focus();
    if (!mqDesk.matches && active === "where") $("#whereIn").focus({preventScroll: true});
    else { var f = $(".spc.on .spc-body button, .spc.on .spc-body input", sp); if (f && !mqDesk.matches) f.focus({preventScroll: true}); }
  }, 20);
}
function closeSearch(){
  if (!open) return;
  open = false; sp.hidden = true; scrim.hidden = !fsOpen(); document.documentElement.classList.toggle("locked", fsOpen());
  paintSearch();
  if (lastFocus && lastFocus.focus && !mqDesk.matches) lastFocus.focus({preventScroll: true});
}
function runSearch(){
  closeSearch(); pushUrl();
  if (S.ci && S.co) search(); else if (S.flex && S.flex.kind) flexSearch(); else { S.results = null; render(); }
  if (!mqDesk.matches) window.scrollTo({top: 0, behavior: reduce ? "auto" : "smooth"});
}
$("#mpill").addEventListener("click", function(){
  if (mqDesk.matches){ window.scrollTo({top: 0, behavior: reduce ? "auto" : "smooth"}); setTimeout(function(){ openSearch("where", $("#sbWhere")); }, reduce ? 0 : 250); }
  else openSearch(S.where ? (S.ci && S.co ? "who" : "when") : "where");
});
$$(".sg", sbar).forEach(function(s){
  s.addEventListener("click", function(){
    var p = s.getAttribute("data-p");
    if (p === "where"){ openSearch("where", $("#sbWhere")); return; }
    if (p === "ci" || p === "co"){ calPick = p; if (p === "ci" && S.co){ /* re-pick from check-in */ } openSearch("when"); return; }
    openSearch("who");
  });
});
$("#sbWhere").addEventListener("focus", function(){ if (!open || active !== "where") openSearch("where", null); });
$("#sbWhere").addEventListener("input", function(){ drawSugg(this.value); });
$("#whereIn").addEventListener("input", function(){ drawSugg(this.value); });
function whereEnter(e){ if (e.key === "Enter"){ e.preventDefault(); pickWhere(this.value.trim()); } }
$("#sbWhere").addEventListener("keydown", whereEnter);
$("#whereIn").addEventListener("keydown", whereEnter);
sbar.addEventListener("submit", function(e){ e.preventDefault(); var w = $("#sbWhere").value.trim(); if (w !== S.where) S.where = w; runSearch(); });
$("#spGo").addEventListener("click", runSearch);
$("#spClose").addEventListener("click", closeSearch);
$("#spClear").addEventListener("click", function(){ S.where = ""; S.ci = S.co = null; S.flex = null; setMode("dates"); S.adults = S.children = S.infants = S.pets = 0; S.results = null; $("#whereIn").value = ""; calPick = "ci"; setActive(active); render(); });
$$(".spc-sum", sp).forEach(function(b){ b.addEventListener("click", function(){ setActive(b.getAttribute("data-open")); }); });
scrim.addEventListener("click", function(){ closeSearch(); closeFilters(); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape"){ closeSearch(); closeFilters(); } });
document.addEventListener("mousedown", function(e){
  if (open && mqDesk.matches && !sp.contains(e.target) && !sbar.contains(e.target)) closeSearch();
});
mqDesk.addEventListener ? mqDesk.addEventListener("change", function(){ closeSearch(); closeFilters(); }) : null;

/* Where: cities and areas with homes first, then nearby places */
function pickWhere(v){
  S.where = v; $("#whereIn").value = v; $("#sbWhere").value = v;
  calPick = "ci"; setActive("when");
  if (mqDesk.matches) $$(".sg")[1].focus();
}
function drawSugg(typed){
  var t = String(typed == null ? "" : typed).toLowerCase().trim(), seen = {}, items = [];
  S.listings.forEach(function(l){
    [[l.city, ""], [areaName(l), l.city]].forEach(function(x){
      if (!x[0]) return; var k = x[0].toLowerCase(); if (seen[k]) { seen[k].n++; return; }
      seen[k] = {name: x[0], sub: x[1], n: 1}; items.push(seen[k]);
    });
  });
  (D.nearby || []).forEach(function(c){ if (!seen[c.toLowerCase()]){ seen[c.toLowerCase()] = {name: c, sub: "", n: 0}; items.push(seen[c.toLowerCase()]); } });
  var list = items.filter(function(x){ return !t || x.name.toLowerCase().indexOf(t) >= 0; });
  var html = '<li><button type="button" data-where="">' + '<span class="sic">' + icon("all") + '</span><span><b>Anywhere</b><small>' + plural(S.listings.length, "home") + "</small></span></button></li>";
  html += list.map(function(x){
    return '<li><button type="button" data-where="' + esc(x.name) + '"><span class="sic">' + icon(x.n ? "pin" : "city") + '</span><span><b>' + esc(x.name) + (x.sub ? ", " + esc(x.sub) : "") +
      "</b><small>" + (x.n ? plural(x.n, "home") : "Nearby, no homes listed yet") + "</small></span></button></li>";
  }).join("");
  if (t && !list.length) html += '<li class="nores">No matches. Press Enter to search for "' + esc(typed) + '".</li>';
  $("#sugg").innerHTML = html;
}
$("#sugg").addEventListener("click", function(e){ var b = e.target.closest("[data-where]"); if (b) pickWhere(b.getAttribute("data-where")); });

/* When: the same day-cell calendar as the listing pages (bh-booking.css), dates only */
var calView = null;
function firstOf(s){ var d = parse(s); return new Date(d.getFullYear(), d.getMonth(), 1); }
function drawCal(){
  var now = firstOf(today), sheet = !mqDesk.matches, n = sheet ? 12 : 2;
  if (!calView || sheet) calView = sheet ? now : firstOf(S.ci || today);
  if (calView < now) calView = now;
  var maxV = new Date(now.getFullYear(), now.getMonth() + 12 - n, 1); if (calView > maxV) calView = maxV;
  $("#spPrev").disabled = calView <= now; $("#spNext").disabled = calView >= maxV;
  var h = "";
  for (var m = 0; m < n; m++){
    var f = new Date(calView.getFullYear(), calView.getMonth() + m, 1), dim = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate(), lead = (f.getDay() + 6) % 7;
    h += '<div class="month"><h3>' + fmtMonth.format(f) + '</h3><div class="wk" aria-hidden="true"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div class="days">';
    for (var b = 0; b < lead; b++) h += '<span class="blank"></span>';
    for (var d = 1; d <= dim; d++){
      var s = iso(new Date(f.getFullYear(), f.getMonth(), d)), cls = "day", past = s < today;
      if (past) cls += " past";
      if (s === today) cls += " today";
      if (s === S.ci) cls += " sel start" + (S.co ? " has-range" : "");
      else if (s === S.co) cls += " sel end";
      else if (S.ci && S.co && s > S.ci && s < S.co) cls += " range";
      h += '<button type="button" class="' + cls + '" data-date="' + s + '"' + (past ? ' aria-disabled="true"' : "") + ' aria-label="' + fmtLong.format(parse(s)) + (s === S.ci ? ", check-in" : s === S.co ? ", checkout" : "") + '"' + (s === S.ci || s === S.co ? ' aria-pressed="true"' : "") + '><span class="dn">' + d + "</span></button>";
    }
    h += "</div></div>";
  }
  $("#spMonths").innerHTML = h;
  $("#spStatus").textContent = !S.ci ? "Select your check-in date" : !S.co ? "Select your checkout date" : datesTxt();
}
$("#spMonths").addEventListener("click", function(e){
  var b = e.target.closest(".day"); if (!b || b.getAttribute("aria-disabled") === "true") return;
  var s = b.getAttribute("data-date"); S.flex = null;
  if (calPick === "co" && S.ci && s > S.ci){ S.co = s; }
  else if (!S.ci || S.co || s <= S.ci){ S.ci = s; S.co = null; calPick = "co"; }
  else S.co = s;
  S.results = null;
  drawCal(); paintSearch();
  if (S.ci && S.co){ calPick = "ci"; setTimeout(function(){ setActive("who"); }, 180); }
});
$("#spPrev").addEventListener("click", function(){ calView = new Date(calView.getFullYear(), calView.getMonth() - 1, 1); drawCal(); });
$("#spNext").addEventListener("click", function(){ calView = new Date(calView.getFullYear(), calView.getMonth() + 1, 1); drawCal(); });

/* Who */
sp.addEventListener("click", function(e){
  var b = e.target.closest("[data-step]"); if (!b || b.disabled) return;
  var k = b.getAttribute("data-step"), d = +b.getAttribute("data-d");
  S[k] = Math.max(0, S[k] + d);
  if ((k === "children" || k === "infants" || k === "pets") && d > 0 && !S.adults) S.adults = 1;
  S.results = null; paintSearch();
});

/* Live availability + all-in totals for the chosen dates */
function search(){
  if (!(S.ci && S.co)){ S.results = null; render(); return; }
  S.results = "loading"; render();
  fetch("/api/bh/listings?action=search&check_in=" + S.ci + "&check_out=" + S.co + "&guests=" + Math.max(1, guests()), {headers: {"Accept": "application/json"}})
    .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
    .then(function(j){ S.results = {}; (j.results || []).forEach(function(x){ S.results[x.id] = x; }); render(); })
    .catch(function(){ S.results = null; render(); $("#count").textContent = "Couldn't check live availability. Showing all homes."; });
}
var _visible = visible;
visible = function(f){ if (S.results === "loading"){ var r = S.results; S.results = null; var v = _visible(f); S.results = r; return v; } return _visible(f); };

/* ---------- flexible dates: a weekend, week or month in the months you pick ---------- */
var mode = "dates";
function setMode(m){
  mode = m;
  $("#tabDates").setAttribute("aria-selected", m === "dates" ? "true" : "false");
  $("#tabFlex").setAttribute("aria-selected", m === "flex" ? "true" : "false");
  $("#datesPane").hidden = m !== "dates"; $("#flexPane").hidden = m !== "flex";
  if (m === "flex" && !S.flex){ S.flex = {kind: "weekend", months: []}; S.ci = S.co = null; S.results = null; }
  if (m === "dates" && S.flex){ S.flex = null; S.results = null; }
  drawFlex(); paintSearch();
}
function drawFlex(){
  var f = S.flex || {kind: "", months: []}, h = "", now = parse(today);
  $$("#fxKind button").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-kind") === f.kind ? "true" : "false"); });
  for (var i = 0; i < 6; i++){
    var d = new Date(now.getFullYear(), now.getMonth() + i, 1), k = iso(d).slice(0, 7);
    h += '<button type="button" data-month="' + k + '" aria-pressed="' + (f.months.indexOf(k) >= 0 ? "true" : "false") + '">' + icon("calendar") + "<b>" + fmtMon.format(d) + "</b><small>" + d.getFullYear() + "</small></button>";
  }
  $("#fxMonths").innerHTML = h;
}
$$(".seg [data-mode]").forEach(function(b){ b.addEventListener("click", function(){ setMode(b.getAttribute("data-mode")); }); });
$("#fxKind").addEventListener("click", function(e){ var b = e.target.closest("[data-kind]"); if (!b) return; S.flex = S.flex || {months: []}; S.flex.kind = b.getAttribute("data-kind"); S.results = null; drawFlex(); paintSearch(); });
$("#fxMonths").addEventListener("click", function(e){
  var b = e.target.closest("[data-month]"); if (!b) return; S.flex = S.flex || {kind: "weekend", months: []};
  var k = b.getAttribute("data-month"), i = S.flex.months.indexOf(k);
  if (i >= 0) S.flex.months.splice(i, 1); else S.flex.months.push(k);
  S.flex.months.sort(); S.results = null; drawFlex(); paintSearch();
});
function addD(s, n){ var d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
function flexRanges(){
  var f = S.flex, out = [], start = addD(today, 1), months = f.months.length ? f.months : [today.slice(0, 7), iso(new Date(parse(today).getFullYear(), parse(today).getMonth() + 1, 1)).slice(0, 7)];
  months.forEach(function(m){
    var first = m + "-01", d = first < start ? start : first;
    if (f.kind === "month"){ out.push([d, addD(d, 28)]); return; }
    while (d.slice(0, 7) === m){
      if (parse(d).getDay() === 5) out.push([d, addD(d, f.kind === "week" ? 7 : 2)]);
      d = addD(d, 1);
    }
  });
  /* keep at most 6 checks, spread across the chosen months */
  if (out.length > 6){ var step = out.length / 6, pick = []; for (var i = 0; i < 6; i++) pick.push(out[Math.floor(i * step)]); out = pick; }
  return out;
}
function flexSearch(){
  var ranges = flexRanges(); if (!ranges.length){ S.results = null; render(); return; }
  S.results = "loading"; render();
  Promise.all(ranges.map(function(rg){
    return fetch("/api/bh/listings?action=search&check_in=" + rg[0] + "&check_out=" + rg[1] + "&guests=" + Math.max(1, guests()), {headers: {"Accept": "application/json"}})
      .then(function(r){ return r.ok ? r.json() : {results: []}; }).then(function(j){ return {rg: rg, res: j.results || []}; }).catch(function(){ return {rg: rg, res: []}; });
  })).then(function(all){
    var out = {};
    all.sort(function(a, b){ return a.rg[0] < b.rg[0] ? -1 : 1; }).forEach(function(x){
      x.res.forEach(function(r){ if (r.available && !(out[r.id] && out[r.id].available)) out[r.id] = Object.assign({}, r, {ci: x.rg[0], co: x.rg[1]}); });
    });
    S.results = out; render();
  });
}

/* ---------- price details popover on a card ---------- */
function closePops(except){ $$(".prpop").forEach(function(p){ if (p !== except){ var b = p.parentNode.querySelector(".prbtn"); if (b) b.setAttribute("aria-expanded", "false"); p.remove(); } }); }
function togglePop(btn){
  var wrap = btn.parentNode, ex = $(".prpop", wrap);
  if (ex){ closePops(); return; }
  closePops();
  var id = +btn.closest(".card").getAttribute("data-id"), r = S.results && S.results[id], l = S.listings.filter(function(x){ return x.id === id; })[0];
  if (!r || !l) return;
  var total = r.total_pence / 100, clean = +l.cleaning_fee || 0, disc = (r.discount_pence || 0) / 100, nightsAmt = Math.round((total - clean + disc) * 100) / 100;
  var avg = r.nights ? Math.round(nightsAmt / r.nights * 100) / 100 : 0;
  var row = function(a, b, c){ return '<div class="pp-row' + (c ? " " + c : "") + '"><span>' + a + "</span><span>" + b + "</span></div>"; };
  var h = '<div class="prpop" role="dialog" aria-label="Price details"><h3>Price details</h3>' +
    row(r.nights ? plural(r.nights, "night") + " x " + money(avg) : "Nights", money(nightsAmt)) +
    (disc > 0 ? row("Length-of-stay discount", "-" + money(disc), "pp-disc") : "") +
    (clean ? row("Cleaning fee", money(clean)) : "") +
    row("Booking fee", "£0", "pp-free") +
    row("<b>Total</b>", "<b>" + money(total) + "</b>", "pp-total") + "</div>";
  wrap.insertAdjacentHTML("beforeend", h);
  btn.setAttribute("aria-expanded", "true");
}
document.addEventListener("click", function(e){ if (!e.target.closest(".pr")) closePops(); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape") closePops(); });

/* ---------- date alert from the empty state (one per close-match home, max 3) ---------- */
function sendAlert(e){
  e.preventDefault();
  var em = $("#eaEmail").value.trim(), out = $("#eaMsg");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){ out.textContent = "Please enter a valid email."; $("#eaEmail").focus(); return; }
  out.textContent = "Saving...";
  var homes = dateMisses().slice(0, 3);
  Promise.all(homes.map(function(l){
    return fetch("/api/bh/listings", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "alert", email: em, slug: l.slug, check_in: S.ci, check_out: S.co, guests: Math.max(1, guests()), consent: false})}).then(function(r){ return r.ok; }).catch(function(){ return false; });
  })).then(function(ok){
    if (ok.some(Boolean)){ $("#emptyAlert").hidden = true; out.className = "ea-msg ok"; out.textContent = "Done. We'll email you once if " + datesTxt() + " frees up."; }
    else out.textContent = "That didn't save. Please try again.";
  });
}

/* ---------- filters sheet ---------- */
var fs = $("#fs"), draft = null;
var PMAX = Math.max(300, Math.ceil(Math.max.apply(null, [0].concat(S.listings.map(function(l){ return +l.from_price || 0; }))) / 50) * 50 + 50);
var pMin = $("#pMin"), pMax = $("#pMax");
[pMin, pMax].forEach(function(r){ r.min = 0; r.max = PMAX; r.step = 5; });
function fsOpen(){ return !fs.hidden; }
function clone(f){ return {pmin: f.pmin, pmax: f.pmax, bedrooms: f.bedrooms, beds: f.beds, baths: f.baths, tags: Object.assign({}, f.tags), amen: Object.assign({}, f.amen)}; }
function syncFilterUI(){
  var f = draft || S.f;
  pMin.value = f.pmin || 0; pMax.value = f.pmax == null ? PMAX : f.pmax;
  $("#pMinT").textContent = money(f.pmin || 0); $("#pMaxT").textContent = f.pmax == null ? money(PMAX) + "+" : money(f.pmax);
  var a = (+pMin.value / PMAX) * 100, b = (+pMax.value / PMAX) * 100; $("#pFill").style.left = a + "%"; $("#pFill").style.right = (100 - b) + "%";
  ["bedrooms", "beds", "baths"].forEach(function(k){ $("#f_" + k).textContent = f[k] ? f[k] + "+" : "Any"; $('[data-fstep="' + k + '"][data-d="-1"]').disabled = !f[k]; $('[data-fstep="' + k + '"][data-d="1"]').disabled = f[k] >= 8; });
  $$("[data-ftag]", fs).forEach(function(b){ b.setAttribute("aria-pressed", f.tags[b.getAttribute("data-ftag")] ? "true" : "false"); });
  $$("[data-famen]", fs).forEach(function(b){ b.setAttribute("aria-pressed", f.amen[b.getAttribute("data-famen")] ? "true" : "false"); });
  var n = visible(f).length; $("#fsGo").textContent = "Show " + plural(n, "home");
}
function openFilters(){ closeSearch(); draft = clone(S.f); syncFilterUI(); lastFocus = document.activeElement; fs.hidden = false; scrim.hidden = false; document.documentElement.classList.add("locked"); $("#fsClose").focus(); }
function closeFilters(apply){
  if (fs.hidden) return;
  if (apply){ S.f = draft; pushUrl(); render(); }
  draft = null; fs.hidden = true; scrim.hidden = true; document.documentElement.classList.remove("locked");
  if (lastFocus && lastFocus.focus) lastFocus.focus({preventScroll: true});
}
$$("[data-filters]").forEach(function(b){ b.addEventListener("click", openFilters); });
$("#fsClose").addEventListener("click", function(){ closeFilters(false); });
$("#fsGo").addEventListener("click", function(){ closeFilters(true); });
$("#fsClear").addEventListener("click", function(){ draft = {pmin: 0, pmax: null, bedrooms: 0, beds: 0, baths: 0, tags: {}, amen: {}}; syncFilterUI(); });
fs.addEventListener("click", function(e){
  if (e.target === fs){ closeFilters(false); return; }
  var t = e.target.closest("[data-ftag]"), a = e.target.closest("[data-famen]"), s = e.target.closest("[data-fstep]");
  if (t){ var k = t.getAttribute("data-ftag"); draft.tags[k] = !draft.tags[k]; }
  else if (a){ var k2 = a.getAttribute("data-famen"); draft.amen[k2] = !draft.amen[k2]; }
  else if (s && !s.disabled){ var k3 = s.getAttribute("data-fstep"); draft[k3] = Math.max(0, Math.min(8, draft[k3] + +s.getAttribute("data-d"))); }
  else return;
  syncFilterUI();
});
pMin.addEventListener("input", function(){ var v = Math.min(+pMin.value, +pMax.value - 10); pMin.value = v; draft.pmin = v; syncFilterUI(); });
pMax.addEventListener("input", function(){ var v = Math.max(+pMax.value, +pMin.value + 10); pMax.value = v; draft.pmax = v >= PMAX ? null : v; syncFilterUI(); });

/* ---------- map: approximate areas only (coordinates are rounded to about 1 km) ---------- */
var map = null, layer = null, mapBtn = $("#mapBtn");
function loadLeaflet(cb){
  if (window.L) return cb();
  var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
  var s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = cb; document.body.appendChild(s);
}
mapBtn.addEventListener("click", function(){
  S.map = !S.map;
  mapBtn.setAttribute("aria-pressed", S.map ? "true" : "false");
  mapBtn.innerHTML = S.map ? "<span>Show list</span>" + icon("list") : "<span>Show map</span>" + icon("map");
  $("#mapview").hidden = !S.map; $("#results").classList.toggle("with-map", S.map); document.body.classList.toggle("map-on", S.map);
  if (S.map) loadLeaflet(function(){ drawMap(visible()); });
  if (!mqDesk.matches) window.scrollTo({top: 0});
});
function drawMap(v){
  if (!S.map || !window.L) return;
  if (!map){
    map = L.map("map", {scrollWheelZoom: true}).setView([53.43, -2.95], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 15, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  }
  setTimeout(function(){ map.invalidateSize(); }, 60);
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  var pts = [];
  v.forEach(function(l){
    if (l.lat == null || l.lng == null) return;
    var r = S.results && S.results !== "loading" && S.results[l.id], label = r && r.total_pence ? money(r.total_pence / 100) : l.from_price ? money(l.from_price) : l.title;
    L.circle([l.lat, l.lng], {radius: 700, color: "#1f4d3a", weight: 1, fillOpacity: .12}).addTo(layer);
    L.marker([l.lat, l.lng], {icon: L.divIcon({className: "pricepin", html: '<a href="' + esc(linkFor(l)) + '">' + esc(label) + "</a>", iconSize: null})}).addTo(layer);
    pts.push([l.lat, l.lng]);
  });
  if (pts.length) map.fitBounds(pts, {maxZoom: 13, padding: [60, 60]});
}

/* ---------- compact header on scroll (desktop) ---------- */
var top = $("#top");
function onScroll(){ document.documentElement.style.setProperty("--toph", top.offsetHeight + "px"); top.classList.toggle("compact", window.scrollY > 70 && mqDesk.matches && !open); top.classList.toggle("scrolled", window.scrollY > 4); }
window.addEventListener("scroll", onScroll, {passive: true}); window.addEventListener("resize", onScroll); onScroll();

/* ---------- refresh from the live API (homes approved since the last build) ---------- */
function prep(l, old){
  l.id = +l.id; l.tags = tagsFor(l);
  l.url = old && old.url ? old.url : pathFor(l);
  l.card_photos = old && old.card_photos ? old.card_photos : (l.photos || []).slice(0, 5);
  return l;
}
fetch("/api/bh/listings?action=list", {headers: {"Accept": "application/json"}})
  .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
  .then(function(j){
    if (!j || !Array.isArray(j.listings) || !j.listings.length) return;
    var byId = {}; S.listings.forEach(function(l){ byId[l.id] = l; });
    var sig = function(){ return S.listings.map(function(l){ return [l.id, l.from_price, l.max_guests, l.tags.join("+"), (l.reviews || {}).count].join(":"); }).join("|"); };
    var before = categoryRow().join(","), s0 = sig();
    S.listings = j.listings.map(function(l){ return prep(l, byId[+l.id]); });
    if (categoryRow().join(",") !== before) drawCats();
    if (sig() !== s0) render();
  }).catch(function(){});

if (S.tag && !$('.cat[data-tag="' + S.tag + '"]')) S.tag = "";
syncFilterUI(); drawSugg(""); spaceCats();
if (S.flex) setMode("flex");
if (S.ci && S.co) search();
else if (S.flex && S.flex.kind) flexSearch();
else if (location.search.length > 1) render();
else { paintSearch(); $$(".card").forEach(function(c){ var h = $(".heart", c); if (h) h.setAttribute("aria-pressed", isSaved(c.getAttribute("data-id")) ? "true" : "false"); }); }
})();
