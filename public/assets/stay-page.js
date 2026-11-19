/* Book Homes listing page: photo grid / swipe carousel, all-photos view, amenities and description dialogs,
   share and save, and the approximate-area map (OpenStreetMap + Leaflet, loaded only when needed).
   The map shows a circle around the rounded location only, never a pin on the house. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
var lastFocus = null;
function lock(on){ document.documentElement.classList.toggle("locked", on); }

/* Dialogs: all photos, amenities, about */
function openBox(el, focusEl){ lastFocus = document.activeElement; el.hidden = false; lock(true); (focusEl || $("[data-close], #lbClose", el) || el).focus(); }
function closeBox(el){ el.hidden = true; if (!$$(".modal:not([hidden]), .lb:not([hidden])").length) lock(false); if (lastFocus && lastFocus.focus) lastFocus.focus({preventScroll: true}); }
var lb = $("#lbox");
document.addEventListener("click", function(e){
  var t = e.target.closest ? e.target : null; if (!t) return;
  var b = t.closest("[data-lb]");
  if (b && lb){
    if (b.classList.contains("gt") && window.matchMedia("(max-width:860px)").matches && b.closest("#galTrack") && Math.abs(dragX) > 6) return;
    var i = +b.getAttribute("data-lb") || 0;
    openBox(lb, $("#lbClose"));
    var im = $("#lbp" + i); if (im) setTimeout(function(){ im.scrollIntoView({block: "start"}); }, 0);
    return;
  }
  var m = t.closest("[data-modal]"); if (m){ var box = document.getElementById(m.getAttribute("data-modal")); if (box) openBox(box); return; }
  var c = t.closest("[data-close]"); if (c){ closeBox(c.closest(".modal")); return; }
  if (t.classList.contains("modal")) closeBox(t);
});
if (lb) $("#lbClose").addEventListener("click", function(){ closeBox(lb); });
document.addEventListener("keydown", function(e){
  if (e.key !== "Escape") return;
  var open = $$(".modal:not([hidden]), .lb:not([hidden])").pop(); if (open) closeBox(open);
});

/* Phone: swipe carousel with a counter */
var track = $("#galTrack"), count = $("#galCount"), dragX = 0;
if (track && count){
  var tiles = $$(".gt", track);
  var upd = function(){ var w = track.clientWidth || 1; count.textContent = Math.min(tiles.length, Math.round(track.scrollLeft / w) + 1) + " / " + tiles.length; };
  track.addEventListener("scroll", function(){ window.requestAnimationFrame(upd); }, {passive: true});
  var sx = 0;
  track.addEventListener("touchstart", function(e){ sx = e.touches[0].clientX; dragX = 0; }, {passive: true});
  track.addEventListener("touchmove", function(e){ dragX = e.touches[0].clientX - sx; }, {passive: true});
}

/* About: only offer "Show more" when the text is actually cut off */
var about = $("#aboutTxt"), moreBtn = $(".morebtn");
function checkMore(){ if (about && moreBtn) moreBtn.hidden = about.scrollHeight <= about.clientHeight + 4; }
checkMore(); window.addEventListener("load", checkMore);

/* Share and save (saved homes are kept on this device only) */
function saved(){ try { return JSON.parse(localStorage.getItem("bh_saved") || "[]"); } catch (e) { return []; } }
function setSaved(a){ try { localStorage.setItem("bh_saved", JSON.stringify(a)); } catch (e) {} }
function paintSave(){ var s = saved(); $$("[data-save]").forEach(function(b){ var on = s.indexOf(+b.getAttribute("data-save")) >= 0; b.setAttribute("aria-pressed", on ? "true" : "false"); var l = $("span", b); if (l) l.textContent = on ? "Saved" : "Save"; }); }
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("[data-save]");
  if (b){ var id = +b.getAttribute("data-save"), s = saved(), k = s.indexOf(id); if (k >= 0) s.splice(k, 1); else s.push(id); setSaved(s); paintSave(); return; }
  var sh = e.target.closest && e.target.closest("[data-share]");
  if (sh){
    if (navigator.share){ navigator.share({title: document.title, url: location.href.split("?")[0]}).catch(function(){}); return; }
    if (navigator.clipboard){ navigator.clipboard.writeText(location.href.split("?")[0]).then(function(){ var l = $("span", sh); if (l){ var o = l.textContent; l.textContent = "Link copied"; setTimeout(function(){ l.textContent = o; }, 2000); } }, function(){}); }
  }
});
paintSave();

/* Map: Leaflet loads only when the map is near the screen or asked for */
var mapEl = $("#lmap"), mapDone = false;
function loadLeaflet(cb){
  if (window.L) return cb();
  var css = document.createElement("link"); css.rel = "stylesheet"; css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(css);
  var s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = cb; document.body.appendChild(s);
}
function drawMap(){
  var S = window.STAY || {};
  if (mapDone || !mapEl) return;
  if (S.lat == null || S.lng == null){ mapEl.style.display = "none"; return; }
  mapDone = true;
  loadLeaflet(function(){
    mapEl.innerHTML = "";
    var m = L.map(mapEl, {scrollWheelZoom: false, zoomControl: true}).setView([S.lat, S.lng], 13);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 14, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
    L.circle([S.lat, S.lng], {radius: 900, color: "#1f4d3a", weight: 1.5, fillOpacity: .15}).addTo(m);
  });
}
var ml = $("#mapLoad"); if (ml) ml.addEventListener("click", drawMap);
if (mapEl && "IntersectionObserver" in window){
  var io = new IntersectionObserver(function(es){ if (es[0].isIntersecting){ io.disconnect(); drawMap(); } }, {rootMargin: "300px"});
  io.observe(mapEl);
}

/* Bottom bar hides while the reserve card is on screen (phones) */
var mbook = $("#mbook"), card = $("#bookcard");
if (mbook && card && "IntersectionObserver" in window){
  new IntersectionObserver(function(es){ mbook.classList.toggle("away", es[0].isIntersecting); }, {threshold: 0.2}).observe(card);
}
})();
