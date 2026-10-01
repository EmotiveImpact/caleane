# Calenne web

This is Calenne's standalone front page. It is plain HTML/CSS/JavaScript with local assets and no build step or dependency on the NAY DÉCOR website.

Preview from this directory:

```sh
python3 -m http.server 4330 --bind 127.0.0.1
```

Open <http://127.0.0.1:4330/>. The **Open workspace** links point to the separate local app at `http://127.0.0.1:4320/`, configured in `config.js`.

`calenne.co` has been selected but has not been purchased, connected or deployed. Before publishing this page, set `CALENNE_APP_URL` to the verified hosted app origin, provide the actual legal/privacy pages and business contact details, and remove the temporary `noindex` meta tag when the public site is ready.

The industry images are concept imagery, not a claim that Calenne or its customers completed the pictured work. The UI panel on the front page is an illustrative rendering of locally implemented screens and sample data. The app and its data stay in the sibling `app/` directory.

The current front page uses a studio-journal hero, an illustrative project preview with working Brief/Design/Decision tabs, and coverage of event, interiors and brand/experience studios. Its mobile menu and in-page navigation work locally. The imagery is conceptual and the product preview is marked illustrative.
