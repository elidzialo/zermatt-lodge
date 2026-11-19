/* Book-direct offer (Zermatt Lodge): once per visitor, leave an email to see a 5% promo code (POST /api/signup).
   Desktop: when the mouse leaves through the top of the window. Phones: after 30 seconds or a fast scroll back up. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var xp = $("#xp"); if (!xp) return;
var KEY = "zl_offer_seen_v1", shown = false, ret = null;
function store(k, v){ try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function lock(on){ document.documentElement.classList.toggle("locked", on); }
function seen(){ return shown || store(KEY) === "1"; }
function blocked(){
  var a = document.activeElement, rf = $("#reserveForm");
  return document.body.classList.contains("dp-open") || /session_id=/.test(location.search) || (rf && rf.contains(a)) ||
    !!document.querySelector(".modal:not([hidden]), .lb:not([hidden])");
}
function open(){ if (seen() || blocked()) return; shown = true; store(KEY, "1"); ret = document.activeElement; xp.hidden = false; lock(true); setTimeout(function(){ $("#xpEmail").focus(); }, 30); }
function close(){ xp.hidden = true; lock(false); if (ret && ret.focus) ret.focus({preventScroll: true}); }
$("#xpClose").addEventListener("click", close);
xp.addEventListener("click", function(e){ if (e.target === xp) close(); });
document.addEventListener("keydown", function(e){ if (!xp.hidden && e.key === "Escape") close(); });
if (!seen()){
  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches){
    setTimeout(function(){ document.addEventListener("mouseout", function(e){ if (!e.relatedTarget && e.clientY <= 0) open(); }); }, 4000);
  } else {
    setTimeout(open, 30000);
    var lastY = window.scrollY, lastT = Date.now(), maxY = 0;
    window.addEventListener("scroll", function(){
      var y = window.scrollY, t = Date.now(), dt = t - lastT;
      if (y > maxY) maxY = y;
      if (dt > 0 && dt < 250 && lastY - y > 140 && maxY > 900) open();
      lastY = y; lastT = t;
    }, {passive: true});
  }
}
$("#xpF").addEventListener("submit", function(e){
  e.preventDefault();
  var em = $("#xpEmail"), err = $("#xpErr"), btn = $("#xpBtn");
  err.hidden = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim())){ err.textContent = "Please enter a valid email address."; err.hidden = false; em.focus(); return; }
  btn.disabled = true; btn.textContent = "One moment...";
  var body = {email: em.value.trim(), consent: $("#xpConsent").checked, source_page: location.pathname || "/"};
  var nm = $("#xpName").value.trim(); if (nm) body.name = nm;
  var hp = $("#xpWeb").value; if (hp) body.website = hp;
  fetch("/api/signup", {method: "POST", headers: {"Content-Type": "application/json", "Accept": "application/json"}, body: JSON.stringify(body)})
    .then(function(r){ return r.json().catch(function(){ return {}; }).then(function(j){ return {ok: r.ok, j: j}; }); })
    .then(function(res){
      btn.disabled = false; btn.textContent = "Show my 5% code";
      if (!res.ok || !res.j.ok) throw new Error(res.j && res.j.error ? res.j.error : "");
      if (!res.j.code){ err.textContent = res.j.message || "Thanks, you're on the list."; err.hidden = false; return; }
      $("#xpCode").textContent = res.j.code;
      $("#xpForm").hidden = true; $("#xpDone").hidden = false; $("#xpH2").focus();
      xp.setAttribute("aria-labelledby", "xpH2");
    })
    .catch(function(ex){ btn.disabled = false; btn.textContent = "Show my 5% code"; err.textContent = (ex && ex.message) || "Something went wrong. Please try again in a moment."; err.hidden = false; });
});
$("#xpCopy").addEventListener("click", function(){
  var code = $("#xpCode").textContent, b = this;
  function done(){ b.textContent = "Copied"; setTimeout(function(){ b.textContent = "Copy"; }, 2000); }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, function(){});
});
$("#xpUse").addEventListener("click", function(){
  var code = $("#xpCode").textContent; close();
  if (window.BH_applyPromo) window.BH_applyPromo(code);
  if (window.BH_goToBooking) window.BH_goToBooking();
});
})();
