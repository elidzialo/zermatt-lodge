/* Book Homes host shell (/host): navigation, Today and Menu.
   Data comes from host.js through "bh:host" events ({type: "me"} and {type: "bookings"}), and the account
   (email, admin) from bh-ui.js through "bh:account". No API calls of its own. See docs/HOST-TEAM.md. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="/assets/bh-icons.svg#i-' + n + '"/></svg>'; }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP", maximumFractionDigits: 0}).format((p || 0) / 100); }
function ukToday(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()); }
function days(a, b){ return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5); }
var fmtS = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"});
function d(s){ return s ? fmtS.format(new Date(s + "T00:00:00Z")) : ""; }

/* ---------- navigation ---------- */
function go(tab){
  var b = $('.hp-top nav.tabs button[data-tab="' + tab + '"]');
  if (b){ b.click(); }
}
document.addEventListener("click", function(e){
  var g = e.target.closest && e.target.closest("[data-go]");
  if (g){ e.preventDefault(); go(g.getAttribute("data-go")); var l = g.closest(".umlist"); if (l){ l.hidden = true; var ub = $('[aria-controls="' + l.id + '"]'); if (ub) ub.setAttribute("aria-expanded", "false"); } return; }
  var t = e.target.closest && e.target.closest(".hp-top nav.tabs button");
  if (t){ window.scrollTo(0, 0); try { sessionStorage.setItem("bh_host_tab", t.getAttribute("data-tab")); } catch (err) {} return; }
  // Whole listing card opens the editor (its main button), except when a button or link inside was used
  var card = e.target.closest && e.target.closest(".lcard");
  if (card && !e.target.closest("button, a, code, input")){ var main = card.querySelector("[data-edit], [data-calfor]"); if (main) main.click(); }
});
// Show the dashboard nav only on the dashboard (not on log in, 2-step or profile screens)
var vDash = $("#vDash");
function dashState(){
  var on = vDash && !vDash.classList.contains("hidden");
  document.body.classList.toggle("dash-on", !!on);
}
if (vDash){ new MutationObserver(dashState).observe(vDash, {attributes: true, attributeFilter: ["class"]}); dashState(); }
// Return to the last tab after a refresh (same browser tab only)
var restored = false;
function restoreTab(){
  if (restored) return; restored = true;
  try { var last = sessionStorage.getItem("bh_host_tab"); if (last && last !== "today") go(last); } catch (e) {}
}

/* ---------- Today ---------- */
var ME = null, ROWS = null, FILTER = null;
function firstName(){ var n = (ME && ME.profile && ME.profile.name) || ""; return n.split(/\s+/)[0]; }
function head(){
  var n = firstName();
  $("#tdHi").textContent = n ? "Welcome back, " + n : "Welcome back";
  var today = ukToday(), paid = (ROWS || []).filter(function(b){ return b.status === "paid"; });
  var inn = paid.filter(function(b){ return b.check_in === today; }).length, out = paid.filter(function(b){ return b.check_out === today; }).length;
  var parts = [];
  if (inn) parts.push(inn + (inn === 1 ? " guest arrives" : " guests arrive") + " today");
  if (out) parts.push(out + (out === 1 ? " checkout" : " checkouts") + " today");
  $("#tdSub").textContent = new Intl.DateTimeFormat("en-GB", {weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London"}).format(new Date()) + (parts.length ? ". " + parts.join(", ") + "." : "");
}
function todo(){
  if (!ME) return;
  var out = [], ls = ME.listings || [];
  if (!ls.length) out.push({tone: "go", t: "Add your first home", s: "One question at a time, about 10 minutes.", btn: '<button type="button" class="btn sm" data-click="#newListing">Start</button>'});
  ls.forEach(function(l){
    if (l.legacy_source) return;
    if (l.status === "rejected") out.push({tone: "warn", t: "Changes needed: " + l.title, s: l.reject_reason || "We left a note on this listing.", btn: '<button type="button" class="btn sm" data-edit="' + l.id + '">Fix it</button>'});
    else if (l.status === "draft") out.push({tone: "go", t: "Finish your listing: " + l.title, s: "Pick up where you left off.", btn: '<button type="button" class="btn sm" data-edit="' + l.id + '">Continue</button>'});
  });
  // Payouts are not repeated here: the payouts line at the top of Today (host-payouts.js) already asks for them
  out.sort(function(a, b){ return (a.tone === "warn" ? 0 : 1) - (b.tone === "warn" ? 0 : 1); });
  $("#tdTodoWrap").classList.toggle("hidden", !out.length);
  $("#tdTodo").innerHTML = out.map(function(x){
    return '<div class="todo-i t-' + x.tone + '"><span class="todo-dot" aria-hidden="true"></span><span class="todo-tx"><b>' + esc(x.t) + "</b><small>" + esc(x.s) + "</small></span>" + x.btn + "</div>";
  }).join("");
}
document.addEventListener("click", function(e){ var c = e.target.closest && e.target.closest("[data-click]"); if (c){ var t = $(c.getAttribute("data-click")); if (t) t.click(); } });

function bucket(b, today){
  if (b.status !== "paid") return b.status === "held" ? "pending" : "cancelled";
  if (b.check_out === today) return "out";
  if (b.check_in === today) return "soon";
  if (b.check_in <= today && today < b.check_out) return "now";
  if (b.check_out < today) return "past";
  if (days(today, b.check_in) <= 7) return "soon";
  return "later";
}
var GROUPS = [["out", "Checking out"], ["now", "Currently hosting"], ["soon", "Arriving soon"], ["later", "Upcoming"], ["pending", "Paying now"], ["past", "Past"]];
function when(b, k, today){
  if (k === "out") return "Checks out today";
  if (k === "now"){ var left = days(today, b.check_out); return left === 1 ? "Checks out tomorrow" : "Checks out in " + left + " days"; }
  if (k === "past") return "Stayed " + d(b.check_in);
  if (k === "pending") return "Guest is paying now";
  if (k === "cancelled") return "Cancelled";
  var n = days(today, b.check_in);
  return n === 0 ? "Arrives today" : n === 1 ? "Arrives tomorrow" : "Arrives in " + n + " days";
}
function reservations(){
  if (!ROWS) return;
  $("#bkList").hidden = true;
  var today = ukToday(), by = {};
  ROWS.forEach(function(b){ var k = bucket(b, today); (by[k] = by[k] || []).push(b); });
  var groups = GROUPS.filter(function(g){ return (by[g[0]] || []).length; });
  if (!FILTER || !(by[FILTER] || []).length) FILTER = (groups.filter(function(g){ return g[0] !== "past"; })[0] || groups[0] || [null])[0];
  $("#tdChips").innerHTML = groups.map(function(g){
    return '<button type="button" class="chip-b" aria-pressed="' + (g[0] === FILTER) + '" data-res="' + g[0] + '">' + g[1] + " (" + by[g[0]].length + ")</button>";
  }).join("");
  var list = (by[FILTER] || []).slice().sort(function(a, b){ return FILTER === "past" ? (a.check_in < b.check_in ? 1 : -1) : (a.check_in < b.check_in ? -1 : 1); });
  if (!list.length){
    $("#tdRes").innerHTML = '<div class="empty slim">' + icon("calendar") + "<h2>No reservations yet</h2><p>When a guest books, you'll see them here with their dates and phone number.</p></div>";
    return;
  }
  $("#tdRes").innerHTML = list.map(function(b){
    var k = bucket(b, today), tel = String(b.guest_phone || "").replace(/[^\d+]/g, "");
    var wa = tel ? "https://wa.me/" + tel.replace(/^\+/, "").replace(/^0/, "44") : "";
    return '<article class="rc rc-' + k + '"><p class="rc-when">' + esc(when(b, k, today)) + '</p>' +
      '<h3>' + esc(b.guest_name || "Guest") + '</h3>' +
      '<p class="rc-m">' + esc(d(b.check_in)) + " to " + esc(d(b.check_out)) + ", " + b.nights + (b.nights === 1 ? " night" : " nights") + ", " + b.guests + (b.guests === 1 ? " guest" : " guests") + "</p>" +
      '<p class="rc-l">' + esc(b.title || "") + "</p>" +
      '<div class="rc-f"><span class="rc-pay">' + (b.status === "paid" ? "You earn <b>" + money(b.host_payout_pence) + "</b>" : "") + "</span>" +
      (b.status === "paid" && tel ? '<span class="rc-acts"><a class="pill" href="tel:' + esc(tel) + '">' + icon("phone") + "Call</a>" + '<a class="pill" href="' + esc(wa) + '" target="_blank" rel="noopener">' + icon("chat") + "WhatsApp</a></span>" : "") +
      "</div></article>";
  }).join("");
}
document.addEventListener("click", function(e){ var c = e.target.closest && e.target.closest("[data-res]"); if (c){ FILTER = c.getAttribute("data-res"); reservations(); } });

function listingsSub(){
  if (!ME) return;
  var ls = ME.listings || [], live = ls.filter(function(l){ return l.status === "approved"; }).length;
  var el = $("#lsSub"); if (el) el.textContent = ls.length ? ls.length + (ls.length === 1 ? " home" : " homes") + ", " + live + " live. Tap a home to edit it." : "Tap a home to edit its photos, details, price and rules.";
}
function menuCard(){
  // Airbnb-style profile card: avatar, name, email and phone, then two plain facts (rebuilt each time host.js renders)
  var p = (ME && ME.profile) || {}, card = $("#profSummary");
  if (!card || !p.name) return;
  var ini = p.name.trim().split(/\s+/).map(function(w){ return w[0]; }).slice(0, 2).join("").toUpperCase();
  var facts = [p.trader_status === "private" ? "Private host" : "Business host"];
  if (p.company) facts.push(p.company);
  if (ME.commission_pct != null) facts.push(ME.commission_pct + "% commission");
  card.innerHTML = '<span class="me-av" aria-hidden="true">' + esc(ini) + "</span><b>" + esc(p.name) + "</b>" +
    '<p class="m">' + esc(p.email || "") + (p.phone ? "<br>" + esc(p.phone) + (p.whatsapp && p.whatsapp !== p.phone ? ", WhatsApp " + esc(p.whatsapp) : "") : "") + "</p>" +
    '<p class="me-facts">' + facts.map(function(f){ return "<span>" + esc(f) + "</span>"; }).join("") + "</p>";
}
document.addEventListener("bh:host", function(e){
  var x = e.detail || {};
  if (x.type === "me"){ ME = x.me; setTimeout(function(){ head(); todo(); listingsSub(); menuCard(); restoreTab(); }, 0); }
  if (x.type === "bookings"){ ROWS = x.rows || []; head(); reservations(); }
});

/* ---------- log in from a guest page (/host?next=/trips) ---------- */
(function(){
  var m = /[?&]next=([^&#]+)/.exec(location.search), next = m ? decodeURIComponent(m[1]) : "";
  if (!/^\/(trips|saved|trips\/messages)\/?$/.test(next)) return; // only our own guest pages
  var h = $("#vLogin h1"), lead = $("#vLogin .lead");
  if (h) h.textContent = "Log in";
  if (lead) lead.textContent = "Use the email you booked with to see your trips.";
  var gone = false;
  function check(){
    if (gone) return;
    var inn = ["#vDash", "#vProfile", "#vMfa", "#vEnrol"].some(function(s){ var el = $(s); return el && !el.classList.contains("hidden"); });
    if (inn){ gone = true; location.replace(next); }
  }
  ["#vDash", "#vProfile", "#vMfa", "#vEnrol"].forEach(function(s){ var el = $(s); if (el) new MutationObserver(check).observe(el, {attributes: true, attributeFilter: ["class"]}); });
  check();
})();

/* ---------- account: admin rows in Menu ---------- */
function acct(a){
  var admin = !!(a && a.admin);
  ["#mnAdmin", "#mnBug"].forEach(function(s){ var el = $(s); if (el) el.classList.toggle("hidden", !admin); });
}
document.addEventListener("bh:account", function(e){ acct(e.detail); });
if (window.BH_ACCOUNT) acct(window.BH_ACCOUNT);
})();
