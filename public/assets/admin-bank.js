/* Book Homes admin: host bank details for manual bank transfers (owner decision 22 Nov 2026).
   Shown on the Payouts tab. Masked by default; "Reveal" asks bookhomes-admin {action: "reveal_bank"} (admin + 2-step,
   audit-logged) and hides the numbers again after 60 seconds. Needs window.BHAdmin.api from admin/index.html. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format((p || 0) / 100); }
var loaded = false, timers = {};

function card(){
  var sec = $('section[data-panel="mppayouts"]');
  if (!sec) return null;
  var c = $("#abBank");
  if (!c){
    c = document.createElement("div"); c.className = "card"; c.id = "abBank";
    c.innerHTML = '<h2>Host bank details for transfers</h2><p class="muted" style="margin:-4px 0 10px">For hosts not paid through Stripe. Hidden until you tap Reveal; every reveal is logged. Format checked only (not a modulus check): confirm the name with the bank (Confirmation of Payee) when you pay.</p><div id="abBankList" class="list"><p class="muted">Loading...</p></div>';
    sec.appendChild(c);
  }
  return c;
}
function load(){
  if (!window.BHAdmin || !card()) return;
  loaded = true;
  window.BHAdmin.api({action: "bank_accounts"}).then(function(j){
    var rows = j.rows || [];
    $("#abBankList").innerHTML = rows.length ? rows.map(function(r){
      return '<div class="item" data-ab="' + esc(r.host_id) + '"><div class="h"><span>' + esc(r.host_name || r.email) + '</span>' +
        (r.due_pence ? '<span class="pill warn">' + money(r.due_pence) + " due</span>" : '<span class="pill">nothing due</span>') + "</div>" +
        '<div class="m">' + esc(r.email) + (r.connect_status === "enabled" ? " · also on Stripe" : "") + "</div>" +
        '<div class="m ab-num">' + esc(r.holder_name) + " · sort code " + esc(r.sort_code_masked) + " · account ending " + esc(r.last4) + "</div>" +
        '<div class="acts"><button type="button" class="btn sm ghost" data-abreveal="' + esc(r.host_id) + '">Reveal</button></div></div>';
    }).join("") : '<p class="muted">No host has added bank details yet.</p>';
  }).catch(function(e){ $("#abBankList").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function hide(id){
  var it = document.querySelector('[data-ab="' + id + '"]');
  clearTimeout(timers[id]);
  if (it && it._masked){ $(".ab-num", it).innerHTML = it._masked; $(".acts", it).innerHTML = '<button type="button" class="btn sm ghost" data-abreveal="' + esc(id) + '">Reveal</button>'; it._masked = null; }
}
document.addEventListener("click", function(e){
  var t = e.target;
  var rv = t.closest && t.closest("[data-abreveal]");
  if (rv){
    var id = rv.getAttribute("data-abreveal"), it = rv.closest("[data-ab]");
    if (!confirm("Show this host's full bank details? This is logged.")) return;
    rv.disabled = true;
    window.BHAdmin.api({action: "reveal_bank", host_id: id, reason: "manual payout"}).then(function(d){
      it._masked = $(".ab-num", it).innerHTML;
      $(".ab-num", it).innerHTML = "<b>" + esc(d.holder_name) + "</b> · sort code <b>" + esc(d.sort_code) + "</b> · account <b>" + esc(d.account_number) + "</b>";
      $(".acts", it).innerHTML = '<button type="button" class="btn sm" data-abcopy="' + esc(d.sort_code.replace(/-/g, "")) + '">Copy sort code</button><button type="button" class="btn sm" data-abcopy="' + esc(d.account_number) + '">Copy account number</button><button type="button" class="btn sm ghost" data-abhide="' + esc(id) + '">Hide</button>';
      timers[id] = setTimeout(function(){ hide(id); }, 60000);
    }).catch(function(err){ rv.disabled = false; alert(err.message); });
    return;
  }
  var hd = t.closest && t.closest("[data-abhide]");
  if (hd){ hide(hd.getAttribute("data-abhide")); return; }
  var cp = t.closest && t.closest("[data-abcopy]");
  if (cp && navigator.clipboard){ navigator.clipboard.writeText(cp.getAttribute("data-abcopy")).then(function(){ var o = cp.textContent; cp.textContent = "Copied"; setTimeout(function(){ cp.textContent = o; }, 1200); }); }
});
function watch(){
  var sec = $('section[data-panel="mppayouts"]');
  if (!sec) return;
  var check = function(){ if (!sec.classList.contains("hidden") && !loaded) load(); if (sec.classList.contains("hidden")) loaded = false; };
  new MutationObserver(check).observe(sec, {attributes: true, attributeFilter: ["class"]});
  check();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
})();
