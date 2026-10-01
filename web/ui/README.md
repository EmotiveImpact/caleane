# Website interaction layer

The website uses React 19 and Radix UI for its interactive primitives. Its content,
photography, page structure and cinematic scroll sequences remain authored in the
static HTML/CSS files. The product app in `../../app` has its own dependency tree.

## Controls

| Website control | Radix primitive |
| --- | --- |
| Sample workflow, studio/client perspective, trust view, app tour, reference tabs | Tabs |
| Film and enlarged app screenshot | Dialog |
| Mobile navigation | Popover |
| Pricing frequency | Toggle Group (single choice, radio semantics) |
| Story details, pricing FAQs, reference disclosure | Collapsible |
| Manual scroll-reveal reference | Slider |

Ordinary links, buttons, text inputs, textareas and video playback retain native
HTML semantics. No extra tooltip or dropdown is added where the design has none.

## Build

From `web`, run `npm ci` then `npm run build`. The locked versions of React,
Dialog, Tabs, Popover and Toggle Group match the product app at this migration.
The generated `assets/website-ui.js` and its license file ship with the static
site. There is no runtime CDN dependency or requirement for a Node server.

`scripts/build-ui.mjs` records the bundled dependencies in `build-manifest.json`.
`../frontpage-design/scripts/sync-site-shell.py` includes the generated bundle
first among deferred scripts on every page, and the website interaction CSS last.

## Content and state ownership

`markup.jsx` snapshots the locally authored markup once and mounts small React
islands. Stable authored IDs, panel content, CSS classes and image paths survive.
The static page is still available before enhancement. The islands keep tab
panels mounted, so sample feedback and form drafts survive panel changes.

Radix owns selection, ARIA, keyboard navigation, focus scopes, Escape and overlay
dismissal. Sample scripts own the illustrative approval/feedback data and text;
they listen to `caleane:tabchange`, `caleane:togglechange` and
`caleane:rangechange`. For a business action that selects a tab, call
`window.CaleaneUI.selectTab(button, focus)` rather than writing ARIA attributes.
Do not attach duplicate tab, menu or native dialog handlers in page scripts.

`site.js` still owns the hero crossfade, hero-to-intro handoff, word reveal,
three-scene pin, profession reel and film-button timing. The existing reduced
motion rules and 3-second shimmer are preserved.

All control appearance comes from the shared website tokens and existing page
styles. This is shared Radix behaviour; it does not mean that the marketing site
imports the main app's React workspace components.
