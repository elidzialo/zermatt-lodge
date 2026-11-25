/* Book Homes host portal: SEO Boost (paid guide pages for a listing, 25 Nov 2026).
   - Today: a "Boost your listing" card under #payBanner (or the status of an order: ready to check, live pages).
   - Listing editor: a small box under #edStatus for the open listing (#edit=<id> in the hash).
   - Modal: Mini and Max side by side, short questionnaire (real facts only), then Stripe Checkout (platform account).
     After paying (/host/?seo=paid&order=<id>) and from emails (/host/#seo=<id>): preview every page, edit or remove
     answers, then Send for approval. Book Homes approves, then pages go live 2-3 a day.
   Data: bookhomes-seo (host_status, host_order, host_checkout, host_confirm, host_edit_item, host_remove_item,
   host_remove_page, host_submit) through window.BHHost.api. No changes to host.js. See docs/HOST-TEAM.md. */
(function(){
"use strict";
var FN = "bookhomes-seo";
var $ = function(s, r){ return (r || document).querySelector(s); };
function esc(v){ return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]; }); }
function money(p){ var n = (+p || 0) / 100; return "\u00a3" + (n % 1 ? n.toFixed(2) : n.toFixed(0)); }
function api(body){
  if (!window.BHHost || !window.BHHost.api) return Promise.reject(new Error("Please wait a moment and try again."));
  return window.BHHost.api(FN, body);
}
var AS = false; try { AS = !!sessionStorage.getItem("bh_as"); } catch (e) {}
var ST = null, LOADING = null, LAST = 0;

var CSS = "#seoToday{margin:0 0 18px}" +
  ".seo-card{display:flex;gap:16px;align-items:center;justify-content:space-between;flex-wrap:wrap;border:1px solid var(--line-2,#ebebeb);border-radius:18px;padding:18px 20px;background:#fff}" +
  ".seo-card b{font-size:16.5px;display:block;margin-bottom:3px}.seo-card p{margin:0;color:var(--muted,#6a6a6a);font-size:14.5px;max-width:560px}" +
  ".seo-ed{border:1px solid var(--line-2,#ebebeb);border-radius:14px;padding:14px;margin:14px 0}.seo-ed b{display:block;font-size:15px}.seo-ed p{margin:4px 0 10px;font-size:13.5px;color:var(--muted,#6a6a6a)}" +
  ".seo-m{position:fixed;inset:0;z-index:300;background:rgba(0,0,0,.45);display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}" +
  ".seo-box{background:#fff;border-radius:20px;max-width:860px;width:100%;padding:24px;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.25)}" +
  ".seo-box h2{font-size:23px;margin:0 0 6px;padding-right:40px}.seo-box .sub{color:var(--muted,#6a6a6a);margin:0 0 18px;font-size:15px}" +
  ".seo-x{position:absolute;right:14px;top:14px;width:40px;height:40px;border-radius:50%;border:0;background:#f2f2f2;font-size:22px;cursor:pointer}" +
  ".seo-pk{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:0 0 16px}.seo-pk.one{grid-template-columns:1fr}" +
  ".seo-p{border:1.5px solid var(--line-2,#e3e3e3);border-radius:16px;padding:18px;position:relative;display:flex;flex-direction:column}" +
  ".seo-p.pop{border-color:#1F4D3A;box-shadow:0 0 0 1px #1F4D3A}.seo-p .tag{position:absolute;top:-11px;left:16px;background:#1F4D3A;color:#fff;font-size:12px;font-weight:800;border-radius:999px;padding:3px 10px}" +
  ".seo-p h3{margin:0;font-size:18px}.seo-p .pr{font-size:30px;font-weight:800;margin:6px 0 2px}.seo-p .pr small{font-size:14px;font-weight:600;color:var(--muted,#6a6a6a)}" +
  ".seo-p ul{margin:10px 0 16px;padding-left:18px;font-size:14.5px;line-height:1.55;flex:1}.seo-p .btn{width:100%}" +
  ".seo-fine{font-size:13.5px;color:var(--muted,#6a6a6a);line-height:1.55;margin:0}" +
  ".seo-f label{display:block;font-weight:600;font-size:14.5px;margin:14px 0 6px}.seo-f small{font-weight:400;color:var(--muted,#6a6a6a)}" +
  ".seo-f textarea,.seo-f input[type=text]{width:100%;border:1px solid #cfcfcf;border-radius:10px;padding:10px 12px;font:inherit;font-size:15px}" +
  ".seo-f textarea{min-height:84px}.seo-near{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-bottom:8px}" +
  ".seo-chips{display:flex;flex-wrap:wrap;gap:8px}.seo-chips label{display:inline-flex;gap:8px;align-items:center;margin:0;border:1px solid #d6d6d6;border-radius:999px;padding:7px 12px;font-weight:500;font-size:14px;cursor:pointer}" +
  ".seo-foot{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px;position:sticky;bottom:-24px;background:#fff;padding:12px 0}" +
  ".seo-pg{border:1px solid var(--line-2,#ebebeb);border-radius:14px;padding:14px 16px;margin:0 0 12px}.seo-pg.off{opacity:.55}" +
  ".seo-pg h3{margin:0 0 4px;font-size:17px}.seo-pg .meta{font-size:13px;color:var(--muted,#6a6a6a);margin:0 0 8px}" +
  ".seo-it{border-top:1px solid #f1f1f1;padding:10px 0}.seo-it.off{opacity:.5}.seo-it b{display:block;font-size:15px;margin-bottom:4px}.seo-it p{margin:0 0 6px;font-size:14.5px;line-height:1.55;white-space:pre-line}" +
  ".seo-it .acts,.seo-pg .acts{display:flex;gap:8px;flex-wrap:wrap}.seo-it textarea{min-height:140px}.seo-st{display:inline-block;font-size:12.5px;font-weight:700;border-radius:999px;padding:2px 10px;background:#eef2ef;color:#1F4D3A}" +
  "@media(max-width:700px){.seo-pk{grid-template-columns:1fr}.seo-near{grid-template-columns:1fr}.seo-box{padding:18px}}";
var st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);

var STATUS = {
  paid: ["Paid", "We are starting on your pages."], needs_setup: ["Paid", "We are getting ready to write your pages. You will get an email."],
  researching: ["Writing", "Researching what guests search for."], planning: ["Writing", "Planning your pages."], writing: ["Writing", "Writing your pages."],
  host_review: ["Ready to check", "Read your pages, change anything, then send them for approval."],
  admin_review: ["With Book Homes", "We are checking your pages."], publishing: ["Going live", "2 or 3 pages go live each day."],
  published: ["Live", "All your guide pages are live."], failed: ["Paused", "Something went wrong. Book Homes has been told and will sort it out."],
  cancelled: ["Cancelled", ""], refunded: ["Refunded", ""]
};

function load(force){
  if (!force && ST && Date.now() - LAST < 60000) return Promise.resolve(ST);
  if (LOADING) return LOADING;
  LOADING = api({action: "host_status"}).then(function(j){ ST = j; LAST = Date.now(); LOADING = null; drawToday(); drawEd(); return j; },
    function(e){ LOADING = null; throw e; });
  return LOADING;
}
function ordersFor(id){ return ((ST && ST.orders) || []).filter(function(o){ return +o.listing_id === +id && o.status !== "cancelled" && o.status !== "refunded"; }); }
function listingById(id){ return ((ST && ST.listings) || []).filter(function(l){ return +l.id === +id; })[0]; }

/* ---------- Today card ---------- */
function drawToday(){
  if (!ST || !ST.enabled) return;
  var host = $("#payBanner"); if (!host) return;
  var box = $("#seoToday");
  if (!box){ box = document.createElement("div"); box.id = "seoToday"; host.parentNode.insertBefore(box, host.nextSibling); }
  var ready = (ST.orders || []).filter(function(o){ return o.status === "host_review"; })[0];
  var live = ST.listings.filter(function(l){ return l.status === "approved"; });
  if (ready){
    var l = listingById(ready.listing_id) || {};
    box.innerHTML = '<div class="seo-card"><div><b>Your guide pages are ready to check</b><p>' + esc(ready.pages) + " pages for " + esc(l.title || "your listing") + ". Nothing goes live until you and Book Homes have checked them.</p></div>" +
      '<button type="button" class="btn" data-seo-order="' + esc(ready.id) + '">Check pages</button></div>';
    return;
  }
  var canBuy = live.filter(function(l){ return (l.offers || []).length && !ordersFor(l.id).length; });
  if (!canBuy.length){ box.innerHTML = ""; return; }
  box.innerHTML = '<div class="seo-card"><div><b>Boost your listing</b><p>Get guide pages that answer what guests search for about your home and area, written from your own facts. From ' +
    money(ST.packages.mini.price_pence) + ".</p></div>" + '<button type="button" class="btn" data-seo-buy="' + (canBuy.length === 1 ? canBuy[0].id : "") + '">See packages</button></div>';
}

/* ---------- editor box ---------- */
function edListing(){ var m = /edit=(\d+)/.exec(location.hash); return m ? +m[1] : null; }
function drawEd(){
  var side = $("#edStatus"), ed = $("#ed");
  if (!side || !ed || ed.classList.contains("hidden") || !ST || !ST.enabled) return;
  var id = edListing(), l = id && listingById(id), box = $("#seoEd");
  if (!l || l.status !== "approved"){ if (box) box.remove(); return; }
  if (!box){ box = document.createElement("div"); box.id = "seoEd"; box.className = "seo-ed"; }
  if (side.nextSibling !== box) side.parentNode.insertBefore(box, side.nextSibling);
  var os = ordersFor(id), o = os[0];
  var html = "<b>SEO Boost</b>";
  if (o){
    var s = STATUS[o.status] || [o.status, ""];
    html += '<p><span class="seo-st">' + esc(s[0]) + "</span> " + esc(o.live ? o.live + " of " + o.pages + " guide pages live." : s[1]) + "</p>" +
      '<button type="button" class="btn ghost sm" data-seo-order="' + esc(o.id) + '">Open guide pages</button>' +
      ((l.offers || []).length ? ' <button type="button" class="btn sm" data-seo-buy="' + id + '">Upgrade to Max</button>' : "");
  } else if ((l.offers || []).length){
    html += "<p>Guide pages that answer what guests search for about this home and area.</p>" + '<button type="button" class="btn sm" data-seo-buy="' + id + '">Boost this listing</button>';
  } else { box.remove(); return; }
  box.innerHTML = html;
}
var edObs = null;
function watchEd(){
  var side = $("#edStatus"); if (!side || edObs) return;
  edObs = new MutationObserver(function(){ if (ST) drawEd(); else load().catch(function(){}); });
  edObs.observe(side, {childList: true});
}

/* ---------- modal ---------- */
function modal(html){
  close();
  var m = document.createElement("div"); m.className = "seo-m"; m.id = "seoM"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true"); m.setAttribute("aria-label", "SEO Boost");
  m.innerHTML = '<div class="seo-box"><button type="button" class="seo-x" data-seo-close aria-label="Close">&times;</button>' + html + "</div>";
  document.body.appendChild(m); document.body.style.overflow = "hidden";
  m.addEventListener("click", function(e){ if (e.target === m || e.target.closest("[data-seo-close]")) close(); });
  return m;
}
function close(){ var m = $("#seoM"); if (m){ m.remove(); if (!$("#ed") || $("#ed").classList.contains("hidden")) document.body.style.overflow = ""; } if (/^#seo=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search); }
function err(m, t){ var b = $(".seo-msg", m); if (b) b.innerHTML = t ? '<div class="msg err">' + esc(t) + "</div>" : ""; }
var FINE = "Each guide page answers 4 to 6 real questions guests search for, written only from what you tell us and your listing. We never publish your street address, and we leave out anything we can't back with your facts, so you may get fewer pages than the package size. You check every page before it goes live, then 2 or 3 go live each day. Rankings are not guaranteed: Google and AI search tools decide what they show.";

function pkgCard(o, pop){
  var per = Math.round(o.price_pence / Math.max(1, o.pages));
  var bul = o.package === "mini" ? ["5 guide pages about your home and area", "Real search research for your area", "You check everything first"]
    : o.package === "max" ? ["30 guide pages, the most a listing can have", "Covers your area, nearby places, who it suits, parking, rules and more", "Real search research for your area", "Top answers added to your listing page too"]
    : [o.pages + " more guide pages (" + (o.pages + ((ST.packages.max.pages || 30) - o.pages)) + " in total)", "Pay only the difference", "Same research and checks"];
  return '<div class="seo-p' + (pop ? " pop" : "") + '">' + (pop ? '<span class="tag">Most popular</span>' : "") + "<h3>" + esc(o.label) + '</h3><div class="pr">' + money(o.price_pence) + " <small>one-off</small></div>" +
    '<small class="seo-fine">' + o.pages + " guide pages, about " + money(per) + " a page</small><ul>" + bul.map(function(b){ return "<li>" + esc(b) + "</li>"; }).join("") + "</ul>" +
    (AS ? '<p class="seo-fine">You are viewing as admin: the host has to buy this.</p>' : '<button type="button" class="btn' + (pop ? "" : " ghost") + '" data-seo-pick="' + esc(o.package) + '">Choose ' + esc(o.label) + "</button>") + "</div>";
}
function openBuy(id){
  load(true).then(function(){
    var live = ST.listings.filter(function(l){ return l.status === "approved" && (l.offers || []).length; });
    if (!live.length) return modal("<h2>Boost your listing</h2><p class='sub'>Your listing needs to be live first, or it already has the most guide pages.</p>");
    var l = (id && listingById(id)) || live[0];
    var pick = live.length > 1 ? '<label class="seo-f" style="display:block;margin:0 0 16px"><b>Listing</b> <select id="seoL" style="margin-left:8px;padding:8px;border-radius:8px">' +
      live.map(function(x){ return '<option value="' + x.id + '"' + (+x.id === +l.id ? " selected" : "") + ">" + esc(x.title) + "</option>"; }).join("") + "</select></label>" : "";
    var offers = l.offers || [];
    var m = modal("<h2>Boost " + esc(l.title) + '</h2><p class="sub">Guide pages that answer what guests search for, so more people find your home on Google and in AI answers like ChatGPT.</p>' + pick +
      '<div class="seo-pk' + (offers.length === 1 ? " one" : "") + '">' + offers.map(function(o){ return pkgCard(o, o.package === "max"); }).join("") + '</div><p class="seo-fine">' + esc(FINE) + "</p>");
    var sel = $("#seoL", m); if (sel) sel.addEventListener("change", function(){ openBuy(+sel.value); });
    m.addEventListener("click", function(e){ var b = e.target.closest("[data-seo-pick]"); if (b) openQuestions(l, offers.filter(function(o){ return o.package === b.getAttribute("data-seo-pick"); })[0]); });
  }).catch(function(e){ modal("<h2>Boost your listing</h2><div class='msg err'>" + esc(e.message) + "</div>"); });
}
function draftKey(l){ return "bh_seo_draft_" + l.id; }
function openQuestions(l, offer){
  var d = {}; try { d = JSON.parse(localStorage.getItem(draftKey(l)) || "{}"); } catch (e) {}
  var near = (d.nearby || []).concat([{}, {}, {}, {}, {}, {}]).slice(0, Math.max(6, (d.nearby || []).length));
  var aud = ST.audiences || {};
  var m = modal("<h2>About " + esc(l.title) + '</h2><p class="sub">' + esc(offer.label) + " - " + money(offer.price_pence) + ". Only write what is true: every answer is built from this and your listing. We never publish your street address.</p>" +
    '<form class="seo-f" id="seoF" novalidate>' +
    '<label for="sqSpecial">What makes your home special? <small>(a few sentences)</small></label><textarea id="sqSpecial" maxlength="1200" required>' + esc(d.special || "") + "</textarea>" +
    "<label>Nearby places you know well <small>(at least 2: parks, stations, shops, venues, hospitals; how you get there and roughly how long, in your words)</small></label>" +
    near.map(function(n, i){ return '<div class="seo-near"><input type="text" maxlength="100" placeholder="Place, e.g. Heaton Park" data-nn="' + i + '" value="' + esc(n.name || "") + '" aria-label="Place ' + (i + 1) + '"><input type="text" maxlength="200" placeholder="e.g. 10 minutes walk, or 5 minutes by car" data-nh="' + i + '" value="' + esc(n.how || "") + '" aria-label="How to get there ' + (i + 1) + '"></div>'; }).join("") +
    '<label>Who stays with you? <small>(tick all that fit)</small></label><div class="seo-chips">' +
    Object.keys(aud).map(function(k){ return '<label><input type="checkbox" value="' + esc(k) + '"' + ((d.guests || []).indexOf(k) > -1 ? " checked" : "") + "> " + esc(aud[k].charAt(0).toUpperCase() + aud[k].slice(1)) + "</label>"; }).join("") + "</div>" +
    '<label for="sqPark">Parking <small>(driveway, street, permits, van space)</small></label><input type="text" id="sqPark" maxlength="500" value="' + esc(d.parking || "") + '">' +
    '<label for="sqCheck">Arrival and check-in <small>(key safe, meet in person, early check-in...)</small></label><input type="text" id="sqCheck" maxlength="600" value="' + esc(d.checkin || "") + '">' +
    '<label for="sqRules">House rules guests should know</label><input type="text" id="sqRules" maxlength="800" value="' + esc(d.rules || "") + '">' +
    '<label for="sqTrans">Getting around <small>(buses, trams, trains, taxis, motorway)</small></label><input type="text" id="sqTrans" maxlength="600" value="' + esc(d.transport || "") + '">' +
    '<label for="sqExtra">Anything else guests often ask you?</label><textarea id="sqExtra" maxlength="1200">' + esc(d.extra || "") + "</textarea>" +
    '<p class="seo-fine" style="margin-top:14px">Rankings are not guaranteed. You check every page before it goes live.</p><div class="seo-msg" aria-live="polite"></div>' +
    '<div class="seo-foot"><button type="button" class="btn ghost" id="seoBack">Back</button><button type="submit" class="btn" id="seoPay">Pay ' + money(offer.price_pence) + "</button></div></form>");
  var f = $("#seoF", m);
  function collect(){
    var nearby = [];
    for (var i = 0; i < near.length; i++){ var nn = $('[data-nn="' + i + '"]', f).value.trim(); if (nn) nearby.push({name: nn, how: $('[data-nh="' + i + '"]', f).value.trim()}); }
    return {special: $("#sqSpecial", f).value.trim(), nearby: nearby, guests: Array.prototype.map.call(f.querySelectorAll(".seo-chips input:checked"), function(x){ return x.value; }),
      parking: $("#sqPark", f).value.trim(), checkin: $("#sqCheck", f).value.trim(), rules: $("#sqRules", f).value.trim(), transport: $("#sqTrans", f).value.trim(), extra: $("#sqExtra", f).value.trim()};
  }
  f.addEventListener("input", function(){ try { localStorage.setItem(draftKey(l), JSON.stringify(collect())); } catch (e) {} });
  $("#seoBack", m).addEventListener("click", function(){ openBuy(l.id); });
  f.addEventListener("submit", function(e){
    e.preventDefault(); err(m, "");
    var a = collect();
    if (a.special.length < 30) return err(m, "Tell us what makes your home special (a couple of sentences).");
    if (a.nearby.length < 2) return err(m, "Add at least 2 nearby places you know.");
    if (AS) return err(m, "You are viewing as admin: the host has to pay.");
    var b = $("#seoPay", m); b.disabled = true; b.textContent = "Opening secure payment...";
    api({action: "host_checkout", listing_id: l.id, package: offer.package, answers: a}).then(function(j){ location.href = j.url; },
      function(e2){ b.disabled = false; b.textContent = "Pay " + money(offer.price_pence); err(m, e2.message); });
  });
}

function openOrder(id, note){
  modal('<h2>Your guide pages</h2><p class="sub">Loading...</p>');
  api({action: "host_order", order_id: id}).then(function(j){ drawOrder(j, note); }, function(e){ modal("<h2>Your guide pages</h2><div class='msg err'>" + esc(e.message) + "</div>"); });
}
function drawOrder(j, note){
  var o = j.order, s = STATUS[o.status] || [o.status, ""], edit = o.status === "host_review" && !AS;
  var l = listingById(o.listing_id) || {};
  var pages = j.pages.filter(function(p){ return p.status !== "removed" || edit; });
  var html = "<h2>Guide pages for " + esc(l.title || "your listing") + '</h2><p class="sub"><span class="seo-st">' + esc(s[0]) + "</span> " + esc(s[1]) + "</p>" +
    (note ? '<div class="msg ok">' + esc(note) + "</div>" : "") +
    (pages.length ? "" : '<p class="seo-fine">Your pages will show here once they are written, usually within a day. We will email you.</p>') +
    pages.map(function(p){
      var off = p.status === "removed" || p.status === "unpublished";
      return '<div class="seo-pg' + (off ? " off" : "") + '" data-page="' + p.id + '"><h3>' + esc(p.title) + "</h3>" +
        '<p class="meta">' + (p.status === "published" && l.slug ? '<a href="/' + esc(l.slug) + "/guide/" + esc(p.topic_slug) + '" target="_blank" rel="noopener">Live page</a>' : esc({draft: "Not live yet", queued: "Approved, going live soon", removed: "Removed", unpublished: "Taken down"}[p.status] || "")) +
        (p.keyword ? " - search: " + esc(p.keyword) : "") + "</p>" +
        (p.intro ? '<p class="seo-fine">' + esc(p.intro) + "</p>" : "") +
        p.items.map(function(it){
          return '<div class="seo-it' + (it.removed ? " off" : "") + '" data-item="' + it.id + '"><b>' + esc(it.question) + "</b><p>" + esc(it.answer) + "</p>" +
            (edit ? '<div class="acts"><button type="button" class="btn ghost sm" data-seo-edit>Edit</button><button type="button" class="btn ghost sm" data-seo-rm="' + (it.removed ? "0" : "1") + '">' + (it.removed ? "Put back" : "Remove") + "</button></div>" : "") + "</div>";
        }).join("") +
        (edit ? '<div class="acts" style="margin-top:8px"><button type="button" class="btn ghost sm" data-seo-rmpage="' + (p.status === "removed" ? "0" : "1") + '">' + (p.status === "removed" ? "Put page back" : "Remove whole page") + "</button></div>" : "") + "</div>";
    }).join("") +
    '<div class="seo-msg" aria-live="polite"></div>' +
    (edit ? '<div class="seo-foot"><button type="button" class="btn ghost" data-seo-close>Later</button><button type="button" class="btn" id="seoSubmit">Send for approval</button></div>' : "") +
    '<p class="seo-fine">Rankings are not guaranteed. Questions? Reply to any Book Homes email.</p>';
  var m = modal(html);
  m.addEventListener("click", function(e){
    var it = e.target.closest("[data-item]"), b = e.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-seo-rm")) act({action: "host_remove_item", item_id: +it.getAttribute("data-item"), removed: b.getAttribute("data-seo-rm") === "1"}, o.id);
    else if (b.hasAttribute("data-seo-rmpage")) act({action: "host_remove_page", page_id: +b.closest("[data-page]").getAttribute("data-page"), removed: b.getAttribute("data-seo-rmpage") === "1"}, o.id);
    else if (b.hasAttribute("data-seo-edit")){
      var q = $("b", it).textContent, a = $("p", it).textContent;
      it.innerHTML = '<div class="seo-f"><label>Question</label><input type="text" maxlength="190" value="' + esc(q) + '"><label>Answer</label><textarea maxlength="1900">' + esc(a) + "</textarea></div>" +
        '<div class="acts" style="margin-top:8px"><button type="button" class="btn sm" data-seo-save>Save</button><button type="button" class="btn ghost sm" data-seo-cancel>Cancel</button></div>';
    } else if (b.hasAttribute("data-seo-cancel")) openOrder(o.id);
    else if (b.hasAttribute("data-seo-save")) act({action: "host_edit_item", item_id: +it.getAttribute("data-item"), question: $("input", it).value, answer: $("textarea", it).value}, o.id);
    else if (b.id === "seoSubmit"){
      b.disabled = true;
      api({action: "host_submit", order_id: o.id}).then(function(){ load(true).catch(function(){}); openOrder(o.id, "Thanks. Book Homes will check your pages, then they go live 2 or 3 a day."); },
        function(e2){ b.disabled = false; err(m, e2.message); });
    }
  });
}
function act(body, orderId){
  var m = $("#seoM"), y = m ? m.scrollTop : 0;
  api(body).then(function(){ return api({action: "host_order", order_id: orderId}); }).then(function(j){ drawOrder(j); var m2 = $("#seoM"); if (m2) m2.scrollTop = y; },
    function(e){ err($("#seoM"), e.message); });
}

/* ---------- wiring ---------- */
document.addEventListener("click", function(e){
  var b = e.target.closest("[data-seo-buy],[data-seo-order]"); if (!b) return;
  if (b.hasAttribute("data-seo-buy")) openBuy(+b.getAttribute("data-seo-buy") || null); else openOrder(b.getAttribute("data-seo-order"));
});
var started = false;
document.addEventListener("bh:host", function(e){
  if (!e.detail || e.detail.type !== "me") return;
  watchEd();
  load(!started).then(function(){
    if (started) return; started = true;
    var q = new URLSearchParams(location.search), h = /^#seo=([0-9a-f-]{36})$/.exec(location.hash);
    if (q.get("seo") === "paid" && q.get("order")){
      var id = q.get("order"); history.replaceState(null, "", location.pathname + location.hash);
      api({action: "host_confirm", order_id: id}).catch(function(){}).then(function(){ load(true).catch(function(){}); openOrder(id, "Payment received, thank you. We are writing your pages now and will email you when they are ready to check (usually within a day)."); });
    } else if (q.get("seo") === "cancelled"){
      history.replaceState(null, "", location.pathname + location.hash);
    } else if (h) openOrder(h[1]);
  }).catch(function(){});
});
window.addEventListener("hashchange", function(){ if (ST) drawEd(); var h = /^#seo=([0-9a-f-]{36})$/.exec(location.hash); if (h && !$("#seoM")) openOrder(h[1]); });
window.BHSeo = {open: openBuy, order: openOrder, reload: function(){ return load(true); }};
})();
