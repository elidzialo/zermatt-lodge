# Zermatt Lodge - homepage on-page SEO pack (ready to paste)

> **Location rule (Eli, 22 Nov 2026):** describe Zermatt Lodge only as "a 4-bedroom house in Liverpool" (or "our house in Liverpool"). Never say or imply it is in or near Fazakerley, Aintree or north Liverpool, never use L9/L10, nearby streets or shops, walking or drive times or distances from the house, or a phone number. "Liverpool city centre is about 15 minutes by train or car" is fine. Area guides about Fazakerley or Aintree are fine as neutral visitor guides.

Rules used: only owner-confirmed property facts; no prices, ratings or review text; no street address; no distances or travel times from the house except "Liverpool city centre is about 15 minutes by train or car". Booking is on-site at `/#book` (secure card payment by Stripe). Replace `https://www.example-domain.co.uk` with the real domain everywhere.

---

## 1. Title and meta

```html
<title>Zermatt Lodge | 4-Bed House to Rent in Liverpool, Sleeps 7</title>
<meta name="description" content="Entire 4-bed, 2-bath house in Liverpool. Sleeps 7, games room, garden, free parking for 2 cars, about 15 minutes from the city centre. Book direct.">
<link rel="canonical" href="https://www.example-domain.co.uk/">
<meta name="robots" content="index, follow, max-image-preview:large">
```
(Title 58 chars, description 149 chars.)

## 2. H1 and alternatives

- **H1:** Zermatt Lodge - a 4-bedroom house in Liverpool that sleeps 7
- Alt 1: Your whole house
- Alt 2: Space for families, contractors and NHS visitors in Liverpool
- Alt 3: 4 bedrooms, 2 bathrooms, a games room and a private garden - book direct

## 3. SEO:INTRO

```html
<!-- SEO:INTRO -->
<p>Zermatt Lodge is an entire 4-bedroom house in Liverpool, with room for up to 7 guests. There is a king master bedroom with en-suite, a second king, a queen room and a single, plus two bathrooms in total. Downstairs you get a big kitchen, a separate dining room and a games room with a pool table and board games, and the 55" Smart TV has Netflix. Out back there is a large private garden, and there is free parking for 2 cars.</p>
<p>Liverpool city centre is about 15 minutes by train or car. It suits families, groups, contractors and anyone visiting the hospitals. Check-in is from 3pm and check-out is by 11am. You book direct here, so you deal with the host, ZALO Stays, from start to finish.</p>
<!-- /SEO:INTRO -->
```

## 4. SEO:NEARBY

```html
<!-- SEO:NEARBY -->
<section id="nearby" aria-labelledby="nearby-h">
  <h2 id="nearby-h">Getting around</h2>
  <ul>
    <li><strong>Liverpool city centre and Lime Street</strong> - about 15 minutes by train or car</li>
    <li><strong>Anfield and Hill Dickinson Stadium</strong> - train to Sandhills, then the Soccerbus or a walk</li>
    <li><strong>Aintree Racecourse</strong> - Aintree station (Ormskirk branch) is the closest station to the course</li>
    <li><strong>Free parking for 2 cars</strong> - for days out and hospital visits</li>
  </ul>
</section>
<!-- /SEO:NEARBY -->
```
Do not add distances or drive times from the house.

## 5. SEO:FAQ (22 Q&As - answer first, 40-60 words)

Note: Google stopped showing FAQ rich results in 2026 (https://developers.google.com/search/docs/appearance/structured-data/faqpage). Keep the FAQ because plain, direct answers are what AI assistants and featured snippets quote. `schema.json` FAQPage matches these word for word - edit both together.

```html
<!-- SEO:FAQ -->
<section id="faq" aria-labelledby="faq-h">
<h2 id="faq-h">Frequently asked questions</h2>
```

1. **How many people does Zermatt Lodge sleep?**
   Zermatt Lodge sleeps up to 7 guests. It is an entire 4-bedroom house with 4 beds: a king in the master bedroom (with en-suite), a second king, a queen and a single.

2. **How many bedrooms and bathrooms are there?**
   There are 4 bedrooms and 2 bathrooms. The king master bedroom has its own en-suite, and there is a second bathroom for the other three bedrooms.

3. **Is it the entire house or a shared space?**
   You get the entire house to yourselves - all four bedrooms, both bathrooms, the kitchen, dining room, games room and the large private back garden. Nothing is shared with other guests.

4. **Where is Zermatt Lodge?**
   Zermatt Lodge is a 4-bedroom house in Liverpool, Merseyside, about 15 minutes from the city centre by train or car. The full address is sent to confirmed guests.

5. **Is it close to Aintree University Hospital?**
   Many guests stay while visiting a Liverpool hospital, including Aintree University Hospital. It is a good base for patients' families, visitors and NHS staff who want a whole house with free parking.

6. **How far is it from The Walton Centre?**
   The Walton Centre shares the Aintree University Hospital site on Lower Lane. Free parking at the house means you can drive there, or use Merseyrail.

7. **Is there parking?**
   Yes, there is free parking for 2 cars at the house. That is useful for hospital visits, as parking on the Aintree hospital site is chargeable.

8. **How do I get to Liverpool city centre?**
   Liverpool city centre is about 15 minutes by train or car. You can tap in and out with a contactless card or phone.

9. **Is it good for the Grand National?**
   Yes. It sleeps 7 with free parking, and Aintree station runs extra trains on race days. The 2027 Grand National Festival runs 8-10 April 2027, so book early as it is the busiest week of the year.

10. **Is it close to Anfield and Everton's stadium?**
    It isn't walking distance to either ground. Take the train to Sandhills: Everton fans walk from there, and the matchday Soccerbus runs to Anfield.

11. **What time are check-in and check-out?**
    Check-in is from 3pm and check-out is by 11am.

12. **Is the house suitable for contractors and work crews?**
    Yes. It sleeps 7 across 4 bedrooms, has free parking for 2 cars, a big kitchen and a dining room, and the motorway network makes it easy to get around Merseyside and the North West.

13. **Is it good for families and groups?**
    Yes. There is a games room with a pool table, board games, a 55" Smart TV with Netflix, a big kitchen, a separate dining room and a large private back garden.

14. **What entertainment is there?**
    The games room has a pool table, there are board games for all ages, and the living area has a 55" Smart TV with Netflix.

15. **Can we have a party or event?**
    No. Parties and events are not allowed at Zermatt Lodge.

16. **Is smoking allowed?**
    No. Smoking is not allowed anywhere in the house.

17. **Are pets allowed?**
    No, pets are not allowed.

18. **What do I need to provide before my stay?**
    All guests booking need to provide ID, sign a rental agreement, and either pay a damage deposit or take the damage waiver. We will ask for these after you book.

19. **How do I book?**
    You can book directly on this website - choose your dates in the booking section and pay securely by card. Booking direct means you deal with the host, ZALO Stays, from start to finish.

20. **Who runs Zermatt Lodge?**
    Zermatt Lodge is run by ZALO Stays. Email cs@zugati.co.uk.

21. **Are there shops nearby?**
    Yes. There are supermarkets a short drive away, and delivery apps cover the area.

22. **How far is Liverpool John Lennon Airport?**
    Most guests drive or take a taxi; by public transport you can go via the city centre.

23. **Are there parks nearby?**
    Yes. Walton Hall Park has 130 acres and two lakes, and Croxteth Hall and Country Park, about 2.5 miles away, has a working farm, a walled garden and a free Saturday parkrun.

```html
</section>
<!-- /SEO:FAQ -->
```
(Markup tip: use `<details><summary>Question</summary><p>Answer</p></details>` so answers are in the HTML, not loaded by JavaScript.)

## 6. Internal-link anchor text plan (/guides/)

Rules: one link per guide per page; descriptive anchors, varied; every guide links back to the homepage with "Zermatt Lodge, 4-bed house in Liverpool" and to `/#book`; guides link to each other where relevant.

| Target page | Homepage anchor (in SEO:NEARBY / FAQ) | Alternate anchors for other pages |
|---|---|---|
| /guides/aintree-hospital-accommodation/ | accommodation near Aintree University Hospital | staying near Aintree Hospital; a house for hospital visitors |
| /guides/walton-centre-accommodation/ | staying near The Walton Centre | Walton Centre visitor accommodation |
| /guides/grand-national-accommodation/ | Grand National accommodation in Aintree | where to stay for the Grand National |
| /guides/contractor-accommodation-liverpool/ | contractor accommodation in Liverpool | house for work crews near the M57 |
| /guides/getting-around-liverpool/ | getting into Liverpool by Merseyrail | Fazakerley to Liverpool Central by train |
| /guides/anfield-and-everton-match-days/ | match day stays for Anfield and Everton | staying near Hill Dickinson Stadium |
| /guides/family-days-out-north-liverpool/ | family days out near Fazakerley | Croxteth Hall and Walton Hall Park |
| /guides/group-stays-liverpool/ | large group house in Liverpool | 4-bed house for groups of 7 |
| /guides/liverpool-airport-transfers/ | getting here from Liverpool John Lennon Airport | airport to Fazakerley |
| /guides/southport-and-coast/ | day trips to Southport | Southport from north Liverpool |
| /#book | Check dates and book direct | See availability |

Only publish a guide when it has genuinely useful, specific content (see `ai-and-google-ranking-plan.md`, scaled-content section).

## 7. Gallery image alt text (27 photos)

Match these to the real photos - change wording if a photo shows something different. File names: lowercase-hyphenated, e.g. `zermatt-lodge-games-room-pool-table.webp`.

1. Front of Zermatt Lodge, a 4-bedroom house in Liverpool, Liverpool
2. Living room with 55-inch Smart TV at Zermatt Lodge, Liverpool
3. Living room seating area at Zermatt Lodge holiday house
4. Games room with pool table at Zermatt Lodge, Liverpool
5. Pool table and board games in the games room at Zermatt Lodge
6. Big fitted kitchen at Zermatt Lodge, Liverpool
7. Kitchen worktops and appliances at Zermatt Lodge
8. Dining room with table for group meals at Zermatt Lodge
9. Dining table set for seven guests at Zermatt Lodge
10. King master bedroom at Zermatt Lodge, Liverpool
11. Master bedroom king bed and storage at Zermatt Lodge
12. En-suite bathroom off the master bedroom at Zermatt Lodge
13. Second bedroom with king bed at Zermatt Lodge
14. Second king bedroom from the doorway at Zermatt Lodge
15. Third bedroom with queen bed at Zermatt Lodge
16. Queen bedroom detail at Zermatt Lodge, Liverpool
17. Fourth bedroom with single bed at Zermatt Lodge
18. Main bathroom at Zermatt Lodge, Liverpool
19. Main bathroom shower and basin at Zermatt Lodge
20. Hallway and stairs at Zermatt Lodge
21. Large private back garden at Zermatt Lodge, Liverpool
22. Back garden seating area at Zermatt Lodge
23. Rear of the house and garden at Zermatt Lodge
24. Free off-street parking for two cars at Zermatt Lodge
25. Board games ready for guests at Zermatt Lodge
26. Smart TV with Netflix in the living room at Zermatt Lodge
27. Welcome view into the open-plan ground floor at Zermatt Lodge

## 8. Open Graph and Twitter tags

```html
<meta property="og:type" content="website">
<meta property="og:site_name" content="Zermatt Lodge by ZALO Stays">
<meta property="og:locale" content="en_GB">
<meta property="og:title" content="Zermatt Lodge - 4-bed house in Liverpool, sleeps 7">
<meta property="og:description" content="Entire 4-bed, 2-bath house in Liverpool. Games room, private garden, free parking for 2 cars. Book direct.">
<meta property="og:url" content="https://www.example-domain.co.uk/">
<meta property="og:image" content="https://www.example-domain.co.uk/images/og-zermatt-lodge.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Games room with pool table at Zermatt Lodge, Liverpool">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Zermatt Lodge - 4-bed house in Liverpool, sleeps 7">
<meta name="twitter:description" content="Entire 4-bed house in Liverpool. Games room, garden, free parking for 2. Book direct.">
<meta name="twitter:image" content="https://www.example-domain.co.uk/images/og-zermatt-lodge.jpg">
<meta name="twitter:image:alt" content="Games room with pool table at Zermatt Lodge, Liverpool">
```

Also add in `<head>`: `<link rel="alternate" type="text/markdown" href="/llms.txt">` is not a standard - skip it; just serve `/llms.txt` at the root.

## 9. Things to fix on the current index.html

- Replace the old external booking-engine link with `/#book` (booking is now on-site).
- A wifi icon (`#i-wifi`) is used - only keep it if the owner confirms wifi (not in the confirmed facts list, so it is not in schema or copy).
