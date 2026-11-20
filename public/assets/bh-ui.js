/* Book Homes shared UI: the account menu in the header (every page, guest side and /host).
   Logged out: Log in, List your property. Logged in: Trips, Saved, Switch to hosting (guest pages) or
   Switch to travelling (/host), Admin portal for admins, Report a bug for admins, Log out.
   Reads the Supabase session that /host and /admin save (same storage key), so switching sides keeps you logged in.
   Fires "bh:account" with {email, admin} so /host can show the same items in its Menu tab. */
(function(){
"use strict";
var URL_ = "https://kddhkuwnkkjcnbjegsmc.supabase.co", KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
var TOKEN_KEY = "sb-kddhkuwnkkjcnbjegsmc-auth-token", ADMIN_KEY = "bh_admin_v1";
var HOST_SIDE = /^\/host(\/|$)/.test(location.pathname);

/* ---------- open / close ---------- */
function btns(){ return Array.prototype.slice.call(document.querySelectorAll(".ubtn")); }
function closeAll(except){ btns().forEach(function(b){ if (b === except) return; b.setAttribute("aria-expanded", "false"); var l = document.getElementById(b.getAttribute("aria-controls")); if (l) l.hidden = true; }); }
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest(".ubtn");
  if (b){
    e.stopPropagation();
    var l = document.getElementById(b.getAttribute("aria-controls")), open = b.getAttribute("aria-expanded") === "true";
    closeAll(b); b.setAttribute("aria-expanded", open ? "false" : "true"); if (l) l.hidden = open;
    return;
  }
  if (!e.target.closest || !e.target.closest(".umlist")) closeAll(null);
});
document.addEventListener("keydown", function(e){ if (e.key === "Escape") closeAll(null); });

/* ---------- session (read only, except Log out and a token refresh) ---------- */
function stores(){ var out = []; ["sessionStorage", "localStorage"].forEach(function(n){ try { if (window[n]) out.push(window[n]); } catch (e) {} }); return out; }
function readSession(){
  var st = stores();
  for (var i = 0; i < st.length; i++){
    try { var s = JSON.parse(st[i].getItem(TOKEN_KEY) || "null"); if (s && (s.access_token || s.refresh_token)) return {s: s, store: st[i]}; } catch (e) {}
  }
  return null;
}
function claims(tok){
  try { var p = tok.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (p.length % 4) p += "="; return JSON.parse(atob(p)); } catch (e) { return {}; }
}
function fresh(s){ var c = claims(s.access_token || ""); return c.exp && c.exp * 1000 > Date.now() + 30000; }
function refresh(found){
  // Same call supabase-js makes; the new session goes back where it came from.
  return fetch(URL_ + "/auth/v1/token?grant_type=refresh_token", {method: "POST", headers: {"Content-Type": "application/json", "apikey": KEY}, body: JSON.stringify({refresh_token: found.s.refresh_token})})
    .then(function(r){ if (!r.ok) throw new Error("refresh " + r.status); return r.json(); })
    .then(function(j){
      var latest = readSession();
      if (latest && latest.s.refresh_token !== found.s.refresh_token) return latest.s; // another tab refreshed first
      j.expires_at = j.expires_at || Math.round(Date.now() / 1000) + (j.expires_in || 3600);
      try { found.store.setItem(TOKEN_KEY, JSON.stringify(j)); } catch (e) {}
      return j;
    });
}
function adminCache(uid){ try { var v = JSON.parse(sessionStorage.getItem(ADMIN_KEY) || "null"); return v && v.uid === uid && v.until > Date.now() ? v.admin : null; } catch (e) { return null; } }
function setAdminCache(uid, admin){ try { sessionStorage.setItem(ADMIN_KEY, JSON.stringify({uid: uid, admin: admin, until: Date.now() + 30 * 6e4})); } catch (e) {} }
function checkAdmin(found){
  var uid = (found.s.user && found.s.user.id) || claims(found.s.access_token || "").sub || "";
  var c = adminCache(uid); if (c !== null) return Promise.resolve(c);
  var tok = fresh(found.s) ? Promise.resolve(found.s) : (found.s.refresh_token ? refresh(found) : Promise.reject(new Error("no token")));
  return tok.then(function(s){
    return fetch(URL_ + "/rest/v1/rpc/is_admin", {method: "POST", headers: {"Content-Type": "application/json", "apikey": KEY, "Authorization": "Bearer " + s.access_token, "Content-Profile": "zermatt", "Accept-Profile": "zermatt"}, body: "{}"});
  }).then(function(r){ if (!r.ok) throw new Error("rpc " + r.status); return r.json(); })
    .then(function(ok){ ok = ok === true; setAdminCache(uid, ok); return ok; });
}
function logOut(){
  var found = readSession();
  var done = function(){
    stores().forEach(function(s){ try { Object.keys(s).forEach(function(k){ if (/^sb-.*-auth-token/.test(k)) s.removeItem(k); }); s.removeItem(ADMIN_KEY); } catch (e) {} });
    try { localStorage.removeItem("bh_host_trust"); } catch (e) {}
    location.assign(HOST_SIDE ? "/host/" : location.pathname);
  };
  if (found && found.s.access_token && fresh(found.s)){
    fetch(URL_ + "/auth/v1/logout?scope=local", {method: "POST", headers: {"apikey": KEY, "Authorization": "Bearer " + found.s.access_token}}).then(done, done);
  } else done();
}

/* ---------- menu ---------- */
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function css(){
  if (document.getElementById("bhum-css")) return;
  var st = document.createElement("style"); st.id = "bhum-css";
  st.textContent =
    ".umlist .um-who{display:flex;align-items:center;gap:8px;padding:10px 16px 12px;border-bottom:1px solid #ebebeb;margin-bottom:8px;font-size:13px;color:#6a6a6a;min-width:0}" +
    ".umlist .um-who span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}" +
    ".um-chip{display:inline-flex;align-items:center;flex-shrink:0;background:#fbf1e4;color:#8a5a1f;border:1px solid #ecc897;border-radius:999px;padding:1px 8px;font-size:11.5px;font-weight:700;line-height:18px}" +
    ".umlist a.um-strong,.umlist button.um-strong{font-weight:700}" +
    ".umlist button.um-item{display:block;width:100%;text-align:left;padding:11px 16px;font-size:14px;background:none;border:0;cursor:pointer;color:inherit;font-family:inherit}" +
    ".umlist button.um-item:hover{background:#f7f7f7}" +
    ".ubtn .um-dot{position:absolute;top:-2px;right:-2px;width:10px;height:10px;border-radius:50%;background:#e3a35a;border:2px solid #fff}" +
    ".ubtn{position:relative}";
  document.head.appendChild(st);
}
function feedbackHref(){ return "/admin/feedback/?page=" + encodeURIComponent(location.href.split("#")[0]); }
function items(acct){
  var h = "";
  if (!acct){
    var nx = /^\/(trips|saved)\/?$/.test(location.pathname) ? "/host?next=" + location.pathname.replace(/\/$/, "") : "/host";
    h += '<a href="' + nx + '" class="um-strong">Log in</a><a href="/become-a-host">List your property</a><hr>' +
      '<a href="/">All homes</a><a href="/saved">Saved homes</a><a href="/guides">Liverpool guides</a>';
    return h;
  }
  h += '<div class="um-who"><span>' + esc(acct.email || "Signed in") + "</span>" + (acct.admin ? '<b class="um-chip">Admin</b>' : "") + "</div>";
  if (HOST_SIDE){
    h += '<a href="#menu" data-go="menu">Account</a><a href="#earnings" data-go="earnings">Earnings</a><hr>' +
      '<a href="/" class="um-strong">Switch to travelling</a>';
  } else {
    h += '<a href="/trips">Trips</a><a href="/saved">Saved homes</a><hr>' +
      '<a href="/host" class="um-strong">Switch to hosting</a>';
  }
  if (acct.admin) h += '<a href="/admin">Admin portal</a>';
  h += "<hr>";
  if (acct.admin) h += '<a href="' + esc(feedbackHref()) + '" data-bugreport>Report a bug</a>';
  if (!HOST_SIDE) h += '<a href="/guides">Liverpool guides</a>';
  h += '<button type="button" class="um-item" data-logout>Log out</button>';
  return h;
}
var ACCT = null;
function render(){
  css();
  Array.prototype.forEach.call(document.querySelectorAll(".umlist"), function(l){
    if (l._orig == null) l._orig = l.innerHTML.trim();
    l.innerHTML = !ACCT && l._orig ? l._orig : items(ACCT); // logged out: keep the page's own menu
  });
  Array.prototype.forEach.call(document.querySelectorAll("a.hostlink"), function(a){
    if (ACCT){ a.textContent = "Switch to hosting"; a.href = "/host"; } else { a.textContent = "List your property"; a.href = "/become-a-host"; }
  });
  Array.prototype.forEach.call(document.querySelectorAll(".ubtn"), function(b){
    b.setAttribute("aria-label", ACCT ? "Account menu" : "Menu");
    var d = b.querySelector(".um-dot");
    if (ACCT && ACCT.admin && !d){ d = document.createElement("span"); d.className = "um-dot"; d.setAttribute("aria-hidden", "true"); b.appendChild(d); }
    if (d && !(ACCT && ACCT.admin)) d.remove();
  });
  window.BH_ACCOUNT = ACCT;
  try { document.dispatchEvent(new CustomEvent("bh:account", {detail: ACCT})); } catch (e) {}
}
document.addEventListener("click", function(e){
  var lo = e.target.closest && e.target.closest("[data-logout]");
  if (lo){ e.preventDefault(); lo.disabled = true; logOut(); return; }
  var bug = e.target.closest && e.target.closest("[data-bugreport]");
  if (bug) bug.href = feedbackHref();
});

var lastKey = "";
function sync(){
  var found = readSession();
  var email = found ? ((found.s.user && found.s.user.email) || claims(found.s.access_token || "").email || "") : "";
  var key = found ? email + "|" + (found.s.refresh_token || "") : "";
  if (key === lastKey) return; lastKey = key;
  ACCT = found ? {email: email, admin: false} : null;
  if (found){
    var uid = (found.s.user && found.s.user.id) || "";
    var c = adminCache(uid); if (c !== null) ACCT.admin = c;
  }
  render();
  if (found) checkAdmin(found).then(function(ok){ if (ACCT && ACCT.email === email && ACCT.admin !== ok){ ACCT.admin = ok; render(); } }).catch(function(){});
}
// Fresh access token for other scripts on the page (e.g. /trips). Resolves null when logged out.
window.BH_TOKEN = function(){
  var found = readSession();
  if (!found) return Promise.resolve(null);
  if (fresh(found.s)) return Promise.resolve(found.s.access_token);
  if (!found.s.refresh_token) return Promise.resolve(null);
  return refresh(found).then(function(s){ return s.access_token; }, function(){ return null; });
};
function start(){ sync(); window.addEventListener("storage", sync); document.addEventListener("visibilitychange", function(){ if (!document.hidden) sync(); }); if (HOST_SIDE) setInterval(sync, 4000); }
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
