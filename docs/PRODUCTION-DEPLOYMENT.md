# Caleane deployment — 1 October 2026

## Website

- Public domain: https://caleane.com
- www.caleane.com redirects permanently to the root domain.
- Vercel team: `emotiveimpact-gmailcoms-projects` (`team_b6Fxo9toEzszY79UElVkugkb`).
- Existing website project: `web` (`prj_cT5VFuRIJSoi2lL8dyyHf5571y8a`).
- Production deployment: `dpl_EWVoo14Dcg6eRWJBFE9vLeYrBi21`; Vercel reports READY.
- Source: `web/`. `npm run build` packages the website in `web/dist/`; `web/vercel.json` selects that directory.
- DNS stays at Spaceship: `@` and `www` A records point to `76.76.21.21`, using the values returned by Vercel CLI. Vercel domain configuration reports no conflicts and `misconfigured: false` for both names.
- Login and workspace entry links go to https://app.caleane.com/login, where visitors choose Studio view or Client view. The on-page examples, sample labels and noindex settings remain.

## Hosted sample workspace

- Public demo address: https://app.caleane.com/login
- Separate Vercel project: `caleane-app` (`prj_jsR07cn5jSy8F9OOMytDXTCjQBaQ`).
- Source directory: `app/`. The Vercel project currently uses a direct directory deployment, with no Git root directory override or automatic Git deployment connection.
- The app hostname is assigned to this project. Spaceship has `app` CNAME pointing to Vercel's returned project target, `35648c359525bc70.vercel-dns-017.com.`.
- Sample deployment: `dpl_A1QRdkxueidoEDskvBNYDyWQuGc1`; Vercel reports READY. This is the existing app UI and fictional seed data, not a live customer service.
- Runtime correction: Vercel logs exposed a `sanitize-html` / ESM parser startup failure. `app/scripts/build-hosted-demo.mjs` bundles the current sanitizer into the demo runtime; other packages remain external so PDF assets keep their normal paths. The 4 demo tests also pass against this compiled runtime with Node's `require(ESM)` disabled. The hosted build shows the Studio/Client chooser immediately, before API discovery.
- `app/hosted-demo.mjs` wraps the actual workspace API for Vercel. It restores a visitor-owned, AES-GCM authenticated sample database snapshot for each request, executes the existing role checks, then returns the sealed snapshot. Temporary SQLite files are only per-request scratch space and are removed after processing. No authoritative state depends on a Vercel instance's filesystem.
- `app/public/demo-worker.js` serializes API requests and keeps that visitor's snapshot and demo session in their browser's IndexedDB. Studio/client switching shares the visitor's sample project state. Clearing browser storage or Reset demo starts fresh. Different browsers have independent samples.
- Vercel environment: `APP_ORIGIN=https://app.caleane.com` and the secret `CALEANE_DEMO_STATE_KEY`. The key is never committed or sent to the browser. Rotating it invalidates existing sample snapshots.
- Real signup, account email, calendar provider calls and payment routes are blocked in this wrapper. Only the fictional Studio view and Client view entry paths are offered. Uploads are restricted to sample files below 1 MB; oversized sample state requires a reset.
- The local app's database and uploaded blobs are excluded from deployment. Its normal Node/SQLite runtime remains available locally.
- Verification: all 86 local app tests pass; the new tests cover fresh function instances, independent visitors, studio/client permissions, altered snapshots and disabled provider routes. A separate worker harness verified request serialization, saved-state reuse and reset. The hosted demo and marketing builds passed, and Vercel reported READY with their custom-domain aliases. Hosted browser acceptance on 1 October: reloaded the existing app.caleane.com tab, verified the Studio/Client buttons replaced the old sign-in form, clicked Studio view and saw the studio dashboard, then switched to Client and saw the restricted client navigation and project conversation. This verifies demo entry and role switching, not every hosted feature.

## Mobile demo entry polish — 2 October

- The sign-in headline uses two block spans with an explicit text space, so hiding a line break can no longer join “room” and “for”.
- Phone layouts have a compact image header, white entry area, stacked Studio/Client buttons with descriptions, and a wrapping demo footer. Desktop retains the two-column composition.
- Published build is READY on app.caleane.com. The new entry was visually checked in the hosted tab. An isolated local build verified 320px, 390px and 1280px layouts without horizontal overflow; mobile button heights are approximately 82px.

## Live customer workspace — still pending

- Remaining hosting work: migrate records to Neon PostgreSQL, private uploads to Cloudflare R2, adapt the API to Vercel's request lifecycle, configure secrets and verify authentication, project isolation, uploads and persisted writes in the deployed environment.
- Live payments remain disabled. Resend delivery must be configured and verified before account recovery and invitations can be relied on online.

The hosted sample is not production customer storage. Do not replace the browser snapshot transport with a shared temporary filesystem database in Vercel Functions.

## Deployment command

From `web/`, run `npm run build`, then `vercel deploy --prod --yes`. The local `.vercel/project.json` links that folder to the existing website project. No GitHub automatic deployment connection was configured in this release.

From `app/`, run `vercel deploy --prod --yes` to publish the demo. Its `vercel.json` sets `VITE_HOSTED_DEMO=1` during the remote build. A normal local `npm run build` does not activate the hosted demo transport.
