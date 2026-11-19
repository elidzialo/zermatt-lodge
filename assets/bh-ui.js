/* Book Homes shared UI: the account menu in the header. */
(function(){
"use strict";
var btns = Array.prototype.slice.call(document.querySelectorAll(".ubtn"));
function closeAll(except){ btns.forEach(function(b){ if (b === except) return; b.setAttribute("aria-expanded", "false"); var l = document.getElementById(b.getAttribute("aria-controls")); if (l) l.hidden = true; }); }
btns.forEach(function(b){
  b.addEventListener("click", function(e){
    e.stopPropagation();
    var l = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") === "true";
    closeAll(b); b.setAttribute("aria-expanded", open ? "false" : "true"); if (l) l.hidden = open;
  });
});
document.addEventListener("click", function(e){ if (!e.target.closest || !e.target.closest(".umlist")) closeAll(null); });
document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeAll(null); });
})();
