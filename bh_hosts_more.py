"""Host acquisition round 2 (26 Nov 2026): platform pages, room / annexe / shared-space pages and host-type pages under /hosts/*.

Called by bh_hosts.write_all(). Returns the sitemap URLs.
Tone rule (owner, 26 Nov 2026): Book Homes is an EXTRA channel that works alongside Airbnb, Booking.com, Vrbo and the rest.
Never "switch", "leave", "better than" or "cheaper than"; no fee comparisons with other platforms on these pages; facts about
other platforms only when sourced and neutral. No logos or trademark styling. No reviews, host counts, earnings claims,
urgency or scarcity. Contact by email only. Integrations: Book Homes connects to other sites by iCal links only (no API,
no price or message sync). Listing types the host app accepts today: house, flat, cottage, townhouse, bungalow, studio,
private room (bh_listing.ts TYPES). There is no annexe or shared-room type yet: pages say so.
"""
import build_listings as B
import bh_hosts as H

STD, KOSHER, SIGNUP = H.STD, H.KOSHER, H.SIGNUP
CTA = "List your home in 2 minutes"
CHECKED = "26 November 2026"

SRC = {
    "airbnb_ical": H.SOURCES["airbnb_ical"],
    "stripe": H.SOURCES["stripe"],
    "gov_rules": H.SOURCES["gov_rules"],
    "vrbo_ical": ("Vrbo Help: How do I import my iCal or Google calendar?",
                  "https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar"),
    "bcom_ical": ("Hostfully: How to sync Booking.com and Airbnb calendars (4 November 2026)",
                  "https://www.hostfully.com/blog/sync-booking-com-airbnb-calendars/"),
    "guesty_ical": ("Guesty Help: Syncing your iCal with the Guesty calendar", "https://help.guesty.com/hc/en-gb/articles/11725829430045"),
    "hostaway_ical": ("Hostaway Support: How to connect Custom iCal",
                      "https://support.hostaway.com/hc/en-us/articles/360002562334-How-to-connect-Custom-iCal-"),
    "lodgify_ical": ("Lodgify: iCal integration", "https://www.lodgify.com/integrations/ical/"),
    "smoobu_ical": ("Smoobu Support: How do I connect other channels via iCal?",
                    "https://support.smoobu.com/hc/en-us/articles/360007390999-How-do-I-connect-other-channels-via-iCal"),
    "rent_room": ("GOV.UK: Rent a room in your home", "https://www.gov.uk/rent-room-in-your-home"),
    "hs223": ("GOV.UK: HS223 Rent a Room Scheme (2026)",
              "https://www.gov.uk/government/publications/rent-a-room-for-traders-hs223-self-assessment-helpsheet/hs223-rent-a-room-scheme-2026"),
    "fire_small": ("GOV.UK: Making your small paying guest accommodation safe from fire",
                   "https://www.gov.uk/government/publications/making-your-small-paying-guest-accommodation-safe-from-fire"),
    "fire_sleeping": ("GOV.UK: Fire safety risk assessment: sleeping accommodation",
                      "https://www.gov.uk/government/publications/fire-safety-risk-assessment-sleeping-accommodation"),
    "hmo": ("GOV.UK: House in multiple occupation licence", "https://www.gov.uk/house-in-multiple-occupation-licence"),
    "rra": ("GOV.UK: Guide to the Renters' Rights Act", "https://www.gov.uk/government/publications/guide-to-the-renters-rights-act/guide-to-the-renters-rights-act"),
    "fhl": ("GOV.UK: Furnished holiday lettings tax regime abolition", "https://www.gov.uk/government/publications/furnished-holiday-lettings-tax-regime-abolition"),
    "council": ("GOV.UK: Find your local council", "https://www.gov.uk/find-local-council"),
}


def src_html(keys):
    items = "".join(f'<li><a href="{B.esc(SRC[k][1])}" rel="noopener" target="_blank">{B.esc(SRC[k][0])}</a></li>' for k in keys)
    return f'<div class="hsrc"><b>Sources, checked {CHECKED}</b><ul>{items}</ul></div>'


def cta(label=CTA):
    return f'<p class="hcta"><a class="btn" href="{SIGNUP}">{B.esc(label)}</a> <a class="btn ghost" href="/host">Host login</a></p>'


def ul(items):
    return '<ul class="dots">' + "".join(f"<li>{i}</li>" for i in items) + "</ul>"


def ol(items):
    return '<ol class="dots" style="list-style:decimal">' + "".join(f"<li>{i}</li>" for i in items) + "</ol>"


def costs():
    """Book Homes costs only. No side-by-side with other platforms on these pages (tone rule)."""
    return f"""<div class="tblwrap"><table class="cmp"><tr><td>Commission, only when a guest books</td><td>{STD} per booking ({KOSHER} for <a href="/hosts/kosher">kosher hosts</a>)</td></tr>
<tr><td>Card processing</td><td>Stripe's standard fee from your share once payouts are connected (UK cards 1.5% + 20p)</td></tr>
<tr><td>Guest booking fee</td><td>None</td></tr>
<tr><td>Sign-up or monthly fee</td><td>None</td></tr>
<tr><td>Calendar sync</td><td>iCal in and out, included</td></tr></table></div>"""


def steps(first="Paste your Airbnb link if you have one, or tap <b>Skip, start from scratch</b> and fill in the details yourself (about 10 minutes)."):
    items = [("user", "Create your host account", "Email and password, or Google. Tell us if you host as a business or a private individual."),
             ("link", "Add your listing", first),
             ("calendar", "Connect your calendars and submit", "Paste the calendar links (iCal) from your other sites, set your price and send it to us. We check every listing, usually within one working day.")]
    return '<ol class="hsteps">' + "".join(f'<li>{H.icon(i)}<b>{B.esc(t)}</b><p>{d}</p></li>' for i, t, d in items) + "</ol>"


SYNC_FAQ = ("How does calendar sync work on Book Homes?",
            "You paste the calendar link (iCal, ending in .ics) from each of your other sites into Book Homes, and we read each one every 15 minutes and close those dates. Then you add your Book Homes calendar link to each of your other sites, so a Book Homes booking closes the dates there too. iCal shares booked and blocked dates only, not prices or messages.")
CHECK_FAQ = ("What do I need before I list?",
             "The right to let the property or room for short stays (as owner, or with written permission from your landlord, lender or freeholder), insurance that covers paying guests, and the usual safety checks: gas, electrical, a fire risk assessment, and smoke and carbon monoxide alarms. Check with your council whether you need planning permission.")
COST_FAQ = ("What does it cost?",
            f"No sign-up or monthly fee. You pay {STD} commission only when a guest books ({KOSHER} for kosher hosts), plus Stripe's standard card fee from your share once payouts are connected. Guests pay no booking fee.")


def check_list(extra=()):
    base = ["<b>Permission to let.</b> If you have a mortgage, a lease or a landlord, get written consent for short lets first. Many mortgages, leases and tenancy agreements limit or ban them.",
            "<b>Insurance.</b> Standard home or landlord insurance may not cover paying guests. Get cover that does, including public liability.",
            "<b>Fire safety.</b> Do a fire risk assessment and fit smoke and carbon monoxide alarms. GOV.UK has a short guide for small paying guest accommodation.",
            "<b>Local rules.</b> Ask your council whether you need planning permission or a licence. In London, whole-home short lets are capped at 90 nights a year without planning permission.",
            "<b>The 2027 register.</b> A national short-let register for England is expected from March 2027. Keep your certificates and permissions in one place."]
    return ul(list(extra) + base)


def build(path, crumb, title, desc, h1, lead, sections, faqs, srcs, cta_label=CTA, schema_name=None):
    body = [f'<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a> › <a href="/hosts">Hosting</a> › <span>{B.esc(crumb)}</span></nav>',
            f"<h1>{B.esc(h1)}</h1>", f'<p class="lead-p">{lead}</p>', cta(cta_label)]
    for h2, html in sections:
        body.append(f"<h2>{B.esc(h2)}</h2>{html}")
    body.append(src_html(srcs))
    if faqs:
        body.append(f'<h2>Questions</h2><div class="hfaq">{H.faq_html(faqs)}</div>')
    body.append('<p>Questions about hosting? Email <a href="mailto:cs@zugati.co.uk">cs@zugati.co.uk</a>. See <a href="/hosts">all hosting pages</a> or <a href="/become-a-host">how it works</a>.</p>')
    body.append(cta(cta_label))
    graph = [{"@type": "WebPage", "name": schema_name or h1, "url": B.DOMAIN + path, "description": desc, "inLanguage": "en-GB",
              "isPartOf": {"@id": B.DOMAIN + "/#website"}},
             H.crumbs(("Hosting", "/hosts"), (crumb, path))]
    if faqs:
        graph.append(H.faq_schema(faqs))
    return H.page(path, title, desc, "\n".join(body), graph)


# --------------------------------------------------------------------------- pages
PAGES = []


def add(slug, crumb, **kw):
    PAGES.append(dict(slug=slug, crumb=crumb, **kw))


add("booking-com-hosts", "Booking.com hosts",
    title="Booking.com Hosts: Add Book Homes Too | Book Homes",
    desc="On Booking.com? Add Book Homes as an extra channel. Keep your Booking.com listing, sync calendars by iCal, pay only when a guest books here.",
    h1="On Booking.com? Add Book Homes as an extra channel",
    lead="Keep your Booking.com listing exactly as it is. Add your home to Book Homes too, connect the two calendars, and take bookings from guests who search here. Nothing changes on Booking.com.",
    sections=[
        ("What stays the same", ul(["Your Booking.com listing, prices, reviews and guests stay on Booking.com.",
                                    "You keep managing Booking.com bookings in the Booking.com extranet as you do now.",
                                    "Book Homes only needs your calendar link, so dates booked on Booking.com are closed here."])),
        ("Set up in three steps", steps("Also on Airbnb? Paste your Airbnb link and we fill in the draft for you. If not, tap <b>Skip, start from scratch</b> (about 10 minutes). There is no Booking.com import.")),
        ("Connect your Booking.com calendar", ol([
            "In the Booking.com extranet, open your calendar under Rates and Availability and find the calendar sync option.",
            "Copy the export link (it ends in .ics) and paste it into Book Homes under <b>Sync your other calendars</b>. We read it every 15 minutes.",
            "Copy your Book Homes calendar link and import it into Booking.com in the same place.",
            "If your Booking.com listing is connected to a channel manager, connect Book Homes to the channel manager instead. Running iCal and a channel manager on the same Booking.com listing can cause clashes. See <a href=\"/hosts/multi-platform-hosts\">hosts on several sites</a>."])
         + "<p>Booking.com reads imported calendars on its own schedule, usually every few hours, so a short gap is possible after a new booking. iCal shares dates only, not prices.</p>"),
        ("What it costs on Book Homes", costs()),
        ("Before you list", check_list()),
    ],
    faqs=[("Do I have to change anything on Booking.com?", "No. You only add one imported calendar on Booking.com, so dates booked on Book Homes close there too."),
          ("Can you import my Booking.com listing?", "Not at the moment. Our one-click import works with Airbnb links. If you are only on Booking.com, start from scratch: it takes about 10 minutes and you can reuse your own photos and text."),
          SYNC_FAQ, COST_FAQ],
    srcs=["bcom_ical", "stripe", "gov_rules"])

add("vrbo-hosts", "Vrbo hosts",
    title="Vrbo Hosts: Add Book Homes Too | Book Homes",
    desc="On Vrbo? Add Book Homes as an extra channel for your whole home. Keep your Vrbo listing, sync calendars both ways by iCal, pay only when booked.",
    h1="On Vrbo? Add Book Homes alongside it",
    lead="Vrbo suits whole homes and families, and so does Book Homes. Keep your Vrbo listing as it is, add your home here too, and connect the calendars so a booking on one closes the dates on the other.",
    sections=[
        ("What stays the same", ul(["Your Vrbo listing, reviews and bookings stay on Vrbo.",
                                    "You keep using the Vrbo Owner Dashboard or app.",
                                    "Book Homes reads your Vrbo calendar link so those dates are closed here."])),
        ("Set up in three steps", steps("Also on Airbnb? Paste your Airbnb link and we fill in the draft. If not, tap <b>Skip, start from scratch</b> (about 10 minutes). There is no Vrbo import.")),
        ("Connect your Vrbo calendar", ol([
            "In Vrbo, go to Calendar, then Settings, then Availability, and open <b>Connect calendars</b>.",
            "Export your Vrbo calendar link and paste it into Book Homes under <b>Sync your other calendars</b>.",
            "Copy your Book Homes calendar link, then in Vrbo choose <b>Import a calendar</b>, paste it and give it a name.",
            "Vrbo says imported events can take up to 20 minutes to show on the dashboard, and each property can import up to five calendars."])
         + "<p>Vrbo also says properties managed through third-party software cannot import calendars there. If that is you, connect Book Homes to your software instead: see <a href=\"/hosts/multi-platform-hosts\">hosts on several sites</a>.</p>"),
        ("What it costs on Book Homes", costs()),
        ("Before you list", check_list()),
    ],
    faqs=[("Do I have to change anything on Vrbo?", "Only one thing: add your Book Homes calendar as an imported calendar, so dates booked here close on Vrbo."),
          ("Can you import my Vrbo listing?", "Not at the moment. The one-click import works with Airbnb links. Otherwise start from scratch, which takes about 10 minutes."),
          SYNC_FAQ, COST_FAQ],
    srcs=["vrbo_ical", "stripe", "gov_rules"])

add("multi-platform-hosts", "Hosts on several sites",
    title="List on Several Sites? Add Book Homes by iCal | Book Homes",
    desc="Already on Airbnb, Booking.com and Vrbo, or using Guesty, Hostaway, Lodgify or Smoobu? Add Book Homes as one more channel by iCal. What syncs, and what does not.",
    h1="On several sites already? Add Book Homes as one more channel",
    lead="If you list on Airbnb, Booking.com, Vrbo or your own site, or run everything through a channel manager, Book Homes plugs in with calendar links (iCal). Your other listings stay where they are.",
    sections=[
        ("How Book Homes connects, honestly", ul([
            "<b>iCal only.</b> Book Homes connects to other sites and channel managers with calendar links. We do not have an API connection with any channel manager today.",
            "<b>Dates sync, prices do not.</b> Booked and blocked dates flow both ways. You set your price, cleaning fee, minimum stay and discounts on Book Homes yourself.",
            "<b>Bookings stay separate.</b> Book Homes bookings, guest messages and payouts are handled in your Book Homes dashboard, not in your channel manager.",
            "<b>We read your links every 15 minutes.</b> Each other site reads our link on its own schedule."])),
        ("With a channel manager (Guesty, Hostaway, Lodgify, Smoobu and others)", ol([
            "In your channel manager, add Book Homes as a custom iCal channel for each property. Most channel managers support this: Guesty, Hostaway, Lodgify and Smoobu all have help pages for it.",
            "Paste the channel manager's export link for that property into Book Homes. In our calendar picker choose <b>Guesty</b> or <b>Other</b>.",
            "Paste your Book Homes calendar link into the channel manager as the import for that channel.",
            "Connect Book Homes to the channel manager only, not to each site as well, so every date comes from one place."])),
        ("Without a channel manager", ol([
            "Paste the export link from each site (Airbnb, Booking.com, Vrbo) into Book Homes. You can add as many as you need.",
            "Add your Book Homes link to each of those sites as an imported calendar.",
            "After any booking, refresh imported calendars where a site lets you. Airbnb refreshes about every 3 hours, or when you press Refresh."])
         + '<p>Step by step: <a href="/guides/ical-calendar-sync-avoid-double-bookings">using iCal to avoid double bookings</a>.</p>'),
        ("Set up in three steps", steps()),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Is Book Homes connected to my channel manager?", "Only by iCal calendar links. That is enough to keep dates in step, but prices, guest messages and bookings are not shared. If we add a direct connection with a channel manager, we will say so on this page."),
          ("Which channel managers work?", "Any that can import and export an iCal link for a property. Guesty, Hostaway, Lodgify and Smoobu all describe this in their help pages. Check your own plan, as features can vary."),
          ("Can I still get a double booking?", "It is rare but possible in the minutes or hours before another site refreshes our calendar. Refresh by hand after a booking where you can, and connect every channel both ways."),
          COST_FAQ],
    srcs=["guesty_ical", "hostaway_ical", "lodgify_ical", "smoobu_ical", "airbnb_ical", "stripe"])

ROOM_TAX = ("<p>The government's <b>Rent a Room Scheme</b> lets you earn up to <b>£7,500 a year tax-free</b> from letting furnished accommodation in your only or main home, or <b>£3,750</b> if the income is shared with someone else, such as a joint owner. "
            "That is the limit for the 2025 to 2026 tax year in HMRC's helpsheet HS223. The scheme can also cover a guest house or bed and breakfast run in your home, and HMRC sets no minimum or maximum length of stay. "
            "If you earn more than the limit, you choose between paying tax on your actual profit, or on your income minus £7,500 with no expenses. GOV.UK also says that if you only occasionally let part of your home through short-term rental apps, you should check whether you need to tell HMRC.</p>"
            "<p>This is a summary, not tax advice. Read <a href=\"/guides/rent-a-room-scheme-short-lets-2026\">our plain guide to the Rent a Room Scheme and short lets</a> and ask an accountant if you are not sure.</p>")

add("rent-a-room", "Rent a room",
    title="Rent Out Your Spare Room for Short Stays | Book Homes",
    desc="List a spare room in your home for short stays on Book Homes. Rent a Room Scheme £7,500 tax-free explained, what to check first, and how it works.",
    h1="Rent out your spare room for short stays",
    lead="Got a spare room in the home you live in? You can list it on Book Homes as a <b>private room</b>, for guests visiting family, working nearby or in town for a hospital visit. Already list it elsewhere? Keep that listing and sync the calendars.",
    sections=[
        ("How a room listing works", ul([
            "In the listing form, choose <b>Private room</b> as the property type. Add the guests, beds and bathrooms the guest can use.",
            "Say clearly what is shared: kitchen, bathroom, living room, and whether you or others live there during the stay.",
            "Set house rules, check-in times and a minimum stay that suit you. Bookings are confirmed as soon as the guest pays, so make your rules clear on the listing.",
            "Message guests before they arrive through Book Homes messages. Guests see the exact address only after booking."])),
        ("Rent a Room Scheme: £7,500 tax-free", ROOM_TAX),
        ("What you need to check first", check_list([
            "<b>Your own home.</b> The Rent a Room Scheme is for furnished accommodation in your only or main home. If you rent your home, you need your landlord's written permission to let a room.",
            "<b>How many people.</b> GOV.UK says your home may be classed as a house in multiple occupation (HMO) if you let rooms to more than 2 people, which brings extra rules and often a licence."])
         + '<p>Full checklist: <a href="/guides/hosting-a-spare-room-safely-checklist-uk">hosting a spare room safely</a>.</p>'),
        ("Set up in three steps", steps("Already list the room on Airbnb? Paste your link and we fill in the draft. If not, tap <b>Skip, start from scratch</b>.")),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Can I list a room, not a whole home?", "Yes. Choose Private room as the property type in the listing form. We check every listing before it goes live."),
          ("Does the Rent a Room Scheme cover short stays?", "HMRC's helpsheet HS223 says the scheme covers furnished accommodation in your only or main home, including a guest house or bed and breakfast run there, and does not set a minimum or maximum length of stay. Check your own case with HMRC or an accountant."),
          ("Can I list a shared room, like a bed in a shared bedroom?", "Not at the moment. Book Homes lists whole homes and private rooms. A guest must have their own bedroom."),
          CHECK_FAQ, COST_FAQ],
    srcs=["rent_room", "hs223", "hmo", "fire_small", "stripe"])

add("annexes-and-granny-flats", "Annexes and granny flats",
    title="Let Your Annexe or Granny Flat for Short Stays | Book Homes",
    desc="List your annexe, granny flat or garden studio for short stays on Book Homes. How to list it, planning and tax points to check, and calendar sync.",
    h1="Let your annexe or granny flat for short stays",
    lead="A self-contained annexe, granny flat or garden studio can suit visiting family, couples and people working nearby. List it on Book Homes, and if it is already on another site, keep it there and sync the calendars.",
    sections=[
        ("How to list an annexe today", ul([
            "There is no separate annexe type yet. Choose <b>Studio</b> if it is one open room, or <b>Flat</b> or <b>Cottage</b> if it has a separate bedroom.",
            "Say in the title and description that it is an annexe next to the main house, and whether you live in the main house.",
            "Explain the entrance, parking and any shared garden, and what guests can and cannot use.",
            "Keep the street address out of the photos and text. Guests get it after booking."])),
        ("Planning and tax points to check", ul([
            "<b>Planning conditions.</b> Many annexes were approved with a condition that ties their use to the main house. Look at your planning decision notice or ask your council whether letting it to paying guests is allowed.",
            "<b>Rent a Room Scheme.</b> The scheme covers furnished accommodation in your only or main home (up to £7,500 a year tax-free). HMRC's helpsheet does not say whether a self-contained annexe counts as part of your home, so check with HMRC or an accountant before you rely on it.",
            "<b>Business rates.</b> In England, a self-catering property available for 140 nights or more a year and actually let for 70 nights or more can be assessed for business rates instead of council tax."])),
        ("What you need to check first", check_list()),
        ("Set up in three steps", steps()),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Is there an annexe property type?", "Not yet. List it as a Studio, Flat or Cottage and say in the title that it is an annexe. We may add an annexe type later."),
          ("Can I use the Rent a Room Scheme for an annexe?", "Possibly, but HMRC's helpsheet does not settle whether a self-contained annexe counts as part of your main home. Ask HMRC or an accountant."),
          CHECK_FAQ, COST_FAQ],
    srcs=["hs223", "gov_rules", "council", "fire_small", "stripe"])

add("shared-spaces", "Shared spaces and rooms",
    title="Short Let a Room in a Shared House | Book Homes",
    desc="Letting a room in a shared house or HMO for short stays? What Book Homes supports today, the permissions and licences to check, and fire safety.",
    h1="Rooms in shared houses: what you can list and what to check",
    lead="Short-letting a room in a shared house can work, but only with the right permissions. Here is what Book Homes supports today and what you need to check before you list.",
    sections=[
        ("What Book Homes supports today", ul([
            "<b>Private rooms:</b> yes. Choose <b>Private room</b> in the listing form. The guest must have their own bedroom.",
            "<b>Shared rooms</b> (a bed in a room shared with others): not at the moment.",
            "<b>Whole homes:</b> yes, including a whole house you would otherwise let room by room."])),
        ("If you live there", ul([
            "Letting a room in your own home is the simplest case: see <a href=\"/hosts/rent-a-room\">rent out your spare room</a>.",
            "If you rent your home, you need your landlord's written permission. Letting a room without it can break your tenancy.",
            "Tell the people you live with before you list. Their home is shared with your guests too."])),
        ("If you are the landlord of a shared house or HMO", ul([
            "<b>Licence conditions.</b> GOV.UK says a large HMO licence is needed for 5 or more people from more than one household who share facilities, and councils can license smaller HMOs too. Ask your council whether short stays fit your licence and its conditions.",
            "<b>Planning.</b> A change in how a house is used can need planning permission. Ask your council before you mix short stays with long-term rooms.",
            "<b>Your tenants.</b> Rooms let to tenants are their homes, with their own rights. Only list rooms that are empty and not part of anyone's tenancy, and tell your tenants about short-stay guests.",
            "<b>Mortgage and insurance.</b> HMO mortgages and policies are written for longer lets. Get your lender's and insurer's consent in writing."])),
        ("Fire safety in shared houses", "<p>Shared houses with paying guests usually need more than a basic alarm. GOV.UK points smaller places (up to 10 people over no more than 2 floors) to its small paying guest accommodation guide, and larger or more complex buildings to the sleeping accommodation fire risk assessment guide. Keep your fire risk assessment up to date and make the escape route clear for guests who do not know the building.</p>"),
        ("Other checks", check_list()),
    ],
    faqs=[("Can I list a bed in a shared dorm room?", "Not at the moment. Book Homes lists whole homes and private rooms only."),
          ("Can I short-let a room in my HMO?", "Only if your licence, planning, mortgage and insurance allow it, and only for a room that is not part of a tenant's tenancy. Ask your council first."),
          ("I rent a room in a shared house. Can I sublet it for short stays?", "Only with your landlord's written permission. Without it you could break your tenancy."),
          COST_FAQ],
    srcs=["hmo", "rent_room", "fire_small", "fire_sleeping", "council", "gov_rules"])

add("property-managers", "Property managers",
    title="Property Managers: Add Book Homes for Your Homes | Book Homes",
    desc="Manage several short-let homes? Add them to Book Homes in one host account. Calendar sync for each home, Stripe payouts, guest messages, business hosting.",
    h1="Property managers: add your homes to Book Homes",
    lead="If you manage several homes for owners, Book Homes can be one more channel for each of them. One host account, a listing per home, and each home's calendar synced with the sites you already use.",
    sections=[
        ("What you get in one host account", ul([
            "<b>Several listings.</b> Add each home as its own listing, each with its own calendar, prices and house rules.",
            "<b>Import from Airbnb</b> for each home that is already there, or start from scratch.",
            "<b>Calendar sync per home.</b> Paste each home's iCal link from Airbnb, Booking.com, Vrbo or your channel manager, and add our link back. We check every 15 minutes.",
            "<b>Business hosting.</b> Tell us you host as a business. Guests see that, and work guests can get a company receipt.",
            "<b>Payouts by Stripe</b> to your bank, and guest <b>messages</b> in your dashboard.",
            "<b>Optional SEO Boost</b> per listing: guide pages about the home and its area, written from your own facts (Mini, 5 pages, £30; Max, 30 pages, £150)."])),
        ("Working with a channel manager", "<p>If your homes run through Guesty, Hostaway, Lodgify, Smoobu or similar, connect Book Homes to the channel manager by iCal, one link per home. Prices and messages are not synced: see <a href=\"/hosts/multi-platform-hosts\">how Book Homes works with several sites</a>.</p>"),
        ("Owner permission", ul([
            "Only list homes you manage with the owner's written agreement, and import only listings you manage.",
            "Make sure each home has the owner's lender, freeholder and insurer consent for short lets, and current safety certificates.",
            "Guide for teams: <a href=\"/guides/managing-several-holiday-lets-checklist\">managing several holiday lets: a checklist</a>."])),
        ("Set up in three steps", steps()),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Can I manage several homes from one account?", "Yes. Each home is its own listing with its own calendar links, prices and rules, all in one host dashboard."),
          ("Do you have an API for property managers?", "Not today. Homes connect by iCal calendar links, which most channel managers support."),
          ("Who gets paid?", "Payouts go to the Stripe account connected to your host account. Settle owners' shares as you do today."),
          COST_FAQ],
    srcs=["guesty_ical", "hostaway_ical", "airbnb_ical", "stripe"])

add("serviced-accommodation", "Serviced accommodation",
    title="Serviced Accommodation Operators: Add Book Homes | Book Homes",
    desc="Run serviced accommodation? Add your units to Book Homes as an extra channel for work, relocation and family stays. Weekly and monthly discounts, company receipts.",
    h1="Serviced accommodation operators: add Book Homes as a channel",
    lead="Book Homes guests include contractors, relocation and work teams, and families who want a whole flat or house. Add your serviced units alongside your other channels and keep every calendar in step.",
    sections=[
        ("What suits serviced accommodation", ul([
            "<b>Longer stays:</b> set weekly and monthly discounts, and minimum and maximum nights per unit.",
            "<b>Work stays:</b> show desks, fast wifi, parking and van parking. Work guests can get a company receipt.",
            "<b>Business hosting:</b> guests see that you host as a business.",
            "<b>One total price:</b> guests see nights plus cleaning, with no guest booking fee.",
            "<b>Calendar sync</b> with Airbnb, Booking.com, Vrbo or your channel manager by iCal."])),
        ("Before you list", check_list([
            "<b>Rent-to-rent.</b> If you lease the property from a landlord, you need their written consent for short lets, plus the lender's and freeholder's where needed.",
            "<b>Business rates.</b> In England, a unit available for 140 nights or more a year and let for 70 nights or more can be assessed for business rates instead of council tax.",
            "<b>Tax.</b> The special furnished holiday lettings tax rules ended in April 2025. Ask your accountant how that affects you."])
         + '<p>More: <a href="/guides/serviced-accommodation-direct-bookings-guide">serviced accommodation direct bookings guide</a>.</p>'),
        ("Set up in three steps", steps()),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Can I list several units in one building?", "Yes. Add each unit as its own listing with its own calendar link."),
          ("Can guests pay on invoice?", "Guests pay by card when they book. Work guests can ask for a company receipt."),
          SYNC_FAQ, COST_FAQ],
    srcs=["gov_rules", "fhl", "stripe"])

add("landlords-between-tenants", "Landlords between tenants",
    title="Short Lets Between Tenants: Void Periods | Book Homes",
    desc="Got a gap between tenants? A short let can cover a void period, if your mortgage, insurance and the Renters' Rights Act rules allow it. What to check first.",
    h1="Landlords: short lets between tenants",
    lead="If a rental is empty for a few weeks between tenants or during works, a furnished short let can cover some of the gap. It is not right for every property, so check these points before you list.",
    sections=[
        ("Check these first", ul([
            "<b>Renters' Rights Act.</b> If you ended a tenancy using the moving-in or selling grounds, GOV.UK says you cannot market or re-let the property for 12 months. Do not list it as a short let in that period without legal advice.",
            "<b>Mortgage.</b> Buy-to-let mortgages are usually written for tenancies. Ask your lender in writing whether short lets are allowed.",
            "<b>Insurance.</b> Landlord insurance may not cover paying guests. Get holiday let or short-let cover for the gap.",
            "<b>Furniture and safety.</b> A short let needs to be furnished and ready for guests, with a fire risk assessment, alarms and gas and electrical certificates.",
            "<b>Council tax and tax.</b> Short lets can change how a property is taxed. The furnished holiday lettings tax rules ended in April 2025. Ask your accountant.",
            "<b>Local rules.</b> Ask your council about planning and licensing. In London, whole-home short lets are capped at 90 nights a year without planning permission."])),
        ("How Book Homes helps with a short gap", ul([
            "Set the dates you are free and block the rest. You can pause the listing when a new tenant is found.",
            "Set a minimum stay so you are not turning the home round every night, and weekly or monthly discounts for longer stays.",
            "Work stays such as contractors and relocations often book weeks at a time."])
         + '<p>Read more: <a href="/guides/void-period-short-lets-for-landlords">void period short lets: a guide for landlords</a>.</p>'),
        ("Set up in three steps", steps()),
        ("What it costs on Book Homes", costs()),
    ],
    faqs=[("Can I short-let a property after evicting a tenant to sell it?", "No, not within 12 months if you used the moving-in or selling grounds. GOV.UK says landlords cannot market or re-let the property in that time. Take legal advice."),
          ("Do I need a tenancy agreement for a short let?", "A short stay for a holiday or work trip is a booking, not a tenancy. If a guest wants to live there for months, take advice on the right agreement."),
          CHECK_FAQ, COST_FAQ],
    srcs=["rra", "fhl", "gov_rules", "fire_small", "council"])


def write_all():
    urls = []
    for p in PAGES:
        path = f"/hosts/{p['slug']}"
        html = build(path, p["crumb"], p["title"], p["desc"], p["h1"], p["lead"], p["sections"], p["faqs"], p["srcs"])
        B.write(f"hosts/{p['slug']}/index.html", html)
        urls.append(B.DOMAIN + path)
    return urls


# Cards for the /hosts hub: (path, icon, title, line)
HUB_CARDS = [
    ("/hosts/airbnb-hosts", "home", "Already on Airbnb", "Import in one click, keep your Airbnb listing"),
    ("/hosts/booking-com-hosts", "calendar", "Already on Booking.com", "Add Book Homes too, sync by iCal"),
    ("/hosts/vrbo-hosts", "family", "Already on Vrbo", "Whole homes for families, calendars in step"),
    ("/hosts/multi-platform-hosts", "link", "On several sites", "Channel managers and iCal, honestly explained"),
    ("/hosts/rent-a-room", "bed", "A spare room", "Private rooms, Rent a Room Scheme explained"),
    ("/hosts/annexes-and-granny-flats", "door", "An annexe or granny flat", "Self-contained space next to your home"),
    ("/hosts/shared-spaces", "users", "A room in a shared house", "What you can list and what to check"),
    ("/hosts/property-managers", "grid", "A property manager", "Several homes in one host account"),
    ("/hosts/serviced-accommodation", "work", "Serviced accommodation", "Work, relocation and longer stays"),
    ("/hosts/landlords-between-tenants", "clock", "A landlord between tenants", "Short lets for void periods, checks first"),
    ("/hosts/kosher", "kosher", "A kosher host", f"Kosher hosts pay {KOSHER} commission"),
]
