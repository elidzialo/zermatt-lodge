/* Book Homes "Confirm and pay": once dates are chosen, Reserve opens a full checkout screen (like the big platforms).
   It moves the existing #reserveForm (details, receipt, promo, errors) into the screen, so stay.js still does the
   validation and the Stripe hand-off exactly as before. Back (button or browser) puts the form back in the card. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var rf = $("#reserveForm"), card = $("#bookcard");
if (!rf || !card) return;
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function txt(el){ return el ? el.textContent.replace(/\s+/g, " ").trim() : ""; }
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function hasDates(){ var a = $("#sCi"), b = $("#sCo"); return a && b && !a.classList.contains("ph") && !b.classList.contains("ph"); }
var home = {parent: rf.parentNode, next: rf.nextSibling}, cp = null, isOpen = false, obs = [];

function policyText(){
  var h = $$(".know h3").filter(function(x){ return /cancellation/i.test(x.textContent); })[0];
  var t = h ? txt(h.nextElementSibling) : txt($("#lpPolicy"));
  return t || "Shown on the listing before you pay.";
}
function build(){
  cp = document.createElement("div");
  cp.className = "cp"; cp.id = "cpay"; cp.setAttribute("role", "dialog"); cp.setAttribute("aria-modal", "true"); cp.setAttribute("aria-labelledby", "cpH");
  var g = $("#bkGuests"), opts = g ? g.innerHTML : "";
  cp.innerHTML =
    '<div class="cp-bar"><button type="button" class="iconbtn cp-back" id="cpBack" aria-label="Back to the listing">' + icon("chev_l") + '</button><h1 id="cpH" tabindex="-1">Confirm and pay</h1></div>' +
    '<div class="cp-grid">' +
      '<div class="cp-main">' +
        '<section class="cp-sec cp-free">' + icon("tag") + '<div><b>No booking fees</b><span>The total below is what you pay. Cleaning is included and nothing is added at checkout.</span></div></section>' +
        '<section class="cp-sec"><h2>Your trip</h2>' +
          '<div class="cp-row"><div><b>Dates</b><span id="cpDates"></span></div><button type="button" class="link" id="cpEditDates">Edit</button></div>' +
          '<div class="cp-row"><div><b>Guests</b><label class="sr-only" for="cpGuests">Guests</label><select id="cpGuests">' + opts + '</select></div></div>' +
        '</section>' +
        '<section class="cp-sec cp-mobile-price" aria-label="Price details"><h2>Price details</h2><div class="bd cp-bd" data-bd></div></section>' +
        '<section class="cp-sec"><h2>Pay with</h2><p class="cp-pay">' + icon("lock") + '<span>Card payment on Stripe\'s secure page. Your dates are held while you pay. We never see your card number.</span></p></section>' +
        '<section class="cp-sec"><h2>Cancellation policy</h2><p class="muted" id="cpPolicy"></p></section>' +
        '<section class="cp-sec cp-formsec"><h2>Your details</h2><div id="cpForm"></div>' +
          '<p class="cp-legal">By selecting the button, you agree to the <a href="/terms/guests" target="_blank" rel="noopener">guest terms</a> and the host\'s house rules.</p></section>' +
      '</div>' +
      '<aside class="cp-side"><div class="cp-card">' +
        '<div class="cp-home"><span class="cp-ph" id="cpPh"></span><div><b id="cpTitle"></b><span id="cpSub"></span><span id="cpRt"></span></div></div>' +
        '<div class="cp-side-price"><h2>Price details</h2><div class="bd cp-bd" data-bd></div></div>' +
      '</div></aside>' +
    '</div>';
  document.body.appendChild(cp);
  $("#cpBack").addEventListener("click", function(){ history.state && history.state.cpay ? history.back() : close(); });
  $("#cpEditDates").addEventListener("click", function(){
    history.state && history.state.cpay ? history.back() : close();
    setTimeout(function(){ var b = $("#sCiBtn"); if (b) b.click(); }, 60);
  });
  $("#cpGuests").addEventListener("change", function(){ var g = $("#bkGuests"); g.value = this.value; g.dispatchEvent(new Event("change", {bubbles: true})); });
}
function fill(){
  var ph = $("#galTrack img, .gal img, .gal-track img");
  $("#cpPh").innerHTML = ph ? '<img src="' + esc(ph.currentSrc || ph.src) + '" alt="" width="120" height="100">' : "";
  $("#cpTitle").textContent = txt($("#lpTitle"));
  $("#cpSub").textContent = txt($(".lp-sum h2"));
  var rt = $(".lp-rt"); $("#cpRt").innerHTML = rt ? '<svg class="ic st" aria-hidden="true"><use href="#i-star"/></svg>' + esc(txt(rt)) : "";
  $("#cpDates").textContent = txt($("#sCi")) + " to " + txt($("#sCo"));
  $("#cpGuests").value = $("#bkGuests").value;
  $("#cpPolicy").textContent = policyText();
  syncPrice();
}
/* "Booking fee £0" row in the reserve card's price details too */
function decorate(){
  var bd = $("#breakdown"); if (!bd || $(".bd-free", bd)) return;
  var t = $(".bd-total", bd); if (!t) return;
  var r = document.createElement("div"); r.className = "bd-row bd-free"; r.innerHTML = "<span>Booking fee</span><span>£0</span>";
  bd.insertBefore(r, t);
}
if ($("#breakdown")){ new MutationObserver(decorate).observe($("#breakdown"), {childList: true}); decorate(); }
function syncPrice(){
  if (!cp) return;
  decorate();
  var src = $("#breakdown"), h = src ? src.innerHTML : "";
  $$("[data-bd]", cp).forEach(function(b){ b.innerHTML = h; });
  if (isOpen){ $("#cpDates").textContent = txt($("#sCi")) + " to " + txt($("#sCo")); }
}
function btnText(){
  var b = $("#reserveBtn"); if (!b || !isOpen || b.disabled) return;
  if (b.textContent !== "Confirm and pay") b.textContent = "Confirm and pay";
}
function open(push){
  if (!cp) build();
  fill();
  $("#cpForm").appendChild(rf);
  var w = $("#detWrap"); if (w) w.hidden = false;
  isOpen = true; btnText();
  obs = [new MutationObserver(syncPrice), new MutationObserver(btnText)];
  obs[0].observe($("#breakdown"), {childList: true, subtree: true, characterData: true});
  obs[1].observe($("#reserveBtn"), {childList: true, characterData: true, subtree: true, attributes: true});
  document.documentElement.classList.add("locked");
  cp.hidden = false; cp.scrollTop = 0;
  void cp.offsetWidth; cp.classList.add("in");
  if (push !== false) try { history.pushState({cpay: 1}, ""); } catch (e) {}
  setTimeout(function(){ var n = $("#bkName"); if (n && !n.value && window.matchMedia("(min-width:950px)").matches) n.focus({preventScroll: true}); else $("#cpH").focus({preventScroll: true}); }, 60);
}
function close(){
  if (!isOpen) return;
  isOpen = false;
  obs.forEach(function(o){ o.disconnect(); }); obs = [];
  home.parent.insertBefore(rf, home.next);
  var w = $("#detWrap"); if (w) w.hidden = true;
  var b = $("#reserveBtn"); if (b && !b.disabled) b.textContent = "Reserve";
  cp.classList.remove("in"); cp.hidden = true;
  document.documentElement.classList.remove("locked");
  var r = $("#reserveBtn"); if (r) r.focus({preventScroll: true});
}
window.addEventListener("popstate", function(){ if (isOpen) close(); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape" && isOpen && !document.querySelector(".dp:not([hidden])")) $("#cpBack").click(); });

/* Reserve (card) and the phone bar: open the checkout screen once dates are set */
window.addEventListener("submit", function(e){
  if (e.target !== rf || isOpen || !hasDates()) return;
  e.preventDefault(); e.stopImmediatePropagation(); open();
}, true);
window.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("#mbookBtn");
  if (!b || isOpen || !hasDates()) return;
  e.preventDefault(); e.stopPropagation(); open();
}, true);
/* Coming back from Stripe with the back button: never leave the page stuck behind the screen */
window.addEventListener("pageshow", function(ev){ if (ev.persisted && isOpen) close(); });
})();
