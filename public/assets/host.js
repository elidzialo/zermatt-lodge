/* Book Homes host portal (/host/).
   Sign-in: email + password, then a 6-digit authenticator code (TOTP, aal2), the same trusted-browser approach as /admin.
   Data: the bookhomes-* Edge Functions with the host's own token (rows are protected by Row Level Security).
   Photos upload straight to Supabase Storage (bucket listing-photos, folder = the host's user id). */
(function(){
"use strict";
var SUPABASE_URL = "https://kddhkuwnkkjcnbjegsmc.supabase.co";
var SUPABASE_KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
var FN = SUPABASE_URL + "/functions/v1/";
var REDIRECT = "https://bookhomes.co.uk/host/";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="/assets/bh-icons.svg#i-' + n + '"/></svg>'; }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format((p || 0) / 100); }
function show(id, on){ $(id).classList.toggle("hidden", !on); }
function msg(el, text, ok){ $(el).innerHTML = text ? '<div class="msg ' + (ok ? "ok" : "err") + '">' + esc(text) + "</div>" : ""; }
function busy(b, on, label){ b.disabled = on; if (label) b.textContent = label; }
function ukToday(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()); }
function addDays(s, n){ var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
var fmtD = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
function dfmt(s){ return s ? fmtD.format(new Date(s + "T00:00:00Z")) : "-"; }
function validEmail(e){ return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }

if (!window.supabase){ document.body.insertAdjacentHTML("beforeend", '<div class="box"><div class="msg err">The sign-in library did not load. Check your connection and reload.</div></div>'); return; }

/* ---------- trusted browser: same approach as /admin ---------- */
var TRUST_KEY = "bh_host_trust", PENDING_KEY = "bh_host_trust_pending";
function probe(n){ try { var s = window[n]; s.setItem("__bh", "1"); s.removeItem("__bh"); return s; } catch (e) { return null; } }
var LS = probe("localStorage"), SS = probe("sessionStorage"), MEM = {};
var memStore = {getItem: function(k){ return Object.prototype.hasOwnProperty.call(MEM, k) ? MEM[k] : null; }, setItem: function(k, v){ MEM[k] = String(v); }, removeItem: function(k){ delete MEM[k]; }};
function lsGet(k){ try { return LS ? LS.getItem(k) : null; } catch (e) { return null; } }
function lsSet(k, v){ try { if (LS) LS.setItem(k, v); } catch (e) {} }
function lsDel(k){ try { if (LS) LS.removeItem(k); } catch (e) {} }
function trustUntil(){ try { var v = JSON.parse(lsGet(TRUST_KEY) || "null"); return v && v.until > Date.now() ? v.until : 0; } catch (e) { return 0; } }
function setTrust(on){ if (on) lsSet(TRUST_KEY, JSON.stringify({until: Date.now() + 30 * 864e5})); else lsDel(TRUST_KEY); }
function store(mode){ return (mode === "local" ? LS : SS) || memStore; }
function clearLocalSession(){ if (!LS) return; try { Object.keys(LS).forEach(function(k){ if (/^sb-.*-auth-token/.test(k)) LS.removeItem(k); }); } catch (e) {} }
var START_HASH = location.hash; // e.g. #wizard=12 or #edit=12:photos, to reopen the listing after a refresh
var fromEmail = /(access_token|token_hash|error_description)=|[?&]code=/.test(location.hash + location.search);
var MODE = fromEmail ? (lsGet(PENDING_KEY) === "0" ? "session" : "local") : (trustUntil() ? "local" : "session");
if (fromEmail) setTrust(MODE === "local");
if (MODE === "session"){ lsDel(TRUST_KEY); clearLocalSession(); }
var authStorage = {
  getItem: function(k){ try { return store(MODE).getItem(k); } catch (e) { return null; } },
  setItem: function(k, v){ try { store(MODE).setItem(k, v); } catch (e) {} var o = store(MODE === "local" ? "session" : "local"); if (o !== store(MODE)) { try { o.removeItem(k); } catch (e) {} } },
  removeItem: function(k){ [LS, SS, memStore].forEach(function(s){ try { if (s) s.removeItem(k); } catch (e) {} }); }
};
var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storage: authStorage}});
HP.useStore(store(MODE)); // host-perf: dashboard cache lives where the session lives

var VIEWS = ["Login", "Signup", "Enrol", "Mfa", "SetPw", "Profile", "Dash"];
function view(n){ VIEWS.forEach(function(v){ show("#v" + v, v === n); }); window.scrollTo(0, 0); if (n === "Login" || n === "Signup") HP.gsi().then(function(){ gsiInit(0); }, function(){}); }
function niceErr(e){
  var m = (e && e.message) || String(e || "Something went wrong.");
  if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/email not confirmed/i.test(m)) return "Please confirm your email first: open the link we sent you.";
  if (/invalid totp|invalid.*code/i.test(m)) return "That code didn't work. Wait for a new code in the app and try again.";
  if (/email rate limit|over_email_send_rate_limit/i.test(m)) return "We can't send emails just now because too many went out in the last hour. Please try again later, or continue with Google.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Please wait a minute and try again.";
  if (/signups? not allowed/i.test(m)) return "New host sign-ups are paused. Please contact us.";
  if (/already registered/i.test(m)) return "There's already an account with that email. Log in instead.";
  if (/email address .* is invalid|email_address_invalid/i.test(m)) return "We couldn't send an email to that address. Check it's typed correctly. If it keeps happening, contact us and we'll sort it.";
  if (/email rate limit|over_email_send_rate_limit|security purposes/i.test(m)) return "We've just sent you an email. Please wait a minute before asking for another one.";
  if (/password should|weak password|pwned/i.test(m)) return "Please choose a stronger password: at least 10 characters, not one used on other sites.";
  if (/failed to fetch|network/i.test(m)) return "We couldn't reach Book Homes. Check your connection and try again.";
  return m;
}
var routing = 0, FACTOR = null, ENROL = null, SESSION = null, ME = null, started = false, WANT_MFA = false;
var LATER_KEY = "bh_host_mfa_later";
var LISTING_HOOK = null, hooked = false; // set by the listing editor below: reopens a wizard or editor after a refresh

function api(fn, body){
  return sb.auth.getSession().then(function(r){
    var t = r.data && r.data.session && r.data.session.access_token;
    if (!t) throw new Error("Please log in again.");
    return fetch(FN + fn, {method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + t, "apikey": SUPABASE_KEY}, body: JSON.stringify(body || {})});
  }).then(function(res){ return res.json().catch(function(){ return {}; }).then(function(j){ if (!res.ok) throw new Error(j.error || ("Error " + res.status)); return j; }); });
}

function route(session){
  var my = ++routing; SESSION = session || null;
  if (!session){ show("#who", false); started = false; view(/signup=1/.test(location.search) ? "Signup" : "Login"); return; }
  $("#whoEmail").textContent = session.user.email || ""; show("#who", true);
  if (!BOOT && !(AUTH_P && AUTH_UID === session.user.id)){ BOOT = bootCall(); BOOT.catch(function(){}); } // host-perf: the dashboard data loads while 2-step is checked
  sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function(a){
    if (my !== routing) return;
    if (a.error) throw a.error;
    if (a.data.currentLevel === "aal2") return afterAuth();
    if (a.data.nextLevel === "aal1" && !WANT_MFA) return afterAuth();
    return sb.auth.mfa.listFactors().then(function(f){
      if (my !== routing) return;
      if (f.error) throw f.error;
      var ok = (f.data.totp || []).filter(function(x){ return x.status === "verified"; });
      if (ok.length){ FACTOR = ok[0].id; msg("#mfaMsg", ""); $("#mfaCode").value = ""; view("Mfa"); $("#mfaCode").focus(); return; }
      // 2-step is optional for hosts: only set it up when they choose to (Menu) or when connecting payouts
      if (!WANT_MFA) return afterAuth();
      WANT_MFA = false;
      return startEnrol(f.data.all || []);
    });
  }).catch(function(e){ view("Login"); msg("#loginMsg", niceErr(e)); });
}
function startEnrol(all){
  view("Enrol"); msg("#enrolMsg", "Getting your code...", true);
  var stale = all.filter(function(x){ return x.factor_type === "totp" && x.status !== "verified"; });
  return Promise.all(stale.map(function(x){ return sb.auth.mfa.unenroll({factorId: x.id}); })).then(function(){
    return sb.auth.mfa.enroll({factorType: "totp", issuer: "Book Homes", friendlyName: "Book Homes host " + new Date().toISOString().slice(0, 16)});
  }).then(function(r){
    if (r.error) throw r.error;
    ENROL = r.data; var qr = r.data.totp.qr_code || "";
    $("#enrolQr").src = /^data:/.test(qr) ? qr : "data:image/svg+xml;charset=utf-8," + encodeURIComponent(qr);
    $("#enrolSecret").textContent = (r.data.totp.secret || "").replace(/(.{4})/g, "$1 ").trim();
    $("#enrolUri").href = r.data.totp.uri || "#";
    $("#enrolTap").href = r.data.totp.uri || "#";
    msg("#enrolMsg", "");
  }).catch(function(e){ msg("#enrolMsg", "Could not start setup: " + niceErr(e)); });
}
sb.auth.onAuthStateChange(function(evt, session){
  if (evt === "PASSWORD_RECOVERY"){ setTimeout(function(){ view("SetPw"); }, 0); return; }
  if (/^(INITIAL_SESSION|SIGNED_IN|SIGNED_OUT|MFA_CHALLENGE_VERIFIED)$/.test(evt)) setTimeout(function(){ route(session); }, 0);
  if (evt === "SIGNED_IN" && (/access_token|error_description|token_hash/.test(location.hash) || /access_token|code=/.test(location.search))) history.replaceState(null, "", location.pathname);
});

/* show / hide password */
$$("[data-showpw]").forEach(function(b){ b.addEventListener("click", function(){ var i = document.getElementById(b.getAttribute("data-showpw")); var on = i.type === "password"; i.type = on ? "text" : "password"; b.textContent = on ? "Hide" : "Show"; b.setAttribute("aria-label", on ? "Hide password" : "Show password"); }); });
/* Google sign-in */
$$("[data-google]").forEach(function(b){ b.addEventListener("click", function(){
  if (b.closest("#vSignup") && !$("#suTerms").checked){ msg("#signupMsg", "Please agree to the host terms first."); return; }
  lsSet(PENDING_KEY, "1"); setTrust(true);
  sb.auth.signInWithOAuth({provider: "google", options: {redirectTo: REDIRECT}}).then(function(r){ if (r.error){ var t = /not enabled|unsupported provider/i.test(r.error.message) ? "Google sign-in is not switched on yet. Please use email for now." : niceErr(r.error); msg(b.closest("#vSignup") ? "#signupMsg" : "#loginMsg", t); } });
}); });
/* Google sign-in on our own domain (Google Identity Services + ID token), so Google shows bookhomes.co.uk */
var GOOGLE_CLIENT_ID = "977671037575-817egi2hb39lsc99ts4dr899j7qtetnj.apps.googleusercontent.com";
var gsiDone = false;
function gsiInit(tries){
  if (gsiDone) return;
  if (!(window.google && google.accounts && google.accounts.id)){ if ((tries || 0) < 40) setTimeout(function(){ gsiInit((tries || 0) + 1); }, 150); return; }
  var raw = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function(buf){
    var hashed = Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    gsiDone = true;
    google.accounts.id.initialize({client_id: GOOGLE_CLIENT_ID, nonce: hashed, ux_mode: "popup", itp_support: true, callback: function(resp){
      var inSignup = !$("#vSignup").classList.contains("hidden");
      if (inSignup && !$("#suTerms").checked){ msg("#signupMsg", "Please tick the host terms box first, then tap Google again."); return; }
      lsSet(PENDING_KEY, "1"); setTrust(true); MODE = "local";
      sb.auth.signInWithIdToken({provider: "google", token: resp.credential, nonce: raw}).then(function(r){ if (r.error) msg(inSignup ? "#signupMsg" : "#loginMsg", niceErr(r.error)); });
    }});
    $$(".gsi").forEach(function(el){ google.accounts.id.renderButton(el, {theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.min(360, el.clientWidth || 320), logo_alignment: "center"}); });
  });
}
/* gsiInit runs from view() once the login or sign-up screen shows (host-perf: Google's script is not loaded for signed-in hosts) */
/* branded email links: /host/?token_hash=...&type=... */
(function(){
  var q = new URLSearchParams(location.search), th = q.get("token_hash"), ty = q.get("type");
  if (!th || !ty) return;
  history.replaceState(null, "", location.pathname);
  sb.auth.verifyOtp({token_hash: th, type: ty}).then(function(r){
    if (r.error){ view("Login"); msg("#loginMsg", /expired|invalid/i.test(r.error.message) ? "That link has expired or was already used. Log in, or tap Forgot password to get a new one." : niceErr(r.error)); return; }
    if (ty === "recovery" || ty === "invite") view("SetPw");
    else if (ty === "signup" || ty === "email") msg("#loginMsg", "Email confirmed. Welcome to Book Homes.", true);
    else if (ty === "email_change") msg("#loginMsg", "Your new email address is confirmed.", true);
  });
})();
$("#toSignup").addEventListener("click", function(){ view("Signup"); });
$("#enrolLater").addEventListener("click", function(){ if (SESSION) lsSet(LATER_KEY, SESSION.user.id); afterAuth(); });
function aal(){ try { var p = SESSION.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (p.length % 4) p += "="; return JSON.parse(atob(p)).aal; } catch (e) { return ""; } }
$("#toLogin").addEventListener("click", function(){ view("Login"); });
$("#loginForm").addEventListener("submit", function(e){
  e.preventDefault();
  var em = $("#loginEmail").value.trim().toLowerCase(), pw = $("#loginPw").value, btn = $("#loginBtn");
  if (!validEmail(em) || !pw){ msg("#loginMsg", "Enter your email and password."); return; }
  var trust = $("#trustBox").checked; lsSet(PENDING_KEY, trust ? "1" : "0"); MODE = trust ? "local" : "session"; setTrust(trust); if (!trust) clearLocalSession();
  busy(btn, true, "Logging in..."); msg("#loginMsg", "");
  sb.auth.signInWithPassword({email: em, password: pw}).then(function(r){ busy(btn, false, "Log in"); if (r.error){ msg("#loginMsg", niceErr(r.error)); if (/not confirmed/i.test(r.error.message)) resendBtn("#loginMsg", em); } else $("#loginPw").value = ""; },
    function(e){ busy(btn, false, "Log in"); msg("#loginMsg", niceErr(e)); });
});
$("#forgotBtn").addEventListener("click", function(){
  var em = $("#loginEmail").value.trim().toLowerCase();
  if (!validEmail(em)){ msg("#loginMsg", "Type your email above first."); return; }
  var fb = this; busy(fb, true, "Sending...");
  sb.auth.resetPasswordForEmail(em, {redirectTo: REDIRECT}).then(function(r){ busy(fb, false, "Forgot password?"); msg("#loginMsg", r.error ? niceErr(r.error) : "If there's an account for " + em + ", a reset link is on its way. Check your spam folder too.", !r.error); },
    function(e){ busy(fb, false, "Forgot password?"); msg("#loginMsg", niceErr(e)); });
});
$("#signupForm").addEventListener("submit", function(e){
  e.preventDefault();
  var em = $("#suEmail").value.trim().toLowerCase(), pw = $("#suPw").value, btn = $("#suBtn");
  if (!validEmail(em)){ msg("#signupMsg", "Please enter a valid email."); return; }
  if (pw.length < 10){ msg("#signupMsg", "Use at least 10 characters for your password."); return; }
  if (!$("#suTerms").checked){ msg("#signupMsg", "Please agree to the host terms."); return; }
  lsSet(PENDING_KEY, "1"); MODE = "local"; setTrust(true);
  busy(btn, true, "Creating..."); msg("#signupMsg", "");
  sb.auth.signUp({email: em, password: pw, options: {emailRedirectTo: REDIRECT, data: {app: "bookhomes"}}}).catch(function(e){ return {error: e, data: {}}; }).then(function(r){
    busy(btn, false, "Create account");
    if (r.error){ msg("#signupMsg", niceErr(r.error)); return; }
    var u = r.data && r.data.user;
    if (u && Array.isArray(u.identities) && u.identities.length === 0){
      view("Login"); $("#loginEmail").value = em;
      msg("#loginMsg", "You already have an account with this email. Log in below, or tap \"Forgot password?\" to set a new password.", true);
      return;
    }
    if (!r.data.session){ msg("#signupMsg", "Nearly there: we've emailed you a link. Open it on this device to confirm your email, then log in. Check your spam folder too.", true); resendBtn("#signupMsg", em); }
  });
});
function resendBtn(where, em){
  var box = $(where); if (!box) return;
  box.insertAdjacentHTML("beforeend", '<button type="button" class="linkbtn" data-resend>Send the confirmation email again</button>');
  $("[data-resend]", box).addEventListener("click", function(){
    var b = this; busy(b, true, "Sending...");
    sb.auth.resend({type: "signup", email: em, options: {emailRedirectTo: REDIRECT}}).then(function(r){ busy(b, false, "Send the confirmation email again"); msg(where, r.error ? niceErr(r.error) : "Sent again to " + em + ". It can take a minute or two.", !r.error); });
  });
}
function digits(input, submit){ input.addEventListener("input", function(){ var v = input.value.replace(/\D/g, "").slice(0, 6); if (v !== input.value) input.value = v; if (v.length === 6) submit(); }); }
function submitEnrol(){
  var code = $("#enrolCode").value, btn = $("#enrolBtn");
  if (!ENROL || !/^\d{6}$/.test(code) || btn.disabled) return;
  busy(btn, true, "Checking...");
  sb.auth.mfa.challenge({factorId: ENROL.id}).then(function(c){ if (c.error) throw c.error; return sb.auth.mfa.verify({factorId: ENROL.id, challengeId: c.data.id, code: code}); })
    .then(function(v){ busy(btn, false, "Verify"); if (v.error) throw v.error; })
    .catch(function(e){ busy(btn, false, "Verify"); $("#enrolCode").value = ""; msg("#enrolMsg", niceErr(e)); });
}
function submitMfa(){
  var code = $("#mfaCode").value, btn = $("#mfaBtn");
  if (!/^\d{6}$/.test(code) || btn.disabled) return;
  busy(btn, true, "Checking...");
  sb.auth.mfa.challengeAndVerify({factorId: FACTOR, code: code}).then(function(r){ busy(btn, false, "Verify"); if (r.error) throw r.error; })
    .catch(function(e){ busy(btn, false, "Verify"); $("#mfaCode").value = ""; msg("#mfaMsg", niceErr(e)); });
}
$("#enrolForm").addEventListener("submit", function(e){ e.preventDefault(); submitEnrol(); });
$("#mfaForm").addEventListener("submit", function(e){ e.preventDefault(); submitMfa(); });
digits($("#enrolCode"), submitEnrol); digits($("#mfaCode"), submitMfa);
$("#setPwForm").addEventListener("submit", function(e){
  e.preventDefault();
  var p = $("#newPw").value, b = $("#setPwBtn"); if (p.length < 10){ msg("#setPwMsg", "Use at least 10 characters."); return; }
  busy(b, true, "Saving...");
  sb.auth.updateUser({password: p}).then(function(r){ busy(b, false, "Save password"); if (r.error){ msg("#setPwMsg", niceErr(r.error)); return; } $("#newPw").value = ""; route(SESSION); });
});
function signOut(){ setTrust(false); HP.drop(); sb.auth.signOut().then(function(){ clearLocalSession(); location.replace("/host/"); }); }
$$("[data-signout]").forEach(function(b){ b.addEventListener("click", signOut); });

/* ---------- after 2-step: profile -> dashboard ---------- */
/* host-perf: one "boot" call (me + bookings + earnings). The last copy is kept on this device and painted at once
   (stale-while-revalidate), then replaced when the fresh data arrives. */
var BOOT = null;
function ckey(k){ return k + ":" + ((SESSION && SESSION.user && SESSION.user.id) || ""); }
function bootCall(){
  return api("bookhomes-host", {action: "boot"}).catch(function(e){
    if (/unknown action/i.test(e.message)) return api("bookhomes-host", {action: "me"}); // older function still deployed
    throw e;
  });
}
function profileDone(me){ return me && me.profile && me.profile.phone && me.profile.trader_status; }
function showDash(fresh){
  view("Dash"); renderDash();
  if (LISTING_HOOK && !hooked){ hooked = true; LISTING_HOOK(); }
  if (ME.bookings) loadBookings(ME); else if (fresh) loadBookings();
  if (ME.payouts) loadEarnings(ME); else if (fresh) loadEarnings();
}
function keepMe(me){ var c = Object.assign({}, me); HP.put(ckey("boot"), c, true); return me; }
var AUTH_P = null, AUTH_AT = 0, AUTH_UID = null;
function afterAuth(force){
  // host-perf: sign-in fires INITIAL_SESSION and SIGNED_IN together; load the dashboard once for both
  var uid = SESSION && SESSION.user && SESSION.user.id;
  if (!force && AUTH_P && AUTH_UID === uid && (!AUTH_AT || Date.now() - AUTH_AT < 4000)) return AUTH_P;
  AUTH_UID = uid; AUTH_AT = 0;
  return (AUTH_P = afterAuthRun().then(function(r){ AUTH_AT = Date.now(); return r; }));
}
function afterAuthRun(){
  var cached = HP.get(ckey("boot")), painted = false;
  if (cached && profileDone(cached.v) && !ME){ ME = cached.v; HP.mark("dash-cached"); showDash(false); painted = true; }
  var p = BOOT || bootCall(); BOOT = null;
  return p.then(function(me){
    ME = me; keepMe(me); HP.mark("dash-fresh");
    if (!profileDone(me)){ fillProfile(); view("Profile"); return; }
    if (painted && !$("#vDash").classList.contains("hidden")){ renderDash(); if (me.bookings) loadBookings(me); if (me.payouts) loadEarnings(me); }
    else showDash(true);
    started = true; calWarm();
    if (/connect=done/.test(location.search)){ api("bookhomes-connect-onboard", {action: "status"}).then(refresh).catch(function(){}); history.replaceState(null, "", location.pathname); }
  }).catch(function(e){
    if (/sign in|log in/i.test(e.message)) { view("Login"); msg("#loginMsg", e.message); return; }
    if (painted) return; // keep the saved dashboard on screen if the network blips
    fillProfile(); view("Profile");
  });
}
function refresh(){
  if (ME && !$("#vDash").classList.contains("hidden")) renderDash(); // host-perf: show what we already know at once
  return api("bookhomes-host", {action: "me"}).then(function(me){ ME = Object.assign({}, me, {bookings: ME && ME.bookings, payouts: ME && ME.payouts}); keepMe(ME); renderDash(); });
}
function fillProfile(){
  var p = (ME && ME.profile) || {}, md = (SESSION && SESSION.user && SESSION.user.user_metadata) || {};
  $("#pName").value = p.name || md.full_name || md.name || ""; $("#pPhone").value = p.phone || ""; $("#pWa").value = p.whatsapp || ""; $("#pCompany").value = p.company || "";
  $("#pDisplay").value = (ME && ME.host && ME.host.display_name) || "";
  $$("input[name=trader]").forEach(function(r){ r.checked = r.value === p.trader_status; });
}
$("#profForm").addEventListener("submit", function(e){
  e.preventDefault();
  var tr = ($$("input[name=trader]").filter(function(r){ return r.checked; })[0] || {}).value;
  var body = {name: $("#pName").value.trim(), phone: $("#pPhone").value.trim(), whatsapp: $("#pWa").value.trim() || null, company: $("#pCompany").value.trim() || null, display_name: $("#pDisplay").value.trim() || null, trader_status: tr};
  if (body.name.length < 2){ msg("#profMsg", "Please enter your full name."); return; }
  if (body.phone.replace(/\D/g, "").length < 7){ msg("#profMsg", "Please enter your phone number."); return; }
  if (!tr){ msg("#profMsg", "Please choose how you host."); return; }
  var btn = $("#profBtn"); busy(btn, true, "Saving...");
  var first = !(ME && ME.profile);
  (first ? api("bookhomes-host-signup", body) : api("bookhomes-host", Object.assign({action: "save_profile"}, body)))
    .then(function(){ busy(btn, false, "Continue"); return afterAuth(true); })
    .then(function(){ if (first && ME && !(ME.listings || []).length) openWizard(null); })
    .catch(function(err){ busy(btn, false, "Continue"); msg("#profMsg", err.message); });
});

/* ---------- dashboard ---------- */
$$(".tabs button").forEach(function(b){ b.addEventListener("click", function(){
  $$(".tabs button").forEach(function(x){ x.setAttribute("aria-selected", x === b ? "true" : "false"); });
  $$("[data-panel]").forEach(function(p){ p.classList.toggle("hidden", p.getAttribute("data-panel") !== b.getAttribute("data-tab")); });
  if (b.getAttribute("data-tab") === "calendar") loadCal();
}); });
var STATUS = {draft: "Draft", pending: "Waiting for approval", approved: "Live", rejected: "Changes needed", paused: "Paused"};
function renderDash(){
  try { document.dispatchEvent(new CustomEvent("bh:host", {detail: {type: "me", me: ME}})); } catch (e) {}
  var p = ME.profile || {}, ls = ME.listings || [];
  $("#approvalNote").innerHTML = p.approved ? "" : '<div class="notice"><b>Your host account is waiting for approval.</b> You can add and submit listings now. We check every host and listing, usually within one working day.' + (p.rejected_reason ? "<br>Note from us: " + esc(p.rejected_reason) : "") + "</div>";
  $("#lcards").innerHTML = ls.length ? ls.map(function(l){
    var ph = (ME.photos || []).filter(function(x){ return String(x.listing_id) === String(l.id); })[0];
    var legacy = !!l.legacy_source;
    var acts = legacy ? '<button type="button" class="btn sm" data-calfor="' + l.id + '">Calendar</button><a class="btn ghost sm" href="' + esc(l.page_url || "/") + '" target="_blank" rel="noopener">View</a><span class="m" style="font-size:12.5px;display:block;margin-top:6px">Prices and details come from your channel manager. Block and open dates in Calendar.</span>' :
      '<button type="button" class="btn sm" data-edit="' + l.id + '">' + (l.status === "draft" ? "Continue" : l.status === "rejected" ? "Make changes" : "Edit") + '</button>' +
      (l.status === "approved" ? '<a class="btn ghost sm" href="/' + esc(l.slug) + '" target="_blank" rel="noopener">View</a><button type="button" class="btn ghost sm" data-status="paused" data-id="' + l.id + '">Pause</button>' : "") +
      (l.status === "paused" && l.approved_at ? '<button type="button" class="btn ghost sm" data-status="approved" data-id="' + l.id + '">Unpause</button>' : "") +
      (l.status === "draft" ? '<button type="button" class="btn ghost sm" data-dellisting data-id="' + l.id + '">Delete</button>' : "");
    return '<div class="lcard"><div class="ph">' + (ph ? HP.img(ph.thumb_url || ph.url, 480, 'alt="" loading="lazy"') : icon("camera")) + '</div><div class="bd2"><b>' + esc(l.title) + '</b><span class="st ' + esc(l.status) + '">' + esc(STATUS[l.status] || l.status) + '</span>' +
      (l.reject_reason ? '<p class="m" style="font-size:13.5px;color:#b42318">' + esc(l.reject_reason) + '</p>' : "") +
      (l.ical_export_url ? '<p style="font-size:12.5px;color:var(--muted);margin-top:6px">Calendar link for Airbnb / Booking.com:<code class="code-line">' + esc(l.ical_export_url) + '</code></p>' : "") +
      '<div class="acts">' + acts + '</div></div></div>';
  }).join("") : '<div class="item"><b>No listings yet.</b><p class="m">Add your first home. It takes about 10 minutes, one question at a time.</p></div>';
  var h = ME.host || {};
  $("#payoutState").innerHTML = h.connect_status === "enabled" ? "<b>Payouts connected.</b> Stripe sends your share to your bank automatically after each booking."
    : h.has_stripe ? "<b>Payout setup started.</b> Finish it with Stripe to get paid automatically."
    : "<b>Get paid automatically.</b> Connect your bank through Stripe. Until then we pay you by bank transfer after check-in.";
  $("#connectBtn").textContent = h.connect_status === "enabled" ? "Update payout details" : h.has_stripe ? "Finish payout setup" : "Connect payouts with Stripe";
  $("#profSummary").innerHTML = "<b>" + esc(p.name) + "</b><p class='m'>" + esc(p.email) + " · " + esc(p.phone || "") + (p.whatsapp ? " · WhatsApp " + esc(p.whatsapp) : "") + "<br>" + (p.trader_status === "private" ? "Private individual" : "Business (trader)") + (p.company ? " · " + esc(p.company) : "") + " · Commission " + (ME.commission_pct != null ? ME.commission_pct + "%" : "") + "</p>";
  var until = MODE === "local" ? trustUntil() : 0;
  $("#trustStatus").textContent = until ? "This browser is trusted until " + new Date(until).toLocaleDateString("en-GB") + "." : "This browser isn't trusted: you'll be signed out when you close the tab.";
  var sel = $("#calListing"), cur = sel.value;
  sel.innerHTML = ls.map(function(l){ return '<option value="' + l.id + '">' + esc(l.title) + "</option>"; }).join("");
  if (cur && ls.some(function(l){ return String(l.id) === cur; })) sel.value = cur;
}
document.addEventListener("click", function(e){
  var cf = e.target.closest && e.target.closest("[data-calfor]");
  if (cf){ $("#calListing").value = cf.getAttribute("data-calfor"); var tb = $$(".tabs button").filter(function(x){ return x.getAttribute("data-tab") === "calendar"; })[0]; if (tb) tb.click(); return; }
  var ed = e.target.closest && e.target.closest("[data-edit]");
  if (ed){ openListing(+ed.getAttribute("data-edit")); return; }
  var st = e.target.closest && e.target.closest("[data-status]");
  if (st){
    // host-perf: optimistic, the card changes at once and goes back if the server says no
    var sl = findL(+st.getAttribute("data-id")), was = sl && sl.status;
    if (sl){ sl.status = st.getAttribute("data-status"); renderDash(); } else st.disabled = true;
    api("bookhomes-host", {action: "set_status", id: +st.getAttribute("data-id"), status: st.getAttribute("data-status")}).then(refresh).catch(function(err){ if (sl){ sl.status = was; renderDash(); } else st.disabled = false; alert(err.message); });
  }
});
(function(){ var b = document.getElementById("mfaOptIn"); if (!b) return;
  b.addEventListener("click", function(){ if (aal() === "aal2"){ b.textContent = "2-step login is on"; b.disabled = true; return; } WANT_MFA = true; lsDel(LATER_KEY); route(SESSION); });
  setInterval(function(){ if (SESSION && aal() === "aal2" && !b.disabled){ b.textContent = "2-step login is on"; b.disabled = true; } }, 3000);
})();
$("#newListing").addEventListener("click", function(){ openWizard(null); });
$("#editProfile").addEventListener("click", function(){ fillProfile(); $("#profH").textContent = "Edit profile"; view("Profile"); });
$("#connectBtn").addEventListener("click", function(){
  var b = this;
  if (aal() !== "aal2"){
    // Payouts need 2-step verification: set it up (or enter the code), then come back here
    WANT_MFA = true; lsDel(LATER_KEY); route(SESSION);
    setTimeout(function(){ msg("#enrolMsg", "Payouts need 2-step verification. Set it up once, then tap Connect payouts again.", true); msg("#mfaMsg", "Payouts need your 6-digit code.", true); }, 600);
    return;
  }
  b.disabled = true; $("#connectOut").textContent = "Opening Stripe...";
  api("bookhomes-connect-onboard", {action: "start"}).then(function(j){
    b.disabled = false;
    if (j.url){ location.assign(j.url); return; }
    $("#connectOut").textContent = j.message || "Payouts are not available yet.";
  }).catch(function(err){ b.disabled = false; $("#connectOut").textContent = err.message; });
});

function loadBookings(pre){
  (pre && pre.bookings ? Promise.resolve(pre) : api("bookhomes-host", {action: "bookings"})).then(function(j){
    var rows = j.bookings || [];
    try { document.dispatchEvent(new CustomEvent("bh:host", {detail: {type: "bookings", rows: rows}})); } catch (e) {}
    $("#bkList").innerHTML = rows.length ? rows.map(function(b){
      return '<div class="item"><div class="h"><span>' + esc(b.guest_name) + " · " + esc(b.title) + '</span><span class="st ' + (b.status === "paid" ? "approved" : b.status === "held" ? "pending" : "draft") + '">' + esc(b.status === "paid" ? "Confirmed" : b.status === "held" ? "Paying now" : "Cancelled") + '</span></div>' +
        '<div class="m">' + dfmt(b.check_in) + " to " + dfmt(b.check_out) + " · " + b.nights + " nights · " + b.guests + " guests</div>" +
        (b.status === "paid" ? '<div class="m">' + esc(b.guest_email) + (b.guest_phone ? ' · <a href="tel:' + esc(String(b.guest_phone).replace(/[^\d+]/g, "")) + '">' + esc(b.guest_phone) + "</a>" : "") + "</div>" : "") +
        '<div class="m">Guest paid ' + money(b.amount_pence) + " · commission " + money(b.fee_pence) + " · <b>your payout " + money(b.host_payout_pence) + "</b></div></div>";
    }).join("") : '<p class="m">No bookings yet.</p>';
  }).catch(function(e){ $("#bkList").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
}
function loadEarnings(pre){
  (pre && pre.payouts ? Promise.resolve(pre) : api("bookhomes-host", {action: "earnings"})).then(function(j){
    var rows = j.payouts || [], paid = 0, due = 0, sched = 0;
    rows.forEach(function(p){ if (p.status === "paid") paid += p.amount_pence; else if (p.status === "manual_pending") due += p.amount_pence; else if (p.status === "connect_scheduled") sched += p.amount_pence; });
    $("#earnStats").innerHTML = '<div class="stat"><small>Paid to you</small><b>' + money(paid) + '</b></div><div class="stat"><small>Due by bank transfer</small><b>' + money(due) + '</b></div><div class="stat"><small>Paying by Stripe</small><b>' + money(sched) + "</b></div>";
    $("#earnList").innerHTML = rows.map(function(p){
      return '<div class="item"><div class="h"><span>' + esc(p.title) + " · " + dfmt(p.check_in) + '</span><span>' + money(p.amount_pence) + '</span></div><div class="m">' + esc({paid: "Paid", manual_pending: "Due by bank transfer", connect_scheduled: "Paid by Stripe", cancelled: "Cancelled", failed: "Failed"}[p.status] || p.status) + (p.paid_at ? " · " + dfmt(p.paid_at.slice(0, 10)) : "") + "</div></div>";
    }).join("") || '<p class="m">Payouts appear here after your first booking.</p>';
  }).catch(function(){});
}

/* ---------- host calendar: block, open, prices ---------- */
var CAL = {month: ukToday().slice(0, 7), a: null, b: null, data: null};
function shiftMonth(m, n){ var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + (mo < 9 ? "0" : "") + (mo + 1); }
function loadCal(){
  var id = +$("#calListing").value; if (!id){ $("#cal2").innerHTML = '<p class="m">Add a listing first.</p>'; return; }
  var from = CAL.month + "-01", to = shiftMonth(CAL.month, 1) + "-01";
  $("#calTitle").textContent = new Intl.DateTimeFormat("en-GB", {month: "long", year: "numeric", timeZone: "UTC"}).format(new Date(from + "T00:00:00Z"));
  // host-perf: show the cached month at once (or an empty grid), then refresh it; the next month is fetched ahead
  var key = "cal:" + id + ":" + CAL.month, hit = HP.get(key), want = CAL.month;
  CAL.data = hit ? hit.v : null; drawCal(); $("#cal2").classList.toggle("loading", !hit);
  calFetch(id, CAL.month).then(function(j){ if (CAL.month !== want || +$("#calListing").value !== id) return; CAL.data = j; drawCal(); $("#cal2").classList.remove("loading"); calFetch(id, shiftMonth(want, 1), true); })
    .catch(function(e){ if (CAL.month === want) $("#cal2").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
}
var calInflight = {};
function calFetch(id, month, ahead){
  var key = "cal:" + id + ":" + month, hit = HP.get(key);
  if (ahead && hit && Date.now() - hit.at < 60000) return Promise.resolve(hit.v);
  if (calInflight[key]) return calInflight[key];
  var from = month + "-01", to = shiftMonth(month, 1) + "-01";
  return (calInflight[key] = api("bookhomes-host", {action: "calendar", listing_id: id, from: from < ukToday() ? ukToday() : from, to: to})
    .then(function(j){ delete calInflight[key]; return HP.put(key, j); }, function(e){ delete calInflight[key]; throw e; }));
}
// host-speed: once the dashboard is up, fetch this month for the calendar's listing while the browser is idle,
// so the first Calendar tab opens from memory instead of waiting on the network (calFetch shares in-flight calls)
function calWarm(){
  var go = function(){ var id = +$("#calListing").value; if (id && !HP.get("cal:" + id + ":" + CAL.month)) calFetch(id, CAL.month).catch(function(){}); };
  if (window.requestIdleCallback) requestIdleCallback(go, {timeout: 2500}); else setTimeout(go, 1200);
}
// after a change: reload this month, and refetch the next one too (a range can run into it; its cached copy is stale)
function calSaved(){ var id = +$("#calListing").value, nx = shiftMonth(CAL.month, 1); loadCal(); if (id) calFetch(id, nx).catch(function(){}); }
// optimistic calendar edit: change the nights on screen now, the server answer replaces it
function calLocal(lo, hi, a, v){
  var j = CAL.data; if (!j || !j.days) return;
  j.days.forEach(function(d){ if (d.date < lo || d.date > hi) return;
    if (a === "block" && d.status !== "reserved") d.status = "blocked";
    else if (a === "open" && d.status === "blocked") d.status = "available";
    else if (a === "price") d.price = v; });
  drawCal();
}
function feedName(j, s){ var f = (j.feeds || []).filter(function(x){ return x.start_date <= s && s < x.end_date; })[0]; return f ? f.name : "Booked"; }
function drawCal(){
  var j = CAL.data || {days: [], bookings: [], blocks: []}, first = CAL.month + "-01", today = ukToday(), html = "";
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(function(d){ html += '<div class="dw">' + d + "</div>"; });
  var dow = (new Date(first + "T00:00:00Z").getUTCDay() + 6) % 7; for (var i = 0; i < dow; i++) html += '<div class="d x"></div>';
  var byDate = {}; (j.days || []).forEach(function(d){ byDate[d.date] = d; });
  for (var s = first; s.slice(0, 7) === CAL.month; s = addDays(s, 1)){
    var d = byDate[s], bk = (j.bookings || []).filter(function(b){ return b.check_in <= s && s < b.check_out; })[0];
    var cls = s < today ? "past" : bk ? "booked" : d && d.status === "blocked" ? "blocked" : d && d.status === "reserved" ? "reserved" : "";
    var lo = CAL.a && (CAL.b || CAL.a), sel = CAL.a && s >= (CAL.a < lo ? CAL.a : lo) && s <= (CAL.a < lo ? lo : CAL.a);
    html += '<button type="button" class="d ' + cls + (sel ? " sel" : "") + '" data-day="' + s + '"' + (s < today ? " disabled" : "") + '><span class="n">' + (+s.slice(8)) + "</span>" +
      (bk ? esc(String(bk.guest_name || "Booked").split(" ")[0]) : d && d.status === "reserved" ? esc(feedName(j, s)) : d && d.status === "blocked" ? "Blocked" : d && d.price != null ? "£" + Math.round(d.price) : "") + "</button>";
  }
  $("#cal2").innerHTML = html;
  var lo2 = CAL.a && CAL.b ? (CAL.a < CAL.b ? CAL.a : CAL.b) : CAL.a, hi2 = CAL.a && CAL.b ? (CAL.a < CAL.b ? CAL.b : CAL.a) : CAL.a;
  $("#calSel").textContent = CAL.a ? (lo2 === hi2 ? "Night of " + dfmt(lo2) : dfmt(lo2) + " to " + dfmt(hi2) + " (last night)") : "No nights selected";
  $$("[data-ca=price],[data-ca=reset],#calPrice").forEach(function(x){ x.closest("label") ? x.closest("label").classList.toggle("hidden", !!j.prices_managed_elsewhere) : x.classList.toggle("hidden", !!j.prices_managed_elsewhere); });
  if (j.prices_managed_elsewhere && !$("#calOut").textContent) $("#calOut").textContent = "Zermatt Lodge prices come from your channel manager. Blocks you add here also close the dates there (through the iCal link).";
  $("#calBlocks").innerHTML = (j.blocks || []).length ? "<h3 style='margin:14px 0 8px'>Your blocks</h3>" + j.blocks.map(function(b){
    return '<div class="item"><div class="h"><span>' + dfmt(b.start_date) + " to " + dfmt(addDays(b.end_date, -1)) + '</span><button type="button" class="btn ghost sm" data-unblock="' + esc(b.id) + '">Unblock</button></div><div class="m">' + esc(b.reason) + "</div></div>";
  }).join("") : "";
}
/* side panel shows only with a selection; sync panel follows the chosen listing */
var _drawCal = drawCal;
drawCal = function(){
  _drawCal();
  var on = !!CAL.a;
  $("#csPanel").classList.toggle("hidden", !on); $("#csEmpty").classList.toggle("hidden", on);
  $("#calActs").classList.toggle("open", on);
  if (on){
    var j = CAL.data || {days: []}, lo = CAL.b && CAL.b < CAL.a ? CAL.b : CAL.a, hi = CAL.b && CAL.b > CAL.a ? CAL.b : CAL.a, blocked = 0, n = 0, price = null, same = true;
    (j.days || []).forEach(function(d){ if (d.date >= lo && d.date <= hi){ n++; if (d.status === "blocked") blocked++; if (price === null) price = d.price; else if (d.price !== price) same = false; } });
    $$("#csPanel [data-ca=open], #csPanel [data-ca=block]").forEach(function(b){ b.setAttribute("aria-pressed", (b.getAttribute("data-ca") === "block") === (n > 0 && blocked === n) ? "true" : "false"); });
    var cp = $("#calPrice"); if (document.activeElement !== cp) cp.value = same && price != null ? Math.round(price) : "";
  }
  drawSync();
};
$("#csClear").addEventListener("click", function(){ CAL.a = CAL.b = null; $("#calOut").textContent = ""; drawCal(); });
function drawSync(){
  var id = +$("#calListing").value, l = (ME.listings || []).filter(function(x){ return +x.id === id; })[0];
  var src = (ME.sources || []).filter(function(x){ return +x.listing_id === id && x.enabled; });
  $("#syncExport").innerHTML = l && l.ical_export_url ? '<code class="code-line" id="syncLink">' + esc(l.ical_export_url) + '</code><button type="button" class="btn ghost sm" id="syncCopy">Copy link</button>' : '<p class="m">Your link appears once the listing is saved.</p>';
  $("#syncList").innerHTML = src.length ? src.map(function(x){ return '<div class="sync-src"><span><b>' + esc(x.name) + '</b><small>' + esc(String(x.url).slice(0, 48)) + '...</small></span><button type="button" class="link" data-rmsync="' + esc(x.id) + '">Remove</button></div>'; }).join("") : '<p class="m">No calendars imported yet.</p>';
}
document.addEventListener("click", function(e){
  if (!e.target.closest) return;
  if (e.target.closest("#syncCopy")){ var t = $("#syncLink").textContent, b = $("#syncCopy"); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ b.textContent = "Copied"; setTimeout(function(){ b.textContent = "Copy link"; }, 2000); }, function(){}); }
  var rm = e.target.closest("[data-rmsync]");
  if (rm){
    if (!confirm("Stop syncing this calendar? Its booked dates will open here.")) return;
    rm.disabled = true; rm.textContent = "Removing...";
    api("bookhomes-host", {action: "remove_ical", id: rm.getAttribute("data-rmsync")}).then(refresh).then(function(){ drawSync(); $("#syncOut").textContent = "Calendar removed."; calSaved(); })
      .catch(function(err){ rm.disabled = false; rm.textContent = "Remove"; $("#syncOut").textContent = err.message; });
  }
  if (e.target.closest("#syncAdd")){
    var url = $("#syncUrl").value.trim();
    if (!/^(https|webcal):\/\//i.test(url)){ $("#syncOut").textContent = "Paste the full link (it starts with https:// or webcal://)."; return; }
    var ab = $("#syncAdd"); if (ab.disabled) return;
    ab.disabled = true; $("#syncOut").textContent = "Checking the link...";
    api("bookhomes-host", {action: "add_ical", listing_id: +$("#calListing").value, name: $("#syncName").value, url: url}).then(function(j){
      return refresh().then(function(){
        ab.disabled = false; $("#syncUrl").value = ""; drawSync(); calSaved();
        $("#syncOut").textContent = j.synced ? "Linked and synced: " + j.events + " booked or blocked periods found. We re-check every 15 minutes." : "Linked, but we couldn't read it yet: " + (j.error || "unknown problem") + " We'll keep trying every 15 minutes.";
      });
    }).catch(function(err){ ab.disabled = false; $("#syncOut").textContent = err.message; });
  }
});
$("#cal2").addEventListener("click", function(e){
  var b = e.target.closest("[data-day]"); if (!b || b.disabled) return;
  var s = b.getAttribute("data-day");
  if (!CAL.a || CAL.b){ CAL.a = s; CAL.b = null; } else CAL.b = s;
  drawCal();
});
$("#calBlocks").addEventListener("click", function(e){
  var b = e.target.closest("[data-unblock]"); if (!b) return;
  b.disabled = true; $("#calOut").textContent = "Saving...";
  api("bookhomes-host", {action: "unblock", id: b.getAttribute("data-unblock")}).then(function(){ $("#calOut").textContent = "Unblocked."; calSaved(); }, function(err){ b.disabled = false; $("#calOut").textContent = err.message; });
});
$("#calPrev").addEventListener("click", function(){ CAL.month = shiftMonth(CAL.month, -1); loadCal(); });
$("#calNext").addEventListener("click", function(){ CAL.month = shiftMonth(CAL.month, 1); loadCal(); });
$("#calListing").addEventListener("change", function(){ CAL.a = CAL.b = null; loadCal(); });
$$("[data-ca]").forEach(function(btn){ btn.addEventListener("click", function(){
  if (!CAL.a){ $("#calOut").textContent = "Tap the first and last night first."; return; }
  var lo = CAL.b && CAL.b < CAL.a ? CAL.b : CAL.a, hi = CAL.b && CAL.b > CAL.a ? CAL.b : CAL.a, id = +$("#calListing").value, a = btn.getAttribute("data-ca"), p;
  if (a === "block") p = api("bookhomes-host", {action: "block", listing_id: id, start: lo, end: hi, reason: "Host block"});
  else if (a === "open") p = api("bookhomes-host", {action: "set_nights", listing_id: id, start: lo, end: hi, open: true});
  else if (a === "price"){ var v = +$("#calPrice").value; if (!(v >= 10)){ $("#calOut").textContent = "Enter a price of at least £10."; return; } p = api("bookhomes-host", {action: "set_nights", listing_id: id, start: lo, end: hi, price: v}); }
  else p = api("bookhomes-host", {action: "set_nights", listing_id: id, start: lo, end: hi, price: null});
  $("#calOut").textContent = "Saving..."; calLocal(lo, hi, a, a === "price" ? +$("#calPrice").value : null);
  p.then(function(){ $("#calOut").textContent = "Saved."; CAL.a = CAL.b = null; calSaved(); }).catch(function(e){ $("#calOut").textContent = e.message; loadCal(); });
}); });

/* ---------- Listings: "Add your home" wizard (one question per screen) and the section editor ---------- */
var W = {id: null, l: null, i: 0, photos: [], mode: "wizard", sec: null, dirty: false, imported: null, priceHint: null, check: null, savedAt: 0};
var TYPES = [["house", "House", "home"], ["flat", "Flat", "city"], ["cottage", "Cottage", "countryside"], ["townhouse", "Townhouse", "home"], ["bungalow", "Bungalow", "home"], ["studio", "Studio", "door"], ["room", "Private room", "bed"]];
var CAT = [["city", "City", "city"], ["coast", "Coast", "coast"], ["countryside", "Countryside", "countryside"], ["family", "Family", "family"], ["groups", "Large groups", "groups"], ["hospital", "Near hospitals", "hospital"], ["events", "Match and event days", "events"], ["long_stay", "Long stays", "long_stay"]];
var AMEN = {wifi:"Wifi",parking:"Free parking",kitchen:"Kitchen",washer:"Washing machine",dryer:"Tumble dryer",tv:"TV",heating:"Heating",aircon:"Air conditioning",garden:"Garden",workspace:"Workspace",cot:"Cot",highchair:"High chair",bath:"Bath",ev_charger:"EV charger",pool_table:"Pool table",bbq:"BBQ",self_checkin:"Self check-in",step_free:"Step-free entrance",dishwasher:"Dishwasher",coffee:"Coffee maker",iron:"Iron",hairdryer:"Hairdryer",fireplace:"Fireplace",pets:"Pets allowed"};
var POLICIES = [["flexible", "Flexible", "Full refund up to 24 hours before check-in."], ["moderate", "Moderate", "Full refund up to 5 days before check-in, then 50%."], ["strict", "Strict", "Full refund up to 14 days before, 50% up to 7 days before."]];
var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
var MIN_PHOTOS = 5;
var NUMS = ["base_price","weekend_price","cleaning_fee","weekly_discount_pct","monthly_discount_pct","min_nights","max_nights","max_guests","bedrooms","beds","baths","guests_included","extra_guest_fee","pet_fee","advance_notice_days","prep_days","booking_window_days"];
function blank(){ return {property_type: "house", area: "", city: "Liverpool", lat: null, lng: null, max_guests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ["wifi", "kitchen", "heating"], categories: [],
  kosher: {kitchen: false, kitchen_type: null, separate_sinks: false, separate_ovens: false, supervision: "", shabbat: {}, shul_name: "", shul_walk_mins: null, eruv: "unknown", kosher_shops: "", mikvah: ""},
  business: {desk: false, wifi_mbps: null, van_parking: false, separate_beds: false, monthly_rates: false},
  title: "", description: "", house_rules: "No parties or events. No smoking.", check_in_time: "15:00", check_out_time: "11:00", cancellation_policy: "moderate",
  base_price: null, weekend_price: null, cleaning_fee: 0, weekly_discount_pct: 0, monthly_discount_pct: 0, min_nights: 1, max_nights: 28, airbnb_url: "", booking_url: "",
  guests_included: null, extra_guest_fee: 0, pets_allowed: false, pet_fee: 0, checkin_days: [], checkout_days: [], advance_notice_days: 0, prep_days: 0, booking_window_days: 365}; }
function norm(l){
  var o = Object.assign(blank(), l ? JSON.parse(JSON.stringify(l)) : {});
  ["kosher", "business"].forEach(function(k){ o[k] = Object.assign(blank()[k], o[k] || {}); });
  o.kosher.shabbat = o.kosher.shabbat || {};
  ["amenities", "categories", "checkin_days", "checkout_days"].forEach(function(k){ if (!Array.isArray(o[k])) o[k] = []; });
  ["check_in_time", "check_out_time"].forEach(function(k){ if (o[k]) o[k] = String(o[k]).slice(0, 5); });
  NUMS.forEach(function(k){ if (o[k] != null && o[k] !== "") o[k] = +o[k]; });
  return o;
}

/* ----- field renderers ----- */
function get(path){ return path.split(".").reduce(function(o, k){ return o == null ? undefined : o[k]; }, W.l); }
function set(path, v){ var ks = path.split("."), o = W.l; for (var i = 0; i < ks.length - 1; i++){ if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
function tiles(list, isOn, attr){ return '<div class="tiles">' + list.map(function(t){ return '<button type="button" class="tile" ' + attr + '="' + t[0] + '" aria-pressed="' + (isOn(t[0]) ? "true" : "false") + '">' + icon(t[2] || t[0]) + "<span>" + esc(t[1]) + "</span></button>"; }).join("") + "</div>"; }
function stepper(key, label, min, max, step){ var d = step || 1, v = +W.l[key] || 0; return '<div class="stepper"><span id="stl_' + key + '">' + label + '</span><div><button type="button" data-step="' + key + '" data-d="-' + d + '" data-min="' + min + '" data-max="' + max + '" aria-label="Fewer ' + esc(label) + '"' + (v <= min ? " disabled" : "") + '>' + icon("minus") + '</button><b id="st_' + key + '" aria-live="polite" aria-labelledby="stl_' + key + ' st_' + key + '">' + esc(v) + '</b><button type="button" data-step="' + key + '" data-d="' + d + '" data-max="' + max + '" data-min="' + min + '" aria-label="More ' + esc(label) + '"' + (v >= max ? " disabled" : "") + '>' + icon("plus") + "</button></div></div>"; }
function sw(path, label, ic){ return '<label class="switch"><span>' + icon(ic) + esc(label) + '</span><input type="checkbox" class="tg" data-sw="' + path + '"' + (get(path) ? " checked" : "") + "></label>"; }
function inp(path, label, type, extra, hint){ var v = get(path); return '<label class="f2">' + label + '<input type="' + (type || "text") + '" data-in="' + path + '" value="' + esc(v == null ? "" : v) + '" ' + (extra || "") + ">" + (hint ? "<small>" + hint + "</small>" : "") + "</label>"; }
function area(path, label, extra, hint){ var v = get(path) || "", m = (extra || "").match(/maxlength="(\d+)"/); return '<label class="f2">' + label + '<textarea data-in="' + path + '" ' + (extra || "") + ">" + esc(v) + "</textarea>" + (m ? '<small class="cnt" data-cnt="' + path + '">' + v.length + " / " + m[1] + "</small>" : "") + (hint ? "<small>" + hint + "</small>" : "") + "</label>"; }
function sel(path, label, opts){ var v = String(get(path)); return '<label class="f2">' + label + '<select data-in="' + path + '">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (String(o[0]) === v ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></label>"; }
function dayChips(path, label){ var on = get(path) || []; return '<div class="f2">' + label + '<div class="dchips">' + DAYS.map(function(d, i){ return '<button type="button" class="tile" data-dayk="' + path + '" data-d="' + (i + 1) + '" aria-pressed="' + (on.indexOf(i + 1) >= 0 ? "true" : "false") + '"><span>' + d + "</span></button>"; }).join("") + '</div><small style="color:var(--muted)">None ticked means any day.</small></div>'; }
function money0(v){ return v == null || v === "" ? "" : v; }
function rowMoney(path, label, sub, extra){ return '<label class="prow"><span><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + '</span><span class="pin">£<input type="number" inputmode="decimal" data-in="' + path + '" value="' + esc(money0(get(path))) + '" ' + (extra || 'min="0" max="2000" step="1"') + "></span></label>"; }
function rowPct(path, label, sub, max){ return '<label class="prow"><span><b>' + label + "</b><small>" + sub + '</small></span><span class="pin"><input type="number" inputmode="numeric" data-in="' + path + '" value="' + esc(money0(get(path))) + '" min="0" max="' + max + '">%</span></label>'; }
function rowNum(path, label, sub, min, max){ return '<label class="prow"><span><b>' + label + "</b><small>" + sub + '</small></span><span class="pin"><input type="number" inputmode="numeric" data-in="' + path + '" value="' + esc(money0(get(path))) + '" min="' + min + '" max="' + max + '"></span></label>'; }

/* ----- screens (used by both the wizard and the editor) ----- */
function typeR(){ return tiles(TYPES, function(k){ return W.l.property_type === k; }, "data-type"); }
function roomsR(){ return stepper("max_guests", "Guests", 1, 30) + stepper("bedrooms", "Bedrooms", 0, 30) + stepper("beds", "Beds", 0, 50) + stepper("baths", "Bathrooms", 0, 20, 0.5); }
function locR(){ return inp("area", "Area or neighbourhood", "text", 'placeholder="e.g. Allerton, south Liverpool" maxlength="80" autocomplete="off"', "Not the street address. Guests get the address after they book.") + inp("city", "Town or city", "text", 'maxlength="60"') +
  '<p class="pnote" style="margin-top:0">Find your home on the map: search, then drag the pin if needed. Guests only see a circle about 1 km wide, never the exact spot.</p>' +
  '<div class="geo"><label class="sr-only" for="geoQ">Search for your address or postcode</label><input type="search" id="geoQ" placeholder="Postcode or street, e.g. L18 1EE" autocomplete="off" enterkeyhint="search"><button type="button" class="btn ghost" id="geoGo">Search</button></div><div id="geoOut" aria-live="polite"></div>' +
  '<div class="pmap" id="pmap"></div><p class="m" id="pinTxt" style="font-size:13.5px;color:var(--muted);margin-top:6px">' + (W.l.lat != null ? "Pin set. Tap again to move it." : "No pin yet.") + "</p>"; }
function amenR(){ return tiles(Object.keys(AMEN).map(function(k){ return [k, AMEN[k]]; }), function(k){ return W.l.amenities.indexOf(k) >= 0; }, "data-amen"); }
function catR(){ return tiles(CAT, function(k){ return W.l.categories.indexOf(k) >= 0; }, "data-cat2"); }
function kosherR(){ var k = W.l.kosher; return '<p class="pnote" style="margin-top:0">Only tick what is true. Guests see "Details provided by the host". Please don\'t claim a certification or use a hechsher logo.</p>' + sw("kosher.kitchen", "Kosher kitchen", "kosher") +
  (k.kitchen ? sel("kosher.kitchen_type", "Kitchen", [["", "Choose"], ["meat", "Meat"], ["milk", "Milk (dairy)"], ["both", "Separate meat and milk"], ["parev", "Parev"]]) + sw("kosher.separate_sinks", "Separate sinks", "water") + sw("kosher.separate_ovens", "Separate ovens", "kitchen") : "") +
  inp("kosher.supervision", "Kashrut, in your words (optional)", "text", 'maxlength="300" placeholder="e.g. Kitchen kashered by our local rabbi in 2025"') +
  '<h3 class="psec">Shabbat</h3>' + sw("kosher.shabbat.hotplate", "Shabbat hot plate or blech", "shabbat") + sw("kosher.shabbat.urn", "Shabbat urn", "coffee") + sw("kosher.shabbat.lamp_timers", "Shabbat lamp or timers", "bolt") +
  sw("kosher.shabbat.non_electric_key", "Non-electric key or keypad override", "self_checkin") + sw("kosher.shabbat.no_motion_sensors", "No motion-sensor lights (or they switch off)", "check") +
  '<h3 class="psec">Nearby</h3>' + inp("kosher.shul_walk_mins", "Minutes' walk to the nearest shul", "number", 'min="1" max="120" inputmode="numeric"'); }
function workR(){ return sw("business.desk", "Desk or dedicated workspace", "workspace") + inp("business.wifi_mbps", "Wifi speed in Mbps", "number", 'min="1" max="10000" inputmode="numeric"', "Run a speed test at home, for example at fast.com.") + sw("business.van_parking", "Parking for vans", "van") + sw("business.separate_beds", "Separate beds (good for colleagues)", "bed") + sw("business.monthly_rates", "Monthly stays welcome", "long_stay"); }
function titleR(){ return inp("title", "Title", "text", 'maxlength="80" placeholder="e.g. Bright family house with garden near Sefton Park"') + '<small class="cnt" data-cnt="title">' + (W.l.title || "").length + " / 80</small>"; }
function descR(){ return area("description", "Description", 'maxlength="5000" rows="9"', "At least 60 characters. No street address, no 'was' prices."); }
function rulesR(){ return area("house_rules", "House rules", 'maxlength="2500" rows="6"', "For example: no parties, no smoking, quiet after 10pm."); }
function checkR(){ return '<div class="two">' + inp("check_in_time", "Check-in from", "time") + inp("check_out_time", "Checkout by", "time") + "</div>" + dayChips("checkin_days", "Days guests can arrive") + dayChips("checkout_days", "Days guests can leave"); }
function cancelR(){ return '<div class="radios">' + POLICIES.map(function(p){ return '<label class="radio"><input type="radio" name="canc" data-in="cancellation_policy" value="' + p[0] + '"' + (W.l.cancellation_policy === p[0] ? " checked" : "") + "><span><b>" + p[1] + "</b><small>" + p[2] + "</small></span></label>"; }).join("") + "</div>"; }
function priceR(){
  var l = W.l, pets = !!l.pets_allowed;
  return (W.priceHint ? '<p class="pnote" style="text-align:center;margin:0 0 8px">Your Airbnb page showed about £' + esc(W.priceHint) + " a night.</p>" : "") +
    '<div class="bigp"><span>£</span><input id="bigPrice" type="number" inputmode="numeric" data-in="base_price" value="' + esc(money0(l.base_price)) + '" min="10" max="10000" step="1" aria-label="Price per night in pounds" placeholder="0"></div><p class="bigp-sub">per night, Sunday to Thursday</p>' +
    '<div class="example ge" id="example" data-mode="night"></div>' +
    '<h3 class="psec">Weekend price</h3>' + rowMoney("weekend_price", "Friday and Saturday", "Leave blank to use your nightly price.", 'min="10" max="10000" step="1"') +
    '<p class="pnote">Prices for single dates (match days, Christmas, the Grand National) are set in your Calendar.</p>' +
    '<h3 class="psec">Fees</h3>' + rowMoney("cleaning_fee", "Cleaning fee", "Once per stay. Shown inside the total, never added at checkout.") +
    rowMoney("extra_guest_fee", "Extra guest fee", "Per guest, per night, above the guests included.", 'min="0" max="500" step="1"') + rowNum("guests_included", "Guests included", "Covered by the nightly price. Leave empty for no extra guest fee.", 1, 30) +
    '<label class="prow"><span><b>Pets allowed</b><small>Show your home to guests travelling with a pet.</small></span><input type="checkbox" class="tg" data-sw="pets_allowed"' + (pets ? " checked" : "") + "></label>" +
    (pets ? rowMoney("pet_fee", "Pet fee", "Once per stay.", 'min="0" max="500" step="1"') : "") +
    '<h3 class="psec">Discounts</h3>' + rowPct("weekly_discount_pct", "Weekly discount", "For stays of 7 nights or more.", 50) + rowPct("monthly_discount_pct", "Monthly discount", "For stays of 28 nights or more. Popular with work crews.", 60);
}
function availR(){
  return rowNum("min_nights", "Minimum nights", "Shortest stay you accept.", 1, 90) + rowNum("max_nights", "Maximum nights", "Longest stay you accept.", 1, 365) +
    sel("advance_notice_days", "How much notice do you need?", [[0, "Same day"], [1, "At least 1 day"], [2, "At least 2 days"], [3, "At least 3 days"], [7, "At least 7 days"]]) +
    sel("prep_days", "Preparation time between stays", [[0, "None"], [1, "Block 1 night before and after each booking"], [2, "Block 2 nights before and after each booking"]]) +
    sel("booking_window_days", "How far ahead can guests book?", [[90, "3 months"], [180, "6 months"], [365, "12 months"], [730, "24 months"]]);
}
var V = {
  location: function(){ var a = (W.l.area || "").trim(); return a.length < 2 ? "Please add the area, for example 'Allerton, south Liverpool'." : /\b\d+[a-z]?\s+[a-z' ]+\s(street|st|road|rd|avenue|ave|lane|ln|close|drive|dr|way|crescent|grove|terrace|place|court)\b/i.test(a) ? "Please give the area only, not the street address." : W.l.lat == null ? "Please tap the map near your home to set the pin." : ""; },
  photos: function(){ return W.photos.length < MIN_PHOTOS ? "Please add at least " + MIN_PHOTOS + " photos (you have " + W.photos.length + ")." : ""; },
  title: function(){ return (W.l.title || "").trim().length < 3 ? "Please add a title (at least 3 characters)." : ""; },
  description: function(){ var n = (W.l.description || "").trim().length; return n < 60 ? "A few more words please: " + (60 - n) + " more characters needed." : ""; },
  price: function(){ return !(+W.l.base_price >= 10) ? "Please set a nightly price of at least £10." : W.l.weekend_price !== "" && W.l.weekend_price != null && +W.l.weekend_price < 10 ? "The weekend price must be at least £10, or left blank." : ""; },
  avail: function(){ return +W.l.min_nights < 1 ? "Minimum nights must be at least 1." : +W.l.max_nights && +W.l.min_nights > +W.l.max_nights ? "Minimum nights can't be more than maximum nights." : ""; },
  times: function(){ return !/^\d\d:\d\d$/.test(W.l.check_in_time || "") || !/^\d\d:\d\d$/.test(W.l.check_out_time || "") ? "Please set check-in and checkout times." : ""; }
};
var STEPS = [
  {k: "import", h: "Already on Airbnb? Import your listing", lead: "Paste the link to your Airbnb listing. We copy the title, description, rooms, amenities and photos into a draft. You check every screen before you submit.", r: importStep, imp: true, hide: function(){ return W.l.status && W.l.status !== "draft" && W.l.status !== "rejected"; }},
  {k: "type", h: "Which of these best describes your place?", r: typeR, f: ["property_type"]},
  {k: "location", h: "Where's your place?", lead: "Give the area, not the street address.", r: locR, f: ["area", "city", "lat", "lng"], v: V.location, after: pinMap},
  {k: "rooms", h: "Share some basics", lead: "How many people can stay, and the rooms they get.", r: roomsR, f: ["max_guests", "bedrooms", "beds", "baths"]},
  {k: "amenities", h: "What does your place offer?", lead: "Tap everything guests can use.", r: amenR, f: ["amenities"]},
  {k: "kosher", h: "Kosher and Shabbat (optional)", r: kosherR, f: ["kosher"], rerender: true},
  {k: "work", h: "Work stays (optional)", lead: "Helps work crews and business guests find you.", r: workR, f: ["business"]},
  {k: "cats", h: "Which of these fit your place?", lead: "Pick any that apply. They help guests find you.", r: catR, f: ["categories"]},
  {k: "photos", h: "Add some photos of your place", lead: "At least " + MIN_PHOTOS + ", ideally 10 or more. Bright, landscape photos work best. Drag to reorder: the first is your cover. Please don't show the house number or street sign.", r: photoStep, v: V.photos, needId: true, after: photoAfter},
  {k: "title", h: "Now, give your place a title", lead: "Short titles work best. Have fun with it, you can always change it later.", r: titleR, f: ["title"], v: V.title},
  {k: "description", h: "Create your description", lead: "Share what makes your place special: rooms, beds, the area, transport.", r: descR, f: ["description"], v: V.description},
  {k: "rules", h: "House rules", lead: "Keep them short and friendly.", r: rulesR, f: ["house_rules"]},
  {k: "checkin", h: "Check-in and checkout", r: checkR, f: ["check_in_time", "check_out_time", "checkin_days", "checkout_days"], v: V.times},
  {k: "cancel", h: "Choose your cancellation policy", r: cancelR, f: ["cancellation_policy"]},
  {k: "price", h: "Now, set your price", lead: "You can change it any time.", r: priceR, f: ["base_price", "weekend_price", "cleaning_fee", "weekly_discount_pct", "monthly_discount_pct", "guests_included", "extra_guest_fee", "pets_allowed", "pet_fee"], v: V.price, after: example, rerender: true},
  {k: "avail", h: "Availability rules", lead: "How long guests can stay and how far ahead they can book.", r: availR, f: ["min_nights", "max_nights", "advance_notice_days", "prep_days", "booking_window_days"], v: V.avail},
  {k: "sync", h: "Sync your other calendars", lead: "Stops double bookings. Paste the calendar link (iCal) from Airbnb, Booking.com, Vrbo or Guesty. We check every 15 minutes.", r: icalStep, f: ["airbnb_url", "booking_url"], needId: true},
  {k: "review", h: "Review your listing", lead: "Here's what guests will see. Make sure everything looks good.", r: reviewStep, last: true}
];
var SECTIONS = [
  {k: "photos", t: "Photos", ic: "camera", r: photoStep, v: V.photos, after: photoAfter, instant: true, sum: function(){ return W.photos.length + " photo" + (W.photos.length === 1 ? "" : "s"); }},
  {k: "title", t: "Title and description", ic: "book", r: function(){ return titleR() + descR(); }, f: ["title", "description"], v: function(){ return V.title() || V.description(); }, sum: function(){ var t = (W.l.title || "").trim(); return t.length < 3 ? "Add a title" : V.description() ? t + " · description needs " + Math.max(1, 60 - (W.l.description || "").trim().length) + " more characters" : t; }},
  {k: "rooms", t: "Property type, guests and rooms", ic: "home", r: function(){ return '<h3 class="psec" style="margin-top:0">Property type</h3>' + typeR() + '<h3 class="psec">Guests and rooms</h3>' + stepper("max_guests", "Guests", 1, 30) + stepper("bedrooms", "Bedrooms", 0, 30) + stepper("beds", "Beds", 0, 50) + stepper("baths", "Bathrooms", 0, 20, 0.5); }, f: ["property_type", "max_guests", "bedrooms", "beds", "baths"], sum: function(){ var t = TYPES.filter(function(x){ return x[0] === W.l.property_type; })[0]; return (t ? t[1] : "Home") + " · " + pl(W.l.max_guests, "guest") + " · " + pl(W.l.bedrooms, "bedroom") + " · " + pl(W.l.beds, "bed") + " · " + pl(W.l.baths, "bath"); }},
  {k: "amenities", t: "Amenities", ic: "wifi", r: function(){ return amenR() + '<h3 class="psec">Good for</h3>' + catR(); }, f: ["amenities", "categories"], sum: function(){ var n = W.l.amenities.length; return n + (n === 1 ? " amenity" : " amenities"); }},
  {k: "location", t: "Location", ic: "pin", r: locR, f: ["area", "city", "lat", "lng"], v: V.location, after: pinMap, sum: function(){ return [W.l.area, W.l.city].filter(Boolean).join(", ") + (W.l.lat == null ? " · no map pin" : ""); }},
  {k: "rules", t: "House rules", ic: "list", r: rulesR, f: ["house_rules"], sum: function(){ return (W.l.house_rules || "None").slice(0, 60); }},
  {k: "checkin", t: "Check-in and checkout", ic: "clock", r: checkR, f: ["check_in_time", "check_out_time", "checkin_days", "checkout_days"], v: V.times, sum: function(){ return "Check-in from " + W.l.check_in_time + " · checkout by " + W.l.check_out_time; }},
  {k: "price", t: "Pricing and fees", ic: "tag", r: priceR, f: STEPS.filter(function(s){ return s.k === "price"; })[0].f, v: V.price, after: example, rerender: true, sum: function(){ return W.l.base_price ? "£" + W.l.base_price + " a night" + (W.l.cleaning_fee ? " · cleaning £" + W.l.cleaning_fee : "") : "Set your price"; }},
  {k: "avail", t: "Availability rules", ic: "calendar", r: availR, f: ["min_nights", "max_nights", "advance_notice_days", "prep_days", "booking_window_days"], v: V.avail, sum: function(){ return W.l.min_nights + " to " + W.l.max_nights + " nights"; }},
  {k: "kosher", t: "Kosher and Shabbat", ic: "kosher", r: kosherR, f: ["kosher"], rerender: true, sum: function(){ var k = W.l.kosher, n = Object.keys(k.shabbat || {}).filter(function(x){ return k.shabbat[x]; }).length; return (k.kitchen ? "Kosher kitchen" : "No kosher kitchen") + (n ? " · " + n + " Shabbat features" : ""); }},
  {k: "work", t: "Work stays and crews", ic: "work", r: workR, f: ["business"], sum: function(){ var b = W.l.business; return [b.desk && "Desk", b.wifi_mbps && b.wifi_mbps + " Mbps", b.van_parking && "Van parking", b.separate_beds && "Separate beds"].filter(Boolean).join(" · ") || "Not set"; }},
  {k: "sync", t: "Calendar sync", ic: "link", r: icalStep, f: ["airbnb_url", "booking_url"], sum: function(){ var n = (ME.sources || []).filter(function(s){ return +s.listing_id === W.id && s.enabled; }).length; return n ? n + " calendar" + (n === 1 ? "" : "s") + " linked" : "No calendars linked"; }},
  {k: "cancel", t: "Cancellation policy", ic: "shield", r: cancelR, f: ["cancellation_policy"], sum: function(){ var p = POLICIES.filter(function(x){ return x[0] === W.l.cancellation_policy; })[0]; return p ? p[1] : "Moderate"; }}
];

/* ----- local backup, so nothing is lost on refresh ----- */
function bkKey(){ return "bh_lst_" + (SESSION ? SESSION.user.id.slice(0, 8) : "x") + "_" + (W.id || "new"); }
function backup(){ try { lsSet(bkKey(), JSON.stringify({at: Date.now(), l: W.l, step: W.mode === "wizard" ? STEPS[W.i].k : null})); } catch (e) {} }
function readBackup(id){ var old = W.id; W.id = id; var k = bkKey(); W.id = old; try { var v = JSON.parse(lsGet(k) || "null"); return v && Date.now() - v.at < 14 * 864e5 ? v : null; } catch (e) { return null; } }
function dropBackup(){ lsDel(bkKey()); }
function setHash(h){ try { history.replaceState(null, "", location.pathname + location.search + (h ? "#" + h : "")); } catch (e) {} }

/* ----- saving: one at a time, so a new draft is never created twice ----- */
var chain = Promise.resolve(), autoT = null;
function payload(fields){ var o = {}; fields.forEach(function(k){ var v = W.l[k]; if (NUMS.indexOf(k) >= 0) v = v === "" || v == null ? null : +v; if (k === "business" && v) v = Object.assign({}, v, {wifi_mbps: v.wifi_mbps ? +v.wifi_mbps : null}); if (k === "kosher" && v) v = Object.assign({}, v, {shul_walk_mins: v.shul_walk_mins ? +v.shul_walk_mins : null}); if ((k === "airbnb_url" || k === "booking_url") && !v) v = null; o[k] = v; }); return o; }
function saved(state, text){
  $$(".saved").forEach(function(x){ x.className = "saved " + state; x.textContent = text || ""; });
}
function save(fields){
  var snap = payload(fields || []);
  chain = chain.catch(function(){}).then(function(){
    var body = {action: "save_listing", listing: snap};
    if (W.id) body.id = W.id; else body.listing.title = (W.l.title || "").trim().length >= 3 ? W.l.title : (W.l.area ? "Home in " + String(W.l.area).split(",")[0] : "My home");
    saved("ing", "Saving...");
    return api("bookhomes-host", body).then(function(j){
      if (!W.id){ var old = bkKey(); W.id = j.id; lsDel(old); if (W.mode === "wizard") setHash("wizard=" + W.id); }
      W.savedAt = Date.now(); saved("ok", j.live_edit ? "Saved and live" : "Saved");
      var l = (ME.listings || []).filter(function(x){ return +x.id === +W.id; })[0];
      if (l) Object.assign(l, snap); else (ME.listings = ME.listings || []).push(Object.assign({id: W.id, status: "draft"}, W.l));
      return j;
    }, function(e){ saved("err", "Not saved: " + e.message); throw e; });
  });
  return chain;
}
function autosave(){
  backup();
  if (W.mode !== "wizard") return;
  var s = STEPS[W.i]; if (!s.f) return;
  clearTimeout(autoT); saved("ing", "Unsaved changes");
  autoT = setTimeout(function(){ if ((s.v && s.v()) || (!W.id && !s.f.length)){ saved("", ""); return; } save(s.f).catch(function(){}); }, 900);
}

/* ----- open a listing: drafts in the wizard, the rest in the editor ----- */
function findL(id){ return (ME.listings || []).filter(function(x){ return +x.id === +id; })[0] || null; }
function load(id, useBackup){
  var l = id ? findL(id) : null;
  W.id = id || null; W.l = norm(l); W.photos = id ? (ME.photos || []).filter(function(p){ return +p.listing_id === +id; }) : [];
  W.priceHint = null; W.imported = null; W.check = null; W.dirty = false;
  var bk = readBackup(id || null);
  if (useBackup && bk && bk.l && (!l || !l.updated_at || bk.at > Date.parse(l.updated_at))) W.l = norm(Object.assign({}, W.l, bk.l, {status: W.l.status, id: W.l.id, slug: W.l.slug}));
  return {l: l, bk: bk};
}
function pl(n, w){ n = +n || 0; return n + " " + w + (n === 1 ? "" : "s"); }
function openListing(id, sec){ var l = id ? findL(id) : null; if (!l || l.status === "draft") openWizard(id); else openEditor(id, sec); }
function openWizard(id, stepK){
  var r = load(id, true); W.mode = "wizard"; W.pasteMode = false;
  var want = stepK || lsGet("bh_step_" + (id || "new")) || (r.bk && r.bk.step);
  if (want === "import" && id && W.l.airbnb_url) want = "type";
  var idx = STEPS.map(function(s){ return s.k; }).indexOf(want);
  if (idx < 0 && id){ idx = 1; for (var i = 1; i < STEPS.length; i++){ if (STEPS[i].v && STEPS[i].v()){ idx = i; break; } idx = i; } }
  W.i = idx < 0 ? 0 : idx;
  if (STEPS[W.i].hide && STEPS[W.i].hide()) W.i = 1;
  show("#wz", true); show("#ed", false); document.body.style.overflow = "hidden"; saved("", W.id ? "Saved" : "");
  setHash("wizard=" + (W.id || "new")); drawStep();
}
function closeAll(){ clearTimeout(autoT); show("#wz", false); show("#ed", false); show("#pv", false); document.body.style.overflow = ""; setHash(""); refresh().catch(function(){}); }
function visSteps(){ return STEPS.filter(function(x){ return !(x.hide && x.hide()); }); }
function drawStep(){
  var s = STEPS[W.i], vis = visSteps(), pos = vis.indexOf(s) + 1;
  $("#wzBar").style.width = Math.round(pos / vis.length * 100) + "%";
  $("#wzBar").parentNode.setAttribute("aria-valuenow", Math.round(pos / vis.length * 100));
  $("#wzStep").textContent = "Step " + pos + " of " + vis.length;
  $("#wzIn").innerHTML = '<h2 id="wzH" tabindex="-1">' + esc(s.h) + "</h2>" + (s.lead ? '<p class="lead">' + esc(s.lead) + "</p>" : "") + s.r();
  $("#wzBack").style.visibility = pos > 1 ? "visible" : "hidden";
  $("#wzNext").textContent = s.last ? "Submit for approval" : s.imp && !W.imported && !W.id ? "Skip, start from scratch" : "Next";
  $("#wzNext").style.visibility = "visible"; $("#wzNext").disabled = false;
  $("#wzIn").classList.remove("in"); void $("#wzIn").offsetWidth; $("#wzIn").classList.add("in");
  wzMsg("");
  if (W.id) lsSet("bh_step_" + W.id, s.k);
  $("#wz").classList.toggle("has-id", !!W.id);
  setHash("wizard=" + (W.id || "new"));
  if (s.after) s.after();
  $(".wz-body").scrollTop = 0;
}
function wzMsg(t){ $("#wzMsg").textContent = t || ""; $("#wzMsg").classList.toggle("hidden", !t); }
$("#wzNext").addEventListener("click", function(){
  var s = STEPS[W.i], err = s.v ? s.v() : "", b = this;
  if (err){ wzMsg(err); return; }
  clearTimeout(autoT); wzMsg("");
  if (s.last){ submitListing(b, true); return; }
  var nx = W.i + 1; while (STEPS[nx].hide && STEPS[nx].hide()) nx++;
  var need = s.f || (STEPS[nx].needId && !W.id) ? save(s.f || []) : Promise.resolve();
  // host-perf: once the listing exists, Next moves on at once and the save finishes in the background
  // (the footer shows "Saving..." then "Saved", or "Not saved: ..." if it fails; nothing is lost, saves run in order)
  if (W.id){ need.catch(function(){}); W.i = nx; drawStep(); return; }
  b.disabled = true; var lbl = b.textContent; b.innerHTML = '<span class="spin"></span>Saving';
  need.then(function(){ b.disabled = false; b.textContent = lbl; W.i = nx; drawStep(); }, function(e){ b.disabled = false; b.textContent = lbl; wzMsg(e.message); });
});
$("#wzBack").addEventListener("click", function(){
  var s = STEPS[W.i]; if (s.f && !(s.v && s.v())) save(s.f).catch(function(){});
  var pv = W.i - 1; while (pv > 0 && STEPS[pv].hide && STEPS[pv].hide()) pv--;
  if (pv >= 0 && !(STEPS[pv].hide && STEPS[pv].hide())){ W.i = pv; drawStep(); }
});
$("#wzSave").addEventListener("click", function(){
  var s = STEPS[W.i], b = this;
  if (!s.f || (s.v && s.v()) || (!W.id && !W.l.area && !W.l.title)){ backup(); closeAll(); return; }
  busy(b, true, "Saving..."); clearTimeout(autoT);
  save(s.f).then(function(){ busy(b, false, "Save and exit"); closeAll(); }, function(e){ busy(b, false, "Save and exit"); wzMsg(e.message + " Your changes are kept on this device."); });
});
function submitListing(b, inWizard){
  if (!inWizard && W.dirty){ edStatusMsg("Please save or cancel your changes in this section first."); return; }
  var miss = missing();
  if (miss.length){ var t = "Almost there. Still needed: " + miss.map(function(m){ return m[1]; }).join(", ") + "."; if (inWizard) wzMsg(t); else edStatusMsg(t, miss); return; }
  var lbl = b.textContent; b.disabled = true; b.innerHTML = '<span class="spin"></span>Submitting';
  var all = Object.keys(blank());
  (W.mode === "wizard" ? save(all) : Promise.resolve()).then(function(){ return api("bookhomes-host", {action: "submit_listing", id: W.id}); }).then(function(){
    b.disabled = false; b.textContent = lbl; dropBackup();
    var l = findL(W.id); if (l) l.status = "pending"; W.l.status = "pending";
    if (inWizard){
      $("#wzIn").innerHTML = '<div class="done">' + icon("check") + "<h2>Thanks! Your listing is with us.</h2><p class='lead'>We check every listing, usually within one working day, and email you when it's live. You can still make changes while you wait.</p><div class='acts'><button type='button' class='btn' id='wzToEd'>Open my listing</button><button type='button' class='btn ghost' id='wzDone'>Back to dashboard</button></div></div>";
      $("#wzNext").style.visibility = "hidden"; $("#wzBack").style.visibility = "hidden"; $("#wzBar").style.width = "100%";
      $("#wzDone").addEventListener("click", closeAll); $("#wzToEd").addEventListener("click", function(){ refresh().then(function(){ openEditor(W.id); }); });
    } else refresh().then(function(){ openEditor(W.id, W.sec); });
  }).catch(function(e){ b.disabled = false; b.textContent = lbl; if (inWizard) wzMsg(e.message); else edStatusMsg(e.message); });
}
function missing(){
  var m = [];
  if (V.title()) m.push(["title", "a title"]);
  if (V.description()) m.push(["description", "a description of 60+ characters"]);
  if (V.location()) m.push(["location", "the area and map pin"]);
  if (V.photos()) m.push(["photos", "at least " + MIN_PHOTOS + " photos"]);
  if (V.price()) m.push(["price", "a nightly price"]);
  return m;
}

/* ----- input handling (shared by wizard and editor bodies) ----- */
function changed(){ if (W.mode === "editor"){ W.dirty = true; edDirty(); backup(); edErr(""); clearTimeout(W.navT); W.navT = setTimeout(edNav, 250); } else { wzMsg(""); autosave(); } }
// editor: redraw the open section in place (keep the section, unsaved changes and scroll position)
function rerenderBody(){ if (W.mode !== "editor") return drawStep(); var d = W.dirty, m = $("#edMain"), y = m ? m.scrollTop : 0; drawSection(W.sec); W.dirty = d; edDirty(); if (m) m.scrollTop = y; }
function onClick(e){
  var t = e.target.closest && e.target.closest("[data-dayk],[data-type],[data-amen],[data-cat2],[data-step],[data-ge]");
  if (!t) return;
  if (t.hasAttribute("data-ge")){ $("#example").setAttribute("data-mode", t.getAttribute("data-ge")); example(); return; }
  if (t.hasAttribute("data-dayk")){ var dp = t.getAttribute("data-dayk"), dv = +t.getAttribute("data-d"), da = (get(dp) || []).slice(), di = da.indexOf(dv); if (di >= 0) da.splice(di, 1); else da.push(dv); da.sort(); set(dp, da); t.setAttribute("aria-pressed", di >= 0 ? "false" : "true"); }
  else if (t.hasAttribute("data-type")){ W.l.property_type = t.getAttribute("data-type"); $$("[data-type]", t.parentNode).forEach(function(x){ x.setAttribute("aria-pressed", x === t ? "true" : "false"); }); }
  else if (t.hasAttribute("data-amen") || t.hasAttribute("data-cat2")){
    var key = t.hasAttribute("data-amen") ? "amenities" : "categories", v = t.getAttribute(t.hasAttribute("data-amen") ? "data-amen" : "data-cat2"), arr = W.l[key], i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    t.setAttribute("aria-pressed", i >= 0 ? "false" : "true");
  } else {
    var k = t.getAttribute("data-step"), lo = +t.getAttribute("data-min"), hi = +t.getAttribute("data-max"), n = Math.round(((+W.l[k] || 0) + +t.getAttribute("data-d")) * 2) / 2;
    n = Math.max(lo, Math.min(hi, n));
    W.l[k] = n; $("#st_" + k).textContent = n;
    $$('[data-step="' + k + '"]', t.parentNode).forEach(function(x){ x.disabled = +x.getAttribute("data-d") < 0 ? n <= lo : n >= hi; });
  }
  changed();
}
function onInput(e){
  var t = e.target;
  if (t.hasAttribute && t.hasAttribute("data-in")){
    if (t.type === "radio" && !t.checked) return;
    set(t.getAttribute("data-in"), t.value);
    var c = document.querySelector('[data-cnt="' + t.getAttribute("data-in") + '"]'); if (c) c.textContent = t.value.length + " / " + (t.getAttribute("maxlength") || "");
    if (t.getAttribute("data-in") === "base_price" || /fee|price|discount/.test(t.getAttribute("data-in"))) example();
    changed();
  }
}
function onChange(e){
  var t = e.target;
  if (t.hasAttribute("data-sw")){ set(t.getAttribute("data-sw"), t.checked); changed(); var sct = W.mode === "editor" ? SECTIONS.filter(function(s){ return s.k === W.sec; })[0] : STEPS[W.i]; if (sct && sct.rerender) rerenderBody(); }
  else if (t.hasAttribute("data-in") && t.tagName === "SELECT"){ set(t.getAttribute("data-in"), t.value); changed(); }
  else if (t.hasAttribute("data-in") && t.type === "radio" && t.checked){ set(t.getAttribute("data-in"), t.value); changed(); }
  if (t.id === "phFiles"){ upload(t.files); t.value = ""; }
}
["#wzIn", "#edBody"].forEach(function(id){ var el = $(id); el.addEventListener("click", onClick); el.addEventListener("input", onInput); el.addEventListener("change", onChange); });

/* Location map: search an address (OpenStreetMap Nominatim, max 1 request a second), tap the map or drag the pin.
   We store the spot rounded to about 1 km; guests only ever see a circle. */
var MAPX = {map: null, pin: null, circle: null, lastGeo: 0, ro: null};
function pinMap(){
  var el = $("#pmap"); if (!el) return;
  if (!window.L){
    $("#pinTxt").textContent = "Loading the map...";
    var p = window.HP && HP.leaflet ? HP.leaflet() : loadLeaflet();
    p.then(function(){ if (window.L && $("#pmap") === el) pinMap(); }, function(){ $("#pinTxt").textContent = "The map didn't load. Check your connection and try again. You can still search for your area above."; });
    return;
  }
  if (el._leaflet_id) return;
  if (MAPX.ro){ MAPX.ro.disconnect(); MAPX.ro = null; }
  var has = W.l.lat != null && W.l.lng != null, start = has ? [+W.l.lat, +W.l.lng] : [53.41, -2.98];
  var m = L.map(el, {scrollWheelZoom: false, tap: true}).setView(start, has ? 14 : 11);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).addTo(m);
  var icon = L.divIcon({className: "bh-pin", html: '<span></span>', iconSize: [34, 44], iconAnchor: [17, 42]});
  MAPX = {map: m, pin: null, circle: null, lastGeo: MAPX.lastGeo, ro: null};
  function put(ll, from){
    W.l.lat = Math.round(ll.lat * 100) / 100; W.l.lng = Math.round(ll.lng * 100) / 100;
    if (!MAPX.pin){ MAPX.pin = L.marker(ll, {draggable: true, icon: icon, keyboard: true, title: "Drag to move"}).addTo(m); MAPX.pin.on("dragend", function(){ put(MAPX.pin.getLatLng(), "drag"); }); }
    else MAPX.pin.setLatLng(ll);
    if (MAPX.circle) MAPX.circle.setLatLng([W.l.lat, W.l.lng]); else MAPX.circle = L.circle([W.l.lat, W.l.lng], {radius: 900, color: "#1f4d3a", weight: 1.5, fillOpacity: .12, interactive: false}).addTo(m);
    $("#pinTxt").textContent = "Pin set. Drag it or tap the map to move it. Guests only see the shaded circle.";
    if (from) changed();
  }
  if (has) put(L.latLng(start[0], start[1]));
  m.on("click", function(e){ put(e.latlng, "tap"); });
  // the map may first be drawn while the step slides in or a panel opens: fix its size once it settles
  [0, 200, 450, 900].forEach(function(t){ setTimeout(function(){ if (MAPX.map === m) m.invalidateSize(); }, t); });
  if (window.ResizeObserver){ MAPX.ro = new ResizeObserver(function(){ if (MAPX.map === m) m.invalidateSize(); }); MAPX.ro.observe(el); }
  MAPX.put = put;
}
function loadLeaflet(){
  return new Promise(function(res, rej){
    if (!document.querySelector('link[href*="leaflet.css"]')){ var c = document.createElement("link"); c.rel = "stylesheet"; c.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"; document.head.appendChild(c); }
    var s = document.createElement("script"); s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"; s.onload = res; s.onerror = rej; document.body.appendChild(s);
  });
}
function geoSearch(){
  var q = ($("#geoQ").value || "").trim(), out = $("#geoOut"), b = $("#geoGo");
  if (q.length < 3){ out.innerHTML = '<p class="m">Type a postcode, street or area.</p>'; return; }
  var wait = Math.max(0, 1100 - (Date.now() - MAPX.lastGeo));
  busy(b, true, "Searching...");
  setTimeout(function(){
    MAPX.lastGeo = Date.now();
    fetch("https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=gb&accept-language=en-GB&q=" + encodeURIComponent(q), {headers: {"Accept": "application/json"}})
      .then(function(r){ if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(rows){
        busy(b, false, "Search");
        if (!rows.length){ out.innerHTML = '<p class="m">No match. Try a postcode or a nearby street, or tap the map.</p>'; return; }
        out.innerHTML = '<ul class="geolist">' + rows.map(function(r, i){ return '<li><button type="button" data-geo="' + i + '">' + icon("pin") + "<span>" + esc(r.display_name) + "</span></button></li>"; }).join("") + "</ul>";
        out._rows = rows;
      })
      .catch(function(){ busy(b, false, "Search"); out.innerHTML = '<p class="m">Search isn\'t working right now. Tap the map near your home instead.</p>'; });
  }, wait);
}
document.addEventListener("click", function(e){
  if (!e.target.closest) return;
  if (e.target.closest("#geoGo")){ geoSearch(); return; }
  var g = e.target.closest("[data-geo]"); if (!g) return;
  var r = ($("#geoOut")._rows || [])[+g.getAttribute("data-geo")]; if (!r || !MAPX.map || !MAPX.put) return;
  var ll = L.latLng(+r.lat, +r.lon); MAPX.map.setView(ll, 15); MAPX.put(ll, "search");
  $("#geoOut").innerHTML = ""; $("#geoQ").value = "";
  // fill the town if empty; never copy the street into the public area field
  var a = r.address || {}, town = a.city || a.town || a.village; if (town && !W.l.city){ W.l.city = town; var ci = $('[data-in="city"]'); if (ci) ci.value = town; }
});
document.addEventListener("keydown", function(e){ if (e.key === "Enter" && e.target && e.target.id === "geoQ"){ e.preventDefault(); geoSearch(); } });
function example(){
  var el = $("#example"); if (!el) return;
  var p = +W.l.base_price || 0, wk = +W.l.weekend_price || 0, c = +W.l.cleaning_fee || 0, pct = ME.commission_pct != null ? ME.commission_pct : 15;
  var big = $("#bigPrice"); if (big && document.activeElement !== big) big.value = W.l.base_price == null ? "" : W.l.base_price;
  if (big) big.style.width = (Math.max(1, String(big.value || "").length) + 0.4) + "ch";
  if (!p){ el.innerHTML = '<p class="m">Add a nightly price to see what guests pay and what you earn.</p>'; return; }
  var mode = el.getAttribute("data-mode") || "night";
  var nights = mode === "night" ? [p] : [p, p, p, p, wk || p, wk || p, p];
  var nightsAmt = nights.reduce(function(a, b){ return a + b; }, 0);
  var disc = mode === "week" && +W.l.weekly_discount_pct ? Math.round(nightsAmt * +W.l.weekly_discount_pct) / 100 : 0;
  var total = nightsAmt - disc + c, fee = Math.round(total * pct) / 100;
  var row = function(a, b, cls){ return '<div class="ge-row' + (cls ? " " + cls : "") + '"><span>' + a + "</span><span>" + b + "</span></div>"; };
  el.innerHTML = '<div class="ge-seg" role="group" aria-label="Example stay"><button type="button" data-ge="night" aria-pressed="' + (mode === "night") + '">1 weeknight</button><button type="button" data-ge="week" aria-pressed="' + (mode === "week") + '">7 nights</button></div>' +
    '<div class="ge-cols"><div class="ge-col"><small>Guest pays</small><b>' + money(total * 100) + "</b>" +
      row(mode === "night" ? "1 night" : "7 nights" + (wk && wk !== p ? " (incl. Fri, Sat)" : ""), money(nightsAmt * 100)) + (disc ? row("Weekly discount", "-" + money(disc * 100), "ge-disc") : "") +
      (c ? row("Cleaning fee", money(c * 100)) : "") + row("Booking fee", "£0", "ge-free") + "</div>" +
    '<div class="ge-col ge-earn"><small>You earn</small><b>' + money((total - fee) * 100) + "</b>" + row("Guest total", money(total * 100)) + row("Book Homes " + pct + "%", "-" + money(fee * 100)) + "</div></div>";
}

/* ----- Airbnb import (first wizard screen) ----- */
var CHECK_LABEL = {area: ["location", "Add your area (neighbourhood), not just the city"], map_pin: ["location", "Set your map pin"], price: ["price", "Set your nightly price (we never copy Airbnb prices)"], photos: ["photos", "Add photos: at least " + MIN_PHOTOS], description: ["description", "Write a description"], title: ["title", "Add a title"], house_rules: ["rules", "Add house rules"]};
function importStep(){
  if (W.imported) return importDone();
  if (W.pasteMode) return pasteStep();
  return '<div class="imp"><label class="f2">Airbnb listing link<input type="url" id="impUrl" inputmode="url" autocomplete="off" placeholder="https://www.airbnb.co.uk/rooms/12345678" value="' + esc(W.l.airbnb_url || "") + '"></label>' +
    '<button type="button" class="btn block" id="impGo">' + icon("bolt") + "Import my listing</button>" +
    '<div id="impState" aria-live="polite"></div>' +
    '<div class="imp-how"><b>Where do I find the link?</b><span>Open your listing on airbnb.co.uk, tap Share, then Copy link. Only import homes you own or manage. We never copy reviews, ratings or prices.</span></div>' +
    '<p class="imp-alt">Not on Airbnb? Tap <b>Skip, start from scratch</b> below. It takes about 10 minutes.</p></div>';
}
function pasteStep(){
  return '<div class="msg err" style="margin-bottom:16px">Airbnb didn\'t let us read that page automatically. No problem: paste your title and description from Airbnb below and we\'ll fill them in. You\'ll add photos and the rest in the next steps.</div>' +
    inp("title", "Title from Airbnb", "text", 'maxlength="80" id="pTitle"') + area("description", "Description from Airbnb", 'maxlength="5000" rows="8"') +
    '<button type="button" class="link" id="impRetry">Try the link again</button>';
}
function importDone(){
  var j = W.imported, got = [], chk = (W.check || []).map(function(c){ return CHECK_LABEL[c]; }).filter(Boolean);
  if (j.title) got.push("Title: " + j.title);
  if (j.description) got.push("Description (" + j.description.length + " characters)");
  if (j.property_type) got.push("Property type: " + ((TYPES.filter(function(t){ return t[0] === j.property_type; })[0] || [0, j.property_type])[1]));
  if (j.max_guests) got.push(j.max_guests + " guests, " + (j.bedrooms || 0) + " bedrooms, " + (j.beds || 0) + " beds, " + (j.baths || 0) + " baths");
  if (j.amenities && j.amenities.length) got.push(j.amenities.length + " amenities");
  if (j.house_rules) got.push("House rules");
  if (j.check_in_time) got.push("Check-in " + String(j.check_in_time).slice(0, 5) + ", checkout " + String(j.check_out_time || "").slice(0, 5));
  if (W.photos.length) got.push(W.photos.length + " photos");
  return '<div class="imp-ok">' + icon("check") + '<div><b>Imported from Airbnb</b><span>' + esc(j.title || "Your listing") + "</span></div></div>" +
    '<h3 class="psec">What we copied</h3><ul class="imp-got">' + got.map(function(g){ return "<li>" + icon("check") + esc(g) + "</li>"; }).join("") + "</ul>" +
    (chk.length ? '<h3 class="psec">Still to check or add</h3><ul class="imp-chk">' + chk.map(function(c){ return "<li>" + icon("bell") + esc(c[1]) + "</li>"; }).join("") + "</ul>" : "") +
    (W.priceHint ? '<p class="pnote">Airbnb showed about £' + esc(W.priceHint) + " a night. We show it on the price screen as a guide only.</p>" : "") +
    '<p class="lead" style="margin-top:16px">Tap Next to check each screen.</p>';
}
function impProgress(i){
  var steps = ["Reading your Airbnb listing", "Copying details and amenities", "Copying photos (this can take 30 seconds)"];
  $("#impState").innerHTML = '<ul class="imp-prog">' + steps.map(function(t, k){ return '<li class="' + (k < i ? "done" : k === i ? "now" : "") + '"><span class="dotx">' + (k < i ? icon("check") : "") + "</span>" + t + "</li>"; }).join("") + "</ul>";
}
$("#wzIn").addEventListener("click", function(e){
  if (e.target.closest && e.target.closest("#impRetry")){ W.pasteMode = false; drawStep(); return; }
  if (!e.target.closest || !e.target.closest("#impGo")) return;
  var url = ($("#impUrl").value || "").trim(), b = $("#impGo");
  if (!/^https:\/\/([a-z]+\.)?airbnb\.[a-z.]+\/rooms\/(plus\/)?\d{4,25}/i.test(url)){
    $("#impState").innerHTML = '<p class="msg err" style="margin-top:12px">That doesn\'t look like an Airbnb listing link. It usually looks like https://www.airbnb.co.uk/rooms/12345678. Short links (abnb.me) don\'t work: open them first and copy the full link.</p>'; return;
  }
  b.disabled = true; $("#wzNext").disabled = true; impProgress(0);
  var k = 0, tick = setInterval(function(){ if (k < 2) impProgress(++k); }, 2500);
  api("bookhomes-import-airbnb", {url: url, listing_id: W.id || undefined}).then(function(j){
    if (!j.ok){ var er = new Error(j.error || "We couldn't read that listing."); er.manual = !!j.manual; throw er; }
    var old = bkKey(); W.id = +j.listing_id; lsDel(old); W.priceHint = j.price_hint || null; W.check = j.check || [];
    return api("bookhomes-host", {action: "me"}).then(function(me){
      ME = me; clearInterval(tick); impProgress(3);
      W.l = norm(findL(W.id)); W.photos = (ME.photos || []).filter(function(p){ return +p.listing_id === W.id; });
      W.imported = Object.assign({}, W.l); setHash("wizard=" + W.id); saved("ok", "Saved");
      setTimeout(function(){ drawStep(); }, 400);
    });
  }).catch(function(err){
    clearInterval(tick); b.disabled = false; $("#wzNext").disabled = false;
    if (err.manual){ W.l.airbnb_url = url; W.pasteMode = true; drawStep(); return; }
    $("#impState").innerHTML = '<p class="msg err" style="margin-top:12px">' + esc(err.message || "We couldn't read that listing.") + " You can fill in the details yourself: tap <b>Skip, start from scratch</b>.</p>";
  });
});

/* ----- photos: resize in the browser, upload with progress and retries, drag to reorder, cover, captions ----- */
function photoStep(){
  return '<label class="drop" id="phDrop">' + icon("camera") + '<b>Add photos</b><br><span style="color:var(--muted);font-size:14px">Tap to choose, or drag them here. JPG, PNG, WebP or iPhone (HEIC) photos.</span><input type="file" id="phFiles" accept="image/*,.heic,.heif" multiple hidden></label>' +
    '<div id="phQueue" aria-live="polite"></div><p class="m" id="phOut" style="margin-top:8px"></p>' +
    '<p class="phcount" id="phCount">' + phCountText() + '</p><div class="phgrid" id="phGrid">' + photoTiles() + "</div>";
}
function phCountText(){ var n = W.photos.length; return n >= MIN_PHOTOS ? n + " photos. Drag to reorder." : n + " of " + MIN_PHOTOS + " photos needed"; }
function photoTiles(){
  var n = W.photos.length;
  return W.photos.map(function(p, i){
    return '<figure data-pid="' + esc(p.id) + '"><div class="phimg">' + HP.img(p.thumb_url || p.url, 480, 'alt="' + esc(p.caption || "Photo " + (i + 1)) + '" loading="lazy" draggable="false"') + (i === 0 ? '<span class="cover">Cover photo</span>' : "") +
      '<span class="grip" aria-hidden="true" title="Drag to reorder">' + icon("grid") + '</span></div>' +
      '<input class="cap" type="text" maxlength="140" placeholder="Add a caption" value="' + esc(p.caption || "") + '" data-cap="' + esc(p.id) + '" aria-label="Caption for photo ' + (i + 1) + '">' +
      '<div class="phacts"><button type="button" data-mv="-1" data-id="' + esc(p.id) + '" aria-label="Move earlier"' + (i ? "" : " disabled") + ">" + icon("chev_l") + '</button><button type="button" data-mv="1" data-id="' + esc(p.id) + '" aria-label="Move later"' + (i < n - 1 ? "" : " disabled") + ">" + icon("chev_r") + "</button>" +
      (i ? '<button type="button" data-cover="' + esc(p.id) + '" aria-label="Make this the cover photo">' + icon("star") + "Cover</button>" : "<span></span>") + '<button type="button" data-delph="' + esc(p.id) + '" aria-label="Delete photo ' + (i + 1) + '">' + icon("x") + "</button></div></figure>";
  }).join("");
}
function redrawPhotos(){ var g = $("#phGrid"); if (g) g.innerHTML = photoTiles(); var c = $("#phCount"); if (c) c.textContent = phCountText(); if (W.mode === "editor") edNav(); }
function persistOrder(){
  saved("ing", "Saving order...");
  return api("bookhomes-host", {action: "order_photos", listing_id: W.id, ids: W.photos.map(function(p){ return p.id; })})
    .then(function(){ saved("ok", "Saved"); syncPhotosToMe(); }, function(e){ saved("err", "Order not saved: " + e.message); });
}
function syncPhotosToMe(){ ME.photos = (ME.photos || []).filter(function(p){ return +p.listing_id !== +W.id; }).concat(W.photos.map(function(p, i){ return Object.assign({}, p, {listing_id: W.id, sort: i}); })); }
function photoClick(e){
  if (!e.target.closest) return;
  var c = e.target.closest("[data-cover]"), d = e.target.closest("[data-delph]"), mv = e.target.closest("[data-mv]");
  if (c){ var id = c.getAttribute("data-cover"); W.photos.sort(function(a, b){ return a.id === id ? -1 : b.id === id ? 1 : 0; }); redrawPhotos(); persistOrder(); }
  if (mv){ var mid = mv.getAttribute("data-id"), i = W.photos.map(function(p){ return p.id; }).indexOf(mid), j = i + +mv.getAttribute("data-mv"); if (j < 0 || j >= W.photos.length) return; var t = W.photos[i]; W.photos[i] = W.photos[j]; W.photos[j] = t; redrawPhotos(); persistOrder(); var nb = $('[data-pid="' + mid + '"] [data-mv="' + mv.getAttribute("data-mv") + '"]'); if (nb && !nb.disabled) nb.focus(); }
  if (d){
    if (!confirm("Delete this photo? This can't be undone.")) return;
    var pid = d.getAttribute("data-delph"), fig = d.closest("figure"); fig.classList.add("busy"); d.disabled = true;
    api("bookhomes-host", {action: "delete_photo", id: pid}).then(function(){ W.photos = W.photos.filter(function(p){ return p.id !== pid; }); redrawPhotos(); syncPhotosToMe(); saved("ok", "Photo deleted"); })
      .catch(function(err){ fig.classList.remove("busy"); d.disabled = false; $("#phOut").innerHTML = '<span class="errtxt">Could not delete: ' + esc(err.message) + "</span>"; });
  }
}
var capT = {};
function capInput(e){
  var t = e.target; if (!t.hasAttribute || !t.hasAttribute("data-cap")) return;
  var id = t.getAttribute("data-cap"), p = W.photos.filter(function(x){ return x.id === id; })[0]; if (p) p.caption = t.value;
  clearTimeout(capT[id]); saved("ing", "Unsaved caption");
  capT[id] = setTimeout(function(){ api("bookhomes-host", {action: "set_caption", id: id, caption: t.value}).then(function(){ saved("ok", "Caption saved"); syncPhotosToMe(); }, function(err){ saved("err", "Caption not saved: " + err.message); }); }, 800);
}
/* drag to reorder with mouse or finger (pointer events), arrows as the keyboard fallback */
var DRAG = null;
function dragStart(e){
  var fig = e.target.closest && e.target.closest("#phGrid figure"); if (!fig || e.target.closest("button,input")) return;
  if (e.pointerType !== "mouse" && !e.target.closest(".grip")) return; // on phones, drag by the handle so the page still scrolls
  DRAG = {fig: fig, x: e.clientX, y: e.clientY, on: false, id: fig.getAttribute("data-pid")};
  try { fig.setPointerCapture(e.pointerId); } catch (er) {}
}
function dragMove(e){
  if (!DRAG) return;
  if (!DRAG.on){ if (Math.abs(e.clientX - DRAG.x) + Math.abs(e.clientY - DRAG.y) < 8) return; DRAG.on = true; DRAG.fig.classList.add("dragging"); }
  e.preventDefault();
  DRAG.fig.style.transform = "translate(" + (e.clientX - DRAG.x) + "px," + (e.clientY - DRAG.y) + "px)";
  DRAG.fig.style.pointerEvents = "none";
  var over = document.elementFromPoint(e.clientX, e.clientY), tf = over && over.closest && over.closest("#phGrid figure");
  DRAG.fig.style.pointerEvents = "";
  $$("#phGrid figure").forEach(function(f){ f.classList.toggle("over", f === tf && f !== DRAG.fig); });
  DRAG.target = tf && tf !== DRAG.fig ? tf.getAttribute("data-pid") : null;
}
function dragEnd(){
  if (!DRAG) return;
  var d = DRAG; DRAG = null;
  d.fig.classList.remove("dragging"); d.fig.style.transform = "";
  $$("#phGrid figure").forEach(function(f){ f.classList.remove("over"); });
  if (!d.on || !d.target) return;
  var ids = W.photos.map(function(p){ return p.id; }), from = ids.indexOf(d.id), to = ids.indexOf(d.target);
  var item = W.photos.splice(from, 1)[0]; W.photos.splice(to, 0, item);
  redrawPhotos(); persistOrder();
}
function photoAfter(){
  var g = $("#phGrid"), drop = $("#phDrop");
  g.addEventListener("click", photoClick); g.addEventListener("input", capInput);
  g.addEventListener("pointerdown", dragStart); g.addEventListener("pointermove", dragMove); g.addEventListener("pointerup", dragEnd); g.addEventListener("pointercancel", dragEnd);
  ["dragenter", "dragover"].forEach(function(n){ drop.addEventListener(n, function(e){ e.preventDefault(); drop.classList.add("hot"); }); });
  ["dragleave", "drop"].forEach(function(n){ drop.addEventListener(n, function(e){ e.preventDefault(); drop.classList.remove("hot"); }); });
  drop.addEventListener("drop", function(e){ if (e.dataTransfer && e.dataTransfer.files) upload(e.dataTransfer.files); });
}
function isHeic(f){ return /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name || ""); }
function decode(file){
  return new Promise(function(res, rej){
    var tryImg = function(){ var u = URL.createObjectURL(file), im = new Image(); im.onload = function(){ res({src: im, w: im.naturalWidth, h: im.naturalHeight, done: function(){ URL.revokeObjectURL(u); }}); }; im.onerror = function(){ URL.revokeObjectURL(u); rej(new Error("decode")); }; im.src = u; };
    if (window.createImageBitmap) createImageBitmap(file, {imageOrientation: "from-image"}).then(function(b){ res({src: b, w: b.width, h: b.height, done: function(){ if (b.close) b.close(); }}); }, tryImg);
    else tryImg();
  });
}
function prepare(file){
  // Resize to max 2048px and compress to JPEG (iPhone HEIC included, where the browser can read it)
  return decode(file).then(function(d){
    var s = Math.min(1, 2048 / Math.max(d.w, d.h)), cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(d.w * s)); cv.height = Math.max(1, Math.round(d.h * s));
    var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cv.width, cv.height); cx.drawImage(d.src, 0, 0, cv.width, cv.height); d.done();
    // host-perf: also a 640px thumbnail for cards and photo grids (uploaded next to the photo as <name>.t.jpg)
    var ts = Math.min(1, 640 / Math.max(cv.width, cv.height)), tc = document.createElement("canvas");
    tc.width = Math.max(1, Math.round(cv.width * ts)); tc.height = Math.max(1, Math.round(cv.height * ts)); tc.getContext("2d").drawImage(cv, 0, 0, tc.width, tc.height);
    return new Promise(function(res, rej){ cv.toBlob(function(b){ if (!b){ rej(new Error("compress")); return; } tc.toBlob(function(t){ res({blob: b, thumb: t || null, small: Math.max(d.w, d.h) < 800}); }, "image/jpeg", 0.78); }, "image/jpeg", 0.82); });
  }, function(){
    if (isHeic(file)) throw new Error("This iPhone photo (HEIC) can't be read in this browser. Open it in Photos and share or save it as JPEG, or set iPhone Settings > Camera > Formats to Most Compatible.");
    if (/^image\/(jpeg|png|webp)$/.test(file.type) && file.size <= 10485760) return {blob: file, small: false};
    throw new Error("We couldn't read this file. Please use a JPG, PNG or WebP photo.");
  });
}
function putFile(path, blob, onProg){
  return sb.auth.getSession().then(function(r){
    var t = r.data && r.data.session && r.data.session.access_token; if (!t) throw new Error("Please log in again.");
    return new Promise(function(res, rej){
      var x = new XMLHttpRequest();
      x.open("POST", SUPABASE_URL + "/storage/v1/object/listing-photos/" + path);
      x.setRequestHeader("Authorization", "Bearer " + t); x.setRequestHeader("apikey", SUPABASE_KEY);
      x.setRequestHeader("Content-Type", blob.type || "image/jpeg"); x.setRequestHeader("x-upsert", "false"); x.setRequestHeader("cache-control", "max-age=31536000");
      x.upload.onprogress = function(e){ if (e.lengthComputable) onProg(e.loaded / e.total); };
      x.onload = function(){ if (x.status >= 200 && x.status < 300) res(); else { var m = ""; try { m = JSON.parse(x.responseText).message; } catch (e) {} var er = new Error(m || "Upload failed (" + x.status + ")"); er.retry = x.status >= 500 || x.status === 429; rej(er); } };
      x.onerror = function(){ var er = new Error("Connection lost"); er.retry = true; rej(er); };
      x.ontimeout = x.onerror; x.timeout = 120000;
      x.send(blob);
    });
  });
}
function withRetry(fn, n){ return fn().catch(function(e){ if (n > 0 && e.retry !== false) return new Promise(function(r){ setTimeout(r, (4 - n) * 1500); }).then(function(){ return withRetry(fn, n - 1); }); throw e; }); }
function upload(files){
  if (!W.id){ $("#phOut").textContent = "Please go back one step, then try again."; return; }
  var room = 40 - W.photos.length, all = Array.prototype.slice.call(files || []), list = all.slice(0, room);
  if (!list.length){ if (all.length) $("#phOut").textContent = "40 photos is the maximum."; return; }
  var q = $("#phQueue"), uid = SESSION.user.id, ok = 0, bad = 0, small = 0;
  var rows = list.map(function(f, i){ var id = "q" + Date.now().toString(36) + i; q.insertAdjacentHTML("beforeend", '<div class="qrow" id="' + id + '"><span class="qn">' + esc((f.name || "Photo").slice(0, 40)) + '</span><span class="qbar"><i></i></span><span class="qs">Waiting</span></div>'); return id; });
  function st(id, text, pct, cls){ var r = document.getElementById(id); if (!r) return; r.querySelector(".qs").textContent = text; if (pct != null) r.querySelector(".qbar i").style.width = Math.round(pct * 100) + "%"; if (cls) r.className = "qrow " + cls; }
  $("#phOut").textContent = "";
  var idx = 0;
  function one(){
    if (idx >= list.length) return Promise.resolve();
    var k = idx++, f = list[k], rid = rows[k];
    st(rid, "Preparing", 0.02);
    return prepare(f).then(function(pr){
      if (pr.small) small++;
      var path = uid + "/" + W.id + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + (pr.thumb ? "-w" : "") + ".jpg";
      if (pr.blob.type && pr.blob.type !== "image/jpeg") path = path.replace(/\.jpg$/, pr.blob.type === "image/png" ? ".png" : ".webp");
      // the 640px card thumbnail goes up alongside the photo (host-speed: in parallel), before add_photo records it;
      // a failed thumbnail never blocks the photo, and a thumbnail left behind by a failed photo is removed
      var thP = pr.thumb ? withRetry(function(){ return putFile(HP.thumbPath(path), pr.thumb, function(){}); }, 1).then(function(){ return true; }, function(){ return false; }) : Promise.resolve(false);
      return withRetry(function(){ st(rid, "Uploading", 0.05); return putFile(path, pr.blob, function(p){ st(rid, Math.round(p * 100) + "%", 0.05 + p * 0.85); }); }, 3)
        .then(function(){ st(rid, "Saving", 0.95); return thP; }, function(e){ thP.then(function(th){ if (th && sb.storage) sb.storage.from("listing-photos").remove([HP.thumbPath(path)]).catch(function(){}); }); throw e; })
        .then(function(th){ return withRetry(function(){ return api("bookhomes-host", {action: "add_photo", listing_id: W.id, path: path, thumb: th}); }, 2); })
        .then(function(j){ W.photos.push({id: j.photo.id, url: j.photo.url, thumb_url: j.photo.thumb_url || null, caption: null}); ok++; st(rid, "Done", 1, "ok"); redrawPhotos(); syncPhotosToMe(); setTimeout(function(){ var r = document.getElementById(rid); if (r) r.remove(); }, 1500); });
    }).catch(function(e){ bad++; st(rid, e.message || "Failed", 1, "bad"); }).then(one);
  }
  saved("ing", "Uploading photos...");
  Promise.all([one(), one(), one()]).then(function(){
    saved(bad ? "err" : "ok", bad ? bad + " photo" + (bad === 1 ? "" : "s") + " not added" : "Photos saved");
    $("#phOut").innerHTML = (ok ? ok + " photo" + (ok === 1 ? "" : "s") + " added. " : "") + (bad ? '<span class="errtxt">' + bad + " failed: see the message next to each. Try those again.</span> " : "") + (small ? '<span class="m">' + small + " photo" + (small === 1 ? " is" : "s are") + " quite small (under 800 px) and may look blurry.</span>" : "") + (all.length > list.length ? " Only " + list.length + " added: 40 is the maximum." : "");
  });
}

/* ----- calendar sync screen ----- */
function icalStep(){
  var src = (ME.sources || []).filter(function(s){ return +s.listing_id === +W.id && s.enabled; });
  var l = findL(W.id), names = ME.feed_names || ["Airbnb", "Booking.com", "Vrbo", "Guesty", "Other"];
  return (l && l.ical_export_url ? '<div class="sync-card" style="margin-bottom:16px"><h3>Export: your Book Homes calendar</h3><p class="m">Paste this into Airbnb, Booking.com, Vrbo or Guesty as an imported calendar, so dates booked here close there.</p><code class="code-line" id="edExp">' + esc(l.ical_export_url) + '</code><button type="button" class="btn ghost sm" id="edCopy">Copy link</button></div>' : '<p class="pnote">Your Book Homes calendar link appears here once the listing is saved.</p>') +
    '<div class="sync-card"><h3>Import: calendars from other sites</h3><div id="icList">' + src.map(function(s){
      var stt = s.last_status === "ok" ? "Synced " + (s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "") + " · " + (s.last_event_count || 0) + " booked or blocked periods" : s.last_status === "error" ? "Problem: " + (s.last_error || "could not read it") : "Waiting for first sync";
      return '<div class="item"><div class="h"><span>' + esc(s.name) + '</span><button type="button" class="btn ghost sm" data-rmical="' + esc(s.id) + '">Remove</button></div><div class="m">' + esc(String(s.url).slice(0, 70)) + '...</div><div class="m" style="font-size:13px;color:' + (s.last_status === "error" ? "#b42318" : "var(--muted)") + '">' + esc(stt) + "</div></div>"; }).join("") + "</div>" +
    (src.length ? '<button type="button" class="btn ghost sm" id="icSync">Sync now</button>' : "") +
    '<label class="f2" style="margin-top:12px">Calendar from<select id="icName">' + names.map(function(n){ return "<option>" + esc(n) + "</option>"; }).join("") + '</select></label><label class="f2">Calendar link (iCal export)<input type="url" id="icUrl" placeholder="https://... .ics" inputmode="url"></label><button type="button" class="btn ghost" id="icAdd">Add calendar</button><p class="m" id="icOut" aria-live="polite" style="margin:8px 0 0"></p></div>' +
    '<h3 class="psec">Your pages on other sites (optional)</h3>' + inp("airbnb_url", "Airbnb listing page", "url", 'placeholder="https://www.airbnb.co.uk/rooms/..."') + inp("booking_url", "Booking.com page", "url", 'placeholder="https://www.booking.com/hotel/..."');
}
function icalClick(e){
  if (!e.target.closest) return;
  var t = e.target;
  if (t.closest("#edCopy")){ var b = $("#edCopy"); (navigator.clipboard ? navigator.clipboard.writeText($("#edExp").textContent) : Promise.reject()).then(function(){ b.textContent = "Copied"; setTimeout(function(){ b.textContent = "Copy link"; }, 2000); }, function(){ b.textContent = "Select the link and copy it"; }); return; }
  if (t.id === "icSync"){
    busy(t, true, "Syncing...");
    api("bookhomes-host", {action: "sync_now", listing_id: W.id}).then(function(j){ return refresh().then(function(){ rerenderBody(); $("#icOut").textContent = j.ok ? "All calendars synced." : "Some calendars could not be read. See the message under each one."; }); })
      .catch(function(err){ busy(t, false, "Sync now"); $("#icOut").textContent = err.message; });
    return;
  }
  if (t.id === "icAdd"){
    var url = $("#icUrl").value.trim();
    if (!/^(https|webcal):\/\//i.test(url)){ $("#icOut").textContent = "Paste the full link (it starts with https:// or webcal://)."; return; }
    busy(t, true, "Checking the link...");
    api("bookhomes-host", {action: "add_ical", listing_id: W.id, name: $("#icName").value, url: url}).then(function(j){
      return refresh().then(function(){ rerenderBody(); $("#icOut").textContent = j.synced ? "Linked and synced: " + j.events + " booked or blocked periods found. We re-check every 15 minutes." : "Linked, but we couldn't read it yet: " + (j.error || "unknown problem") + " We'll keep trying every 15 minutes."; });
    }).catch(function(err){ busy(t, false, "Add calendar"); $("#icOut").textContent = err.message; });
    return;
  }
  var rm = t.closest("[data-rmical]");
  if (rm){ if (!confirm("Stop syncing this calendar?")) return; busy(rm, true, "Removing..."); api("bookhomes-host", {action: "remove_ical", id: rm.getAttribute("data-rmical")}).then(refresh).then(rerenderBody).catch(function(err){ busy(rm, false, "Remove"); $("#icOut").textContent = err.message; }); }
}
$("#wzIn").addEventListener("click", icalClick); $("#edBody").addEventListener("click", icalClick);

/* ----- review screen (last wizard step) ----- */
function reviewStep(){
  var l = W.l, cover = W.photos[0], miss = missing();
  return '<div class="rv"><div class="rv-card"><div class="rv-ph">' + (cover ? HP.img(cover.thumb_url || cover.url, 720) : icon("camera")) + "</div><div class='rv-bd'><b>" + esc(l.title || "Untitled") + "</b><span>" + esc([l.area, l.city].filter(Boolean).join(", ")) + "</span><span><b>£" + esc(l.base_price || "-") + "</b> night</span></div></div>" +
    '<button type="button" class="btn ghost block" data-preview style="margin-top:12px">' + icon("search") + "Show full preview</button></div>" +
    (miss.length ? '<div class="miss"><b>Before you submit</b><ul>' + miss.map(function(m){ return '<li><button type="button" class="link" data-goto="' + m[0] + '">Add ' + esc(m[1]) + "</button></li>"; }).join("") + "</ul></div>" :
      '<h3 class="psec">What\'s next?</h3><ul class="nexts"><li>' + icon("shield") + "<span><b>We check your listing</b>Photos, text and that no street address is shown. Usually within one working day.</span></li><li>" + icon("calendar") + "<span><b>Set up your calendar</b>Block dates and set prices for busy days.</span></li><li>" + icon("bell") + "<span><b>We email you when it's live</b>Then guests can find and book it.</span></li></ul>") +
    (W.id ? '<button type="button" class="link dellink" data-dellisting>' + icon("x") + "Delete this draft</button>" : "");
}
$("#wzIn").addEventListener("click", function(e){
  var g = e.target.closest && e.target.closest("[data-goto]"); if (!g) return;
  var k = g.getAttribute("data-goto"), i = STEPS.map(function(s){ return s.k; }).indexOf(k === "price" ? "price" : k);
  if (i >= 0){ W.i = i; drawStep(); }
});

/* ----- the editor (after the listing exists): sections on the left, one section at a time on the right ----- */
var ST_TEXT = {
  draft: ["Draft", "Finish the sections, then submit your listing for approval."],
  pending: ["Waiting for approval", "We usually check listings within one working day and email you. You can still make changes."],
  approved: ["Live", "Guests can find and book your home. Changes you save go live straight away; we're told about them and may check them."],
  rejected: ["Changes needed", "Please make the changes below, then submit again."],
  paused: ["Paused", "Guests can't see or book your home. Unpause when you're ready."]
};
function openEditor(id, sec){
  if (W.dirty && W.mode === "editor" && +W.id !== +id && !confirm("Discard your unsaved changes?")) return;
  load(id); W.mode = "editor"; W.sec = sec || null;
  show("#wz", false); show("#ed", true); document.body.style.overflow = "hidden";
  edHead(); edNav(); if (W.sec || window.innerWidth > 860) drawSection(W.sec || "photos"); else showList();
}
function edHead(){
  var l = findL(W.id) || {}, s = ST_TEXT[l.status] || ["", ""];
  $("#edTitle").textContent = W.l.title || "Your listing";
  $("#edStatus").innerHTML = '<div class="edst st-' + esc(l.status) + '"><span class="st ' + esc(l.status) + '">' + esc(s[0]) + "</span><p>" + esc(s[1]) + "</p>" +
    (l.status === "rejected" && l.reject_reason ? '<p class="why"><b>Note from Book Homes:</b> ' + esc(l.reject_reason) + "</p>" : "") +
    (l.host_edited_at && (l.status === "approved" || l.status === "paused") ? '<p class="why2">You changed this listing on ' + esc(new Date(l.host_edited_at).toLocaleDateString("en-GB", {day: "numeric", month: "short"})) + ". Book Homes may check the changes.</p>" : "") +
    '<div class="acts">' +
    (l.status === "draft" || l.status === "rejected" ? '<button type="button" class="btn sm" id="edSubmit">Submit for approval</button>' : "") +
    (l.status === "draft" ? '<button type="button" class="btn ghost sm" id="edWizard">Continue step by step</button>' : "") +
    (l.status === "pending" ? '<button type="button" class="btn ghost sm" data-ests="draft">Withdraw (back to draft)</button>' : "") +
    (l.status === "approved" ? '<a class="btn ghost sm" href="/' + esc(l.slug) + '" target="_blank" rel="noopener">Open live page</a><button type="button" class="btn ghost sm" data-ests="paused">Pause listing</button>' : "") +
    (l.status === "paused" && l.approved_at ? '<button type="button" class="btn sm" data-ests="approved">Unpause</button>' : "") +
    '</div><div id="edStMsg" aria-live="polite"></div></div>' +
    '<button type="button" class="link dellink" data-dellisting>' + icon("x") + (l.approved_at ? "Delete listing" : "Delete draft") + "</button>";
  setHash("edit=" + W.id + (W.sec ? ":" + W.sec : ""));
}
function edStatusMsg(t, miss){
  $("#edStMsg").innerHTML = '<div class="msg err">' + esc(t) + (miss && miss.length ? '<div class="acts">' + miss.map(function(m){ return '<button type="button" class="btn ghost sm" data-sec="' + (m[0] === "description" ? "title" : m[0]) + '">' + esc(m[1]) + "</button>"; }).join("") + "</div>" : "") + "</div>";
}
function edNav(){
  $("#edNav").innerHTML = SECTIONS.map(function(s){
    var err = s.v ? s.v() : "";
    return '<button type="button" class="ednav' + (s.k === W.sec ? " on" : "") + '" data-sec="' + s.k + '"' + (s.k === W.sec ? ' aria-current="true"' : "") + ">" + icon(s.ic) + '<span><b>' + esc(s.t) + "</b><small>" + esc(s.sum()) + "</small></span>" + (err ? '<i class="dot" title="' + esc(err) + '"></i>' : "") + icon("chev_r") + "</button>";
  }).join("");
}
function showList(){ W.sec = null; $("#ed").classList.remove("insec"); edNav(); setHash("edit=" + W.id); }
function drawSection(k){
  var s = SECTIONS.filter(function(x){ return x.k === k; })[0] || SECTIONS[0];
  W.sec = s.k; W.dirty = false;
  $("#ed").classList.add("insec");
  $("#edBody").innerHTML = '<button type="button" class="link edback" id="edBack">' + icon("arrow_l") + 'All sections</button><h2 id="edH" tabindex="-1">' + esc(s.t) + "</h2>" + s.r() + '<p class="msg err hidden" id="edErr"></p>';
  $("#edFoot").classList.toggle("hidden", !!s.instant || !s.f);
  edDirty(); edNav();
  if (s.after) s.after();
  $("#edMain").scrollTop = 0;
  setHash("edit=" + W.id + ":" + s.k);
}
function edDirty(){ var b = $("#edSaveBtn"); b.disabled = !W.dirty; $("#edCancel").classList.toggle("hidden", !W.dirty); if (W.dirty) saved("ing", "Unsaved changes"); }
function edErr(t){ var e = $("#edErr"); if (!e) return; e.textContent = t || ""; e.classList.toggle("hidden", !t); if (t) e.scrollIntoView({block: "nearest"}); }
$("#edSaveBtn").addEventListener("click", function(){
  var s = SECTIONS.filter(function(x){ return x.k === W.sec; })[0], b = this, err = s.v ? s.v() : "";
  if (err){ edErr(err); return; }
  edErr(""); b.disabled = true; b.innerHTML = '<span class="spin"></span>Saving';
  // Send only what changed, so the "edited since approval" flag names the right fields (lat and lng always travel together)
  var orig = norm(findL(W.id)), cur = payload(s.f), old = (function(){ var t = W.l; W.l = orig; var o = payload(s.f); W.l = t; return o; })();
  var ch = s.f.filter(function(k){ return JSON.stringify(cur[k]) !== JSON.stringify(old[k]); });
  if (ch.indexOf("lat") >= 0 || ch.indexOf("lng") >= 0) ch = ch.filter(function(k){ return k !== "lat" && k !== "lng"; }).concat(["lat", "lng"]);
  // host-perf: optimistic, the section counts as saved at once; if the server says no, it is marked unsaved again with the reason
  b.textContent = "Save"; W.dirty = false; edDirty(); edNav(); saved("ing", "Saving...");
  save(ch.length ? ch : s.f).then(function(j){ if (j.live_edit){ var fl = findL(W.id); if (fl) fl.host_edited_at = new Date().toISOString(); } if (!W.dirty) dropBackup(); saved("ok", j.live_edit ? "Saved. Your changes are live." : "Saved"); edHead(); edNav(); },
    function(e){ W.dirty = true; edDirty(); backup(); edErr(e.message); });
});
$("#edCancel").addEventListener("click", function(){ var l = findL(W.id); W.l = norm(l); dropBackup(); drawSection(W.sec); saved("", ""); });
$("#edClose").addEventListener("click", function(){ if (W.dirty && !confirm("You have unsaved changes. Leave without saving?")) return; W.dirty = false; dropBackup(); closeAll(); });
$("#ed").addEventListener("click", function(e){
  if (!e.target.closest) return;
  var sc = e.target.closest("[data-sec]");
  if (sc){ if (W.dirty && !confirm("You have unsaved changes in this section. Leave without saving?")) return; if (W.dirty){ W.l = norm(findL(W.id)); dropBackup(); } drawSection(sc.getAttribute("data-sec")); return; }
  if (e.target.closest("#edBack")){ if (W.dirty && !confirm("You have unsaved changes. Leave without saving?")) return; if (W.dirty){ W.l = norm(findL(W.id)); W.dirty = false; dropBackup(); } showList(); return; }
  if (e.target.closest("#edSubmit")){ submitListing(e.target.closest("#edSubmit"), false); return; }
  if (e.target.closest("#edWizard")){ openWizard(W.id); return; }
  var es = e.target.closest("[data-ests]");
  if (es){
    var to = es.getAttribute("data-ests");
    if (to === "paused" && !confirm("Pause this listing? Guests won't see it or be able to book until you unpause. Existing bookings stay.")) return;
    busy(es, true, "Saving...");
    api("bookhomes-host", {action: "set_status", id: W.id, status: to}).then(refresh).then(function(){ edHead(); saved("ok", to === "paused" ? "Paused" : to === "approved" ? "Live again" : "Back to draft"); })
      .catch(function(err){ busy(es, false, "Try again"); edStatusMsg(err.message); });
  }
});

/* ----- guest preview: the real public listing page, filled with this draft (booking switched off) ----- */
function preview(){
  var l = W.l, host = (ME.host && ME.host.display_name) || (ME.profile && ME.profile.name) || "your host";
  var data = {listing: Object.assign({}, payload(Object.keys(blank())), {id: W.id || 0, slug: (findL(W.id) || {}).slug || "preview", title: l.title || "Your title", host_name: host,
    trader_status: (ME.profile && ME.profile.trader_status) || "trader", from_price: +l.base_price || null, legacy_source: null,
    photos: W.photos.map(function(p){ return {url: p.url, caption: p.caption || ""}; })})};
  try { localStorage.setItem("bh_listing_preview", JSON.stringify(data)); } catch (e) { alert("Preview needs browser storage. Please allow it and try again."); return; }
  var live = findL(W.id) && findL(W.id).status === "approved";
  $("#pvLive").classList.toggle("hidden", !live); if (live) $("#pvLive").href = "/" + findL(W.id).slug;
  $("#pvFrame").src = "/stays/listing?preview=1&t=" + Date.now();
  show("#pv", true); document.body.style.overflow = "hidden"; $("#pvClose").focus();
}
function closePreview(){ show("#pv", false); $("#pvFrame").src = "about:blank"; if ($("#wz").classList.contains("hidden") && $("#ed").classList.contains("hidden")) document.body.style.overflow = ""; }
document.addEventListener("click", function(e){ if (e.target.closest && e.target.closest("[data-preview]")) preview(); });
$("#pvClose").addEventListener("click", closePreview);
document.addEventListener("keydown", function(e){ if (e.key === "Escape" && !$("#pv").classList.contains("hidden")) closePreview(); });

/* ----- delete a listing (drafts: for good; listings that were live: archived, bookings kept) ----- */
function deleteListing(btn){
  var l = findL(W.id) || {}, everLive = !!l.approved_at;
  var q = everLive ? "Delete \"" + (l.title || "this listing") + "\"?\n\nIt disappears from Book Homes and your dashboard straight away. Past bookings and payouts stay in your records. Photos are deleted. This can't be undone."
    : "Delete this draft for good?\n\nAll its details and photos are removed. This can't be undone.";
  if (!confirm(q)) return;
  var lbl = btn.textContent; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Deleting';
  clearTimeout(autoT);
  chain.catch(function(){}).then(function(){ return api("bookhomes-host", {action: "delete_listing", id: W.id}); }).then(function(j){
    lsDel("bh_step_" + W.id); dropBackup(); W.dirty = false;
    closeAll();
    msg("#dashMsg", j.mode === "archived" ? "Listing deleted. Your booking history is kept." : "Draft deleted.", true);
    setTimeout(function(){ msg("#dashMsg", ""); }, 6000);
  }, function(e){ btn.disabled = false; btn.textContent = lbl; if (W.mode === "editor") edStatusMsg(e.message); else if (W.mode === "wizard") wzMsg(e.message); else msg("#dashMsg", e.message); });
}
document.addEventListener("click", function(e){
  var d = e.target.closest && e.target.closest("[data-dellisting]"); if (!d) return;
  if (d.getAttribute("data-id")){ W.id = +d.getAttribute("data-id"); W.mode = "dash"; }
  if (W.id) deleteListing(d);
});

/* ----- reopen what was open before a refresh ----- */
window.addEventListener("beforeunload", function(e){ if ((W.mode === "editor" && W.dirty && !$("#ed").classList.contains("hidden")) || (DRAG && DRAG.on)){ backup(); e.preventDefault(); e.returnValue = ""; } });
function resumeFromHash(){
  var h = (location.hash || START_HASH).slice(1), m = h.match(/^(wizard|edit)=(new|\d+)(?::([a-z]+))?$/);
  if (!m) return;
  var id = m[2] === "new" ? null : +m[2];
  if (id && !findL(id)){ setHash(""); return; }
  if (m[1] === "wizard" && (!id || findL(id).status === "draft")) openWizard(id);
  else openEditor(id, m[3]);
  if (m[1] === "edit" && W.mode === "editor"){
    var bk = readBackup(id), sec = SECTIONS.filter(function(x){ return x.k === W.sec; })[0];
    if (bk && bk.l && sec && sec.f){
      var mine = norm(Object.assign({}, W.l, bk.l, {status: W.l.status})), t = W.l, a1 = payload(sec.f); W.l = mine; var a2 = payload(sec.f); W.l = t;
      if (JSON.stringify(a1) !== JSON.stringify(a2)){ W.l = mine; drawSection(W.sec); W.dirty = true; edDirty(); saved("ing", "We kept your unsaved changes. Save or Cancel."); }
      else dropBackup();
    }
  }
}
LISTING_HOOK = resumeFromHash;
})();
