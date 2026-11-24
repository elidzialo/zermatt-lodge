# Zermatt Lodge - honest plan to rank on Google and in AI assistants

> **Location rule (Eli, 22 Nov 2026):** describe Zermatt Lodge only as "a 4-bedroom house in Liverpool" (or "our house in Liverpool"). Never say or imply it is in or near Fazakerley, Aintree or north Liverpool, never use L9/L10, nearby streets or shops, walking or drive times or distances from the house, or a phone number. "Liverpool city centre is about 15 minutes by train or car" is fine. Area guides about Fazakerley or Aintree are fine as neutral visitor guides.

Checked 18 November 2026. Sources at the end of each section. Plain truth first: a single holiday house on a new domain will not outrank Airbnb/Booking.com for "Liverpool accommodation". It **can** win specific searches ("4 bed house near Aintree Hospital", "Grand National house to rent sleeps 7", "contractor accommodation Fazakerley") and get named by AI assistants - if the facts are consistent everywhere and the pages are genuinely useful.

## Priority checklist

### P1 - Week 1 (foundations)

- [ ] **Go live on the real domain with HTTPS**, one canonical version (www or not), 301 the other. Remove every old booking-engine link; all "Book" buttons go to `/#book`.
- [ ] **Paste the on-page pack** (`seo/onpage-pack.md`): title, meta, H1, SEO:INTRO, SEO:NEARBY, SEO:FAQ, alt text, OG tags. Put `seo/schema.json` in a `<script type="application/ld+json">` in `<head>`. Make sure FAQ answers in the schema match the visible text exactly - Google says structured data must agree with visible text.
- [ ] **Upload `robots.txt`, `llms.txt`, `sitemap.xml`** to the root.
- [ ] **Google Search Console**: verify domain, submit sitemap, inspect the homepage URL.
- [ ] **Bing Webmaster Tools**: verify (can import from Search Console), submit sitemap, turn on **IndexNow** so new pages are picked up fast. Why: ChatGPT search draws heavily on Bing's index (OpenAI: "Bing is an important one"); sites missing from Bing tend to be missing from ChatGPT search.
- [ ] **Don't block AI crawlers.** OAI-SearchBot controls ChatGPT search visibility (GPTBot is training only, ChatGPT-User is user-initiated). Anthropic: ClaudeBot (training), Claude-SearchBot (search indexing), Claude-User (user requests). Our robots.txt allows all of them.
- [ ] **Decide the NAP (name, address, phone) and use it identically everywhere**: Name "Zermatt Lodge by ZALO Stays", locality "Liverpool", same email, same domain. No street address, no suburb and no phone number in public (owner choice) - so use "Liverpool" consistently.

Sources: https://developers.google.com/search/docs/appearance/ai-features ; https://www.seroundtable.com/bing-powers-chatgpt-search-38345.html ; https://developers.openai.com/api/docs/bots ; https://support.claude.com/en/articles/8896518

### P2 - Weeks 1-4 (presence in Google's travel and map surfaces)

- [ ] **Google Business Profile - do NOT create one for the house.** Google's eligibility rules list "Rental or for-sale properties such as vacation homes" as **not eligible**, and require in-person contact with customers during stated hours. A profile for the house risks suspension and can taint the brand. (A staffed ZALO office that customers visit could qualify on its own merits - not the house.)
  Source: https://support.google.com/business/answer/13763036
- [ ] **Google Vacation Rentals (the "Vacation rentals" tab in Google Travel/Maps) is the correct route.** Google handles holiday homes separately from hotels: a vacation rental must be private to the guest, take short-term overnight bookings, and be managed and cleaned between stays (Zermatt Lodge fits). Listing is done through a **Google connectivity partner** (Google lists ~64-67, e.g. Hostaway, Hostfully, Lodgify, Beds24, Uplisting, OwnerRez, Rentals United, eviivo, Freetobook, Zeevou). Because the owner is moving bookings to an on-site Stripe engine, either (a) use a partner channel manager that syncs availability and also connects to Google, or (b) apply via Google's vacation rentals interest form. Free booking links can then send guests to the direct site. Requires 8+ photos, exact lat/long (Google keeps it private) and live rates/availability.
  Sources: https://support.google.com/hotelprices/answer/9970971?hl=en ; https://support.google.com/hotelprices/answer/11946834?hl=en ; https://developers.google.com/search/docs/appearance/structured-data/vacation-rental
- [ ] **Bing Places**: worth checking, but **[UNVERIFIED]** whether Bing accepts single holiday rentals - its listing rules were not confirmed in this research. If accepted, list with the identical NAP; Bing Places can import from a Google profile. Do not create a fake "office" address. Source: https://www.brightlocal.com/learn/bing-places-for-business-bing-local-listings-explained/
- [ ] **Keep OTA listings (Airbnb/Booking.com/Vrbo) live with identical name, description facts and photos**, and link to the direct site where each platform allows (e.g. in a host profile - most OTAs forbid contact details in listings, so check each one's rules). AI assistants often learn about small properties from these.

### P3 - Months 1-3 (citations, reviews, links)

- [ ] **VisitLiverpool partnership** (official destination site): self-catering is eligible; partners get a profile page with links for availability, plus PR and networking. Core fees from £250 + VAT a year depending on category - confirm category with partnership@liverpoolcityregiondp.com. Source: https://liverpoolcityregiondp.com/wp-content/uploads/VL-Partnership-Accommodation-26.27_Low-res.pdf ; https://www.visitliverpool.com/accommodation
- [ ] **UK holiday-let and contractor directories** (pick a handful with real traffic, not hundreds): e.g. selfcatering.co.uk, simplyowners.net, construction.co.uk "contractor accommodation" category, rentastay.co.uk, comfyworkers.com. Same NAP on every one. Avoid paid link farms. Sources: https://www.selfcatering.co.uk/england/merseyside/liverpool/ ; https://simplyowners.net/holiday-cottages-liverpool ; https://www.construction.co.uk/d_c/1813/contractor-accommodation ; https://rentastay.co.uk/contractors-accommodation ; https://www.comfyworkers.com/en/accommodation/london?current=15
- [ ] **Hospital-related accommodation pages**: ask the hospital charities, patient-support groups, Walton Centre/Aintree patient information teams and local NHS staff networks whether they keep a "local accommodation" list. Expect many to decline (NHS sites rarely endorse private businesses); a few accepted links are very valuable. **[UNVERIFIED which lists exist - research case by case]**
- [ ] **Local links**: Liverpool community groups, local sports clubs you sponsor, ZALO's own sites (zalo/zelr pages) linking with natural anchors, local news if there's a genuine story (e.g. NHS-family discount).
- [ ] **Reviews - real guests only.** Ask every guest after checkout (Airbnb/Booking reviews plus a direct-site review form or Google review of a future eligible listing). UK law (DMCC Act, in force 6 April 2025) bans fake reviews, hiding that a review was incentivised, and suppressing or cherry-picking reviews; fines up to 10% of global turnover. So: no family/friend reviews, no "5 stars for a discount", show negatives too. Only add `aggregateRating` to schema once there are real reviews on your own site. Source: https://cms.law/en/gbr/legal-updates/no-more-faux-five-stars-the-dmcc-act-bans-fake-reviews

### P4 - Ongoing (content, speed, freshness, trust)

- [ ] **Publish guides slowly and only when useful** (8 core guides over ~2 months - see `sitemap-plan.md`). Each must contain real first-hand detail (photos you took, the walk to Fazakerley station, where to park for Aintree on race day, hospital parking costs, your own tips).
- [ ] **Internal linking**: homepage to each guide with the anchors in `onpage-pack.md`; each guide back to the homepage and `/#book`; a `/guides/` hub. Google lists internal-link discoverability as a best practice for AI features.
- [ ] **Page speed**: static HTML, compress images to WebP/AVIF (~150-250 KB each), set width/height on all images, lazy-load the gallery below the fold, preload only the hero image, self-host or trim Google Fonts, load Stripe JS only on/near `#book`. Aim for "Good" Core Web Vitals in Search Console. Reference: https://developers.google.com/search/docs/appearance/core-web-vitals
- [ ] **Freshness**: update the events section each season (Grand National Festival 8-10 April 2027; Aintree Becher Chase 5 Dec 2026; Boxing Day racing 26 Dec 2026 - https://www.thejockeyclub.co.uk/aintree/). Change `lastmod` only when content really changes.
- [ ] **E-E-A-T / "Who, How, Why"**: an "About your host" block with Eli's real name, photo, ZALO Stays background and contact details; say how pages were written (if AI-assisted, edited and fact-checked by the owner). Google asks "Is it self-evident to your visitors who authored your content?" and whether automation use is disclosed. Source: https://developers.google.com/search/docs/fundamentals/creating-helpful-content
- [ ] **Measure**: Search Console queries monthly; ask ChatGPT/Claude/Perplexity/Gemini "4 bed house to rent" each month and note whether Zermatt Lodge appears and whether facts are right; fix the source of any wrong fact.

## Scaled content abuse - what is safe vs risky

Google's policy (current spam policies page): "Scaled content abuse is when many pages are generated for the primary purpose of manipulating search rankings" - usually lots of unoriginal content with little value, **however it is made**. Examples Google gives: using generative AI to generate many pages without adding value; scraping or auto-rewording (synonym swapping, translating); stitching content from other pages; multiple sites hiding the scale; pages that make little sense but contain keywords. Related **doorway abuse**: "multiple domain names or pages targeted at specific regions or cities that funnel users to one page" and "substantially similar pages". Google's spam policies also cover attempts to manipulate generative AI responses in Search.
Sources: https://developers.google.com/search/docs/essentials/spam-policies ; https://developers.google.com/search/docs/fundamentals/creating-helpful-content

| Safe | Risky |
|---|---|
| ~10 guides, each answering a real guest question with specifics | Hundreds of pages from the 5,000-keyword list, one per keyword |
| Original photos, owner tips, verified distances with sources | "Holiday let near [every Liverpool suburb]" pages with the town name swapped |
| Each page has a clear purpose a visitor would bookmark | Pages that exist only to funnel to `/#book` |
| AI used as a drafting aid, then fact-checked and edited by the owner; byline shown | Bulk AI text published unedited; invented facts, reviews or prices |
| Keyword list used to choose topics and wording inside a few strong pages | Keyword-stuffed FAQs repeating the same answer |
| Publishing steadily (1-2 a week) | Publishing 100s of pages in one go |

Rule of thumb from Google's own self-check: "Are you producing lots of content on many different topics in hopes that some of it might perform well in search results?" If yes, don't publish it. If a thin page already exists, improve it, merge it, or `noindex` it.

## Notes on AI search specifically

- Google: "There are no additional requirements to appear in AI Overviews or AI Mode", and no special schema is needed - normal SEO, crawlable text, internal links, good page experience, and up-to-date Business Profile/Merchant data. Source: https://developers.google.com/search/docs/appearance/ai-features
- FAQ rich results no longer show in Google Search (removed 2026), so FAQs are for people and AI answers, not for stars in results. Source: https://developers.google.com/search/docs/appearance/structured-data/faqpage
- `llms.txt` is a proposed convention (https://llmstxt.org/); it's cheap to add but no major engine has been confirmed in this research to rely on it - treat as a bonus, not a strategy.
- Consistency is the main lever: the same facts (sleeps 7, 4 bedrooms, 2 bathrooms, Liverpool, free parking for 2) on the site, OTAs, directories and VisitLiverpool make AI assistants confident enough to recommend the house.
