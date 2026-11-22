/* Area hubs (/stays-in/<area>): homes approved since the last build are added from /api/bh/listings.
   Matching mirrors own_match() in bh_areas.py (city/area words, or lat/lng inside a city's radius). */
(function(){
"use strict";
var cfgEl = document.getElementById("bh-area"), grid = document.getElementById("areaGrid");
if (!cfgEl || !grid || !window.fetch) return;
var cfg; try { cfg = JSON.parse(cfgEl.textContent); } catch (e) { return; }
function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]; }); }
function km(a, b, c, d){ var p = Math.PI / 180, h = Math.pow(Math.sin((c - a) * p / 2), 2) + Math.cos(a * p) * Math.cos(c * p) * Math.pow(Math.sin((d - b) * p / 2), 2); return 12742 * Math.asin(Math.sqrt(h)); }
function hit(m, l){
  var t = ((l.city || "") + " " + (l.area || "") + " " + (l.title || "")).toLowerCase();
  for (var i = 0; i < (m.match || []).length; i++){
    if (new RegExp("\\b" + m.match[i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b").test(t)) return true;
  }
  return !!(m.center && m.radius_km && typeof l.lat === "number" && typeof l.lng === "number" && km(m.center[0], m.center[1], l.lat, l.lng) <= m.radius_km);
}
function img(u){ return /^https:\/\/kddhkuwnkkjcnbjegsmc\.supabase\.co\/storage\/v1\/object\/public\//.test(u || "") ? "/_vercel/image?url=" + encodeURIComponent(u) + "&w=720&q=75" : u; }
function plural(n, w){ return n + " " + w + (n === 1 ? "" : "s"); }
function card(l){
  var ph = (l.card_photos && l.card_photos.length ? l.card_photos : (l.photos || []))[0] || {}, href = esc(l.url || "/" + l.slug);
  var area = (l.area || "").split(",")[0].trim(), place = [l.city, area && area.toLowerCase() !== (l.city || "").toLowerCase() ? area : ""].filter(Boolean).join(", ");
  var price = l.from_price ? '<span class="from">From</span> <b>£' + Math.round(l.from_price) + "</b> night" : "<b>Add dates</b> for prices";
  return '<article class="card" data-id="' + esc(l.id) + '"><div class="cph"><div class="track"><a class="sl" href="' + href + '">' +
    (ph.url ? '<img src="' + esc(ph.thumb || img(ph.url)) + '" alt="' + esc(ph.caption || l.title) + '" width="720" height="684" loading="lazy" decoding="async">' : "") +
    '</a></div></div><a class="meta" href="' + href + '"><span class="l1"><b>' + esc(place) + '</b></span><span class="l2">' + esc(l.title) + '</span>' +
    '<span class="l2">' + plural(l.bedrooms || 0, "bedroom") + " · " + plural(l.max_guests || 0, "guest") + '</span><span class="l2 l-d">No booking fees</span><span class="pr">' + price + "</span></a></article>";
}
fetch("/api/bh/listings?action=list", {headers: {"Accept": "application/json"}})
  .then(function(r){ if (!r.ok) throw new Error(); return r.json(); })
  .then(function(j){
    if (!j || !Array.isArray(j.listings)) return;
    var mine = j.listings.filter(function(l){ return cfg.areas.some(function(m){ return hit(m, l); }); });
    if (mine.length <= (cfg.static || 0)) return;
    var have = {};
    Array.prototype.forEach.call(grid.querySelectorAll(".card"), function(c){ have[c.getAttribute("data-id")] = 1; });
    grid.insertAdjacentHTML("beforeend", mine.filter(function(l){ return !have[String(l.id)]; }).map(card).join(""));
    var empty = document.getElementById("areaEmpty"); if (empty) empty.hidden = true;
    var n = document.getElementById("areaCount"); if (n) n.textContent = plural(mine.length, "home") + " live now";
  }).catch(function(){});
})();
