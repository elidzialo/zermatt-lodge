/* Book Homes: "Report a bug" button and "Feedback" admin link, for admins only.
   Loaded on /admin and /host. Self-contained: reads the Supabase session those pages already saved,
   never changes it, and checks the admin list with zermatt.is_admin(). The button opens
   /admin/feedback/ with the current page address filled in. */
(function(){
  "use strict";
  var URL_ = "https://kddhkuwnkkjcnbjegsmc.supabase.co", KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
  var TOKEN_KEY = "sb-kddhkuwnkkjcnbjegsmc-auth-token", RETURN_KEY = "bh_fb_return";
  var isAdminPage = /^\/admin\/?$/.test(location.pathname);

  function get(store, k){ try { return window[store].getItem(k); } catch (e) { return null; } }
  function session(){
    var raw = get("sessionStorage", TOKEN_KEY) || get("localStorage", TOKEN_KEY);
    try { var s = JSON.parse(raw || "null"); return s && s.access_token ? s : null; } catch (e) { return null; }
  }
  function claims(tok){
    try {
      var p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (p.length % 4) p += "=";
      return JSON.parse(atob(p));
    } catch (e) { return {}; }
  }
  function feedbackUrl(){ return "/admin/feedback/?page=" + encodeURIComponent(location.href.split("#")[0]); }

  function css(){
    if (document.getElementById("bhfb-css")) return;
    var st = document.createElement("style"); st.id = "bhfb-css";
    st.textContent =
      ".bhfb-btn{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:9000;display:inline-flex;align-items:center;gap:6px;" +
      "background:#1f4d3a;color:#fff;border-radius:999px;padding:9px 14px 9px 11px;font:600 13.5px/1 Inter,system-ui,-apple-system,sans-serif;text-decoration:none;" +
      "box-shadow:0 2px 6px rgba(0,0,0,.18),0 8px 20px rgba(20,30,25,.18);min-height:40px;opacity:.92}" +
      ".bhfb-btn:hover,.bhfb-btn:focus-visible{opacity:1;background:#2c6a50}" +
      ".bhfb-btn svg{width:16px;height:16px}" +
      "@media print{.bhfb-btn{display:none}}" +
      "a.bhfb-nav{display:inline-flex;align-items:center;border:1px solid #c8873a;background:#f8efe3;color:#8a5a1f;border-radius:999px;padding:7px 14px;white-space:nowrap;font-weight:600;font-size:14px;text-decoration:none}";
    document.head.appendChild(st);
  }
  function addButton(){
    if (document.querySelector(".bhfb-btn")) return;
    css();
    var a = document.createElement("a");
    a.className = "bhfb-btn"; a.href = feedbackUrl(); a.setAttribute("aria-label", "Report a bug or idea for this page");
    a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l1.9 1.9M16 2l-1.9 1.9M9 7.1V6a3 3 0 0 1 6 0v1.1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6z"/><path d="M12 20v-9M6.5 9C4.6 8.8 3 7.2 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.9 5c0 2.2-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/></svg>Report a bug';
    a.addEventListener("click", function(){ a.href = feedbackUrl(); });
    document.body.appendChild(a);
  }
  function addNavLink(){
    if (document.querySelector("a.bhfb-nav")) return;
    var nav = document.querySelector("nav.tabs") || document.querySelector("#viewApp nav") || document.querySelector(".top .who");
    if (!nav) return;
    css();
    var a = document.createElement("a");
    a.className = "bhfb-nav"; a.href = "/admin/feedback/"; a.textContent = "Feedback";
    nav.appendChild(a);
  }

  // /admin: #viewApp is only shown once the admin list and the 6-digit code have been checked.
  function adminWatch(){
    var app = document.getElementById("viewApp");
    if (!app) return;
    function check(){
      if (app.classList.contains("hidden")) { var b = document.querySelector(".bhfb-btn"); if (b) b.remove(); return; }
      addNavLink(); addButton();
      var back = get("sessionStorage", RETURN_KEY);
      if (back){
        try { sessionStorage.removeItem(RETURN_KEY); } catch (e) {}
        try { var u = new URL(back, location.href); if (u.origin === location.origin && /^\/admin\/feedback\/?$/.test(u.pathname)) location.replace(u.href); } catch (e) {}
      }
    }
    new MutationObserver(check).observe(app, {attributes: true, attributeFilter: ["class"]});
    check();
  }

  // Other pages (/host): ask the database whether this signed-in email is on the admin list.
  var asked = false;
  function hostCheck(){
    if (asked || document.querySelector(".bhfb-btn")) return;
    var s = session(); if (!s) return;
    var c = claims(s.access_token);
    if (!c.exp || c.exp * 1000 < Date.now()) return; // expired: try again after the page refreshes it
    asked = true;
    fetch(URL_ + "/rest/v1/rpc/is_admin", {method: "POST", headers: {"Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + s.access_token, "Content-Profile": "zermatt", "Accept-Profile": "zermatt"}, body: "{}"})
      .then(function(r){ if (!r.ok) throw new Error("rpc " + r.status); return r.json(); })
      .then(function(ok){ if (ok === true) addButton(); })
      .catch(function(){ asked = false; });
  }

  function start(){
    if (isAdminPage) adminWatch();
    else { hostCheck(); setTimeout(hostCheck, 3000); setTimeout(hostCheck, 10000); window.addEventListener("storage", hostCheck); document.addEventListener("visibilitychange", hostCheck); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
