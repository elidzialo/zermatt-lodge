/* Fallback listing page for homes approved since the last site build (/<slug> -> /stays/listing/).
   Loads the approved listing from the API, fills the page, then starts the normal booking code. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(n){ n = +n || 0; return "£" + (n % 1 ? n.toFixed(2) : n); }
function plural(n, w){ n = +n || 0; return n + " " + w + (n === 1 ? "" : "s"); }
var LABELS = {wifi:"Wifi",parking:"Free parking",kitchen:"Kitchen",washer:"Washing machine",dryer:"Tumble dryer",tv:"TV",heating:"Heating",aircon:"Air conditioning",garden:"Garden",workspace:"Dedicated workspace",cot:"Cot",highchair:"High chair",bath:"Bath",ev_charger:"EV charger",pool_table:"Pool table",bbq:"BBQ",self_checkin:"Self check-in",step_free:"Step-free entrance",dishwasher:"Dishwasher",coffee:"Coffee maker",iron:"Iron",hairdryer:"Hairdryer",fireplace:"Fireplace",pets:"Pets allowed",hot_tub:"Hot tub"};
var POLICY = {flexible: "Flexible: full refund up to 24 hours before check-in.", moderate: "Moderate: full refund up to 5 days before check-in, 50% refund after that, no refund after check-in.", strict: "Strict: full refund up to 14 days before check-in, 50% refund up to 7 days before, no refund after that."};
var path = location.pathname.replace(/\/+$/, "");
var slug = (path.match(/^\/(?:stays\/)?([a-z0-9-]+)$/) || [])[1] || new URLSearchParams(location.search).get("slug") || "";
function load(src){ var s = document.createElement("script"); s.src = src; document.body.appendChild(s); }
function fail(msg){
  document.title = "Not found | Book Homes";
  $("#lpTitle").textContent = msg;
  $(".lp-grid").innerHTML = '<p style="padding:24px 0 64px"><a class="btn" href="/">See all homes</a></p>';
  $(".lp-full").style.display = "none"; $("#gal").style.display = "none"; $("#mbook").style.display = "none";
}
/* Host preview (/stays/listing?preview=1): the host editor puts the draft in localStorage, so the host sees exactly this page. Booking is off. */
var PREVIEW = /[?&]preview=1(&|$)/.test(location.search);
function previewData(){ return new Promise(function(res, rej){ try { var j = JSON.parse(localStorage.getItem("bh_listing_preview") || "null"); if (j && j.listing) res(j); else rej(new Error("none")); } catch (e) { rej(e); } }); }
if (!PREVIEW && (!slug || slug === "listing")){ fail("This page could not be found."); return; }
function get(s){ return fetch("/api/bh/listings?action=get&slug=" + encodeURIComponent(s), {headers: {"Accept": "application/json"}}).then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); }); }
(PREVIEW ? previewData() : get(slug).catch(function(e){ if (/-liverpool$/.test(slug)) return get(slug.replace(/-liverpool$/, "")); throw e; }))
  .then(function(j){
    var l = j.listing;
    if (l.legacy_source && l.page_url && l.page_url !== "/" && l.page_url !== path){ location.replace(l.page_url); return; }
    document.title = l.title + " | Book Homes";
    var where = [String(l.area || "").split(",")[0].trim(), l.city].filter(Boolean).join(", ");
    $("#lpTitle").textContent = l.title;
    $("#lpSub").textContent = "Entire " + (l.property_type || "home") + (where ? " in " + where : "");
    var ph = l.photos || [];
    $("#galTrack").innerHTML = ph.map(function(p, i){ return '<button type="button" class="gt" data-lb="' + i + '" aria-label="Open photo ' + (i + 1) + '"><img src="' + esc(p.url) + '" alt="' + esc(p.caption || l.title) + '" width="1080" height="720"' + (i ? ' loading="lazy"' : "") + "></button>"; }).join("");
    if (ph.length < 5) $("#gal").classList.add("gal-few");
    $("#galCount").textContent = "1 / " + ph.length;
    $("#lbg").innerHTML = ph.map(function(p, i){ return '<img id="lbp' + i + '" src="' + esc(p.url) + '" alt="' + esc(p.caption || l.title) + '" loading="lazy">'; }).join("");
    $("#lpFacts").textContent = plural(l.max_guests, "guest") + " · " + plural(l.bedrooms, "bedroom") + " · " + plural(l.beds, "bed") + " · " + plural(+l.baths, "bath");
    $("#lpAv").textContent = (l.host_name || "H").charAt(0).toUpperCase();
    $("#lpHost").textContent = "Hosted by " + (l.host_name || "your host");
    $("#lpDisc").textContent = l.trader_status === "private"
      ? "Hosted by a private individual. Your contract for the stay is with the host. UK consumer rights that apply to businesses may not apply when you book from a private host. Book Homes is the booking platform."
      : "Hosted by a business (trader). Your contract for the stay is with the host. Book Homes is the booking platform.";
    var paras = String(l.description || "").split(/\n+/).filter(Boolean).map(function(p){ return "<p>" + esc(p) + "</p>"; }).join("");
    $("#aboutTxt").innerHTML = paras; $("#aboutFull").innerHTML = paras;
    var am = (l.amenities || []).filter(function(a){ return LABELS[a]; });
    if (am.length){ $("#lpAmen").innerHTML = am.map(function(a){ return "<li>" + icon(a) + "<span>" + esc(LABELS[a]) + "</span></li>"; }).join(""); $("#lpAmenWrap").hidden = false; }
    var k = l.kosher || {}, sh = k.shabbat || {}, rows = [];
    if (k.kitchen) rows.push(["kosher", "Kosher kitchen", k.kitchen_type || ""]);
    if (k.supervision) rows.push(["check", "Kashrut, in the host's words", k.supervision]);
    [["hotplate","Shabbat hot plate or blech"],["urn","Shabbat urn"],["lamp_timers","Shabbat lamp or timers"],["non_electric_key","Non-electric key or keypad override"],["no_motion_sensors","No motion-sensor lights"]].forEach(function(x){ if (sh[x[0]]) rows.push(["shabbat", x[1], ""]); });
    if (k.shul_name || k.shul_walk_mins) rows.push(["shul", "Nearest shul: " + (k.shul_name || "ask the host"), k.shul_walk_mins ? "About " + k.shul_walk_mins + " minutes' walk" : ""]);
    if (k.eruv === "yes") rows.push(["eruv", "Inside an eruv", ""]);
    if (k.kosher_shops) rows.push(["shop", "Kosher shops and restaurants nearby", k.kosher_shops]);
    if (k.mikvah) rows.push(["water", "Mikvah", k.mikvah]);
    if (rows.length){ $("#lpKosherList").innerHTML = rows.map(function(r){ return "<li>" + icon(r[0]) + "<div><b>" + esc(r[1]) + "</b>" + (r[2] ? "<span>" + esc(r[2]) + "</span>" : "") + "</div></li>"; }).join(""); $("#lpKosher").hidden = false; }
    var rules = [["clock", "Check-in after " + (l.check_in_time || "15:00")], ["clock", "Checkout before " + (l.check_out_time || "11:00")], ["users", l.max_guests + " guests maximum"]];
    if (l.house_rules) rules.push(["list", l.house_rules]);
    $("#lpRules").innerHTML = rules.map(function(r){ return "<li>" + icon(r[0]) + "<span>" + esc(r[1]) + "</span></li>"; }).join("");
    $("#lpPolicy").textContent = POLICY[l.cancellation_policy] || POLICY.moderate;
    var cp = $("#cardPrice"); cp.setAttribute("data-from", l.from_price ? money(l.from_price) : "");
    cp.innerHTML = l.from_price ? '<span class="from">From</span> <b>' + money(l.from_price) + "</b> <span>night</span>" : "<b>Add dates</b> <span>for prices</span>";
    $("#lpSave").setAttribute("data-save", l.id);
    var g = $("#bkGuests"); while (g.options.length > l.max_guests) g.remove(g.options.length - 1);
    window.STAY = {id: +l.id, slug: l.slug, max_guests: l.max_guests, cleaning_fee: +l.cleaning_fee || 0, weekly_discount_pct: l.weekly_discount_pct || 0, monthly_discount_pct: l.monthly_discount_pct || 0, lat: l.lat, lng: l.lng, legacy: false, from_price: l.from_price, title: l.title, pets_allowed: !!l.pets_allowed, pet_fee: +l.pet_fee || 0, checkout_days: l.checkout_days || [], checkin_days: l.checkin_days || []};
    if (l.pets_allowed && !document.getElementById("bkPets")){
      var gl = document.getElementById("bkGuests").closest("label"), pl = document.createElement("label");
      pl.className = "f f-pets"; pl.innerHTML = "<small>Pets" + (+l.pet_fee ? " (£" + (+l.pet_fee) + " a stay)" : "") + '</small><select id="bkPets" name="pets"><option value="0">No pets</option><option value="1">1 pet</option><option value="2">2 pets</option><option value="3">3 pets</option></select>';
      gl.parentNode.insertBefore(pl, gl.nextSibling);
    }
    if (PREVIEW){
      document.title = "Preview: " + l.title + " | Book Homes";
      var bar = document.createElement("div");
      bar.setAttribute("role", "status");
      bar.style.cssText = "position:sticky;top:0;z-index:60;background:#fff4e5;color:#7a4b00;font:600 14px/1.4 Inter,system-ui,sans-serif;padding:10px 16px;text-align:center;border-bottom:1px solid #f0d9b5";
      bar.textContent = "Preview: this is how guests see your listing. Booking is switched off here.";
      document.body.insertBefore(bar, document.body.firstChild);
      $("#bookcard").querySelectorAll("input,select,button,textarea").forEach(function(x){ x.disabled = true; });
      var mb = $("#mbookBtn"); if (mb) mb.disabled = true;
      var mo = $("#months"); if (mo) mo.innerHTML = '<p class="bd-empty">Your availability calendar shows here once the listing is live.</p>';
      $$("a[href]").forEach(function(a){ if (!a.closest("#lpAmenWrap,#gal")) { a.addEventListener("click", function(e){ e.preventDefault(); }); } });
      load("/assets/stay-page.js");
      return;
    }
    load("/assets/stay.js"); load("/assets/stay-page.js"); load("/assets/checkout.js");
  })
  .catch(function(){ fail(PREVIEW ? "Open the preview again from your host dashboard." : "This page could not be found."); });
})();
