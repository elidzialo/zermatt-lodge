/* Book Homes analytics: first-party and cookie-free. Pageviews + events go to /api/collect (our own Supabase function)
   with navigator.sendBeacon, after the page has loaded, so it never slows a page down. No cookies, no third parties.
   A random visitor id (localStorage) and session id (sessionStorage) count unique visitors; the server never stores IPs.
   Do Not Track / Global Privacy Control are honoured. Events: pageview, search, listing_view, reserve_click, checkout_start.
   Vercel Web Analytics is still wired up behind ANALYTICS_ON (off: it needs the Vercel dashboard switch). */
(function () {
  "use strict";
  var ANALYTICS_ON = false;
  var URL_ = "/api/collect";
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
  if (ANALYTICS_ON) {
    var s = document.createElement("script");
    s.defer = true; s.src = "/_vercel/insights/script.js";
    document.head.appendChild(s);
  }

  var nav = navigator, loc = location;
  var off = nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.globalPrivacyControl === true ||
    !/(^|\.)bookhomes\.co\.uk$/.test(loc.hostname) || /^\/(admin|host)(\/|$)/.test(loc.pathname);

  function rid() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var h = rid() + rid();
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-4" + h.slice(13, 16) + "-a" + h.slice(17, 20) + "-" + h.slice(20, 32);
  }
  function store(kind, key, ttl) {
    try {
      var st = window[kind], now = Date.now(), v = JSON.parse(st.getItem(key) || "null");
      if (!v || !v.id || (ttl && now - v.t > ttl)) v = { id: rid() };
      v.t = now; st.setItem(key, JSON.stringify(v));
      return v.id;
    } catch (e) { return rid(); }
  }
  var vid = off ? "" : store("localStorage", "bh_vid", 0);
  var sid = off ? "" : store("sessionStorage", "bh_sid", 30 * 60e3);  // new session after 30 min idle

  function send(o) {
    if (off) return;
    o.sid = sid; o.vid = vid;
    var body = JSON.stringify(o);
    try {
      if (nav.sendBeacon && nav.sendBeacon(URL_, body)) return;
      fetch(URL_, { method: "POST", body: body, keepalive: true, credentials: "omit" });
    } catch (e) {}
  }

  var stay = window.STAY || {};
  var slug = stay.slug || loc.pathname.replace(/^\//, "") || "home";

  function track(name, data) {
    try { window.va("event", { name: name, data: data || {} }); } catch (e) {}
    send({ e: name, p: loc.pathname, l: (data && data.listing) || null, d: data || null });
  }
  window.bhTrack = track;

  // ---- pageview, sent once the page has loaded (never blocks rendering)
  var pv = uuid(), shown = 0, visibleSince = document.visibilityState === "visible" ? Date.now() : 0, lastSent = 0, beats = 0;
  function pageview() {
    var q = new URLSearchParams(loc.search), ref = document.referrer, lt = null;
    try {
      if (ref && new URL(ref).hostname === loc.hostname) ref = "";
      var n = performance.getEntriesByType && performance.getEntriesByType("navigation")[0];
      if (n && n.loadEventEnd > 0) lt = Math.round(n.loadEventEnd);
      else if (n && n.domContentLoadedEventEnd > 0) lt = Math.round(n.domContentLoadedEventEnd);
    } catch (e) { ref = ""; }
    var u = q.get("utm_source") || q.get("utm_medium") || q.get("utm_campaign")
      ? { s: q.get("utm_source"), m: q.get("utm_medium"), c: q.get("utm_campaign") } : null;
    send({ e: "pageview", id: pv, p: loc.pathname, r: ref || null, u: u, sw: screen.width, lg: nav.language, lt: lt });
    if (window.STAY) track("listing_view", { listing: slug });
  }
  function engagedMs() { return shown + (visibleSince ? Date.now() - visibleSince : 0); }
  function engage() {
    var ms = engagedMs();
    if (ms - lastSent < 1000) return;
    lastSent = ms;
    send({ e: "engage", id: pv, ms: ms });
  }
  if (!off) {
    var start = function () { setTimeout(pageview, 0); };
    if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") { if (visibleSince) shown += Date.now() - visibleSince; visibleSince = 0; engage(); }
      else if (!visibleSince) visibleSince = Date.now();
    });
    window.addEventListener("pagehide", engage);
    // still here: keeps "live now" accurate, every 60 s while the tab is visible, for up to 30 minutes
    var hb = setInterval(function () {
      if (++beats > 30) return clearInterval(hb);
      if (document.visibilityState === "visible") engage();
    }, 60e3);
  }

  // search: desktop search bar submit, phone search sheet "Search" button
  var lastSearch = 0;
  function searched() {
    var now = Date.now();
    if (now - lastSearch < 1500) return;  // one event per search
    lastSearch = now;
    track("search", { page: loc.pathname });
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
