/* Book Homes admin: SEO Boost tab (25 Nov 2026).
   Orders list (status, package, price, pages, AI cost), order panel (questionnaire facts, keyword set and its source,
   pages and answers with the facts each one uses, history), actions: Approve (first pages go live at the next build,
   then 2-3 a day), Send back to host, Publish next batch now, Retry, Cancel (with or without a full Stripe refund),
   edit / remove / take down answers and pages, and Settings (package prices and page counts, cap per listing, model).
   Everything goes through bookhomes-seo (admin + 2-step checked on the server, every change audit-logged).
   Needs window.BHAdmin.fn from admin/index.html. */
(function(){
"use strict";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(p){ return new Intl.NumberFormat("en-GB", {style: "currency", currency: "GBP"}).format((+p || 0) / 100); }
var fmtT = new Intl.DateTimeFormat("en-GB", {day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London"});
function tfmt(s){ return s ? fmtT.format(new Date(s)) : "-"; }
function api(body){ if (!window.BHAdmin || !window.BHAdmin.fn) return Promise.reject(new Error("Admin is still loading.")); return window.BHAdmin.fn("bookhomes-seo", body); }
function toast(t){ var o = $(".toast"); if (o) o.remove(); var d = document.createElement("div"); d.className = "toast"; d.setAttribute("role", "status"); d.textContent = t; document.body.appendChild(d); setTimeout(function(){ d.remove(); }, 4500); }
var CSS = ".sa-t{width:100%;border-collapse:collapse;font-size:14px}.sa-t th,.sa-t td{text-align:left;padding:9px 8px;border-bottom:1px solid #eee;vertical-align:top}" +
  ".sa-t tr[data-o]{cursor:pointer}.sa-t tr[data-o]:hover{background:#f7f7f7}.sa-st{display:inline-block;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#eef2ef;color:#1F4D3A}" +
  ".sa-st.warn{background:#fff3e0;color:#8a4b00}.sa-st.bad{background:#fdeceb;color:#b42318}.sa-acts{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}" +
  ".sa-pg{border:1px solid #e6e6e6;border-radius:12px;padding:12px 14px;margin:10px 0}.sa-pg.off,.sa-it.off{opacity:.5}.sa-it{border-top:1px solid #f2f2f2;padding:8px 0}" +
  ".sa-it p{margin:4px 0;white-space:pre-line;font-size:14px;line-height:1.5}.sa-f{font-size:12.5px;color:#6a6a6a}.sa-kw{columns:3;font-size:13px;margin:6px 0}.sa-kw li{break-inside:avoid}" +
  ".sa-g{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.sa-g label{display:block;font-size:13.5px;font-weight:600}.sa-g input{width:100%;margin-top:4px}" +
  "#seoPanel{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.4);overflow:auto;padding:20px}#seoPanel .card{max-width:980px;margin:0 auto}" +
  "@media(max-width:760px){.sa-t .hm{display:none}.sa-kw{columns:1}}";
var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
var WARN = {needs_setup: 1, failed: 1, admin_review: 1}, BAD = {failed: 1, refunded: 1, cancelled: 1};
var LABEL = {checkout: "Paying", expired: "Not paid", paid: "Paid", needs_setup: "Needs AI key", researching: "Keyword research", planning: "Planning",
  writing: "Writing", host_review: "Host checking", admin_review: "To approve", publishing: "Going live", published: "All live", failed: "Failed", cancelled: "Cancelled", refunded: "Refunded"};
function badge(s){ return '<span class="sa-st' + (BAD[s] ? " bad" : WARN[s] ? " warn" : "") + '">' + esc(LABEL[s] || s) + "</span>"; }
var D = null;

function load(){
  var box = $("#seoAdmin"); if (!box) return;
  api({action: "admin_list"}).then(function(j){ D = j; draw(); }, function(e){ box.innerHTML = '<div class="card"><div class="msg err">' + esc(e.message) + "</div></div>"; });
}
function draw(){
  var box = $("#seoAdmin"), s = D.settings, os = D.orders;
  var todo = os.filter(function(o){ return o.status === "admin_review"; }).length;
  var n = $("#mpSeoN"); if (n){ n.textContent = todo || ""; n.classList.toggle("hidden", !todo); }
  var paid = os.filter(function(o){ return o.paid_at && o.status !== "refunded"; });
  var rev = paid.reduce(function(a, o){ return a + o.price_pence; }, 0), cost = paid.reduce(function(a, o){ return a + (+o.cost_usd || 0); }, 0);
  box.innerHTML = (D.key_set ? "" : '<div class="card"><div class="msg err"><b>ANTHROPIC_API_KEY is not set.</b> Paid orders wait as "Needs AI key" until it is added in Supabase > Edge Functions > Secrets, then they start on their own within 2 minutes.</div></div>') +
    '<div class="card"><h2>SEO Boost orders</h2><p class="muted">' + paid.length + " paid, " + money(rev) + " taken, AI cost about $" + cost.toFixed(2) + ". " + todo + " to approve.</p>" +
    (os.length ? '<table class="sa-t"><thead><tr><th>Listing</th><th>Package</th><th>Status</th><th class="hm">Pages</th><th class="hm">Keywords</th><th class="hm">AI cost</th><th class="hm">Created</th></tr></thead><tbody>' +
      os.map(function(o){
        return '<tr data-o="' + esc(o.id) + '"><td><b>' + esc(o.listing_title) + '</b><br><span class="sa-f">' + esc(o.host_email) + "</span></td><td>" + esc(o.package) + " " + money(o.price_pence) + "</td><td>" + badge(o.status) +
          (o.last_error ? '<br><span class="sa-f">' + esc(o.last_error.slice(0, 80)) + "</span>" : "") + '</td><td class="hm">' + o.live + " live / " + o.pages + " of " + o.pages_target + " (" + o.items + ' Q&As)</td><td class="hm">' + esc(o.keyword_source || "-") +
          '</td><td class="hm">$' + (+o.cost_usd || 0).toFixed(3) + '</td><td class="hm">' + tfmt(o.created_at) + "</td></tr>";
      }).join("") + "</tbody></table>" : '<p class="muted">No orders yet.</p>') + "</div>" +
    '<div class="card"><h2>Packages and settings</h2><form id="saSet" class="sa-g">' +
    '<label>Mini price (\u00a3)<input type="number" step="0.01" min="0.3" name="mini_price" value="' + (s.mini.price_pence / 100) + '"></label>' +
    '<label>Mini pages<input type="number" min="1" max="30" name="mini_pages" value="' + s.mini.pages + '"></label>' +
    '<label>Max price (\u00a3)<input type="number" step="0.01" min="0.3" name="max_price" value="' + (s.max.price_pence / 100) + '"></label>' +
    '<label>Max pages<input type="number" min="1" max="30" name="max_pages" value="' + s.max.pages + '"></label>' +
    '<label>Most pages per listing<input type="number" min="1" max="30" name="cap" value="' + s.max_pages_per_listing + '"></label>' +
    '<label>Model<input type="text" name="model" value="' + esc(s.model) + '"></label>' +
    '<label>$ per million input tokens<input type="number" step="0.01" min="0" name="pin" value="' + s.usd_per_mtok_in + '"></label>' +
    '<label>$ per million output tokens<input type="number" step="0.01" min="0" name="pout" value="' + s.usd_per_mtok_out + '"></label>' +
    '<label><input type="checkbox" name="enabled"' + (s.enabled ? " checked" : "") + ' style="width:auto"> Selling on (hosts see the card)</label>' +
    '<div><button class="btn" type="submit">Save</button></div></form><p class="muted">Upgrade Mini to Max costs the Max price minus what the host paid for Mini. Pages go live 2 or 3 a day (05:40 UK, built at 06:10).</p></div>';
}
function saveSettings(f){
  var v = function(n){ return f.elements[n].value; };
  api({action: "admin_settings", settings: {enabled: f.elements.enabled.checked, mini: {price_pence: Math.round(v("mini_price") * 100), pages: +v("mini_pages")},
    max: {price_pence: Math.round(v("max_price") * 100), pages: +v("max_pages")}, max_pages_per_listing: +v("cap"), model: v("model").trim(),
    usd_per_mtok_in: +v("pin"), usd_per_mtok_out: +v("pout")}}).then(function(){ toast("Saved"); load(); }, function(e){ toast(e.message); });
}

function panel(html){ var p = $("#seoPanel"); if (!p){ p = document.createElement("div"); p.id = "seoPanel"; document.body.appendChild(p); p.addEventListener("click", onPanel); } p.innerHTML = '<div class="card">' + html + "</div>"; return p; }
function closePanel(){ var p = $("#seoPanel"); if (p) p.remove(); }
var CUR = null;
function openOrder(id){
  CUR = id; panel("<p>Loading...</p>");
  api({action: "admin_order", order_id: id}).then(drawOrder, function(e){ panel('<div class="msg err">' + esc(e.message) + '</div><button class="btn ghost" data-x>Close</button>'); });
}
function drawOrder(j){
  var o = j.order, kw = o.keywords || {}, facts = o.facts || [], fmap = {};
  facts.forEach(function(f){ fmap[f.id] = f; });
  var a = o.answers || {};
  var acts = [];
  if (o.status === "admin_review" || o.status === "host_review") acts.push('<button class="btn" data-a="admin_approve">Approve and start publishing</button>');
  if (o.status === "admin_review") acts.push('<button class="btn ghost" data-a="admin_send_back">Send back to host</button>');
  if (o.status === "publishing") acts.push('<button class="btn ghost" data-a="admin_publish_now">Publish next batch now</button>');
  if (o.status === "failed" || o.status === "needs_setup") acts.push('<button class="btn ghost" data-a="admin_retry">Retry</button>');
  if (o.status !== "cancelled" && o.status !== "refunded" && o.status !== "expired") acts.push((o.stripe_payment_intent ? '<button class="btn red" data-a="refund">Cancel and refund ' + money(o.price_pence) + "</button>" : "") + '<button class="btn ghost" data-a="cancel">Cancel, no refund</button>');
  var live = o.slug ? "/" + o.slug + "/guide/" : null;
  panel('<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h2 style="margin:0">' + esc(o.listing_title) + "</h2><p class='muted'>" + esc(o.host_email) + " - " + esc(o.package) + " " + money(o.price_pence) + " - " + o.pages_target + " pages - " + badge(o.status) + "</p></div><button class='btn ghost sm' data-x>Close</button></div>" +
    (o.last_error ? '<div class="msg err">' + esc(o.last_error) + "</div>" : "") +
    '<div class="sa-acts">' + acts.join("") + "</div>" +
    '<p class="sa-f">Paid ' + tfmt(o.paid_at) + " - model " + esc(o.model || "-") + " - tokens " + o.tokens_in + " in / " + o.tokens_out + " out - cost $" + (+o.cost_usd || 0).toFixed(3) + " - Stripe " + esc(o.stripe_payment_intent || o.stripe_session_id || "-") + "</p>" +
    "<details><summary><b>Host answers and facts</b> (" + facts.length + ")</summary><ul>" + facts.map(function(f){ return "<li><b>" + esc(f.id) + "</b> " + esc(f.label) + ": " + esc(f.text) + "</li>"; }).join("") + "</ul>" +
    (facts.length ? "" : "<pre style='white-space:pre-wrap'>" + esc(JSON.stringify(a, null, 1)) + "</pre>") + "</details>" +
    "<details><summary><b>Keyword set</b> - " + esc(o.keyword_source || "not yet") + " (" + ((kw.suggestions || []).length) + " suggestions)</summary><p class='sa-f'>" + esc(kw.note || "") + "</p>" +
    ((kw.suggestions || []).length ? "<ul class='sa-kw'>" + kw.suggestions.map(function(k){ return "<li>" + esc(k.q) + "</li>"; }).join("") + "</ul>" : "") +
    ((kw.questions || []).length ? "<p><b>AI candidate searches</b> (Autocomplete was blocked)</p><ul class='sa-kw'>" + kw.questions.map(function(q){ return "<li>" + esc(q) + "</li>"; }).join("") + "</ul>" : "") + "</details>" +
    "<h3>Pages (" + j.pages.length + ")</h3>" +
    j.pages.map(function(p){
      var off = p.status === "removed" || p.status === "unpublished";
      return '<div class="sa-pg' + (off ? " off" : "") + '" data-page="' + p.id + '"><b>' + esc(p.title) + "</b> " + badge(p.status === "published" ? "published" : p.status) +
        (p.status === "published" && live ? ' <a href="' + esc(live + p.topic_slug) + '" target="_blank" rel="noopener">open</a>' : "") +
        '<div class="sa-f">/' + esc(o.slug) + "/guide/" + esc(p.topic_slug) + (p.keyword ? " - search: " + esc(p.keyword) : "") + (p.meta_description ? " - " + esc(p.meta_description) : "") + "</div>" +
        p.items.map(function(it){
          return '<div class="sa-it' + (it.removed ? " off" : "") + '" data-item="' + it.id + '"><b>' + esc(it.question) + "</b>" + (it.on_listing ? ' <span class="sa-st">on listing</span>' : "") + (it.edited_by_host ? ' <span class="sa-st warn">edited by host</span>' : "") +
            "<p>" + esc(it.answer) + '</p><div class="sa-f">Facts: ' + (it.fact_ids || []).map(function(id){ return esc(id) + (fmap[id] ? " (" + esc(fmap[id].label) + ")" : ""); }).join(", ") + "</div>" +
            '<div class="sa-acts"><button class="btn ghost sm" data-ed>Edit</button><button class="btn ghost sm" data-rm="' + (it.removed ? "0" : "1") + '">' + (it.removed ? "Put back" : "Remove") + "</button></div></div>";
        }).join("") +
        '<div class="sa-acts"><button class="btn ghost sm" data-rmp="' + (off ? "0" : "1") + '">' + (off ? "Put page back" : p.status === "published" ? "Take page down" : "Remove page") + "</button></div></div>";
    }).join("") +
    "<details><summary><b>History</b></summary><ul>" + j.history.map(function(h){ return "<li>" + tfmt(h.at) + " " + esc(h.actor_email || "system") + " " + esc(h.action) + " <span class='sa-f'>" + esc(JSON.stringify(h.details || {}).slice(0, 300)) + "</span></li>"; }).join("") + "</ul></details>");
}
function onPanel(e){
  var p = $("#seoPanel");
  if (e.target === p || e.target.closest("[data-x]")) return closePanel();
  var b = e.target.closest("button"); if (!b) return;
  var it = b.closest("[data-item]"), pg = b.closest("[data-page]");
  var run = function(body, msg){ b.disabled = true; api(body).then(function(r){ toast(msg + (r && r.published_now != null ? " (" + r.published_now + " pages live now; rebuild the site to show them)" : "")); openOrder(CUR); load(); }, function(er){ b.disabled = false; toast(er.message); }); };
  var a = b.getAttribute("data-a");
  if (a === "refund"){ if (confirm("Cancel this order, take its pages down and refund the host in full through Stripe?")) run({action: "admin_cancel", order_id: CUR, refund: "full"}, "Refunded"); }
  else if (a === "cancel"){ if (confirm("Cancel this order and take its pages down, with NO refund?")) run({action: "admin_cancel", order_id: CUR, refund: "none"}, "Cancelled"); }
  else if (a === "admin_send_back"){ var note = prompt("What should the host change? (emailed to them)"); if (note !== null) run({action: a, order_id: CUR, note: note}, "Sent back"); }
  else if (a) run({action: a, order_id: CUR}, "Done");
  else if (b.hasAttribute("data-rm")) run({action: "admin_remove_item", item_id: +it.getAttribute("data-item"), removed: b.getAttribute("data-rm") === "1"}, "Saved");
  else if (b.hasAttribute("data-rmp")) run({action: "admin_remove_page", page_id: +pg.getAttribute("data-page"), removed: b.getAttribute("data-rmp") === "1"}, "Saved");
  else if (b.hasAttribute("data-ed")){
    var q = $("b", it).textContent, ans = $("p", it).textContent;
    it.innerHTML = '<input type="text" style="width:100%" maxlength="190" value="' + esc(q) + '"><textarea style="width:100%;min-height:140px;margin-top:6px" maxlength="1900">' + esc(ans) + '</textarea><div class="sa-acts"><button class="btn sm" data-save>Save</button></div>';
  } else if (b.hasAttribute("data-save")) run({action: "admin_edit_item", item_id: +it.getAttribute("data-item"), question: $("input", it).value, answer: $("textarea", it).value}, "Saved");
}

document.addEventListener("click", function(e){
  var r = e.target.closest("#seoAdmin tr[data-o]"); if (r) openOrder(r.getAttribute("data-o"));
});
document.addEventListener("submit", function(e){ if (e.target.id === "saSet"){ e.preventDefault(); saveSettings(e.target); } });
var tab = $('nav.tabs [data-tab="mpseo"]'); if (tab) tab.addEventListener("click", load);
// badge with the number to approve, once signed in
var tries = 0, iv = setInterval(function(){ if (++tries > 30) return clearInterval(iv); if (window.BHAdmin && $("#viewApp") && !$("#viewApp").classList.contains("hidden")){ clearInterval(iv); load(); } }, 1000);
})();
