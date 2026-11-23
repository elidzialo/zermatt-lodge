/* Book Homes host Calendar (Airbnb-style, kept simple). Owns #panel-calendar except the iCal sync box (host.js drawSync + click handlers).
   - One month at a time: < > arrows, Today, swipe on phones.
   - Select nights: click, click the last night, drag, or shift-click. Touch: tap the first then the last night.
   - Selected: Open / Blocked switch, price per night (reset to base), More: minimum nights + private note. Save / Cancel.
   - Nothing selected: Pricing and Availability tabs; each row opens an inline editor with Save. Connect calendars is the last row.
   - Saves are optimistic and show an Undo toast.
   API (bookhomes-host): calendar, block, set_nights, save_listing.
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
function fmt(o){ return new Intl.DateTimeFormat("en-GB", Object.assign({timeZone: "UTC"}, o)); }
var fMonth = fmt({month: "long", year: "numeric"}), fWd = fmt({weekday: "short"}), fDay = fmt({day: "numeric"}), fMon = fmt({month: "short"});
function D(s){ return new Date(s + "T00:00:00Z"); }
function mName(m){ return fMonth.format(D(m + "-01")); }
function dShort(s){ return fWd.format(D(s)) + " " + fDay.format(D(s)) + " " + fMon.format(D(s)); }
function rangeTitle(a, b){ // "Mon 3 - Fri 7 Dec", "Mon 30 Nov - Wed 2 Dec"
  if (a === b) return dShort(a);
  var same = a.slice(0, 7) === b.slice(0, 7);
  return fWd.format(D(a)) + " " + fDay.format(D(a)) + (same ? "" : " " + fMon.format(D(a))) + " - " + dShort(b);
}
function gbp(v){ return v == null || v === "" || isNaN(v) ? "" : "£" + (Math.round(v * 100) % 100 ? (+v).toFixed(2) : Math.round(v)); }
function desk(){ return window.matchMedia("(min-width:860px)").matches; }
var CHEV = '<i class="hc-chev" aria-hidden="true"></i>';

var MAX_AHEAD = 24;
var C = null, today = ukToday();
function fresh(id){ return {id: id, start: ukToday().slice(0, 7), month: ukToday().slice(0, 7), loaded: {}, loading: {}, days: {}, ov: {}, bookings: {}, feeds: {}, blocks: [], settings: null, legacy: false, a: null, b: null}; }

// saves and undos run one after another, so an Undo never overtakes the save it undoes
var Q = Promise.resolve();
function queue(f){ var p = Q.then(f, f); Q = p.catch(function(){}); return p; }

/* ---------- data ---------- */
function cacheKey(id, m){ return "cal:" + id + ":" + m; }
function fetchMonth(m, force){
  var id = C.id, key = cacheKey(id, m), hit = window.HP && HP.get(key);
  if (hit && !C.loaded[m]){ merge(m, hit.v); if (m === C.month) draw(); }
  if (!force && hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.v);
  if (C.loading[m]) return C.loading[m];
  var from = m + "-01", to = shiftMonth(m, 1) + "-01", t = ukToday();
  var p = api({action: "calendar", listing_id: id, from: from < t ? t : from, to: to}).then(function(j){
    if (window.HP) HP.put(key, j);
    if (!C || C.id !== id) return j;
    delete C.loading[m]; merge(m, j); if (m === C.month){ draw(); $("#hcErr").textContent = ""; } if (!C.a) drawSettings(); return j;
  }, function(e){ if (C && C.id === id){ delete C.loading[m]; if (m === C.month) $("#hcErr").textContent = e.message; } throw e; });
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
function listing(){ var me = H() && H().me(); return ((me && me.listings) || []).filter(function(l){ return +l.id === +C.id; })[0] || null; }
function sett(){
  if (C.settings) return C.settings;
  var l = listing() || {};
  return {base_price: l.base_price, weekend_price: l.weekend_price, cleaning_fee: l.cleaning_fee, weekly_discount_pct: l.weekly_discount_pct, monthly_discount_pct: l.monthly_discount_pct,
    min_nights: l.min_nights, max_nights: l.max_nights, max_guests: l.max_guests, guests_included: l.guests_included, extra_guest_fee: l.extra_guest_fee,
    advance_notice_days: l.advance_notice_days, prep_days: l.prep_days, booking_window_days: l.booking_window_days, same_day_cutoff_hour: null};
}
function defaultPrice(s){ var st = sett(), w = isoDow(s); return (w === 4 || w === 5) && st.weekend_price != null ? +st.weekend_price : st.base_price != null ? +st.base_price : null; }

/* ---------- the month ---------- */
function draw(){
  if (!C) return;
  var m = C.month, first = m + "-01", last = addDays(shiftMonth(m, 1) + "-01", -1), lead = isoDow(first), loaded = C.loaded[m], html = "";
  $("#hcMonth").textContent = mName(m);
  $("#hcPrev").disabled = m <= C.start; $("#hcNext").disabled = m >= shiftMonth(C.start, MAX_AHEAD);
  $("#hcToday").disabled = m === C.start;
  var bars = Object.keys(C.bookings).map(function(k){ var b = C.bookings[k]; return {a: b.check_in, z: b.check_out, t: String(b.guest_name || "Guest").trim().split(/\s+/)[0] || "Guest", c: ""}; })
    .concat(allFeeds().map(function(f){ return {a: f.start_date, z: f.end_date, t: f.name || "Booked", c: " o"}; }));
  for (var d = addDays(first, -lead); d <= last; d = addDays(d, 7)){
    var wk = '<div class="hc-wk">', wkEnd = addDays(d, 6);
    for (var c = 0; c < 7; c++){
      var s = addDays(d, c);
      if (s < first || s > last){ wk += '<span class="hc-d x" aria-hidden="true"></span>'; continue; }
      var day = C.days[s], past = s < today, cls = "hc-d", price = day && day.p != null ? day.p : null;
      var booked = !past && (bookingOn(s) || (day && day.s === "reserved"));
      if (past) cls += " past";
      else if (!loaded) cls += " ld";
      else if (!booked && day && day.s === "blocked") cls += " blk";
      if (s === today) cls += " today";
      if (inSel(s)) cls += " sel";
      wk += '<button type="button" class="' + cls + '" data-d="' + s + '"' + (past ? " disabled" : "") + ' aria-label="' + esc(dShort(s) + (booked ? ", booked" : day && day.s === "blocked" ? ", blocked" : "") + (price != null ? ", " + gbp(price) : "")) + '"' + (inSel(s) ? ' aria-pressed="true"' : "") +
        '><span class="n">' + (+s.slice(8)) + "</span>" + (!past && loaded && !booked && price != null ? '<span class="p">' + gbp(price) + "</span>" : "") + "</button>";
    }
    // booking bars, from the middle of check-in day to the middle of check-out day
    bars.forEach(function(b){
      var visA = d < first ? first : d, visZ = wkEnd > last ? last : wkEnd;
      if (b.a > visZ || b.z < visA || b.z < today) return;
      var x0 = b.a >= visA ? daysBetween(d, b.a) + 0.5 : daysBetween(d, visA), x1 = b.z <= visZ ? daysBetween(d, b.z) + 0.5 : daysBetween(d, visZ) + 1;
      if (x1 - x0 < 0.4) return;
      wk += '<span class="hc-bar' + b.c + (b.a >= visA ? " s" : "") + (b.z <= visZ ? " e" : "") + '" style="left:calc(' + (x0 * 100 / 7) + '% + 2px);width:calc(' + ((x1 - x0) * 100 / 7) + '% - 4px)">' + (x1 - x0 >= 1 ? esc(b.t) : "") + "</span>";
    });
    html += wk + "</div>";
  }
  $("#hcGrid").innerHTML = html;
}
function go(m){
  if (!C) return;
  if (m < C.start) m = C.start; if (m > shiftMonth(C.start, MAX_AHEAD)) m = shiftMonth(C.start, MAX_AHEAD);
  C.month = m; draw();
  fetchMonth(m).catch(function(){}); fetchMonth(shiftMonth(m, 1)).catch(function(){});
  // host-speed: also two months ahead, so quick clicks on > still find the month ready
  var m2 = shiftMonth(m, 2); if (m2 <= shiftMonth(C.start, MAX_AHEAD)) fetchMonth(m2).catch(function(){});
}
function monthsOf(lo, hi){ var out = [], m = lo.slice(0, 7); while (m <= hi.slice(0, 7)){ out.push(m); m = shiftMonth(m, 1); } return out; }

/* ---------- selection ---------- */
function range(){ if (!C || !C.a) return null; var b = C.b || C.a; return C.a <= b ? [C.a, b] : [b, C.a]; }
function inSel(s){ var r = range(); return !!r && s >= r[0] && s <= r[1]; }
function paintSel(){
  var r = range();
  $$("#hcGrid .hc-d[data-d]").forEach(function(el){
    var s = el.getAttribute("data-d"), on = !!r && s >= r[0] && s <= r[1];
    el.classList.toggle("sel", on); if (on) el.setAttribute("aria-pressed", "true"); else el.removeAttribute("aria-pressed");
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
  var g = $("#hcGrid");
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
  // phones: swipe left / right for the next / previous month
  var sx = null, sy = 0;
  $("#hcMain").addEventListener("touchstart", function(e){ if (e.touches.length === 1){ sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, {passive: true});
  $("#hcMain").addEventListener("touchend", function(e){
    if (sx === null) return; var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(shiftMonth(C.month, dx < 0 ? 1 : -1));
  }, {passive: true});
}

/* ---------- side panel / bottom sheet ---------- */
var SHEET = false; // phones: settings sheet opened by the user
function openSheet(on){ $("#hcSide").classList.toggle("open", !!on); document.body.classList.toggle("hc-sheet-on", !!on && !desk()); }
function panel(){
  var on = !!C.a;
  $("#hcSel").classList.toggle("hidden", !on); $("#hcSet").classList.toggle("hidden", on);
  if (on){ parkSync(); drawSel(); openSheet(true); }
  else { drawSettings(); openSheet(SHEET); }
}
var SEL = null;
function drawSel(){
  var r = range(), lo = r[0], hi = r[1], n = daysBetween(lo, hi) + 1, st = sett();
  var blocked = 0, prices = {}, mins = {}, notes = {}, cust = 0;
  for (var s = lo; s <= hi; s = addDays(s, 1)){
    var d = C.days[s], o = C.ov[s] || {};
    if (hostBlocked(s)) blocked++;
    prices[d && d.p != null ? d.p : ""] = 1; mins[o.m != null ? o.m : ""] = 1; notes[o.note || ""] = 1; if (o.p != null) cust++;
  }
  var pk = Object.keys(prices), mk = Object.keys(mins), nk = Object.keys(notes);
  SEL = {lo: lo, hi: hi, open: blocked !== n, price: pk.length === 1 && pk[0] !== "" ? +pk[0] : null, mixedPrice: pk.length > 1,
    min: mk.length === 1 && mk[0] !== "" ? +mk[0] : null, note: nk.length === 1 ? nk[0] : "", cust: cust, reset: false};
  SEL.newOpen = SEL.open;
  var bks = Object.keys(C.bookings).map(function(k){ return C.bookings[k]; }).filter(function(b){ return b.check_in <= hi && b.check_out > lo; });
  var who = bks.map(function(b){ return esc(String(b.guest_name || "Guest").split(" ")[0]) + (b.guests ? ", " + b.guests + " guest" + (b.guests === 1 ? "" : "s") : ""); })
    .concat(allFeeds().filter(function(f){ return f.start_date <= hi && f.end_date > lo; }).map(function(f){ return "Booked on " + esc(f.name || "another site"); }));
  var more = SEL.min != null || SEL.note;
  $("#hcSel").innerHTML =
    '<h2 class="hc-h">' + esc(rangeTitle(lo, hi)) + "</h2>" +
    (who.length ? '<p class="hc-sub">' + who.join(" · ") + "</p>" : "") +
    '<button type="button" class="hc-sw" id="hcOpenSw" role="switch" aria-checked="' + SEL.open + '"><span id="hcOpenTx">' + (SEL.open ? "Open" : "Blocked") + '</span><i aria-hidden="true"></i></button>' +
    (C.legacy ? "" :
      '<label class="hc-price"><span>Price per night</span><span class="hc-pin">£<input type="number" id="hcSelPrice" min="10" max="10000" step="1" inputmode="numeric" value="' + (SEL.price != null ? Math.round(SEL.price) : "") + '" placeholder="' + (SEL.mixedPrice ? "Mixed" : "") + '"></span></label>' +
      (SEL.cust ? '<button type="button" class="hc-link" id="hcReset">Reset to base price</button>' : "") +
      '<details class="hc-more"' + (more ? " open" : "") + '><summary>More' + CHEV + "</summary>" +
        '<label class="hc-row2"><span>Minimum nights</span><input type="number" id="hcSelMin" min="1" max="90" step="1" inputmode="numeric" value="' + (SEL.min != null ? SEL.min : "") + '" placeholder="' + esc(st.min_nights != null ? st.min_nights : "") + '"></label>' +
        '<label class="hc-row2 col"><span>Note</span><textarea id="hcSelNote" maxlength="500" rows="2" placeholder="Only you can see this">' + esc(SEL.note) + "</textarea></label>" +
      "</details>") +
    '<button type="button" class="btn hc-save" id="hcSave" disabled>Save</button><button type="button" class="hc-link hc-cancel" id="hcCancel">Cancel</button><p class="hc-out" id="hcOut" aria-live="polite"></p>';
}
function selChanges(){
  if (!SEL) return null;
  var ch = {}, p = $("#hcSelPrice"), mi = $("#hcSelMin"), no = $("#hcSelNote");
  if (SEL.newOpen !== SEL.open) ch.avail = SEL.newOpen ? "available" : "blocked";
  if (SEL.reset) ch.price = null;
  else if (p && p.value !== "" && (SEL.price == null || +p.value !== Math.round(SEL.price) || SEL.mixedPrice)) ch.price = +p.value;
  if (mi && mi.value !== (SEL.min != null ? String(SEL.min) : "")) ch.min_stay = mi.value === "" ? null : +mi.value;
  if (no && no.value !== SEL.note) ch.note = no.value.trim() === "" ? null : no.value.trim();
  return ch;
}
function selDirty(){ var c = selChanges(), b = $("#hcSave"); if (b) b.disabled = !c || !Object.keys(c).length; }
function bindSel(){
  var box = $("#hcSel");
  box.addEventListener("click", function(e){
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    if (t.id === "hcCancel"){ clearSel(); return; }
    if (t.id === "hcOpenSw"){ SEL.newOpen = !SEL.newOpen; t.setAttribute("aria-checked", SEL.newOpen); $("#hcOpenTx").textContent = SEL.newOpen ? "Open" : "Blocked"; selDirty(); return; }
    if (t.id === "hcReset"){ SEL.reset = true; var p = $("#hcSelPrice"); p.value = ""; p.placeholder = gbp(sett().base_price).slice(1) || ""; t.remove(); selDirty(); return; }
    if (t.id === "hcSave") saveSel();
  });
  box.addEventListener("input", function(e){ if (e.target.id === "hcSelPrice") SEL.reset = false; selDirty(); });
  box.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target.tagName === "INPUT"){ e.preventDefault(); if (!$("#hcSave").disabled) saveSel(); } });
}
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
  draw();
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
  if (!C) return; var id = C.id;
  monthsOf(lo, hi).forEach(function(m){ if (window.HP) HP.drop(cacheKey(id, m)); if (C.loaded[m] || m === C.month) fetchMonth(m, true).catch(function(){}); });
}
function saveSel(){
  var ch = selChanges(); if (!ch || !Object.keys(ch).length) return;
  if ("price" in ch && ch.price !== null && !(ch.price >= 10 && ch.price <= 10000)){ $("#hcOut").textContent = "Enter a price from £10 to £10,000."; return; }
  if ("min_stay" in ch && ch.min_stay !== null && !(ch.min_stay >= 1 && ch.min_stay <= 90)){ $("#hcOut").textContent = "Minimum nights can be 1 to 90."; return; }
  if (C.legacy){ delete ch.price; delete ch.min_stay; delete ch.note; }
  if (!Object.keys(ch).length) return;
  var lo = SEL.lo, hi = SEL.hi, before = snapshot(lo, hi), n = daysBetween(lo, hi) + 1;
  applyLocal(lo, hi, ch); clearSel();
  var label = (ch.avail === "blocked" ? "Blocked" : ch.avail === "available" ? "Opened" : "Saved") + " " + (n === 1 ? dShort(lo) : n + " nights");
  var u = function(){ return undo(lo, hi, ch, before); };
  toast(label, u);
  send(lo, hi, ch).then(function(){ refetch(lo, hi); }, function(e){ toast("Not saved: " + e.message); refetch(lo, hi); });
}
function runs(list, key){
  var out = [];
  list.forEach(function(x){ var k = key(x), last = out[out.length - 1]; if (last && last.k === k && addDays(last.z, 1) === x.d) last.z = x.d; else out.push({k: k, a: x.d, z: x.d, x: x}); });
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
  if (calls.length > 40) return Promise.reject(new Error("too many different nights to undo in one go."));
  before.forEach(function(x){
    var o = C.ov[x.d] || (C.ov[x.d] = {}), d = C.days[x.d];
    if ("price" in ch){ o.p = x.p; if (d) d.p = x.p != null ? x.p : defaultPrice(x.d); }
    if ("min_stay" in ch) o.m = x.m;
    if ("note" in ch) o.note = x.note || "";
    if (ch.avail){ o.closed = x.blk; if (d && d.s !== "reserved") d.s = x.blk ? "blocked" : "available"; }
  });
  draw();
  return queue(function(){ return calls.reduce(function(p, b){ return p.then(function(){ return api(b); }); }, Promise.resolve()); }).then(function(){ refetch(lo, hi); }, function(e){ refetch(lo, hi); throw e; });
}

/* ---------- listing-wide settings: Pricing / Availability tabs, rows that open an inline editor ---------- */
var TAB = "p", OPEN = null;
var ADV = [[0, "Same day"], [1, "1 day"], [2, "2 days"], [3, "3 days"], [7, "7 days"]];
var CUT = [["", "Any time"], [12, "12:00"], [14, "14:00"], [16, "16:00"], [18, "18:00"], [20, "20:00"], [22, "22:00"]];
var PREP = [[0, "None"], [1, "1 night"], [2, "2 nights"], [3, "3 nights"]];
var WIN = [[90, "3 months"], [180, "6 months"], [270, "9 months"], [365, "12 months"], [730, "24 months"]];
function pick(list, v){ var x = list.filter(function(o){ return String(o[0]) === String(v == null ? "" : v); })[0]; return x ? x[1] : v == null ? "" : String(v); }
function nights(v){ return v == null ? "" : v + " night" + (+v === 1 ? "" : "s"); }
// k: row key; f: fields edited by the row [key, label, kind, min, max, options]
var ROWS = {
  base: {t: "Base price", f: [["base_price", "Per night", "money", 10, 10000]], v: function(s){ return gbp(s.base_price) || "Not set"; }},
  weekend: {t: "Weekend price", f: [["weekend_price", "Friday and Saturday", "money", 10, 10000, null, true]], v: function(s){ return s.weekend_price != null ? gbp(s.weekend_price) : "Off"; }},
  disc: {t: "Discounts", f: [["weekly_discount_pct", "Weekly (7+ nights)", "pct", 0, 50], ["monthly_discount_pct", "Monthly (28+ nights)", "pct", 0, 60]], v: function(s){ var a = []; if (+s.weekly_discount_pct) a.push(s.weekly_discount_pct + "% weekly"); if (+s.monthly_discount_pct) a.push(s.monthly_discount_pct + "% monthly"); return a.join(", ") || "Off"; }},
  clean: {t: "Cleaning fee", f: [["cleaning_fee", "Per stay", "money", 0, 2000]], v: function(s){ return +s.cleaning_fee ? gbp(s.cleaning_fee) : "Off"; }},
  extra: {t: "Extra guest fee", f: [["extra_guest_fee", "Per guest, per night", "money", 0, 500], ["guests_included", "After", "guests"]], v: function(s){ return +s.extra_guest_fee && s.guests_included != null ? gbp(s.extra_guest_fee) + " after " + s.guests_included : "Off"; }},
  min: {t: "Minimum nights", f: [["min_nights", "Nights", "int", 1, 90]], v: function(s){ return nights(s.min_nights); }},
  max: {t: "Maximum nights", f: [["max_nights", "Nights", "int", 1, 365]], v: function(s){ return nights(s.max_nights); }},
  adv: {t: "Advance notice", f: [["advance_notice_days", "Notice", "sel", 0, 0, ADV]], v: function(s){ return pick(ADV, s.advance_notice_days); }},
  cut: {t: "Same-day cut-off", f: [["same_day_cutoff_hour", "Book tonight until", "sel", 0, 0, CUT]], v: function(s){ return pick(CUT, s.same_day_cutoff_hour); }, when: function(s){ return +s.advance_notice_days === 0; }},
  prep: {t: "Preparation time", f: [["prep_days", "Before and after each stay", "sel", 0, 0, PREP]], v: function(s){ return pick(PREP, s.prep_days); }},
  win: {t: "Availability window", f: [["booking_window_days", "Guests can book ahead", "sel", 0, 0, WIN]], v: function(s){ return pick(WIN, s.booking_window_days); }}
};
var TABS = {p: {main: ["base", "weekend", "disc"], more: ["clean", "extra"]}, a: {main: ["min", "max", "adv"], more: ["cut", "prep", "win"]}};
function parkSync(){ var sy = $("#hcSync"); if (sy && sy.parentNode !== $("#hcSide")){ sy.classList.add("hidden"); $("#hcSide").appendChild(sy); } }
function rowHtml(k, st){
  var r = ROWS[k]; if (r.when && !r.when(st)) return "";
  var on = OPEN === k, ed = "";
  if (on) ed = '<div class="hc-ed">' + r.f.map(function(f){
    var v = st[f[0]], id = "hcF_" + f[0], inp;
    if (f[2] === "sel") inp = '<select id="' + id + '">' + f[5].map(function(o){ return '<option value="' + o[0] + '"' + (String(o[0]) === String(v == null ? "" : v) ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + (f[5].some(function(o){ return String(o[0]) === String(v == null ? "" : v); }) ? "" : '<option selected value="' + esc(v) + '">' + esc(v) + "</option>") + "</select>";
    else if (f[2] === "guests") inp = '<select id="' + id + '">' + Array.apply(null, Array(Math.max(1, +st.max_guests || 1))).map(function(_, i){ return '<option value="' + (i + 1) + '"' + (+v === i + 1 ? " selected" : "") + ">" + (i + 1) + " guest" + (i ? "s" : "") + "</option>"; }).join("") + "</select>";
    else inp = '<span class="hc-pin">' + (f[2] === "money" ? "£" : "") + '<input type="number" id="' + id + '" min="' + f[3] + '" max="' + f[4] + '" step="1" inputmode="numeric" value="' + (v == null ? "" : f[2] === "money" ? Math.round(v * 100) / 100 : v) + '"' + (f[6] ? ' placeholder="Off"' : "") + ">" + (f[2] === "pct" ? "%" : "") + "</span>";
    return '<label class="hc-fl"><span>' + esc(f[1]) + "</span>" + inp + "</label>";
  }).join("") + '<div class="hc-edb"><button type="button" class="hc-link" data-edcancel>Cancel</button><button type="button" class="btn sm" data-edsave="' + k + '">Save</button></div><p class="hc-out" id="hcEdOut" aria-live="polite"></p></div>';
  return '<div class="hc-item' + (on ? " on" : "") + '"><button type="button" class="hc-rowb" data-row="' + k + '" aria-expanded="' + on + '"><span>' + esc(r.t) + "</span><em>" + esc(r.v(st)) + "</em>" + CHEV + "</button>" + ed + "</div>";
}
var MORE = false;
function drawSettings(){
  if (!C) return;
  var el = $("#hcSet"), st = sett();
  var ae = document.activeElement; if (ae && el.contains(ae) && /INPUT|SELECT|TEXTAREA/.test(ae.tagName)) return; // don't redraw under the cursor
  parkSync();
  var tabs = '<div class="hc-tabs" role="tablist"><button type="button" role="tab" data-tab2="p" aria-selected="' + (TAB === "p") + '">Pricing</button><button type="button" role="tab" data-tab2="a" aria-selected="' + (TAB === "a") + '">Availability</button></div>';
  var body;
  if (C.legacy) body = TAB === "p" ? '<p class="hc-sub">Zermatt Lodge prices come from Guesty.</p>' : '<p class="hc-sub">Rules come from Guesty. Block or open nights on the calendar.</p>';
  else {
    var t = TABS[TAB], moreOpen = MORE || t.more.indexOf(OPEN) >= 0;
    body = t.main.map(function(k){ return rowHtml(k, st); }).join("") +
      '<details class="hc-more"' + (moreOpen ? " open" : "") + '><summary>More settings' + CHEV + "</summary>" + t.more.map(function(k){ return rowHtml(k, st); }).join("") + "</details>";
  }
  if (TAB === "a") body += '<div class="hc-item' + (OPEN === "sync" ? " on" : "") + '"><button type="button" class="hc-rowb" data-row="sync" aria-expanded="' + (OPEN === "sync") + '"><span>Connect calendars</span><em></em>' + CHEV + '</button><div id="hcSyncSlot"></div></div>';
  el.innerHTML = '<div class="hc-shead">' + tabs + "</div>" + body;
  if (OPEN === "sync"){ var sy = $("#hcSync"); sy.classList.remove("hidden"); $("#hcSyncSlot").appendChild(sy); if (H().drawSync) H().drawSync(); }
  var f = OPEN && $(".hc-ed input, .hc-ed select", el); if (f) f.focus();
}
function bindSettings(){
  var el = $("#hcSet");
  el.addEventListener("click", function(e){
    var t = e.target.closest && e.target.closest("button"); if (!t) return;
    if (t.hasAttribute("data-tab2")){ TAB = t.getAttribute("data-tab2"); OPEN = null; MORE = false; drawSettings(); if (!desk()){ SHEET = true; openSheet(true); } return; }
    if (t.hasAttribute("data-row")){ var k = t.getAttribute("data-row"); OPEN = OPEN === k ? null : k; drawSettings(); return; }
    if (t.hasAttribute("data-edcancel")){ OPEN = null; drawSettings(); return; }
    if (t.hasAttribute("data-edsave")) saveRow(t.getAttribute("data-edsave"));
  });
  el.addEventListener("toggle", function(e){ if (e.target.classList && e.target.classList.contains("hc-more")) MORE = e.target.open; }, true);
  el.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target.closest(".hc-ed") && e.target.tagName !== "BUTTON"){ e.preventDefault(); var b = $("[data-edsave]", el); if (b) saveRow(b.getAttribute("data-edsave")); } });
}
function saveRow(k){
  var r = ROWS[k], st = sett(), vals = {}, err = "";
  r.f.forEach(function(f){
    if (err) return;
    var raw = $("#hcF_" + f[0]).value;
    if (f[2] === "sel" || f[2] === "guests"){ vals[f[0]] = raw === "" ? null : +raw; return; }
    if (raw === ""){ if (f[6]) { vals[f[0]] = null; return; } if (f[2] === "money" && f[3] === 0 || f[2] === "pct"){ vals[f[0]] = 0; return; } err = r.t + " is needed."; return; }
    var n = +raw; if (isNaN(n) || n < f[3] || n > f[4]){ err = (f[2] === "money" ? "£" + f[3] + " to £" + f[4] : f[3] + " to " + f[4] + (f[2] === "pct" ? "%" : "")) + "."; return; }
    vals[f[0]] = f[2] === "money" ? Math.round(n * 100) / 100 : Math.round(n);
  });
  if (!err && k === "min" && vals.min_nights > +st.max_nights) err = "Can't be more than your maximum nights.";
  if (!err && k === "max" && vals.max_nights < +st.min_nights) err = "Can't be less than your minimum nights.";
  if (k === "extra" && !vals.extra_guest_fee) vals.guests_included = null;
  if (err){ $("#hcEdOut").textContent = err; return; }
  var keys = Object.keys(vals).filter(function(x){ return String(st[x] == null ? "" : st[x]) !== String(vals[x] == null ? "" : vals[x]); });
  OPEN = null;
  if (!keys.length){ drawSettings(); return; }
  var ch = {}, before = {}, id = C.id; keys.forEach(function(x){ ch[x] = vals[x]; before[x] = st[x] == null ? null : st[x]; });
  patchListing(ch); draw(); drawSettings();
  toast("Saved " + r.t.toLowerCase(), function(){ patchListing(before); draw(); drawSettings(); return queue(function(){ return api({action: "save_listing", id: id, listing: before}); }).then(reloadData); });
  queue(function(){ return api({action: "save_listing", id: id, listing: ch}); }).then(reloadData, function(e){ patchListing(before); draw(); drawSettings(); toast("Not saved: " + e.message); });
}
function patchListing(vals){
  C.settings = Object.assign({}, sett(), vals);
  var l = listing(); if (l) Object.keys(vals).forEach(function(k){ l[k] = vals[k]; });
  if ("base_price" in vals || "weekend_price" in vals) Object.keys(C.days).forEach(function(s){ var o = C.ov[s]; if (!o || o.p == null) C.days[s].p = defaultPrice(s); });
}
function reloadData(){ if (!C) return; var id = C.id; if (window.HP) HP.drop("cal:" + id + ":"); Object.keys(C.loaded).forEach(function(m){ fetchMonth(m, true).catch(function(){}); }); }

/* ---------- toast with undo ---------- */
var tTimer = 0, tUndo = null;
function toast(text, undoFn){
  var t = $("#hcToast"); $("#hcToastTx").textContent = text; tUndo = undoFn || null;
  $("#hcUndo").classList.toggle("hidden", !undoFn); t.classList.remove("hidden");
  clearTimeout(tTimer); tTimer = setTimeout(function(){ t.classList.add("hidden"); tUndo = null; }, 7000);
}

/* ---------- listing picker ---------- */
function photo(id){
  var me = H().me() || {}, ph = (me.photos || []).filter(function(x){ return String(x.listing_id) === String(id); })[0];
  if (!ph) return "";
  var u = ph.thumb_url || ph.url;
  return '<img src="' + esc(window.HP && HP.thumb ? HP.thumb(u, 120) : u) + '" alt="" loading="lazy">';
}
function drawPicker(){
  var me = H().me() || {}, ls = (me.listings || []).filter(function(l){ return l.status !== "archived"; }), l = listing();
  $("#hcListPh").innerHTML = l ? photo(l.id) : "";
  $("#hcListTitle").textContent = l ? l.title : "Calendar";
  $("#hcListBtn").disabled = ls.length < 2;
  $("#hcListMenu").innerHTML = ls.map(function(x){ return '<button type="button" role="option" data-lid="' + x.id + '" aria-selected="' + (+x.id === +C.id) + '"><span class="hc-lph">' + photo(x.id) + "</span><b>" + esc(x.title) + "</b></button>"; }).join("");
}
function menu(on){ $("#hcListMenu").classList.toggle("hidden", !on); $("#hcListBtn").setAttribute("aria-expanded", on ? "true" : "false"); }

/* ---------- open / switch ---------- */
// phones: the closed sheet (just the Pricing / Availability tabs) sits above the bottom tab bar
function navH(){ var n = $(".hp-top nav.tabs"), h = n && getComputedStyle(n).position === "fixed" ? n.offsetHeight : 0; $("#hc").style.setProperty("--hc-nav", h + "px"); }
function pickId(){ var v = +$("#calListing").value; if (v) return v; var me = H() && H().me(); var l = ((me && me.listings) || [])[0]; return l ? +l.id : 0; }
function open(){
  today = ukToday();
  var id = pickId();
  if (!id){ $("#hcGrid").innerHTML = '<p class="hc-sub">Add a listing first.</p>'; $("#hcSet").innerHTML = ""; return; }
  if ($("#calListing").value !== String(id)) $("#calListing").value = id;
  var first = !C || C.id !== id || C.start !== today.slice(0, 7);
  if (first){ C = fresh(id); C.legacy = !!(listing() || {}).legacy_source; OPEN = null; panel(); }
  drawPicker(); go(C.month); navH();
  if (!first) fetchMonth(C.month, true).catch(function(){});
}
function switchTo(id){ $("#calListing").value = id; C = null; SHEET = false; open(); }
window.BHCal = {
  open: open,
  reload: function(){ if (C) reloadData(); },
  warm: function(){
    var go2 = function(){ var id = pickId(); if (!id) return; var m = ukToday().slice(0, 7); if (!(window.HP && HP.get(cacheKey(id, m)))) H().api("bookhomes-host", {action: "calendar", listing_id: id, from: ukToday(), to: shiftMonth(m, 1) + "-01"}).then(function(j){ if (window.HP) HP.put(cacheKey(id, m), j); }).catch(function(){}); };
    if (window.requestIdleCallback) requestIdleCallback(go2, {timeout: 2500}); else setTimeout(go2, 1200);
  }
};

/* ---------- wiring ---------- */
function init(){
  if (!$("#hc")) return;
  bindGrid(); bindSel(); bindSettings();
  $("#hcPrev").addEventListener("click", function(){ go(shiftMonth(C.month, -1)); });
  $("#hcNext").addEventListener("click", function(){ go(shiftMonth(C.month, 1)); });
  $("#hcToday").addEventListener("click", function(){ go(C.start); });
  $(".hc-grab").addEventListener("click", function(){ if (C && C.a) clearSel(); else { SHEET = !SHEET; openSheet(SHEET); } });
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
    if (C.a) clearSel(); else if (SHEET){ SHEET = false; openSheet(false); }
  });
  document.addEventListener("bh:host", function(e){ if (C && e.detail && e.detail.type === "me") setTimeout(drawPicker, 0); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
