function reload(){ loadAvailability().then(function(j){ ingest(j); B.co = null; afterChange(); }).catch(function(){}); }

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

/* Mobile bottom bar */
function mbar(){
  var q = quote(), el = $("#mbookPrice");
  if (!el) return;
  el.innerHTML = q && q.total != null ? "<b>" + fmtMoney(q.total) + "</b><small>" + q.nights.length + " night" + (q.nights.length === 1 ? "" : "s") + ", total, no booking fees</small>" : "<b>Add dates</b><small>for the total price</small>";
  $("#mbookBtn").textContent = q && q.total != null ? "Reserve" : "Check dates";
}
var mb = $("#mbookBtn");
if (mb) mb.addEventListener("click", function(){
  if (B.ci && B.co) $("#reserveForm").scrollIntoView({behavior: reduceMotion ? "auto" : "smooth", block: "center"});
  else openDp($("#bookcard"), B.ci ? "co" : "ci");
});
var bci = $("#bkDates");
if (bci) bci.addEventListener("click", function(){ openDp($("#bookcard"), B.ci && !B.co ? "co" : "ci"); });
var _summary = summary;
summary = function(){ _summary(); mbar(); };

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
  if (q.get("cancelled")) showBkErr("Payment cancelled.", "Your dates are not booked and you have not been charged.");
}).catch(function(){
  $("#months").innerHTML = '<p class="bd-empty">Live availability could not be loaded. Please refresh the page.</p>';
});
})();
