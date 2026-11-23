/* Book Homes guest messaging.
   - Listing pages: a "Message host" button in the host sections opens a form (signed in: name/email from the account;
     signed out: name, email, optional phone). Sends action "start" to the bookhomes-messages function.
   - /trips/messages: the guest's conversations (signed in: all of them; signed out: the private link ?t=..., plus
     links saved on this device) with a reply box.
   The host's email and phone are never shown. Token from bh-ui.js (window.BH_TOKEN). */
(function(){
"use strict";
var FN = "https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/bookhomes-messages";
var KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
var SAVED = "bh_msg_links";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="/assets/bh-icons.svg#i-' + n + '"/></svg>'; }
function token(){ return window.BH_TOKEN ? window.BH_TOKEN().catch(function(){ return null; }) : Promise.resolve(null); }
function claims(t){ try { var p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); while (p.length % 4) p += "="; return JSON.parse(atob(p)); } catch (e) { return {}; } }
function api(body, needAuth){
  return token().then(function(t){
    if (needAuth && !t) { var e = new Error("Please log in."); e.status = 401; throw e; }
    var h = {"Content-Type": "application/json", "apikey": KEY};
    if (t) h.Authorization = "Bearer " + t;
    return fetch(FN, {method: "POST", headers: h, body: JSON.stringify(body)});
  }).then(function(res){ return res.json().catch(function(){ return {}; }).then(function(j){ if (!res.ok){ var e = new Error(j.error || "Something went wrong. Please try again."); e.status = res.status; throw e; } return j; }); });
}
function lsGet(k, d){ try { return JSON.parse(localStorage.getItem(k) || "null") || d; } catch (e) { return d; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
function saveLink(t, title){
  var a = lsGet(SAVED, []).filter(function(x){ return x && x.t !== t; });
  a.unshift({t: t, title: title || "", at: Date.now()}); lsSet(SAVED, a.slice(0, 20));
}
var fT = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit"});
var fD = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"});
function when(s){ var d = new Date(s), n = new Date(); return d.toDateString() === n.toDateString() ? fT.format(d) : fD.format(d) + ", " + fT.format(d); }
function dshort(s){ return s ? fD.format(new Date(String(s).slice(0, 10) + "T00:00:00Z")) : ""; }
function linkify(s){ return esc(s).replace(/\n/g, "<br>"); }

var CSS = ".bhm-btn{display:inline-flex;align-items:center;gap:8px;margin-top:12px;min-height:44px;padding:10px 18px;border:1px solid #222;border-radius:8px;background:#fff;color:#222;font-weight:600;font-size:15px;cursor:pointer}" +
  ".bhm-btn:hover{background:#f7f7f7}.bhm-btn .ic{width:18px;height:18px}" +
  ".bhm-ov{position:fixed;inset:0;z-index:3000;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}" +
  "@media(min-width:720px){.bhm-ov{align-items:center}}" +
  ".bhm-box{background:#fff;width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:20px 20px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 10px 40px rgba(0,0,0,.25)}" +
  "@media(min-width:720px){.bhm-box{border-radius:20px;padding:28px}}" +
  ".bhm-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px}.bhm-top h2{font-size:21px;font-weight:800;letter-spacing:-.01em}" +
  ".bhm-x{width:40px;height:40px;border-radius:50%;border:0;background:#f3f3f3;font-size:22px;line-height:1;cursor:pointer}" +
  ".bhm-sub{color:#6a6a6a;font-size:14px;margin-bottom:16px}" +
  ".bhm-f label{display:block;font-size:13px;font-weight:700;margin:12px 0 5px}.bhm-f label small{font-weight:500;color:#6a6a6a}" +
  ".bhm-f input,.bhm-f textarea{width:100%;font:inherit;font-size:16px;border:1px solid #cfcfcf;border-radius:10px;padding:11px 12px;background:#fff}" +
  ".bhm-f textarea{min-height:130px;resize:vertical}.bhm-f input:focus,.bhm-f textarea:focus{outline:2px solid #1F4D3A;border-color:#1F4D3A}" +
  ".bhm-row{display:grid;grid-template-columns:1fr 1fr 90px;gap:10px}.bhm-row>div{min-width:0}.bhm-row input{min-width:0;max-width:100%}.bhm-row label{margin-top:12px}" +
  "@media(max-width:420px){.bhm-row{grid-template-columns:1fr 1fr}.bhm-row>div:last-child{grid-column:1/-1}}" +
  ".bhm-hp{position:absolute!important;left:-9999px!important;width:1px;height:1px;overflow:hidden}" +
  ".bhm-note{font-size:12.5px;color:#6a6a6a;margin-top:10px}.bhm-count{float:right;font-weight:500;color:#6a6a6a}" +
  ".bhm-send{margin-top:16px;width:100%;min-height:50px;border:0;border-radius:10px;background:#1F4D3A;color:#fff;font-weight:700;font-size:16px;cursor:pointer}" +
  ".bhm-send:hover{background:#2c6a50}.bhm-send[disabled]{opacity:.6;cursor:default}" +
  ".bhm-err{background:#fdeceb;color:#b42318;border-radius:10px;padding:10px 12px;font-size:14px;margin-top:12px}" +
  ".bhm-ok{text-align:center;padding:10px 4px}.bhm-ok .bhm-tick{width:56px;height:56px;border-radius:50%;background:#e9f1ec;color:#1F4D3A;display:grid;place-items:center;margin:4px auto 12px;font-size:28px;font-weight:800}" +
  ".bhm-ok h3{font-size:20px;margin-bottom:8px}.bhm-ok p{color:#3d3d3d;font-size:15px;margin-bottom:14px}" +
  ".bhm-ok a.bhm-send{display:flex;align-items:center;justify-content:center;text-decoration:none}" +
  ".bhm-who{background:#e9f1ec;border-radius:10px;padding:9px 12px;font-size:14px;margin-top:6px}";
function injectCss(){ if ($("#bhmCss")) return; var s = document.createElement("style"); s.id = "bhmCss"; s.textContent = CSS; document.head.appendChild(s); }

/* ---------------- listing page ---------------- */
function listingId(){ var b = $("[data-save]"); var v = b ? +b.getAttribute("data-save") : 0; return v > 0 ? v : 0; }
function hostName(){ var b = $(".lp-host b, #lpHost"); var t = b ? b.textContent.replace(/^Hosted by\s+/i, "").trim() : ""; return t && t !== "your host" ? t : "the host"; }
function title(){ var h = $("#lpTitle"); return h ? h.textContent.trim() : ""; }
function addButtons(){
  $$(".lp-host > div, .hostcard > div").forEach(function(d){
    if (d.querySelector(".bhm-btn")) return;
    var b = document.createElement("button"); b.type = "button"; b.className = "bhm-btn"; b.setAttribute("data-msghost", "");
    b.innerHTML = icon("chat") + "<span>Message host</span>"; d.appendChild(b);
  });
}
function prefDates(){
  var q = new URLSearchParams(location.search), a = q.get("checkin") || q.get("check_in") || "", b = q.get("checkout") || q.get("check_out") || "";
  return {a: /^\d{4}-\d{2}-\d{2}$/.test(a) ? a : "", b: /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : "", g: q.get("guests") || ""};
}
var lastFocus = null;
function close(){ var o = $("#bhmOv"); if (o) o.remove(); document.documentElement.style.overflow = ""; if (lastFocus && lastFocus.focus) lastFocus.focus(); }
function openForm(){
  var id = listingId();
  if (!id){ alert("Please wait a moment for the page to finish loading."); return; }
  injectCss(); lastFocus = document.activeElement;
  var me = lsGet("bh_msg_me", {}), d = prefDates(), host = hostName();
  var today = new Date().toISOString().slice(0, 10);
  var ov = document.createElement("div"); ov.className = "bhm-ov"; ov.id = "bhmOv";
  ov.innerHTML = '<div class="bhm-box" role="dialog" aria-modal="true" aria-labelledby="bhmH">' +
    '<div class="bhm-top"><h2 id="bhmH">Message ' + esc(host) + '</h2><button type="button" class="bhm-x" data-bhmclose aria-label="Close">&times;</button></div>' +
    '<p class="bhm-sub">Ask about ' + esc(title() || "this home") + '. Most hosts reply within a day.</p>' +
    '<form class="bhm-f" id="bhmF" novalidate>' +
    '<div id="bhmWho"></div>' +
    '<div id="bhmGuest"><label for="bhmName">Your name</label><input id="bhmName" autocomplete="name" maxlength="120" required value="' + esc(me.name || "") + '">' +
    '<label for="bhmEmail">Email <small>(so the host can reply)</small></label><input id="bhmEmail" type="email" inputmode="email" autocomplete="email" maxlength="254" required value="' + esc(me.email || "") + '">' +
    '<label for="bhmPhone">Mobile <small>(optional)</small></label><input id="bhmPhone" type="tel" inputmode="tel" autocomplete="tel" maxlength="30" value="' + esc(me.phone || "") + '"></div>' +
    '<div class="bhm-row"><div><label for="bhmIn">Check-in <small>(optional)</small></label><input id="bhmIn" type="date" min="' + today + '" value="' + esc(d.a) + '"></div>' +
    '<div><label for="bhmOut">Checkout</label><input id="bhmOut" type="date" min="' + today + '" value="' + esc(d.b) + '"></div>' +
    '<div><label for="bhmG">Guests</label><input id="bhmG" type="number" min="1" max="50" inputmode="numeric" value="' + esc(d.g) + '"></div></div>' +
    '<label for="bhmBody">Your message <span class="bhm-count" id="bhmCount">0 / 2000</span></label><textarea id="bhmBody" maxlength="2000" required placeholder="Hi, we are a family of 4 looking at these dates. Is parking on site?"></textarea>' +
    '<div class="bhm-hp" aria-hidden="true"><label>Website<input id="bhmWeb" tabindex="-1" autocomplete="off"></label></div>' +
    '<div id="bhmErr"></div>' +
    '<button type="submit" class="bhm-send" id="bhmSend">Send message</button>' +
    '<p class="bhm-note">Phone numbers and emails stay hidden until you book. For your safety, keep payments on Book Homes.</p>' +
    '</form></div>';
  document.body.appendChild(ov); document.documentElement.style.overflow = "hidden";
  ov.addEventListener("click", function(e){ if (e.target === ov || e.target.closest("[data-bhmclose]")) close(); });
  ov.addEventListener("keydown", function(e){ if (e.key === "Escape") close(); });
  var ta = $("#bhmBody"); ta.addEventListener("input", function(){ $("#bhmCount").textContent = ta.value.length + " / 2000"; });
  token().then(function(t){
    if (!t) return;
    var c = claims(t);
    if (c.email){ $("#bhmWho").innerHTML = '<div class="bhm-who">Sending as <b>' + esc(c.email) + "</b></div>"; $("#bhmEmail").closest("#bhmGuest").querySelectorAll("label")[1].hidden = true; $("#bhmEmail").hidden = true; $("#bhmEmail").value = c.email; }
  });
  setTimeout(function(){ ($("#bhmName").value ? ta : $("#bhmName")).focus(); }, 30);
  $("#bhmF").addEventListener("submit", function(e){
    e.preventDefault();
    var err = $("#bhmErr"), btn = $("#bhmSend");
    var body = ta.value.trim(), name = $("#bhmName").value.trim(), email = $("#bhmEmail").value.trim(), phone = $("#bhmPhone").value.trim();
    function bad(m, f){ err.innerHTML = '<div class="bhm-err">' + esc(m) + "</div>"; if (f) f.focus(); }
    if (name.length < 2) return bad("Please add your name.", $("#bhmName"));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad("Please add a valid email so the host can reply.", $("#bhmEmail"));
    if (body.length < 2) return bad("Please write a message.", ta);
    var ci = $("#bhmIn").value, co = $("#bhmOut").value;
    if (ci && co && co <= ci) return bad("Checkout must be after check-in.", $("#bhmOut"));
    err.innerHTML = ""; btn.disabled = true; btn.textContent = "Sending...";
    var prev = lsGet(SAVED, []).filter(function(x){ return x.lid === id; })[0];
    api({action: "start", listing_id: id, body: body, name: name, email: email, phone: phone || null, check_in: ci || null, check_out: co || null,
      guests: $("#bhmG").value || null, website: $("#bhmWeb").value, t: prev ? prev.t : null})
      .then(function(j){
        lsSet("bh_msg_me", {name: name, email: email, phone: phone});
        if (j.t){ saveLink(j.t, title()); var a = lsGet(SAVED, []); if (a[0]) { a[0].lid = id; lsSet(SAVED, a); } }
        var link = j.t ? "/trips/messages?t=" + encodeURIComponent(j.t) : "/trips/messages";
        $(".bhm-box", ov).innerHTML = '<div class="bhm-top"><span></span><button type="button" class="bhm-x" data-bhmclose aria-label="Close">&times;</button></div>' +
          '<div class="bhm-ok"><div class="bhm-tick">&#10003;</div><h3>Message sent</h3><p>We have sent your message to ' + esc(host) + ". We'll email you at <b>" + esc(email) + "</b> when they reply" + (phone ? ", and text you" : "") + ".</p>" +
          (j.redacted ? '<p style="font-size:13.5px;color:#6a6a6a">We hid a phone number or email in your message. You can share contact details once you book.</p>' : "") +
          '<a class="bhm-send" href="' + esc(link) + '">See the conversation</a></div>';
      }, function(e2){ btn.disabled = false; btn.textContent = "Send message"; bad(e2.message); });
  });
}

/* ---------------- /trips/messages ---------------- */
var INBOX = /^\/trips\/messages\/?$/.test(location.pathname);
var S = {threads: [], cur: null, t: null};
function inboxCss(){
  if ($("#bhmICss")) return;
  var s = document.createElement("style"); s.id = "bhmICss";
  s.textContent = ".im{max-width:1240px;padding-bottom:60px}.im-top{padding:28px 0 12px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}.im-top h1{font-size:clamp(26px,4vw,34px);font-weight:800;letter-spacing:-.02em;margin-right:auto}" +
    ".im-top a{font-weight:600;font-size:14.5px}" +
    ".im-grid{display:grid;grid-template-columns:340px minmax(0,1fr);border:1px solid #e6e6e6;border-radius:18px;overflow:hidden;background:#fff;min-height:520px}" +
    ".im-list{border-right:1px solid #e6e6e6;overflow:auto;max-height:72vh}.im-item{display:flex;gap:12px;width:100%;text-align:left;border:0;border-bottom:1px solid #efefef;background:#fff;padding:14px 16px;cursor:pointer;font:inherit;color:inherit}" +
    ".im-item:hover{background:#f7f7f7}.im-item[aria-current=true]{background:#e9f1ec}" +
    ".im-ph{width:52px;height:52px;border-radius:10px;background:#f1f1f1;flex-shrink:0;overflow:hidden}.im-ph img{width:100%;height:100%;object-fit:cover}" +
    ".im-item b{display:block;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.im-item small{display:block;font-size:13px;color:#6a6a6a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.im-item>div{min-width:0;flex:1}" +
    ".im-dot{display:inline-block;min-width:20px;height:20px;border-radius:10px;background:#E3A35A;color:#222;font-size:12px;font-weight:800;text-align:center;line-height:20px;padding:0 6px;margin-left:6px}" +
    ".im-pane{display:flex;flex-direction:column;min-width:0;max-height:72vh}.im-head{padding:14px 18px;border-bottom:1px solid #efefef;display:flex;align-items:center;gap:10px}.im-head b{font-size:16px}.im-head small{display:block;color:#6a6a6a;font-size:13px}" +
    ".im-back{display:none;border:1px solid #e6e6e6;background:#fff;border-radius:10px;width:40px;height:40px;font-size:20px;cursor:pointer}" +
    ".im-msgs{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#fbfaf8}" +
    ".im-m{max-width:78%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.5;background:#fff;border:1px solid #ececec;align-self:flex-start;overflow-wrap:anywhere}" +
    ".im-m.mine{align-self:flex-end;background:#1F4D3A;color:#fff;border-color:#1F4D3A}.im-m time{display:block;font-size:11.5px;opacity:.7;margin-top:4px}" +
    ".im-m .red{display:block;font-size:11.5px;opacity:.8;margin-top:4px;font-style:italic}" +
    ".im-reply{display:flex;gap:10px;padding:12px;border-top:1px solid #efefef;background:#fff}.im-reply textarea{flex:1;font:inherit;font-size:16px;border:1px solid #cfcfcf;border-radius:12px;padding:10px 12px;min-height:48px;max-height:160px;resize:vertical}" +
    ".im-reply button{border:0;border-radius:12px;background:#1F4D3A;color:#fff;font-weight:700;padding:0 18px;min-height:48px;cursor:pointer}.im-reply button[disabled]{opacity:.6}" +
    ".im-empty{padding:48px 20px;text-align:center;color:#6a6a6a}.im-empty h2{color:#222;font-size:20px;margin-bottom:8px}.im-err{background:#fdeceb;color:#b42318;border-radius:10px;padding:10px 12px;margin:10px 12px;font-size:14px}" +
    "@media(max-width:860px){.im-grid{grid-template-columns:1fr;min-height:0}.im-list{border-right:0;max-height:none}.im-grid.open .im-list{display:none}.im-grid:not(.open) .im-pane{display:none}.im-back{display:inline-block}.im-pane{max-height:none;min-height:70vh}.im-msgs{max-height:60vh}}";
  document.head.appendChild(s);
}
function itemHtml(t, i){
  var sub = (t.last_sender === "guest" ? "You: " : "") + (t.last_preview || "");
  return '<button type="button" class="im-item" data-th="' + i + '"' + (S.cur === i ? ' aria-current="true"' : "") + '><span class="im-ph">' + (t.photo && /^https:/.test(t.photo) ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy">' : "") + "</span><div>" +
    "<b>" + esc(t.listing_title || "Conversation") + (t.unread ? '<span class="im-dot" aria-label="unread">' + t.unread + "</span>" : "") + "</b><small>" + esc(t.host_name || "") + (t.last_message_at ? " · " + esc(when(t.last_message_at)) : "") + "</small><small>" + esc(sub) + "</small></div></button>";
}
function renderList(){
  var L = $("#imList");
  if (!S.threads.length){ L.innerHTML = '<div class="im-empty"><h2>No messages yet</h2><p>Open any home and tap <b>Message host</b> to ask a question.</p><p><a class="btn" href="/">Find a home</a></p></div>'; return; }
  L.innerHTML = S.threads.map(itemHtml).join("");
}
function renderThread(j){
  var t = j.thread, g = $("#imGrid"); g.classList.add("open");
  var dates = t.check_in ? dshort(t.check_in) + (t.check_out ? " to " + dshort(t.check_out) : "") : "";
  $("#imPane").innerHTML = '<div class="im-head"><button type="button" class="im-back" data-imback aria-label="Back to all messages">&#8249;</button><div><b>' + esc(t.host_name || "Your host") + "</b><small>" +
    (t.listing_slug ? '<a href="/' + esc(t.listing_slug) + '">' + esc(t.listing_title) + "</a>" : esc(t.listing_title)) + (dates ? " · " + esc(dates) : "") + "</small></div></div>" +
    '<div class="im-msgs" id="imMsgs" aria-live="polite">' + j.messages.map(msgHtml).join("") + "</div>" +
    (t.status === "blocked" ? '<div class="im-empty">This conversation is closed.</div>' :
    '<form class="im-reply" id="imReply"><label class="sr-only" for="imText">Reply</label><textarea id="imText" maxlength="2000" placeholder="Write a message" required></textarea><button type="submit">Send</button></form><div id="imErr"></div>');
  var m = $("#imMsgs"); m.scrollTop = m.scrollHeight;
}
function msgHtml(m){ return '<div class="im-m' + (m.mine ? " mine" : "") + '">' + linkify(m.body) + (m.redacted ? '<span class="red">Contact details are hidden until you book.</span>' : "") + "<time>" + esc(when(m.created_at)) + "</time></div>"; }
function openThread(i){
  var t = S.threads[i]; if (!t) return; S.cur = i; renderList();
  $("#imPane").innerHTML = '<div class="im-empty">Loading...</div>'; $("#imGrid").classList.add("open");
  var req = t._t ? {action: "guest_thread", t: t._t} : {action: "guest_thread", id: t.id};
  api(req, !t._t).then(function(j){ t.unread = 0; S.threads[i] = Object.assign(t, j.thread, {_t: t._t}); renderList(); renderThread(j); },
    function(e){ $("#imPane").innerHTML = '<div class="im-err">' + esc(e.message) + "</div>"; });
}
function startInbox(){
  inboxCss();
  var root = $("#imRoot"); if (!root) return;
  var q = new URLSearchParams(location.search), tk = q.get("t");
  if (tk && /^[0-9a-f-]{36}$/i.test(tk)) saveLink(tk, "");
  document.addEventListener("click", function(e){
    var it = e.target.closest("[data-th]"); if (it){ openThread(+it.getAttribute("data-th")); return; }
    if (e.target.closest("[data-imback]")){ $("#imGrid").classList.remove("open"); S.cur = null; renderList(); }
  });
  document.addEventListener("submit", function(e){
    if (e.target.id !== "imReply") return; e.preventDefault();
    var t = S.threads[S.cur], ta = $("#imText"), b = e.target.querySelector("button"), body = ta.value.trim();
    if (!t || body.length < 2) return;
    b.disabled = true;
    api(t._t ? {action: "guest_reply", t: t._t, body: body} : {action: "guest_reply", id: t.id, body: body}, !t._t).then(function(j){
      b.disabled = false; ta.value = ""; $("#imErr").innerHTML = "";
      $("#imMsgs").insertAdjacentHTML("beforeend", msgHtml(j.message)); $("#imMsgs").scrollTop = 1e9;
      t.last_preview = j.message.body; t.last_sender = "guest"; t.last_message_at = j.message.created_at; renderList();
    }, function(err){ b.disabled = false; $("#imErr").innerHTML = '<div class="im-err">' + esc(err.message) + "</div>"; });
  });
  token().then(function(tok){
    var links = lsGet(SAVED, []);
    var signed = tok ? api({action: "guest_list"}, true).then(function(j){ return j.threads; }, function(){ return []; }) : Promise.resolve([]);
    return signed.then(function(list){
      var ids = {}; list.forEach(function(x){ ids[x.id] = 1; });
      // links saved on this device (signed out): load each so we know the title, unread and last message
      return Promise.all(links.slice(0, 10).map(function(l){
        return api({action: "guest_thread", t: l.t, peek: true}).then(function(j){ return ids[j.thread.id] ? null : Object.assign(j.thread, {_t: l.t}); }, function(){ return null; });
      })).then(function(extra){
        S.threads = list.concat(extra.filter(Boolean)).sort(function(a, b){ return String(b.last_message_at).localeCompare(String(a.last_message_at)); });
        $("#imSignin").hidden = !!tok;
        renderList();
        if (tk){ var i = -1; S.threads.forEach(function(x, k){ if (x._t === tk) i = k; }); if (i < 0 && S.threads.length) i = 0; if (i >= 0) openThread(i); }
        else if (window.matchMedia("(min-width: 861px)").matches && S.threads.length) openThread(0);
      });
    });
  });
}

function init(){
  if (INBOX) return startInbox();
  if (!$(".lp-host, .hostcard")) return;
  injectCss(); addButtons();
  document.addEventListener("click", function(e){ if (e.target.closest && e.target.closest("[data-msghost]")) openForm(); });
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
