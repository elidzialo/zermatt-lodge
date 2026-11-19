/* After Stripe Checkout: confirm the booking with the server (which asks Stripe directly), then show the
   summary and, once paid, the host's phone and WhatsApp for arranging arrival. */
(function(){
"use strict";
var box = document.getElementById("bkState");
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
var fmt = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC"});
function d(s){ return fmt.format(new Date(s + "T00:00:00Z")); }
var sid = new URLSearchParams(location.search).get("session_id") || "";
if (!/^cs_(live|test)_[A-Za-z0-9]+$/.test(sid)){ box.innerHTML = "<h1>Booking</h1><p>We couldn't find your booking reference. Check your confirmation email.</p>"; return; }
var tries = 0;
function check(){
  fetch("/api/bh/create-checkout", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({confirm_session: sid})})
    .then(function(r){ return r.json(); })
    .then(function(j){
      if (j.status === "paid"){
        var h = j.host || {}, wa = String(h.whatsapp || h.phone || "").replace(/[^\d]/g, "");
        box.innerHTML = "<h1>You're booked!</h1><p>" + esc(j.listing_title) + ", reference <b>" + esc(j.reference) + "</b>. A confirmation email is on its way.</p>" +
          "<ul class='hl' style='margin:20px 0'><li><div><b>Check-in</b><span>" + d(j.check_in) + ", from " + esc(j.check_in_time) + "</span></div></li>" +
          "<li><div><b>Checkout</b><span>" + d(j.check_out) + ", by " + esc(j.check_out_time) + "</span></div></li>" +
          "<li><div><b>Total paid</b><span>£" + (j.amount_pence / 100).toFixed(2) + " for " + j.nights + " nights, " + j.guests + " guests. No booking fees.</span></div></li></ul>" +
          "<h2>Contact your host</h2><p>" + esc(h.name || "Your host") + " will send the address and access details before you arrive.</p><p style='display:flex;gap:10px;flex-wrap:wrap;margin-top:12px'>" +
          (wa ? "<a class='btn' href='https://wa.me/" + wa + "' rel='noopener'>WhatsApp " + esc(h.name || "host") + "</a>" : "") +
          (h.phone ? "<a class='btn ghost' href='tel:" + esc(String(h.phone).replace(/[^\d+]/g, "")) + "'>Call " + esc(h.phone) + "</a>" : "") + "</p>";
      } else if (j.status === "cancelled_conflict"){
        box.innerHTML = "<h1>Sorry, those dates have just gone</h1><p>Someone else booked the same dates at the same moment. You have been refunded in full; it usually shows within 5-10 working days.</p><p><a class='btn' href='/stays'>Find other dates</a></p>";
      } else retry();
    })
    .catch(retry);
}
function retry(){
  if (++tries < 8){ setTimeout(check, 2500); return; }
  box.innerHTML = "<h1>Thank you, your payment went through</h1><p>Your confirmation is taking a little longer than usual; you'll get an email shortly.</p>";
}
check();
})();
