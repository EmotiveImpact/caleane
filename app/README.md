# Caleane

A separate app for creative studios and their clients. NAY DÉCOR is its first connected website. The product display name is **Caleane**. Settings use the Caleane spelling (`CALEANE_NOTIFICATION_KEY`, `CALEANE_STRIPE_COLLECTION_ENABLED`). A server still set up with the earlier `CALENNE_` names keeps working, because the app reads those as a fallback.

The marketing domain is https://caleane.com. Its login links to the hosted Studio/Client demo at https://app.caleane.com/login. The demo uses fictional seed data and visitor-owned browser snapshots; it does not contain the local database or offer real customer accounts. Keep existing studio website integrations on their current origins until the production backend migration and connection tests are complete. See [deployment status](../docs/PRODUCTION-DEPLOYMENT.md).

## Website and workspace

The [Caleane marketing website](https://caleane.com) is live on Vercel as a labelled, `noindex` sample preview. Its account links open the [hosted sample workspace](https://app.caleane.com/login), where visitors choose Studio view or Client view. The full local runtime remains available from this directory; see [current readiness](docs/READINESS.md) for the live customer launch gates. An earlier Railway demo is historical and is not the deployment destination for this product.

## Run it

Tested with Node 22.12 and its `--experimental-sqlite` flag.

```sh
cd app
npm ci
npm run dev
```

For a built local preview: `npm run build && npm run demo`. For production-mode startup without demo accounts: `npm run build && npm start`.

Open http://127.0.0.1:4320. The sign-in panel quietly rotates event, interiors, hospitality and wellness concept photographs; reduced-motion preference keeps the first photograph still. The sign-in screen has **Studio view** and **Client view** demo buttons. The demo accounts use fictional `.test` email addresses and clearly labelled sample projects. Demo mode is for local and gated-preview exploration only.

For an empty local workspace, run `npm start` with a new `DATABASE_PATH`, then create a studio through the sign-up screen. `PORT` defaults to 4320; `APP_ORIGIN` defaults to `http://127.0.0.1:4320`. The server binds to loopback.

The quiet helper (draft a reply, recap a project, draft a follow-up) is off until `ANTHROPIC_API_KEY` is set, for example `ANTHROPIC_API_KEY=sk-ant-... npm run dev`. It uses `claude-opus-5-5` unless `CALEANE_AI_MODEL` names another model. It only returns drafts to the studio owner; nothing is sent or saved until they choose to. It stays off in the hosted demo.

The SQLite database and uploaded files live in `data/workspace.sqlite` (uploads are stored as blobs in the database). Data survives reloads and server restarts. `DATABASE_PATH` changes its location. Back up the database with a SQLite-aware backup procedure; do not copy only the main file while WAL writes are active. The app does not use browser storage as its database.

## What works

- Studio sign-up, password sign-in, persistent server sessions and sign-out.
- Separate studios with their own name, accent colour and allowed website origins.
- Independent CRM client records, including leads without a project, company/contact details, relationship stage, tags, source and scheduled follow-ups.
- Tenant-scoped organisations, people and durable client-account/project links. A project can have several contacts with Viewer, Collaborator or Approver access; changing a contact email does not move its project or conversation. The studio manages this in the client record’s **People** tab.
- A dedicated opportunity pipeline with Discovery, Qualified, Proposal, Negotiation, Won and Lost stages; value, currency, probability, expected close, source and mandatory loss reason. Board, list and insights views share one saved pipeline.
- Opportunities can be created before a project, then converted into a linked delivery project in one database transaction. An existing project receives one Discovery opportunity during migration; creative approval never implies a Won sale.
- A client record collects its opportunities, relationship activity, projects, estimates, files and conversations. Studio notes, opportunities and CRM tasks are owner-only and never included in client project responses.
- CRM activity logs for calls, meetings, email interactions and notes; logging an email does not send one. CRM tasks have a client, optional opportunity, due date, priority and completion history. Home surfaces due actions and pipeline counts.
- Project list and pipeline, stage filters and manual project creation from the CRM. Owner-only top-bar search finds projects, clients, opportunities, next steps and invoices within the selected studio.
- Shared project tasks with studio/client responsibility and completion history.
- Versioned itemised planning estimates, server-calculated totals and client budget decisions. Estimates are distinct from invoices, contracts and bookings.
- Owner-issued deposit, balance and full invoices from a confirmed estimate. Each invoice retains a numbered seller, customer, scope and total snapshot. The client Approver can read it in project Billing; the studio has a cross-project Finance ledger and an invoice view in the client record.
- Owner-recorded external payments, partial balances and invoice cancellation before any payment. Stripe Connect setup, Checkout and signed webhook reconciliation are implemented but disabled by default. Real collection needs explicit configuration and the launch gates in [readiness](docs/READINESS.md). PayPal and bank transfers remain external studio-recorded methods.
- Revisioned project date holds, overlap review, and owner-managed delivery steps tailored to all eight studio practices. Confirmation records an accepted current scope and paid deposit or a documented no-deposit decision; it does not reserve venues or suppliers.
- Design feedback pinned to image coordinates, historical version comparison and studio resolution.
- Per-user unread state, conversation status and a correspondence view inside the client record.
- Calendar from brief dates, shared project tasks and CRM task deadlines; studio-wide file/reference library.
- Follow-ups and actionable project decisions on the studio overview.
- Public enquiries become saved projects. Repeated requests with the same idempotency key do not create duplicates.
- Private client invitations, valid for seven days and usable once. Creating a replacement invalidates the previous link for that client and studio.
- Clients see projects attached to their invited contact identity within studios they have joined. Secondary participants see only their assigned projects; a primary contact also sees general account conversations.
- Shared editable briefs with a revision history and stale-edit detection.
- Inspiration notes, web links, and image/PDF uploads up to 6 MB.
- Studio design versions, client feedback, approval records and retained past versions.
- Designs are tied to a snapshot of the brief. A changed brief requires a fresh design version before approval.
- Approved briefs accept change requests rather than silent overwrites. Studios accept or decline requests.
- Project conversations and activity history. Visible workspaces refresh every 20 seconds; Refresh is also available.
- A dedicated **Forms** area: multiple branded questionnaires, eight answer types, up to 24 ordered questions, mixed single-question/grouped screens, welcome screens, screen layouts/images/columns, themes, conditional visibility and AND/OR forward branching, interactive desktop/phone previews, private drafts and immutable published versions. Share links or install inline, popup and floating widgets. Original responses connect to client records, project briefs and opportunities, with owner response review and CSV exports. [Implementation and limits](docs/FORMS.md).

Studio Team invitations create read-only members. Owners can then grant contribution to selected projects for briefs, tasks, link/note references, project messages and private design directions with their own uploads. The owner sees every private draft and alone can share a version with the client. Contributors cannot open another person's private uploads, finances, CRM notes, settings or client decisions. Removing the project assignment ends draft and file access immediately.

Messages are in-app. An encrypted invitation and project activity outbox exists, but no automatic email delivery or password-reset email is active. The studio copies an invitation link and shares it through its usual channel. An anonymous enquiry never returns a client access token.

## How NAY connects

NAY keeps its custom full-screen planner. `NAY_CONFIG.workspace` supplies the app origin and studio slug. On localhost it connects to `http://127.0.0.1:4320`, studio `nay-decor`. This local setting is disabled automatically on other hosts.

The planner checks availability, then sends a reviewed event brief to:

```text
POST /api/public/nay-decor/enquiries
Content-Type: application/json
Idempotency-Key: <unique request identifier>
```

Required fields: `name`, `email`, `occasion`. Optional fields: `date`, `venue`, `vision`, `colours` (array), `customColours`, `pinterest` (http/https URL), `budget`, and an empty `website` honeypot. The successful response contains `ok` and a reference. General contact messages retain the existing website email endpoint.

When the service is deployed to its own server, set `APP_ORIGIN` to the verified HTTPS origin, update `NAY_CONFIG.workspace.url` and add the NAY website origin to the studio’s connected origins. The studio slug remains `nay-decor`; changing the product name does not change client or project identifiers.

## Connect another website

Create a studio account, open **Studio & connections**, add the website’s origin, and copy its embed code. For example:

```html
<script
  src="https://your-workspace-domain.example/embed.js"
  data-studio="your-studio"
  data-label="Plan your project"
  defer>
</script>
```

This adds a button that opens the hosted planner in an accessible native dialog. `data-mode="inline"` places the planner directly into the page. No framework is required on the host website. `/embed-demo` demonstrates this on a separate example page. The iframe is limited to configured origins through `frame-ancestors`; the public API checks the configured origin as well.

The public studio slug is an identifier, not a secret. The public API creates enquiries only; it cannot read private projects. The studio and client app use authenticated, server-checked access.

## Independence and extraction

This directory is the Caleane app within this repository. It has its own package manifest, lockfile, build, server, database schema, assets and tests. Vite builds from this directory alone and uses the bundled `public/assets`; the NAY website and Caleane front page are separate. Keep those assets and the font licence when moving it. The Node server mounts Vite middleware during development and serves `dist/` after a production build.

`packages/guided-form` in the separate NAY DÉCOR repository remains the small controller for NAY’s custom planner. This app is the shared project system. `public/embed.js` is its distribution plugin, and the API is the connection for fully custom planners.

## Checks

```sh
npm test
```

The integration tests use temporary SQLite databases and HTTP servers. They cover two-studio isolation, client project boundaries, owner-only opportunity/task access, opportunity revision conflicts, loss reasons, atomic opportunity-to-project conversion, activity logging, private CRM notes, contacts without projects, contact deduplication, origin checks, stale edits/approvals/estimates, accepted changes, retained design snapshots, pinned feedback, per-user read state, task permissions, server-calculated estimate totals, invoice issuance and payment-record permissions, branding authority, protected files, public enquiry retries, invitations and logout. The relationship test also covers organisation/contact linking, two project stakeholders, role-limited portal access, role changes, revocation, email changes and preservation after reopening the database. Preview-gate tests cover authentication and its healthcheck exemption.

Browser verification covered studio and client sign-in, client brief editing, project messages, studio design sharing, client approval, mobile layout, the embed dialog and an enquiry submitted through NAY’s own planner.

The new People screen was checked in a browser against an isolated demo database: contact creation through a Radix dialog, participant assignment and visible Viewer role. The existing live SQLite file was backed up with `VACUUM INTO` at `data/backups/pre-relationships-2026-09-29.sqlite` and a copy was migrated successfully, preserving all four project JSON records, client IDs, conversation IDs and file IDs. The live database was not migrated while its prior server process remained running; the idempotent migration runs on next start.

## Before a public service

The public website shows fictional sample data. The product workspace is local. Public workspace launch still needs:

1. A Vercel-compatible runtime, durable shared database and private file storage with backups, monitoring and restoration checks. This SQLite version is a single-server implementation; Vercel Functions cannot persist or share its local WAL file.
2. Verified outbound email, invitation delivery, account recovery and email verification for studio sign-ups. Password reset and two-step sign-in with an authenticator app are built; reset links need email delivery switched on.
3. Shared abuse controls, upload scanning/quotas, an operational security review and session management for a public environment. Current request limits are in memory per process.
4. A finished privacy notice, retention/export/deletion workflow and business terms.
5. Product decisions on pricing, team roles, domains and support.

Planning estimate versions, invoices, delivery records and private owner notes work locally. Studio owners can configure enquiry questions that appear after a matching earlier choice; the hosted and embedded planner, server validation and brief edits follow the same rule. Stripe provider verification is implemented and mock-tested but real collection is disabled; refunds, disputes, contracts, venue/supplier bookings, broader studio roles, external calendar integration and automated email/SMS remain open. Changing the sign-in email of an existing portal account requires a future verified recovery/change flow; editing the contact email does not change its login. Project-type choices and portal branding are configurable. See [SERVICE_JOURNEY.md](SERVICE_JOURNEY.md) and `PRODUCT.md` for the product map and next phases.


## Aetheria and design status

The supplied Aetheria source remains in the NAY DÉCOR repository under `reference/aetheriaadmin/`; its Next.js runtime is not part of either active app. Adapted card and sidebar components live in `src/components/aetheria`. The workspace uses a monochrome palette with bundled Instrument Sans. The supplied source did not include usable OpenRunde font files.

The owner selected concept 3, Studio Folio. The dark navigation rail and restrained editorial treatment now carry through Home, Work, Calendar, Library, Settings, the project workflow, and the Clients/Mail record. The record has a client directory, relationship tabs, document-style correspondence and linked project context; the client portal has a matching correspondence view. The Amelia demo portrait is generated fictional imagery, used only for the sample record. Copying a template or reference repository does not make the app production-ready.

Conversations are now canonical relational records linked to a client, optionally a project. Existing project messages and read positions migrate without losing history. General conversations, per-user unread state, retry-safe replies and owner-controlled Open/Waiting/Resolved status are implemented. Project Conversation links lead to the corresponding CRM thread; the dashboard counts both general and project messages. Owners can invite a client before creating a project. Legacy project endpoints remain compatible. Email delivery is not connected.
