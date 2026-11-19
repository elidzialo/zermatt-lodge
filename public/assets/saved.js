/* Book Homes /saved: homes saved with the heart (localStorage "bh_saved"), shown as cards.
   Share sends a link (/saved?ids=1,2) so a group sees the same list; "Save all" copies a shared list into yours. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
function money(n){ n = +n || 0; return "£" + (n % 1 ? n.toFixed(2) : n.toLocaleString("en-GB")); }
function plural(n, w){ n = +n || 0; return n + " " + w + (n === 1 ? "" : "s"); }
function img(u, w){ return /assets\.guesty\.com/.test(u || "") && /\/w_\d+,/.test(u) ? u.replace(/\/w_\d+,/, "/w_" + w + ",") : u; }

var D = JSON.parse($("#bh-data").textContent), byId = {};
D.listings.forEach(function(l){ byId[+l.id] = l; });
function mine(){ try { return JSON.parse(localStorage.getItem("bh_saved") || "[]").map(Number); } catch (e) { return []; } }
function store(a){ try { localStorage.setItem("bh_saved", JSON.stringify(a)); } catch (e) {} }

var q = new URLSearchParams(location.search);
var shared = (q.get("ids") || "").split(",").map(Number).filter(function(id){ return byId[id]; });
var viewingShared = shared.length > 0 && shared.join(",") !== mine().join(",");

function ids(){ return (viewingShared ? shared : mine()).filter(function(id){ return byId[id]; }); }
function card(l){
  var p = (l.card_photos || [])[0], rv = l.reviews || {}, saved = mine().indexOf(+l.id) >= 0;
  var place = [l.city, String(l.area || "").split(",")[0].trim()].filter(function(x, i, a){ return x && a.indexOf(x) === i; }).join(", ");
  return '<article class="card" data-id="' + l.id + '"><div class="cph"><div class="track"><a class="sl" href="' + esc(l.url) + '">' +
    (p ? '<img src="' + esc(img(p.url, 720)) + '" alt="' + esc(p.caption || l.title) + '" width="720" height="684" loading="lazy" decoding="async">' : "") +
    '</a></div><button type="button" class="heart" aria-pressed="' + saved + '" aria-label="' + (saved ? "Remove " : "Save ") + esc(l.title) + '">' + icon("heart") + "</button></div>" +
    '<a class="meta" href="' + esc(l.url) + '"><span class="l1"><b>' + esc(place) + "</b>" + (rv.count ? '<span class="rt">' + icon("star").replace('class="ic"', 'class="ic st"') + (+rv.average).toFixed(2) + " (" + rv.count + ")</span>" : "") + "</span>" +
    '<span class="l2">' + esc(l.title) + '</span><span class="l2">' + plural(l.bedrooms, "bedroom") + " · " + plural(l.max_guests, "guest") + "</span>" +
    '<span class="pr">' + (l.from_price ? '<span class="from">From</span> <b>' + money(l.from_price) + "</b> night" : "<b>Add dates</b> for prices") + "</span></a></article>";
}
function render(){
  var list = ids();
  $("#svGrid").innerHTML = list.map(function(id){ return card(byId[id]); }).join("");
  $("#svEmpty").hidden = list.length > 0;
  $("#svShare").hidden = !list.length;
  $("#svShared").hidden = !viewingShared;
  $("#svH").textContent = viewingShared ? "Shared homes" : "Saved homes";
}
$("#svGrid").addEventListener("click", function(e){
  var h = e.target.closest(".heart"); if (!h) return;
  e.preventDefault();
  var id = +h.closest(".card").getAttribute("data-id"), m = mine(), k = m.indexOf(id);
  if (k >= 0) m.splice(k, 1); else m.push(id);
  store(m);
  if (viewingShared){ h.setAttribute("aria-pressed", k < 0 ? "true" : "false"); return; }
  var c = h.closest(".card"); c.style.transition = "opacity .2s"; c.style.opacity = "0";
  setTimeout(render, 200);
});
$("#svKeep").addEventListener("click", function(){
  var m = mine(); shared.forEach(function(id){ if (m.indexOf(id) < 0) m.push(id); }); store(m);
  viewingShared = false; history.replaceState(null, "", "/saved"); render();
});

/* Share: the phone's share sheet when there is one, otherwise WhatsApp / copy link */
function shareUrl(){ return location.origin + "/saved?ids=" + ids().join(","); }
function closeBox(){ var b = $(".sharebox"); if (b) b.remove(); }
$("#svShare").addEventListener("click", function(){
  var url = shareUrl(), text = "Homes I like on Book Homes";
  if (navigator.share){ navigator.share({title: text, url: url}).catch(function(){}); return; }
  closeBox();
  var box = document.createElement("div"); box.className = "sharebox"; box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-label", "Share list");
  box.innerHTML = '<div><h2>Share this list</h2><a href="https://wa.me/?text=' + encodeURIComponent(text + " " + url) + '" target="_blank" rel="noopener">' + icon("chat") + "WhatsApp</a>" +
    '<a href="mailto:?subject=' + encodeURIComponent(text) + "&body=" + encodeURIComponent(url) + '">' + icon("mail") + "Email</a>" +
    '<button type="button" class="opt" id="svCopy">' + icon("link") + '<span>Copy link</span></button><button type="button" class="link" id="svClose" style="margin-top:16px">Close</button></div>';
  document.body.appendChild(box);
  box.addEventListener("click", function(e){ if (e.target === box) closeBox(); });
  $("#svClose").addEventListener("click", closeBox);
  $("#svCopy").addEventListener("click", function(){
    var b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function(){ b.querySelector("span").textContent = "Link copied"; }, function(){ b.querySelector("span").textContent = url; });
  });
  $("#svCopy").focus();
});
document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeBox(); });
render();
})();
