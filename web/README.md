# Caleane website

The marketing website is plain HTML/CSS/JavaScript with local assets and no build step. The separate product remains in the sibling `app/` directory.

Preview from this directory:

```sh
python3 ../frontpage-design/scripts/serve-web.py
```

Open <http://127.0.0.1:4332/>. All 21 pages are retained. `index.html` is the homepage; `audience-mock.html` remains an alternate concept. Every page has the same header and grouped footer, linking all 19 secondary pages. The original marketing background is `#060908`; the application rail inside the platform illustration keeps its own `#191b1c` colour.

With no verified app origin configured, **Log in** and **Start now** lead to the local preview entry page. Set `window.CALENNE_APP_URL` in `config.js` only when a reachable app origin is ready. The contact page prepares a local draft; sending is not connected. Set `window.CALEANE_CONTACT_EMAIL` to a verified public address to offer the user's email app as a sending route. Plans are proposals, with no purchase or checkout route.

This revision is locally verified and has not been published. Public pages may be indexed by search engines; the internal pages `design-reference.html`, `pricing-research.html` and `audience-mock.html` keep `noindex`. Public accounts, business contact details and operational launch requirements are not configured by this marketing-site work.

The industry images are concept imagery, not a claim that Calenne or its customers completed the pictured work. The UI panel on the front page is an illustrative rendering of locally implemented screens and sample data. The app and its data stay in the sibling `app/` directory.

The homepage scenes use different pairs: Nadia and Amelia (relationship), Lena and Maya (brief), Sofia and Daniel (decision). Their respective story pages continue those projects through review and delivery. Image sources and the exact generation prompts are in `../frontpage-design/site-flow-image-prompts.json`; native PNGs are preserved alongside optimized WEBP delivery files.

## Shared shell and verification

Edit `site-map.json` and run `python3 ../frontpage-design/scripts/sync-site-shell.py` to update every static header/footer. Shell style and behavior live in `site-shell.css` and `site-shell.js`; `page-polish.css` finishes the page layouts without replacing the established homepage scroll choreography.

Run `python3 ../frontpage-design/scripts/audit-site.py` to check destinations, anchors, local assets, duplicate IDs and shared footer coverage. Browser evidence is in `../frontpage-design/qa/site-flow-oct1/`.
