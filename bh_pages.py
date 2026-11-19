"""Static marketplace pages that don't depend on a single listing (called by build_listings.build()).
Returns the URLs that belong in the sitemap. Legal pages are plain-English DRAFTS for a solicitor to review."""
import json

from build_listings import (DOMAIN, COMMISSION_TEXT, DP, LISTING_ASSETS, booking_card, end, esc, footer, head,
                            header, write)
from bh_icons import icon

DRAFT = '<p class="draft">Draft - have a solicitor review before relying on this.</p>'
OPERATOR = "[Operator: company name, company number and registered office - to be confirmed]"


def text_page(path, title, desc, body, robots="index, follow", schema=None, extra=""):
    return head(title, desc, path, robots=robots, schema=schema, extra=extra) + header() + f'<main class="page">{body}</main>\n' + footer() + end()


def dynamic_listing():
    """Fallback for a listing approved after the last build: same layout, filled in the browser from the API."""
    skeleton = {"id": 0, "slug": "", "max_guests": 16, "base_price": None, "cleaning_fee": 0}
    body = f"""<main class="wrap" id="content">
<div class="lp-head"><h1 id="lpTitle">Loading...</h1><div class="meta" id="lpMeta"></div></div>
<div class="gal" id="lpGal"></div>
<div class="lp">
<div>
  <section><h2 id="lpFacts" style="margin-bottom:4px"></h2></section>
  <section><div class="hostline"><span class="av" id="lpAv">H</span><div><b id="lpHost"></b><p class="disclose" id="lpDisc"></p></div></div></section>
  <section><h2>About this home</h2><p class="desc" id="lpDesc"></p></section>
  <section id="lpAmenWrap" hidden><h2>What this place offers</h2><ul class="amen" id="lpAmen"></ul></section>
  <section id="lpKosher" hidden><h2>Kosher and Shabbat</h2><div class="kbox"><ul class="kgrid" id="lpKosherList"></ul><p class="note">Details provided by the host. Book Homes does not inspect or certify kashrut, and this is not a certification.</p></div></section>
  <section id="book" aria-labelledby="bookH"><h2 id="bookH" tabindex="-1">Select dates</h2>
    <div class="cal-card" style="padding:0;border:0;box-shadow:none">
      <div class="cal-top"><button type="button" class="cal-nav" id="calPrev" aria-label="Previous month">‹</button><p id="calStatus" aria-live="polite">Select your check-in date</p><button type="button" class="cal-nav" id="calNext" aria-label="Next month">›</button></div>
      <div class="months" id="months" aria-label="Availability calendar"><p class="bd-empty">Loading availability...</p></div>
      <div class="cal-foot"><ul class="legend"><li><i class="lg-a"></i>Available</li><li><i class="lg-s"></i>Your stay</li><li><i class="lg-u"></i>Unavailable</li></ul><button type="button" class="link" id="clearDates">Clear dates</button></div>
      <p class="cal-note" id="calNote" hidden></p><span id="liveTxt" hidden></span>
    </div>
  </section>
  <section><h2>Where you'll be</h2><div class="lmap" id="lmap" role="region" aria-label="Map of the approximate area"></div><p style="color:var(--muted);margin-top:8px">The map shows the area only. The exact address is shared after booking.</p></section>
</div>
{booking_card(dict(skeleton, max_guests=16))}
</div>
</main>
<div class="lb" id="lbox" role="dialog" aria-modal="true" aria-label="All photos" hidden><button type="button" class="close" id="lbClose">‹ Back</button><div class="lbg" id="lbg"></div></div>
<div class="mbook" id="mbook"><div id="mbookPrice"><b>Add dates</b><small>for the total price</small></div><button type="button" class="btn" id="mbookBtn">Check dates</button></div>
{DP}
<script src="/assets/stay-dynamic.js" defer></script>
"""
    page = head("Stay | Book Homes", "A home on Book Homes.", "/stays/listing", robots="noindex, nofollow", extra=LISTING_ASSETS) + header() + body + '<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="" defer></script>\n' + footer() + end()
    return page.replace("<body>", '<body class="has-mbook">', 1)


BOOKED = """<div id="bkState"><h1>Confirming your booking...</h1><p>Please keep this page open for a moment.</p></div>
<script src="/assets/booked.js" defer></script>"""

REVIEW = """<h1>How was your stay?</h1>
<div id="rvBox"><p>Loading...</p></div>
<script src="/assets/review.js" defer></script>"""


def host_landing():
    feat = [
        ("check", "No guest booking fees", "Guests see one total price, cleaning included. That helps your home stand out against platforms that add a service fee."),
        ("bolt", "Paid automatically", "Guests pay by card through Stripe. Payouts go straight to your bank once you connect payouts (or by bank transfer until then)."),
        ("calendar", "Works with Airbnb and Booking.com", "Paste your iCal links. We import your bookings every 15 minutes and give you one link to export ours, so nothing double-books."),
        ("kosher", "Reach kosher and Shabbat-observant guests", "Tell guests about your kosher kitchen, Shabbat set-up and the nearest shul. A rare filter that guests search for."),
        ("work", "Work crews and business stays", "Show desks, wifi speed, van parking and separate beds. Guests can get a company receipt at checkout."),
        ("shield", "You stay in control", "Your prices, your minimum stay, your house rules. Each listing is checked by us before it goes live."),
    ]
    tiles = "".join(f'<div>{icon(i)}<b>{esc(t)}</b><p>{esc(d)}</p></div>' for i, t, d in feat)
    schema = {"@context": "https://schema.org", "@type": "WebPage", "name": "List your Liverpool property on Book Homes", "url": DOMAIN + "/become-a-host",
              "description": "Liverpool owners: list your holiday let or serviced accommodation on Book Homes. No guest fees, simple commission, Airbnb and Booking.com calendar sync."}
    body = f"""<section class="hero2"><h1 class="serif">List your Liverpool home on Book Homes</h1>
<p>For owners of holiday lets, serviced accommodation and family homes in Liverpool and Merseyside. Guests book direct with no booking fees, and you keep control.</p>
<a class="btn" href="/host?signup=1">Get started</a> <a class="btn ghost" href="/host">Host login</a></section>
<div class="feat">{tiles}</div>
<h2>How it works</h2>
<ol class="dots" style="list-style:decimal;padding-left:22px">
<li>Create your host account with your email and a password. You can add 2-step verification later; it's needed before payouts.</li>
<li>Tell us if you host as a business (trader) or a private individual. Guests see this on your listing, as UK rules require.</li>
<li>Add your home one question at a time: photos, rooms, price, house rules and your Airbnb or Booking.com calendar links.</li>
<li>We check every listing (for example that no street address is shown) and approve it, usually within one working day.</li>
<li>Guests book and pay. You get an email with the guest's details and the dates close on every calendar.</li>
</ol>
<h2>What it costs</h2>
<p>No sign-up fee and no monthly fee. Book Homes takes a simple commission on each booking (currently {COMMISSION_TEXT}), taken from the amount the guest pays. Guests pay no booking fee.</p>
<table class="cmp"><tr><th></th><th>Book Homes</th></tr>
<tr><td>Guest service fee</td><td>None</td></tr><tr><td>Host commission</td><td>Currently {COMMISSION_TEXT} per booking</td></tr>
<tr><td>Calendar sync with Airbnb and Booking.com</td><td>Yes, iCal import and export</td></tr><tr><td>Payout</td><td>Automatic by Stripe once connected</td></tr></table>
<h2>Good to know</h2>
<ul class="dots"><li>You need the right to let the property (owner, or landlord's permission) and the usual safety checks: gas safety certificate, electrical checks, smoke and carbon monoxide alarms, fire safety, and suitable insurance.</li>
<li>Local rules can change, so keep an eye on any short-let registration scheme for England.</li>
<li>Read the <a class="link" href="/terms/hosts">host terms</a> before you sign up.</li></ul>
<p style="margin-top:24px"><a class="btn" href="/host?signup=1">List your property</a></p>"""
    return text_page("/become-a-host", "List your Liverpool property | Book Homes for hosts",
                     "Liverpool owners: list your holiday let on Book Homes. No guest booking fees, simple commission, Airbnb and Booking.com calendar sync, payouts by Stripe.",
                     body, schema=schema)


TERMS_HOSTS = f"""{DRAFT}<h1>Host terms</h1><p>Last updated: 19 November 2026</p>
<p>These terms are between you (the host) and Book Homes, {OPERATOR}. They apply when you list a property on bookhomes.co.uk.</p>
<h2>1. What Book Homes does</h2><p>Book Homes is an online booking platform. We show your listing, take the guest's payment and pass your share to you. The stay itself is a contract between you and the guest.</p>
<h2>2. Your account</h2><ul class="dots"><li>Give us true details about yourself and tell us if you host as a business (trader) or as a private individual. We show this to guests.</li><li>Keep your password and 2-step verification safe. You are responsible for what happens in your account.</li><li>We approve each host and each listing before it goes live, and we can refuse, pause or remove a listing.</li></ul>
<h2>3. Your listing</h2><ul class="dots"><li>Everything must be accurate and kept up to date: photos, rooms, beds, amenities, prices and house rules.</li><li>Do not show the street address or house number. Guests get the address after booking.</li><li>No fake reviews, no "was" prices or invented discounts, no misleading claims.</li><li>Kosher, Shabbat, business and other features are your own description. Do not claim a certification or show a certification logo unless you hold that certification in writing.</li></ul>
<h2>4. Your property and the law</h2><p>You confirm you have the right to let the property for short stays (as owner or with the owner's or landlord's written permission, and any mortgage lender or freeholder consent), and that you meet the law and keep it up to date, including gas and electrical safety, fire safety, smoke and carbon monoxide alarms, insurance, tax, data protection and any local registration or licensing.</p>
<h2>5. Calendars and bookings</h2><ul class="dots"><li>Keep your Book Homes calendar right. If you also list elsewhere, add your iCal links so we can block those dates, and add our export link to the other sites.</li><li>Accepted bookings are confirmed straight away. If you cancel a confirmed booking, the guest gets a full refund and we may charge you any costs we incur.</li></ul>
<h2>6. Money</h2><ul class="dots"><li>Guests pay the total price shown (nights, cleaning fee and any weekly or monthly discount you set). There is no guest booking fee.</li><li>Our commission is currently {COMMISSION_TEXT} of each booking (shown in your host dashboard), unless we agree a different rate with you in writing. We can change the standard rate with 30 days' notice.</li><li>Payouts: once you connect Stripe, Stripe pays your share to your bank automatically. Until then we pay you by bank transfer after the guest checks in.</li><li>Refunds follow the cancellation policy on your listing. If a booking is refunded, your payout is reduced or reversed.</li><li>You are responsible for your own tax and VAT. We provide statements of your bookings.</li></ul>
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
<h2>Cookies</h2><p>We use only the storage needed to keep you signed in and to run the booking calendar. We don't use advertising cookies.</p>"""


def write_all():
    write("stays/listing/index.html", dynamic_listing())
    write("stays/booked/index.html", text_page("/stays/booked", "Your booking | Book Homes", "Your Book Homes booking.", BOOKED, robots="noindex, nofollow"))
    write("stays/review/index.html", text_page("/stays/review", "Review your stay | Book Homes", "Review your stay.", REVIEW, robots="noindex, nofollow"))
    write("become-a-host/index.html", host_landing())
    write("terms/hosts/index.html", text_page("/terms/hosts", "Host terms (draft) | Book Homes", "Plain-English host terms for Book Homes. Draft.", TERMS_HOSTS))
    write("terms/guests/index.html", text_page("/terms/guests", "Guest terms (draft) | Book Homes", "Plain-English guest terms for Book Homes. Draft.", TERMS_GUESTS))
    write("privacy/index.html", text_page("/privacy", "Privacy notice (draft) | Book Homes", "How Book Homes uses personal data. Draft.", PRIVACY))
    return [f"{DOMAIN}/become-a-host", f"{DOMAIN}/terms/hosts", f"{DOMAIN}/terms/guests", f"{DOMAIN}/privacy"]
