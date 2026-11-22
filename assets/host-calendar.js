/* Book Homes host Calendar (Airbnb-style). Owns #panel-calendar except the iCal sync box (host.js drawSync + click handlers).
   - Scrolling month grid (desktop: inner scroll next to a sticky side panel; phone: page scroll + bottom sheet).
   - Select a night or a range: click, click again for the end, drag, or shift-click. Touch: tap the first then the last night.
   - Selection panel: Available / Blocked, custom price (reset to base), minimum nights for arrivals, private note, Save / Cancel.
   - No selection: listing-wide pricing and availability rules, saved as you type (debounced), each with Undo.
   API (bookhomes-host): calendar, block, set_nights, save_listing. Months are fetched one at a time when they scroll near.
   host.js calls BHCal.open() (Calendar tab), BHCal.warm() (idle after boot) and BHCal.reload() (after an iCal change). */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function H(){ return window.BHHost; }
function api(body){ return H().api("bookhomes-host", body); }
function ukToday(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()); }
function addDays(s, n){ var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function shiftMonth(m, n){ var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + (mo < 9 ? "0" : "") + (mo + 1); }
function daysBetween(a, b){ return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
function isoDow(s){ return (new Date(s + "T00:00:00Z").getUTCDay() + 6) % 7; } // 0 = Mon
var fmtMonth = new Intl.DateTimeFormat("en-GB", {month: "long", year: "numeric", timeZone: "UTC"});
var fmtDay = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", timeZone: "UTC"});
var fmtShort = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", timeZone: "UTC"});
function mName(m){ return fmtMonth.format(new Date(m + "-01T00:00:00Z")); }
function dLong(s){ return fmtDay.format(new Date(s + "T00:00:00Z")); }
function dShort(s){ return fmtShort.format(new Date(s + "T00:00:00Z")); }
function gbp(v){ return v == null || v === "" || isNaN(v) ? "" : "£" + (Math.round(v * 100) % 100 ? (+v).toFixed(2) : Math.round(v)); }
function desk(){ return window.matchMedia("(min-width:860px)").matches; }

var MAX_AHEAD = 24, FIRST_SPAN = 13;
var C = null; // state for the listing on screen
function fresh(id){
  return {id: id, start: ukToday().slice(0, 7), span: FIRST_SPAN, loaded: {}, loading: {}, days: {}, ov: {}, bookings: {}, feeds: {}, blocks: [],
    settings: null, legacy: false, a: null, b: null, mode: "set", seq: 0};
}
var today = ukToday();

/* ---------- data ---------- */
function cacheKey(id, m){ return "cal:" + id + ":" + m; }
function fetchMonth(m, force){
  var id = C.id, key = cacheKey(id, m), hit = window.HP && HP.get(key);
  if (hit && !C.loaded[m]){ merge(m, hit.v); drawMonth(m); }
  if (!force && hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.v);
  if (C.loading[m]) return C.loading[m];
  var from = m + "-01", to = shiftMonth(m, 1) + "-01", t = ukToday();
  var p = api({action: "calendar", listing_id: id, from: from < t ? t : from, to: to}).then(function(j){
    if (window.HP) HP.put(key, j);
    if (!C || C.id !== id) return j;
    delete C.loading[m]; merge(m, j); drawMonth(m); if (C.mode === "set" && !C.a) drawSettings(); return j;
  }, function(e){ if (C && C.id === id){ delete C.loading[m]; var sec = $('[data-m="' + m + '"] .hc-err'); if (sec) sec.textContent = e.message; } throw e; });
  C.loading[m] = p;
  return p;
}
function merge(m, j){
  var from = m + "-01", to = shiftMonth(m, 1) + "-01";
  (j.days || []).forEach(function(d){ C.days[d.date] = {s: d.status, p: d.price, m: d.min_stay}; });
  Object.keys(C.ov).forEach(function(k){ if (k >= from && k < to) delete C.ov[k]; });
  (j.overrides || []).forEach(function(o){ C.ov[o.date] = {p: o.price, closed: !!o.closed, m: o.min_stay, note: o.note || ""}; });
  var seen = {};
  (j.bookings || []).forEach(function(b){ seen[b.id] = 1; C.bookings[b.id] = b; });
  Object.keys(C.bookings).forEach(function(k){ var b = C.bookings[k]; if (!seen[k] && b.check_out >= from && b.check_in < to) delete C.bookings[k]; });
  C.feeds[m] = j.feeds || [];
  C.blocks = C.blocks.filter(function(b){ return b.end_date < from; }).concat(j.blocks || []);
  if (j.settings) C.settings = j.settings;
  C.legacy = !!(j.legacy || j.prices_managed_elsewhere);
  C.loaded[m] = true;
}
function allFeeds(){
  var out = [], seen = {};
  Object.keys(C.feeds).forEach(function(m){ C.feeds[m].forEach(function(f){ var k = f.start_date + f.end_date + f.name; if (!seen[k]){ seen[k] = 1; out.push(f); } }); });
  return out;
}
function hostBlocked(s){
  var o = C.ov[s]; if (o && o.closed) return true;
  for (var i = 0; i < C.blocks.length; i++){ var b = C.blocks[i]; if (b.start_date <= s && s < b.end_date) return true; }
  return false;
}
function bookingOn(s){ var k = Object.keys(C.bookings); for (var i = 0; i < k.length; i++){ var b = C.bookings[k[i]]; if (b.check_in <= s && s < b.check_out) return b; } return null; }
function feedOn(s){ var f = allFeeds(); for (var i = 0; i < f.length; i++){ if (f[i].start_date <= s && s < f[i].end_date) return f[i]; } return null; }
function listing(){ var me = H() && H().me(); return ((me && me.listings) || []).filter(function(l){ return +l.id === +C.id; })[0] || null; }
function sett(){
  if (C.settings) return C.settings;
  var l = listing() || {};
  return {base_price: l.base_price, weekend_price: l.weekend_price, cleaning_fee: l.cleaning_fee, weekly_discount_pct: l.weekly_discount_pct, monthly_discount_pct: l.monthly_discount_pct,
    min_nights: l.min_nights, max_nights: l.max_nights, max_guests: l.max_guests, guests_included: l.guests_included, extra_guest_fee: l.extra_guest_fee,
    advance_notice_days: l.advance_notice_days, prep_days: l.prep_days, booking_window_days: l.booking_window_days, same_day_cutoff_hour: null};
}
function defaultPrice(s){ var st = sett(), w = isoDow(s); return (w === 4 || w === 5) && st.weekend_price != null ? +st.weekend_price : st.base_price != null ? +st.base_price : null; }

// saves and undos run one after another, so an Undo never overtakes the save it undoes
var Q = Promise.resolve();
function queue(f){ var p = Q.then(f, f); Q = p.catch(function(){}); return p; }

/* ---------- drawing ---------- */
function shell(){
  var html = "";
  for (var i = 0; i < C.span; i++){
    var m = shiftMonth(C.start, i);
    html += '<section class="hc-m" data-m="' + m + '"><h3>' + esc(mName(m)) + '</h3><div class="hc-g"></div><p class="hc-err" role="alert"></p></section>';
  }
  $("#hcMonths").innerHTML = html;
  for (var k = 0; k < C.span; k++) drawMonth(shiftMonth(C.start, k));
  observe();
}
function drawMonth(m){
  var sec = $('[data-m="' + m + '"] .hc-g'); if (!sec) return;
  var first = m + "-01", nextFirst = shiftMonth(m, 1) + "-01", last = addDays(nextFirst, -1), lead = isoDow(first), html = "", loaded = C.loaded[m];
  var bars = [], bk = Object.keys(C.bookings).map(function(k){ var b = C.bookings[k]; return {a: b.check_in, z: b.check_out, t: String(b.guest_name || "Guest").trim().split(/\s+/)[0] || "Guest", c: b.status === "held" ? "held" : "bk", n: b.guests}; })
    .concat(allFeeds().map(function(f){ return {a: f.start_date, z: f.end_date, t: f.name || "Booked", c: "feed"}; }));
  var d = addDays(first, -lead);
  while (d <= last){
    var wk = '<div class="hc-wk">', wkEnd = addDays(d, 6);
    for (var c = 0; c < 7; c++){
      var s = addDays(d, c);
      if (s < first || s > last){ wk += '<span class="hc-d x" aria-hidden="true"></span>'; continue; }
      var day = C.days[s], o = C.ov[s], past = s < today, cls = "hc-d", price = day && day.p != null ? day.p : null, lab = "";
      var booked = !past && (bookingOn(s) || (day && day.s === "reserved"));
      if (past) cls += " past";
      else if (!loaded) cls += " ld";
      else if (booked) cls += " bkd";
      else if (day && day.s === "blocked") cls += hostBlocked(s) ? " blk" : " rule";
      if (s === today) cls += " today";
      if (o && o.p != null) cls += " cust";
      if (inSel(s)) cls += selEdge(s);
      lab = dLong(s) + (booked ? ", booked" : day && day.s === "blocked" ? ", blocked" : "") + (price != null ? ", " + gbp(price) : "");
      wk += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (past ? " disabled" : "") + ' aria-label="' + esc(lab) + '"' + (inSel(s) ? ' aria-pressed="true"' : "") + '><span class="n">' + (+s.slice(8)) + "</span>" +
        (o && o.note ? '<i class="nt" title="' + esc(o.note) + '"></i>' : "") +
        (!past && loaded && !booked && price != null ? '<span class="p">' + gbp(price) + "</span>" : "") + "</button>";
    }
    // booking bars across this week (from the middle of check-in day to the middle of check-out day)
    bk.forEach(function(b){
      var visA = d < first ? first : d, visZ = wkEnd > last ? last : wkEnd;
      if (b.a > visZ || b.z < visA) return;
      if (b.z < today) return;
      var x0 = b.a >= visA ? daysBetween(d, b.a) + 0.5 : daysBetween(d, visA);
      var x1 = b.z <= visZ ? daysBetween(d, b.z) + 0.5 : daysBetween(d, visZ) + 1;
      if (x1 - x0 < 0.4) return;
      var startsHere = b.a >= visA, endsHere = b.z <= visZ;
      wk += '<span class="hc-bar ' + b.c + (startsHere ? " s" : "") + (endsHere ? " e" : "") + '" style="left:calc(' + (x0 * 100 / 7) + '% + 2px);width:calc(' + ((x1 - x0) * 100 / 7) + '% - 4px)">' + (x1 - x0 >= 0.9 ? esc(b.t) + (b.n && x1 - x0 >= 2 ? " · " + b.n : "") : "") + "</span>";
    });
    html += wk + "</div>";
    d = addDays(d, 7);
  }
  sec.innerHTML = html;
}
function redrawAll(){ for (var i = 0; i < C.span; i++) drawMonth(shiftMonth(C.start, i)); }
function monthsOf(lo, hi){ var out = [], m = lo.slice(0, 7); while (m <= hi.slice(0, 7)){ out.push(m); m = shiftMonth(m, 1); } return out; }

/* ---------- lazy month loading + month label ---------- */
var IO = null;
function scroller(){ return desk() ? $("#hcMonths") : null; }
function observe(){
  if (IO) IO.disconnect();
  if (!("IntersectionObserver" in window)){ for (var i = 0; i < 3; i++) fetchMonth(shiftMonth(C.start, i)).catch(function(){}); return; }
  IO = new IntersectionObserver(function(es){
    es.forEach(function(e){ if (!e.isIntersecting) return; var m = e.target.getAttribute("data-m"); fetchMonth(m).catch(function(){}); var nx = shiftMonth(m, 1); if ($('[data-m="' + nx + '"]')) fetchMonth(nx).catch(function(){});
      if (m >= shiftMonth(C.start, C.span - 2) && C.span < MAX_AHEAD) grow(); });
  }, {root: scroller(), rootMargin: "400px 0px"});
  $$(".hc-m").forEach(function(s){ IO.observe(s); });
}
function grow(){
  var from = C.span; C.span = Math.min(MAX_AHEAD, C.span + 6);
  var frag = "";
  for (var i = from; i < C.span; i++){ var m = shiftMonth(C.start, i); frag += '<section class="hc-m" data-m="' + m + '"><h3>' + esc(mName(m)) + '</h3><div class="hc-g"></div><p class="hc-err" role="alert"></p></section>'; }
  $("#hcMonths").insertAdjacentHTML("beforeend", frag);
  for (var k = from; k < C.span; k++){ var mm = shiftMonth(C.start, k); drawMonth(mm); if (IO) IO.observe($('[data-m="' + mm + '"]')); }
}
var labRaf = 0;
function currentMonth(){
  var secs = $$(".hc-m"), sc = scroller(), top = sc ? sc.getBoundingClientRect().top + 40 : (sticky() + 20), cur = secs[0];
  for (var i = 0; i < secs.length; i++){ if (secs[i].getBoundingClientRect().top <= top) cur = secs[i]; else break; }
  return cur ? cur.getAttribute("data-m") : C.start;
}
function onScroll(){ if (labRaf) return; labRaf = requestAnimationFrame(function(){ labRaf = 0; if (!C) return; var m = currentMonth(); $("#hcMonth").textContent = mName(m); $("#hcPrev").disabled = m <= C.start; }); }
function stickyTop(){ var t = $(".hp-top"); return t && /sticky|fixed/.test(getComputedStyle(t).position) ? t.offsetHeight : 0; }
// phones: the listing bar and the weekday row stick under the site header
function sticky(){
  var hc = $("#hc"); if (!hc) return 0;
  var a = stickyTop(), b = $(".hc-top").offsetHeight;
  hc.style.setProperty("--hc-top", a + "px"); hc.style.setProperty("--hc-dow", (a + b) + "px");
  return a + b + $(".hc-dow").offsetHeight;
}
function goMonth(m, smooth){
  var sec = $('[data-m="' + m + '"]'); if (!sec) return;
  var sc = scroller(), beh = smooth ? "smooth" : "auto";
  if (sc) sc.scrollTo({top: sec.offsetTop - 4, behavior: beh});
  else window.scrollTo({top: sec.getBoundingClientRect().top + window.pageYOffset - sticky() - 4, behavior: beh});
  $("#hcMonth").textContent = mName(m); $("#hcPrev").disabled = m <= C.start;
}

/* ---------- selection ---------- */
function range(){ if (!C || !C.a) return null; var b = C.b || C.a; return C.a <= b ? [C.a, b] : [b, C.a]; }
function inSel(s){ var r = range(); return !!r && s >= r[0] && s <= r[1]; }
function selEdge(s){ var r = range(); return " sel" + (s === r[0] ? " s0" : "") + (s === r[1] ? " s1" : ""); }
function paintSel(){
  var r = range();
  $$("#hcMonths .hc-d[data-d]").forEach(function(el){
    var s = el.getAttribute("data-d"), on = !!r && s >= r[0] && s <= r[1];
    el.classList.toggle("sel", on); el.classList.toggle("s0", on && s === r[0]); el.classList.toggle("s1", on && s === r[1]);
    if (on) el.setAttribute("aria-pressed", "true"); else el.removeAttribute("aria-pressed");
  });
}
function setSel(a, b){
  if (b && Math.abs(daysBetween(a, b)) > 365){ toast("Choose up to a year at a time."); return; }
  C.a = a; C.b = b || null; paintSel(); panel();
}
function clearSel(){ C.a = C.b = null; paintSel(); panel(); }

var drag = null, mouseUpAt = 0;
function dayFrom(e){ var t = e.target.closest && e.target.closest(".hc-d[data-d]"); return t && !t.disabled ? t.getAttribute("data-d") : null; }
function tap(s, shift){
  if (shift && C.a){ setSel(C.a, s); return; }
  if (C.a && !C.b && s !== C.a){ setSel(C.a, s); return; }
  if (C.a && !C.b && s === C.a){ clearSel(); return; }
  setSel(s, null);
}
function bindGrid(){
  var g = $("#hcMonths");
  g.addEventListener("pointerdown", function(e){
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    var s = dayFrom(e); if (!s) return;
    e.preventDefault();
    drag = {start: s, cur: s, moved: false, shift: e.shiftKey, prevA: C.a, prevB: C.b};
  });
  g.addEventListener("pointerover", function(e){
    if (!drag) return; var s = dayFrom(e); if (!s || s === drag.cur) return;
    drag.cur = s; drag.moved = true; C.a = drag.shift && drag.prevA ? drag.prevA : drag.start; C.b = s; paintSel();
  });
  document.addEventListener("pointerup", function(){
    if (!drag) return; var d = drag; drag = null; mouseUpAt = Date.now();
    if (d.moved){ setSel(C.a, C.b); return; }
    C.a = d.prevA; C.b = d.prevB; tap(d.start, d.shift);
  });
  g.addEventListener("click", function(e){
    if (Date.now() - mouseUpAt < 400) return; // handled by the mouse path
    var s = dayFrom(e); if (s) tap(s, e.shiftKey);
  });
}

/* ---------- side panel ---------- */
function openSheet(on, peek){ var sd = $("#hcSide"); sd.classList.toggle("open", !!on); sd.classList.toggle("peek", !!on && !!peek); document.body.classList.toggle("hc-sheet-on", !!on && !peek && !desk()); document.body.classList.toggle("hc-peek-on", !!on && !!peek && !desk()); }
function panel(){
  var on = !!C.a;
  $("#hcSel").classList.toggle("hidden", !on); $("#hcSet").classList.toggle("hidden", on); $("#hcSync").classList.toggle("hidden", on);
  C.mode = on ? "sel" : "set";
  // phones: one night tapped = a small bar (so the last night can still be tapped); a range = the full sheet
  if (on){ drawSel(); openSheet(true, !desk() && !C.b); }
  else { drawSettings(); if (!SETOPEN) openSheet(false); }
}
var SETOPEN = false;
var SEL = null; // values the selection panel opened with
function drawSel(){
  var r = range(), lo = r[0], hi = r[1], n = daysBetween(lo, hi) + 1, st = sett(), legacy = C.legacy;
  var blocked = 0, rule = 0, booked = 0, prices = {}, mins = {}, notes = {}, cust = 0, missing = 0;
  for (var s = lo; s <= hi; s = addDays(s, 1)){
    var d = C.days[s], o = C.ov[s] || {};
    if (!d) missing++;
    if (hostBlocked(s)) blocked++; else if (d && d.s === "blocked") rule++;
    if (bookingOn(s) || (d && d.s === "reserved")) booked++;
    prices[d && d.p != null ? d.p : ""] = 1; mins[o.m != null ? o.m : ""] = 1; notes[o.note || ""] = 1; if (o.p != null) cust++;
  }
  var pk = Object.keys(prices), mk = Object.keys(mins), nk = Object.keys(notes);
  SEL = {lo: lo, hi: hi, avail: blocked === n ? "blocked" : blocked === 0 ? "available" : "", price: pk.length === 1 && pk[0] !== "" ? +pk[0] : null, mixedPrice: pk.length > 1,
    min: mk.length === 1 && mk[0] !== "" ? +mk[0] : null, mixedMin: mk.length > 1, note: nk.length === 1 ? nk[0] : "", mixedNote: nk.length > 1, cust: cust};
  var bks = Object.keys(C.bookings).map(function(k){ return C.bookings[k]; }).filter(function(b){ return b.check_in <= hi && b.check_out > lo; });
  var fds = allFeeds().filter(function(f){ return f.start_date <= hi && f.end_date > lo; });
  var info = bks.map(function(b){ return '<div class="hc-bk"><b>' + esc(String(b.guest_name || "Guest").split(" ")[0]) + "</b> · " + (b.guests ? b.guests + " guest" + (b.guests === 1 ? "" : "s") + " · " : "") + esc(dShort(b.check_in)) + " to " + esc(dShort(b.check_out)) + (b.status === "held" ? " · paying now" : "") + "</div>"; }).join("") +
    fds.map(function(f){ return '<div class="hc-bk feed"><b>Booked on ' + esc(f.name || "another site") + "</b> · " + esc(dShort(f.start_date)) + " to " + esc(dShort(f.end_date)) + "</div>"; }).join("");
  var base = st.base_price != null ? gbp(st.base_price) + (st.weekend_price != null ? ", Fri and Sat " + gbp(st.weekend_price) : "") : "not set";
  $("#hcSel").innerHTML =
    '<div class="hc-sh"><div><b>' + esc(n === 1 ? dLong(lo) : dShort(lo) + " to " + dShort(hi)) + "</b><small>" + n + " night" + (n === 1 ? "" : "s") + (n > 1 ? ", last night " + esc(dLong(hi)) : "") + '</small></div><button type="button" class="link" id="hcClr">Clear</button></div>' +
    info +
    '<div class="hc-f"><span class="hc-l">Availability</span><div class="seg2 hc-seg" role="group" aria-label="Availability"><button type="button" data-av="available" aria-pressed="' + (SEL.avail === "available") + '">Available</button><button type="button" data-av="blocked" aria-pressed="' + (SEL.avail === "blocked") + '">Blocked</button></div>' +
      (SEL.avail === "" ? '<small class="hc-help">Some of these nights are blocked. Choose one to apply it to all.</small>' : "") +
      (booked ? '<small class="hc-help">' + booked + " booked night" + (booked === 1 ? " stays" : "s stay") + " booked whatever you choose.</small>" : "") +
      (rule ? '<small class="hc-help">' + rule + " night" + (rule === 1 ? " is" : "s are") + " closed by your availability rules (advance notice, preparation time or how far ahead guests can book).</small>" : "") + "</div>" +
    (legacy ? '<p class="hc-help hc-note">Zermatt Lodge prices and minimum stays come from your channel manager. Nights you block here also close there through the iCal link.</p>' :
      '<label class="hc-f"><span class="hc-l">Price per night</span><span class="hc-pin big">£<input type="number" id="hcSelPrice" min="10" max="10000" step="1" inputmode="numeric" value="' + (SEL.price != null ? Math.round(SEL.price) : "") + '" placeholder="' + (SEL.mixedPrice ? "Mixed" : "") + '"></span>' +
        '<small class="hc-help">Your base price: ' + esc(base) + "." + (SEL.cust ? ' <button type="button" class="link" id="hcReset">Reset to base price</button>' : "") + "</small></label>" +
      '<label class="hc-f"><span class="hc-l">Minimum nights</span><span class="hc-pin"><input type="number" id="hcSelMin" min="1" max="90" step="1" inputmode="numeric" value="' + (SEL.min != null ? SEL.min : "") + '" placeholder="' + (SEL.mixedMin ? "Mixed" : esc(st.min_nights != null ? st.min_nights + " (your usual)" : "")) + '"></span><small class="hc-help">For guests arriving on these dates. Leave empty to use your usual minimum.</small></label>' +
      '<label class="hc-f"><span class="hc-l">Private note</span><textarea id="hcSelNote" maxlength="500" rows="2" placeholder="' + (SEL.mixedNote ? "Different notes on these nights" : "Only you can see this") + '">' + esc(SEL.note) + "</textarea></label>") +
    '<div class="hc-peekrow"><small>Tap another night to select a range.</small><button type="button" class="btn sm" id="hcExpand">Edit</button></div>' +
    '<div class="hc-btns"><button type="button" class="btn ghost" id="hcCancel">Cancel</button><button type="button" class="btn" id="hcSave" disabled>Save</button></div><p class="hc-out" id="hcOut" aria-live="polite"></p>';
  SEL.reset = false; SEL.newAvail = SEL.avail;
}
function selChanges(){
  if (!SEL) return null;
  var ch = {}, p = $("#hcSelPrice"), mi = $("#hcSelMin"), no = $("#hcSelNote");
  if (SEL.newAvail && SEL.newAvail !== SEL.avail) ch.avail = SEL.newAvail;
  if (SEL.reset) ch.price = null;
  else if (p && p.value !== "" && (SEL.price == null || +p.value !== Math.round(SEL.price) || SEL.mixedPrice)) ch.price = +p.value;
  if (mi && mi.value !== (SEL.min != null ? String(SEL.min) : "")) ch.min_stay = mi.value === "" ? null : +mi.value;
  if (no && no.value !== SEL.note) ch.note = no.value.trim() === "" ? null : no.value.trim();
  return ch;
}
function selDirty(){ var c = selChanges(); var b = $("#hcSave"); if (b) b.disabled = !c || !Object.keys(c).length; }
function bindSel(){
  var box = $("#hcSel");
  box.addEventListener("click", function(e){
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    if (t.id === "hcClr" || t.id === "hcCancel"){ clearSel(); return; }
    if (t.hasAttribute("data-av")){ SEL.newAvail = t.getAttribute("data-av"); $$("[data-av]", box).forEach(function(b){ b.setAttribute("aria-pressed", b === t ? "true" : "false"); }); selDirty(); return; }
    if (t.id === "hcReset"){ SEL.reset = true; var p = $("#hcSelPrice"); p.value = ""; p.placeholder = "Base price"; t.textContent = "Will reset when you save"; selDirty(); return; }
    if (t.id === "hcSave") saveSel();
    if (t.id === "hcExpand") openSheet(true, false);
  });
  box.addEventListener("input", function(e){ if (e.target.id === "hcSelPrice") SEL.reset = false; selDirty(); });
  box.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target.tagName === "INPUT"){ e.preventDefault(); if (!$("#hcSave").disabled) saveSel(); } });
}

/* save a selection: optimistic, then the server, then refetch the touched months. Undo puts every night back as it was. */
function snapshot(lo, hi){
  var out = [];
  for (var s = lo; s <= hi; s = addDays(s, 1)){ var o = C.ov[s] || {}; out.push({d: s, blk: hostBlocked(s), p: o.p != null ? o.p : null, m: o.m != null ? o.m : null, note: o.note || null}); }
  return out;
}
function applyLocal(lo, hi, ch){
  for (var s = lo; s <= hi; s = addDays(s, 1)){
    var o = C.ov[s] || (C.ov[s] = {p: null, closed: false, m: null, note: ""}), d = C.days[s] || (C.days[s] = {s: "available", p: defaultPrice(s), m: null});
    if ("price" in ch){ o.p = ch.price; d.p = ch.price != null ? ch.price : defaultPrice(s); }
    if ("min_stay" in ch) o.m = ch.min_stay;
    if ("note" in ch) o.note = ch.note || "";
    if (ch.avail === "blocked"){ o.closed = true; if (d.s !== "reserved") d.s = "blocked"; }
    if (ch.avail === "available"){ o.closed = false; C.blocks = C.blocks.filter(function(b){ return !(b.start_date <= s && s < b.end_date); }); if (d.s === "blocked") d.s = "available"; }
  }
  monthsOf(lo, hi).forEach(drawMonth);
}
function send(lo, hi, ch){
  var id = C.id, rest = {}, calls = [];
  ["price", "min_stay", "note"].forEach(function(k){ if (k in ch) rest[k] = ch[k]; });
  if (ch.avail === "available") calls.push(function(){ return api(Object.assign({action: "set_nights", listing_id: id, start: lo, end: hi, open: true}, rest)); });
  else {
    if (ch.avail === "blocked") calls.push(function(){ return api({action: "block", listing_id: id, start: lo, end: hi, reason: "Host block"}); });
    if (Object.keys(rest).length) calls.push(function(){ return api(Object.assign({action: "set_nights", listing_id: id, start: lo, end: hi}, rest)); });
  }
  return queue(function(){ return calls.reduce(function(p, f){ return p.then(f); }, Promise.resolve()); });
}
function refetch(lo, hi){
  if (!C) return;
  var id = C.id;
  monthsOf(lo, hi).forEach(function(m){ if (window.HP) HP.drop(cacheKey(id, m)); if (C.loaded[m] || $('[data-m="' + m + '"]')) fetchMonth(m, true).catch(function(){}); });
}
function saveSel(){
  var ch = selChanges(); if (!ch || !Object.keys(ch).length) return;
  if ("price" in ch && ch.price !== null && !(ch.price >= 10 && ch.price <= 10000)){ $("#hcOut").textContent = "Enter a price from £10 to £10,000."; return; }
  if ("min_stay" in ch && ch.min_stay !== null && !(ch.min_stay >= 1 && ch.min_stay <= 90)){ $("#hcOut").textContent = "Minimum nights can be 1 to 90."; return; }
  if (C.legacy){ delete ch.price; delete ch.min_stay; delete ch.note; }
  if (!Object.keys(ch).length) return;
  var lo = SEL.lo, hi = SEL.hi, before = snapshot(lo, hi), n = daysBetween(lo, hi) + 1;
  applyLocal(lo, hi, ch); clearSel();
  var what = ch.avail === "blocked" ? "Blocked" : ch.avail === "available" ? "Opened" : "price" in ch ? (ch.price == null ? "Base price for" : "New price for") : "Saved";
  var label = what + " " + (n === 1 ? dShort(lo) : n + " nights");
  toast(label, function(){ return undo(lo, hi, ch, before); }, true);
  send(lo, hi, ch).then(function(){ toast(label, function(){ return undo(lo, hi, ch, before); }); refetch(lo, hi); },
    function(e){ toast("Not saved: " + e.message); refetch(lo, hi); });
}
function runs(list, key){
  var out = [];
  list.forEach(function(x){ var k = key(x), last = out[out.length - 1]; if (last && last.k === k && addDays(last.z, 1) === x.d){ last.z = x.d; } else out.push({k: k, a: x.d, z: x.d, x: x}); });
  return out;
}
function undo(lo, hi, ch, before){
  var calls = [], id = C.id;
  if (ch.avail === "blocked") runs(before.filter(function(x){ return !x.blk; }), function(){ return ""; }).forEach(function(r){ calls.push({action: "set_nights", listing_id: id, start: r.a, end: r.z, open: true}); });
  if (ch.avail === "available") runs(before.filter(function(x){ return x.blk; }), function(){ return ""; }).forEach(function(r){ calls.push({action: "block", listing_id: id, start: r.a, end: r.z, reason: "Host block"}); });
  var keys = ["price", "min_stay", "note"].filter(function(k){ return k in ch; });
  if (keys.length) runs(before, function(x){ return JSON.stringify([x.p, x.m, x.note]); }).forEach(function(r){
    var body = {action: "set_nights", listing_id: id, start: r.a, end: r.z};
    if (keys.indexOf("price") >= 0) body.price = r.x.p;
    if (keys.indexOf("min_stay") >= 0) body.min_stay = r.x.m;
    if (keys.indexOf("note") >= 0) body.note = r.x.note;
    calls.push(body);
  });
  if (calls.length > 40) return Promise.reject(new Error("Too many different nights to undo in one go."));
  // put the screen back at once
  before.forEach(function(x){
    var o = C.ov[x.d] || (C.ov[x.d] = {}), d = C.days[x.d];
    if ("price" in ch){ o.p = x.p; if (d) d.p = x.p != null ? x.p : defaultPrice(x.d); }
    if ("min_stay" in ch) o.m = x.m;
    if ("note" in ch) o.note = x.note || "";
    if (ch.avail){ o.closed = x.blk; if (d && d.s !== "reserved") d.s = x.blk ? "blocked" : "available"; }
  });
  monthsOf(lo, hi).forEach(drawMonth);
  return queue(function(){ return calls.reduce(function(p, b){ return p.then(function(){ return api(b); }); }, Promise.resolve()); }).then(function(){ refetch(lo, hi); }, function(e){ refetch(lo, hi); throw e; });
}

/* ---------- listing-wide settings (no selection) ---------- */
var F = [
  {k: "base_price", sec: "p", t: "Base price", h: "Per night. Friday and Saturday use the weekend price if you set one.", money: 1, min: 10, max: 10000, req: 1},
  {k: "weekend_price", sec: "p", t: "Weekend price", h: "Friday and Saturday nights. Leave empty to use the base price.", money: 1, min: 10, max: 10000},
  {k: "weekly_discount_pct", sec: "p", t: "Weekly discount", h: "For stays of 7 nights or more.", pct: 1, min: 0, max: 50},
  {k: "monthly_discount_pct", sec: "p", t: "Monthly discount", h: "For stays of 28 nights or more.", pct: 1, min: 0, max: 60},
  {k: "cleaning_fee", sec: "p", t: "Cleaning fee", h: "Once per stay.", money: 1, min: 0, max: 2000, zero: 1},
  {k: "extra_guest_fee", sec: "p", t: "Extra guest fee", h: "Per guest, per night.", money: 1, min: 0, max: 500, zero: 1},
  {k: "guests_included", sec: "p", t: "Charge it after", sel: "guests"},
  {k: "min_nights", sec: "a", t: "Minimum nights", min: 1, max: 90, req: 1, nights: 1},
  {k: "max_nights", sec: "a", t: "Maximum nights", min: 1, max: 365, req: 1, nights: 1},
  {k: "advance_notice_days", sec: "a", t: "Advance notice", h: "How much notice you need before a guest arrives.", sel: [[0, "Same day"], [1, "At least 1 day"], [2, "At least 2 days"], [3, "At least 3 days"], [7, "At least 7 days"]]},
  {k: "same_day_cutoff_hour", sec: "a", t: "Same-day bookings until", h: "Guests can book for tonight up to this time (UK time).", sel: [["", "Any time"], [12, "12:00"], [14, "14:00"], [16, "16:00"], [18, "18:00"], [20, "20:00"], [22, "22:00"]], when: function(st){ return +st.advance_notice_days === 0; }},
  {k: "prep_days", sec: "a", t: "Preparation time", h: "Nights kept free before and after each booking.", sel: [[0, "None"], [1, "1 night before and after"], [2, "2 nights before and after"], [3, "3 nights before and after"]]},
  {k: "booking_window_days", sec: "a", t: "Availability window", h: "How far ahead guests can book.", sel: [[90, "3 months ahead"], [180, "6 months ahead"], [270, "9 months ahead"], [365, "12 months ahead"], [730, "24 months ahead"]]}
];
function optsFor(f, st){
  var o = f.sel === "guests" ? [["", "Off"]].concat(Array.apply(null, Array(Math.max(1, +st.max_guests || 1))).map(function(_, i){ return [i + 1, (i + 1) + " guest" + (i ? "s" : "")]; })) : f.sel.slice();
  var v = st[f.k] == null ? "" : st[f.k];
  if (!o.some(function(x){ return String(x[0]) === String(v); })) o.push([v, f.k === "booking_window_days" ? v + " days ahead" : f.k === "advance_notice_days" ? "At least " + v + " days" : String(v)]);
  return o.map(function(x){ return '<option value="' + esc(x[0]) + '"' + (String(x[0]) === String(v) ? " selected" : "") + ">" + esc(x[1]) + "</option>"; }).join("");
}
function fieldHtml(f, st){
  if (f.when && !f.when(st)) return "";
  var v = st[f.k], id = "hcS_" + f.k, inner;
  if (f.sel) inner = '<select id="' + id + '" data-k="' + f.k + '">' + optsFor(f, st) + "</select>";
  else inner = '<span class="hc-pin">' + (f.money ? "£" : "") + '<input type="number" id="' + id + '" data-k="' + f.k + '" min="' + f.min + '" max="' + f.max + '" step="1" inputmode="numeric" value="' + (v == null ? "" : (f.money ? Math.round(v * 100) / 100 : v)) + '"' + (f.k === "weekend_price" ? ' placeholder="Same as base"' : "") + ">" + (f.pct ? "%" : f.nights ? "nights" : "") + "</span>";
  return '<label class="hc-r" for="' + id + '"><span><b>' + esc(f.t) + "</b>" + (f.h ? "<small>" + esc(f.h) + "</small>" : "") + "</span>" + inner + "</label>";
}
function drawSettings(){
  if (!C) return;
  var el = $("#hcSet"), st = sett(), l = listing();
  if (document.activeElement && el.contains(document.activeElement) && el.childNodes.length) return; // don't redraw under the cursor
  if (C.legacy){
    el.innerHTML = '<div class="hc-card"><h3>Prices and rules</h3><p class="m">Zermatt Lodge\'s prices, minimum stays and rules come from your channel manager (Guesty), so they are shown here but changed there. You can still block and open nights on this calendar.</p></div>';
    return;
  }
  el.innerHTML =
    '<div class="hc-card"><h3>Pricing</h3>' + F.filter(function(f){ return f.sec === "p"; }).map(function(f){ return fieldHtml(f, st); }).join("") + "</div>" +
    '<div class="hc-card"><h3>Availability</h3>' + F.filter(function(f){ return f.sec === "a"; }).map(function(f){ return fieldHtml(f, st); }).join("") + "</div>" +
    '<p class="hc-out" id="hcSetOut" aria-live="polite"></p>' +
    (l && l.status !== "approved" ? '<p class="hc-help">This listing is not live yet. Your calendar and prices are ready for when it is.</p>' : "");
}
var pend = {}, pendTimer = 0;
function fieldVal(f, raw){
  if (raw === "" || raw == null){ if (f.req) return {err: f.t + " is needed."}; return {v: f.zero ? 0 : null}; }
  var n = +raw; if (isNaN(n)) return {err: "Enter a number for " + f.t.toLowerCase() + "."};
  if (f.sel) return {v: n};
  if (n < f.min || n > f.max) return {err: f.t + " can be " + (f.money ? "£" : "") + f.min + " to " + (f.money ? "£" : "") + f.max + (f.pct ? "%" : "") + "."};
  return {v: f.money ? Math.round(n * 100) / 100 : Math.round(n)};
}
function bindSettings(){
  var el = $("#hcSet");
  var onEdit = function(e){
    var k = e.target.getAttribute && e.target.getAttribute("data-k"); if (!k) return;
    var f = F.filter(function(x){ return x.k === k; })[0], r = fieldVal(f, e.target.value), out = $("#hcSetOut");
    e.target.classList.toggle("bad", !!r.err);
    if (r.err){ out.textContent = r.err; delete pend[k]; return; }
    var st = sett();
    if (k === "max_nights" && r.v < +st.min_nights){ out.textContent = "Maximum nights can't be less than minimum nights."; e.target.classList.add("bad"); return; }
    if (k === "min_nights" && r.v > +st.max_nights){ out.textContent = "Minimum nights can't be more than maximum nights."; e.target.classList.add("bad"); return; }
    out.textContent = "";
    if (String(st[k] == null ? "" : st[k]) === String(r.v == null ? "" : r.v)){ delete pend[k]; return; }
    pend[k] = r.v;
    clearTimeout(pendTimer); pendTimer = setTimeout(flushSettings, e.type === "change" ? 150 : 800);
  };
  el.addEventListener("input", onEdit); el.addEventListener("change", onEdit);
  el.addEventListener("focusout", function(){ setTimeout(function(){ if (!el.contains(document.activeElement) && !Object.keys(pend).length) drawSettings(); }, 0); });
}
function patchListing(vals){
  C.settings = Object.assign({}, sett(), vals);
  var l = listing(); if (l) Object.keys(vals).forEach(function(k){ l[k] = vals[k]; });
  // prices on screen follow at once for nights without their own price
  if ("base_price" in vals || "weekend_price" in vals) Object.keys(C.days).forEach(function(s){ var o = C.ov[s]; if (!o || o.p == null) C.days[s].p = defaultPrice(s); });
}
function flushSettings(){
  clearTimeout(pendTimer);
  var vals = pend; pend = {};
  var keys = Object.keys(vals); if (!keys.length || !C) return;
  var st = sett(), before = {}; keys.forEach(function(k){ before[k] = st[k] == null ? null : st[k]; });
  var id = C.id, lab = keys.map(function(k){ return F.filter(function(f){ return f.k === k; })[0].t.toLowerCase(); }).join(", ");
  patchListing(vals); redrawAll();
  if ("advance_notice_days" in vals){ var ae = document.activeElement; if (ae) ae.blur(); drawSettings(); }
  var out = $("#hcSetOut"); if (out) out.textContent = "Saving...";
  queue(function(){ return api({action: "save_listing", id: id, listing: vals}); }).then(function(){
    if (!C || C.id !== id) return;
    var o = $("#hcSetOut"); if (o) o.textContent = "";
    toast("Saved " + lab, function(){
      patchListing(before); redrawAll(); drawSettings();
      return queue(function(){ return api({action: "save_listing", id: id, listing: before}); }).then(reloadData);
    });
    reloadData();
  }, function(e){ patchListing(before); redrawAll(); var o = $("#hcSetOut"); if (o) o.textContent = "Not saved: " + e.message; });
}
function reloadData(){ if (!C) return; var id = C.id; if (window.HP) HP.drop("cal:" + id + ":"); Object.keys(C.loaded).forEach(function(m){ fetchMonth(m, true).catch(function(){}); }); }

/* ---------- toast with undo ---------- */
var tTimer = 0, tUndo = null;
function toast(text, undoFn, quiet){
  var t = $("#hcToast"); $("#hcToastTx").textContent = text; tUndo = undoFn || null;
  $("#hcUndo").classList.toggle("hidden", !undoFn); t.classList.remove("hidden");
  clearTimeout(tTimer); tTimer = setTimeout(function(){ t.classList.add("hidden"); tUndo = null; }, quiet ? 9000 : 7000);
}

/* ---------- listing switcher ---------- */
var STATUS = {draft: "Draft", pending: "Waiting for approval", approved: "Live", rejected: "Changes needed", paused: "Paused"};
function photo(id){
  var me = H().me() || {}, ph = (me.photos || []).filter(function(x){ return String(x.listing_id) === String(id); })[0];
  if (!ph) return "";
  var u = ph.thumb_url || ph.url, src = window.HP && HP.thumb ? HP.thumb(u, 120) : u;
  return '<img src="' + esc(src) + '" alt="" loading="lazy">';
}
function drawPicker(){
  var me = H().me() || {}, ls = (me.listings || []).filter(function(l){ return l.status !== "archived"; }), l = listing();
  $("#hcListPh").innerHTML = l ? photo(l.id) : "";
  $("#hcListTitle").textContent = l ? l.title : "Calendar";
  $("#hcListSub").textContent = l ? (STATUS[l.status] || l.status) + (ls.length > 1 ? " · " + ls.length + " listings" : "") : "";
  $("#hcListBtn").disabled = ls.length < 2;
  $("#hcListMenu").innerHTML = ls.map(function(x){ return '<button type="button" role="option" data-lid="' + x.id + '" aria-selected="' + (+x.id === +C.id) + '"><span class="hc-lph">' + photo(x.id) + "</span><span class=\"hc-ltx\"><b>" + esc(x.title) + "</b><small>" + esc(STATUS[x.status] || x.status) + "</small></span></button>"; }).join("");
}
function menu(on){ $("#hcListMenu").classList.toggle("hidden", !on); $("#hcListBtn").setAttribute("aria-expanded", on ? "true" : "false"); }

/* ---------- open / switch ---------- */
function pickId(){ var v = +$("#calListing").value; if (v) return v; var me = H() && H().me(); var l = ((me && me.listings) || [])[0]; return l ? +l.id : 0; }
function open(){
  today = ukToday();
  var id = pickId();
  if (!id){ $("#hcMonths").innerHTML = '<div class="empty slim"><h2>No listings yet</h2><p>Add a listing first, then set its prices and open dates here.</p></div>'; $("#hcSet").innerHTML = ""; return; }
  if ($("#calListing").value !== String(id)) $("#calListing").value = id;
  var first = !C || C.id !== id || C.start !== today.slice(0, 7);
  if (first){ pend = {}; C = fresh(id); C.legacy = !!(listing() || {}).legacy_source; shell(); panel(); goMonth(C.start); }
  else { drawSettings(); }
  drawPicker();
  if (H().drawSync) H().drawSync();
  fetchMonth(C.start, !first).catch(function(){}); fetchMonth(shiftMonth(C.start, 1)).catch(function(){});
  onScroll();
}
function switchTo(id){
  if (Object.keys(pend).length) flushSettings();
  $("#calListing").value = id; C = null; SETOPEN = false; open();
}
window.BHCal = {
  open: open,
  reload: function(){ if (C) reloadData(); },
  warm: function(){
    var go = function(){ var id = pickId(); if (!id) return; var m = ukToday().slice(0, 7); if (!(window.HP && HP.get(cacheKey(id, m)))) H().api("bookhomes-host", {action: "calendar", listing_id: id, from: ukToday(), to: shiftMonth(m, 1) + "-01"}).then(function(j){ if (window.HP) HP.put(cacheKey(id, m), j); }).catch(function(){}); };
    if (window.requestIdleCallback) requestIdleCallback(go, {timeout: 2500}); else setTimeout(go, 1200);
  }
};

/* ---------- wiring ---------- */
function init(){
  if (!$("#hc")) return;
  bindGrid(); bindSel(); bindSettings();
  $("#hcMonths").addEventListener("scroll", onScroll, {passive: true});
  window.addEventListener("scroll", onScroll, {passive: true});
  $("#hcPrev").addEventListener("click", function(){ var m = currentMonth(); if (m > C.start) goMonth(shiftMonth(m, -1), true); });
  $("#hcNext").addEventListener("click", function(){ var m = shiftMonth(currentMonth(), 1); if (!$('[data-m="' + m + '"]') && C.span < MAX_AHEAD) grow(); goMonth(m, true); });
  $("#hcToday").addEventListener("click", function(){
    goMonth(C.start, true);
    var t = $('.hc-d[data-d="' + ukToday() + '"]'); if (t){ t.classList.remove("flash"); void t.offsetWidth; t.classList.add("flash"); }
  });
  $("#hcSetBtn").addEventListener("click", function(){ if (C && C.a) clearSel(); SETOPEN = true; drawSettings(); openSheet(true); });
  $("#hcSheetX").addEventListener("click", function(){ SETOPEN = false; if (C && C.a) clearSel(); else openSheet(false); });
  $("#hcUndo").addEventListener("click", function(){
    var f = tUndo; if (!f) return; tUndo = null; $("#hcUndo").classList.add("hidden"); $("#hcToastTx").textContent = "Undoing...";
    Promise.resolve().then(f).then(function(){ toast("Undone"); }, function(e){ toast("Couldn't undo: " + e.message); });
  });
  $("#hcListBtn").addEventListener("click", function(e){ e.stopPropagation(); menu($("#hcListMenu").classList.contains("hidden")); });
  $("#hcListMenu").addEventListener("click", function(e){ var b = e.target.closest("[data-lid]"); if (!b) return; menu(false); if (+b.getAttribute("data-lid") !== +C.id) switchTo(b.getAttribute("data-lid")); });
  document.addEventListener("click", function(e){ if (!e.target.closest || !e.target.closest(".hc-pick")) menu(false); });
  $("#calListing").addEventListener("change", function(){ switchTo($("#calListing").value); });
  document.addEventListener("keydown", function(e){
    if (e.key !== "Escape" || !C) return;
    if (!$("#hcListMenu").classList.contains("hidden")){ menu(false); return; }
    if (C.a && !(e.target.closest && e.target.closest("#hcSel textarea, #hcSel input"))) clearSel();
    else if (SETOPEN){ SETOPEN = false; openSheet(false); }
  });
  window.addEventListener("beforeunload", function(){ if (Object.keys(pend).length) flushSettings(); });
  // the dashboard re-renders the listing list (new photo, title, listing added): keep the switcher in step
  document.addEventListener("bh:host", function(e){ if (C && e.detail && e.detail.type === "me") setTimeout(drawPicker, 0); });
  var mq = window.matchMedia("(min-width:860px)"), re = function(){ if (C){ observe(); onScroll(); if (mq.matches) document.body.classList.remove("hc-sheet-on"); } };
  if (mq.addEventListener) mq.addEventListener("change", re); else if (mq.addListener) mq.addListener(re);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
