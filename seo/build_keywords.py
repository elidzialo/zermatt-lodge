#!/usr/bin/env python3
"""
Build the Zermatt Lodge keyword universe.

Zermatt Lodge: 4-bed entire house, Fazakerley (north Liverpool, L9/L10), sleeps 7,
2 bathrooms (king en-suite), pool table games room, large garden, free parking for 2 cars,
no pets, near Aintree University Hospital, Aintree Racecourse, Fazakerley station, M57/M58.

Method: researched seed lists x modifier lists -> long-tail variants, with
compatibility rules so only phrases a real person might type are produced.
Keywords seen verbatim (or near-verbatim) during web research are marked
"search-verified"; everything else is "pattern".

No search-volume tool was available, so priority is judgement-based:
  1 = most relevant to this property and most likely to convert
  2 = relevant, wider area or softer intent
  3 = informational / far-off / supporting content

Usage: python3 build_keywords.py  -> writes keywords.csv next to this script.
"""
import csv
import os
import re

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keywords.csv")

# ---------------------------------------------------------------------------
# 1. Locations: name -> (tier, area-page slug)
#    tier 1 = on the doorstep, tier 2 = within ~15 min, tier 3 = wider region
# ---------------------------------------------------------------------------
LOCATIONS = {
    "Liverpool": (1, "/"),
    "north Liverpool": (1, "/"),
    "Fazakerley": (1, "/areas/fazakerley"),
    "Aintree": (1, "/areas/aintree"),
    "Walton": (1, "/areas/walton"),
    "Orrell Park": (1, "/areas/orrell-park"),
    "Old Roan": (2, "/areas/aintree"),
    "Maghull": (2, "/areas/maghull"),
    "Kirkby": (2, "/areas/kirkby"),
    "Bootle": (2, "/areas/bootle"),
    "Netherton": (2, "/areas/netherton"),
    "Norris Green": (2, "/areas/norris-green"),
    "Anfield": (2, "/areas/anfield"),
    "Everton": (2, "/areas/everton"),
    "Croxteth": (2, "/areas/croxteth"),
    "West Derby": (2, "/areas/west-derby"),
    "Clubmoor": (2, "/areas/norris-green"),
    "Litherland": (2, "/areas/bootle"),
    "Kirkdale": (2, "/areas/walton"),
    "Tuebrook": (2, "/areas/anfield"),
    "Crosby": (2, "/areas/crosby"),
    "Waterloo": (3, "/areas/crosby"),
    "Melling": (2, "/areas/maghull"),
    "Gillmoss": (2, "/areas/croxteth"),
    "Sefton": (2, "/areas/sefton"),
    "Knowsley": (2, "/areas/kirkby"),
    "Merseyside": (2, "/"),
    "Liverpool city centre": (2, "/areas/liverpool-city-centre"),
    "Formby": (3, "/areas/formby"),
    "Southport": (3, "/areas/southport"),
    "Ormskirk": (3, "/areas/ormskirk"),
    "Huyton": (3, "/areas/kirkby"),
    "Prescot": (3, "/areas/kirkby"),
    "St Helens": (3, "/areas/st-helens"),
}
TIER1 = [l for l, (t, _) in LOCATIONS.items() if t == 1]
TIER12 = [l for l, (t, _) in LOCATIONS.items() if t <= 2]
POSTCODES = ["L9", "L10", "L9 Liverpool", "L10 Liverpool"]

# ---------------------------------------------------------------------------
# 2. Landmarks: name -> (group, tier, slug)
# ---------------------------------------------------------------------------
LANDMARKS = {
    # hospitals
    "Aintree University Hospital": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "Aintree Hospital": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "University Hospital Aintree": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "Fazakerley Hospital": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "the Walton Centre": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "Walton Centre Liverpool": ("hospital", 1, "/accommodation-near-aintree-hospital"),
    "Alder Hey": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Alder Hey Children's Hospital": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Royal Liverpool Hospital": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Broadgreen Hospital": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Clatterbridge Cancer Centre Liverpool": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Liverpool Heart and Chest Hospital": ("hospital", 2, "/hospital-visitor-accommodation-liverpool"),
    "Liverpool Women's Hospital": ("hospital", 3, "/hospital-visitor-accommodation-liverpool"),
    # racing
    "Aintree Racecourse": ("racing", 1, "/grand-national-accommodation"),
    "Aintree racecourse Liverpool": ("racing", 1, "/grand-national-accommodation"),
    # football / stadiums
    "Anfield": ("stadium", 2, "/football-stays-anfield-everton"),
    "Anfield stadium": ("stadium", 2, "/football-stays-anfield-everton"),
    "Liverpool FC": ("stadium", 2, "/football-stays-anfield-everton"),
    "Goodison Park": ("stadium", 2, "/football-stays-anfield-everton"),
    "Hill Dickinson Stadium": ("stadium", 2, "/football-stays-anfield-everton"),
    "Everton Stadium": ("stadium", 2, "/football-stays-anfield-everton"),
    "Bramley-Moore Dock": ("stadium", 2, "/football-stays-anfield-everton"),
    "Everton's new stadium": ("stadium", 2, "/football-stays-anfield-everton"),
    # venues
    "M&S Bank Arena": ("venue", 2, "/events-concerts-liverpool-stays"),
    "ACC Liverpool": ("venue", 2, "/events-concerts-liverpool-stays"),
    "Exhibition Centre Liverpool": ("venue", 2, "/events-concerts-liverpool-stays"),
    "Liverpool waterfront": ("venue", 3, "/events-concerts-liverpool-stays"),
    "Cavern Club": ("attraction", 3, "/guides/things-to-do-near-zermatt-lodge"),
    "Albert Dock": ("attraction", 3, "/guides/things-to-do-near-zermatt-lodge"),
    "Croxteth Hall": ("attraction", 2, "/guides/things-to-do-near-zermatt-lodge"),
    "Croxteth Park": ("attraction", 2, "/guides/things-to-do-near-zermatt-lodge"),
    "Stanley Park Liverpool": ("attraction", 2, "/guides/things-to-do-near-zermatt-lodge"),
    "Aintree Retail Park": ("attraction", 2, "/guides/things-to-do-near-zermatt-lodge"),
    "Royal Birkdale": ("attraction", 3, "/guides/things-to-do-near-zermatt-lodge"),
    # transport
    "Fazakerley station": ("transport", 1, "/location"),
    "Aintree station": ("transport", 1, "/location"),
    "Orrell Park station": ("transport", 1, "/location"),
    "Rice Lane station": ("transport", 2, "/location"),
    "the M57": ("transport", 1, "/location"),
    "the M58": ("transport", 1, "/location"),
    "M57 junction 7": ("transport", 2, "/location"),
    "Liverpool Lime Street": ("transport", 3, "/location"),
    "Liverpool John Lennon Airport": ("transport", 3, "/location"),
    # employers / business
    "Port of Liverpool": ("business", 1, "/contractor-accommodation-liverpool"),
    "Seaforth docks": ("business", 2, "/contractor-accommodation-liverpool"),
    "Liverpool2 container terminal": ("business", 2, "/contractor-accommodation-liverpool"),
    "Knowsley Industrial Park": ("business", 1, "/contractor-accommodation-liverpool"),
    "Knowsley Business Park": ("business", 1, "/contractor-accommodation-liverpool"),
    "Kirkby industrial estate": ("business", 1, "/contractor-accommodation-liverpool"),
    "Long Lane Aintree": ("business", 1, "/contractor-accommodation-liverpool"),
    "Aintree Business Park": ("business", 1, "/contractor-accommodation-liverpool"),
    "Gillmoss industrial estate": ("business", 2, "/contractor-accommodation-liverpool"),
    "Speke": ("business", 3, "/contractor-accommodation-liverpool"),
    "Liverpool Freeport": ("business", 2, "/contractor-accommodation-liverpool"),
    # universities
    "University of Liverpool": ("university", 2, "/student-parents-graduation-stays-liverpool"),
    "Liverpool John Moores University": ("university", 2, "/student-parents-graduation-stays-liverpool"),
    "LJMU": ("university", 2, "/student-parents-graduation-stays-liverpool"),
    "Edge Hill University": ("university", 2, "/student-parents-graduation-stays-liverpool"),
    "Liverpool Hope University": ("university", 2, "/student-parents-graduation-stays-liverpool"),
}
TOP_LANDMARKS = [k for k, v in LANDMARKS.items() if v[1] == 1]

# ---------------------------------------------------------------------------
# 3. Stay types with tags: L=leisure, W=work, G=group, F=family, LONG=long stay
# ---------------------------------------------------------------------------
STAYS = {
    "accommodation": {"L", "W", "G", "F", "LONG", "H"},
    "places to stay": {"L", "G", "F", "H"},
    "holiday home": {"L", "G", "F"},
    "holiday let": {"L", "G", "F"},
    "holiday house": {"L", "G", "F"},
    "holiday rental": {"L", "G", "F"},
    "holiday cottage": {"L", "F"},
    "vacation rental": {"L", "G", "F"},
    "short let": {"L", "W", "G", "F", "H", "LONG"},
    "short stay accommodation": {"L", "W", "G", "F", "H"},
    "short term rental": {"L", "W", "G", "F", "LONG", "H"},
    "serviced accommodation": {"L", "W", "G", "F", "H", "LONG"},
    "self catering accommodation": {"L", "W", "G", "F", "H"},
    "self catering house": {"L", "W", "G", "F", "H"},
    "Airbnb": {"L", "W", "G", "F", "H"},
    "entire house to rent": {"L", "W", "G", "F", "H"},
    "whole house to rent": {"L", "W", "G", "F", "H"},
    "house to rent short term": {"L", "W", "G", "F", "H", "LONG"},
    "house to rent for a week": {"L", "W", "G", "F", "H"},
    "house to rent for the weekend": {"L", "G", "F"},
    "4 bedroom house to rent": {"L", "W", "G", "F", "H"},
    "4 bed house": {"L", "W", "G", "F", "H"},
    "4 bedroom holiday home": {"L", "G", "F"},
    "large house": {"L", "G", "F", "W"},
    "large holiday home": {"L", "G", "F"},
    "group accommodation": {"L", "G", "W"},
    "large group accommodation": {"L", "G", "W"},
    "family accommodation": {"L", "F", "H"},
    "family holiday home": {"L", "F"},
    "contractor accommodation": {"W"},
    "contractor house": {"W"},
    "contractors accommodation": {"W"},
    "contractor housing": {"W"},
    "workforce accommodation": {"W"},
    "work crew accommodation": {"W"},
    "workers accommodation": {"W"},
    "corporate accommodation": {"W", "LONG"},
    "corporate housing": {"W", "LONG"},
    "business accommodation": {"W"},
    "key worker accommodation": {"W", "H"},
    "NHS staff accommodation": {"W", "H"},
    "long stay accommodation": {"LONG", "W", "H"},
    "monthly rental": {"LONG", "W"},
    "furnished house to rent": {"LONG", "W"},
    "furnished short let": {"LONG", "W", "H"},
    "relocation accommodation": {"LONG"},
    "temporary furnished accommodation": {"LONG", "W", "H"},
}
WORK_STAYS = [s for s, t in STAYS.items() if t == {"W"} or t == {"W", "LONG"} or t == {"W", "H"}]
CORE_STAYS = [
    "accommodation", "holiday home", "holiday let", "short let", "serviced accommodation",
    "self catering accommodation", "Airbnb", "entire house to rent", "4 bedroom house to rent",
    "4 bed house", "large house", "group accommodation", "family accommodation",
    "contractor accommodation", "contractor house", "short term rental",
]
HIGH_STAYS = {  # stays that match the product best -> help priority 1
    "4 bedroom house to rent", "4 bed house", "entire house to rent", "whole house to rent",
    "group accommodation", "large group accommodation", "family accommodation", "contractor accommodation",
    "contractor house", "contractors accommodation", "serviced accommodation", "holiday home",
    "holiday let", "short let", "Airbnb", "large house", "self catering house",
    "house to rent short term", "house to rent for a week", "accommodation", "family holiday home",
    "4 bedroom holiday home", "workforce accommodation", "work crew accommodation",
}

# stay -> cluster
def stay_cluster(stay):
    t = STAYS[stay]
    if stay in ("contractor accommodation", "contractor house", "contractors accommodation",
                "contractor housing", "workforce accommodation", "work crew accommodation",
                "workers accommodation"):
        return "contractor-workforce"
    if stay in ("corporate accommodation", "corporate housing", "business accommodation",
                "key worker accommodation", "NHS staff accommodation"):
        return "business-corporate"
    if "LONG" in t and stay in ("long stay accommodation", "monthly rental", "furnished house to rent",
                                "furnished short let", "relocation accommodation",
                                "temporary furnished accommodation"):
        return "long-stay-relocation"
    if stay in ("group accommodation", "large group accommodation", "large house", "large holiday home"):
        return "group-accommodation"
    if stay in ("family accommodation", "family holiday home", "holiday cottage"):
        return "family-stays"
    return "core-house-liverpool"


CLUSTER_SLUG = {
    "core-house-liverpool": "/",
    "group-accommodation": "/group-accommodation-liverpool",
    "family-stays": "/family-holiday-home-liverpool",
    "contractor-workforce": "/contractor-accommodation-liverpool",
    "business-corporate": "/business-corporate-stays-liverpool",
    "long-stay-relocation": "/long-stays-relocation-liverpool",
    "hospital-visitors": "/accommodation-near-aintree-hospital",
    "grand-national-racing": "/grand-national-accommodation",
    "football": "/football-stays-anfield-everton",
    "concerts-events": "/events-concerts-liverpool-stays",
    "local-areas": "/areas/",
    "features-amenities": "/the-house",
    "students-graduation": "/student-parents-graduation-stays-liverpool",
    "questions-guides": "/guides/where-to-stay-in-liverpool",
    "conversational-ai": "/",
    "comparisons-alternatives": "/guides/house-vs-hotel-liverpool-groups",
    "price-value": "/rates-and-booking",
    "last-minute": "/rates-and-booking",
    "brand-navigational": "/",
    "transport-location": "/location",
    "things-to-do": "/guides/things-to-do-near-zermatt-lodge",
}
GROUP_CLUSTER = {
    "hospital": "hospital-visitors",
    "racing": "grand-national-racing",
    "stadium": "football",
    "venue": "concerts-events",
    "attraction": "things-to-do",
    "transport": "transport-location",
    "business": "contractor-workforce",
    "university": "students-graduation",
}
GROUP_AUDIENCE = {
    "hospital": "hospital visitors",
    "racing": "race goers",
    "stadium": "football fans",
    "venue": "event goers",
    "attraction": "families/groups",
    "transport": "all",
    "business": "contractors/work crews",
    "university": "students' parents",
}
# which stay tags make sense near which landmark group
GROUP_STAY_TAGS = {
    "hospital": {"H", "LONG"},
    "racing": {"L", "G"},
    "stadium": {"L", "G"},
    "venue": {"L", "G", "W"},
    "attraction": {"L", "F", "G"},
    "transport": {"L", "W", "G", "F"},
    "business": {"W", "LONG"},
    "university": {"L", "F"},
}

# ---------------------------------------------------------------------------
# 4. Features and audiences
# ---------------------------------------------------------------------------
FEATURES = [
    "with parking", "with free parking", "with parking for 2 cars", "with driveway", "with off road parking",
    "with garden", "with large garden", "with private garden", "with pool table", "with games room",
    "with 2 bathrooms", "with en-suite", "with wifi", "with fast wifi", "with washing machine",
    "sleeps 6", "sleeps 7", "sleeps 8", "for 7 people", "for 6 people", "for 8 guests",
    "no pets", "pet free", "self check in", "with kitchen", "with dining table for 7",
]
AUDIENCES = {
    # audience phrase: (audience label, cluster, stay tags it fits)
    "for families": ("families", "family-stays", {"L", "F"}),
    "for large families": ("families", "family-stays", {"L", "F"}),
    "for a family of 6": ("families", "family-stays", {"L", "F"}),
    "for a family of 7": ("families", "family-stays", {"L", "F"}),
    "for groups": ("groups of friends", "group-accommodation", {"L", "G"}),
    "for large groups": ("groups of friends", "group-accommodation", {"L", "G"}),
    "for groups of friends": ("groups of friends", "group-accommodation", {"L", "G"}),
    "for a group of 7": ("groups of friends", "group-accommodation", {"L", "G"}),
    "for a group of 6": ("groups of friends", "group-accommodation", {"L", "G"}),
    "for a family reunion": ("families", "family-stays", {"L", "F", "G"}),
    "for contractors": ("contractors/work crews", "contractor-workforce", {"W"}),
    "for work crews": ("contractors/work crews", "contractor-workforce", {"W"}),
    "for workers": ("contractors/work crews", "contractor-workforce", {"W"}),
    "for engineers": ("contractors/work crews", "contractor-workforce", {"W"}),
    "for construction workers": ("contractors/work crews", "contractor-workforce", {"W"}),
    "for business travellers": ("business travellers", "business-corporate", {"W"}),
    "for business trips": ("business travellers", "business-corporate", {"W"}),
    "for NHS staff": ("NHS/key workers", "business-corporate", {"W", "H"}),
    "for nurses": ("NHS/key workers", "business-corporate", {"W", "H"}),
    "for locum doctors": ("NHS/key workers", "business-corporate", {"W", "H"}),
    "for hospital visitors": ("hospital visitors", "hospital-visitors", {"H"}),
    "for families visiting hospital": ("hospital visitors", "hospital-visitors", {"H", "F"}),
    "for relocation": ("relocators", "long-stay-relocation", {"LONG"}),
    "for people relocating": ("relocators", "long-stay-relocation", {"LONG"}),
    "while renovating": ("relocators", "long-stay-relocation", {"LONG"}),
    "for insurance claims": ("relocators", "long-stay-relocation", {"LONG"}),
    "for football fans": ("football fans", "football", {"L", "G"}),
    "for race goers": ("race goers", "grand-national-racing", {"L", "G"}),
    "for the Grand National": ("race goers", "grand-national-racing", {"L", "G"}),
    "for concerts": ("event goers", "concerts-events", {"L", "G"}),
    "for graduation": ("students' parents", "students-graduation", {"L", "F"}),
    "for wedding guests": ("groups of friends", "group-accommodation", {"L", "G", "F"}),
}

# ---------------------------------------------------------------------------
# 5. Events (from events-calendar.md research)
# ---------------------------------------------------------------------------
EVENTS = {
    # event phrase: (cluster, audience, priority, venue-landmark or None, years)
    "Grand National": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027", "2028"]),
    "Grand National festival": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Randox Grand National": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Aintree festival": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Aintree races": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Ladies Day Aintree": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Grand National day": ("grand-national-racing", "race goers", 1, "Aintree Racecourse", ["2027"]),
    "Becher Chase": ("grand-national-racing", "race goers", 2, "Aintree Racecourse", ["2026"]),
    "Aintree Boxing Day racing": ("grand-national-racing", "race goers", 2, "Aintree Racecourse", ["2026"]),
    "Liverpool Business Expo": ("business-corporate", "business travellers", 2, "Aintree Racecourse", ["2027"]),
    "Liverpool match": ("football", "football fans", 2, "Anfield", []),
    "Liverpool FC home game": ("football", "football fans", 2, "Anfield", []),
    "Merseyside derby": ("football", "football fans", 1, "Anfield", ["2027"]),
    "Champions League night Anfield": ("football", "football fans", 2, "Anfield", []),
    "LFC Legends match": ("football", "football fans", 2, "Anfield", ["2027"]),
    "Everton match": ("football", "football fans", 2, "Hill Dickinson Stadium", []),
    "Everton home game": ("football", "football fans", 2, "Hill Dickinson Stadium", []),
    "Anfield concert": ("concerts-events", "event goers", 1, "Anfield", ["2027"]),
    "M&S Bank Arena concert": ("concerts-events", "event goers", 2, "M&S Bank Arena", ["2027"]),
    "Strictly Come Dancing live tour Liverpool": ("concerts-events", "event goers", 3, "M&S Bank Arena", ["2027"]),
    "Liverpool Half Marathon": ("concerts-events", "runners", 2, "Hill Dickinson Stadium", ["2027"]),
    "Tour de France Liverpool": ("concerts-events", "event goers", 2, None, ["2027"]),
    "Liverpool Biennial": ("concerts-events", "event goers", 3, None, ["2027"]),
    "Liverpool Sound City": ("concerts-events", "event goers", 3, None, ["2027"]),
    "Creamfields": ("concerts-events", "event goers", 3, None, ["2027"]),
    "Southport Flower Show": ("concerts-events", "families", 3, None, ["2027"]),
    "International Beatleweek": ("concerts-events", "event goers", 3, None, ["2027"]),
    "Liverpool Christmas markets": ("concerts-events", "families", 2, None, ["2026"]),
    "European Wheelchair Basketball Championships Liverpool": ("concerts-events", "event goers", 3, "M&S Bank Arena", ["2027"]),
    "conference at ACC Liverpool": ("business-corporate", "business travellers", 2, "ACC Liverpool", ["2027"]),
    "University of Liverpool graduation": ("students-graduation", "students' parents", 2, None, ["2027"]),
    "LJMU graduation": ("students-graduation", "students' parents", 2, None, ["2027"]),
    "Edge Hill graduation": ("students-graduation", "students' parents", 2, None, ["2027"]),
    "University of Liverpool open day": ("students-graduation", "students' parents", 3, None, ["2027"]),
    "Liverpool Hope graduation": ("students-graduation", "students' parents", 3, None, ["2027"]),
}
EVENT_TEMPLATES = [
    ("{e} accommodation", "transactional"),
    ("{e} accommodation {y}", "transactional"),
    ("{e} {y} accommodation", "transactional"),
    ("where to stay for {e}", "informational"),
    ("where to stay for the {e} {y}", "informational"),
    ("places to stay for {e}", "commercial"),
    ("house to rent for {e}", "transactional"),
    ("group accommodation for {e}", "transactional"),
    ("{e} Airbnb", "transactional"),
    ("{e} self catering", "transactional"),
    ("{e} hotels", "commercial"),
    ("cheap accommodation for {e}", "commercial"),
    ("last minute accommodation {e}", "transactional"),
    ("holiday home for {e}", "transactional"),
    ("{e} accommodation with parking", "transactional"),
    ("{e} accommodation for groups", "transactional"),
    ("{e} accommodation for families", "transactional"),
    ("4 bedroom house for {e}", "transactional"),
]

# ---------------------------------------------------------------------------
# 6. Keywords actually seen during research (titles, queries, PAA-style phrasing)
# ---------------------------------------------------------------------------
VERIFIED = [
    "accommodation near Aintree University Hospital", "hotels near Aintree Racecourse",
    "hotels near Aintree Racecourse Liverpool", "serviced apartments Aintree", "key worker accommodation Liverpool",
    "contractor accommodation Liverpool", "contractor house sleeps 8 Liverpool", "Liverpool contractors house sleeps 8",
    "contractor accommodation in Merseyside", "contractors house free parking Liverpool",
    "contractor house for large groups private parking Liverpool", "contractors and groups with parking Liverpool",
    "group accommodation Liverpool", "group hotel Liverpool city centre", "hotel for 10 persons Liverpool",
    "hotels for 12 persons Liverpool", "where to stay in Liverpool", "where to stay in Liverpool England",
    "best areas to stay in Liverpool", "best area to stay in Liverpool for families", "best family hotels Liverpool",
    "monthly rentals Liverpool", "relocation accommodation Liverpool", "corporate housing Liverpool",
    "corporate apartments Liverpool", "furnished corporate apartment Liverpool", "serviced accommodation Liverpool",
    "Liverpool serviced accommodation", "serviced apartments Bootle", "short let apartments Bootle",
    "party houses Liverpool", "Airbnb with hot tub Liverpool", "hotels near Alder Hey hospital Liverpool",
    "Walton Centre home from home accommodation", "where to stay near Hill Dickinson Stadium",
    "hotels near Aintree station", "accommodation near Aintree station", "accommodation near Aintree",
    "Grand National accommodation", "where to park near Hill Dickinson Stadium", "Everton stadium guide",
    "how to get to Everton stadium", "Liverpool Christmas markets 2026", "Liverpool half marathon 2027",
    "short lets Liverpool", "Liverpool Airbnb houses", "holiday homes Aintree", "vacation homes in Aintree",
    "is Fazakerley a good area", "Grand National 2027 dates", "when is the Grand National 2027",
    "Anfield concerts 2027", "M&S Bank Arena events 2027", "where to stay in Liverpool for a group",
    "large group accommodation Liverpool sleeps 10", "4 bed home Liverpool free parking",
    "spacious bright family home by Aintree", "cosy family home by hospital Aintree parking",
    "house close to Aintree hospital", "2 bed house Liverpool close to Aintree hospital",
    "Grand National hospitality", "Aintree hospitality", "hotels near Aintree", "Premier Inn Liverpool Aintree",
    "Stables Inn at Aintree", "accommodation where to stay Aintree", "where to stay when you head to Aintree racecourse",
    "best hotels to book near Aintree racecourse", "Liverpool short lets", "Liverpool monthly rentals Airbnb",
    "serviced apartments Liverpool", "key worker accommodation", "contractor accommodation Bootle",
    "4 bed house Bootle", "9 guests 4 bedrooms Bootle", "spacious 4BR 4 beds 2 bathrooms parking Liverpool",
    "spacious home Liverpool", "entire home for large groups families contractors Liverpool",
    "sleeps 10 self catering holiday home Liverpool", "Liverpool home from home sleeps 4 free parking",
    "Liverpool luxury home with free parking", "4 bed home in Liverpool free parking",
    "comfort stay for professionals and contractors Liverpool", "Anfield contractors accommodation",
    "sleeps 5 driveway parking close to city stadiums", "pet friendly house Liverpool with garden",
    "Liverpool Christmas market dates", "Liverpool Sound City 2027", "Creamfields 2027",
    "Liverpool Biennial 2027", "Southport Flower Show 2027", "Tour de France Liverpool 2027",
    "Everton fixtures 2026-27", "Liverpool fixtures 2026-27", "Liverpool Legends v Inter Legends",
    "Strictly Come Dancing 2027 Liverpool", "Becher Chase", "Aintree Boxing Day racing",
    "Liverpool Business Expo 2027", "best areas in Liverpool for quiet residential short term stays",
    "Ronald McDonald House Alder Hey", "hotels near Alder Hey hospital", "relatives accommodation Liverpool hospital",
    "Walton Centre accommodation for families", "hotels near Aintree golf centre",
    "University of Liverpool graduation", "University of Liverpool open days", "LJMU graduation",
    "Liverpool Hope graduation", "Liverpool half marathon", "International Beatleweek",
    "Fazakerley crime rate", "history of Fazakerley", "short term furnished rental Liverpool",
    "house to rent Liverpool short term", "Airbnb Liverpool monthly", "Liverpool party apartments",
    "hotels in Liverpool for groups", "group accommodation in Liverpool",
]

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
rows = {}


def norm(k):
    k = k.lower().replace("’", "'")
    k = re.sub(r"[?!.,]+$", "", k.strip())
    return re.sub(r"\s+", " ", k)


VERIFIED_KEYS = {norm(v) for v in VERIFIED}

BAD = [
    r"\bliverpool\b.*\bliverpool\b.*\bliverpool\b",
    r"\bnear (the )?liverpool\b$",
    r"\b(\w+) \1\b",                      # doubled word
    r"in north liverpool city centre",
]


def ok(k):
    kl = k.lower()
    for b in BAD:
        if re.search(b, kl):
            return False
    # "liverpool liverpool" type duplication across seed+location
    if re.search(r"liverpool (city centre )?liverpool", kl):
        return False
    return 3 <= len(k) <= 160


def add(kw, cluster, intent, audience, location, priority, slug=None):
    kw = re.sub(r"\s+", " ", kw).strip()
    if not ok(kw):
        return
    key = norm(kw)
    src = "search-verified" if key in VERIFIED_KEYS else "pattern"
    slug = slug or CLUSTER_SLUG.get(cluster, "/")
    if key in rows:
        # keep the best (lowest) priority, keep first cluster
        r = rows[key]
        r["priority"] = min(r["priority"], priority)
        if src == "search-verified":
            r["source"] = src
        return
    rows[key] = dict(keyword=kw, cluster=cluster, intent=intent, audience=audience,
                     location=location, priority=max(1, min(3, priority)),
                     suggested_page_slug=slug, source=src)


def loc_slug(loc):
    return LOCATIONS[loc][1]


def loc_tier(loc):
    return LOCATIONS[loc][0]


def stay_audience(stay):
    c = stay_cluster(stay)
    return {
        "contractor-workforce": "contractors/work crews",
        "business-corporate": "business travellers",
        "long-stay-relocation": "relocators",
        "group-accommodation": "groups of friends",
        "family-stays": "families",
    }.get(c, "all")


def stay_intent(stay):
    return "transactional"


P1_LOCS = {"Liverpool", "north Liverpool", "Fazakerley", "Aintree", "L9", "L10"}
TOP_STAYS = {"4 bed house", "4 bedroom house to rent", "entire house to rent", "whole house to rent",
             "group accommodation", "large group accommodation", "family accommodation", "contractor accommodation",
             "contractor house", "contractors accommodation", "holiday home", "holiday let", "serviced accommodation",
             "short let", "Airbnb", "large house", "self catering house", "accommodation", "house to rent short term",
             "4 bedroom holiday home", "family holiday home"}


def prio(stay, tier, extra=0, loc=None):
    if stay in TOP_STAYS and tier == 1 and (loc is None or loc in P1_LOCS):
        p = 1
    elif tier <= 2:
        p = 2
    else:
        p = 3
    return min(3, p + extra)


# ---------------------------------------------------------------------------
# A/B. stay x location
# ---------------------------------------------------------------------------
for stay in STAYS:
    for loc, (tier, lslug) in LOCATIONS.items():
        cl = stay_cluster(stay)
        # area-specific pages for tier1/2 non-Liverpool locations when stay is generic
        if loc not in ("Liverpool", "north Liverpool", "Merseyside") and cl == "core-house-liverpool":
            cl_use, slug = "local-areas", lslug
        else:
            cl_use, slug = cl, None
        # holiday cottage etc in inner-city areas reads oddly
        if stay in ("vacation rental", "holiday house") and loc not in ("Liverpool", "Merseyside", "Aintree",
                                                                       "Southport", "Formby"):
            continue
        if stay in ("NHS staff accommodation", "key worker accommodation") and loc not in (
                "Liverpool", "north Liverpool", "Fazakerley", "Aintree", "Walton", "Orrell Park", "Merseyside",
                "Liverpool city centre", "West Derby", "Southport", "Ormskirk"):
            continue
        if stay == "holiday cottage" and loc not in ("Liverpool", "Merseyside", "Formby", "Southport", "Ormskirk",
                                                     "Maghull", "Melling", "Crosby"):
            continue
        if stay in ("relocation accommodation", "temporary furnished accommodation", "corporate housing") and \
                tier == 3 and loc not in ("Southport", "Ormskirk", "St Helens"):
            continue
        if stay in ("workforce accommodation", "work crew accommodation", "workers accommodation",
                    "contractor housing") and loc in ("Formby", "Southport", "Ormskirk", "Waterloo", "Crosby", "Melling"):
            continue
        p = prio(stay, tier, loc=loc)
        add(f"{stay} {loc}", cl_use, "transactional", stay_audience(stay), loc, p, slug)
        add(f"{stay} in {loc}", cl_use, "transactional", stay_audience(stay), loc, p, slug)
        if tier <= 2 and stay in CORE_STAYS:
            add(f"{loc} {stay}", cl_use, "transactional", stay_audience(stay), loc, p, slug)

# postcodes
for pc in POSTCODES:
    for stay in ["accommodation", "short let", "Airbnb", "serviced accommodation", "holiday let",
                 "contractor accommodation", "house to rent short term", "4 bed house", "group accommodation"]:
        add(f"{stay} {pc}", stay_cluster(stay) if stay_cluster(stay) != "core-house-liverpool" else "local-areas",
            "transactional", stay_audience(stay), pc.split()[0], 1, "/areas/fazakerley")

# ---------------------------------------------------------------------------
# C. stay near landmark
# ---------------------------------------------------------------------------
NEAR_FORMS = ["{s} near {l}", "{s} close to {l}", "{s} walking distance to {l}"]
GROUP_STAY_ONLY = {
    "transport": TOP_STAYS,
    "attraction": {"accommodation", "holiday home", "holiday let", "Airbnb", "family accommodation",
                   "self catering accommodation", "group accommodation"},
    "university": {"accommodation", "Airbnb", "holiday let", "short let", "family accommodation", "holiday home",
                   "serviced accommodation", "self catering accommodation"},
    "venue": {"accommodation", "Airbnb", "holiday let", "holiday home", "group accommodation", "short let",
              "self catering accommodation", "4 bed house", "large house", "entire house to rent"},
    "racing": TOP_STAYS | {"places to stay", "short stay accommodation", "holiday house", "holiday rental",
                           "large holiday home", "4 bedroom holiday home", "house to rent for the weekend"},
    "stadium": TOP_STAYS | {"places to stay", "short stay accommodation", "holiday rental",
                            "house to rent for the weekend"},
}
for lm, (grp, ltier, lslug) in LANDMARKS.items():
    tags_ok = GROUP_STAY_TAGS[grp]
    cl = GROUP_CLUSTER[grp]
    aud = GROUP_AUDIENCE[grp]
    for stay, tags in STAYS.items():
        if not (tags & tags_ok):
            continue
        if grp in GROUP_STAY_ONLY and stay not in GROUP_STAY_ONLY[grp]:
            if not (grp == "venue" and lm in ("ACC Liverpool", "Exhibition Centre Liverpool")
                    and stay in ("business accommodation", "corporate accommodation", "serviced accommodation",
                                 "short let", "accommodation")):
                continue
        if stay in ("NHS staff accommodation", "key worker accommodation") and grp != "hospital":
            continue
        for i, form in enumerate(NEAR_FORMS):
            if grp in ("transport", "attraction", "university", "venue") and i == 1:
                continue
            # only offer "walking distance" where Zermatt Lodge is genuinely close
            if i == 2 and grp not in ("hospital", "racing", "transport"):
                continue
            if i == 2 and ltier > 1:
                continue
            if i == 2 and grp == "transport" and "station" not in lm:
                continue
            if i >= 1 and stay not in HIGH_STAYS and stay not in WORK_STAYS:
                continue
            p = 1 if (ltier == 1 and stay in TOP_STAYS) else (2 if ltier <= 2 else 3)
            if grp in ("attraction",) or (grp == "transport" and ltier > 1):
                p = max(p, 3 if ltier == 3 else 2)
            add(form.format(s=stay, l=lm), cl, "transactional", aud, lm, p, lslug)
    # hotels near landmark - comparison/commercial intent but real prospects
    for h in ["hotels near", "cheap hotels near", "B&B near", "guest house near", "apartments near",
              "serviced apartments near", "places to stay near", "where to stay near", "accommodation near",
              "Airbnb near", "houses to rent near"]:
        p = 2 if ltier == 1 else 3
        if h in ("places to stay near", "accommodation near", "Airbnb near", "houses to rent near") and ltier == 1:
            p = 1
        add(f"{h} {lm}", cl, "commercial" if "hotel" in h or "B&B" in h or "guest" in h else "transactional",
            aud, lm, p, lslug)

# landmark-specific audience phrases
HOSPITAL_PHRASES = [
    "accommodation for relatives near {l}", "accommodation for families visiting {l}",
    "where to stay when visiting someone at {l}", "places to stay for patients families near {l}",
    "somewhere to stay near {l} for a week", "self catering near {l} for visiting family",
    "house to rent near {l} while relative in hospital", "short stay near {l} with parking",
    "accommodation for patients relatives {l}", "family accommodation near {l}",
    "long stay accommodation near {l}", "nurse accommodation near {l}", "locum accommodation near {l}",
    "NHS contractor accommodation near {l}", "accommodation near {l} with parking",
    "hotels close to {l}", "nearest hotel to {l}", "parking near {l}", "how to get to {l} from Fazakerley station",
    "{l} visiting times", "{l} accommodation for families",
]
for lm, (grp, ltier, lslug) in LANDMARKS.items():
    if grp != "hospital":
        continue
    for ph in HOSPITAL_PHRASES:
        kw = ph.format(l=lm)
        info = kw.startswith(("where", "how", "parking", "nearest")) or "visiting times" in kw
        intent = "informational" if info else "transactional"
        p = (1 if ltier == 1 else 2) if not info else (2 if ltier == 1 else 3)
        add(kw, "hospital-visitors", intent, "hospital visitors", lm, p, lslug)

STADIUM_PHRASES = [
    "where to stay for {l}", "best place to stay for {l}", "accommodation for {l} match day",
    "match day accommodation near {l}", "group accommodation near {l} for football",
    "house near {l} for match weekend", "places to stay near {l} with parking",
    "how far is {l} from Fazakerley", "how to get to {l} from Fazakerley", "parking near {l}",
    "pubs near {l}", "{l} away fans accommodation", "{l} football weekend accommodation",
    "stag do accommodation near {l}",
]
for lm, (grp, ltier, lslug) in LANDMARKS.items():
    if grp != "stadium":
        continue
    for ph in STADIUM_PHRASES:
        if ph.startswith("stag do"):
            continue  # not a fit for house rules; kept out deliberately
        kw = ph.format(l=lm)
        info = kw.startswith(("how", "parking", "pubs"))
        add(kw, "football", "informational" if info else "transactional", "football fans", lm,
            (3 if info else (1 if ltier == 1 else 2)), lslug)

RACE_PHRASES = [
    "where to stay for Aintree races", "accommodation near Aintree racecourse for Grand National",
    "walking distance to Aintree racecourse accommodation", "houses to rent near Aintree racecourse",
    "Grand National house rental", "Grand National holiday let", "Grand National group house",
    "Grand National weekend accommodation", "Grand National accommodation Liverpool",
    "Grand National accommodation Aintree", "Grand National accommodation Fazakerley",
    "Grand National accommodation with parking", "Grand National accommodation for 7",
    "Grand National accommodation sleeps 7", "Grand National accommodation sleeps 8",
    "Grand National Airbnb Aintree", "Aintree racecourse Airbnb", "Aintree racecourse self catering",
    "Grand National accommodation still available", "Grand National 2027 accommodation availability",
    "how far is Aintree racecourse from Fazakerley", "can you walk to Aintree racecourse from Fazakerley",
    "how to get to Aintree racecourse", "Aintree racecourse parking", "Grand National 2027 dates",
    "when is the Grand National 2027", "Grand National 2027 tickets", "Grand National ladies day 2027",
    "what to wear Grand National ladies day", "Grand National tips for first timers",
    "Grand National hospitality 2027", "Aintree racecourse events 2027", "Aintree racecourse fixtures 2027",
    "Grand National weekend Liverpool things to do", "Grand National trains to Aintree",
]
for kw in RACE_PHRASES:
    info = kw.startswith(("how", "can you", "when", "what", "Grand National tips")) or kw.endswith(
        ("dates", "tickets", "parking", "2027", "fixtures 2027", "things to do", "to Aintree"))
    tx = not info
    add(kw, "grand-national-racing", "transactional" if tx else "informational", "race goers",
        "Aintree", 1 if tx else 3)

# ---------------------------------------------------------------------------
# D. stay x location x feature
# ---------------------------------------------------------------------------
FEAT_STAYS = ["accommodation", "holiday home", "holiday let", "short let", "serviced accommodation",
              "Airbnb", "4 bed house", "group accommodation", "family accommodation",
              "contractor accommodation", "contractor house", "self catering house", "house to rent short term"]
P1_FEATURES = ("with parking", "with free parking", "with garden", "with pool table", "with games room",
               "sleeps 7", "sleeps 8", "for 7 people", "with parking for 2 cars", "with driveway")
CONTRACTOR_FEATURES = ("with parking", "with free parking", "with parking for 2 cars", "with driveway",
                       "with off road parking", "with wifi", "with fast wifi", "with washing machine", "with kitchen",
                       "sleeps 6", "sleeps 7", "sleeps 8", "for 6 people", "for 7 people", "self check in",
                       "with 2 bathrooms", "with garden")
FEAT_LOCS = ["Liverpool", "north Liverpool", "Fazakerley", "Aintree", "Walton", "Orrell Park", "Merseyside",
             "Maghull", "Kirkby", "Bootle", "Anfield", "Norris Green", "Netherton", "Crosby", "West Derby"]
for stay in FEAT_STAYS:
    for loc in FEAT_LOCS:
        tier = loc_tier(loc)
        for f in FEATURES:
            core_loc = loc in ("Liverpool", "north Liverpool", "Fazakerley", "Aintree")
            if not core_loc and f not in ("with parking", "with free parking", "with garden", "with pool table",
                                          "with games room", "sleeps 7", "sleeps 8"):
                continue
            if stay.startswith("contractor") and f not in CONTRACTOR_FEATURES:
                continue
            if stay == "serviced accommodation" and f in ("with games room", "with pool table", "with large garden",
                                                          "with private garden", "with dining table for 7"):
                continue
            if f in ("for 6 people", "for 8 guests", "with dining table for 7", "self check in",
                     "with kitchen", "with washing machine") and stay in ("accommodation", "group accommodation",
                                                                         "family accommodation"):
                continue
            cl = "features-amenities"
            if f.startswith(("sleeps", "for ")):
                cl = "group-accommodation"
            if stay.startswith("contractor"):
                cl = "contractor-workforce"
            p = 1 if (loc in P1_LOCS and stay in TOP_STAYS and f in P1_FEATURES) else 2
            add(f"{stay} {loc} {f}", cl, "transactional", stay_audience(stay), loc, p)

# feature-led head terms
FEATURE_HEADS = [
    "house with pool table to rent", "house with games room to rent", "holiday home with games room",
    "holiday home with pool table", "Airbnb with pool table", "Airbnb with games room",
    "holiday let with games room", "group house with games room", "house with pool table for weekend",
    "self catering with games room", "holiday home with large garden", "holiday home with parking",
    "holiday home with driveway", "house sleeps 7", "house sleeps 8", "holiday home sleeps 7",
    "holiday home sleeps 8", "4 bedroom holiday home with parking", "4 bedroom holiday home with garden",
    "holiday home with 2 bathrooms", "holiday home with en-suite", "family holiday home with garden",
    "contractor house with parking for vans", "contractor accommodation with van parking",
    "contractor accommodation with separate beds", "contractor accommodation with washing machine",
    "contractor accommodation with wifi", "house with parking for 2 cars", "house with driveway to rent",
    "no pets holiday home", "pet free accommodation", "allergy friendly holiday home",
    "quiet residential holiday home", "non smoking holiday home",
]
for fh in FEATURE_HEADS:
    for loc in ["Liverpool", "north Liverpool", "Merseyside", "Aintree", "Fazakerley"]:
        tier = loc_tier(loc)
        p = 1 if tier == 1 and any(x in fh for x in ("pool table", "games room", "sleeps 7", "4 bedroom",
                                                       "parking", "driveway")) else 2
        add(f"{fh} {loc}", "features-amenities", "transactional",
            "contractors/work crews" if "contractor" in fh else "all", loc, p)
        if loc == "Liverpool":
            add(f"{fh} near Liverpool", "features-amenities", "transactional", "all", loc, p)

# ---------------------------------------------------------------------------
# E. stay x location x audience
# ---------------------------------------------------------------------------
# explicit audience -> stays that a real person would pair with it
AUD_STAYS = {
    "families": ["accommodation", "holiday home", "holiday let", "self catering accommodation", "Airbnb",
                 "4 bed house", "large house", "short let", "house to rent for a week", "holiday rental"],
    "groups of friends": ["accommodation", "holiday home", "holiday let", "Airbnb", "4 bed house", "large house",
                          "self catering accommodation", "house to rent for the weekend", "short let"],
    "contractors/work crews": ["accommodation", "house", "4 bed house", "short let", "serviced accommodation",
                               "Airbnb", "self catering accommodation", "house to rent short term"],
    "business travellers": ["accommodation", "serviced accommodation", "short let", "Airbnb", "house"],
    "NHS/key workers": ["accommodation", "short let", "serviced accommodation", "house to rent short term"],
    "hospital visitors": ["accommodation", "short let", "self catering accommodation", "Airbnb",
                          "house to rent for a week"],
    "relocators": ["accommodation", "furnished house to rent", "short let", "serviced accommodation",
                   "4 bed house", "house to rent short term"],
    "football fans": ["accommodation", "Airbnb", "house", "holiday let", "group accommodation"],
    "race goers": ["accommodation", "Airbnb", "house", "holiday let"],
    "event goers": ["accommodation", "Airbnb", "group accommodation"],
    "students' parents": ["accommodation", "Airbnb", "holiday let", "family accommodation"],
}
AUD_LOCS = ["Liverpool", "north Liverpool", "Fazakerley", "Aintree", "Walton", "Orrell Park", "Merseyside",
            "Maghull", "Kirkby", "Bootle"]
for a, (alabel, acl, atags) in AUDIENCES.items():
    for stay in AUD_STAYS[alabel]:
        if stay in ("contractor accommodation", "contractor house") and a == "for contractors":
            continue
        if stay in ("group accommodation",) and "group" in a:
            continue
        if stay in ("family accommodation",) and "famil" in a:
            continue
        locs = AUD_LOCS if stay in ("accommodation", "Airbnb", "4 bed house", "short let", "holiday home") else \
            ["Liverpool", "north Liverpool", "Fazakerley", "Aintree", "Merseyside"]
        if alabel in ("football fans", "race goers", "event goers", "students' parents"):
            locs = ["Liverpool", "north Liverpool", "Aintree", "Fazakerley"]
        for loc in locs:
            p = 1 if (loc in P1_LOCS and stay in TOP_STAYS | {"house"}) else 2
            if a in ("for wedding guests", "for concerts", "while renovating", "for insurance claims",
                     "for a family reunion", "for graduation", "for engineers", "for locum doctors"):
                p = 2
            add(f"{stay} {loc} {a}", acl, "transactional", alabel, loc, p)
            if loc in ("Liverpool", "Aintree", "Fazakerley"):
                add(f"{stay} {a} in {loc}", acl, "transactional", alabel, loc, p)
                if stay == "house":
                    add(f"house to rent {a} in {loc}", acl, "transactional", alabel, loc, p)

# ---------------------------------------------------------------------------
# F. adjective / price / last-minute
# ---------------------------------------------------------------------------
ADJ = {
    "cheap": ("price-value", "commercial"), "affordable": ("price-value", "commercial"),
    "budget": ("price-value", "commercial"), "best value": ("price-value", "commercial"),
    "best": ("core-house-liverpool", "commercial"), "top rated": ("core-house-liverpool", "commercial"),
    "spacious": ("core-house-liverpool", "transactional"), "modern": ("core-house-liverpool", "transactional"),
    "quiet": ("core-house-liverpool", "transactional"), "clean": ("core-house-liverpool", "transactional"),
    "last minute": ("last-minute", "transactional"), "same day": ("last-minute", "transactional"),
    "tonight": ("last-minute", "transactional"), "weekend": ("core-house-liverpool", "transactional"),
    "midweek": ("core-house-liverpool", "transactional"), "weekly": ("price-value", "transactional"),
}
ADJ_STAYS = ["accommodation", "holiday home", "holiday let", "short let", "serviced accommodation", "Airbnb",
             "4 bed house", "group accommodation", "family accommodation", "contractor accommodation",
             "self catering accommodation", "large house", "short term rental"]
ADJ_ONLY = {
    "tonight": {"accommodation", "Airbnb", "short let", "serviced accommodation"},
    "same day": set(),
    "clean": set(),
    "top rated": {"Airbnb", "holiday home", "holiday let", "serviced accommodation", "accommodation"},
    "quiet": {"accommodation", "holiday home", "holiday let", "Airbnb", "family accommodation",
              "contractor accommodation", "short let"},
    "modern": {"holiday home", "holiday let", "Airbnb", "4 bed house", "serviced accommodation",
               "contractor accommodation", "short let"},
    "midweek": {"accommodation", "holiday home", "holiday let", "short let", "Airbnb"},
    "weekend": {"accommodation", "holiday home", "holiday let", "short let", "Airbnb", "4 bed house",
                "group accommodation", "large house"},
    "spacious": {"holiday home", "holiday let", "Airbnb", "4 bed house", "family accommodation",
                 "group accommodation", "short let", "self catering accommodation"},
}
for adj, (cl, intent) in ADJ.items():
    for stay in ADJ_STAYS:
        if adj in ADJ_ONLY and stay not in ADJ_ONLY[adj]:
            continue
        for loc in ["Liverpool", "north Liverpool", "Fazakerley", "Aintree", "Walton", "Merseyside", "Maghull",
                    "Kirkby", "Bootle"]:
            tier = loc_tier(loc)
            if tier == 2 and adj not in ("cheap", "affordable", "last minute", "best"):
                continue
            if adj == "tonight":
                kw = f"{stay} {loc} tonight"
            elif adj == "weekly":
                if stay not in ("contractor accommodation", "serviced accommodation", "short let",
                                "short term rental", "4 bed house", "holiday let"):
                    continue
                kw = f"weekly {stay} {loc}"
            else:
                kw = f"{adj} {stay} {loc}"
            p = 1 if (loc in P1_LOCS and stay in TOP_STAYS and adj in (
                "last minute", "best", "spacious", "affordable", "best value")) else 2
            if tier == 2:
                p = max(p, 2)
            use_cl = cl
            if cl == "core-house-liverpool" and stay_cluster(stay) != "core-house-liverpool":
                use_cl = stay_cluster(stay)
            add(kw, use_cl, intent, stay_audience(stay), loc, p)

PRICE_PHRASES = [
    "how much is a house to rent in Liverpool for a weekend",
    "how much does an Airbnb in Liverpool cost per night",
    "average price of a 4 bedroom Airbnb in Liverpool",
    "how much is group accommodation in Liverpool",
    "cost of contractor accommodation in Liverpool per week",
    "contractor accommodation Liverpool price per night",
    "contractor accommodation Liverpool weekly rate",
    "serviced accommodation Liverpool price per night",
    "Liverpool holiday home price per night",
    "is it cheaper to rent a house than hotel rooms in Liverpool",
    "cheapest way to stay in Liverpool for a group",
    "cheapest way to stay in Liverpool for Grand National",
    "Grand National accommodation prices",
    "how much does accommodation cost for the Grand National",
    "long stay discount Liverpool accommodation",
    "monthly discount serviced accommodation Liverpool",
    "book direct holiday home Liverpool",
    "book direct Liverpool accommodation no booking fees",
    "Liverpool accommodation without Airbnb fees",
    "direct booking discount Liverpool holiday let",
    "price per person group house Liverpool",
    "cheap house for 7 people Liverpool",
    "cheap accommodation for 7 adults Liverpool",
    "cheap family accommodation Liverpool with parking",
    "affordable 4 bedroom house to rent Liverpool short term",
    "value for money accommodation Liverpool for groups",
    "Liverpool accommodation under £200 a night for 7",
    "Liverpool house for 7 under £250 a night",
    "split cost holiday home Liverpool",
    "VAT invoice contractor accommodation Liverpool",
    "contractor accommodation Liverpool with invoice",
    "corporate rates accommodation Liverpool",
    "Liverpool accommodation deals",
    "Liverpool holiday home deals 2027",
    "Liverpool short let special offers",
    "free cancellation accommodation Liverpool",
    "flexible cancellation holiday home Liverpool",
]
for kw in PRICE_PHRASES:
    info = kw.startswith(("how", "average", "is it", "cost", "cheapest way"))
    add(kw, "price-value", "informational" if info else "commercial", "all", "Liverpool",
        2 if info else (1 if "book direct" in kw or "7" in kw else 2))

LAST_MIN = [
    "last minute accommodation Liverpool tonight", "last minute group accommodation Liverpool",
    "last minute house to rent Liverpool this weekend", "last minute Airbnb Liverpool for 7",
    "last minute contractor accommodation Liverpool", "last minute Grand National accommodation",
    "last minute accommodation near Aintree hospital", "emergency accommodation for contractors Liverpool",
    "accommodation available this weekend Liverpool", "Liverpool accommodation available tonight",
    "short notice accommodation Liverpool", "short notice contractor accommodation Liverpool",
    "same week booking holiday home Liverpool", "late availability holiday home Liverpool",
    "last minute holiday let Merseyside", "last minute football weekend accommodation Liverpool",
]
for kw in LAST_MIN:
    add(kw, "last-minute", "transactional", "all", "Liverpool", 1)

# ---------------------------------------------------------------------------
# Events
# ---------------------------------------------------------------------------
for e, (cl, aud, p0, venue, years) in EVENTS.items():
    for tpl, intent in EVENT_TEMPLATES:
        if "{y}" in tpl:
            if not years:
                continue
            for y in years:
                kw = tpl.format(e=e, y=y)
                add(kw, cl, intent, aud, venue or "Liverpool", p0)
        else:
            kw = tpl.format(e=e)
            pp = p0 if intent != "commercial" else min(3, p0 + 1)
            if "hotels" in kw:
                pp = min(3, p0 + 1)
            add(kw, cl, intent, aud, venue or "Liverpool", pp)
    for y in years:
        add(f"{e} {y} dates", cl, "informational", aud, venue or "Liverpool", 3)
        add(f"{e} {y}", cl, "informational", aud, venue or "Liverpool", 3)
        add(f"when is {e} {y}", cl, "informational", aud, venue or "Liverpool", 3)
    if venue:
        add(f"accommodation near {venue} for {e}", cl, "transactional", aud, venue, p0)

# ---------------------------------------------------------------------------
# Questions / guides (informational)
# ---------------------------------------------------------------------------
PURPOSES = {
    "a family holiday": "families", "families": "families", "a group of friends": "groups of friends",
    "a large group": "groups of friends", "a group of 7": "groups of friends", "a group of 8": "groups of friends",
    "the Grand National": "race goers", "Aintree races": "race goers", "a Liverpool match": "football fans",
    "an Everton match": "football fans", "Anfield": "football fans", "a concert at Anfield": "event goers",
    "a concert at the M&S Bank Arena": "event goers", "a conference at ACC Liverpool": "business travellers",
    "work": "contractors/work crews", "contractors": "contractors/work crews",
    "a business trip": "business travellers", "a hospital visit": "hospital visitors",
    "visiting Aintree hospital": "hospital visitors", "visiting the Walton Centre": "hospital visitors",
    "graduation": "students' parents", "a weekend break": "all", "a week": "all", "a month": "relocators",
    "first time visitors": "all", "a football weekend": "football fans", "a city break with kids": "families",
    "people with a car": "all", "a quiet stay": "all", "the Tour de France 2027": "event goers",
    "the Liverpool Half Marathon": "runners",
}
QTPL = [
    "where to stay in Liverpool for {p}", "best area to stay in Liverpool for {p}",
    "best place to stay in Liverpool for {p}", "where should I stay in Liverpool for {p}",
    "best accommodation in Liverpool for {p}",
]
for p, aud in PURPOSES.items():
    for t in QTPL:
        kw = t.format(p=p)
        pr = 1 if aud in ("race goers", "hospital visitors", "contractors/work crews") or p in (
            "a group of 7", "a large group", "a family holiday", "a group of friends") else 2
        if t.startswith("best accommodation"):
            intent = "commercial"
        else:
            intent = "informational"
        add(kw, "questions-guides", intent, aud, "Liverpool", pr)

AREA_Q = [
    "is {a} a good area to stay in Liverpool", "is {a} safe", "is {a} a nice area", "what is {a} like",
    "how far is {a} from Liverpool city centre", "how to get from {a} to Liverpool city centre",
    "things to do in {a}", "restaurants in {a}", "takeaways in {a}", "supermarkets near {a}",
    "parks in {a}", "is {a} near Anfield", "how far is {a} from Aintree racecourse",
]
for a in ["Fazakerley", "Aintree", "Walton", "Orrell Park", "Maghull", "Kirkby", "Bootle", "Norris Green",
          "Netherton", "Old Roan", "Croxteth", "Crosby", "Anfield", "West Derby"]:
    for t in AREA_Q:
        if t == "is {a} near Anfield" and a == "Anfield":
            continue
        if t == "how far is {a} from Aintree racecourse" and a == "Aintree":
            continue
        kw = t.format(a=a)
        pr = 2 if a in ("Fazakerley", "Aintree", "Orrell Park", "Walton") else 3
        cl = "things-to-do" if t.startswith(("things", "restaurants", "takeaways", "supermarkets", "parks")) else "local-areas"
        add(kw, cl, "informational", "all", a, pr, LOCATIONS[a][1])

DIST_FROM = ["Fazakerley", "Aintree", "Zermatt Lodge"]
DIST_TO = ["Anfield", "Goodison Park", "Hill Dickinson Stadium", "Aintree racecourse", "Aintree hospital",
           "Liverpool city centre", "Liverpool Lime Street", "Albert Dock", "Southport", "Formby beach",
           "Crosby beach", "Knowsley Safari Park", "M&S Bank Arena", "Liverpool John Lennon Airport",
           "Manchester", "Manchester Airport", "Chester", "the Lake District", "Alder Hey", "the Walton Centre",
           "Royal Liverpool Hospital", "Ormskirk", "Edge Hill University", "Kirkby", "Knowsley Industrial Park",
           "the Port of Liverpool", "Maghull", "Croxteth Hall"]
for f in DIST_FROM:
    for t in DIST_TO:
        if f.lower() in t.lower():
            continue
        pr = 2 if t in ("Anfield", "Hill Dickinson Stadium", "Aintree racecourse", "Liverpool city centre",
                        "Aintree hospital") else 3
        add(f"how far is {f} from {t}", "transport-location", "informational", "all", f, pr)
        if f != "Zermatt Lodge":
            add(f"{f} to {t}", "transport-location", "informational", "all", f, 3)
            add(f"train from {f} to {t}", "transport-location", "informational", "all", f, 3) if t in (
                "Liverpool city centre", "Liverpool Lime Street", "Southport", "Ormskirk", "Kirkby",
                "Formby beach", "Crosby beach", "Maghull") else None

GENERAL_Q = [
    "where to stay in Liverpool", "best area to stay in Liverpool", "best areas to stay in Liverpool",
    "where to stay in Liverpool with a car", "where to stay in Liverpool with free parking",
    "best place to stay in Liverpool with parking", "is it better to stay in Liverpool city centre or outside",
    "is north Liverpool a good place to stay", "safest areas to stay in Liverpool",
    "quiet areas to stay in Liverpool", "where to stay near Liverpool for the Grand National",
    "where do contractors stay in Liverpool", "where do NHS staff stay in Liverpool short term",
    "where can families stay near Aintree hospital", "is there accommodation at Aintree hospital",
    "does Aintree hospital have relatives accommodation", "can I stay overnight at Aintree hospital",
    "does the Walton Centre have accommodation for families", "how do I book the Walton Centre home from home",
    "how early should I book Grand National accommodation", "how far in advance to book Liverpool accommodation",
    "is Liverpool expensive to stay", "is Airbnb legal in Liverpool", "do Liverpool Airbnbs allow groups",
    "are house parties allowed in Liverpool Airbnbs", "what is serviced accommodation",
    "what is contractor accommodation", "what is the difference between serviced accommodation and a hotel",
    "is serviced accommodation cheaper than a hotel", "how does contractor accommodation work",
    "how long can you stay in serviced accommodation", "can I rent a house in Liverpool for a month",
    "can you rent a furnished house in Liverpool for 3 months", "where to stay in Liverpool for 2 weeks",
    "where to stay in Liverpool for a month", "best family friendly areas in Liverpool",
    "things to do in north Liverpool", "things to do in Liverpool with kids", "things to do in Liverpool for groups",
    "things to do near Aintree", "things to do near Fazakerley", "rainy day things to do Liverpool groups",
    "best pubs near Aintree racecourse", "restaurants near Aintree racecourse", "restaurants near Aintree hospital",
    "food near Aintree hospital", "Aintree hospital parking", "Aintree hospital parking cost",
    "Aintree hospital visiting hours", "Walton Centre visiting times", "how to get to Aintree hospital by train",
    "nearest train station to Aintree hospital", "nearest station to Aintree racecourse",
    "Fazakerley station to Liverpool Central", "Merseyrail Kirkby line stations", "Merseyrail Ormskirk line stations",
    "how to get from Liverpool airport to Aintree", "how to get to Anfield from north Liverpool",
    "parking for Anfield on match day", "parking for Everton stadium on match day",
    "Liverpool events 2027", "what's on in Liverpool 2027", "Liverpool events this weekend",
    "Liverpool concerts 2027", "Anfield concerts 2027", "Hill Dickinson Stadium concerts 2027",
    "M&S Bank Arena events 2027", "ACC Liverpool events 2027", "Liverpool fixtures 2026-27",
    "Everton fixtures 2026-27", "Liverpool v Everton 2027 date", "Grand National 2027 dates",
    "Liverpool Christmas markets 2026", "Liverpool half marathon 2027", "Tour de France Liverpool 2027 route",
    "Liverpool Biennial 2027 dates", "Liverpool Sound City 2027", "Creamfields 2027 dates",
    "Liverpool Christmas market dates", "is Fazakerley a good area", "Fazakerley crime rate", "history of Fazakerley",
    "best areas in Liverpool for quiet residential short term stays", "best areas to stay in Liverpool for families",
    "best family hotels Liverpool", "where to stay in Liverpool England", "where to stay in Liverpool for a group",
    "where to stay near Hill Dickinson Stadium", "where to park near Hill Dickinson Stadium",
    "how to get to Everton stadium", "Everton stadium guide", "when is the Grand National 2027",
]
for kw in GENERAL_Q:
    pr = 2
    if any(x in kw for x in ("contractors stay", "families stay near Aintree", "accommodation at Aintree",
                             "relatives accommodation", "stay overnight", "Grand National accommodation",
                             "where to stay in Liverpool with", "with parking", "for a group")):
        pr = 1
    if any(x in kw for x in ("events", "fixtures", "concerts", "dates", "crime", "history", "markets",
                             "Sound City", "Creamfields", "Biennial", "route", "half marathon", "stations",
                             "Central", "visiting", "parking cost")):
        pr = 3
    cl = "questions-guides"
    if any(x in kw for x in ("Aintree hospital", "Walton Centre")):
        cl = "hospital-visitors"
    elif "Grand National" in kw or "Aintree racecourse" in kw:
        cl = "grand-national-racing"
    elif any(x in kw for x in ("Anfield", "Everton", "fixtures")):
        cl = "football"
    elif any(x in kw for x in ("events", "concerts", "Christmas", "Biennial", "Sound City", "Creamfields",
                               "Tour de France", "half marathon")):
        cl = "concerts-events"
    elif "contractor" in kw or "serviced accommodation" in kw:
        cl = "contractor-workforce" if "contractor" in kw else "business-corporate"
    elif "things to do" in kw or "restaurants" in kw or "pubs" in kw or "food near" in kw:
        cl = "things-to-do"
    elif any(x in kw for x in ("station", "train", "airport", "Merseyrail", "get to")):
        cl = "transport-location"
    elif "month" in kw or "3 months" in kw or "2 weeks" in kw:
        cl = "long-stay-relocation"
    add(kw, cl, "informational", "all", "Liverpool", pr)

# ---------------------------------------------------------------------------
# Comparisons / alternatives
# ---------------------------------------------------------------------------
COMP = [
    "hotel vs house Liverpool for groups", "hotel vs Airbnb Liverpool", "Airbnb vs hotel for a group of 7",
    "house or hotel for Grand National", "serviced accommodation vs hotel for contractors",
    "contractor house vs hotel rooms", "is a holiday home cheaper than a hotel for families",
    "holiday let vs hotel Liverpool families", "self catering vs hotel Liverpool",
    "Airbnb vs serviced accommodation Liverpool", "Liverpool city centre vs suburbs where to stay",
    "stay in Liverpool city centre or Aintree for Grand National", "stay in Southport or Liverpool for Grand National",
    "stay in Liverpool or Manchester", "Airbnb alternative Liverpool", "Airbnb alternatives UK direct booking",
    "Booking.com alternative holiday home Liverpool", "Vrbo Liverpool houses", "Vrbo Aintree",
    "alternative to Premier Inn Liverpool Aintree", "Premier Inn Liverpool Aintree", "Park Hotel Netherton",
    "Stables Inn at Aintree", "alternative to hotels near Aintree racecourse",
    "alternative to Ronald McDonald House Alder Hey", "Ronald McDonald House Alder Hey",
    "Walton Centre home from home accommodation", "alternative to Walton Centre home from home",
    "comfyworkers Liverpool alternative", "contractor accommodation Liverpool vs Travelodge",
    "Travelodge alternative for contractors Liverpool", "Premier Inn alternative for contractors Liverpool",
    "hotels near Aintree", "hotels near Aintree hospital", "hotels near Aintree University Hospital",
    "hotels near Fazakerley", "hotels in Maghull", "hotels in Kirkby", "hotels in Bootle", "hotels in Walton Liverpool",
    "hotels near Anfield", "hotels near Hill Dickinson Stadium", "hotels near Everton stadium",
    "hotels in Liverpool for groups", "hotels in Liverpool with family rooms for 5", "hotel rooms for 7 Liverpool",
    "family room for 6 Liverpool hotel", "hotels in Liverpool with free parking", "best family hotels Liverpool",
    "group hotel Liverpool city centre", "hotel for 10 persons Liverpool", "hotels for 12 persons Liverpool",
    "party houses Liverpool", "Liverpool party apartments", "Airbnb with hot tub Liverpool",
    "serviced apartments Liverpool", "serviced apartments Aintree", "serviced apartments Bootle",
    "short let apartments Bootle", "apartment vs house Liverpool for families",
    "why rent a whole house instead of hotel rooms", "benefits of serviced accommodation for contractors",
    "pros and cons of Airbnb for groups",
]
for kw in COMP:
    info = kw.startswith(("why", "benefits", "pros", "is a", "stay in")) or " vs " in kw or " or " in kw
    navig = kw.startswith(("Premier Inn", "Park Hotel", "Stables Inn", "Ronald McDonald", "Walton Centre home",
                           "Vrbo", "comfyworkers"))
    intent = "navigational" if navig else ("informational" if info else "commercial")
    pr = 2
    if kw.startswith("alternative") or "Airbnb alternative" in kw or "hotels near Aintree" in kw or \
            kw in ("hotel vs house Liverpool for groups", "house or hotel for Grand National",
                   "contractor house vs hotel rooms", "hotel rooms for 7 Liverpool"):
        pr = 1
    if navig:
        pr = 3
    add(kw, "comparisons-alternatives", intent, "all", "Liverpool", pr)

# ---------------------------------------------------------------------------
# Brand / navigational
# ---------------------------------------------------------------------------
for kw in ["Zermatt Lodge", "Zermatt Lodge Liverpool", "Zermatt Lodge Fazakerley", "Zermatt Lodge Aintree",
           "Zermatt Lodge Airbnb", "Zermatt Lodge Booking.com", "Zermatt Lodge reviews", "Zermatt Lodge book direct",
           "Zermatt Lodge Liverpool reviews", "Zermatt Lodge Liverpool price", "Zermatt Lodge Liverpool contact",
           "Zermatt Lodge Liverpool availability", "Zermatt Lodge games room", "Zermatt Lodge L9",
           "Zermatt Lodge holiday home", "Zermatt Lodge Liverpool house", "Zermatt Lodge north Liverpool",
           "Zermatt Lodge Merseyside", "Zermatt Lodge Liverpool phone number", "Zermatt Lodge Liverpool check in"]:
    add(kw, "brand-navigational", "navigational", "all", "Fazakerley", 1, "/")

# ---------------------------------------------------------------------------
# Conversational AI prompts
# ---------------------------------------------------------------------------
AI_NEEDS = [
    ("a house in Liverpool for {n} people near {l} with parking", "all"),
    ("somewhere to stay near {l} for {n} people with free parking", "all"),
    ("a 4 bedroom house to rent near {l} for {n} adults", "all"),
    ("a self catering house near {l} that sleeps {n}", "all"),
    ("accommodation near {l} for a group of {n} with a garden", "groups of friends"),
]
AI_LEADS = ["I need", "can you find me", "recommend", "looking for", "what's the best"]
AI_LANDMARKS = ["Aintree hospital", "Aintree University Hospital", "Aintree racecourse", "Anfield",
                "Everton's new stadium", "the Walton Centre", "Fazakerley station", "the M57",
                "Knowsley Industrial Park", "the Port of Liverpool", "Alder Hey", "Hill Dickinson Stadium"]
for lead in AI_LEADS:
    for need, aud in AI_NEEDS:
        for lm in AI_LANDMARKS:
            for n in ("6", "7"):
                if lead == "what's the best" and not need.startswith(("a ", "accommodation")):
                    continue
                if n == "6" and lead not in ("I need", "looking for"):
                    continue
                if "a house in Liverpool" in need and lm in ("the M57",):
                    continue
                kw = f"{lead} {need.format(n=n, l=lm)}"
                if lead == "what's the best":
                    kw = kw.replace("what's the best a ", "what's the best ")
                p = 1 if lm in ("Aintree hospital", "Aintree University Hospital", "Aintree racecourse",
                                "Fazakerley", "north Liverpool", "Anfield", "the Walton Centre",
                                "Everton's new stadium", "Hill Dickinson Stadium") else 2
                cl_aud = aud
                if "hospital" in lm.lower() or "Walton Centre" in lm or "Alder Hey" in lm:
                    cl_aud = "hospital visitors"
                elif lm in ("Anfield", "Everton's new stadium", "Hill Dickinson Stadium"):
                    cl_aud = "football fans"
                elif "racecourse" in lm:
                    cl_aud = "race goers"
                elif lm in ("Knowsley Industrial Park", "the Port of Liverpool"):
                    cl_aud = "contractors/work crews"
                add(kw, "conversational-ai", "conversational-ai", cl_aud, lm, p)

AI_FREEFORM = [
    "I need a house in Liverpool for 7 people near Aintree hospital with parking",
    "my dad is in Aintree hospital where can our family stay nearby for a week",
    "my mum is in the Walton Centre where can we stay close by",
    "we need somewhere to stay near Aintree hospital for a few weeks with parking",
    "family accommodation near Aintree hospital for a week with a kitchen",
    "where can a family stay near Aintree University Hospital that isn't a hotel",
    "best place to stay for the Grand National for a group of 7",
    "find a house near Aintree racecourse for the Grand National 2027",
    "accommodation within walking distance of Aintree racecourse for 7 people",
    "we are 7 friends going to the Grand National where should we stay",
    "is there a house with a pool table to rent in Liverpool",
    "recommend a Liverpool Airbnb with a games room for a group",
    "house in Liverpool with a games room and garden for a family weekend",
    "where should a group of 7 stay in Liverpool for a football weekend",
    "best accommodation for a Liverpool match with free parking",
    "we're coming to watch Everton at the new stadium where should we stay",
    "where to stay for an Anfield concert with a group of friends",
    "I need contractor accommodation in north Liverpool for 5 workers with van parking",
    "contractor house near Kirkby for a crew of 6 for 3 weeks",
    "accommodation for a work crew near the Port of Liverpool",
    "accommodation for engineers working at Knowsley Industrial Park",
    "corporate housing in Liverpool for a month for a relocating family",
    "furnished house in Liverpool for 2 months while our house is renovated",
    "insurance alternative accommodation Liverpool 4 bedrooms",
    "temporary 4 bedroom house Liverpool after a flood",
    "where can 7 people stay in Liverpool for one price",
    "cheapest way for 7 people to stay in Liverpool",
    "4 bedroom holiday home in Liverpool with parking for 2 cars",
    "quiet family home to rent in Liverpool for a week with a garden",
    "Liverpool holiday home with 2 bathrooms and an en-suite",
    "Liverpool house that sleeps 7 with separate beds",
    "where to stay in Liverpool with kids and a car",
    "accommodation near the M57 and M58 for a group",
    "house near Fazakerley station for a weekend in Liverpool",
    "accommodation for parents visiting a student in Liverpool",
    "place to stay for graduation at the University of Liverpool for a big family",
    "accommodation near Edge Hill University for graduation",
    "where to stay for the Tour de France in Liverpool 2027",
    "where to stay for the Liverpool Half Marathon 2027",
    "is Zermatt Lodge in Liverpool good",
    "tell me about Zermatt Lodge Fazakerley",
    "what is the best holiday home in north Liverpool",
    "best Airbnb near Aintree racecourse",
    "best Airbnb near Aintree hospital",
    "best Airbnb for groups in Liverpool",
    "best Airbnb in Liverpool for families with free parking",
    "best Airbnb in Liverpool for contractors",
    "best house to rent in Liverpool for 7 people",
    "top rated holiday homes in Liverpool for large families",
    "suggest a place to stay in Liverpool for 3 couples",
    "suggest accommodation in Liverpool for 2 families travelling together",
    "where can 3 families stay together in Liverpool",
    "accommodation in Liverpool for a hen weekend with a games room",
    "Liverpool accommodation for a 50th birthday weekend for family",
    "Liverpool accommodation for a family reunion of 7",
    "somewhere in Liverpool with a garden where kids can play",
    "Liverpool holiday home close to the motorway",
    "quiet place to stay in Liverpool away from the city centre",
    "accommodation in Liverpool not in the city centre with parking",
    "I'm a locum doctor at Aintree where can I stay",
    "nurse needs short term accommodation near Aintree hospital",
    "agency nurse accommodation Liverpool short term",
    "travelling nurse accommodation Liverpool",
    "accommodation for a film crew in Liverpool",
    "accommodation for a sports team in Liverpool",
    "accommodation for a band on tour in Liverpool",
    "accommodation for a football team travelling to Liverpool",
    "accommodation for a darts team in Liverpool",
    "where to stay in Liverpool for a golf trip to Royal Birkdale",
    "golf trip accommodation Southport and Liverpool for 6",
]
for kw in AI_FREEFORM:
    p = 1
    if any(x in kw for x in ("hen weekend", "film crew", "band", "darts", "golf", "50th")):
        p = 2
    aud = "all"
    if "hospital" in kw.lower() or "walton centre" in kw.lower() or "nurse" in kw or "locum" in kw:
        aud = "hospital visitors"
    elif "contractor" in kw or "crew" in kw or "engineers" in kw:
        aud = "contractors/work crews"
    elif "Grand National" in kw or "racecourse" in kw:
        aud = "race goers"
    add(kw, "conversational-ai", "conversational-ai", aud, "Liverpool", p)

# ---------------------------------------------------------------------------
# Verified seeds - add any not already generated
# ---------------------------------------------------------------------------
for v in VERIFIED:
    key = norm(v)
    if key in rows:
        rows[key]["source"] = "search-verified"
        continue
    vl = v.lower()
    if "hospital" in vl or "walton centre" in vl or "alder hey" in vl or "ronald" in vl:
        cl, aud = "hospital-visitors", "hospital visitors"
    elif "contractor" in vl or "key worker" in vl or "professionals" in vl:
        cl, aud = "contractor-workforce", "contractors/work crews"
    elif "grand national" in vl or "aintree race" in vl or "becher" in vl or "boxing day" in vl:
        cl, aud = "grand-national-racing", "race goers"
    elif "everton" in vl or "hill dickinson" in vl or "anfield" in vl or "fixtures" in vl or "legends" in vl:
        cl, aud = "football", "football fans"
    elif any(x in vl for x in ("2026", "2027", "beatleweek", "half marathon", "christmas")):
        cl, aud = "concerts-events", "event goers"
    elif "graduation" in vl or "open day" in vl:
        cl, aud = "students-graduation", "students' parents"
    elif "corporate" in vl or "relocation" in vl or "monthly" in vl or "furnished" in vl:
        cl, aud = "long-stay-relocation", "relocators"
    elif "group" in vl or "party" in vl or "persons" in vl or "sleeps" in vl:
        cl, aud = "group-accommodation", "groups of friends"
    elif "family" in vl or "families" in vl:
        cl, aud = "family-stays", "families"
    elif "where to stay" in vl or "best area" in vl or "fazakerley" in vl:
        cl, aud = "questions-guides", "all"
    else:
        cl, aud = "core-house-liverpool", "all"
    intent = "informational" if vl.startswith(("where", "best area", "how", "when", "is ", "history")) else (
        "commercial" if "hotel" in vl else "transactional")
    p = 1 if any(x in vl for x in ("aintree", "contractor", "group", "4 bed", "sleeps")) else 2
    if intent == "informational":
        p = max(p, 2)
    add(v, cl, intent, aud, "Liverpool", p)

# ---------------------------------------------------------------------------
# write
# ---------------------------------------------------------------------------
fields = ["keyword", "cluster", "intent", "audience", "location", "priority", "suggested_page_slug", "source"]
out = sorted(rows.values(), key=lambda r: (r["priority"], r["cluster"], r["keyword"].lower()))
with open(OUT, "w", newline="", encoding="utf-8") as fh:
    w = csv.DictWriter(fh, fieldnames=fields)
    w.writeheader()
    for r in out:
        w.writerow(r)

if __name__ == "__main__":
    from collections import Counter
    print("rows:", len(out))
    print("verified:", sum(1 for r in out if r["source"] == "search-verified"))
    print("priority:", Counter(r["priority"] for r in out))
    for c, n in Counter(r["cluster"] for r in out).most_common():
        print(f"  {c}: {n}")
