/* Book Homes host portal: speed helpers (host-perf). Loaded before host.js. No dependencies.
   HP.cache   stale-while-revalidate store: memory first, then sessionStorage/localStorage (per signed-in user)
   HP.leaflet load Leaflet JS + CSS only when a map is shown (returns a promise)
   HP.gsi     load Google sign-in only when the login or sign-up screen is shown (returns a promise)
   HP.thumb   small image URL for cards and photo grids (Guesty/Cloudinary, Airbnb, our own uploads with a thumb)
   HP.thumbPath  storage path of the thumbnail written next to a new upload */
(function(){
  var HP = window.HP = {};
  var MEM = {}, PFX = "bh_hp1_", STORE = null;

  /* ---------- cache ---------- */
  // host.js sets the storage that matches the sign-in choice (localStorage when "trust this browser", else sessionStorage)
  HP.useStore = function(s){ STORE = s || null; };
  HP.get = function(key){
    if (MEM[key]) return MEM[key];
    try { var raw = STORE && STORE.getItem(PFX + key); if (raw){ MEM[key] = JSON.parse(raw); return MEM[key]; } } catch (e) {}
    return null;
  };
  // persist=false keeps it in memory only (calendar months, etc.)
  HP.put = function(key, v, persist){
    var e = {v: v, at: Date.now()}; MEM[key] = e;
    if (persist && STORE){ try { STORE.setItem(PFX + key, JSON.stringify(e)); } catch (x) {} }
    return v;
  };
  HP.drop = function(prefix){
    Object.keys(MEM).forEach(function(k){ if (!prefix || k.indexOf(prefix) === 0) delete MEM[k]; });
    [window.localStorage, window.sessionStorage].forEach(function(s){
      try { if (!s) return; Object.keys(s).forEach(function(k){ if (k.indexOf(PFX + (prefix || "")) === 0) s.removeItem(k); }); } catch (e) {}
    });
  };

  /* ---------- lazy scripts ---------- */
  var loading = {};
  function script(src, attrs){
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function(res, rej){
      var s = document.createElement("script"); s.src = src; s.async = true;
      Object.keys(attrs || {}).forEach(function(k){ s.setAttribute(k, attrs[k]); });
      s.onload = function(){ res(); }; s.onerror = function(){ delete loading[src]; rej(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }
  function css(href){
    if (document.querySelector('link[href="' + href + '"]')) return;
    var l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.crossOrigin = ""; document.head.appendChild(l);
  }
  var LEAF = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.";
  HP.leaflet = function(){
    if (window.L && window.L.map) return Promise.resolve(window.L);
    css(LEAF + "css");
    return script(LEAF + "js", {crossorigin: ""}).then(function(){ return window.L; });
  };
  HP.gsi = function(){
    if (window.google && google.accounts && google.accounts.id) return Promise.resolve();
    return script("https://accounts.google.com/gsi/client");
  };
  // warm the connection while the browser is idle, so the first map opens fast
  HP.warm = function(){ ["https://unpkg.com", "https://a.tile.openstreetmap.org"].forEach(function(h){ var l = document.createElement("link"); l.rel = "preconnect"; l.href = h; l.crossOrigin = ""; document.head.appendChild(l); }); };

  /* ---------- thumbnails ---------- */
  // New uploads are named "<id>-w.jpg" and get a 640px "<id>-w.t.jpg" next to them (see host.js upload).
  var OWN = /\/storage\/v1\/object\/public\/listing-photos\/.+-w\.(jpg|png|webp)$/;
  HP.thumbPath = function(path){ return String(path).replace(/\.(jpg|png|webp)$/, ".t.jpg"); };
  HP.thumb = function(url, w){
    url = String(url || ""); w = w || 640;
    if (OWN.test(url)) return HP.thumbPath(url);
    if (/^https:\/\/assets\.guesty\.com\/image\/upload\//.test(url)) return url.replace(/\/upload\/(?:[a-z]_[^/,]+,?)+\//, "/upload/w_" + w + ",q_auto,f_auto/");
    if (/^https:\/\/a\d*\.muscache\.com\/im\/pictures\//.test(url)) return url.replace(/\?.*$/, "") + "?im_w=" + (w <= 480 ? 480 : 720);
    return url;
  };
  // <img> fallback: if a thumbnail is missing, show the original once
  HP.imgFix = function(img){ var o = img.getAttribute("data-orig"); if (o && img.src !== o){ img.removeAttribute("data-orig"); img.src = o; } };
  document.addEventListener("error", function(e){ var t = e.target; if (t && t.tagName === "IMG" && t.hasAttribute("data-orig")) HP.imgFix(t); }, true);
  HP.img = function(url, w, attrs){
    var t = HP.thumb(url, w);
    return '<img src="' + esc(t) + '"' + (t !== url ? ' data-orig="' + esc(url) + '"' : "") + " " + (attrs || 'alt=""') + ' decoding="async">';
  };
  function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"}[c]; }); }

  /* ---------- loading states (functional only; look and feel stays in host-ux.css) ---------- */
  var st = document.createElement("style");
  st.textContent = "#cal2.loading{opacity:.5;transition:opacity .15s}#pmap.loading{background:#eef1ef}";
  document.head.appendChild(st);

  /* ---------- timing (open the console and run HP.marks() to see them) ---------- */
  var T0 = performance.now(), MARKS = [];
  HP.mark = function(n){ MARKS.push([n, Math.round(performance.now() - T0)]); };
  HP.marks = function(){ return MARKS.slice(); };
  // record each portal API call (action, start, duration) so slow or repeated calls are easy to spot
  var CALLS = []; HP.calls = function(){ return CALLS.slice(); };
  if (window.fetch){
    var f0 = window.fetch;
    window.fetch = function(u, o){
      var url = String(u && u.url || u), t = performance.now(), a = "";
      if (url.indexOf("/functions/v1/") < 0) return f0.apply(this, arguments);
      try { a = JSON.parse((o && o.body) || "{}").action || ""; } catch (e) {}
      var rec = [url.split("/functions/v1/")[1] + (a ? ":" + a : ""), Math.round(t - T0), -1]; CALLS.push(rec);
      return f0.apply(this, arguments).then(function(r){ rec[2] = Math.round(performance.now() - t); return r; });
    };
  }
})();
