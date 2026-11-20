/* Book Homes /trips: the signed-in guest's own bookings, read only.
   Data: public.bh_my_trips() (bookings made with the account's confirmed email). Token from bh-ui.js (window.BH_TOKEN). */
(function(){
"use strict";
var URL_ = "https://kddhkuwnkkjcnbjegsmc.supabase.co", KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
var $ = function(s){ return document.querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="/assets/bh-icons.svg#i-' + n + '"/></svg>'; }
function ukToday(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()); }
function days(a, b){ return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
var fDay = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
var fShort = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
function dd(s){ return fDay.format(new Date(s + "T00:00:00Z")); }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP", maximumFractionDigits: 0}).format((p || 0) / 100); }
function plural(n, w){ return n + " " + w + (n === 1 ? "" : "s"); }
function safePage(p){ return /^\/[a-z0-9\-\/]*$/i.test(p || "") ? p : "/"; }
function safeImg(u){ return /^https:\/\//.test(u || "") ? u : ""; }
function tel(p){ return String(p || "").replace(/[^\d+]/g, ""); }

function when(t, today){
  var n = days(today, t.check_in);
  if (t.check_in <= today && today < t.check_out) return "Staying now, checkout " + (days(today, t.check_out) === 1 ? "tomorrow" : "in " + days(today, t.check_out) + " days");
  if (t.check_out === today) return "Checkout today";
  return n === 0 ? "Check-in today" : n === 1 ? "Check-in tomorrow" : "In " + n + " days";
}
function photo(t){
  var u = safeImg(t.photo);
  return '<div class="tr-ph">' + (u ? '<img src="' + esc(u) + '" alt="" loading="lazy">' : icon("home")) + "</div>";
}
function bigCard(t, today){
  var ph = tel(t.host_phone), wa = tel(t.host_whatsapp);
  var waUrl = wa ? "https://wa.me/" + wa.replace(/^\+/, "").replace(/^0/, "44") : "";
  return '<article class="tr-card">' + photo(t) + '<div class="tr-in">' +
    '<p class="tr-when">' + esc(when(t, today)) + "</p>" +
    '<h3><a href="' + esc(safePage(t.page)) + '">' + esc(t.title || "Your stay") + "</a></h3>" +
    (t.area ? '<p class="tr-area">' + esc(t.area) + "</p>" : "") +
    '<div class="tr-dates"><div><small>Check-in</small><b>' + esc(dd(t.check_in)) + "</b>" + (t.check_in_time ? "<small>From " + esc(t.check_in_time.slice(0, 5)) + "</small>" : "") + "</div>" +
    "<div><small>Checkout</small><b>" + esc(dd(t.check_out)) + "</b>" + (t.check_out_time ? "<small>By " + esc(t.check_out_time.slice(0, 5)) + "</small>" : "") + "</div></div>" +
    '<p class="tr-meta">' + plural(t.nights, "night") + ", " + plural(t.guests, "guest") + (t.amount_pence ? ", " + money(t.amount_pence) + " paid" : "") + "</p>" +
    '<div class="tr-host"><span>Hosted by <b>' + esc(t.host_name || "your host") + "</b></span>" +
    (ph ? '<a class="tr-pill" href="tel:' + esc(ph) + '">' + icon("phone") + "Call</a>" : "") +
    (waUrl ? '<a class="tr-pill" href="' + esc(waUrl) + '" target="_blank" rel="noopener">' + icon("chat") + "WhatsApp</a>" : "") +
    '<a class="tr-pill" href="' + esc(safePage(t.page)) + '">View home</a></div>' +
    "</div></article>";
}
function mini(t){
  var y = fShort.format(new Date(t.check_in + "T00:00:00Z"));
  return '<a class="tr-mini" href="' + esc(safePage(t.page)) + '">' + photo(t) + "<b>" + esc(t.title || "Your stay") + "</b>" +
    "<small>" + esc(y) + ", " + plural(t.nights, "night") + "</small>" +
    (t.status === "cancelled" ? '<span class="tr-x">Cancelled</span>' : "") + "</a>";
}
function show(id, on){ var el = $(id); if (el) el.hidden = !on; }
function render(rows, email){
  var today = ukToday(), body = $("#trBody");
  var up = rows.filter(function(t){ return t.status === "paid" && t.check_out >= today; }).sort(function(a, b){ return a.check_in < b.check_in ? -1 : 1; });
  var past = rows.filter(function(t){ return up.indexOf(t) < 0; }).sort(function(a, b){ return a.check_in < b.check_in ? 1 : -1; });
  if (!rows.length){ body.innerHTML = ""; $("#trEmail").textContent = email || "this email"; show("#trNone", true); show("#trHelp", true); return; }
  body.innerHTML =
    (up.length ? '<h2 class="tr-h">Upcoming</h2><div class="tr-up">' + up.map(function(t){ return bigCard(t, today); }).join("") + "</div>"
               : '<div class="tr-empty" style="padding:32px 16px"><h2>No upcoming trips</h2><p>Time to plan your next stay.</p><a class="btn" href="/">Find a home</a></div>') +
    (past.length ? '<h2 class="tr-h">Past trips</h2><div class="tr-grid">' + past.map(mini).join("") + "</div>" : "");
  show("#trHelp", true);
}
function fail(){
  $("#trBody").innerHTML = '<div class="tr-empty"><h2>We couldn\'t load your trips</h2><p>Check your connection and try again. Your confirmation email has all the details too.</p><button type="button" class="btn" id="trRetry">Try again</button></div>';
}
function load(){
  if (typeof window.BH_TOKEN !== "function"){ fail(); return; }
  window.BH_TOKEN().then(function(tok){
    if (!tok){ $("#trBody").innerHTML = ""; show("#trOut", true); return; }
    var email = (window.BH_ACCOUNT && window.BH_ACCOUNT.email) || "";
    return fetch(URL_ + "/rest/v1/rpc/bh_my_trips", {method: "POST", headers: {"Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + tok}, body: "{}"})
      .then(function(r){ if (!r.ok) throw new Error("trips " + r.status); return r.json(); })
      .then(function(rows){ render(Array.isArray(rows) ? rows : [], email); });
  }).catch(fail);
}
document.addEventListener("click", function(e){
  if (e.target.closest && e.target.closest("#trRetry")){ $("#trBody").innerHTML = '<div class="tr-sk" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></div>'; load(); }
});
// bh-ui.js (loaded after this file) provides the token; wait for it briefly
var tries = 0;
(function start(){ if (typeof window.BH_TOKEN === "function" || ++tries > 60) load(); else setTimeout(start, 50); })();
})();
