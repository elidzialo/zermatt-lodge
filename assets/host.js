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

var VIEWS = ["Login", "Signup", "Enrol", "Mfa", "SetPw", "Profile", "Dash"];
function view(n){ VIEWS.forEach(function(v){ show("#v" + v, v === n); }); window.scrollTo(0, 0); }
function niceErr(e){
  var m = (e && e.message) || String(e || "Something went wrong.");
  if (/invalid login credentials/i.test(m)) return "Wrong email or password.";
  if (/email not confirmed/i.test(m)) return "Please confirm your email first: open the link we sent you.";
  if (/invalid totp|invalid.*code/i.test(m)) return "That code didn't work. Wait for a new code in the app and try again.";
  if (/rate limit|too many/i.test(m)) return "Too many tries. Please wait a minute and try again.";
  if (/signups? not allowed/i.test(m)) return "New host sign-ups are paused. Please contact us.";
  if (/already registered/i.test(m)) return "There's already an account with that email. Log in instead.";
  return m;
}
var routing = 0, FACTOR = null, ENROL = null, SESSION = null, ME = null, started = false, WANT_MFA = false;
var LATER_KEY = "bh_host_mfa_later";

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
  sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function(a){
    if (my !== routing) return;
    if (a.error) throw a.error;
    if (a.data.currentLevel === "aal2") return afterAuth();
    return sb.auth.mfa.listFactors().then(function(f){
      if (my !== routing) return;
      if (f.error) throw f.error;
      var ok = (f.data.totp || []).filter(function(x){ return x.status === "verified"; });
      if (ok.length){ FACTOR = ok[0].id; msg("#mfaMsg", ""); $("#mfaCode").value = ""; view("Mfa"); $("#mfaCode").focus(); return; }
      if (lsGet(LATER_KEY) === session.user.id && !WANT_MFA) return afterAuth();
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
    msg("#enrolMsg", "");
  }).catch(function(e){ msg("#enrolMsg", "Could not start setup: " + niceErr(e)); });
}
sb.auth.onAuthStateChange(function(evt, session){
  if (evt === "PASSWORD_RECOVERY"){ setTimeout(function(){ view("SetPw"); }, 0); return; }
  if (/^(INITIAL_SESSION|SIGNED_IN|SIGNED_OUT|MFA_CHALLENGE_VERIFIED)$/.test(evt)) setTimeout(function(){ route(session); }, 0);
  if (evt === "SIGNED_IN" && (location.hash || /access_token|code=/.test(location.search))) history.replaceState(null, "", location.pathname);
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
function gsiInit(tries){
  if (!(window.google && google.accounts && google.accounts.id)){ if ((tries || 0) < 40) setTimeout(function(){ gsiInit((tries || 0) + 1); }, 150); return; }
  var raw = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
  crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw)).then(function(buf){
    var hashed = Array.prototype.map.call(new Uint8Array(buf), function(b){ return ("0" + b.toString(16)).slice(-2); }).join("");
    google.accounts.id.initialize({client_id: GOOGLE_CLIENT_ID, nonce: hashed, ux_mode: "popup", itp_support: true, callback: function(resp){
      var inSignup = !$("#vSignup").classList.contains("hidden");
      if (inSignup && !$("#suTerms").checked){ msg("#signupMsg", "Please tick the host terms box first, then tap Google again."); return; }
      lsSet(PENDING_KEY, "1"); setTrust(true); MODE = "local";
      sb.auth.signInWithIdToken({provider: "google", token: resp.credential, nonce: raw}).then(function(r){ if (r.error) msg(inSignup ? "#signupMsg" : "#loginMsg", niceErr(r.error)); });
    }});
    $$(".gsi").forEach(function(el){ google.accounts.id.renderButton(el, {theme: "outline", size: "large", shape: "pill", text: "continue_with", width: Math.min(360, el.clientWidth || 320), logo_alignment: "center"}); });
  });
}
gsiInit(0);
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
  sb.auth.signInWithPassword({email: em, password: pw}).then(function(r){ busy(btn, false, "Log in"); if (r.error) msg("#loginMsg", niceErr(r.error)); else $("#loginPw").value = ""; });
});
$("#forgotBtn").addEventListener("click", function(){
  var em = $("#loginEmail").value.trim().toLowerCase();
  if (!validEmail(em)){ msg("#loginMsg", "Type your email above first."); return; }
  sb.auth.resetPasswordForEmail(em, {redirectTo: REDIRECT}).then(function(r){ msg("#loginMsg", r.error ? niceErr(r.error) : "If you have an account, a reset link is on its way.", !r.error); });
});
$("#signupForm").addEventListener("submit", function(e){
  e.preventDefault();
  var em = $("#suEmail").value.trim().toLowerCase(), pw = $("#suPw").value, btn = $("#suBtn");
  if (!validEmail(em)){ msg("#signupMsg", "Please enter a valid email."); return; }
  if (pw.length < 10){ msg("#signupMsg", "Use at least 10 characters for your password."); return; }
  if (!$("#suTerms").checked){ msg("#signupMsg", "Please agree to the host terms."); return; }
  lsSet(PENDING_KEY, "1"); MODE = "local"; setTrust(true);
  busy(btn, true, "Creating..."); msg("#signupMsg", "");
  sb.auth.signUp({email: em, password: pw, options: {emailRedirectTo: REDIRECT, data: {app: "bookhomes"}}}).then(function(r){
    busy(btn, false, "Create account");
    if (r.error){ msg("#signupMsg", niceErr(r.error)); return; }
    var u = r.data && r.data.user;
    if (u && Array.isArray(u.identities) && u.identities.length === 0){
      view("Login"); $("#loginEmail").value = em;
      msg("#loginMsg", "You already have an account with this email. Log in below, or tap \"Forgot password?\" to set a new password.", true);
      return;
    }
    if (!r.data.session) msg("#signupMsg", "Nearly there: we've emailed you a link. Open it on this device to confirm your email, then log in.", true);
  });
});
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
  var p = $("#newPw").value; if (p.length < 10){ msg("#setPwMsg", "Use at least 10 characters."); return; }
  sb.auth.updateUser({password: p}).then(function(r){ if (r.error){ msg("#setPwMsg", niceErr(r.error)); return; } route(SESSION); });
});
function signOut(){ setTrust(false); sb.auth.signOut().then(function(){ clearLocalSession(); location.replace("/host/"); }); }
$$("[data-signout]").forEach(function(b){ b.addEventListener("click", signOut); });

/* ---------- after 2-step: profile -> dashboard ---------- */
function afterAuth(){
  return api("bookhomes-host", {action: "me"}).then(function(me){
    ME = me;
    if (!me.profile || !me.profile.phone || !me.profile.trader_status){ fillProfile(); view("Profile"); return; }
    view("Dash"); renderDash();
    if (!started){ started = true; loadBookings(); loadEarnings(); }
    if (/connect=done/.test(location.search)){ api("bookhomes-connect-onboard", {action: "status"}).then(refresh).catch(function(){}); history.replaceState(null, "", location.pathname); }
  }).catch(function(e){
    if (/sign in|log in/i.test(e.message)) { view("Login"); msg("#loginMsg", e.message); return; }
    fillProfile(); view("Profile");
  });
}
function refresh(){ return api("bookhomes-host", {action: "me"}).then(function(me){ ME = me; renderDash(); }); }
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
    .then(function(){ busy(btn, false, "Continue"); return afterAuth(); })
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
  var p = ME.profile || {}, ls = ME.listings || [];
  try { document.dispatchEvent(new CustomEvent("bh:host", {detail: {type: "me", me: ME}})); } catch (e) {} // host-shell.js (Today, Menu)
  $("#approvalNote").innerHTML = p.approved ? "" : '<div class="notice"><b>Your host account is waiting for approval.</b> You can add and submit listings now. We check every host and listing, usually within one working day.' + (p.rejected_reason ? "<br>Note from us: " + esc(p.rejected_reason) : "") + "</div>";
  $("#lcards").innerHTML = ls.length ? ls.map(function(l){
    var ph = (ME.photos || []).filter(function(x){ return String(x.listing_id) === String(l.id); })[0];
    var legacy = !!l.legacy_source;
    var acts = legacy ? '<button type="button" class="btn sm" data-calfor="' + l.id + '">Calendar</button><a class="btn ghost sm" href="' + esc(l.page_url || "/") + '" target="_blank" rel="noopener">View</a><span class="m" style="font-size:12.5px;display:block;margin-top:6px">Prices and details come from your channel manager. Block and open dates in Calendar.</span>' :
      '<button type="button" class="btn sm" data-edit="' + l.id + '">' + (l.status === "draft" || l.status === "rejected" ? "Continue" : "Edit") + '</button>' +
      (l.status === "approved" ? '<a class="btn ghost sm" href="/' + esc(l.slug) + '" target="_blank" rel="noopener">View</a><button type="button" class="btn ghost sm" data-status="paused" data-id="' + l.id + '">Pause</button>' : "") +
      (l.status === "paused" && l.approved_at ? '<button type="button" class="btn ghost sm" data-status="approved" data-id="' + l.id + '">Unpause</button>' : "");
    return '<div class="lcard"><div class="ph">' + (ph ? '<img src="' + esc(ph.url) + '" alt="">' : icon("camera")) + '</div><div class="bd2"><b>' + esc(l.title) + '</b><span class="st ' + esc(l.status) + '">' + esc(STATUS[l.status] || l.status) + '</span>' +
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
  if (cur) sel.value = cur;
}
document.addEventListener("click", function(e){
  var cf = e.target.closest && e.target.closest("[data-calfor]");
  if (cf){ $("#calListing").value = cf.getAttribute("data-calfor"); var tb = $$(".tabs button").filter(function(x){ return x.getAttribute("data-tab") === "calendar"; })[0]; if (tb) tb.click(); return; }
  var ed = e.target.closest && e.target.closest("[data-edit]");
  if (ed){ openWizard(+ed.getAttribute("data-edit")); return; }
  var st = e.target.closest && e.target.closest("[data-status]");
  if (st){ st.disabled = true; api("bookhomes-host", {action: "set_status", id: +st.getAttribute("data-id"), status: st.getAttribute("data-status")}).then(refresh).catch(function(err){ st.disabled = false; alert(err.message); }); }
});
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

function loadBookings(){
  api("bookhomes-host", {action: "bookings"}).then(function(j){
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
function loadEarnings(){
  api("bookhomes-host", {action: "earnings"}).then(function(j){
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
  api("bookhomes-host", {action: "calendar", listing_id: id, from: from < ukToday() ? ukToday() : from, to: to}).then(function(j){ CAL.data = j; drawCal(); })
    .catch(function(e){ $("#cal2").innerHTML = '<div class="msg err">' + esc(e.message) + "</div>"; });
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
      (bk ? esc(bk.guest_name.split(" ")[0]) : d && d.status === "reserved" ? esc(feedName(j, s)) : d && d.status === "blocked" ? "Blocked" : d && d.price != null ? "£" + Math.round(d.price) : "") + "</button>";
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
  if (rm) api("bookhomes-host", {action: "remove_ical", id: rm.getAttribute("data-rmsync")}).then(refresh).then(drawSync).catch(function(err){ $("#syncOut").textContent = err.message; });
  if (e.target.closest("#syncAdd")){
    var url = $("#syncUrl").value.trim();
    if (!/^https:\/\//.test(url)){ $("#syncOut").textContent = "Paste the full link (it starts with https://)."; return; }
    $("#syncOut").textContent = "Adding...";
    api("bookhomes-host", {action: "add_ical", listing_id: +$("#calListing").value, name: $("#syncName").value, url: url}).then(refresh).then(function(){ $("#syncUrl").value = ""; drawSync(); $("#syncOut").textContent = "Added. It syncs within 15 minutes."; })
      .catch(function(err){ $("#syncOut").textContent = err.message; });
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
  api("bookhomes-host", {action: "unblock", id: b.getAttribute("data-unblock")}).then(loadCal);
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
  $("#calOut").textContent = "Saving...";
  p.then(function(){ $("#calOut").textContent = "Saved."; CAL.a = CAL.b = null; loadCal(); }).catch(function(e){ $("#calOut").textContent = e.message; });
}); });

/* ---------- "Add your home" wizard: one question per screen ---------- */
var W = {id: null, l: null, i: 0, photos: []};
var TYPES = [["house", "House", "home"], ["flat", "Flat", "city"], ["cottage", "Cottage", "countryside"], ["townhouse", "Townhouse", "home"], ["bungalow", "Bungalow", "home"], ["studio", "Studio", "door"]];
var CAT = [["city", "City", "city"], ["coast", "Coast", "coast"], ["countryside", "Countryside", "countryside"], ["family", "Family", "family"], ["groups", "Large groups", "groups"], ["hospital", "Near hospitals", "hospital"], ["events", "Match and event days", "events"], ["long_stay", "Long stays", "long_stay"]];
var AMEN = {wifi:"Wifi",parking:"Free parking",kitchen:"Kitchen",washer:"Washing machine",dryer:"Tumble dryer",tv:"TV",heating:"Heating",aircon:"Air conditioning",garden:"Garden",workspace:"Workspace",cot:"Cot",highchair:"High chair",bath:"Bath",ev_charger:"EV charger",pool_table:"Pool table",bbq:"BBQ",self_checkin:"Self check-in",step_free:"Step-free entrance",dishwasher:"Dishwasher",coffee:"Coffee maker",iron:"Iron",hairdryer:"Hairdryer",fireplace:"Fireplace",pets:"Pets allowed"};
function blank(){ return {property_type: "house", area: "", city: "Liverpool", lat: null, lng: null, max_guests: 4, bedrooms: 2, beds: 2, baths: 1, amenities: ["wifi", "kitchen", "heating"], categories: [],
  kosher: {kitchen: false, kitchen_type: null, separate_sinks: false, separate_ovens: false, supervision: "", shabbat: {}, shul_name: "", shul_walk_mins: null, eruv: "unknown", kosher_shops: "", mikvah: ""},
  business: {desk: false, wifi_mbps: null, van_parking: false, separate_beds: false, monthly_rates: false},
  title: "", description: "", house_rules: "No parties or events. No smoking.", check_in_time: "15:00", check_out_time: "11:00", cancellation_policy: "moderate",
  base_price: null, weekend_price: null, cleaning_fee: 0, weekly_discount_pct: 0, monthly_discount_pct: 0, min_nights: 1, max_nights: 28, airbnb_url: "", booking_url: "",
  guests_included: null, extra_guest_fee: 0, pets_allowed: false, pet_fee: 0, checkin_days: [], checkout_days: [], advance_notice_days: 0, prep_days: 0, booking_window_days: 365}; }
function tiles(list, isOn, attr){ return '<div class="tiles">' + list.map(function(t){ return '<button type="button" class="tile" ' + attr + '="' + t[0] + '" aria-pressed="' + (isOn(t[0]) ? "true" : "false") + '">' + icon(t[2] || t[0]) + "<span>" + esc(t[1]) + "</span></button>"; }).join("") + "</div>"; }
function stepper(key, label, min, max){ return '<div class="stepper"><span>' + label + '</span><div><button type="button" data-step="' + key + '" data-d="-1" aria-label="Fewer">-</button><b id="st_' + key + '">' + W.l[key] + '</b><button type="button" data-step="' + key + '" data-d="1" data-max="' + max + '" data-min="' + min + '" aria-label="More">+</button></div></div>'; }
function sw(path, label, ic){ var v = get(path); return '<label class="switch"><span>' + icon(ic) + esc(label) + '</span><input type="checkbox" data-sw="' + path + '"' + (v ? " checked" : "") + "></label>"; }
function get(path){ return path.split(".").reduce(function(o, k){ return o == null ? undefined : o[k]; }, W.l); }
function set(path, v){ var ks = path.split("."), o = W.l; for (var i = 0; i < ks.length - 1; i++){ if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; } o[ks[ks.length - 1]] = v; }
function inp(path, label, type, extra){ var v = get(path); return '<label class="f2">' + label + '<input type="' + (type || "text") + '" data-in="' + path + '" value="' + esc(v == null ? "" : v) + '" ' + (extra || "") + "></label>"; }
function area(path, label, extra){ return '<label class="f2">' + label + '<textarea data-in="' + path + '" ' + (extra || "") + ">" + esc(get(path) || "") + "</textarea></label>"; }
var FEES = function(){ return !!(ME && ME.fees_enabled); };
function sel(path, label, opts){ var v = String(get(path)); return '<label class="f2">' + label + '<select data-in="' + path + '">' + opts.map(function(o){ return '<option value="' + o[0] + '"' + (String(o[0]) === v ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"; }
function dayChips(path, label){ var on = get(path) || []; return '<div class="f2">' + label + '<div class="tiles" style="grid-template-columns:repeat(7,1fr)">' + ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(function(d, i){ return '<button type="button" class="tile" data-dayk="' + path + '" data-d="' + (i + 1) + '" aria-pressed="' + (on.indexOf(i + 1) >= 0 ? "true" : "false") + '"><span>' + d + "</span></button>"; }).join("") + '</div><small style="color:var(--muted)">None ticked = any day.</small></div>'; }
function rulesStep(){
  return dayChips("checkin_days", "Check-in days") + dayChips("checkout_days", "Checkout days") +
    sel("advance_notice_days", "How much notice do you need?", [[0, "Same day"], [1, "At least 1 day"], [2, "At least 2 days"], [3, "At least 3 days"], [7, "At least 7 days"]]) +
    sel("prep_days", "Preparation time between stays", [[0, "None"], [1, "Block 1 night before and after each booking"], [2, "Block 2 nights before and after each booking"]]) +
    sel("booking_window_days", "How far ahead can guests book?", [[90, "3 months"], [180, "6 months"], [365, "12 months"], [730, "24 months"]]);
}
var STEPS = [
  {h: "Already on Airbnb? Import your listing", lead: "Paste the link to your Airbnb listing. We copy the title, description, rooms, amenities and photos into a draft, then you check every screen before you submit.", r: importStep, imp: true, hide: function(){ return W.l.status && W.l.status !== "draft" && W.l.status !== "rejected"; }},
  {h: "Which of these best describes your place?", r: function(){ return tiles(TYPES, function(k){ return W.l.property_type === k; }, "data-type"); }, f: ["property_type"]},
  {h: "Where's your place?", lead: "Give the area, not the street address. Then tap the map near your home: guests only ever see a circle about 1 km wide.",
   r: function(){ return inp("area", "Area", "text", 'placeholder="e.g. Allerton, south Liverpool" maxlength="80"') + inp("city", "Town or city", "text", 'maxlength="60"') + '<div class="pmap" id="pmap"></div><p class="m" id="pinTxt" style="font-size:13.5px;color:var(--muted);margin-top:6px">' + (W.l.lat ? "Pin set." : "No pin yet.") + "</p>"; },
   f: ["area", "city", "lat", "lng"], v: function(){ return !W.l.area ? "Please add the area." : W.l.lat == null ? "Please tap the map near your home." : ""; }, after: pinMap},
  {h: "Share some basics", lead: "You'll add more details later.", r: function(){ return stepper("max_guests", "Guests", 1, 30) + stepper("bedrooms", "Bedrooms", 0, 30) + stepper("beds", "Beds", 0, 50) + stepper("baths", "Bathrooms", 0, 20); }, f: ["max_guests", "bedrooms", "beds", "baths"]},
  {h: "What does your place offer?", r: function(){ return tiles(Object.keys(AMEN).map(function(k){ return [k, AMEN[k]]; }), function(k){ return W.l.amenities.indexOf(k) >= 0; }, "data-amen"); }, f: ["amenities"]},
  {h: "Kosher and Shabbat (optional)", lead: "Only tick what is true. Guests see 'Details provided by the host'. Please don't claim a certification or use a hechsher logo.",
   r: function(){ var k = W.l.kosher; return sw("kosher.kitchen", "Kosher kitchen", "kosher") +
     (k.kitchen ? '<label class="f2">Kitchen<select data-in="kosher.kitchen_type"><option value="">Choose</option>' + [["meat","Meat"],["milk","Milk (dairy)"],["both","Separate meat and milk"],["parev","Parev"]].map(function(o){ return '<option value="' + o[0] + '"' + (k.kitchen_type === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" + sw("kosher.separate_sinks", "Separate sinks", "water") + sw("kosher.separate_ovens", "Separate ovens", "kitchen") : "") +
     inp("kosher.supervision", "Kashrut, in your words (optional)", "text", 'maxlength="300" placeholder="e.g. Kitchen kashered by our local rabbi in 2025"') +
     sw("kosher.shabbat.hotplate", "Shabbat hot plate or blech", "shabbat") + sw("kosher.shabbat.urn", "Shabbat urn", "coffee") + sw("kosher.shabbat.lamp_timers", "Shabbat lamp or timers", "bolt") +
     sw("kosher.shabbat.non_electric_key", "Non-electric key or keypad override", "self_checkin") + sw("kosher.shabbat.no_motion_sensors", "No motion-sensor lights (or they switch off)", "check") +
     inp("kosher.shul_name", "Nearest shul (name)", "text", 'maxlength="120"') + inp("kosher.shul_walk_mins", "Minutes' walk to the shul", "number", 'min="1" max="120"') +
     '<label class="f2">Inside an eruv?<select data-in="kosher.eruv">' + [["unknown","Not sure"],["yes","Yes"],["no","No"]].map(function(o){ return '<option value="' + o[0] + '"' + (k.eruv === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>" +
     inp("kosher.kosher_shops", "Kosher shops and restaurants nearby (optional)", "text", 'maxlength="400"') + inp("kosher.mikvah", "Mikvah nearby (optional)", "text", 'maxlength="300"'); }, f: ["kosher"], rerender: true},
  {h: "Work stays (optional)", lead: "Helps work crews and business guests find you.", r: function(){ return sw("business.desk", "Desk or dedicated workspace", "workspace") + inp("business.wifi_mbps", "Wifi speed in Mbps (run a speed test at home)", "number", 'min="1" max="10000"') + sw("business.van_parking", "Parking for vans", "van") + sw("business.separate_beds", "Separate beds (good for colleagues)", "bed") + sw("business.monthly_rates", "Monthly stays welcome", "long_stay"); }, f: ["business"]},
  {h: "Which of these fit your place?", lead: "Pick any that apply. They help guests find you.", r: function(){ return tiles(CAT, function(k){ return W.l.categories.indexOf(k) >= 0; }, "data-cat2"); }, f: ["categories"]},
  {h: "Add some photos", lead: "At least 3, ideally 10 or more. Bright, landscape photos work best. The first one is your cover. Please don't show the house number or street sign.", r: photoStep, v: function(){ return W.photos.length < 3 ? "Please add at least 3 photos." : ""; }, needId: true},
  {h: "Give your place a title", lead: "Short and clear works best.", r: function(){ return inp("title", "Title", "text", 'maxlength="80" placeholder="e.g. Bright family house with garden near Sefton Park"'); }, f: ["title"], v: function(){ return (W.l.title || "").length < 3 ? "Please add a title." : ""; }},
  {h: "Describe your place", lead: "What makes it special? Rooms, beds, the area, transport. No street address, no 'was' prices.", r: function(){ return area("description", "Description", 'maxlength="5000"'); }, f: ["description"], v: function(){ return (W.l.description || "").length < 60 ? "A few more words please (60 characters or more)." : ""; }},
  {h: "House rules and check-in", r: function(){ return area("house_rules", "House rules", 'maxlength="2500"') + inp("check_in_time", "Check-in from", "time") + inp("check_out_time", "Checkout by", "time") +
     '<label class="f2">Cancellation policy<select data-in="cancellation_policy">' + [["flexible","Flexible: full refund up to 24 hours before"],["moderate","Moderate: full refund up to 5 days before, then 50%"],["strict","Strict: full refund up to 14 days before, 50% up to 7 days"]].map(function(o){ return '<option value="' + o[0] + '"' + (W.l.cancellation_policy === o[0] ? " selected" : "") + ">" + o[1] + "</option>"; }).join("") + "</select></label>"; },
   f: ["house_rules", "check_in_time", "check_out_time", "cancellation_policy"]},
  {h: "Now, set your price", lead: "You can change it any time, and set prices for single dates in your calendar.", r: priceStep,
   f: ["base_price", "weekend_price", "cleaning_fee", "weekly_discount_pct", "monthly_discount_pct", "min_nights", "max_nights", "guests_included", "extra_guest_fee", "pets_allowed", "pet_fee"],
   v: function(){ return !(+W.l.base_price >= 10) ? "Please set a nightly price of at least £10." : +W.l.max_nights && +W.l.min_nights > +W.l.max_nights ? "Minimum nights can't be more than maximum nights." : ""; }, after: example, rerender: true},
  {h: "Booking rules (optional)", lead: "Choose when guests can arrive and how far ahead they can book. Leave as they are to accept any day.", r: rulesStep,
   f: ["checkin_days", "checkout_days", "advance_notice_days", "prep_days", "booking_window_days"], hide: function(){ return !FEES(); }},
  {h: "Sync your other calendars", lead: "Stops double bookings. In Airbnb, Booking.com, Vrbo or Guesty, find 'Export calendar' and paste the link here. We check every 15 minutes, or tap Sync now.", r: icalStep, f: ["airbnb_url", "booking_url"], needId: true},
  {h: "Check and submit", r: reviewStep, last: true}
];
function openWizard(id){
  W.id = id; W.i = 0; W.photos = [];
  var l = id ? (ME.listings || []).filter(function(x){ return +x.id === id; })[0] : null;
  W.l = Object.assign(blank(), l ? JSON.parse(JSON.stringify(l)) : {});
  ["kosher", "business"].forEach(function(k){ W.l[k] = Object.assign(blank()[k], W.l[k] || {}); });
  W.l.kosher.shabbat = W.l.kosher.shabbat || {};
  W.photos = (ME.photos || []).filter(function(p){ return +p.listing_id === id; });
  W.priceHint = null; W.imported = null;
  if (STEPS[0].hide()) W.i = 1;
  if (l && l.status === "approved") W.i = STEPS.length - 1;
  show("#wz", true); document.body.style.overflow = "hidden"; drawStep();
}
function closeWizard(){ show("#wz", false); document.body.style.overflow = ""; refresh(); }
function drawStep(){
  var s = STEPS[W.i];
  var vis = STEPS.filter(function(x){ return !(x.hide && x.hide()); }), pos = vis.indexOf(s) + 1;
  $("#wzBar").style.width = Math.round(pos / vis.length * 100) + "%";
  $("#wzStep").textContent = "Step " + pos + " of " + vis.length;
  $("#wzIn").innerHTML = '<h2 id="wzH">' + esc(s.h) + "</h2>" + (s.lead ? '<p class="lead">' + esc(s.lead) + "</p>" : "") + s.r();
  $("#wzBack").style.visibility = W.i > (STEPS[0].hide() ? 1 : 0) ? "visible" : "hidden";
  $("#wzNext").textContent = s.last ? "Submit for approval" : s.imp && !W.imported ? "Start from scratch" : "Next";
  $("#wzIn").classList.remove("in"); void $("#wzIn").offsetWidth; $("#wzIn").classList.add("in");
  $("#wzMsg").textContent = "";
  if (s.after) s.after();
  $(".wz-body").scrollTop = 0;
}
function payload(fields){ var o = {}; fields.forEach(function(k){ var v = W.l[k]; if (["base_price","weekend_price","cleaning_fee","weekly_discount_pct","monthly_discount_pct","min_nights","max_nights","max_guests","bedrooms","beds","baths","guests_included","extra_guest_fee","pet_fee","advance_notice_days","prep_days","booking_window_days"].indexOf(k) >= 0) v = v === "" || v == null ? null : +v; if (k === "business" && v) v = Object.assign({}, v, {wifi_mbps: v.wifi_mbps ? +v.wifi_mbps : null}); if (k === "kosher" && v) v = Object.assign({}, v, {shul_walk_mins: v.shul_walk_mins ? +v.shul_walk_mins : null}); if ((k === "airbnb_url" || k === "booking_url") && !v) v = null; o[k] = v; }); return o; }
function save(fields){
  var body = {action: "save_listing", listing: payload(fields || [])};
  if (W.id) body.id = W.id; else body.listing.title = W.l.title || (W.l.area ? "Home in " + W.l.area : "My home");
  return api("bookhomes-host", body).then(function(j){ if (!W.id){ W.id = j.id; } return j; });
}
$("#wzNext").addEventListener("click", function(){
  var s = STEPS[W.i], err = s.v ? s.v() : "";
  if (err){ $("#wzMsg").textContent = err; return; }
  var b = this; b.disabled = true; $("#wzMsg").textContent = "";
  if (s.last){
    save(Object.keys(blank())).then(function(){ return api("bookhomes-host", {action: "submit_listing", id: W.id}); })
      .then(function(){ b.disabled = false; $("#wzIn").innerHTML = "<h2>Thanks! Your listing is with us.</h2><p class='lead'>We check every listing, usually within one working day, and email you when it's live.</p><button type='button' class='btn' id='wzDone'>Back to dashboard</button>"; $("#wzDone").addEventListener("click", closeWizard); $("#wzNext").style.visibility = "hidden"; })
      .catch(function(e){ b.disabled = false; $("#wzMsg").textContent = e.message; });
    return;
  }
  var nx = W.i + 1; while (STEPS[nx].hide && STEPS[nx].hide()) nx++;
  (s.f || STEPS[nx].needId ? save(s.f || []) : Promise.resolve()).then(function(){ b.disabled = false; W.i = nx; drawStep(); })
    .catch(function(e){ b.disabled = false; $("#wzMsg").textContent = e.message; });
});
$("#wzBack").addEventListener("click", function(){ var pv = W.i - 1; while (pv > 0 && STEPS[pv].hide && STEPS[pv].hide()) pv--; if (pv >= 0 && !(STEPS[pv].hide && STEPS[pv].hide())){ W.i = pv; $("#wzNext").style.visibility = "visible"; drawStep(); } });
$("#wzSave").addEventListener("click", function(){ var s = STEPS[W.i]; (s.f ? save(s.f) : Promise.resolve()).then(closeWizard).catch(function(e){ $("#wzMsg").textContent = e.message; }); });
$("#wzIn").addEventListener("click", function(e){
  var dk = e.target.closest("[data-dayk]");
  if (dk){ var dp = dk.getAttribute("data-dayk"), dv = +dk.getAttribute("data-d"), da = (get(dp) || []).slice(), di = da.indexOf(dv); if (di >= 0) da.splice(di, 1); else da.push(dv); da.sort(); set(dp, da); dk.setAttribute("aria-pressed", di >= 0 ? "false" : "true"); return; }
  var t = e.target.closest("[data-type],[data-amen],[data-cat2],[data-step]");
  if (!t) return;
  if (t.hasAttribute("data-type")){ W.l.property_type = t.getAttribute("data-type"); drawStep(); }
  else if (t.hasAttribute("data-amen") || t.hasAttribute("data-cat2")){
    var key = t.hasAttribute("data-amen") ? "amenities" : "categories", v = t.getAttribute(t.hasAttribute("data-amen") ? "data-amen" : "data-cat2"), arr = W.l[key], i = arr.indexOf(v);
    if (i >= 0) arr.splice(i, 1); else arr.push(v);
    t.setAttribute("aria-pressed", i >= 0 ? "false" : "true");
  } else {
    var k = t.getAttribute("data-step"), n = (+W.l[k] || 0) + +t.getAttribute("data-d");
    n = Math.max(+(t.getAttribute("data-min") || (k === "max_guests" ? 1 : 0)), Math.min(+(t.getAttribute("data-max") || 50), n));
    W.l[k] = n; $("#st_" + k).textContent = n;
  }
});
$("#wzIn").addEventListener("input", function(e){
  var t = e.target;
  if (t.hasAttribute("data-in")){ set(t.getAttribute("data-in"), t.value); if (STEPS[W.i].after === example) example(); }
});
$("#wzIn").addEventListener("change", function(e){
  var t = e.target;
  if (t.hasAttribute("data-sw")){ set(t.getAttribute("data-sw"), t.checked); if (STEPS[W.i].rerender) drawStep(); }
  if (t.hasAttribute("data-in")) set(t.getAttribute("data-in"), t.value);
  if (t.id === "phFiles") upload(t.files);
});
function pinMap(){
  if (!window.L) return;
  var start = W.l.lat != null ? [+W.l.lat, +W.l.lng] : [53.41, -2.98];
  var m = L.map("pmap").setView(start, W.l.lat != null ? 14 : 11), circle = null;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 17, attribution: "&copy; OpenStreetMap contributors"}).addTo(m);
  function put(ll){ if (circle) circle.remove(); circle = L.circle(ll, {radius: 900, color: "#1f4d3a", weight: 1.5, fillOpacity: .15}).addTo(m); }
  if (W.l.lat != null) put(start);
  m.on("click", function(e){ W.l.lat = Math.round(e.latlng.lat * 100) / 100; W.l.lng = Math.round(e.latlng.lng * 100) / 100; put([W.l.lat, W.l.lng]); $("#pinTxt").textContent = "Pin set. Guests see this approximate area only."; });
}
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
$("#wzIn").addEventListener("click", function(e){ var g = e.target.closest && e.target.closest("[data-ge]"); if (g){ $("#example").setAttribute("data-mode", g.getAttribute("data-ge")); example(); } });
function money0(v){ return v == null || v === "" ? "" : v; }
function priceStep(){
  var l = W.l, pets = !!l.pets_allowed;
  var row = function(path, label, sub, extra){ return '<label class="prow"><span><b>' + label + "</b>" + (sub ? "<small>" + sub + "</small>" : "") + '</span><span class="pin">£<input type="number" inputmode="decimal" data-in="' + path + '" value="' + esc(money0(get(path))) + '" ' + (extra || 'min="0" max="2000" step="1"') + "></span></label>"; };
  var pct = function(path, label, sub, max){ return '<label class="prow"><span><b>' + label + "</b><small>" + sub + '</small></span><span class="pin">' + '<input type="number" inputmode="numeric" data-in="' + path + '" value="' + esc(money0(get(path))) + '" min="0" max="' + max + '">%</span></label>'; };
  var num = function(path, label, sub, max){ return '<label class="prow"><span><b>' + label + "</b><small>" + sub + '</small></span><span class="pin"><input type="number" inputmode="numeric" data-in="' + path + '" value="' + esc(money0(get(path))) + '" min="1" max="' + max + '"></span></label>'; };
  return (W.priceHint ? '<p class="pnote" style="text-align:center;margin:0 0 8px">Your Airbnb page showed about £' + esc(W.priceHint) + ' a night.</p>' : "") + '<div class="bigp"><span>£</span><input id="bigPrice" type="number" inputmode="numeric" data-in="base_price" value="' + esc(money0(l.base_price)) + '" min="10" max="10000" step="1" aria-label="Price per night in pounds" placeholder="0"></div><p class="bigp-sub">per night, Sunday to Thursday</p>' +
    '<div class="example ge" id="example" data-mode="night"></div>' +
    '<h3 class="psec">Weekend and custom prices</h3>' + row("weekend_price", "Weekend price", "Friday and Saturday nights. Leave blank to use your nightly price.", 'min="10" max="10000" step="1"') +
    '<p class="pnote">Custom prices for single dates (match days, Christmas, the Grand National) are set in your Calendar once the listing is saved.</p>' +
    '<h3 class="psec">Fees</h3>' + row("cleaning_fee", "Cleaning fee", "Once per stay. Shown inside the total, never added at checkout.") +
    (FEES() ? row("extra_guest_fee", "Extra guest fee", "Per guest, per night, above the number below.") + num("guests_included", "Guests included", "Guests covered by the nightly price. Leave empty for no extra guest fee.", 30) +
    '<label class="prow"><span><b>Pets allowed</b><small>Show your home to guests travelling with a pet.</small></span><input type="checkbox" class="tg" data-sw="pets_allowed"' + (pets ? " checked" : "") + "></label>" +
    (pets ? row("pet_fee", "Pet fee", "Once per stay.", 'min="0" max="500" step="1"') : "") : "") +
    '<h3 class="psec">Discounts</h3>' + pct("weekly_discount_pct", "Weekly discount", "For stays of 7 nights or more.", 50) + pct("monthly_discount_pct", "Monthly discount", "For stays of 28 nights or more. Popular with work crews.", 60) +
    '<h3 class="psec">Length of stay</h3>' + num("min_nights", "Minimum nights", "Shortest stay you accept.", 90) + num("max_nights", "Maximum nights", "Longest stay you accept.", 365);
}
/* Step 1 for new listings: import from Airbnb (the backend reads the public listing page), with a manual fallback */
/* fields the importer can fill */ var IMP_KEYS = ["title", "description", "property_type", "area", "city", "lat", "lng", "max_guests", "bedrooms", "beds", "baths", "amenities", "house_rules", "check_in_time", "check_out_time", "base_price", "cleaning_fee", "airbnb_url"];
function importStep(){
  if (W.imported) return importDone();
  return '<div class="imp"><label class="f2">Airbnb listing link<input type="url" id="impUrl" inputmode="url" autocomplete="off" placeholder="https://www.airbnb.co.uk/rooms/12345678" value="' + esc(W.l.airbnb_url || "") + '"></label>' +
    '<button type="button" class="btn block" id="impGo">' + icon("bolt") + "Import my listing</button>" +
    '<div id="impState" aria-live="polite"></div>' +
    '<div class="imp-how"><b>Where do I find the link?</b><span>Open your listing on airbnb.co.uk, tap Share, then Copy link. Only import homes you own or manage. We never copy reviews or ratings.</span></div>' +
    '<p class="imp-alt">Not on Airbnb? Tap <b>Start from scratch</b> below. It takes about 10 minutes.</p></div>';
}
function importDone(){
  var j = W.imported, got = [];
  if (j.title) got.push("Title");
  if (j.description) got.push("Description");
  if (j.max_guests) got.push(j.max_guests + " guests, " + (j.bedrooms || 0) + " bedrooms");
  if (j.amenities && j.amenities.length) got.push(j.amenities.length + " amenities");
  if (W.photos.length) got.push(W.photos.length + " photos");
  if (W.priceHint) got.push("Airbnb price about £" + W.priceHint + " a night");
  return '<div class="imp-ok">' + icon("check") + '<div><b>Imported from Airbnb</b><span>' + esc(j.title || "Your listing") + "</span></div></div>" +
    '<ul class="imp-got">' + got.map(function(g){ return "<li>" + icon("check") + esc(g) + "</li>"; }).join("") + "</ul>" +
    '<p class="lead" style="margin-top:16px">Tap Next to check each screen. Add the area (not the street address) and your map pin, then set your price.</p>';
}
function impProgress(i){
  var steps = ["Reading your Airbnb listing", "Copying details and amenities", "Copying photos"];
  $("#impState").innerHTML = '<ul class="imp-prog">' + steps.map(function(t, k){ return '<li class="' + (k < i ? "done" : k === i ? "now" : "") + '"><span class="dotx">' + (k < i ? icon("check") : "") + "</span>" + t + "</li>"; }).join("") + "</ul>";
}
$("#wzIn").addEventListener("click", function(e){
  if (!e.target.closest || !e.target.closest("#impGo")) return;
  var url = ($("#impUrl").value || "").trim(), b = $("#impGo");
  if (!/^https:\/\/([a-z]+\.)?airbnb\.[a-z.]+\/(rooms|h)\/[^\s]+$/i.test(url) && !/^https:\/\/(abnb\.me|airbnb\.app\.link)\/[^\s]+$/i.test(url)){
    $("#impState").innerHTML = '<p class="msg err">That doesn\'t look like an Airbnb listing link. It usually looks like https://www.airbnb.co.uk/rooms/12345678</p>'; return;
  }
  b.disabled = true; $("#wzNext").disabled = true; impProgress(0);
  var k = 0, tick = setInterval(function(){ if (k < 2) impProgress(++k); }, 1800);
  api("bookhomes-import-airbnb", {url: url, listing_id: W.id || undefined}).then(function(j){
    if (!j.ok){ var e = new Error(j.error || "We couldn't read that listing."); throw e; }
    W.id = +j.listing_id; W.priceHint = j.price_hint || null;
    return api("bookhomes-host", {action: "me"}).then(function(me){
      ME = me; clearInterval(tick); impProgress(3);
      var l = (ME.listings || []).filter(function(x){ return +x.id === W.id; })[0] || {};
      W.l = Object.assign(blank(), JSON.parse(JSON.stringify(l)));
      ["kosher", "business"].forEach(function(k){ W.l[k] = Object.assign(blank()[k], W.l[k] || {}); });
      W.l.kosher.shabbat = W.l.kosher.shabbat || {};
      W.photos = (ME.photos || []).filter(function(p){ return +p.listing_id === W.id; });
      W.imported = Object.assign({}, W.l, {count: (j.imported || []).length});
      setTimeout(function(){ $("#wzNext").disabled = false; drawStep(); }, 400);
    });
  }).catch(function(err){
    clearInterval(tick); b.disabled = false; $("#wzNext").disabled = false;
    var m = err.message || "We couldn't read that listing.";
    $("#impState").innerHTML = '<p class="msg err">' + esc(m) + ' You can fill in the details yourself instead: tap <b>Start from scratch</b>.</p>';
  });
});
function photoStep(){
  return '<label class="drop">' + icon("camera") + '<b>Upload photos</b><br><span style="color:var(--muted);font-size:14px">JPG, PNG or WebP, up to 10 MB each</span><input type="file" id="phFiles" accept="image/jpeg,image/png,image/webp" multiple hidden></label><p class="m" id="phOut" style="margin-top:8px"></p><div class="phgrid" id="phGrid">' + photoTiles() + "</div>";
}
function photoTiles(){
  return W.photos.map(function(p, i){ return '<figure>' + (i === 0 ? '<span class="cover">Cover</span>' : "") + '<img src="' + esc(p.url) + '" alt=""><figcaption>' + (i ? '<button type="button" data-cover="' + esc(p.id) + '">Make cover</button>' : "<span></span>") + '<button type="button" data-delph="' + esc(p.id) + '">Delete</button></figcaption></figure>'; }).join("");
}
$("#wzIn").addEventListener("click", function(e){
  var c = e.target.closest("[data-cover]"), d = e.target.closest("[data-delph]");
  if (c){ var id = c.getAttribute("data-cover"); W.photos.sort(function(a, b){ return a.id === id ? -1 : b.id === id ? 1 : 0; }); $("#phGrid").innerHTML = photoTiles(); api("bookhomes-host", {action: "order_photos", listing_id: W.id, ids: W.photos.map(function(p){ return p.id; })}); }
  if (d){ var pid = d.getAttribute("data-delph"); api("bookhomes-host", {action: "delete_photo", id: pid}).then(function(){ W.photos = W.photos.filter(function(p){ return p.id !== pid; }); $("#phGrid").innerHTML = photoTiles(); }); }
});
function shrink(file){
  // Resize big photos in the browser (max 2400px) to keep uploads fast on mobile data
  return new Promise(function(res){
    if (!window.createImageBitmap || file.size < 1.5e6) return res(file);
    createImageBitmap(file).then(function(bmp){
      var s = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      cv.toBlob(function(b){ res(b || file); }, "image/jpeg", 0.85);
    }).catch(function(){ res(file); });
  });
}
function upload(files){
  if (!W.id){ $("#phOut").textContent = "Please go back one step and try again."; return; }
  var list = Array.prototype.slice.call(files || []).slice(0, 40 - W.photos.length), done = 0, uid = SESSION.user.id;
  if (!list.length) return;
  $("#phOut").textContent = "Uploading 0 of " + list.length + "...";
  list.reduce(function(p, f){
    return p.then(function(){
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return;
      return shrink(f).then(function(blob){
        var ext = blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
        var path = uid + "/" + W.id + "/" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + "." + ext;
        return sb.storage.from("listing-photos").upload(path, blob, {contentType: blob.type || "image/jpeg", upsert: false}).then(function(r){
          if (r.error) throw r.error;
          return api("bookhomes-host", {action: "add_photo", listing_id: W.id, path: path});
        }).then(function(j){ W.photos.push({id: j.photo.id, url: j.photo.url}); done++; $("#phOut").textContent = "Uploading " + done + " of " + list.length + "..."; $("#phGrid").innerHTML = photoTiles(); });
      });
    });
  }, Promise.resolve()).then(function(){ $("#phOut").textContent = done + " photo" + (done === 1 ? "" : "s") + " added."; })
    .catch(function(e){ $("#phOut").textContent = "Upload failed: " + (e.message || e); });
}
function icalStep(){
  var src = (ME.sources || []).filter(function(s){ return +s.listing_id === W.id && s.enabled; });
  var l = (ME.listings || []).filter(function(x){ return +x.id === W.id; })[0];
  var names = ME.feed_names || ["Airbnb", "Booking.com", "Vrbo", "Guesty", "Other"];
  return '<div id="icList">' + src.map(function(s){
      var st = s.last_status === "ok" ? "Synced " + (s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"}) : "") + " · " + (s.last_event_count || 0) + " booked or blocked periods" : s.last_status === "error" ? "Problem: " + (s.last_error || "could not read it") : "Waiting for first sync";
      return '<div class="item"><div class="h"><span>' + esc(s.name) + '</span><button type="button" class="btn ghost sm" data-rmical="' + esc(s.id) + '">Remove</button></div><div class="m">' + esc(s.url.slice(0, 70)) + '...</div><div class="m" style="font-size:13px;color:' + (s.last_status === "error" ? "#b42318" : "var(--muted)") + '">' + esc(st) + "</div></div>"; }).join("") + "</div>" +
    (src.length ? '<button type="button" class="btn ghost sm" id="icSync">Sync now</button>' : "") +
    '<label class="f2">Calendar from<select id="icName">' + names.map(function(n){ return "<option>" + esc(n) + "</option>"; }).join("") + '</select></label><label class="f2">Calendar link (iCal export)<input type="url" id="icUrl" placeholder="https://... .ics"></label><button type="button" class="btn ghost" id="icAdd">Add calendar</button><p class="m" id="icOut" style="margin:8px 0 16px"></p>' +
    inp("airbnb_url", "Your Airbnb listing page (optional)", "url", 'placeholder="https://www.airbnb.co.uk/rooms/..."') + inp("booking_url", "Your Booking.com page (optional)", "url", 'placeholder="https://www.booking.com/hotel/..."') +
    (l && l.ical_export_url ? '<p class="m" style="font-size:14px">Your Book Homes calendar link. Paste it into Airbnb, Booking.com, Vrbo or Guesty ("Import calendar") so they close dates booked here:<code class="code-line">' + esc(l.ical_export_url) + "</code></p>" +
      '<details style="margin-top:10px"><summary><b>Using Guesty?</b></summary><ol style="font-size:14px;line-height:1.6;padding-left:20px">' +
      "<li>In Guesty, open this property and find its calendar sync (iCal) settings.</li>" +
      "<li>Choose to import a calendar, paste your Book Homes link above and save. Guesty then blocks dates booked on Book Homes.</li>" +
      "<li>Still in Guesty, copy the property's iCal export link.</li>" +
      "<li>Back here, choose 'Guesty' above, paste that link and tap Add calendar. We check it every 15 minutes, or tap Sync now.</li></ol></details>"
      : '<p class="m" style="font-size:14px;color:var(--muted)">Your Book Homes calendar link appears here once the listing is saved.</p>');
}
$("#wzIn").addEventListener("click", function(e){
  if (e.target.id === "icSync"){
    var sb2 = e.target; busy(sb2, true, "Syncing...");
    api("bookhomes-host", {action: "sync_now", listing_id: W.id}).then(function(j){
      return refresh().then(function(){ drawStep(); $("#icOut").textContent = j.ok ? "All calendars synced." : "Some calendars could not be read. See the message under each one."; });
    }).catch(function(err){ busy(sb2, false, "Sync now"); $("#icOut").textContent = err.message; });
    return;
  }
  if (e.target.id === "icAdd"){
    var url = $("#icUrl").value.trim();
    if (!/^(https|webcal):\/\//i.test(url)){ $("#icOut").textContent = "Paste the full link (it starts with https:// or webcal://)."; return; }
    var add = e.target; busy(add, true, "Checking the link...");
    api("bookhomes-host", {action: "add_ical", listing_id: W.id, name: $("#icName").value, url: url}).then(function(j){
      return refresh().then(function(){ drawStep(); $("#icOut").textContent = j.synced ? "Linked and synced: " + j.events + " booked or blocked periods found. We re-check every 15 minutes." : "Linked, but we couldn't read it yet: " + (j.error || "unknown problem") + " We'll keep trying every 15 minutes."; });
    }).catch(function(err){ busy(add, false, "Add calendar"); $("#icOut").textContent = err.message; });
  }
  var rm = e.target.closest && e.target.closest("[data-rmical]");
  if (rm) api("bookhomes-host", {action: "remove_ical", id: rm.getAttribute("data-rmical")}).then(refresh).then(drawStep);
});
$("#wzIn").addEventListener("input", function(e){ if (e.target.id === "abDesc") W.l.description = e.target.value; });
function reviewStep(){
  var l = W.l, f = [];
  if (l.kosher.kitchen) f.push("Kosher kitchen");
  if (l.business.desk) f.push("Desk");
  return '<div class="item"><b>' + esc(l.title) + '</b><div class="m">' + esc(l.area) + ", " + esc(l.city) + " · " + l.max_guests + " guests · " + l.bedrooms + " bedrooms · " + W.photos.length + " photos</div>" +
    '<div class="m">£' + esc(l.base_price) + " a night" + (l.weekend_price ? ", £" + esc(l.weekend_price) + " Fri and Sat" : "") + " · cleaning £" + esc(l.cleaning_fee || 0) + " · min " + esc(l.min_nights) + " nights</div>" +
    (f.length ? '<div class="m">' + esc(f.join(", ")) + "</div>" : "") + "</div><p class='lead'>When you submit, we check your listing (photos, text and that no street address is shown). We'll email you when it's live.</p>";
}
})();
