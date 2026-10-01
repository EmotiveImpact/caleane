# Site flow revision — 1 October 2026

## Implemented

- Preserved all 21 HTML pages and backed up the starting site in `frontpage-design/backups/site-flow-oct1/`.
- Shared static header and footer, generated from `web/site-map.json`. Every footer includes all 19 secondary pages.
- Restored the original marketing surface `#060908`. The application illustration retains its own `#191b1c` rail.
- Removed the added header/footer divider lines and outlines around the new presentation panels after user feedback.
- Reworked Trust, About, Contact and the preview entry page; aligned feature, story, pricing and guide layouts.
- Homepage 01 uses Nadia and Amelia; 02 uses Lena and Maya; 03 uses Sofia and Daniel.
- New review and handover scenes extend each cast's project. The first packaging review was superseded by v2 to correct the laptop orientation. Source PNGs are retained.
- Local server on port 4332 now sends `Cache-Control: no-store, max-age=0` to prevent stale preview pages.

## Verification

- Static audit: 21 pages, 19 secondary footer destinations, zero missing files/anchors, duplicate IDs, empty destinations or inconsistent footers.
- Browser checks of every secondary page at desktop and 390 CSS pixels: consistent dark background/footer, no horizontal overflow, no broken loaded images or offline account links. Reports: `desktop-pages.json`, `mobile-pages.json`.
- Narrow homepage header: document width 320px at a 320px CSS viewport.
- Mobile menu opens, closes with Escape and presents the shared route set.
- Trust tabs switch between studio and client views and respond to keyboard arrows.
- Platform brief/review/decision tabs, keyboard navigation, sample approval and reset work. The client perspective hides the studio-only note; switching back restores it.
- All four feature examples update and reset.
- Annual pricing displays £290/£590/£990 per year; monthly restores £29/£59/£99 per month. These remain proposed plans.
- Guide search handles zero results and returns all six topics when cleared.
- Contact prepares a local draft using fictional QA input. The download link has a Blob URL and download filename; the browser integration did not report a download event, so the downloaded file was not verified.
- Homepage sample approval/reset and studio/client perspective work. Film overlay opens and closes; its content remains the existing film placeholder.
- JavaScript syntax checks and Python script compilation pass.

## Practical limits

This revision is local and has not been deployed. Public account access, live checkout and outbound contact delivery are not connected. The site visibly labels sample projects and proposed plans.

Browser capture returned blank images for some scrolled/pinned homepage frames, although DOM hit testing, loaded image dimensions and active scene state were correct. Top-of-page Trust, story and feature screenshots were inspectable. The revised homepage crops need a final visual pass in the user's normal browser.

Generated image paths, reference files and full prompts: `frontpage-design/site-flow-image-prompts.json` (built-in `image_gen.imagegen`).
