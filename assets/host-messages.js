/* Book Homes host portal: Messages tab (guest conversations), unread badge on the tab, "unread messages" card on Today.
   Data: bookhomes-messages function (host_list, host_thread, host_reply). Calls go through host.js's api()
   (window.BH_HOST_API, so it uses the same session) and fall back to bh-ui.js's BH_TOKEN.
   Email links open /host/#messages=<thread id>. See docs/HOST-TEAM.md. */
(function(){
"use strict";
var FN_NAME = "bookhomes-messages";
var FN = "https://kddhkuwnkkjcnbjegsmc.supabase.co/functions/v1/" + FN_NAME;
var KEY = "sb_publishable_zASd1ua4ZuknbOatR4MnTA_nVwqRZlR";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function icon(n){ return '<svg class="ic" aria-hidden="true"><use href="/assets/bh-icons.svg#i-' + n + '"/></svg>'; }
function api(body){
  if (window.BH_HOST_API) return window.BH_HOST_API(FN_NAME, body);
  var tk = window.BH_TOKEN ? window.BH_TOKEN() : Promise.resolve(null);
  return tk.then(function(t){
    if (!t) throw new Error("Please log in again.");
    return fetch(FN, {method: "POST", headers: {"Content-Type": "application/json", "Authorization": "Bearer " + t, "apikey": KEY}, body: JSON.stringify(body)});
  }).then(function(res){ return res.json().catch(function(){ return {}; }).then(function(j){ if (!res.ok) throw new Error(j.error || ("Error " + res.status)); return j; }); });
}
var fT = new Intl.DateTimeFormat("en-GB", {hour: "2-digit", minute: "2-digit"});
var fD = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short"});
function when(s){ var d = new Date(s), n = new Date(); return d.toDateString() === n.toDateString() ? fT.format(d) : fD.format(d); }
function whenLong(s){ var d = new Date(s), n = new Date(); return (d.toDateString() === n.toDateString() ? "Today" : fD.format(d)) + ", " + fT.format(d); }
function dshort(s){ return s ? fD.format(new Date(String(s).slice(0, 10) + "T00:00:00Z")) : ""; }

var CSS = ".hm-grid{display:grid;grid-template-columns:360px minmax(0,1fr);border:1px solid var(--line-2,#ebebeb);border-radius:18px;overflow:hidden;background:#fff;min-height:560px}" +
  ".hm-list{border-right:1px solid var(--line-2,#ebebeb);overflow:auto;max-height:calc(100vh - 230px)}" +
  ".hm-filter{display:flex;gap:6px;padding:12px;border-bottom:1px solid var(--line-2,#ebebeb)}.hm-filter button{border:1px solid #d6d6d6;background:#fff;border-radius:999px;padding:6px 14px;font-weight:600;font-size:13.5px;min-height:36px;cursor:pointer}" +
  ".hm-filter button[aria-pressed=true]{background:#1F4D3A;border-color:#1F4D3A;color:#fff}" +
  ".hm-item{display:flex;gap:12px;width:100%;text-align:left;border:0;border-bottom:1px solid #f1f1f1;background:#fff;padding:14px 16px;cursor:pointer;font:inherit;color:inherit;align-items:flex-start}" +
  ".hm-item:hover{background:#f7f7f7}.hm-item[aria-current=true]{background:#e9f1ec}" +
  ".hm-av{width:44px;height:44px;border-radius:50%;background:#1F4D3A;color:#fff;display:grid;place-items:center;font-weight:700;flex-shrink:0}" +
  ".hm-item>div{min-width:0;flex:1}.hm-item .r1{display:flex;gap:8px;align-items:baseline}.hm-item b{font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}" +
  ".hm-item time{font-size:12.5px;color:var(--muted,#6a6a6a);flex-shrink:0}.hm-item small{display:block;font-size:13px;color:var(--muted,#6a6a6a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
  ".hm-item.unread b,.hm-item.unread .hm-pv{color:#222;font-weight:700}" +
  ".hm-dot{display:inline-block;min-width:20px;height:20px;border-radius:10px;background:#E3A35A;color:#222;font-size:12px;font-weight:800;text-align:center;line-height:20px;padding:0 6px}" +
  ".hm-tag{display:inline-block;font-size:11.5px;font-weight:700;border-radius:999px;padding:1px 8px;background:#e9f1ec;color:#1F4D3A;margin-left:6px}" +
  ".hm-pane{display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 230px)}" +
  ".hm-head{padding:14px 18px;border-bottom:1px solid #f1f1f1;display:flex;align-items:center;gap:12px}.hm-head b{font-size:16.5px}.hm-head small{display:block;color:var(--muted,#6a6a6a);font-size:13px}" +
  ".hm-back{display:none;border:1px solid #e6e6e6;background:#fff;border-radius:10px;width:40px;height:40px;font-size:22px;cursor:pointer;flex-shrink:0}" +
  ".hm-msgs{flex:1;overflow:auto;padding:18px;display:flex;flex-direction:column;gap:10px;background:#fbfaf8}" +
  ".hm-m{max-width:78%;padding:10px 14px;border-radius:16px;font-size:15px;line-height:1.5;background:#fff;border:1px solid #ececec;align-self:flex-start;overflow-wrap:anywhere}" +
  ".hm-m.mine{align-self:flex-end;background:#1F4D3A;color:#fff;border-color:#1F4D3A}.hm-m time{display:block;font-size:11.5px;opacity:.7;margin-top:4px}" +
  ".hm-m .red{display:block;font-size:11.5px;opacity:.8;margin-top:4px;font-style:italic}" +
  ".hm-reply{display:flex;gap:10px;padding:12px;border-top:1px solid #f1f1f1;background:#fff}.hm-reply textarea{flex:1;font:inherit;font-size:16px;border:1px solid #cfcfcf;border-radius:12px;padding:10px 12px;min-height:48px;max-height:180px;resize:vertical}" +
  ".hm-reply textarea:focus{outline:2px solid #1F4D3A;border-color:#1F4D3A}.hm-reply button{border:0;border-radius:12px;background:#1F4D3A;color:#fff;font-weight:700;padding:0 20px;min-height:48px;cursor:pointer}.hm-reply button[disabled]{opacity:.6}" +
  ".hm-none{padding:48px 20px;text-align:center;color:var(--muted,#6a6a6a)}.hm-err{background:#fdeceb;color:#b42318;border-radius:10px;padding:10px 12px;margin:10px 12px;font-size:14px}" +
  ".hm-tip{font-size:12.5px;color:var(--muted,#6a6a6a);padding:0 14px 10px;background:#fff}" +
  ".hm-badge{display:inline-block;min-width:18px;height:18px;border-radius:9px;background:#E3A35A;color:#222;font-size:11px;font-weight:800;text-align:center;line-height:18px;padding:0 5px;margin-left:2px}" +
  "@media(max-width:860px){.hm-badge{position:absolute;top:2px;left:calc(50% + 6px);margin:0}" +
  ".hm-grid{grid-template-columns:1fr;min-height:0;border-radius:14px}.hm-list{border-right:0;max-height:none}.hm-grid.open .hm-list{display:none}.hm-grid:not(.open) .hm-pane{display:none}.hm-back{display:inline-block}" +
  ".hm-pane{max-height:none}.hm-msgs{min-height:45vh;max-height:calc(100vh - 330px)}}" +
  ".hm-today{display:flex;align-items:center;gap:14px;border:1px solid var(--am-line,#ecc897);background:var(--am-tint,#fbf1e4);border-radius:14px;padding:14px 16px;margin-bottom:16px;cursor:pointer;width:100%;text-align:left;font:inherit;color:inherit}" +
  ".hm-today .ic{width:24px;height:24px;color:#8a5a1f;flex-shrink:0}.hm-today span{flex:1}.hm-today b{display:block}.hm-today small{color:#5d5d5d;font-size:13.5px}";

var S = {threads: [], cur: null, filter: "all", loaded: false, busy: false, unread: 0};
function inject(){
  if ($("#hmsCss")) return;
  var s = document.createElement("style"); s.id = "hmsCss"; s.textContent = CSS; document.head.appendChild(s);
  var p = $("#panel-messages"); if (!p) return;
  p.innerHTML = '<div class="pg-head"><div><h1>Messages</h1><p class="pg-sub" id="hmsSub">Questions from guests about your homes.</p></div></div>' +
    '<div class="hm-grid" id="hmsGrid"><div class="hm-list"><div class="hm-filter" role="group" aria-label="Show"><button type="button" data-hmf="all" aria-pressed="true">All</button><button type="button" data-hmf="unread" aria-pressed="false">Unread</button></div><div id="hmsList"><div class="hm-none">Loading...</div></div></div>' +
    '<div class="hm-pane" id="hmsPane"><div class="hm-none">Choose a conversation.</div></div></div>';
}
function badge(n){
  S.unread = n;
  $$('[data-tab="messages"]').forEach(function(b){
    var x = b.querySelector(".hm-badge");
    if (!n){ if (x) x.remove(); return; }
    if (!x){ x = document.createElement("span"); x.className = "hm-badge"; b.appendChild(x); }
    x.textContent = n > 9 ? "9+" : String(n); x.setAttribute("aria-label", n + " unread");
  });
  var td = $("#hmsToday");
  if (!td){ var pb = $("#payBanner"); if (!pb) return; td = document.createElement("div"); td.id = "hmsToday"; pb.parentNode.insertBefore(td, pb.nextSibling); }
  td.innerHTML = n ? '<button type="button" class="hm-today" data-go="messages">' + icon("chat") + "<span><b>" + n + " unread message" + (n === 1 ? "" : "s") + "</b><small>Guests are waiting for your reply.</small></span>" + icon("chev_r") + "</button>" : "";
}
function initials(n){ return esc(String(n || "G").trim().charAt(0).toUpperCase()); }
function itemHtml(t, i){
  var pv = (t.last_sender === "host" ? "You: " : "") + (t.last_preview || "");
  var dates = t.check_in ? dshort(t.check_in) + (t.check_out ? " to " + dshort(t.check_out) : "") : "";
  return '<button type="button" class="hm-item' + (t.unread ? " unread" : "") + '" data-hmt="' + i + '"' + (S.cur === i ? ' aria-current="true"' : "") + '><span class="hm-av">' + initials(t.guest_name) + "</span><div>" +
    '<div class="r1"><b>' + esc(t.guest_name) + "</b><time>" + esc(t.last_message_at ? when(t.last_message_at) : "") + "</time></div>" +
    "<small>" + esc(t.listing_title) + (dates ? " · " + esc(dates) : "") + (t.booked ? '<span class="hm-tag">Booked</span>' : "") + "</small>" +
    '<small class="hm-pv">' + esc(pv) + (t.unread ? ' <span class="hm-dot">' + t.unread + "</span>" : "") + "</small></div></button>";
}
function renderList(){
  var L = $("#hmsList"); if (!L) return;
  var rows = S.threads.map(function(t, i){ return [t, i]; }).filter(function(x){ return S.filter === "all" || x[0].unread; });
  if (!S.threads.length){ L.innerHTML = '<div class="hm-none">' + icon("chat") + '<p style="margin-top:8px"><b>No messages yet</b></p><p>When a guest taps Message host on one of your listings, the conversation shows here. We also email you.</p></div>'; return; }
  if (!rows.length){ L.innerHTML = '<div class="hm-none">No unread messages.</div>'; return; }
  L.innerHTML = rows.map(function(x){ return itemHtml(x[0], x[1]); }).join("");
}
function msgHtml(m){ return '<div class="hm-m' + (m.mine ? " mine" : "") + '">' + esc(m.body).replace(/\n/g, "<br>") + (m.redacted ? '<span class="red">Contact details hidden until the guest books.</span>' : "") + "<time>" + esc(whenLong(m.created_at)) + "</time></div>"; }
function renderThread(j){
  var t = j.thread;
  var dates = t.check_in ? dshort(t.check_in) + (t.check_out ? " to " + dshort(t.check_out) : "") + (t.guests ? ", " + t.guests + " guest" + (t.guests === 1 ? "" : "s") : "") : "";
  $("#hmsPane").innerHTML = '<div class="hm-head"><button type="button" class="hm-back" data-hmback aria-label="Back to all messages">&#8249;</button><span class="hm-av">' + initials(t.guest_name) + "</span><div><b>" + esc(t.guest_name) + "</b><small>" +
    (t.listing_slug ? '<a href="/' + esc(t.listing_slug) + '" target="_blank" rel="noopener">' + esc(t.listing_title) + "</a>" : esc(t.listing_title)) + (dates ? " · " + esc(dates) : "") + (t.booked ? '<span class="hm-tag">Booked</span>' : "") + "</small></div></div>" +
    '<div class="hm-msgs" id="hmsMsgs" aria-live="polite">' + j.messages.map(msgHtml).join("") + "</div>" +
    '<form class="hm-reply" id="hmsReply"><label class="sr-only" for="hmsText">Reply to ' + esc(t.guest_name) + '</label><textarea id="hmsText" maxlength="2000" placeholder="Write a reply" required></textarea><button type="submit">Send</button></form>' +
    '<p class="hm-tip">The guest gets your reply by email' + (t.booked ? "" : ". Phone numbers and emails are hidden until they book") + '.</p><div id="hmsErr"></div>';
  var m = $("#hmsMsgs"); m.scrollTop = m.scrollHeight;
}
function open(i){
  var t = S.threads[i]; if (!t) return;
  S.cur = i; renderList(); $("#hmsGrid").classList.add("open");
  $("#hmsPane").innerHTML = '<div class="hm-none">Loading...</div>';
  api({action: "host_thread", id: t.id}).then(function(j){
    if (S.cur !== i) return;
    var had = t.unread; t.unread = 0; renderList(); renderThread(j);
    if (had) badge(S.threads.filter(function(x){ return x.unread; }).length);
    try { if (/^#messages/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }, function(e){ $("#hmsPane").innerHTML = '<div class="hm-err">' + esc(e.message) + "</div>"; });
}
function load(openId){
  if (openId) S.want = openId;
  if (S.busy) return Promise.resolve(); S.busy = true;
  return api({action: "host_list"}).then(function(j){
    S.busy = false; S.loaded = true;
    var openId = S.want; S.want = null;
    var curId = S.cur != null && S.threads[S.cur] ? S.threads[S.cur].id : null;
    S.threads = j.threads || [];
    S.cur = null; S.threads.forEach(function(t, i){ if (t.id === curId) S.cur = i; });
    badge(j.unread || 0); renderList();
    if (openId){ var k = -1; S.threads.forEach(function(t, i){ if (t.id === openId) k = i; }); if (k >= 0) open(k); }
    else if (S.cur == null && S.threads.length && window.matchMedia("(min-width: 861px)").matches && visible()) open(0);
  }, function(e){ S.busy = false; var L = $("#hmsList"); if (L && !S.loaded) L.innerHTML = '<div class="hm-err">' + esc(e.message) + "</div>"; });
}
function visible(){ var p = $("#panel-messages"); return p && !p.classList.contains("hidden"); }
function hashId(){ var m = /^#messages=([0-9a-f-]{36})$/i.exec(location.hash); return m ? m[1] : null; }

document.addEventListener("click", function(e){
  var t = e.target.closest && e.target.closest("[data-hmt]"); if (t){ open(+t.getAttribute("data-hmt")); return; }
  if (e.target.closest && e.target.closest("[data-hmback]")){ $("#hmsGrid").classList.remove("open"); S.cur = null; renderList(); return; }
  var f = e.target.closest && e.target.closest("[data-hmf]");
  if (f){ S.filter = f.getAttribute("data-hmf"); $$("[data-hmf]").forEach(function(b){ b.setAttribute("aria-pressed", b === f ? "true" : "false"); }); renderList(); return; }
  var tab = e.target.closest && e.target.closest('[data-tab="messages"]');
  if (tab){ inject(); load(); }
});
document.addEventListener("submit", function(e){
  if (e.target.id !== "hmsReply") return; e.preventDefault();
  var t = S.threads[S.cur], ta = $("#hmsText"), b = e.target.querySelector("button"), body = ta.value.trim();
  if (!t || body.length < 2) return;
  b.disabled = true; b.textContent = "Sending...";
  api({action: "host_reply", id: t.id, body: body}).then(function(j){
    b.disabled = false; b.textContent = "Send"; ta.value = ""; $("#hmsErr").innerHTML = "";
    $("#hmsMsgs").insertAdjacentHTML("beforeend", msgHtml(j.message)); $("#hmsMsgs").scrollTop = 1e9;
    t.last_preview = j.message.body; t.last_sender = "host"; t.last_message_at = j.message.created_at;
    var cur = S.threads.splice(S.cur, 1)[0]; S.threads.unshift(cur); S.cur = 0; renderList();
  }, function(err){ b.disabled = false; b.textContent = "Send"; $("#hmsErr").innerHTML = '<div class="hm-err">' + esc(err.message) + "</div>"; });
});
document.addEventListener("keydown", function(e){
  if (e.target && e.target.id === "hmsText" && e.key === "Enter" && (e.ctrlKey || e.metaKey)){ e.preventDefault(); var f = $("#hmsReply"); if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", {cancelable: true, bubbles: true})); }
});

// Dashboard loaded (host.js fires bh:host "me"): fetch threads once for the badge and Today card; open an emailed link.
var started = false;
document.addEventListener("bh:host", function(e){
  if (!e.detail || e.detail.type !== "me" || started) return;
  started = true; inject();
  var id = hashId();
  if (id){ var b = $('.hp-top nav.tabs button[data-tab="messages"], [data-tab="messages"]'); if (b) b.click(); }
  load(id);
});
window.addEventListener("hashchange", function(){ var id = hashId(); if (id && started){ var b = $('[data-tab="messages"]'); if (b) b.click(); load(id); } });
// Keep the badge fresh while the page is open (every 60s when visible)
setInterval(function(){ if (started && !document.hidden) load(); }, 60000);
document.addEventListener("visibilitychange", function(){ if (started && !document.hidden) load(); });
})();
