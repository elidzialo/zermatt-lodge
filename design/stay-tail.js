function reload(){ loadAvailability().then(function(j){ ingest(j); B.co = null; afterChange(); }).catch(function(){}); }

/* Promo code (Zermatt Lodge checkout only): checked on the server, applied to the nights only */
function cleanCode(v){ return String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30); }
function promoMsg(t, ok){ var o = $("#promoMsg"); if (!o) return; o.textContent = t || ""; o.hidden = !t; o.className = "promo-msg " + (ok ? "ok" : "err"); }
function setPromo(p){ B.promo = p; summary(); }
function applyPromo(code){
  var pin = $("#bkPromo"), pb = $("#promoBtn");
  code = cleanCode(code);
  if (!pin || !code){ setPromo(null); promoMsg("", true); return Promise.resolve(false); }
  pin.value = code; pb.disabled = true;
  var det = pin.closest("details"); if (det) det.open = true;
  return fetch(CHECKOUT_API, {method: "POST", headers: {"Content-Type": "application/json", "Accept": "application/json"}, body: JSON.stringify({validate_promo: code})})
    .then(function(r){ return r.json(); })
    .then(function(j){
      pb.disabled = false;
      if (j && j.valid && +j.percent_off > 0){ setPromo({code: j.code, pct: +j.percent_off}); promoMsg(j.percent_off + "% off the nightly rate applied.", true); return true; }
      setPromo(null); promoMsg((j && j.error) || "Sorry, that promo code is not valid.", false); return false;
    })
    .catch(function(){ pb.disabled = false; setPromo(null); promoMsg("We couldn't check that code just now. You can still book, and we'll check it at checkout.", false); return false; });
}
(function(){
  var pin = $("#bkPromo"), pb = $("#promoBtn");
  if (!pin || !LEGACY) return;
  pb.addEventListener("click", function(){ applyPromo(pin.value); });
  pin.addEventListener("keydown", function(e){ if (e.key === "Enter"){ e.preventDefault(); applyPromo(pin.value); } });
  pin.addEventListener("input", function(){ if (B.promo && cleanCode(pin.value) !== B.promo.code){ setPromo(null); promoMsg("", true); } });
})();
window.BH_applyPromo = function(code){ showDetails(false); return applyPromo(code); };
window.BH_goToBooking = function(){ var c = $("#bookcard"); if (c) c.scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "center"}); };

/* "Email me if these dates free up" */
var af = $("#alertForm");
if (af) af.addEventListener("submit", function(e){
  e.preventDefault();
  var em = $("#alertEmail").value.trim(), out = $("#alertMsg");
  var ci = $("#alertCi").value || B.ci, co = $("#alertCo").value || B.co;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)){ out.textContent = "Please enter a valid email."; return; }
  if (!ci || !co || co <= ci){ out.textContent = "Choose the dates you want first."; return; }
  out.textContent = "Saving...";
  fetch("/api/bh/listings", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "alert", email: em, slug: S.slug, check_in: ci, check_out: co, guests: +B.guests, consent: false})})
    .then(function(r){ return r.json().then(function(j){ return {ok: r.ok, j: j}; }); })
    .then(function(r){ out.textContent = r.ok ? "Done. We'll email you once if " + fmtShort.format(parse(ci)) + " to " + fmtShort.format(parse(co)) + " can be booked." : (r.j.error || "Please try again."); })
    .catch(function(){ out.textContent = "Please try again."; });
});
var aci = $("#alertCi"), aco = $("#alertCo");
if (aci){ aci.min = todayIso; aco.min = todayIso; aci.addEventListener("change", function(){ aco.min = aci.value; }); }

var rt = $("#bkReceipt");
if (rt) rt.addEventListener("change", function(){ $("#bkCompanyWrap").hidden = !rt.checked; if (rt.checked) $("#bkCompany").focus(); });

/* Reserve in two steps, like the big platforms: dates first, then name, email and phone */
function showDetails(focus){
  var w = $("#detWrap"); if (!w) return;
  if (w.hidden){ w.hidden = false; }
  if (focus){ var n = $("#bkName"); setTimeout(function(){ n.focus({preventScroll: true}); n.scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "center"}); }, 30); }
}
document.addEventListener("submit", function(e){
  if (e.target !== rf) return;
  if (!B.ci || !B.co){ e.preventDefault(); e.stopImmediatePropagation(); hideBkErr(); openDp($("#bookcard"), B.ci ? "co" : "ci"); return; }
  var w = $("#detWrap");
  if (w && w.hidden){ e.preventDefault(); e.stopImmediatePropagation(); showDetails(true); }
}, true);

/* Price header on the card and the phone bottom bar */
var fmtD = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"});
function rangeTxt(){ return B.ci && B.co ? fmtD.format(parse(B.ci)) + " to " + fmtD.format(parse(B.co)) : ""; }
function mbar(){
  var q = quote(), el = $("#mbookPrice"), cp = $("#cardPrice"), from = cp ? cp.getAttribute("data-from") : "";
  var has = q && q.total != null;
  if (cp) cp.innerHTML = has ? "<b>" + fmtMoney(q.total) + "</b> <span>total for " + q.nights.length + " night" + (q.nights.length === 1 ? "" : "s") + "</span>"
    : from ? '<span class="from">From</span> <b>' + from + "</b> <span>night</span>" : "<b>Add dates</b> <span>for prices</span>";
  if (el) el.innerHTML = has ? "<b>" + fmtMoney(q.total) + " total</b><small>" + rangeTxt() + ", no booking fees</small>"
    : (from ? "<b>From " + from + " night</b>" : "<b>Add dates</b>") + "<small>" + (B.ci ? "Choose your checkout date" : "Add dates for the total") + "</small>";
  var rb = $("#reserveBtn"); if (rb && !rb.disabled) rb.textContent = has ? "Reserve" : "Check availability";
}
var mb = $("#mbookBtn");
if (mb) mb.addEventListener("click", function(){
  if (B.ci && B.co){ showDetails(true); }
  else openDp($("#bookcard"), B.ci ? "co" : "ci");
});
var _summary = summary;
summary = function(){ _summary(); mbar(); };
var _setBusy = setBusy;
setBusy = function(on){ _setBusy(on); if (!on) mbar(); };

/* Boot */
loadAvailability().then(function(j){
  ingest(j);
  var q = new URLSearchParams(location.search);
  var c = q.get("check_in") || q.get("checkIn"), o = q.get("check_out") || q.get("checkOut"), g = q.get("guests");
  if (!(g && /^\d{1,2}$/.test(g) && +g >= 1 && +g <= MAX_GUESTS)) g = null;
  if (B.pending){ applyRange.apply(null, B.pending); B.pending = null; }
  else if (c && validDate.test(c) && c >= todayIso){ applyRange(c, o && validDate.test(o) ? o : null, g); }
  else { if (g) B.guests = g; render(); summary(); }
  mbar();
  var pc = cleanCode(q.get("promo")); if (pc && LEGACY) applyPromo(pc);
  if (q.get("cancelled")) showBkErr("Payment cancelled.", "Your dates are not booked and you have not been charged.");
}).catch(function(){
  $("#months").innerHTML = '<p class="bd-empty">Live availability could not be loaded. Please refresh the page.</p>';
});
})();
