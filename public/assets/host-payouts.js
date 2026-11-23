/* Book Homes host portal: Payouts box (Earnings tab) and the compact payouts line on Today (owner decisions 22 Nov 2026).
   - Connected via Stripe: Stripe badge, status badge, bank name + "account ending 2743", payout schedule, Manage in Stripe
     (one-time Express Dashboard link from bookhomes-connect-onboard {action: "dashboard"}).
   - Not on Stripe: optional "Or add your bank account for bank transfers" (bookhomes-host bank_save / bank_delete).
     The server stores it encrypted; this page only ever gets the masked copy back.
   host.js calls BHPay.render(ME) from renderDash() and exposes window.BHHost {api, refresh, me}. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function H(){ return window.BHHost; }

var css = document.createElement("style");
css.textContent =
  ".bp-stripe{display:inline-flex;align-items:center;justify-content:center;background:#635BFF;color:#fff;font:700 13px/1 system-ui,-apple-system,'Segoe UI',sans-serif;letter-spacing:-.2px;border-radius:6px;padding:5px 8px 6px;vertical-align:middle}" +
  ".bp-stripe.sm{font-size:11px;padding:3px 6px 4px;border-radius:5px}" +
  ".bp-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:4px}.bp-head b{font-size:16px}" +
  ".bp-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 16px;margin:12px 0 0;font-size:14.5px}.bp-dl dt{color:var(--muted,#666)}.bp-dl dd{margin:0;font-weight:600}" +
  ".bp-txt{margin-top:8px;font-size:14.5px;line-height:1.5}" +
  ".bp-bank{margin-top:12px}.bp-bank>summary{cursor:pointer;font-weight:600;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px}" +
  ".bp-bank>summary::-webkit-details-marker{display:none}.bp-bank>summary:after{content:'+';font-size:20px;line-height:1;color:var(--muted,#666)}.bp-bank[open]>summary:after{content:'-'}" +
  ".bp-bank form{margin-top:12px}.bp-row{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}@media(max-width:520px){.bp-row{grid-template-columns:1fr}}" +
  ".bp-saved{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-top:12px;font-size:14.5px}" +
  ".bp-mini{display:flex;align-items:center;gap:10px;flex-wrap:wrap;border:1px solid var(--line,#e5e5e5);border-radius:14px;padding:10px 14px;margin-bottom:16px;font-size:14px}" +
  ".bp-mini span.t{flex:1;min-width:180px}.bp-mini .st{margin:0}" +
  ".notice.bp-today{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}.notice.bp-today>span{flex:1 1 220px}";
document.head.appendChild(css);

var STRIPE = '<span class="bp-stripe" role="img" aria-label="Stripe">stripe</span>';
var FEE_NOTE = "Book Homes keeps its commission and Stripe takes its card fee from your share.";
var UNTIL = "Until then we pay you by bank transfer after check-in.";

// Barclays Bank Plc -> Barclays; keeps short all-capital names (HSBC, TSB)
function bankName(n){
  if (!n) return "";
  var s = String(n).replace(/\b(bank\s+)?(plc|limited|ltd|uk|u\.k\.)\b\.?/gi, "").replace(/\s+/g, " ").trim() || String(n);
  return s.split(" ").map(function(w){ return w.length <= 4 && w === w.toUpperCase() ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); }).join(" ");
}
function state(h){
  if (h.connect_status === "enabled") return "on";
  if (!h.has_stripe) return "none";
  if (h.connect_status === "restricted" || h.connect_waiting_on === "host") return "more";
  return "checking";
}
var BADGE = {on: ["approved", "Connected"], checking: ["pending", "Stripe checking your details"], more: ["rejected", "Needs more details"], none: ["draft", "Not started"]};
function cap(t){ t = String(t || ""); return t.charAt(0).toUpperCase() + t.slice(1); }
function badge(st){ return '<span class="st ' + BADGE[st][0] + '">' + BADGE[st][1] + "</span>"; }
function acctLine(h){
  var b = bankName(h.payout_bank_name), l4 = h.payout_bank_last4;
  return l4 ? (b ? esc(b) + " · " : "") + "account ending " + esc(l4) : b ? esc(b) : "";
}

function renderBox(me){
  var h = me.host || {}, st = state(h), out = "";
  if (st === "on"){
    var acct = acctLine(h);
    out = '<div class="bp-head">' + STRIPE + "<b>Payouts</b>" + badge(st) + "</div>" +
      '<dl class="bp-dl">' + (acct ? "<dt>Bank</dt><dd>" + acct + "</dd>" : "<dt>Bank</dt><dd>Shown in Stripe</dd>") +
      (h.payout_schedule ? "<dt>Schedule</dt><dd>" + esc(cap(h.payout_schedule)) + "</dd>" : "") + (h.payout_currency && String(h.payout_currency).toUpperCase() !== "GBP" ? "<dt>Currency</dt><dd>" + esc(h.payout_currency) + "</dd>" : "") + "</dl>" +
      '<p class="bp-txt">Stripe pays your share to your bank after each booking. ' + FEE_NOTE + "</p>";
  } else if (st === "checking"){
    out = '<div class="bp-head">' + STRIPE + "<b>Payout setup</b>" + badge(st) + "</div>" +
      '<p class="bp-txt">This usually takes a few minutes. If you stopped part way, tap Finish payout setup. ' + UNTIL + "</p>";
  } else if (st === "more"){
    out = '<div class="bp-head">' + STRIPE + "<b>Payout setup</b>" + badge(st) + "</div>" +
      '<p class="bp-txt">Stripe needs a few more details before it can pay you. ' + UNTIL + "</p>";
  } else {
    out = '<div class="bp-head">' + STRIPE + "<b>Get paid automatically</b></div>" +
      '<p class="bp-txt">Connect your bank through Stripe and guests pay you directly. ' + FEE_NOTE + " " + UNTIL + "</p>";
  }
  $("#payoutState").innerHTML = out;
  var cb = $("#connectBtn"), acts = cb && cb.parentNode;
  if (cb){
    cb.textContent = st === "none" ? "Connect payouts with Stripe" : "Finish payout setup";
    cb.classList.toggle("hidden", st === "on");
  }
  var mb = $("#bpManage");
  if (!mb && acts){
    mb = document.createElement("button"); mb.type = "button"; mb.id = "bpManage"; mb.className = "btn ghost";
    mb.innerHTML = "Manage in Stripe"; acts.insertBefore(mb, cb); mb.addEventListener("click", manage);
  }
  if (mb) mb.classList.toggle("hidden", st !== "on");
}

function manage(){
  var b = this, w = null;
  try { w = window.open("", "_blank"); } catch (e) { w = null; }
  b.disabled = true; $("#connectOut").textContent = "Opening Stripe...";
  H().api("bookhomes-connect-onboard", {action: "dashboard"}).then(function(j){
    b.disabled = false;
    if (!j.url){ if (w) w.close(); $("#connectOut").textContent = j.message || "Stripe isn't available just now."; return; }
    $("#connectOut").textContent = "";
    if (w){ try { w.opener = null; } catch (e) {} w.location.href = j.url; } else location.assign(j.url);
  }).catch(function(err){ b.disabled = false; if (w) w.close(); $("#connectOut").textContent = err.message; });
}

/* ---------- bank details for bank transfers (hosts not on Stripe) ---------- */
var bankKey = null, editing = false;
function fmtSort(v){ var d = String(v || "").replace(/\D/g, "").slice(0, 6); return d.replace(/^(\d{2})(\d{1,2})/, "$1-$2").replace(/^(\d{2}-\d{2})(\d{1,2})/, "$1-$2"); }
function bankForm(){
  return '<form id="bpForm" novalidate>' +
    '<label class="f2">Account holder name<input type="text" id="bpHolder" autocomplete="name" maxlength="70" required></label>' +
    '<div class="bp-row"><label class="f2">Sort code<input type="text" id="bpSort" inputmode="numeric" autocomplete="off" placeholder="12-34-56" maxlength="8" required></label>' +
    '<label class="f2">Account number<input type="text" id="bpAcc" inputmode="numeric" autocomplete="off" placeholder="8 digits" maxlength="8" required></label></div>' +
    '<p class="m" style="margin:0 0 10px">Kept encrypted and only used to pay you.</p>' +
    '<div id="bpMsg"></div><div class="acts"><button class="btn" type="submit" id="bpSave">Save bank details</button>' + (bankOf() ? '<button class="btn ghost" type="button" id="bpCancel">Cancel</button>' : "") + "</div></form>";
}
function bankOf(){ var me = H() && H().me(); return me && me.bank_account; }
function renderBank(me, force){
  var h = me.host || {}, on = state(h) === "on", bank = me.bank_account || null;
  var box = $("#bpBank");
  if (!box){
    var anchor = $("#payoutState") && $("#payoutState").closest(".box2");
    if (!anchor) return;
    box = document.createElement("div"); box.id = "bpBank"; anchor.parentNode.insertBefore(box, anchor.nextSibling);
  }
  var key = JSON.stringify([on, bank && bank.last4, bank && bank.sort_code_masked, bank && bank.holder_name]);
  if (!force && (key === bankKey || editing)) return;
  bankKey = key;
  if (on){ box.innerHTML = ""; return; }
  var inner = bank ?
    '<div class="bp-saved"><span>We pay you by bank transfer to:<br><b>' + esc(bank.holder_name) + "</b><br>Sort code " + esc(bank.sort_code_masked) + " · account ending " + esc(bank.last4) + '</span><span class="acts" style="margin:0"><button type="button" class="btn ghost sm" id="bpReplace">Replace</button><button type="button" class="btn ghost sm" id="bpRemove">Remove</button></span></div><div id="bpMsg"></div>'
    : bankForm();
  box.innerHTML = '<details class="box2 bp-bank"' + (bank ? " open" : "") + '><summary>' + (bank ? "Bank account for bank transfers" : "Or get paid by bank transfer") + "</summary>" + inner + "</details>";
}
function msg(t, ok){ var m = $("#bpMsg"); if (m) m.innerHTML = t ? '<div class="msg ' + (ok ? "ok" : "err") + '">' + esc(t) + "</div>" : ""; }
function setBank(b){ var me = H().me(); if (me) me.bank_account = b; editing = false; renderBank(me, true); }

document.addEventListener("input", function(e){
  if (e.target.id === "bpSort"){ var p = e.target.selectionStart === e.target.value.length; e.target.value = fmtSort(e.target.value); if (p) e.target.selectionStart = e.target.selectionEnd = e.target.value.length; }
  if (e.target.id === "bpAcc") e.target.value = e.target.value.replace(/\D/g, "").slice(0, 8);
  if (e.target.closest && e.target.closest("#bpForm")) editing = true;
});
document.addEventListener("click", function(e){
  var t = e.target;
  if (t.id === "bpReplace"){ editing = true; var d = t.closest("details"); d.innerHTML = "<summary>Bank account for bank transfers</summary>" + bankForm(); d.open = true; $("#bpHolder").focus(); return; }
  if (t.id === "bpCancel"){ editing = false; renderBank(H().me(), true); return; }
  if (t.id === "bpRemove"){
    if (!confirm("Remove your bank details? We'll need them again to pay you by bank transfer.")) return;
    t.disabled = true;
    H().api("bookhomes-host", {action: "bank_delete"}).then(function(){ setBank(null); msg("Bank details removed.", true); }).catch(function(err){ t.disabled = false; msg(err.message); });
    return;
  }
  var go = t.closest && t.closest("[data-bp-go]");
  if (go){ var mt = document.querySelector('.tabs button[data-tab="earnings"]'); if (mt) mt.click(); setTimeout(function(){ var b = $("#payoutState"); if (b) b.scrollIntoView({block: "center"}); }, 50); }
});
document.addEventListener("submit", function(e){
  if (e.target.id !== "bpForm") return;
  e.preventDefault();
  var holder = $("#bpHolder").value.replace(/\s+/g, " ").trim(), sort = $("#bpSort").value.replace(/\D/g, ""), acc = $("#bpAcc").value.replace(/\D/g, "");
  if (holder.length < 2){ msg("Please enter the account holder's name as the bank has it."); return; }
  if (sort.length !== 6){ msg("The sort code should be 6 digits, like 12-34-56."); return; }
  if (acc.length !== 8){ msg("The account number should be 8 digits."); return; }
  var b = $("#bpSave"); b.disabled = true; b.textContent = "Saving..."; msg("");
  H().api("bookhomes-host", {action: "bank_save", holder_name: holder, sort_code: sort, account_number: acc}).then(function(j){
    setBank(j.bank_account || null); msg("Saved. We'll use this account for bank transfers.", true);
  }).catch(function(err){ b.disabled = false; b.textContent = "Save bank details"; msg(err.message); });
});

/* ---------- Today: compact line ---------- */
function renderToday(me){
  var h = me.host || {}, st = state(h), bank = me.bank_account, el = $("#payBanner");
  if (!el) return;
  // Connected: nothing to do, so Today stays quiet (bank and schedule are on the Earnings tab)
  if (st === "on"){ el.innerHTML = ""; return; }
  // One short line and one button (the full details live on the Earnings tab)
  var head = st === "more" ? "Stripe needs a few more details." : st === "checking" ? "Stripe is checking your details." : "Set up payouts";
  var tail = st === "checking" ? "Nothing to do for now." : st === "more" ? "Finish setup to get paid automatically." : "to get paid straight to your bank.";
  var btn = st === "checking" ? '<button type="button" class="btn ghost sm" data-bp-go>Details</button>' : '<button type="button" class="btn sm" data-gopayout>' + (h.has_stripe ? "Finish setup" : "Set up payouts") + "</button>";
  el.innerHTML = '<div class="notice bp-today"><span>' + STRIPE.replace("bp-stripe", "bp-stripe sm") + " <b>" + head + "</b> " + tail +
    (bank && st === "none" ? " Until then we pay you by bank transfer." : "") + "</span>" + btn + "</div>";
}

/* Refresh the payout details from Stripe once per visit when the host has a Stripe account (bank name, last 4, schedule). */
var refreshed = false;
function refreshFromStripe(me){
  var h = me.host || {};
  if (refreshed || !h.has_stripe || !H()) return;
  refreshed = true;
  H().api("bookhomes-connect-onboard", {action: "status"}).then(function(j){
    if (j && j.connect_enabled !== false) return H().refresh();
  }).catch(function(){});
}

window.BHPay = {
  render: function(me){
    if (!me) return;
    try { renderBox(me); renderBank(me); renderToday(me); } catch (e) { if (window.console) console.error("payouts", e); }
    var h = me.host || {};
    if (h.has_stripe && (h.connect_status !== "enabled" || !h.payout_bank_last4)) setTimeout(function(){ refreshFromStripe(me); }, 1500);
  }
};
document.addEventListener("click", function(e){
  var t = e.target.closest && e.target.closest('.tabs button[data-tab="earnings"], .tabs button[data-tab="menu"]');
  if (t && H() && H().me()) refreshFromStripe(H().me());
});
})();
