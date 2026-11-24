/* Book Homes admin: the owner's daily tools (23 Nov 2026).
   - Overview: a "Today" card (arrivals, departures, unread guest messages, approvals, this month's revenue and commission).
   - Listings: filter, search, select and bulk act; a listing panel with approve / request changes / reject (reason emailed),
     pause / unpause, feature on the homepage, edit any field, and the listing's history.
   - Bookings: server search and filters (status, dates, home, guest), a booking panel with Stripe payment status and link,
     cancel with a full, policy, partial or no refund, resend confirmation, notes, history, and CSV export of the filtered list.
   - Payouts: due / scheduled / paid lists with Mark paid, and what Stripe has paid out from each connected host account.
   - Settings: commission by host type (standard, kosher) and which hosts are kosher hosts.
   Everything goes through bookhomes-admin (admin + 2-step checked on the server, every change audit-logged).
   Needs window.BHAdmin.api (and .refresh) from admin/index.html. The old cards stay in the page, hidden. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
var $$ = function(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format((+p || 0) / 100); }
var fmtD = new Intl.DateTimeFormat("en-GB", {weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC"});
function dfmt(s){ return s ? fmtD.format(new Date(String(s).slice(0, 10) + "T00:00:00Z")) : "-"; }
var fmtT = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London"});
function tfmt(s){ return s ? fmtT.format(new Date(s)) : "-"; }
function api(body){ if (!window.BHAdmin) return Promise.reject(new Error("Admin is still loading.")); return window.BHAdmin.api(body); }
function refreshAll(){ if (window.BHAdmin && window.BHAdmin.refresh) try { window.BHAdmin.refresh(); } catch (e) {} }
function toast(t, ms){ var o = $(".toast"); if (o) o.remove(); var d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); setTimeout(function(){ d.remove(); }, ms || 4500); }
function closeModal(){ var m = $(".modal"); if (m) m.remove(); }
function modal(html, onSubmit){
  closeModal();
  var m = document.createElement("div"); m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
  m.innerHTML = html; document.body.appendChild(m);
  m.addEventListener("click", function(e){ if (e.target === m || e.target.closest("[data-close]")) closeModal(); });
  var f = $("form", m); if (f && onSubmit) f.addEventListener("submit", function(e){ e.preventDefault(); onSubmit(f, m); });
  var first = $("textarea,input:not([type=hidden]),select", m) || $("button", m); if (first) first.focus();
  return m;
}
function formErr(f, msg){ var e = $(".err", f); if (!e){ e = document.createElement("div"); e.className = "err"; $(".foot", f).insertAdjacentElement("beforebegin", e); } e.textContent = msg; }
function closePanel(){ $$(".drawer").forEach(function(d){ d.remove(); }); }
function panel(title){
  closePanel();
  var d = document.createElement("div"); d.className = "drawer"; d.setAttribute("role", "dialog"); d.setAttribute("aria-modal", "true"); d.setAttribute("aria-label", title);
  d.innerHTML = '<div class="hp ao"><div class="dh"><b>' + esc(title) + '</b><button type="button" class="x" aria-label="Close">&times;</button></div><div class="aob"><p class="zero">Loading...</p></div></div>';
  document.body.appendChild(d);
  d.addEventListener("click", function(e){ if (e.target === d || e.target.closest(".x")) closePanel(); });
  $(".x", d).focus();
  return $(".aob", d);
}
function kv(k, v){ return "<dt>" + k + "</dt><dd>" + (v === "" || v == null ? '<span class="muted">-</span>' : v) + "</dd>"; }
function badge(cls, t){ return '<span class="badge ' + cls + '">' + esc(t) + "</span>"; }
var ACT = {approve_listing: "Approved", reject_listing: "Rejected", request_changes: "Asked for changes", pause_listing: "Paused", unpause_listing: "Unpaused",
  feature_listing: "Featured on homepage", unfeature_listing: "Removed from homepage", edit_listing: "Edited by admin", delete_listing: "Deleted", rebuild_site: "Site rebuilt",
  bulk_listings: "Bulk action", cancel_booking: "Cancelled", release_hold: "Hold released", resend_confirmation: "Confirmation resent", booking_note: "Note",
  submit_listing: "Submitted by host", status_change: "Status changed"};
function histHtml(rows){
  if (!rows || !rows.length) return '<p class="muted">Nothing yet.</p>';
  return '<div class="aoh">' + rows.map(function(a){
    var d = a.details || {}, bits = [];
    if (d.reason) bits.push("Reason: " + esc(d.reason));
    if (d.note) bits.push(esc(d.note));
    if (d.from && d.to && typeof d.from === "string") bits.push(esc(d.from) + " to " + esc(d.to));
    if (d.op) bits.push(esc(ACT[d.op] || d.op));
    if (d.changes) bits.push("Changed " + Object.keys(d.changes).map(function(k){ var c = d.changes[k]; return esc(k) + (typeof c.to !== "object" ? " (" + esc(String(c.from == null ? "-" : c.from).slice(0, 40)) + " to " + esc(String(c.to == null ? "-" : c.to).slice(0, 40)) + ")" : ""); }).join(", "));
    if (d.refund_pence != null) bits.push("Refund " + money(d.refund_pence));
    return '<div><b>' + esc(ACT[a.action] || a.action.replace(/_/g, " ")) + '</b><small>' + esc(tfmt(a.at)) + " · " + esc(a.actor_email || "system") + "</small>" + (bits.length ? "<p>" + bits.join(" · ") + "</p>" : "") + "</div>";
  }).join("") + "</div>";
}
function download(name, text){
  var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], {type: "text/csv;charset=utf-8"})); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function csvCall(body, name){
  // BHAdmin.api reads JSON, so ask for the rows as JSON (same filters as on screen) and build the CSV here.
  return api(body).then(function(j){
    var rows = j.rows || [];
    if (!rows.length){ toast("Nothing to export."); return; }
    var cols = Object.keys(rows[0]);
    var cell = function(v){ var t = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    download(name, [cols.join(",")].concat(rows.map(function(r){ return cols.map(function(c){ return cell(r[c]); }).join(","); })).join("\r\n") + "\r\n");
  });
}
function ukToday(){ return new Intl.DateTimeFormat("en-CA", {timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit"}).format(new Date()); }
function addDays(s, n){ var d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

/* ---------- styles (admin/index.html has the base: .card .item .btn .badge .chips .modal .drawer .hp .kv) ---------- */
var css = document.createElement("style");
css.textContent = [
  ".ao-today{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}",
  ".ao-today a,.ao-today button{display:flex;flex-direction:column;align-items:flex-start;text-align:left;background:#fff;border:1px solid var(--line);border-radius:12px;padding:12px 14px;text-decoration:none;color:var(--ink);font:inherit;min-height:84px}",
  ".ao-today a:hover,.ao-today button:hover{border-color:var(--ink)}",
  "@media (max-width:759px){.ao-today{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.ao-today a,.ao-today button{padding:10px}}",
  ".ao-today small{font-size:12.5px;color:var(--muted);font-weight:600}.ao-today b{font-size:24px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.2;margin-top:2px}.ao-today span{font-size:12px;color:var(--muted)}",
  ".ao-today .hot{border-color:var(--accent);background:var(--accent-tint)}.ao-today .hot b{color:var(--accent-ink)}",
  ".ao-mv{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 2px;border-bottom:1px solid var(--line-2);font-size:14px}",
  ".ao-mv:last-child{border-bottom:0}.ao-mv small{display:block;color:var(--muted);font-size:12.5px}",
  ".ao-k{font-size:11.5px;font-weight:700;border-radius:999px;padding:3px 9px;text-align:center;background:var(--soft);color:var(--ink-2)}",
  ".ao-k.arrival{background:var(--brand-tint);color:var(--brand)}.ao-k.departure{background:#e8f0fb;color:#1d4f91}.ao-k.tomorrow{background:var(--accent-tint);color:var(--accent-ink)}",
  ".ao-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 12px;border-radius:12px;background:var(--soft);margin-bottom:10px}",
  ".ao-bar b{margin-right:4px;font-size:14px}",
  ".ao-f{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.ao-f select,.ao-f input{height:40px;border:1px solid #c4c4c4;border-radius:8px;padding:0 10px;background:#fff;font-size:14px;max-width:100%}",
  ".ao-f label{display:flex;flex-direction:column;font-size:12px;font-weight:600;color:var(--muted);gap:3px}",
  ".ao-row{display:grid;grid-template-columns:28px 72px minmax(0,1fr) auto;gap:12px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--line-2);cursor:pointer}",
  ".ao-row:hover{background:var(--soft)}.ao-row:last-child{border-bottom:0}",
  ".ao-row img,.ao-row .ph0{width:72px;height:56px;border-radius:10px;object-fit:cover;background:var(--soft);display:grid;place-items:center;font-size:11px;color:var(--muted)}",
  ".ao-row b{display:block;font-size:14.5px}.ao-row small{display:block;font-size:12.5px;color:var(--muted)}",
  ".ao-row input[type=checkbox],.ao-all input{width:18px;height:18px;accent-color:var(--brand)}",
  ".ao-row .rt{display:flex;flex-direction:column;align-items:flex-end;gap:4px;text-align:right}",
  ".ao-star{color:#b7791f;font-weight:700;font-size:12px}",
  ".ao-bk{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:12px 4px;border-bottom:1px solid var(--line-2);cursor:pointer}",
  ".ao-bk:hover{background:var(--soft)}.ao-bk b{font-size:14.5px}.ao-bk small{display:block;color:var(--muted);font-size:12.5px}.ao-bk .rt{text-align:right}",
  ".ao-strip{display:flex;gap:6px;overflow-x:auto;margin:0 0 12px}.ao-strip img{height:84px;border-radius:10px}",
  ".ao .ha{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:6px}.ao .ha .btn{width:100%}.ao .ha .wide{grid-column:1/-1}",
  ".aoh>div{padding:9px 0;border-bottom:1px solid var(--line-2);font-size:13.5px}.aoh small{display:block;color:var(--muted);font-size:12px}.aoh p{margin-top:2px;color:var(--ink-2);word-break:break-word}",
  ".ao-ed{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}.ao-ed .full{grid-column:1/-1}",
  ".ao-ed textarea,.modal textarea{display:block;width:100%;margin-top:6px;font-size:15px;padding:10px 12px;border:1px solid #c4c4c4;border-radius:8px;min-height:90px;font-family:inherit}",
  ".ao-pay{display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-2);font-size:13.5px}",
  ".ao-calc{background:var(--soft);border-radius:10px;padding:10px 12px;font-size:14px;margin:6px 0 12px}.ao-calc div{display:flex;justify-content:space-between;padding:2px 0}",
  ".ao-ht{display:grid;grid-template-columns:minmax(0,1fr) 130px 70px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2);font-size:14px}",
  ".ao-ht select{height:38px;border:1px solid #c4c4c4;border-radius:8px;padding:0 8px;background:#fff}.ao-ht small{display:block;color:var(--muted);font-size:12px}",
  ".ao-more{display:block;margin:12px auto 0}",
  "@media (max-width:640px){.ao-row{grid-template-columns:24px 56px minmax(0,1fr)}.ao-row .rt{grid-column:3;align-items:flex-start;text-align:left;flex-direction:row;flex-wrap:wrap}.ao-row img,.ao-row .ph0{width:56px;height:48px}.ao-ed{grid-template-columns:1fr}.ao-mv{grid-template-columns:84px minmax(0,1fr)}.ao-mv .rt{grid-column:2}.ao-ht{grid-template-columns:minmax(0,1fr) 110px}.ao-ht .pc{grid-column:1/-1}}"
].join("\n");
document.head.appendChild(css);

/* ---------- show hooks: run a loader when a panel becomes visible ---------- */
var HOOKS = {};
function visible(name){ var s = $('section[data-panel="' + name + '"]'); var app = $("#viewApp"); return s && !s.classList.contains("hidden") && (!app || !app.classList.contains("hidden")); }
function onShow(name, fn){
  HOOKS[name] = fn;
  var s = $('section[data-panel="' + name + '"]'); if (!s) return;
  new MutationObserver(function(){ if (visible(name)) fn(); }).observe(s, {attributes: true, attributeFilter: ["class"]});
}
var app = $("#viewApp");
if (app) new MutationObserver(function(){ Object.keys(HOOKS).forEach(function(n){ if (visible(n)) HOOKS[n](); }); }).observe(app, {attributes: true, attributeFilter: ["class"]});

/* =====================================================================================================
   Overview: Today
   ===================================================================================================== */
var DASH_AT = 0;
function dashCard(){
  var sec = $('section[data-panel="mpover"]'); if (!sec) return null;
  var c = $("#aoToday");
  if (!c){
    c = document.createElement("div"); c.id = "aoToday";
    c.innerHTML = '<h3 class="sh" style="margin-top:0">Today</h3><div class="ao-today" id="aoTodayStats"><button type="button"><small>Loading</small><b>...</b></button></div><div class="card hidden" id="aoMovesCard"><div class="ch"><h2>Arrivals and departures</h2></div><div id="aoMoves"></div></div>';
    sec.insertBefore(c, sec.firstChild);
    var h = $$("h3.sh", sec).filter(function(x){ return !c.contains(x); })[0]; if (h) h.style.marginTop = "18px";
  }
  return c;
}
function loadDash(force){
  if (!dashCard()) return;
  if (!force && Date.now() - DASH_AT < 60000) return;
  DASH_AT = Date.now();
  api({action: "dashboard"}).then(function(j){
    var mv = j.moves || [], p = j.pending || {}, m = j.msg || j.messages || {}, mo = j.month || {};
    var arr = mv.filter(function(x){ return x.kind === "arrival"; }), dep = mv.filter(function(x){ return x.kind === "departure"; });
    var stay = mv.filter(function(x){ return x.kind === "staying"; }), tom = mv.filter(function(x){ return x.kind === "tomorrow"; });
    var approvals = (p.listings || 0) + (p.hosts || 0);
    var mName = new Intl.DateTimeFormat("en-GB", {month: "long"}).format(new Date());
    var t = function(lbl, val, sub, attrs, hot){ return "<" + (attrs.indexOf("href") === 0 ? "a " : 'button type="button" ') + attrs + (hot ? ' class="hot"' : "") + "><small>" + lbl + "</small><b>" + val + "</b><span>" + sub + "</span></" + (attrs.indexOf("href") === 0 ? "a" : "button") + ">"; };
    $("#aoTodayStats").innerHTML =
      t("Arrivals today", arr.length, tom.length ? tom.length + " tomorrow" : "None tomorrow", 'data-aomv="1"', false) +
      t("Departures today", dep.length, stay.length + " staying tonight", 'data-aomv="1"', false) +
      t("Unread messages", m.unread || 0, (m.threads || 0) + " conversation" + (m.threads === 1 ? "" : "s") + (m.waiting_over_day ? ", " + m.waiting_over_day + " over a day" : ""), 'href="/admin/messages/"', (m.waiting_over_day || 0) > 0) +
      ""; /* approvals, payouts and this month's money are in "Needs you" and "This month" just below, so they are not repeated here */
    var list = arr.concat(dep, tom);
    $("#aoMovesCard").classList.toggle("hidden", !list.length);
    var lbl = {arrival: "Arriving", departure: "Leaving", tomorrow: "Tomorrow"};
    $("#aoMoves").innerHTML = list.map(function(b){
      var ph = String(b.guest_phone || "").replace(/[^\d+]/g, "");
      return '<div class="ao-mv"><span class="ao-k ' + esc(b.kind) + '">' + lbl[b.kind] + '</span><span><b>' + esc(b.guest_name || "Guest") + "</b> · " + esc(b.listing_title) +
        "<small>" + dfmt(b.check_in) + " to " + dfmt(b.check_out) + " · " + (b.guests || 1) + " guest" + (b.guests === 1 ? "" : "s") + (b.source === "zermatt" ? " · Zermatt system" : "") + "</small></span>" +
        '<span class="rt">' + (ph ? '<a class="btn ghost sm" href="tel:' + esc(ph) + '">Call</a> ' : "") + '<button type="button" class="btn ghost sm" data-aobk="' + esc(b.id) + '">Open</button></span></div>';
    }).join("");
  }).catch(function(e){ $("#aoTodayStats").innerHTML = '<div class="err">Today: ' + esc(e.message) + "</div>"; DASH_AT = 0; });
}
document.addEventListener("click", function(e){ var b = e.target.closest && e.target.closest("[data-aomv]"); if (b){ var c = $("#aoMovesCard"); if (c && !c.classList.contains("hidden")) c.scrollIntoView({behavior: "smooth", block: "start"}); else toast("No arrivals or departures today."); } });
onShow("mpover", function(){ loadDash(false); });

/* =====================================================================================================
   Listings
   ===================================================================================================== */
var LS = {rows: null, f: "pending", q: "", sel: {}};
var LST = {draft: ["half plain", "Draft"], pending: ["wait", "Waiting for approval"], approved: ["ok", "Live"], rejected: ["bad", "Changes asked"], paused: ["not", "Paused"], archived: ["del", "Deleted"]};
var LF = [["pending", "Waiting"], ["", "All"], ["approved", "Live"], ["featured", "Featured"], ["edited", "Edited since approval"], ["paused", "Paused"], ["rejected", "Changes asked"], ["draft", "Drafts"], ["archived", "Deleted"]];
function lsCard(){
  var sec = $('section[data-panel="mplistings"]'); if (!sec) return null;
  var c = $("#aoLs");
  if (!c){
    $$(".card", sec).forEach(function(x){ x.classList.add("hidden"); });
    c = document.createElement("div"); c.className = "card"; c.id = "aoLs";
    c.innerHTML = '<div class="tools"><input type="search" id="aoLsQ" placeholder="Search title, area, host email or #id" aria-label="Search listings"><button type="button" class="btn ghost sm" id="aoLsCsv">Export CSV</button></div>' +
      '<div class="chips" id="aoLsChips" role="group" aria-label="Show listings"></div>' +
      '<div class="ao-bar hidden" id="aoLsBar"><b id="aoLsN"></b>' +
        '<button type="button" class="btn sm" data-bulk="approve_listing">Approve</button><button type="button" class="btn ghost sm" data-bulk="request_changes">Request changes</button>' +
        '<button type="button" class="btn ghost sm" data-bulk="pause_listing">Pause</button><button type="button" class="btn ghost sm" data-bulk="unpause_listing">Unpause</button>' +
        '<button type="button" class="btn ghost sm" data-bulk="feature_listing">Feature</button><button type="button" class="btn ghost sm" data-bulk="unfeature_listing">Unfeature</button>' +
        '<button type="button" class="btn red sm" data-bulk="reject_listing">Reject</button><button type="button" class="btn ghost sm" id="aoLsClear">Clear</button></div>' +
      '<label class="ao-all muted" style="display:flex;gap:8px;align-items:center;font-size:13px;padding:4px"><input type="checkbox" id="aoLsAll"> Select all shown</label>' +
      '<div id="aoLsList" aria-live="polite"><p class="zero">Loading...</p></div>';
    sec.appendChild(c);
    $("#aoLsQ").addEventListener("input", function(){ LS.q = this.value.trim().toLowerCase(); drawLs(); });
    $("#aoLsAll").addEventListener("change", function(){ var on = this.checked; lsShown().forEach(function(l){ if (on) LS.sel[l.id] = true; else delete LS.sel[l.id]; }); drawLs(); });
    $("#aoLsClear").addEventListener("click", function(){ LS.sel = {}; drawLs(); });
    $("#aoLsCsv").addEventListener("click", function(){ csvCall({action: "list_listings", limit: 500}, "bookhomes-listings-" + ukToday() + ".csv").catch(function(e){ toast(e.message); }); });
    c.addEventListener("click", function(e){
      var ch = e.target.closest("#aoLsChips button"); if (ch){ LS.f = ch.getAttribute("data-v"); LS.sel = {}; drawLs(); return; }
      var bb = e.target.closest("[data-bulk]"); if (bb){ bulk(bb.getAttribute("data-bulk")); return; }
      if (e.target.matches("input[type=checkbox][data-sel]")){ var id = e.target.getAttribute("data-sel"); if (e.target.checked) LS.sel[id] = true; else delete LS.sel[id]; drawLs(); return; }
      var r = e.target.closest(".ao-row"); if (r && !e.target.closest("a,input,label")) openListing(+r.getAttribute("data-id"));
    });
  }
  return c;
}
function lsMatch(l, f){
  if (l.legacy_source && f !== "" && f !== "approved") return false;
  if (f === "") return l.status !== "archived";
  if (f === "featured") return !!l.featured;
  if (f === "edited") return l.edited_since_approval && l.status === "approved";
  return l.status === f;
}
function lsShown(){
  if (!LS.rows) return [];
  return LS.rows.filter(function(l){
    if (!lsMatch(l, LS.f)) return false;
    if (!LS.q) return true;
    return ("#" + l.id + " " + [l.title, l.area, l.city, l.slug, l.host_name, l.host_email].join(" ")).toLowerCase().indexOf(LS.q) >= 0;
  });
}
function drawLs(){
  if (!LS.rows || !lsCard()) return;
  $("#aoLsChips").innerHTML = LF.map(function(f){ var n = LS.rows.filter(function(l){ return lsMatch(l, f[0]); }).length;
    return '<button type="button" data-v="' + f[0] + '" aria-pressed="' + (f[0] === LS.f) + '">' + esc(f[1]) + "<i>" + n + "</i></button>"; }).join("");
  var rows = lsShown(), nSel = Object.keys(LS.sel).length;
  $("#aoLsBar").classList.toggle("hidden", !nSel);
  $("#aoLsN").textContent = nSel + " selected";
  $("#aoLsAll").checked = rows.length > 0 && rows.every(function(l){ return LS.sel[l.id]; });
  $("#aoLsList").innerHTML = rows.length ? rows.map(function(l){
    var st = LST[l.status] || ["not", l.status];
    return '<div class="ao-row" data-id="' + esc(l.id) + '">' +
      (l.legacy_source ? "<span></span>" : '<input type="checkbox" data-sel="' + esc(l.id) + '" aria-label="Select ' + esc(l.title) + '"' + (LS.sel[l.id] ? " checked" : "") + ">") +
      (l.cover ? '<img src="' + esc(l.cover) + '" alt="" loading="lazy">' : '<i class="ph0">No photo</i>') +
      "<span><b>" + esc(l.title || "Untitled") + ' <span class="muted" style="font-weight:500">#' + esc(l.id) + "</span></b><small>" + esc([l.area, l.city].filter(Boolean).join(", ")) + " · " + esc(l.host_name || l.host_email || "") +
      (l.base_price ? " · £" + esc(Math.round(l.base_price)) + " a night" : "") + " · " + (l.photos || 0) + " photos</small>" +
      (l.reject_reason && l.status === "rejected" ? "<small>Note to host: " + esc(String(l.reject_reason).slice(0, 120)) + "</small>" : "") + "</span>" +
      '<span class="rt">' + badge(st[0], st[1]) + (l.featured ? '<span class="ao-star">Featured</span>' : "") + (l.edited_since_approval && l.status === "approved" ? '<span class="ao-star" style="color:var(--accent-ink)">Edited</span>' : "") + (l.legacy_source ? '<small>Zermatt system</small>' : "") + "</span></div>";
  }).join("") : '<p class="zero">Nothing here.</p>';
}
function loadLs(){
  if (!lsCard()) return Promise.resolve();
  return api({action: "list_listings", limit: 500}).then(function(j){ LS.rows = j.rows || []; drawLs(); })
    .catch(function(e){ $("#aoLsList").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
onShow("mplistings", loadLs);
/* overview cards that point at a filtered Listings tab ("Waiting for approval", "edited since approval") */
document.addEventListener("click", function(e){
  var g = e.target.closest && e.target.closest('[data-go="mplistings"]'); if (!g) return;
  var lf = g.getAttribute("data-lf"); if (lf != null){ LS.f = lf; LS.sel = {}; drawLs(); }
}, true);

var REASON = {
  request_changes: ["Request changes", "Tell the host what to change. This is emailed to them and the listing goes back to them to edit and submit again.", "Please remove the street address from the description.", true],
  reject_listing: ["Reject listing", "Say why. The reason is emailed to the host. They can still edit and submit again.", "", true],
  pause_listing: ["Pause listing", "Guests can't find or book it while it's paused. Existing bookings are kept. The host gets an email; add a reason if you like.", "", false]
};
function withReason(op, count, go){
  var r = REASON[op];
  if (!r) return go(null);
  modal('<form novalidate><h2>' + esc(r[0]) + (count > 1 ? " (" + count + " listings)" : "") + "</h2><p>" + esc(r[1]) + '</p><label class="f">' + (r[3] ? "Reason (sent to the host)" : "Reason (optional, sent to the host)") +
    '<textarea name="reason" maxlength="600">' + esc(r[2]) + '</textarea></label><div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn' + (op === "reject_listing" ? " red" : "") + '" type="submit">' + esc(r[0]) + "</button></div></form>",
    function(f){ var v = f.elements.reason.value.trim(); if (r[3] && !v){ formErr(f, "Write a reason first."); return; } $("button[type=submit]", f).disabled = true; go(v, f); });
}
var CONFIRM = {approve_listing: "Approve and publish? Check photos and text for street addresses first.", unpause_listing: "Put it back on the site?", feature_listing: "Show first on the homepage?", unfeature_listing: "Remove from the homepage's featured spots?"};
function bulk(op){
  var ids = Object.keys(LS.sel).map(Number);
  if (!ids.length) return;
  var run = function(reason, f){
    api({action: "bulk_listings", op: op, ids: ids, reason: reason}).then(function(j){
      closeModal(); LS.sel = {};
      toast((j.done || []).length + " done" + ((j.failed || []).length ? ", " + j.failed.length + " skipped: " + j.failed.map(function(x){ return "#" + x.id + " " + x.error; }).join("; ") : "") + (j.rebuilt ? ". Site rebuilding." : "."), 9000);
      loadLs(); refreshAll(); DASH_AT = 0;
    }).catch(function(e){ if (f){ formErr(f, e.message); $("button[type=submit]", f).disabled = false; } else toast(e.message); });
  };
  if (REASON[op]) withReason(op, ids.length, run);
  else if (confirm((CONFIRM[op] || "Go ahead?") + "\n\n" + ids.length + " listing" + (ids.length === 1 ? "" : "s") + " selected.")) run(null);
}

var LD = null;
var EDIT = [["title", "Title", "text", 80], ["area", "Area (no street address)", "text", 80], ["city", "City", "text", 60],
  ["property_type", "Type", "select", ["house", "flat", "cottage", "townhouse", "bungalow", "studio", "room"]],
  ["max_guests", "Max guests", "number", [1, 30, 1]], ["bedrooms", "Bedrooms", "number", [0, 30, 1]], ["beds", "Beds", "number", [0, 50, 1]], ["baths", "Bathrooms", "number", [0, 20, 0.5]],
  ["base_price", "Base price a night (£)", "number", [10, 10000, 1]], ["weekend_price", "Fri/Sat price (£, blank = base)", "number", [10, 10000, 1]], ["cleaning_fee", "Cleaning fee (£)", "number", [0, 2000, 1]],
  ["weekly_discount_pct", "Weekly discount %", "number", [0, 50, 1]], ["monthly_discount_pct", "Monthly discount %", "number", [0, 60, 1]],
  ["min_nights", "Minimum nights", "number", [1, 90, 1]], ["max_nights", "Maximum nights", "number", [1, 365, 1]],
  ["cancellation_policy", "Cancellation policy", "select", ["flexible", "moderate", "strict"]],
  ["check_in_time", "Check-in from", "time"], ["check_out_time", "Check-out by", "time"],
  ["description", "Description", "textarea", 5000], ["house_rules", "House rules", "textarea", 2500]];
function openListing(id){
  var body = panel("Listing");
  return api({action: "listing_detail", id: id}).then(function(j){ LD = j; drawListing(); })
    .catch(function(e){ body.innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function drawListing(){
  var body = $(".ao .aob"); if (!body || !LD) return;
  var l = LD.listing, st = LST[l.status] || ["not", l.status], site = LD.site || "https://bookhomes.co.uk", legacy = !!l.legacy_source;
  var B = function(op, label, cls){ return '<button type="button" class="btn ' + (cls || "ghost") + '" data-lop="' + op + '">' + label + "</button>"; };
  var acts = [];
  if (!legacy && l.status !== "archived"){
    if (l.status !== "approved" && l.status !== "paused") acts.push(B("approve_listing", "Approve and publish", "wide"));
    if (l.status === "paused") acts.push(B("unpause_listing", "Unpause", "wide"));
    acts.push(B("request_changes", "Request changes"));
    acts.push(B("reject_listing", "Reject", "red"));
    if (l.status === "approved" || l.status === "pending") acts.push(B("pause_listing", "Pause"));
    if (l.status === "approved") acts.push(B(l.featured ? "unfeature_listing" : "feature_listing", l.featured ? "Remove from homepage" : "Feature on homepage"));
    acts.push(B("edit", "Edit details"));
  }
  if (l.status === "approved" && l.slug) acts.push('<a class="btn ghost" href="' + esc(site) + "/" + esc(l.slug) + '" target="_blank" rel="noopener">View page</a>');
  if (l.host_user_id && window.BH_OPEN_HOST) acts.push('<button type="button" class="btn ghost" data-lop="host">Open host</button>');
  if (!legacy && l.status !== "archived") acts.push(B("delete_listing", "Delete", "red"));
  body.innerHTML =
    '<div class="hh" style="margin-bottom:10px"><span><b>' + esc(l.title || "Untitled") + '</b><small>#' + esc(l.id) + " · " + esc([l.area, l.city].filter(Boolean).join(", ")) + "</small></span></div>" +
    '<div class="bd">' + badge(st[0], st[1]) + (l.featured ? badge("ok plain", "Featured on homepage") : "") + (l.host_approved ? "" : badge("wait plain", "Host not approved yet")) + (legacy ? badge("not plain", "Zermatt Lodge system") : "") + "</div>" +
    (LD.photos.length ? '<div class="ao-strip">' + LD.photos.slice(0, 20).map(function(p){ return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener"><img src="' + esc(p.thumb_url || p.url) + '" alt="" loading="lazy"></a>'; }).join("") + "</div>" : '<p class="muted">No photos.</p>') +
    '<div class="ha">' + acts.join("") + "</div>" +
    "<h3>Details</h3><dl class=\"kv\">" +
      kv("Host", esc(l.host_name || "") + (l.host_email ? '<br><a href="mailto:' + esc(l.host_email) + '">' + esc(l.host_email) + "</a>" : "")) +
      kv("Sleeps", esc(l.max_guests) + " guests · " + esc(l.bedrooms) + " bedrooms · " + esc(l.beds) + " beds · " + esc(l.baths) + " baths") +
      kv("Price", l.base_price ? "£" + esc(l.base_price) + " a night" + (l.weekend_price ? ", £" + esc(l.weekend_price) + " Fri/Sat" : "") + " · cleaning £" + esc(l.cleaning_fee || 0) : "") +
      kv("Stays", esc(l.min_nights) + " to " + esc(l.max_nights) + " nights · " + esc(l.cancellation_policy || "") + " cancellation") +
      kv("Map pin", l.lat != null ? esc(l.lat) + ", " + esc(l.lng) : "Not set") +
      kv("Bookings", (LD.bookings.paid || 0) + " paid" + (LD.bookings.upcoming ? ", " + LD.bookings.upcoming + " upcoming" : "")) +
      kv("Submitted", l.submitted_at ? esc(tfmt(l.submitted_at)) : "") + kv("Approved", l.approved_at ? esc(tfmt(l.approved_at)) + (l.reviewed_by ? " by " + esc(l.reviewed_by) : "") : "") +
      kv("Last note to host", l.reject_reason ? esc(l.reject_reason) : "") +
    "</dl>" +
    '<details style="margin-top:10px"><summary class="m">Description and house rules</summary><p class="m" style="white-space:pre-line">' + esc(l.description || "") + "\n\nRules: " + esc(l.house_rules || "-") + "</p></details>" +
    "<h3>History</h3>" + histHtml(LD.history);
}
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("[data-lop]"); if (!b || !LD) return;
  var op = b.getAttribute("data-lop"), l = LD.listing;
  if (op === "host"){ closePanel(); window.BH_OPEN_HOST(l.host_user_id); return; }
  if (op === "edit"){ editListing(); return; }
  var after = function(j){ closeModal(); toast(j && j.rebuilt ? "Saved. The site is rebuilding (about a minute)." : "Saved."); loadLs(); refreshAll(); DASH_AT = 0; openListing(l.id); };
  var fail = function(f){ return function(e){ if (f){ formErr(f, e.message); var s = $("button[type=submit]", f); if (s) s.disabled = false; } else { b.disabled = false; toast(e.message, 7000); } }; };
  if (op === "delete_listing"){
    if (!confirm("Delete this listing?\n\nNever booked or approved: deleted for good.\nOtherwise: archived and hidden, bookings and reviews kept.\nPhotos are removed from storage. This can't be undone.")) return;
    b.disabled = true; api({action: "delete_listing", id: l.id}).then(function(){ closePanel(); toast("Listing deleted."); loadLs(); refreshAll(); }).catch(fail(null)); return;
  }
  if (op === "feature_listing" || op === "unfeature_listing"){
    b.disabled = true; api({action: "feature_listing", id: l.id, featured: op === "feature_listing"}).then(after).catch(fail(null)); return;
  }
  if (REASON[op]){ withReason(op, 1, function(reason, f){ api({action: op, id: l.id, reason: reason}).then(after).catch(fail(f)); }); return; }
  if (CONFIRM[op] && !confirm(CONFIRM[op])) return;
  b.disabled = true; api({action: op, id: l.id}).then(after).catch(fail(null));
});
function editListing(){
  var l = LD.listing;
  var field = function(d){
    var k = d[0], v = l[k] == null ? "" : l[k], cls = d[2] === "textarea" ? ' class="f full"' : ' class="f"';
    if (d[2] === "select") return "<label" + cls + ">" + esc(d[1]) + '<select name="' + k + '">' + d[3].map(function(o){ return "<option" + (String(v) === o ? " selected" : "") + ">" + o + "</option>"; }).join("") + "</select></label>";
    if (d[2] === "textarea") return "<label" + cls + ">" + esc(d[1]) + '<textarea name="' + k + '" maxlength="' + d[3] + '" rows="6">' + esc(v) + "</textarea></label>";
    if (d[2] === "number") return "<label" + cls + ">" + esc(d[1]) + '<input type="number" name="' + k + '" min="' + d[3][0] + '" max="' + d[3][1] + '" step="' + d[3][2] + '" value="' + esc(v) + '"></label>';
    if (d[2] === "time") return "<label" + cls + ">" + esc(d[1]) + '<input type="time" name="' + k + '" value="' + esc(String(v).slice(0, 5)) + '"></label>';
    return "<label" + cls + ">" + esc(d[1]) + '<input type="text" name="' + k + '" maxlength="' + d[3] + '" value="' + esc(v) + '"></label>';
  };
  modal('<form novalidate style="width:min(720px,100%)"><h2>Edit listing #' + esc(l.id) + "</h2><p>Changes go live straight away" + (l.status === "approved" ? " and the site rebuilds" : "") + ". The host sees them in their editor. Every change is logged with the old and new value.</p>" +
    '<div class="ao-ed">' + EDIT.map(field).join("") + '</div><div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save changes</button></div></form>',
    function(f){
      var out = {};
      EDIT.forEach(function(d){
        var el = f.elements[d[0]]; if (!el) return;
        var v = el.value, old = l[d[0]] == null ? "" : String(l[d[0]]);
        if (d[2] === "time") old = old.slice(0, 5);
        if (d[2] === "number" ? (v === "" ? old !== "" : old === "" || +v !== +old) : v !== old) out[d[0]] = d[2] === "number" ? (v === "" ? null : +v) : v;
      });
      if (!Object.keys(out).length){ closeModal(); toast("No changes."); return; }
      $("button[type=submit]", f).disabled = true;
      api({action: "edit_listing", id: l.id, listing: out}).then(function(j){ closeModal(); toast((j.changed || []).length + " field" + ((j.changed || []).length === 1 ? "" : "s") + " saved" + (j.rebuilt ? ". The site is rebuilding." : "."), 6000); loadLs(); openListing(l.id); })
        .catch(function(e){ formErr(f, e.message); $("button[type=submit]", f).disabled = false; });
    });
}
/* the overview's "Waiting for approval" previews open this panel instead of the old row drawer */
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest('[data-peek="mpListings"]'); if (!b) return;
  e.stopImmediatePropagation(); e.preventDefault();
  openListing(+b.getAttribute("data-pid"));
}, true);

/* =====================================================================================================
   Bookings
   ===================================================================================================== */
var BK = {rows: null, st: "paid", q: "", from: "", to: "", lid: "", when: "upcoming", offset: 0, more: false};
var BST = [["paid", "Paid"], ["", "All"], ["held", "In checkout"], ["cancelled", "Cancelled"], ["cancelled_conflict", "Clash, refunded"]];
var BSTL = {paid: ["ok", "Paid"], held: ["wait", "In checkout"], pending: ["wait", "Pending"], cancelled: ["not", "Cancelled"], cancelled_conflict: ["bad", "Clash, refunded"], expired: ["not", "Expired"]};
function bkCard(){
  var sec = $('section[data-panel="mpbookings"]'); if (!sec) return null;
  var c = $("#aoBk");
  if (!c){
    $$(".card", sec).forEach(function(x){ x.classList.add("hidden"); });
    c = document.createElement("div"); c.className = "card"; c.id = "aoBk";
    c.innerHTML = '<div class="tools"><input type="search" id="aoBkQ" placeholder="Search guest name, email, home or booking id" aria-label="Search bookings"><button type="button" class="btn ghost sm" id="aoBkCsv">Export CSV</button></div>' +
      '<div class="chips" id="aoBkChips" role="group" aria-label="Status"></div>' +
      '<div class="ao-f"><label>When<select id="aoBkWhen"><option value="upcoming">Upcoming and current</option><option value="today">Arriving or leaving today</option><option value="week">Next 7 days</option><option value="past">Past</option><option value="all">All dates</option><option value="range">Choose dates</option></select></label>' +
      '<label class="hidden" data-range>From<input type="date" id="aoBkFrom"></label><label class="hidden" data-range>To<input type="date" id="aoBkTo"></label>' +
      '<label>Home<select id="aoBkL"><option value="">All homes</option></select></label></div>' +
      '<p class="muted" id="aoBkSum" style="font-size:13px;margin-bottom:4px"></p><div id="aoBkList" aria-live="polite"><p class="zero">Loading...</p></div>' +
      '<button type="button" class="btn ghost sm ao-more hidden" id="aoBkMore">Show more</button>';
    sec.appendChild(c);
    var t = null;
    $("#aoBkQ").addEventListener("input", function(){ var v = this.value.trim(); clearTimeout(t); t = setTimeout(function(){ BK.q = v; loadBk(); }, 300); });
    $("#aoBkWhen").addEventListener("change", function(){ BK.when = this.value; $$("[data-range]", c).forEach(function(x){ x.classList.toggle("hidden", BK.when !== "range"); }); loadBk(); });
    $("#aoBkFrom").addEventListener("change", loadBk); $("#aoBkTo").addEventListener("change", loadBk);
    $("#aoBkL").addEventListener("change", function(){ BK.lid = this.value; loadBk(); });
    $("#aoBkMore").addEventListener("click", function(){ loadBk(true); });
    $("#aoBkCsv").addEventListener("click", function(){ var q = bkQuery(); q.limit = 500; q.offset = 0; csvCall(q, "bookhomes-bookings-" + ukToday() + ".csv").catch(function(e){ toast(e.message); }); });
    c.addEventListener("click", function(e){
      var ch = e.target.closest("#aoBkChips button"); if (ch){ BK.st = ch.getAttribute("data-v"); loadBk(); return; }
      var r = e.target.closest(".ao-bk"); if (r && !e.target.closest("a")) openBooking(r.getAttribute("data-id"));
    });
  }
  return c;
}
function bkQuery(){
  var today = ukToday(), q = {action: "list_bookings", limit: 100, offset: 0};
  if (BK.st) q.status = BK.st;
  if (BK.q) q.q = BK.q;
  if (BK.lid) q.listing_id = +BK.lid;
  if (BK.when === "upcoming") q.from = today;
  else if (BK.when === "today"){ q.from = today; q.to = addDays(today, 1); }
  else if (BK.when === "week"){ q.from = today; q.to = addDays(today, 8); }
  else if (BK.when === "past"){ q.to = today; }
  else if (BK.when === "range"){ var f = $("#aoBkFrom").value, t = $("#aoBkTo").value; if (f) q.from = f; if (t) q.to = addDays(t, 1); }
  return q;
}
function loadBk(more){
  if (!bkCard()) return;
  var q = bkQuery();
  q.offset = more ? BK.offset : 0;
  $("#aoBkChips").innerHTML = BST.map(function(s){ return '<button type="button" data-v="' + s[0] + '" aria-pressed="' + (s[0] === BK.st) + '">' + esc(s[1]) + "</button>"; }).join("");
  if (!more) $("#aoBkList").innerHTML = '<p class="zero">Loading...</p>';
  if (!$("#aoBkL").options[1]) api({action: "list_listings", limit: 500}).then(function(j){
    var sel = $("#aoBkL"); (j.rows || []).filter(function(l){ return l.status !== "draft"; }).forEach(function(l){ var o = document.createElement("option"); o.value = l.id; o.textContent = l.title + " (#" + l.id + ")"; sel.appendChild(o); });
  }).catch(function(){});
  var tag = BK.tag = Math.random();
  api(q).then(function(j){
    if (tag !== BK.tag) return;
    var rows = j.rows || [];
    if (BK.when === "past") rows = rows.filter(function(b){ return String(b.check_out).slice(0, 10) <= ukToday(); });
    if (BK.when === "today"){ var td = ukToday(); rows = rows.filter(function(b){ return String(b.check_in).slice(0, 10) === td || String(b.check_out).slice(0, 10) === td; }); }
    BK.rows = more ? (BK.rows || []).concat(rows) : rows;
    BK.offset = q.offset + (j.rows || []).length; BK.more = (j.rows || []).length === q.limit;
    drawBk();
  }).catch(function(e){ $("#aoBkList").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function drawBk(){
  var rows = BK.rows || [];
  var tot = rows.reduce(function(a, b){ return a + (b.status === "paid" ? +b.amount_pence || 0 : 0); }, 0);
  $("#aoBkSum").textContent = rows.length + " booking" + (rows.length === 1 ? "" : "s") + (BK.more ? " shown" : "") + (tot ? " · " + money(tot) + " paid" : "");
  $("#aoBkMore").classList.toggle("hidden", !BK.more);
  $("#aoBkList").innerHTML = rows.length ? rows.map(function(b){
    var st = BSTL[b.status] || ["not", b.status];
    return '<div class="ao-bk" data-id="' + esc(b.id) + '"><span><b>' + esc(b.guest_name || "Guest") + "</b> · " + esc(b.listing_title || "") +
      "<small>" + dfmt(b.check_in) + " to " + dfmt(b.check_out) + " · " + (b.nights || 0) + " night" + (b.nights === 1 ? "" : "s") + " · " + (b.guests || 1) + " guest" + (b.guests === 1 ? "" : "s") + " · " + esc(b.guest_email || "") + "</small></span>" +
      '<span class="rt"><b>' + money(b.amount_pence) + "</b>" + badge(st[0] + " plain", st[1]) + (b.source === "zermatt" ? "<small>Zermatt system</small>" : "") + "</span></div>";
  }).join("") : '<p class="zero">No bookings match.</p>';
}
onShow("mpbookings", function(){ if (!BK.rows) loadBk(); });

var BD = null;
function openBooking(id){
  var body = panel("Booking");
  return api({action: "booking_detail", id: id}).then(function(j){ BD = j; drawBooking(); })
    .catch(function(e){ body.innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function drawBooking(){
  var body = $(".ao .aob"); if (!body || !BD) return;
  var b = BD.booking, st = BSTL[b.status] || ["not", b.status], s = BD.stripe, mkt = b.source === "bookhomes";
  var ph = String(b.guest_phone || "").replace(/[^\d+]/g, "");
  var acts = [];
  if (mkt && (b.status === "paid" || b.status === "held")) acts.push('<button type="button" class="btn red" data-bop="cancel">' + (b.status === "held" ? "Release hold" : "Cancel and refund") + "</button>");
  if (mkt && b.status === "paid") acts.push('<button type="button" class="btn ghost" data-bop="resend">Resend confirmation</button>');
  acts.push('<button type="button" class="btn ghost" data-bop="note">Add note</button>');
  if (s && s.url) acts.push('<a class="btn ghost" href="' + esc(s.url) + '" target="_blank" rel="noopener">Open in Stripe</a>');
  var pay = "";
  if (s){
    pay = kv("Stripe status", s.error ? '<span class="muted">Could not load: ' + esc(s.error) + "</span>" : esc(String(s.status || "").replace(/_/g, " ")) + (s.card ? " · " + esc(s.card) : "")) +
      (s.received_pence != null ? kv("Received", money(s.received_pence)) : "") + (s.refunded_pence ? kv("Refunded", money(s.refunded_pence)) : "") +
      (s.application_fee_pence != null ? kv("Our fee (Stripe)", money(s.application_fee_pence)) : "") + (s.account ? kv("Charged on", '<span class="mono">' + esc(s.account) + "</span> (host's Stripe account)") : kv("Charged on", "Book Homes Stripe account"));
  } else pay = kv("Stripe", b.status === "paid" ? "No Stripe payment linked (paid another way)" : "No payment yet");
  body.innerHTML =
    '<div class="hh" style="margin-bottom:10px"><span><b>' + esc(b.guest_name || "Guest") + "</b><small>" + esc(b.listing_title || "") + " · ref " + esc(String(b.id).slice(0, 8).toUpperCase()) + "</small></span></div>" +
    '<div class="bd">' + badge(st[0], st[1]) + (mkt ? "" : badge("not plain", "Zermatt Lodge system")) + "</div>" +
    '<div class="ha">' + acts.join("") + "</div>" +
    "<h3>Stay</h3><dl class=\"kv\">" +
      kv("Dates", dfmt(b.ci || b.check_in) + " to " + dfmt(b.co || b.check_out) + " · " + (b.nights || 0) + " nights") + kv("Guests", esc(b.guests)) +
      kv("Email", '<a href="mailto:' + esc(b.guest_email) + '">' + esc(b.guest_email) + "</a>") +
      kv("Phone", ph ? '<a href="tel:' + esc(ph) + '">' + esc(b.guest_phone) + "</a>" : "") +
      kv("Booked", esc(tfmt(b.created_at))) + kv("Paid", b.paid_at ? esc(tfmt(b.paid_at)) : "") +
      (b.cancel_reason ? kv("Cancelled", esc(b.cancel_reason)) : "") +
    "</dl><h3>Money</h3><dl class=\"kv\">" +
      kv("Guest paid", "<b>" + money(b.amount_pence) + "</b>" + (b.cleaning_pence ? " (cleaning " + money(b.cleaning_pence) + ")" : "")) +
      (mkt ? kv("Commission", money(b.fee_pence)) + kv("Host payout", money(b.host_payout_pence) + " · " + esc(b.payout_mode === "connect" ? "Stripe" : "bank transfer")) : "") +
      pay +
      (BD.policy_refund ? kv("Refund under policy", money(BD.policy_refund.refund_pence) + " (" + esc(b.cancellation_policy || "moderate") + ", " + BD.policy_refund.days_before + " days before)") : "") +
    "</dl>" +
    (BD.payouts && BD.payouts.length ? "<h3>Payout to host</h3>" + BD.payouts.map(function(p){ return '<div class="ao-pay"><span>' + money(p.amount_pence) + " · " + esc(String(p.status).replace(/_/g, " ")) + (p.note ? " · " + esc(p.note) : "") + "</span><small class=\"muted\">" + (p.paid_at ? "paid " + esc(tfmt(p.paid_at)) : "") + "</small></div>"; }).join("") : "") +
    "<h3>Emails</h3>" + (BD.emails && BD.emails.length ? BD.emails.map(function(m){ return '<div class="ao-pay"><span>' + esc(m.subject || m.template) + "<br><small class=\"muted\">" + esc(m.to_address) + "</small></span><small>" + esc(String(m.status).replace(/_/g, " ")) + "<br>" + esc(tfmt(m.created_at)) + "</small></div>"; }).join("") : '<p class="muted">None logged.</p>') +
    "<h3>Notes and history</h3>" + histHtml(BD.history);
}
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("[data-bop]"); if (!b || !BD) return;
  var bk = BD.booking, op = b.getAttribute("data-bop");
  var reload = function(){ loadBk(); refreshAll(); DASH_AT = 0; openBooking(bk.id); };
  if (op === "note"){
    modal('<form novalidate><h2>Add a note</h2><p>Only admins see notes.</p><label class="f">Note<textarea name="note" maxlength="1000"></textarea></label><div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Save note</button></div></form>',
      function(f){ var v = f.elements.note.value.trim(); if (!v){ formErr(f, "Write a note first."); return; } api({action: "add_note", id: bk.id, note: v}).then(function(){ closeModal(); toast("Note saved."); openBooking(bk.id); }).catch(function(er){ formErr(f, er.message); }); });
    return;
  }
  if (op === "resend"){
    modal('<form novalidate><h2>Resend confirmation</h2><p>Sends the booking confirmation again to ' + esc(bk.guest_email) + '.</p><label class="tog"><input type="checkbox" name="host"> Also send the host their new-booking email</label><div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Send</button></div></form>',
      function(f){ $("button[type=submit]", f).disabled = true; api({action: "resend_confirmation", id: bk.id, include_host: f.elements.host.checked}).then(function(j){ closeModal(); toast(j.note || "Sent (" + j.guest_email + ").", 7000); openBooking(bk.id); }).catch(function(er){ formErr(f, er.message); $("button[type=submit]", f).disabled = false; }); });
    return;
  }
  if (op === "cancel") cancelFlow(bk, reload);
});
function cancelFlow(bk, reload){
  var held = bk.status === "held", pol = BD.policy_refund;
  var m = modal('<form novalidate><h2>' + (held ? "Release this hold" : "Cancel booking") + "</h2>" +
    (held ? "<p>The guest has not paid. The dates are released straight away.</p>" :
    "<p>" + esc(bk.guest_name) + " · " + dfmt(bk.ci) + " · paid " + money(bk.amount_pence) + ". The guest and host are emailed. The refund goes back to the guest's card" + (bk.payout_mode === "connect" ? " from the host's Stripe account, with our fee returned in proportion" : "") + ".</p>" +
    '<label class="tog"><input type="radio" name="mode" value="policy" checked> Refund by the cancellation policy' + (pol ? " (" + money(pol.refund_pence) + ")" : "") + "</label>" +
    '<label class="tog"><input type="radio" name="mode" value="full"> Full refund (' + money(bk.amount_pence) + ")</label>" +
    '<label class="tog"><input type="radio" name="mode" value="custom"> Part refund: £ <input type="number" name="amt" min="0" step="0.01" max="' + (bk.amount_pence / 100) + '" style="width:110px;height:38px;border:1px solid #c4c4c4;border-radius:8px;padding:0 8px"></label>' +
    '<label class="tog"><input type="radio" name="mode" value="none"> No refund</label>' +
    '<div class="ao-calc" id="aoCalc">Working out...</div>' +
    '<label class="f">Reason (sent to the guest)<textarea name="reason" maxlength="300" placeholder="e.g. The host can no longer host these dates."></textarea></label>' +
    '<label class="tog"><input type="checkbox" name="sure"> I understand this cancels the booking and sends the refund now</label>') +
    '<div class="foot"><button type="button" class="btn ghost" data-close>Keep booking</button><button class="btn red" type="submit">' + (held ? "Release hold" : "Cancel booking") + "</button></div></form>",
    function(f){
      var body = held ? {action: "cancel_booking", id: bk.id} : refundBody(f);
      if (!body) return;
      if (!held && !f.elements.sure.checked){ formErr(f, "Tick the box to confirm."); return; }
      if (!held) body.reason = f.elements.reason.value.trim() || undefined;
      $("button[type=submit]", f).disabled = true;
      api(body).then(function(j){ closeModal(); toast(held ? "Hold released." : "Cancelled. Refund " + money(j.refund_pence) + (j.refund_id ? " (" + j.refund_id + ")" : "") + ".", 8000); reload(); })
        .catch(function(er){ formErr(f, er.message); $("button[type=submit]", f).disabled = false; });
    });
  if (held) return;
  var f = $("form", m), t = null;
  function preview(){
    var body = refundBody(f, true); if (!body){ $("#aoCalc").textContent = "Enter an amount up to " + money(bk.amount_pence) + "."; return; }
    body.preview = true;
    api(body).then(function(j){
      $("#aoCalc").innerHTML = "<div><span>Refund to guest</span><b>" + money(j.refund_pence) + "</b></div><div><span>Kept</span><span>" + money(j.kept_pence) + "</span></div>" +
        "<div><span>Our commission on the kept part</span><span>" + money(j.commission_pence) + "</span></div><div><span>Host payout becomes</span><span>" + money(j.host_payout_pence) + "</span></div>";
    }).catch(function(er){ $("#aoCalc").textContent = er.message; });
  }
  f.addEventListener("change", preview); f.addEventListener("input", function(e){ if (e.target.name === "amt"){ f.elements.mode.value = "custom"; clearTimeout(t); t = setTimeout(preview, 300); } });
  preview();
}
function refundBody(f, quiet){
  var mode = f.elements.mode.value, body = {action: "cancel_booking", id: BD.booking.id};
  if (mode === "custom"){
    var v = Math.round(parseFloat(f.elements.amt.value) * 100);
    if (!(v >= 0 && v <= BD.booking.amount_pence)){ if (!quiet) formErr(f, "Enter a refund between £0 and " + money(BD.booking.amount_pence) + "."); return null; }
    body.refund = v;
  } else body.refund = mode;
  return body;
}
/* booking rows on the overview open this panel too */
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("[data-aobk], #ovLatest [data-bk]"); if (!b) return;
  e.stopImmediatePropagation(); e.preventDefault();
  openBooking(b.getAttribute("data-aobk") || b.getAttribute("data-bk"));
}, true);

/* =====================================================================================================
   Payouts
   ===================================================================================================== */
var PO = {rows: null, st: "manual_pending", q: ""};
var PST = [["manual_pending", "To send (bank transfer)"], ["connect_scheduled", "Paid by Stripe"], ["paid", "Marked paid"], ["cancelled", "Cancelled"], ["", "All"]];
var PSTL = {manual_pending: ["wait", "To send"], connect_scheduled: ["chk", "Stripe"], paid: ["ok", "Paid"], cancelled: ["not", "Cancelled"]};
function poCard(){
  var sec = $('section[data-panel="mppayouts"]'); if (!sec) return null;
  var c = $("#aoPo");
  if (!c){
    $$(".card", sec).forEach(function(x){ if (x.id !== "abBank") x.classList.add("hidden"); });
    c = document.createElement("div"); c.className = "card"; c.id = "aoPo";
    c.innerHTML = '<div class="ch"><h2>Payouts to hosts</h2></div><div class="tools"><input type="search" id="aoPoQ" placeholder="Search host or home" aria-label="Search payouts"><button type="button" class="btn ghost sm" id="aoPoCsv">Export CSV</button></div>' +
      '<div class="chips" id="aoPoChips" role="group" aria-label="Show payouts"></div><p class="muted" id="aoPoSum" style="font-size:13px"></p><div id="aoPoList"><p class="zero">Loading...</p></div>';
    var s = document.createElement("div"); s.className = "card"; s.id = "aoSp";
    s.innerHTML = '<div class="ch"><h2>Stripe payouts from host accounts</h2><button type="button" class="btn ghost sm" id="aoSpLoad">Load from Stripe</button></div><p class="muted" style="font-size:13px">Hosts on Stripe are paid by Stripe straight to their bank. This reads each connected account (read only).</p><div id="aoSpList"></div>';
    var grid = $("#mpPayStats");
    sec.insertBefore(s, grid ? grid.nextSibling : sec.firstChild);
    sec.insertBefore(c, s);
    var t = null;
    $("#aoPoQ").addEventListener("input", function(){ var v = this.value.trim(); clearTimeout(t); t = setTimeout(function(){ PO.q = v; loadPo(); }, 300); });
    $("#aoPoCsv").addEventListener("click", function(){ csvCall({action: "list_payouts", limit: 500, status: PO.st || undefined, q: PO.q || undefined}, "bookhomes-payouts-" + ukToday() + ".csv").catch(function(e){ toast(e.message); }); });
    $("#aoSpLoad").addEventListener("click", loadSp);
    c.addEventListener("click", function(e){
      var ch = e.target.closest("#aoPoChips button"); if (ch){ PO.st = ch.getAttribute("data-v"); loadPo(); return; }
      var pb = e.target.closest("[data-popaid]"); if (pb) markPaid(pb.getAttribute("data-popaid"));
      var ob = e.target.closest("[data-pobk]"); if (ob) openBooking(ob.getAttribute("data-pobk"));
    });
  }
  return c;
}
function loadPo(){
  if (!poCard()) return;
  $("#aoPoChips").innerHTML = PST.map(function(s){ return '<button type="button" data-v="' + s[0] + '" aria-pressed="' + (s[0] === PO.st) + '">' + esc(s[1]) + "</button>"; }).join("");
  api({action: "list_payouts", limit: 300, status: PO.st || undefined, q: PO.q || undefined}).then(function(j){
    PO.rows = j.rows || [];
    var tot = PO.rows.reduce(function(a, p){ return a + (+p.amount_pence || 0); }, 0);
    $("#aoPoSum").textContent = PO.rows.length + " payout" + (PO.rows.length === 1 ? "" : "s") + " · " + money(tot);
    $("#aoPoList").innerHTML = PO.rows.length ? PO.rows.map(function(p){
      var st = PSTL[p.status] || ["not", p.status];
      return '<div class="ao-bk" style="cursor:default"><span><b>' + esc(p.host_name || p.host_email) + "</b> · " + esc(p.title) +
        "<small>" + (p.guest_name ? esc(p.guest_name) + " · " : "") + "stay " + dfmt(p.check_in) + " to " + dfmt(p.check_out) + " · " + esc(p.host_email) + "</small>" +
        (p.note ? "<small>" + esc(p.note) + "</small>" : "") + (p.paid_at ? "<small>Paid " + esc(tfmt(p.paid_at)) + "</small>" : "") + "</span>" +
        '<span class="rt"><b>' + money(p.amount_pence) + "</b><br>" + badge(st[0] + " plain", st[1]) +
        '<br><span style="display:inline-flex;gap:6px;margin-top:6px">' + (p.status === "manual_pending" ? '<button type="button" class="btn sm" data-popaid="' + esc(p.id) + '">Mark paid</button>' : "") +
        '<button type="button" class="btn ghost sm" data-pobk="' + esc(p.booking_id) + '">Booking</button></span></span></div>';
    }).join("") : '<p class="zero">Nothing here.</p>';
  }).catch(function(e){ $("#aoPoList").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function markPaid(id){
  var p = (PO.rows || []).filter(function(x){ return x.id === id; })[0]; if (!p) return;
  modal('<form novalidate><h2>Mark as paid</h2><p>' + money(p.amount_pence) + " to " + esc(p.host_name || p.host_email) + " for " + esc(p.title) + ". Do the bank transfer first (bank details are lower on this page). The host gets a text that it's on its way.</p>" +
    '<label class="f">Transfer reference or note<input type="text" name="note" maxlength="300" placeholder="e.g. Faster Payment ref BH-1234"></label><div class="foot"><button type="button" class="btn ghost" data-close>Cancel</button><button class="btn" type="submit">Mark paid</button></div></form>',
    function(f){ $("button[type=submit]", f).disabled = true; api({action: "mark_payout_paid", id: id, note: f.elements.note.value.trim()}).then(function(){ closeModal(); toast("Marked paid."); loadPo(); refreshAll(); DASH_AT = 0; })
      .catch(function(e){ formErr(f, e.message); $("button[type=submit]", f).disabled = false; }); });
}
function loadSp(){
  var b = $("#aoSpLoad"); b.disabled = true; $("#aoSpList").innerHTML = '<p class="zero">Asking Stripe...</p>';
  api({action: "connect_payouts"}).then(function(j){
    b.disabled = false;
    var rows = j.rows || [];
    $("#aoSpList").innerHTML = j.note ? '<p class="muted">' + esc(j.note) + "</p>" : rows.length ? rows.map(function(h){
      var acct = /^acct_[A-Za-z0-9]+$/.test(h.stripe_account_id) ? h.stripe_account_id : "";
      return '<div class="item"><div class="h"><span>' + esc(h.host_name || h.email) + "</span>" + (h.error ? badge("bad plain", "Could not read") : badge(h.payouts_enabled ? "ok plain" : "half plain", h.payouts_enabled ? "Payouts on" : "Payouts off")) + "</div>" +
        (h.error ? '<div class="m">' + esc(h.error) + "</div>" : '<div class="m">Balance: ' + money(h.available_pence) + " available, " + money(h.pending_pence) + " on the way in" + (acct ? ' · <a href="https://dashboard.stripe.com/connect/accounts/' + esc(acct) + '" target="_blank" rel="noopener">Open in Stripe</a>' : "") + "</div>") +
        (h.payouts && h.payouts.length ? h.payouts.map(function(p){ return '<div class="ao-pay"><span>' + money(p.amount_pence) + " · " + esc(p.status.replace(/_/g, " ")) + "</span><small class=\"muted\">arrives " + dfmt(p.arrival_date) + (acct ? ' · <a href="https://dashboard.stripe.com/' + esc(acct) + "/payouts/" + esc(p.id) + '" target="_blank" rel="noopener">view</a>' : "") + "</small></div>"; }).join("") : (h.error ? "" : '<div class="m">No payouts yet.</div>')) + "</div>";
    }).join("") : '<p class="muted">No hosts have connected Stripe yet.</p>';
  }).catch(function(e){ b.disabled = false; $("#aoSpList").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
onShow("mppayouts", loadPo);

/* =====================================================================================================
   Settings: commission by host type
   ===================================================================================================== */
function csCard(){
  var sec = $('section[data-panel="mpsettings"]'); if (!sec) return null;
  var c = $("#aoCs");
  if (!c){
    var old = $("#mpCommission"); if (old && old.closest(".card")) old.closest(".card").classList.add("hidden");
    c = document.createElement("div"); c.className = "card"; c.id = "aoCs";
    c.innerHTML = '<h2>Commission</h2><div id="aoCsMsg"></div><form id="aoCsForm" novalidate><div class="row">' +
      '<label class="f">Standard hosts (% of each booking)<input type="number" name="standard" min="0" max="50" step="0.5" required></label>' +
      '<label class="f">Kosher hosts (%)<input type="number" name="kosher" min="0" max="50" step="0.5" required></label></div><button class="btn" type="submit">Save rates</button></form>' +
      '<p class="muted" style="margin:8px 0 14px;font-size:13px">Applies to new bookings. A host\'s own override (Hosts tab) wins over these. The % shown on the public "List your property" page is separate: ask for it to be updated too.</p>' +
      '<h2 style="margin-top:6px">Host types</h2><div class="tools"><input type="search" id="aoCsQ" placeholder="Search hosts" aria-label="Search hosts"></div><div id="aoCsHosts"><p class="zero">Loading...</p></div>';
    sec.insertBefore(c, sec.firstChild);
    $("#aoCsForm").addEventListener("submit", function(e){
      e.preventDefault();
      var f = this, s = +f.elements.standard.value, k = +f.elements.kosher.value;
      if (!(s >= 0 && s <= 50 && k >= 0 && k <= 50) || f.elements.standard.value === "" || f.elements.kosher.value === ""){ $("#aoCsMsg").innerHTML = '<div class="err">Enter 0 to 50 for both.</div>'; return; }
      api({action: "set_commission_types", standard: s, kosher: k}).then(function(){ $("#aoCsMsg").innerHTML = '<div class="okmsg">Saved. New bookings use ' + s + "% (standard) and " + k + "% (kosher hosts).</div>"; loadCs(); refreshAll(); })
        .catch(function(er){ $("#aoCsMsg").innerHTML = '<div class="err">' + esc(er.message) + "</div>"; });
    });
    $("#aoCsQ").addEventListener("input", drawCs);
    c.addEventListener("change", function(e){
      var s = e.target.closest("select[data-ht]"); if (!s) return;
      s.disabled = true;
      api({action: "set_host_type", host_id: s.getAttribute("data-ht"), host_type: s.value}).then(function(j){
        s.disabled = false; var h = CS.hosts.filter(function(x){ return x.host_id === s.getAttribute("data-ht"); })[0];
        if (h){ h.host_type = s.value; h.effective_pct = j.effective_pct; } drawCs(); toast("Saved. New bookings for this host use " + j.effective_pct + "%.");
      }).catch(function(er){ s.disabled = false; toast(er.message); loadCs(); });
    });
  }
  return c;
}
var CS = null;
function loadCs(){
  if (!csCard()) return;
  api({action: "commission_settings"}).then(function(j){
    CS = j; var f = $("#aoCsForm");
    if (document.activeElement !== f.elements.standard) f.elements.standard.value = j.standard;
    if (document.activeElement !== f.elements.kosher) f.elements.kosher.value = j.by_type && j.by_type.kosher != null ? j.by_type.kosher : "";
    drawCs();
  }).catch(function(e){ $("#aoCsHosts").innerHTML = '<div class="err">' + esc(e.message) + "</div>"; });
}
function drawCs(){
  if (!CS) return;
  var q = ($("#aoCsQ").value || "").trim().toLowerCase();
  var rows = CS.hosts.filter(function(h){ return !q || (h.host_name + " " + h.email).toLowerCase().indexOf(q) >= 0; });
  $("#aoCsHosts").innerHTML = rows.length ? rows.map(function(h){
    return '<div class="ao-ht"><span><b>' + esc(h.host_name) + "</b><small>" + esc(h.email) + (h.kosher_listings ? " · " + h.kosher_listings + " listing" + (h.kosher_listings === 1 ? "" : "s") + " with a kosher kitchen" : "") + "</small></span>" +
      '<select data-ht="' + esc(h.host_id) + '" aria-label="Host type for ' + esc(h.host_name) + '">' + CS.types.map(function(t){ return '<option value="' + t + '"' + (t === h.host_type ? " selected" : "") + ">" + (t === "kosher" ? "Kosher host" : "Standard") + "</option>"; }).join("") + "</select>" +
      '<span class="pc"><b>' + esc(+h.effective_pct) + "%</b>" + (h.commission_override != null ? "<small>own rate</small>" : "") + "</span></div>";
  }).join("") : '<p class="zero">No hosts.</p>';
}
onShow("mpsettings", loadCs);

/* first paint: whichever panel is open when the app appears */
setTimeout(function(){ Object.keys(HOOKS).forEach(function(n){ if (visible(n)) HOOKS[n](); }); }, 0);
})();
