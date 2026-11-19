/* Fallback listing page for homes approved since the last site build (/stays/<slug> -> /stays/listing/).
   Loads the approved listing from the API, fills the page, then starts the normal booking code. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(n){ n = +n || 0; return "£" + (n % 1 ? n.toFixed(2) : n); }
var LABELS = {wifi:"Wifi",parking:"Free parking",kitchen:"Kitchen",washer:"Washing machine",dryer:"Tumble dryer",tv:"TV",heating:"Heating",aircon:"Air conditioning",garden:"Garden",workspace:"Dedicated workspace",cot:"Cot",highchair:"High chair",bath:"Bath",ev_charger:"EV charger",pool_table:"Pool table",bbq:"BBQ",self_checkin:"Self check-in",step_free:"Step-free entrance",dishwasher:"Dishwasher",coffee:"Coffee maker",iron:"Iron",hairdryer:"Hairdryer",fireplace:"Fireplace",pets:"Pets allowed"};
var slug = (location.pathname.match(/^\/stays\/([a-z0-9-]+)\/?$/) || [])[1] || new URLSearchParams(location.search).get("slug") || "";
function load(src){ var s = document.createElement("script"); s.src = src; document.body.appendChild(s); }
function fail(msg){ $("#lpTitle").textContent = msg; $("#content .lp").style.display = "none"; $("#mbook").style.display = "none"; }
if (!slug || slug === "listing"){ fail("This home could not be found."); return; }
fetch("/api/bh/listings?action=get&slug=" + encodeURIComponent(slug), {headers: {"Accept": "application/json"}})
  .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
  .then(function(j){
    var l = j.listing;
    if (l.legacy_source && l.page_url){ location.replace(l.page_url); return; }
    document.title = l.title + " | Book Homes";
    $("#lpTitle").textContent = l.title;
    $("#lpMeta").textContent = [l.area, l.city].filter(Boolean).join(", ");
    var ph = l.photos || [];
    $("#lpGal").innerHTML = ph.slice(0, 5).map(function(p, i){ return '<button type="button" data-lb="' + i + '"><img src="' + esc(p.url) + '" alt="' + esc(p.caption || l.title) + '"></button>'; }).join("");
    $("#lbg").innerHTML = ph.map(function(p){ return '<img src="' + esc(p.url) + '" alt="' + esc(p.caption || l.title) + '" loading="lazy">'; }).join("");
    $("#lpFacts").textContent = "Entire " + l.property_type + " · " + l.max_guests + " guests · " + l.bedrooms + " bedrooms · " + l.beds + " beds · " + l.baths + " baths";
    $("#lpAv").textContent = (l.host_name || "H").charAt(0).toUpperCase();
    $("#lpHost").textContent = "Hosted by " + (l.host_name || "your host");
    $("#lpDisc").textContent = l.trader_status === "private"
      ? "Hosted by a private individual. Your contract for the stay is with the host. UK consumer rights that apply to businesses may not apply when you book from a private host. Book Homes is the booking platform."
      : "Hosted by a business (trader). Your contract for the stay is with the host. Book Homes is the booking platform.";
    $("#lpDesc").textContent = l.description || "";
    var am = (l.amenities || []).filter(function(a){ return LABELS[a]; });
    if (am.length){ $("#lpAmen").innerHTML = am.map(function(a){ return "<li>" + icon(a) + esc(LABELS[a]) + "</li>"; }).join(""); $("#lpAmenWrap").hidden = false; }
    var k = l.kosher || {}, sh = k.shabbat || {}, rows = [];
    if (k.kitchen) rows.push(["kosher", "Kosher kitchen", k.kitchen_type || ""]);
    if (k.supervision) rows.push(["check", "Kashrut, in the host's words", k.supervision]);
    [["hotplate","Shabbat hot plate or blech"],["urn","Shabbat urn"],["lamp_timers","Shabbat lamp or timers"],["non_electric_key","Non-electric key or keypad override"],["no_motion_sensors","No motion-sensor lights"]].forEach(function(x){ if (sh[x[0]]) rows.push(["shabbat", x[1], ""]); });
    if (k.shul_name || k.shul_walk_mins) rows.push(["shul", "Nearest shul: " + (k.shul_name || "ask the host"), k.shul_walk_mins ? "About " + k.shul_walk_mins + " minutes' walk" : ""]);
    if (k.eruv === "yes") rows.push(["eruv", "Inside an eruv", ""]);
    if (k.kosher_shops) rows.push(["shop", "Kosher shops and restaurants nearby", k.kosher_shops]);
    if (k.mikvah) rows.push(["water", "Mikvah", k.mikvah]);
    if (rows.length){ $("#lpKosherList").innerHTML = rows.map(function(r){ return "<li>" + icon(r[0]) + "<div><b>" + esc(r[1]) + "</b>" + (r[2] ? "<span>" + esc(r[2]) + "</span>" : "") + "</div></li>"; }).join(""); $("#lpKosher").hidden = false; }
    $(".bookcard .from").innerHTML = l.from_price ? "From " + money(l.from_price) + " <small>a night</small>" : "Add dates <small>for the total price</small>";
    var g = $("#bkGuests"); while (g.options.length > l.max_guests) g.remove(g.options.length - 1);
    window.STAY = {id: +l.id, slug: l.slug, max_guests: l.max_guests, cleaning_fee: +l.cleaning_fee || 0, weekly_discount_pct: l.weekly_discount_pct || 0, monthly_discount_pct: l.monthly_discount_pct || 0, lat: l.lat, lng: l.lng};
    load("/assets/stay.js"); load("/assets/stay-page.js");
  })
  .catch(function(){ fail("This home isn't available right now."); });
})();
