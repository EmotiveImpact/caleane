# Radix website migration — 1 October 2026

Local website only. Product app source and its dependencies were not changed.

## Verified

- Production React/Radix bundle builds from the website's locked dependencies.
- All 22 routes mount Radix, retain #060908, have a single shared header and no horizontal overflow at the reported 1600px desktop width; routes.json records this. No console warnings/errors in this route pass.
- Reference tabs support clicks and End. Disclosures expand. The Radix reveal slider supports Home/End and updates the text and film-action opacity.
- Homepage sample: a feedback draft survives Brief -> Review; submitting feedback, approving the version and entering Decision works.
- Studio/client perspective correctly changes the label and hides private sample notes. Trust switches to Maya's view.
- App screenshot dialog shows the selected Versions screen, traps keyboard focus, locks page scrolling, closes with Escape and restores focus.
- Film dialog opens the existing production placeholder, closes with Escape, restores focus and preserves the 3s shimmer.
- Annual pricing selection updates all values and periods; its selected ivory appearance is preserved. FAQ disclosure opens.
- Static destination/anchor/resource/shared-footer audit: 22 pages, 20 footer destinations, zero errors.
- Simulated DOM component test verifies the mobile menu opens, focuses the first link, closes with Escape and navigation, restores focus and returns to desktop navigation on resize.

## Verification limits

The browser viewport override requested 390x844 but continued reporting 1600x900. Actual mobile browser layout is unverified. The simulated DOM test proves menu behaviour only. Viewport/cropped screenshot captures showed stale positions. reference-full.png is the complete rendered reference; the other captures are not visual acceptance evidence. No deployment or provider/account connection was performed.
