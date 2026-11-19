# AI visibility log - Book Homes (bookhomes.co.uk)

Goal: make ChatGPT, Claude, Perplexity and Google AI Overviews more likely to find, understand and recommend Book Homes and Zermatt Lodge for Liverpool accommodation questions.

## Research findings (19 November 2026)

1. **Google AI Overviews / AI Mode = normal SEO.** Google's own AI search guide (May 2026) says AI features pull from the normal index, so crawlable, indexable pages that rank are what get cited. It says no special AI files, AI-only schema or "chunked" rewrites are needed, and warns that mass "fan-out" pages can count as scaled content abuse. First-hand, non-generic content and an up-to-date Google Business Profile help. Sources: https://distl.com.au/insights/googles-first-official-ai-search-guide-what-it-confirms-and-what-it-debunks/ , https://developers.google.com/search/docs/appearance/ai-features
2. **llms.txt is cheap but low impact.** Adoption grew about 8.8x in a year (around 36,000 sites by May 2026), but Ahrefs log data found 97% of llms.txt files got zero requests, and AI retrieval bots made only about 1% of requests to them. Google says it does not affect rankings. Keep it accurate as a fact sheet for agents and tools; do not expect traffic from it. Source: https://ppc.land/llms-txt-adoption-rises-8-8x-but-97-of-files-get-zero-ai-requests/
3. **Crawler access is the real switch.** OpenAI: OAI-SearchBot decides whether a site can appear in ChatGPT search answers (blocking it removes you); GPTBot is training; ChatGPT-User is user-triggered fetches. Source: https://developers.openai.com/api/docs/bots.md . Anthropic: ClaudeBot (training), Claude-SearchBot (search index), Claude-User (fetches for a user's question); blocking the last two reduces visibility. Source: https://support.claude.com/en/articles/8896518 . Perplexity uses PerplexityBot and Perplexity-User. Bing powers several assistants, so Bingbot matters too.
4. **Answer-first pages win planning questions.** A November 2026 snapshot of AI answers for holiday rentals found property managers were cited more than OTAs on "which company should I book" and planning questions, and 84% of cited property-manager pages were local guides or area pages. OTAs still win filter-style queries ("sleeps 12, hot tub"). Advice: local guides only a local could write, pages that state plainly who a home suits, and checking several engines because results differ a lot. Source (vendor, treat with care): https://craftedstays.co/?p=5130
5. **Entity consistency and third-party mentions.** Assistants match a business across the site, Airbnb, Booking.com and Google. Same name, area, bedroom count, guest count and policies everywhere makes it easier to trust and cite. Genuine mentions on other sites (local press, venue or hospital accommodation lists, Reddit/forum answers) help; manufactured "citation farming" does not.
6. **Reviews markup.** Self-serving AggregateRating/Review markup on your own LodgingBusiness is not eligible for review rich results and can look manipulative. Show third-party ratings as visible text with a source and date, not as schema.

## What was done today (19 November 2026)

- robots.txt: explicitly allows Googlebot, Bingbot, Google-Extended, Applebot, Applebot-Extended, GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User and all others. Blocks /api/, /admin, /host and /checkout/. Points to the sitemap and the llms files. (/admin/ was changed to /admin because the site uses clean URLs without a trailing slash, so /admin/ did not match /admin.)
- llms.txt: added the marketplace (/stays, kosher filter, hosts), Moderate cancellation policy, £129 cleaning fee, email contact, link to llms-full.txt. Airbnb link now uses airbnb.co.uk to match the rest of the site.
- llms-full.txt (new, copied to public/ by build.py): full plain-text fact sheet with property facts, booking options, policies, distances, marketplace and all 65 guides grouped by topic.
- Guides: build.py and design/guide-template.html now render a "Quick answer" box at the top of every guide, from a new optional `quick_answer` front-matter field, falling back to the first paragraph. Added quick_answer to all 65 existing guides. The FAQ block was already visible (details/summary) with FAQPage schema.
- index.html schema: checked. JSON-LD parses. sameAs has Airbnb and Booking.com. No AggregateRating or Review markup on the LodgingBusiness. Google Business Profile URL not added: could not find or verify a "BookHomes.co.uk" Google Maps profile URL by web search.

## Action list

| Due | Action | Owner |
|---|---|---|
| 19 Nov 2026 | Deploy these changes; check https://bookhomes.co.uk/robots.txt, /llms.txt and /llms-full.txt return 200 as plain text | Coordinator |
| 20 Nov 2026 | Submit sitemap in Google Search Console and Bing Webmaster Tools (Bing feeds ChatGPT and Copilot); request indexing of the homepage, /stays and /guides | Eli |
| 21 Nov 2026 | Find the Google Business Profile share link ("BookHomes.co.uk", shown as 5.0 from 1 review) and add it to sameAs in index.html. Note: seo/ai-and-google-ranking-plan.md warns that holiday homes are not eligible for a GBP, so check the profile is for the business, not the house | Eli |
| 21 Nov 2026 | Make Airbnb and Booking.com listing text match the site: "Zermatt Lodge", Fazakerley north Liverpool, 4 bedrooms, 2 bathrooms, sleeps 7, about 15 minutes to Liverpool Central by train, free parking for 2, strictly no parties, link to bookhomes.co.uk where allowed | Eli |
| 24 Nov 2026 | Replace the remaining airbnb.com links in index.html with airbnb.co.uk so one Airbnb URL is used everywhere | Dev |
| 26 Nov 2026 | Baseline test: ask ChatGPT (search on), Claude, Perplexity and Google AI Mode 10 fixed questions (e.g. "house to rent near Aintree Hospital", "Grand National group accommodation", "contractor house Liverpool with parking", "kosher holiday home Liverpool") and log who is cited here | Eli or agent |
| 28 Nov 2026 | Check server logs / Vercel analytics for OAI-SearchBot, Claude-SearchBot, PerplexityBot and Bingbot visits | Dev |
| 1 Dec 2026 | Third-party mentions: ask Aintree hospital family support, local venues, Grand National and football fan forums, and Liverpool accommodation lists to list the house where genuine; answer real Reddit questions honestly | Eli |
| 1 Dec 2026 | Regenerate llms-full.txt guide list when new guides are published (it is a static file; the newest guides are not in it yet) | Coordinator |
| 15 Dec 2026 | Ask recent guests for Google reviews and more Airbnb reviews, so third-party ratings grow | Eli |
| 7 Jan 2027 | Re-run the 10-question test and compare with the 26 Nov baseline | Eli or agent |
