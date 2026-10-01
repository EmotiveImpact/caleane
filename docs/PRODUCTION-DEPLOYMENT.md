# Caleane deployment — 1 October 2026

## Website

- Public domain: https://caleane.com
- www.caleane.com redirects permanently to the root domain.
- Vercel team: `emotiveimpact-gmailcoms-projects` (`team_b6Fxo9toEzszY79UElVkugkb`).
- Existing website project: `web` (`prj_cT5VFuRIJSoi2lL8dyyHf5571y8a`).
- Production deployment: `dpl_2fM2qAgBwHaMqFLg5qn7VAdK1VYe`; Vercel reports READY.
- Source: `web/`. `npm run build` packages the website in `web/dist/`; `web/vercel.json` selects that directory.
- DNS stays at Spaceship: `@` and `www` A records point to `76.76.21.21`, using the values returned by Vercel CLI. Vercel domain configuration reports no conflicts and `misconfigured: false` for both names.
- The website still offers the sample workflow. Account links are deliberately not connected until the workspace backend is deployed. Existing sample labels and noindex settings remain.

## Workspace — prepared, not deployed

- Intended address: https://app.caleane.com
- Separate Vercel project: `caleane-app` (`prj_jsR07cn5jSy8F9OOMytDXTCjQBaQ`).
- Intended Git root: `app/`.
- The app hostname is assigned to this project. Spaceship has `app` CNAME pointing to Vercel's returned project target, `35648c359525bc70.vercel-dns-017.com.`.
- There is no workspace production deployment yet. Domain assignment and DNS do not establish a functioning app.
- `app/server.mjs` still starts the local Node HTTP server and `app/store.mjs` still uses synchronous SQLite. Local database files and uploaded blobs are not uploaded to Vercel.
- Remaining hosting work: migrate records to Neon PostgreSQL, private uploads to Cloudflare R2, adapt the API to Vercel's request lifecycle, configure secrets and verify authentication, project isolation, uploads and persisted writes in the deployed environment.
- Live payments remain disabled. Resend delivery must be configured and verified before account recovery and invitations can be relied on online.

Do not deploy the frontend alone as a functioning workspace or use a temporary filesystem database in Vercel Functions.

## Deployment command

From `web/`, run `npm run build`, then `vercel deploy --prod --yes`. The local `.vercel/project.json` links that folder to the existing website project. No GitHub automatic deployment connection was configured in this release.
