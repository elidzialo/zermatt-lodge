/* Review page: only reachable from the emailed link after a completed, paid stay. One review per booking. */
(function(){
"use strict";
var box = document.getElementById("rvBox");
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
var t = new URLSearchParams(location.search).get("t") || "";
fetch("/api/bh/listings?action=review_info&t=" + encodeURIComponent(t)).then(function(r){ return r.json().then(function(j){ return {ok: r.ok, j: j}; }); }).then(function(r){
  if (!r.ok){ box.innerHTML = "<p>" + esc(r.j.error || "That review link is not valid.") + "</p>"; return; }
  var j = r.j;
  if (j.reviewed){ box.innerHTML = "<p>Thank you, you've already reviewed your stay at " + esc(j.title) + ".</p>"; return; }
  if (!j.done){ box.innerHTML = "<p>You can review " + esc(j.title) + " after checkout on " + esc(j.check_out) + ".</p>"; return; }
  box.innerHTML = "<p>Your stay at <b>" + esc(j.title) + "</b>, " + esc(j.check_in) + " to " + esc(j.check_out) + ".</p>" +
    "<form id='rvF'><fieldset style='border:0;margin:16px 0'><legend style='font-weight:600;margin-bottom:8px'>Your rating</legend>" +
    [5,4,3,2,1].map(function(n){ return "<label style='display:block;padding:6px 0'><input type='radio' name='r' value='" + n + "'> " + n + " star" + (n > 1 ? "s" : "") + "</label>"; }).join("") +
    "</fieldset><label style='display:block;font-weight:600'>Your review<textarea id='rvC' maxlength='2000' rows='6' style='display:block;width:100%;margin-top:6px;font:inherit;font-size:16px;padding:10px;border:1px solid #a9aeaa;border-radius:10px'></textarea></label>" +
    "<button class='btn' type='submit' style='margin-top:14px'>Post review</button><p id='rvM' style='margin-top:10px'></p></form>";
  document.getElementById("rvF").addEventListener("submit", function(e){
    e.preventDefault();
    var r = document.querySelector("input[name=r]:checked"), m = document.getElementById("rvM");
    if (!r){ m.textContent = "Please choose a star rating."; return; }
    fetch("/api/bh/listings", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({action: "review", t: t, rating: +r.value, comment: document.getElementById("rvC").value})})
      .then(function(x){ return x.json().then(function(j){ return {ok: x.ok, j: j}; }); })
      .then(function(x){ box.innerHTML = x.ok ? "<p>Thank you! Your review will appear on the listing.</p>" : "<p>" + esc(x.j.error || "Please try again.") + "</p>"; });
  });
}).catch(function(){ box.innerHTML = "<p>Please try again later.</p>"; });
})();
