"""Host acquisition pages (25 Nov 2026): /become-a-host, /hosts (index), /hosts/airbnb-hosts, /hosts/kosher, /hosts/<area>.
More /hosts/* pages (26 Nov 2026) live in bh_hosts_more.py.

Called by bh_pages.write_all(). Returns the sitemap URLs.
Rules for this copy (owner, 25 Nov 2026):
- Every fee claim about another platform is sourced and dated (SOURCES below). No "was" prices, no invented stats,
  testimonials or scarcity. Card fees are shown, not hidden: on Book Homes, Stripe's card fee comes out of the host's share.
- Community safety (seo/next-posts.md): no community numbers or locations, no shul / school / mikvah details.
  Kosher wording: host-declared kosher kitchen, Shabbat friendly. Book Homes does not certify kashrut.
- Contact: email only (no phone numbers on host pages).
"""
import json

import build_listings as B
import bh_areas
from bh_icons import icon

KOSHER = B.KOSHER_COMMISSION_TEXT
STD = B.COMMISSION_TEXT
SIGNUP = "/host?signup=1"
CHECKED = "25 November 2026"

SOURCES = {
    "airbnb_fee": ("Airbnb: Simplifying Airbnb service fees (updated 13 October 2026)",
                   "https://www.airbnb.co.uk/resources/hosting-homes/a/simplifying-airbnb-service-fees-746"),
    "airbnb_ical": ("Airbnb Help: Connect your Airbnb calendar to other websites",
                    "https://www.airbnb.com/help/article/99"),
    "stripe": ("Stripe UK pricing", "https://stripe.com/gb/pricing"),
    "booking_fee": ("Guesty: How much does Booking.com charge hosts?",
                    "https://www.guesty.com/blog/how-much-does-booking-com-charge-hosts/"),
    "gov_rules": ("GOV.UK: Letting out a self-catering holiday home in England (updated 2 October 2026)",
                  "https://www.gov.uk/guidance/letting-out-a-self-catering-holiday-home-in-england-rules-and-regulations"),
}


def src_html(keys):
    items = "".join(f'<li><a href="{B.esc(SOURCES[k][1])}" rel="noopener" target="_blank">{B.esc(SOURCES[k][0])}</a></li>' for k in keys)
    return f'<div class="hsrc"><b>Sources, checked {CHECKED}</b><ul>{items}</ul></div>'


def faq_html(faqs):
    return "".join(f"<details><summary>{B.esc(q)}</summary><p>{B.esc(a)}</p></details>" for q, a in faqs)


def faq_schema(faqs):
    return {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}


def crumbs(*items):
    out = [{"@type": "ListItem", "position": 1, "name": "Book Homes", "item": B.DOMAIN + "/"}]
    for i, (name, path) in enumerate(items, 2):
        out.append({"@type": "ListItem", "position": i, "name": name, "item": B.DOMAIN + path})
    return {"@type": "BreadcrumbList", "itemListElement": out}


def page(path, title, desc, body, graph, robots="index, follow"):
    schema = {"@context": "https://schema.org", "@graph": graph}
    return B.head(title, desc, path, robots=robots, schema=schema) + B.header() + f'<main class="page hpage" id="content">{body}</main>\n' + B.footer() + B.end()


def cta(label="Import my Airbnb listing", sub=True):
    s = f' <a class="btn ghost" href="/host">Host login</a>' if sub else ""
    return f'<p class="hcta"><a class="btn" href="{SIGNUP}">{B.esc(label)}</a>{s}</p>'


# --------------------------------------------------------------------------- shared blocks
STEPS = [
    ("user", "Create your host account", "Email and password, or Google. Tell us if you host as a business or a private individual."),
    ("link", "Paste your Airbnb link", "We copy your title, description, rooms, beds, amenities, house rules and photos into a draft. Never your reviews, ratings or prices."),
    ("calendar", "Check it, add your calendar, submit", "Set your price, paste your Airbnb calendar link so dates stay in sync, and send it to us. We check each listing, usually within one working day."),
]


def steps_html():
    return '<ol class="hsteps">' + "".join(f'<li>{icon(i)}<b>{B.esc(t)}</b><p>{B.esc(d)}</p></li>' for i, t, d in STEPS) + "</ol>"


def costs_table():
    """Book Homes costs only (owner, 26 Nov 2026: no fee comparisons with other platforms on host pages)."""
    return f"""<div class="tblwrap"><table class="cmp"><tr><td>Commission, only when a guest books</td><td>{STD} per booking ({KOSHER} for kosher hosts)</td></tr>
<tr><td>Card processing</td><td>Stripe's standard fee from your share once payouts are connected (UK cards 1.5% + 20p; European and international cards cost more)</td></tr>
<tr><td>Guest booking fee</td><td>None</td></tr>
<tr><td>Sign-up or monthly fee</td><td>None</td></tr>
<tr><td>Calendar sync with other sites</td><td>Yes, iCal in and out</td></tr></table></div>
<p class="muted hnote">Worked example, a £1,000 booking paid with a standard UK card: you keep about £834.80 ({STD} = £150, card fee £15.20), or about £954.80 as a kosher host ({KOSHER} = £30, card fee £15.20).</p>
<p>Book Homes is an extra place to get bookings, next to the sites you already use, with your calendar kept in step and no cost unless a guest books here.</p>"""


FAQ_MAIN = [
    ("Can I keep my Airbnb listing?",
     "Yes. Most hosts keep their Airbnb listing as it is. Add your Airbnb calendar link to Book Homes, and add your Book Homes calendar link to Airbnb, so a booking on one site closes the dates on the other."),
    ("How does calendar sync stop double bookings?",
     "Book Homes reads your Airbnb, Booking.com, Vrbo or Guesty calendar link every 15 minutes and closes those dates. Airbnb reads other calendars about every 3 hours (you can refresh it by hand), so for a short time after a Book Homes booking the dates can still look open on Airbnb. If a clash does happen on our side, the Book Homes guest is refunded in full and told straight away."),
    ("How do payouts work?",
     "Connect payouts with Stripe from your host dashboard. Guests pay by card on your own Stripe account, Book Homes keeps its commission, and Stripe pays the rest to your bank on your Stripe payout schedule. Until you connect Stripe, we take the payment and pay you by bank transfer after the guest checks in."),
    ("Who pays the card fees?",
     "Once your payouts are connected, Stripe takes its standard card fee from your share (1.5% + 20p for standard UK cards on Stripe's UK pricing; European and international cards cost more). Guests pay no booking fee on Book Homes."),
    ("What does the Airbnb import copy?",
     "Your title, description, property type, guests, bedrooms, beds, bathrooms, amenities, house rules, check-in and check-out times, the area and your photos. It never copies reviews, ratings or prices, and you check every screen before you submit. Only import homes you own or manage."),
    ("Is there a contract, sign-up fee or monthly fee?",
     f"No sign-up or monthly fee. You pay commission only when a guest books ({STD}, or {KOSHER} for kosher hosts). You can pause or delete your listing in your dashboard."),
    ("How fast will my listing go live?",
     "We check every host and every listing before it goes live, usually within one working day. We look for things like a street address in the photos or text, which guests only get after booking."),
    ("What do I need before I list?",
     "The right to let the property for short stays (as owner, or with the owner's, landlord's, lender's or freeholder's permission), the usual safety checks such as gas, electrical, fire safety and smoke and carbon monoxide alarms, and holiday let insurance. A national register for short-term lets in England is expected from March 2027."),
]


# --------------------------------------------------------------------------- /become-a-host
def become_a_host(listings):
    feat = [
        ("bolt", "One-click Airbnb import", "Paste your Airbnb link and your draft is filled in for you, photos included."),
        ("calendar", "Keep your Airbnb too", "Two-way iCal sync with Airbnb, Booking.com, Vrbo and Guesty. We check your other calendars every 15 minutes."),
        ("receipt", "Pay only when you get a booking", f"No sign-up or monthly fee. Commission is {STD} per booking, {KOSHER} for kosher hosts."),
        ("check", "Guests see one total price", "No guest booking fee on Book Homes. The price guests see includes cleaning."),
        ("kosher", "Kosher and Shabbat filters", "Tell guests about your kosher kitchen and Shabbat set-up. Guests can filter for them."),
        ("work", "Families, groups and work stays", "Show van parking, desks, wifi and separate beds. Guests can get a company receipt."),
    ]
    tiles = "".join(f'<div>{icon(i)}<b>{B.esc(t)}</b><p>{B.esc(d)}</p></div>' for i, t, d in feat)
    chips = bh_areas.chips_html(listings or [], "Where we are taking hosts", host=True)
    desc = "Already on Airbnb? Import your listing in one click, keep Airbnb with calendar sync, and get bookings from an extra channel. No sign-up or monthly fee."
    body = f"""<section class="hero2"><p class="eyebrow">For Airbnb hosts in the UK</p><h1 class="serif">List your Airbnb on Book Homes in 2 minutes</h1>
<p>Paste your Airbnb link and we copy your listing into a draft: title, description, rooms, amenities and photos. Keep your Airbnb listing too: calendar sync closes booked dates on both sites.</p>
<a class="btn" href="{SIGNUP}">Import my Airbnb listing</a> <a class="btn ghost" href="/host">Host login</a></section>
<h2>How it works</h2>
{steps_html()}
<div class="feat">{tiles}</div>
<h2 id="keep-airbnb">Keep your Airbnb listing</h2>
<p>You do not have to choose. Book Homes works as an extra channel next to Airbnb, Booking.com and Vrbo:</p>
<ul class="dots"><li>Paste your Airbnb calendar link (iCal) into Book Homes. We read it every 15 minutes and close those dates here.</li>
<li>Paste your Book Homes calendar link into Airbnb as an imported calendar, so a Book Homes booking closes the dates there.</li>
<li>Use Guesty or another channel manager? Paste its iCal link instead. See <a href="/hosts/multi-platform-hosts">hosts on several sites</a>.</li></ul>
<p>Read more: <a href="/hosts/airbnb-hosts">Add Book Homes alongside Airbnb</a> and <a href="/guides/sync-airbnb-calendar-with-another-site">how to sync your Airbnb calendar with another site</a>.</p>
<h2 id="fees">What it costs</h2>
{costs_table()}
{src_html(["stripe"])}
<h2>Kosher hosts: {KOSHER} commission</h2>
<p>Hosts with a host-declared kosher kitchen can be set up as kosher hosts at a {KOSHER} commission. <a href="/hosts/kosher">See how it works for kosher hosts</a>.</p>
{chips}
<h2 id="faq">Questions hosts ask</h2>
<div class="hfaq">{faq_html(FAQ_MAIN)}</div>
<h2>Good to know</h2>
<ul class="dots"><li>Read the <a href="/terms/hosts">host terms</a> before you sign up.</li>
<li>Not a whole home? You can also list <a href="/hosts/rent-a-room">a spare room</a> or <a href="/hosts/annexes-and-granny-flats">an annexe</a>. All host pages: <a href="/hosts">Hosting</a>.</li>
<li>Guides for hosts: <a href="/guides/list-holiday-let-on-more-than-one-site-uk">how to list on more than one site</a>, <a href="/guides/sync-airbnb-calendar-with-another-site">sync your Airbnb calendar</a>, <a href="/guides/direct-bookings-holiday-let-uk">how to get direct bookings</a>.</li>
<li>Questions? Email <a href="mailto:cs@zugati.co.uk">cs@zugati.co.uk</a>.</li></ul>
{cta("List your home in 2 minutes")}"""
    graph = [{"@type": "WebPage", "@id": B.DOMAIN + "/become-a-host#page", "name": "List your Airbnb on Book Homes", "url": B.DOMAIN + "/become-a-host",
              "description": desc, "inLanguage": "en-GB", "isPartOf": {"@id": B.DOMAIN + "/#website"}, "areaServed": bh_areas.area_served()},
             crumbs(("List your property", "/become-a-host")), faq_schema(FAQ_MAIN)]
    return page("/become-a-host", "List Your Airbnb on Book Homes | Hosts", desc, body, graph)


# --------------------------------------------------------------------------- /hosts/airbnb-hosts
FAQ_AIRBNB = [
    ("Is it against Airbnb's rules to list on another site?",
     "Listing the same home on more than one site is common, and Airbnb itself offers calendar import and export for this. Read your Airbnb terms for any rules on moving guests off the platform: Book Homes never contacts guests or hosts through Airbnb."),
    ("Will my Airbnb reviews move across?",
     "No. Reviews belong to the platform where they were written, so we never import them. New Book Homes guests can review their stay on Book Homes."),
    FAQ_MAIN[1], FAQ_MAIN[3],
]


def airbnb_hosts():
    desc = "Already host on Airbnb? Add Book Homes too: one-click import, two-way calendar sync, no sign-up or monthly fee. Your Airbnb listing stays as it is."
    body = f"""<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/hosts">Hosting</a> › <span>Airbnb hosts</span></nav>
<h1>Already on Airbnb? Add Book Homes too</h1>
<p class="lead-p">Keep your Airbnb listing exactly as it is. Book Homes works alongside it: import your listing in one click, sync calendars both ways and take bookings from guests who search here as well.</p>
{cta("List your home in 2 minutes")}
<h2>Why hosts add an extra channel</h2>
<ul class="dots"><li><b>One more place to be found.</b> Many hosts list on more than one site. Book Homes is one more, with your calendars kept in step.</li>
<li><b>Guests who search differently.</b> Book Homes guests can filter for a host-declared kosher kitchen, Shabbat-friendly set-up, van parking and work stays.</li>
<li><b>No cost unless you get a booking.</b> No sign-up or monthly fee. Commission is {STD} per booking ({KOSHER} for kosher hosts), plus Stripe's card fee once payouts are connected.</li></ul>
<h2>Set up in three steps</h2>
{steps_html()}
<h2>How the calendars stay in step</h2>
<ol class="dots" style="list-style:decimal"><li>In Airbnb, open your listing's calendar settings and copy the export link (it ends in .ics).</li>
<li>Paste it into Book Homes (Calendar, then Sync your other calendars). We read it every 15 minutes.</li>
<li>Copy your Book Homes calendar link and add it to Airbnb as an imported calendar. Airbnb refreshes imported calendars about every 3 hours, and you can press Refresh after a new booking.</li></ol>
<p>Full walkthrough: <a href="/guides/sync-airbnb-calendar-with-another-site">Sync your Airbnb calendar with another site</a>.</p>
<h2>What it costs on Book Homes</h2>
{costs_table()}
{src_html(["airbnb_ical", "stripe"])}
<p>Also on Booking.com or Vrbo, or using a channel manager? See <a href="/hosts/multi-platform-hosts">hosts on several sites</a>.</p>
<h2>Questions</h2>
<div class="hfaq">{faq_html(FAQ_AIRBNB)}</div>
{cta("List your home in 2 minutes")}"""
    graph = [{"@type": "WebPage", "name": "Add Book Homes alongside your Airbnb listing", "url": B.DOMAIN + "/hosts/airbnb-hosts", "description": desc,
              "inLanguage": "en-GB", "isPartOf": {"@id": B.DOMAIN + "/#website"}},
             crumbs(("Hosting", "/hosts"), ("Airbnb hosts", "/hosts/airbnb-hosts")), faq_schema(FAQ_AIRBNB)]
    return page("/hosts/airbnb-hosts", "Airbnb Hosts: Add Book Homes Too | Book Homes", desc, body, graph)


# --------------------------------------------------------------------------- /hosts/kosher
FAQ_KOSHER = [
    ("Who counts as a kosher host?",
     f"A host whose home has a kosher kitchen that the host declares on the listing. Tell us when you sign up and we set your account as a kosher host when we approve you. Your rate ({KOSHER}) shows in your host dashboard."),
    ("Does Book Homes certify kashrut?",
     "No. Kosher and Shabbat details are declared by the host, and every listing says so. Do not show a certification logo unless you hold that certification in writing. Guests who need more detail ask the host, or the relevant kashrut authority."),
    ("Can I keep my listing on Airbnb?",
     "Yes. Sync calendars both ways so a booking on one site closes the dates on the other."),
    FAQ_MAIN[3],
]


def kosher_hosts():
    desc = f"Kosher hosts pay {KOSHER} commission on Book Homes. Show your host-declared kosher kitchen and Shabbat set-up, import from Airbnb and keep your calendars in sync."
    body = f"""<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/hosts">Hosting</a> › <span>Kosher hosts</span></nav>
<h1>Kosher hosts: list your home for {KOSHER} commission</h1>
<p class="lead-p">If your home has a kosher kitchen, Book Homes lets you show it properly, with a Shabbat-friendly set-up and the details observant guests ask about, and charges kosher hosts {KOSHER} per booking.</p>
{cta("List my kosher home")}
<h2>What you can show guests</h2>
<ul class="dots"><li>A host-declared kosher kitchen: separate meat and dairy, what is supplied, how it is kept.</li>
<li>A Shabbat-friendly set-up, such as a non-electric key or lockbox, no motion-sensor lights, and a hot plate or urn.</li>
<li>Whether a shul is within walking distance (we never show which one or where).</li>
<li>Family features: cots, high chairs, big dining tables, beds for large families.</li></ul>
<p>Guests can filter for these on <a href="/kosher-homes">kosher-friendly homes</a>. Every listing says the details are declared by the host and are not a certification.</p>
<h2>What it costs</h2>
<table class="cmp"><tr><td>Commission for kosher hosts</td><td>{KOSHER} per booking</td></tr>
<tr><td>Guest booking fee</td><td>None</td></tr>
<tr><td>Card processing</td><td>Stripe's standard fee from your share once payouts are connected (UK cards 1.5% + 20p)</td></tr>
<tr><td>Sign-up or monthly fee</td><td>None</td></tr></table>
{src_html(["stripe"])}
<h2>Set up in three steps</h2>
{steps_html()}
<h2>Questions</h2>
<div class="hfaq">{faq_html(FAQ_KOSHER)}</div>
<p>For shul, mikvah and service details, guests should contact the local community or kashrut authority directly. Questions about hosting? Email <a href="mailto:cs@zugati.co.uk">cs@zugati.co.uk</a>.</p>
{cta("List my kosher home")}"""
    graph = [{"@type": "WebPage", "name": "Kosher hosts on Book Homes", "url": B.DOMAIN + "/hosts/kosher", "description": desc,
              "inLanguage": "en-GB", "isPartOf": {"@id": B.DOMAIN + "/#website"}},
             crumbs(("Hosting", "/hosts"), ("Kosher hosts", "/hosts/kosher")), faq_schema(FAQ_KOSHER)]
    return page("/hosts/kosher", f"Kosher Hosts: {KOSHER} Commission | Book Homes", desc, body, graph)


# --------------------------------------------------------------------------- /hosts/<area>
RULES_GUIDE = {"liverpool": "liverpool-short-let-rules-for-hosts", "manchester": "manchester-short-let-rules-for-hosts",
               "salford": "manchester-short-let-rules-for-hosts", "prestwich": "manchester-short-let-rules-for-hosts",
               "london": "london-90-night-rule-short-lets", "golders-green": "london-90-night-rule-short-lets",
               "stamford-hill": "london-90-night-rule-short-lets"}


def host_url(a):
    return f"/hosts/{a['slug']}"


def area_host(a, listings):
    name = a["name"]
    parent = bh_areas.BY_SLUG.get(a.get("parent") or "")
    where = f'{name}, {parent["name"]}' if parent else name
    n = len(bh_areas.listings_in(a, listings))
    path = host_url(a)
    desc = B.cut_words(f"Host in {where} with Book Homes: import your Airbnb listing in one click, keep your calendars in sync, no sign-up or monthly fee. Commission {STD}, {KOSHER} for kosher hosts.", 155)
    state = (f"There {'is' if n == 1 else 'are'} {B.plural(n, 'home')} live on Book Homes in {B.esc(where)} right now." if n
             else f"We are now taking hosts in {B.esc(where)}. Your home could be one of the first listed here.")
    guide = RULES_GUIDE.get(a["slug"])
    rules = (f'<p>Local rules: read <a href="/guides/{guide}">our plain guide for hosts</a>, and check with your council before you start.</p>' if guide else
             '<p>Local rules: check with your council whether you need planning permission, and read the <a href="/guides/england-short-let-registration-scheme-2027">England short-let register guide</a>.</p>')
    stays = "".join(f"<li>{B.esc(s)}</li>" for s in (a.get("stay_types") or []))
    body = f"""<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/hosts">Hosting</a> › <span>{B.esc(name)}</span></nav>
<h1>Host in {B.esc(name)} with Book Homes</h1>
<p class="lead-p">{state} Already on Airbnb? Import your listing in one click and keep both calendars in sync.</p>
{cta()}
<h2>Guests who book in {B.esc(name)}</h2>
<p>These are the kinds of stay guests look for on our <a href="{bh_areas.url(a)}">{B.esc(name)} page</a>:</p>
<ul class="dots">{stays}</ul>
<h2>Set up in three steps</h2>
{steps_html()}
<h2>What it costs</h2>
<p>No sign-up or monthly fee. Commission is {STD} per booking, or {KOSHER} for <a href="/hosts/kosher">kosher hosts</a>. Once payouts are connected, Stripe takes its standard card fee from your share. Guests pay no booking fee. <a href="/become-a-host#fees">See what it costs</a>.</p>
<h2>Before you list</h2>
{rules}
<ul class="dots"><li>You need the right to let the property for short stays, and the usual gas, electrical and fire safety checks and smoke and carbon monoxide alarms.</li>
<li>Get holiday let insurance that covers paying guests.</li></ul>
{cta("Host in " + name)}"""
    graph = [{"@type": "WebPage", "name": f"Host in {name} with Book Homes", "url": B.DOMAIN + path, "description": desc, "inLanguage": "en-GB",
              "isPartOf": {"@id": B.DOMAIN + "/#website"},
              "about": {"@type": "City" if not parent else "Place", "name": name, "containedInPlace": {"@type": "AdministrativeArea", "name": a["region"]}}},
             crumbs(("Hosting", "/hosts"), (f"Host in {name}", path))]
    return page(path, B.cut_words(f"Host in {name}: List Your Home | Book Homes", 60), desc, body, graph)


def hosts_index(listings):
    import bh_hosts_more as M
    desc = "Host with Book Homes alongside Airbnb, Booking.com or Vrbo. List a whole home, a spare room or an annexe. Calendar sync, no sign-up or monthly fee."
    cards = "".join(f'<li><a class="acard" href="{p}">{icon(i)}<span><b>{B.esc(t)}</b><small class="muted" style="display:block;margin-top:2px;font-size:14px">{B.esc(d)}</small></span></a></li>' for p, i, t, d in M.HUB_CARDS)
    areas = "".join(f'<li><a class="acard" href="{host_url(a)}">{icon("pin")}<span><b>Host in {B.esc(a["name"])}</b></span></a></li>' for a in bh_areas.AREAS)
    guides = [("list-holiday-let-on-more-than-one-site-uk", "How to list your holiday let on more than one site"),
              ("ical-calendar-sync-avoid-double-bookings", "Using iCal to avoid double bookings"),
              ("rent-a-room-scheme-short-lets-2026", "Rent a Room Scheme and short lets explained"),
              ("hosting-a-spare-room-safely-checklist-uk", "Hosting a spare room safely: a checklist"),
              ("letting-an-annexe-short-term-uk", "Letting an annexe for short stays"),
              ("void-period-short-lets-for-landlords", "Void period short lets for landlords"),
              ("serviced-accommodation-direct-bookings-guide", "Serviced accommodation direct bookings guide"),
              ("managing-several-holiday-lets-checklist", "Managing several holiday lets: a checklist"),
              ("sync-airbnb-calendar-with-another-site", "Sync your Airbnb calendar with another site")]
    glist = "".join(f'<li><a href="/guides/{s}">{B.esc(t)}</a></li>' for s, t in guides)
    body = f"""<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <span>Hosting</span></nav>
<h1>Host with Book Homes</h1>
<p class="lead-p">A UK booking site for whole homes and private rooms. Keep your listings where they are and add Book Homes too: import from Airbnb in one click, keep your calendars in sync, and pay commission only when a guest books here.</p>
<p class="hcta"><a class="btn" href="{SIGNUP}">List your home in 2 minutes</a></p>
<h2>Which sounds like you?</h2><ul class="acards hcards">{cards}</ul>
<h2>How it works</h2>
{steps_html()}
<p>No sign-up or monthly fee. Commission is {STD} per booking ({KOSHER} for kosher hosts), plus Stripe's card fee from your share. Guests pay no booking fee. <a href="/become-a-host">How it works and what it costs</a>.</p>
<h2>Host by area</h2><ul class="acards">{areas}</ul>
<h2>Guides for hosts</h2><ul class="dots">{glist}</ul>
<p class="hcta"><a class="btn" href="{SIGNUP}">List your home in 2 minutes</a></p>"""
    graph = [{"@type": "CollectionPage", "name": "Host with Book Homes", "url": B.DOMAIN + "/hosts", "description": desc, "inLanguage": "en-GB",
              "isPartOf": {"@id": B.DOMAIN + "/#website"},
              "hasPart": [{"@type": "WebPage", "url": B.DOMAIN + p, "name": t} for p, _, t, _ in M.HUB_CARDS]}, crumbs(("Hosting", "/hosts"))]
    return page("/hosts", "Host with Book Homes | List Your Home", desc, body, graph)


def write_all(listings):
    import os
    import shutil
    shutil.rmtree(os.path.join(B.ROOT, "hosts"), ignore_errors=True)
    B.write("become-a-host/index.html", become_a_host(listings))
    B.write("hosts/index.html", hosts_index(listings))
    B.write("hosts/airbnb-hosts/index.html", airbnb_hosts())
    B.write("hosts/kosher/index.html", kosher_hosts())
    urls = [f"{B.DOMAIN}/become-a-host", f"{B.DOMAIN}/hosts", f"{B.DOMAIN}/hosts/airbnb-hosts", f"{B.DOMAIN}/hosts/kosher"]
    import bh_hosts_more  # round 2 (26 Nov 2026): platform, room / annexe / shared-space and host-type pages
    urls += bh_hosts_more.write_all()
    for a in bh_areas.AREAS:
        B.write(f"hosts/{a['slug']}/index.html", area_host(a, listings))
        urls.append(B.DOMAIN + host_url(a))
    return urls
