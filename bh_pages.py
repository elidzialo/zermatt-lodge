"""Static marketplace pages that don't depend on a single listing (called by build_listings.build()).
Returns the URLs that belong in the sitemap. Legal pages are plain-English DRAFTS for a solicitor to review."""
import json

from build_listings import (CALENDAR, DOMAIN, COMMISSION_TEXT, DP, asset_v, booking_card, end, esc, footer, head,
                            header, listing_assets, write)
from bh_icons import icon

DRAFT = '<p class="draft">Draft - have a solicitor review before relying on this.</p>'
OPERATOR = "[Operator: company name, company number and registered office - to be confirmed]"


def text_page(path, title, desc, body, robots="index, follow", schema=None, extra=""):
    return head(title, desc, path, robots=robots, schema=schema, extra=extra) + header() + f'<main class="page">{body}</main>\n' + footer() + end()


def dynamic_listing():
    """Fallback for a listing approved after the last build (/<slug> rewrites here): same layout, filled in the browser from the API."""
    skeleton = {"id": 0, "slug": "", "max_guests": 16, "from_price": None, "cleaning_fee": 0}
    body = f"""<main class="lp" id="content">
<div class="wrap lp-top">
  <div class="lp-titlebar"><h1 id="lpTitle">Loading...</h1><div class="lp-act"><button type="button" class="tbtn" data-share>{icon("share")}<span>Share</span></button><button type="button" class="tbtn heart-btn" id="lpSave" data-save="0" aria-pressed="false">{icon("heart")}<span>Save</span></button></div></div>
  <div class="gal" id="gal"><div class="gal-track" id="galTrack"></div>
    <div class="gal-over"><a class="gbtn" href="/" aria-label="Back to all homes">{icon("arrow_l")}</a><span class="gal-r"><button type="button" class="gbtn" data-share aria-label="Share">{icon("share")}</button></span></div>
    <span class="gal-count" id="galCount" aria-hidden="true"></span><button type="button" class="gal-all" data-lb="0">{icon("grid")}Show all photos</button></div>
</div>
<div class="wrap lp-grid">
<div class="lp-main">
  <section class="lp-sum"><h2 id="lpSub"></h2><p id="lpFacts"></p></section>
  <section class="lp-host"><span class="av big" id="lpAv">H</span><div><b id="lpHost"></b><p class="muted" id="lpDisc"></p></div></section>
  <section class="lp-sec lp-about"><h2 class="sr-only">About this home</h2><div class="clamp" id="aboutTxt"></div><button type="button" class="morebtn" data-modal="mAbout">Show more{icon("chev_r")}</button></section>
  <section class="lp-sec" id="lpAmenWrap" hidden><h2>What this place offers</h2><ul class="amen" id="lpAmen"></ul></section>
  <section class="lp-sec" id="lpKosher" hidden><h2>Kosher and Shabbat</h2><div class="kbox"><ul class="kgrid" id="lpKosherList"></ul><p class="note">Details provided by the host. Book Homes does not inspect or certify kashrut, and this is not a certification.</p></div></section>
  {CALENDAR}
</div>
{booking_card(dict(skeleton, max_guests=16))}
</div>
<div class="wrap lp-full">
  <section class="lp-sec" id="location"><h2>Where you'll be</h2><div class="lmap" id="lmap" role="region" aria-label="Map of the approximate area"></div><p class="where">The map shows the area only. The exact address is shared after booking.</p></section>
  <section class="lp-sec"><h2>Things to know</h2><div class="know"><div><h3>House rules</h3><ul id="lpRules"></ul></div><div><h3>Cancellation policy</h3><ul><li>{icon("calendar")}<span id="lpPolicy"></span></li></ul></div></div></section>
</div>
</main>
<div class="modal" id="mAbout" role="dialog" aria-modal="true" aria-labelledby="mAboutH" hidden><div class="modal-box"><div class="modal-top"><button type="button" class="iconbtn" data-close aria-label="Close">{icon("x")}</button></div><h2 id="mAboutH">About this home</h2><div id="aboutFull"></div></div></div>
<div class="lb" id="lbox" role="dialog" aria-modal="true" aria-label="All photos" hidden><div class="lb-top"><button type="button" class="iconbtn" id="lbClose" aria-label="Close photos">{icon("chev_l")}</button><span></span><span></span></div><div class="lbg" id="lbg"></div></div>
<div class="mbook" id="mbook"><div id="mbookPrice"><b>Add dates</b><small>Add dates for the total</small></div><button type="button" class="btn sbtn" id="mbookBtn">Reserve</button></div>
{DP}
<script src="/assets/stay-dynamic.js?v={asset_v('stay-dynamic.js')}" defer></script>
<script src="/assets/bh-messages.js?v={asset_v('bh-messages.js')}" defer></script>
"""
    page = head("Stay | Book Homes", "A home on Book Homes.", "/stays/listing", robots="noindex, nofollow", extra=listing_assets(), body_class="has-mbook listing") + header("listing") + body + footer() + end()
    return page


BOOKED = """<div id="bkState"><h1>Confirming your booking...</h1><p>Please keep this page open for a moment.</p></div>
<script src="/assets/booked.js" defer></script>"""

REVIEW = """<h1>How was your stay?</h1>
<div id="rvBox"><p>Loading...</p></div>
<script src="/assets/review.js" defer></script>"""



TERMS_HOSTS = f"""{DRAFT}<h1>Host terms</h1><p>Last updated: 19 November 2026</p>
<p>These terms are between you (the host) and Book Homes, {OPERATOR}. They apply when you list a property on bookhomes.co.uk.</p>
<h2>1. What Book Homes does</h2><p>Book Homes is an online booking platform. We show your listing, take the guest's payment and pass your share to you. The stay itself is a contract between you and the guest.</p>
<h2>2. Your account</h2><ul class="dots"><li>Give us true details about yourself and tell us if you host as a business (trader) or as a private individual. We show this to guests.</li><li>Keep your password and 2-step verification safe. You are responsible for what happens in your account.</li><li>We approve each host and each listing before it goes live, and we can refuse, pause or remove a listing.</li></ul>
<h2>3. Your listing</h2><ul class="dots"><li>Everything must be accurate and kept up to date: photos, rooms, beds, amenities, prices and house rules.</li><li>Do not show the street address or house number. Guests get the address after booking.</li><li>No fake reviews, no "was" prices or invented discounts, no misleading claims.</li><li>Kosher, Shabbat, business and other features are your own description. Do not claim a certification or show a certification logo unless you hold that certification in writing.</li></ul>
<h2>4. Your property and the law</h2><p>You confirm you have the right to let the property for short stays (as owner or with the owner's or landlord's written permission, and any mortgage lender or freeholder consent), and that you meet the law and keep it up to date, including gas and electrical safety, fire safety, smoke and carbon monoxide alarms, insurance, tax, data protection and any local registration or licensing.</p>
<h2>5. Calendars and bookings</h2><ul class="dots"><li>Keep your Book Homes calendar right. If you also list elsewhere, add your iCal links so we can block those dates, and add our export link to the other sites.</li><li>Accepted bookings are confirmed straight away. If you cancel a confirmed booking, the guest gets a full refund and we may charge you any costs we incur.</li></ul>
<h2>6. Money</h2><ul class="dots"><li>Guests pay the total price shown (nights, cleaning fee and any weekly or monthly discount you set). There is no guest booking fee.</li><li>Our commission is currently {COMMISSION_TEXT} of each booking (shown in your host dashboard), unless we agree a different rate with you in writing. We can change the standard rate with 30 days' notice.</li><li>Payouts: once you connect Stripe, the guest's card payment is taken on your own Stripe account. Book Homes keeps its commission and Stripe takes its standard card processing fee from your share, then Stripe pays the rest to your bank automatically. Stripe checks your identity and may hold or delay payouts under its own terms. Until you connect, we take the payment and pay you by bank transfer after the guest checks in.</li><li>Refunds follow the cancellation policy on your listing. If a booking is refunded, your payout is reduced or reversed.</li><li>You are responsible for your own tax and VAT. We provide statements of your bookings.</li></ul>
<h2>7. Guests' personal data</h2><p>We share the guest's name, email and phone with you for the booking only. Use them only to manage the stay and keep them safe, under UK GDPR.</p>
<h2>8. Ending</h2><p>You can close your account at any time once your future bookings are completed or cancelled. We can suspend or close an account that breaks these terms.</p>
<h2>9. Liability</h2><p>We are not responsible for the condition of your property or what happens during a stay. Nothing in these terms limits liability that cannot be limited by law.</p>
<h2>10. Law</h2><p>These terms are governed by the law of England and Wales.</p>"""

TERMS_GUESTS = f"""{DRAFT}<h1>Guest terms</h1><p>Last updated: 19 November 2026</p>
<p>These terms apply when you book a stay on bookhomes.co.uk, run by Book Homes, {OPERATOR}.</p>
<h2>1. Who you are booking with</h2><p>Book Homes is the booking platform. Your stay is provided by the host shown on the listing, and your contract for the stay is with that host. Each listing says whether the host is a business (trader) or a private individual. If you book from a private individual, some consumer rights that apply to businesses may not apply.</p>
<h2>2. Price</h2><p>The total shown before you pay is what you pay: nights, cleaning fee and any discount. There is no booking fee. You pay by card on a secure Stripe page.</p>
<h2>3. Your booking</h2><ul class="dots"><li>Your dates are held for a few minutes while you pay. Your booking is confirmed when payment succeeds, and you get a confirmation email.</li><li>If the dates were taken by someone else at the same moment, we refund you in full automatically.</li><li>After booking you can see the host's phone and WhatsApp to arrange your arrival.</li></ul>
<h2>4. Cancellations</h2><p>The cancellation policy on the listing applies (Flexible, Moderate or Strict). If the host cancels, you get a full refund.</p>
<h2>5. During your stay</h2><ul class="dots"><li>Follow the house rules, respect the neighbours, and do not exceed the number of guests booked.</li><li>Parties and events are not allowed unless the listing says so. Bookings found to be for parties can be cancelled.</li><li>You are responsible for damage caused by you or your guests.</li></ul>
<h2>6. Listing details</h2><p>Hosts describe their own homes. Kosher, Shabbat and business features are as described by the host and are not checked or certified by Book Homes. Ask the host if something matters to you.</p>
<h2>7. Reviews</h2><p>Only guests who completed a stay booked on Book Homes can leave a review, using the link we email after checkout. Reviews must be honest and about your own stay.</p>
<h2>8. Problems</h2><p>Contact the host first. If that doesn't solve it, contact us and we will try to help.</p>
<h2>9. Law</h2><p>These terms are governed by the law of England and Wales. If you live in Scotland or Northern Ireland you can also use your local courts.</p>"""

PRIVACY = f"""{DRAFT}<h1>Privacy notice</h1><p>Last updated: 19 November 2026</p>
<p>This notice explains how Book Homes, {OPERATOR}, uses personal data. We are the controller for the data described here.</p>
<h2>What we collect</h2><ul class="dots"><li>Guests: name, email, phone, booking dates and guests, company name if you ask for a company receipt, and payment status (card details are handled by Stripe, not us).</li><li>Hosts: name, email, phone, WhatsApp, company and trader status, listing details and photos, calendar links, and payout status (bank and ID details are handled by Stripe).</li><li>Alerts and sign-ups: your email and the dates you asked about.</li><li>Technical: basic logs needed to run and secure the site.</li></ul>
<h2>Why we use it</h2><ul class="dots"><li>To take and manage bookings and payments (contract).</li><li>To share guest contact details with the host of the booking (contract).</li><li>To send the emails you asked for, such as date alerts and review requests after a stay (legitimate interests; you can opt out at any time).</li><li>To keep the platform safe and meet legal duties such as tax records (legal obligation and legitimate interests).</li></ul>
<h2>Who we share it with</h2><p>The host of your booking; Stripe (payments); Supabase (database and sign-in); Vercel (website hosting); our email provider; and authorities where the law requires. Some providers process data outside the UK under approved safeguards.</p>
<h2>How long we keep it</h2><p>Booking and payment records for 6 years for tax. Alerts until sent or 12 months. Accounts until closed, then as needed for legal claims.</p>
<h2>Your rights</h2><p>You can ask for a copy of your data, to correct it, delete it, restrict or object to its use, and to move it. Contact us using the details on the contact page. You can also complain to the Information Commissioner's Office (ico.org.uk).</p>
<h2>Cookies</h2><p>We use only the storage needed to keep you signed in and to run the booking calendar. We don't use advertising cookies.</p>
<h2>Analytics</h2><p>We count visits with our own cookie-free analytics, so no data goes to Google or other trackers. Your browser keeps a random ID so we can count unique visitors, and we record the page, the site you came from, your device type and a rough location (town or city) worked out from your connection. We never store your IP address. Raw visit data is deleted after 13 months. If your browser sends Do Not Track or Global Privacy Control, we don't count you at all.</p>"""


TRIPS = f"""<main class="wrap trips" id="content">
<div class="tr-top" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><h1 style="margin-right:auto">Trips</h1><a class="tr-pill" href="/trips/messages">{icon("chat")}Messages</a></div>
<div id="trBody" aria-live="polite">
  <div class="tr-sk" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></div>
  <div class="tr-sk" aria-hidden="true"><i></i><span><b></b><b></b><b></b></span></div>
</div>
<div class="tr-empty" id="trOut" hidden><span class="e-ic">{icon("user")}</span><h2>Log in to see your trips</h2><p>Use the email you booked with. Your confirmation email also has your dates, the address and the host's number.</p><a class="btn" href="/host?next=/trips">Log in</a></div>
<div class="tr-empty" id="trNone" hidden><span class="e-ic">{icon("calendar")}</span><h2>No trips booked yet</h2><p>When you book a home with <b id="trEmail"></b>, your trip shows here with the dates and the host's number.</p><a class="btn" href="/">Find a home</a> <a class="btn ghost" href="/saved">Saved homes</a></div>
<p class="tr-help" id="trHelp" hidden>Booked with a different email? Log out and log in with that one, or check your confirmation email.</p>
</main>
"""
TRIPS_CSS = """<style>
.trips{max-width:1440px;padding-bottom:80px}
.tr-up,.trips .tr-sk{max-width:920px}
.tr-top{padding:32px 0 8px}
.tr-top h1{font-size:clamp(28px,4vw,36px);font-weight:800;letter-spacing:-.02em}
.tr-h{font-size:22px;font-weight:700;letter-spacing:-.01em;margin:28px 0 14px}
.tr-up{display:grid;gap:20px}
.tr-card{display:grid;grid-template-columns:minmax(0,1fr) 300px;border:1px solid var(--line);border-radius:20px;overflow:hidden;background:#fff;box-shadow:0 6px 20px rgba(0,0,0,.06)}
.tr-card .tr-ph{order:2;background:var(--soft);min-height:220px;display:grid;place-items:center;color:var(--muted)}
.tr-card .tr-ph img{width:100%;height:100%;object-fit:cover;display:block}
.tr-in{padding:22px 24px;display:flex;flex-direction:column;gap:4px;min-width:0}
.tr-when{font-size:13.5px;font-weight:700;color:var(--brand,#1f4d3a)}
.tr-in h3{font-size:22px;font-weight:700;letter-spacing:-.01em;line-height:1.25}
.tr-in h3 a{color:inherit;text-decoration:none}.tr-in h3 a:hover{text-decoration:underline}
.tr-area{color:var(--muted);font-size:14.5px}
.tr-dates{display:grid;grid-template-columns:1fr 1fr;margin:14px 0 4px;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.tr-dates>div{padding:10px 14px}.tr-dates>div+div{border-left:1px solid var(--line)}
.tr-dates small{display:block;font-size:12px;font-weight:700;color:var(--muted)}
.tr-dates b{display:block;font-size:15px;margin-top:2px}
.tr-meta{font-size:14px;color:var(--ink-2,#3f3f3f);margin-top:6px}
.tr-host{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--line)}
.tr-host span{font-size:14px;margin-right:auto}
.tr-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:14px;font-weight:600;text-decoration:none;color:var(--ink);min-height:40px}
.tr-pill:hover{border-color:var(--ink)}.tr-pill .ic{width:16px;height:16px}
.tr-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px 20px}
.tr-mini{text-decoration:none;color:inherit;display:flex;flex-direction:column;gap:4px;min-width:0}
.tr-mini .tr-ph{aspect-ratio:4/3;border-radius:14px;overflow:hidden;background:var(--soft);display:grid;place-items:center;color:var(--muted);margin-bottom:6px}
.tr-mini .tr-ph img{width:100%;height:100%;object-fit:cover}
.tr-mini b{font-size:15.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tr-mini small{font-size:14px;color:var(--muted)}
.tr-x{display:inline-flex;align-self:flex-start;font-size:12px;font-weight:700;border-radius:999px;padding:2px 9px;background:#f1f1f1;color:#555;margin-top:2px}
.tr-empty{text-align:center;padding:56px 16px;max-width:460px;margin:0 auto}
.tr-empty .e-ic{background:var(--soft);box-shadow:none;color:var(--brand,#1f4d3a)}
.tr-empty .e-ic .ic{width:26px;height:26px}
.tr-empty h2{font-size:22px;margin-bottom:8px}
.tr-empty p{color:var(--muted);margin-bottom:20px}
.tr-empty .btn{margin:4px}
.tr-help{color:var(--muted);font-size:14px;margin-top:32px}
.tr-sk{display:grid;grid-template-columns:minmax(0,1fr) 300px;border:1px solid var(--line);border-radius:20px;overflow:hidden;margin-top:20px;height:236px}
.tr-sk i{order:2;background:var(--soft)}
.tr-sk span{padding:24px;display:flex;flex-direction:column;gap:12px}
.tr-sk b{display:block;height:14px;border-radius:7px;background:var(--soft);width:40%}
.tr-sk b:nth-child(2){height:22px;width:70%}.tr-sk b:nth-child(3){width:55%}
@media (prefers-reduced-motion:no-preference){.tr-sk i,.tr-sk b{animation:trp 1.4s ease-in-out infinite}}
@keyframes trp{50%{opacity:.55}}
@media (max-width:720px){
  .tr-card,.tr-sk{grid-template-columns:1fr}
  .tr-card .tr-ph,.tr-sk i{order:0;min-height:0;aspect-ratio:16/9}
  .tr-sk{height:auto}.tr-sk i{display:block}
  .tr-in{padding:18px}
  .tr-host span{flex-basis:100%}
  .tr-grid{grid-template-columns:1fr 1fr;gap:18px 12px}
}
</style>"""


MESSAGES = f"""<main class="wrap im" id="content">
<div class="im-top"><h1>Messages</h1><a href="/trips">Trips</a></div>
<p class="tr-help" id="imSignin" hidden style="margin:0 0 14px"><a href="/host?next=/trips/messages">Log in</a> to see all your messages.</p>
<div class="im-grid" id="imGrid"><div class="im-list" id="imList" aria-label="Conversations"><div class="im-empty">Loading...</div></div><div class="im-pane" id="imPane"><div class="im-empty">Choose a conversation.</div></div></div>
<div id="imRoot"></div>
</main>
"""


def messages_page():
    extra = TRIPS_CSS + f'\n<script src="/assets/bh-messages.js?v={asset_v("bh-messages.js")}" defer></script>'
    return head("Messages | Book Homes", "Your Book Homes messages.", "/trips/messages", robots="noindex, nofollow", extra=extra) + header() + MESSAGES + footer() + end()


def trips_page():
    extra = TRIPS_CSS + f'\n<script src="/assets/trips.js?v={asset_v("trips.js")}" defer></script>'
    return head("Trips | Book Homes", "Your Book Homes trips.", "/trips", robots="noindex, nofollow", extra=extra) + header() + TRIPS + footer() + end()


NOT_FOUND = """<h1>This page could not be found</h1>
<p>The link may be old or mistyped. Try one of these instead.</p>
<p><a class="btn" href="/">See all homes</a> <a class="btn ghost" href="/guides">Liverpool guides</a></p>"""


def write_all(listings=None):
    # Served by Vercel with a real 404 status for any path that matches no file or rewrite (e.g. /guides/old-guide)
    write("404.html", text_page("/404", "Page not found | Book Homes", "This page could not be found.", NOT_FOUND, robots="noindex, nofollow"))
    write("stays/listing/index.html", dynamic_listing())
    write("stays/booked/index.html", text_page("/stays/booked", "Your booking | Book Homes", "Your Book Homes booking.", BOOKED, robots="noindex, nofollow"))
    write("stays/review/index.html", text_page("/stays/review", "Review your stay | Book Homes", "Review your stay.", REVIEW, robots="noindex, nofollow"))
    import bh_hosts  # /become-a-host and /hosts/* (host acquisition pages, 25 Nov 2026)
    host_urls = bh_hosts.write_all(listings)
    write("terms/hosts/index.html", text_page("/terms/hosts", "Host terms (draft) | Book Homes", "Plain-English terms for hosts listing a home on Book Homes: listings, bookings, payouts, cancellations and fees. Draft.", TERMS_HOSTS))
    write("terms/guests/index.html", text_page("/terms/guests", "Guest terms (draft) | Book Homes", "Plain-English terms for guests booking a home on Book Homes: price, booking, cancellations, your stay, reviews and what to do if there is a problem. Draft.", TERMS_GUESTS))
    write("trips/index.html", trips_page())
    write("trips/messages/index.html", messages_page())
    write("privacy/index.html", text_page("/privacy", "Privacy notice (draft) | Book Homes", "How Book Homes collects, uses and protects personal data for guests and hosts, who we share it with, how long we keep it, and your rights. Draft.", PRIVACY))
    return host_urls + [f"{DOMAIN}/terms/hosts", f"{DOMAIN}/terms/guests", f"{DOMAIN}/privacy"]
