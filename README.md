# Calenne

A separate local product for creative studios and their clients. NAY DÉCOR is its first connected studio and keeps its own brand and website in `/Users/augustusedem/Downloads/NayDecor`.

## Project layout

| Folder | Purpose |
| --- | --- |
| `web/` | Standalone Calenne front page. Static HTML, CSS, JavaScript and local imagery. |
| `frontpage-design/` | Incoming design references and front page concepts, kept separate from the website. |
| `app/` | Studio workspace, client portal, embeddable planner, API, SQLite data, tests and build. |

## Local previews

```sh
cd /Users/augustusedem/Calenne/app
npm run demo
```

The app opens at <http://127.0.0.1:4320/>. For the website, in a second terminal:

```sh
cd /Users/augustusedem/Calenne/web
python3 -m http.server 4330 --bind 127.0.0.1
```

The front page opens at <http://127.0.0.1:4330/>. Its workspace links use the local app origin from `web/config.js`.

## Product boundary

Calenne is the software platform. NAY DÉCOR is a separate creative business whose local website sends event enquiries to its `nay-decor` studio account. The NAY site has no runtime dependency on Calenne source files; on localhost it connects by HTTP at port 4320. The connection is disabled on other hosts until a hosted Calenne origin is configured.

The marketing website is deployed on Vercel at https://caleane.com. The workspace remains local; its separate Vercel project and app.caleane.com DNS are prepared, but its durable database, file storage and request lifecycle migration remain unfinished. The website retains its sample workflow and noindex setting until account access is available. See [deployment status](docs/PRODUCTION-DEPLOYMENT.md) and `app/README.md` for the capability boundary.

## Strategy and navigation

- [Industry vision and phased PRD](docs/INDUSTRY_VISION_PRD.md) — target sequence, current capability boundary, pilot research and release criteria.
- [Navigation proposal](docs/NAVIGATION.md) — recommended studio, client, project and website menus. The app menu changes in that document are proposed; they are not implemented yet.
