/* Book Homes listing page extras: photo viewer and the approximate-area map (OpenStreetMap + Leaflet).
   The map shows a circle around the rounded location only, never a pin on the house. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var lb = $("#lbox");
function openLb(i){
  if (!lb) return;
  lb.hidden = false; document.body.style.overflow = "hidden";
  var imgs = lb.querySelectorAll(".lbg img"); if (imgs[i]) imgs[i].scrollIntoView();
  $("#lbClose").focus();
}
function closeLb(){ lb.hidden = true; document.body.style.overflow = ""; }
document.addEventListener("click", function(e){
  var b = e.target.closest ? e.target.closest("[data-lb]") : null;
  if (b) openLb(+b.getAttribute("data-lb") || 0);
});
if (lb){ $("#lbClose").addEventListener("click", closeLb); document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !lb.hidden) closeLb(); }); }

function drawMap(){
  var S = window.STAY || {}, el = $("#lmap");
  if (!el || S.lat == null || S.lng == null) { if (el) el.style.display = "none"; return; }
  if (!window.L) return setTimeout(drawMap, 300);
  var m = L.map(el, {scrollWheelZoom: false, zoomControl: true}).setView([S.lat, S.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 14, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(m);
  L.circle([S.lat, S.lng], {radius: 900, color: "#1f4d3a", weight: 1.5, fillOpacity: .15}).addTo(m);
}
if (document.readyState === "complete") drawMap(); else window.addEventListener("load", drawMap);
})();
