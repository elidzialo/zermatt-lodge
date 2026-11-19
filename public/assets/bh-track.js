/* Book Homes conversion events (optimiser). Privacy-friendly: Vercel Web Analytics only, first-party
   (/_vercel/insights), no cookies, no third-party trackers. Events: search, listing_view, reserve_click,
   checkout_start. Events queue in window.vaq until ANALYTICS_ON is true.
   To switch on: enable Web Analytics in Vercel (project > Analytics), then set ANALYTICS_ON = true and rebuild.
   While it is off the script is not requested, so there is no 404 in the console. */
(function () {
  "use strict";
  var ANALYTICS_ON = false;
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  if (ANALYTICS_ON) {
    var s = document.createElement("script");
    s.defer = true; s.src = "/_vercel/insights/script.js";
    document.head.appendChild(s);
  }

  function track(name, data) {
    try { window.va("event", { name: name, data: data || {} }); } catch (e) {}
  }
  window.bhTrack = track;
  var stay = window.STAY || {};
  var slug = stay.slug || location.pathname.replace(/^\//, "") || "home";

  // listing view: listing pages set window.STAY
  if (window.STAY) track("listing_view", { listing: slug });

  // search: desktop search bar submit, phone search sheet "Search" button
  var lastSearch = 0;
  function searched() {
    var now = Date.now();
    if (now - lastSearch < 1500) return;  // one event per search
    lastSearch = now;
    track("search", { page: location.pathname });
  }
  document.addEventListener("submit", function (e) {
    if (e.target && e.target.id === "sbar") searched();
  }, true);
  document.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target.closest("#spGo, #reserveBtn, #mbookBtn") : null;
    if (!t) return;
    if (t.id === "spGo") searched();
    else track("reserve_click", { listing: slug, where: t.id === "mbookBtn" ? "mobile_bar" : "booking_box" });
  }, true);

  // checkout start: the booking widget POSTs to a create-checkout endpoint before redirecting to Stripe
  if (window.fetch) {
    var f = window.fetch;
    window.fetch = function (input) {
      try {
        var u = typeof input === "string" ? input : (input && input.url) || "";
        if (window.STAY && /\/api\/(bh\/)?create-checkout/.test(u)) track("checkout_start", { listing: slug });
      } catch (e) {}
      return f.apply(this, arguments);
    };
  }
})();
