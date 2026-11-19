/* Book Homes /stays search: Where / Dates / Guests pill, category icon bar, filter chips, list + map.
   Listings are embedded at build time (#bh-data) and refreshed from /api/bh/listings, so homes approved
   since the last build still show (their page then loads from the API). Dates search asks the server for
   live availability and the all-in total (no booking fees). Locations on the map are approximate. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(n){ n = +n || 0; return "£" + (n % 1 ? n.toFixed(2) : n.toLocaleString("en-GB")); }
function pad(n){ return (n < 10 ? "0" : "") + n; }
function iso(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function parse(s){ var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
var fmtShort = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"});
var fmtMonth = new Intl.DateTimeFormat("en-GB", {month: "long", year: "numeric"});
var today = iso(new Date());

var DATA = JSON.parse($("#bh-data").textContent);
var S = {listings: DATA.listings, cat: DATA.preset || "all", chips: {}, where: "", ci: null, co: null, guests: 2, results: null, map: false};

/* URL state */
var q = new URLSearchParams(location.search);
if (q.get("cat")) S.cat = q.get("cat");
(q.get("f") || "").split(",").forEach(function(c){ if (c) S.chips[c] = true; });
if (q.get("where")) S.where = q.get("where");
if (/^\d{4}-\d{2}-\d{2}$/.test(q.get("check_in") || "") && /^\d{4}-\d{2}-\d{2}$/.test(q.get("check_out") || "") && q.get("check_in") >= today && q.get("check_out") > q.get("check_in")){ S.ci = q.get("check_in"); S.co = q.get("check_out"); }
if (/^\d{1,2}$/.test(q.get("guests") || "")) S.guests = Math.min(16, Math.max(1, +q.get("guests")));
function pushUrl(){
  var p = new URLSearchParams();
  if (S.cat && S.cat !== (DATA.preset || "all")) p.set("cat", S.cat);
  var f = Object.keys(S.chips).filter(function(k){ return S.chips[k]; }); if (f.length) p.set("f", f.join(","));
  if (S.where) p.set("where", S.where);
  if (S.ci && S.co){ p.set("check_in", S.ci); p.set("check_out", S.co); }
  if (S.guests !== 2) p.set("guests", S.guests);
  var s = p.toString(); history.replaceState(null, "", location.pathname + (s ? "?" + s : ""));
}

/* Filters */
function inCat(l){
  var c = S.cat, f = l.features || {}, cats = l.categories || [], b = l.business || {};
  if (!c || c === "all") return true;
  if (c === "kosher") return !!f.kosher;
  if (c === "work") return !!(f.work_crew || f.business_ready) || cats.indexOf("work") >= 0;
  if (c === "groups") return l.max_guests >= 6 || cats.indexOf("groups") >= 0;
  if (c === "long_stay") return cats.indexOf("long_stay") >= 0 || l.monthly_discount_pct > 0 || b.monthly_rates;
  return cats.indexOf(c) >= 0;
}
function visible(){
  return S.listings.filter(function(l){
    if (!inCat(l)) return false;
    for (var k in S.chips) if (S.chips[k] && !(l.features || {})[k]) return false;
    if (S.where && (l.city || "") !== S.where) return false;
    if (l.max_guests < S.guests) return false;
    if (S.results){ var r = S.results[l.id]; if (!r || !r.available) return false; }
    return true;
  });
}
function linkFor(l){
  var base = l.url || ("/stays/" + l.slug), legacy = !!l.legacy_source;
  if (!(S.ci && S.co)) return base + (S.guests !== 2 ? "?guests=" + S.guests : "");
  return base + (legacy ? "?checkIn=" + S.ci + "&checkOut=" + S.co + "&guests=" + S.guests + "#book" : "?check_in=" + S.ci + "&check_out=" + S.co + "&guests=" + S.guests);
}
function card(l){
  var f = l.features || {}, ph = (l.photos && l.photos[0] && l.photos[0].url) || "", rv = l.reviews || {}, r = S.results && S.results[l.id];
  var tag = f.kosher_kitchen ? '<span class="tag">' + icon("kosher") + 'Kosher kitchen</span>' : f.business_ready ? '<span class="tag">' + icon("work") + 'Business-ready</span>' : f.shabbat_friendly ? '<span class="tag">' + icon("shabbat") + 'Shabbat friendly</span>' : "";
  var price = r && r.total_pence ? '<b>' + money(r.total_pence / 100) + '</b> total for ' + r.nights + ' night' + (r.nights === 1 ? "" : "s") + '<small>Total price, no booking fees</small>'
    : l.from_price ? '<b>From ' + money(l.from_price) + '</b> a night<small>Plus cleaning ' + money(l.cleaning_fee) + '. No booking fees.</small>'
    : '<b>Add dates</b> to see prices<small>Total shown with dates. No booking fees.</small>';
  var badges = [];
  if (f.near_shul) badges.push('<span class="badge">' + icon("shul") + 'Near shul</span>');
  if (f.work_crew) badges.push('<span class="badge">' + icon("van") + 'Work crew</span>');
  return '<a class="card" href="' + esc(linkFor(l)) + '" data-id="' + l.id + '"><div class="ph"><img src="' + esc(ph) + '" alt="' + esc(l.title) + '" loading="lazy" width="600" height="570">' + tag + '</div>' +
    '<div class="row1"><span>' + esc(l.title) + '</span>' + (rv.count ? '<span class="rt">' + icon("star") + rv.average.toFixed(2) + ' (' + rv.count + ')</span>' : "") + '</div>' +
    '<div class="sub">' + esc(l.area || l.city) + '</div><div class="sub">' + l.max_guests + ' guests · ' + l.bedrooms + ' bedroom' + (l.bedrooms === 1 ? "" : "s") + '</div>' +
    (badges.length ? '<div class="badges">' + badges.join("") + '</div>' : "") + '<div class="price">' + price + '</div></a>';
}
function render(){
  var v = visible();
  $("#grid").innerHTML = v.length ? v.map(card).join("") : '<p class="empty">No homes match. Try other dates or remove a filter.</p>';
  $("#count").textContent = v.length + " home" + (v.length === 1 ? "" : "s") + (S.ci && S.co ? " available " + fmtShort.format(parse(S.ci)) + " to " + fmtShort.format(parse(S.co)) : "");
  $$(".cat").forEach(function(b){ b.setAttribute("aria-pressed", b.getAttribute("data-cat") === S.cat ? "true" : "false"); });
  $$("[data-chip]").forEach(function(b){ b.setAttribute("aria-pressed", S.chips[b.getAttribute("data-chip")] ? "true" : "false"); });
  $("#qDatesTxt").textContent = S.ci && S.co ? fmtShort.format(parse(S.ci)) + " to " + fmtShort.format(parse(S.co)) : S.ci ? fmtShort.format(parse(S.ci)) + " to ..." : "Add dates";
  $("#qGuests").value = String(S.guests);
  drawMap(v);
}

/* Where */
var where = $("#qWhere");
Array.from(new Set(S.listings.map(function(l){ return l.city; }).filter(Boolean))).sort().forEach(function(c){
  var o = document.createElement("option"); o.value = c; o.textContent = c; where.appendChild(o);
});
where.value = S.where;
where.addEventListener("change", function(){ S.where = where.value; pushUrl(); render(); });
$("#qGuests").addEventListener("change", function(){ S.guests = +this.value; pushUrl(); if (S.ci && S.co) search(); else render(); });
$$(".cat").forEach(function(b){ b.addEventListener("click", function(){ S.cat = b.getAttribute("data-cat"); pushUrl(); render(); }); });
$$("[data-chip]").forEach(function(b){ b.addEventListener("click", function(){ var k = b.getAttribute("data-chip"); S.chips[k] = !S.chips[k]; pushUrl(); render(); }); });
$("#pill").addEventListener("submit", function(e){ e.preventDefault(); if (S.ci && S.co) search(); else openRp(); });

/* Live availability + all-in totals for the chosen dates */
function search(){
  if (!(S.ci && S.co)){ S.results = null; render(); return; }
  $("#count").textContent = "Checking availability...";
  fetch("/api/bh/listings?action=search&check_in=" + S.ci + "&check_out=" + S.co + "&guests=" + S.guests, {headers: {"Accept": "application/json"}})
    .then(function(r){ return r.json(); })
    .then(function(j){ S.results = {}; (j.results || []).forEach(function(x){ S.results[x.id] = x; }); render(); })
    .catch(function(){ S.results = null; render(); $("#count").textContent = "Couldn't check live availability. Showing all homes."; });
}

/* Range picker (dates only; each listing's own calendar checks availability) */
var rp = null;
function openRp(){
  if (!rp){
    rp = document.createElement("div");
    rp.className = "rp"; rp.setAttribute("role", "dialog"); rp.setAttribute("aria-label", "Choose dates");
    rp.innerHTML = '<div class="rp-h"><button type="button" class="rp-nav" data-n="-1" aria-label="Previous month">‹</button><b id="rpT">Select check-in</b><button type="button" class="rp-nav" data-n="1" aria-label="Next month">›</button></div><div class="rp-m" id="rpM"></div><div class="rp-f"><button type="button" class="link" id="rpClear">Clear</button><button type="button" class="btn" id="rpDone">Search</button></div>';
    document.body.appendChild(rp);
    rp.addEventListener("click", function(e){
      var d = e.target.closest("[data-d]"), n = e.target.closest(".rp-nav");
      if (n){ rp.view = new Date(rp.view.getFullYear(), rp.view.getMonth() + +n.getAttribute("data-n"), 1); draw(); return; }
      if (!d || d.disabled) return;
      var s = d.getAttribute("data-d");
      if (!S.ci || S.co || s <= S.ci){ S.ci = s; S.co = null; } else { S.co = s; }
      draw(); render();
    });
    $("#rpClear", rp).addEventListener("click", function(){ S.ci = S.co = null; S.results = null; draw(); render(); pushUrl(); });
    $("#rpDone", rp).addEventListener("click", function(){ closeRp(); pushUrl(); search(); });
    $("#dpScrim").addEventListener("click", closeRp);
    document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeRp(); });
  }
  rp.view = rp.view || (S.ci ? new Date(parse(S.ci).getFullYear(), parse(S.ci).getMonth(), 1) : new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  draw(); rp.hidden = false; document.body.classList.add("dp-open");
}
function closeRp(){ if (rp){ rp.hidden = true; document.body.classList.remove("dp-open"); } }
function draw(){
  var n = window.matchMedia("(max-width:760px)").matches ? 1 : 2, h = "";
  var first = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  if (rp.view < first) rp.view = first;
  for (var m = 0; m < n; m++){
    var f = new Date(rp.view.getFullYear(), rp.view.getMonth() + m, 1), dim = new Date(f.getFullYear(), f.getMonth() + 1, 0).getDate(), lead = (f.getDay() + 6) % 7;
    h += '<div><p class="rp-mt">' + fmtMonth.format(f) + '</p><div class="rp-g"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>';
    for (var b = 0; b < lead; b++) h += "<i></i>";
    for (var d = 1; d <= dim; d++){
      var s = iso(new Date(f.getFullYear(), f.getMonth(), d)), cls = s === S.ci || s === S.co ? "sel" : (S.ci && S.co && s > S.ci && s < S.co ? "in" : "");
      h += '<button type="button" data-d="' + s + '" class="' + cls + '"' + (s < today ? " disabled" : "") + '>' + d + '</button>';
    }
    h += "</div></div>";
  }
  $("#rpM", rp).innerHTML = h;
  $("#rpT", rp).textContent = !S.ci ? "Select check-in" : !S.co ? "Select checkout" : fmtShort.format(parse(S.ci)) + " to " + fmtShort.format(parse(S.co));
}
$("#qDates").addEventListener("click", openRp);

/* Map: approximate areas only (coordinates are rounded to about 1 km), price labels, no exact pins */
var map = null, layer = null;
$("#mapToggle").addEventListener("click", function(){
  S.map = !S.map; this.setAttribute("aria-pressed", S.map ? "true" : "false");
  $("#mapbox").hidden = !S.map; $("#results").classList.toggle("with-map", S.map);
  render();
});
function drawMap(v){
  if (!S.map || !window.L) return;
  if (!map){
    map = L.map("map", {scrollWheelZoom: false}).setView([53.41, -2.98], 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 15, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(map);
  }
  setTimeout(function(){ map.invalidateSize(); }, 50);
  if (layer) layer.remove();
  layer = L.layerGroup().addTo(map);
  var pts = [];
  v.forEach(function(l){
    if (l.lat == null || l.lng == null) return;
    var r = S.results && S.results[l.id], label = r && r.total_pence ? money(r.total_pence / 100) : l.from_price ? "From " + money(l.from_price) : "Add dates";
    L.circle([l.lat, l.lng], {radius: 700, color: "#1f4d3a", weight: 1, fillOpacity: .12}).addTo(layer);
    L.marker([l.lat, l.lng], {icon: L.divIcon({className: "pricepin", html: '<a href="' + esc(linkFor(l)) + '">' + esc(label) + '</a>', iconSize: null})}).addTo(layer);
    pts.push([l.lat, l.lng]);
  });
  if (pts.length) map.fitBounds(pts, {maxZoom: 13, padding: [40, 40]});
}

/* Refresh from the live API (homes approved since the last build) */
fetch("/api/bh/listings?action=list", {headers: {"Accept": "application/json"}})
  .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
  .then(function(j){
    if (!j || !Array.isArray(j.listings)) return;
    S.listings = j.listings.map(function(l){ l.id = +l.id; l.url = l.page_url || ("/stays/" + l.slug); return l; });
    render();
  }).catch(function(){});

render();
if (S.ci && S.co) search();
})();
