# Caleane readiness — 30 September 2026

The marketing website is publicly accessible as a **sample-only preview** at https://web-steel-three-jsy14f29rl.vercel.app/. Vercel sign-in protection was disabled with the owner’s approval on 30 September 2026. The multi-user workspace is running locally. These are different products and deployment states. The website is `noindex`; it has no verified public contact mailbox or live workspace destination.

## Built in the local workspace

- Eight studio practices have tailored enquiry fields, project language, and delivery milestone templates. A studio can choose its practice and change it in Settings. Existing projects keep their own brief type.
- Client relationships, contacts, organisations, project participants, pipeline, tasks, shared conversations, briefs, visual references, design comments, choices, estimates, proposals, invoices, and studio-recorded external payments persist in SQLite with studio and project access checks. Private design drafts and uploads stay outside client project responses; explicit sharing records the brief, author and asset snapshots. A dedicated client review screen preserves exact-version approvals.
- Studio Team access is separate from client project participation. Owners can issue and revoke single-use invitations and remove members. Members start with restricted read-only project summaries; an owner can grant or revoke contribution on individual projects for the shared brief, tasks, link/note references, messages and private directions with their own files. Staff cannot see another person's private uploads. Only the owner may share a design version. Finance, CRM notes, settings and client approvals remain outside the staff role.
- Project Delivery records revisioned date holds and milestones. Releasing work requires a current client-accepted proposal and either a fully paid deposit or an explicit no-deposit reason. The owner reviews overlapping studio dates. This is a planning record, not a venue or supplier reservation.
- Owner-bound Stripe Connect setup, Checkout and signed Connect webhook reconciliation are implemented behind `CALEANE_STRIPE_COLLECTION_ENABLED=1`. Checkout also requires a platform Stripe secret, a signed webhook secret, a connected chargeable studio account, and an HTTPS app origin (or local test origin). Successful Checkout return alone never marks an invoice paid. Refunds and disputes remain open before live collection.
- An encrypted, persistent notification outbox can queue invitations and project activity when `CALEANE_NOTIFICATION_KEY` is configured. Invitations still show a copyable private link. **No automatic email dispatch is active.** The Resend adapter is implemented but not started.
- `data-safety.mjs` can create an integrity-checked SQLite backup from a live WAL database and restore it only to a new path. Backups are local and manual; no schedule or offsite storage is configured.

## Verification performed

- All 38 local Node tests passed on 30 September 2026. The connected HTTP tests exercise project access, reference discussion, date holds, encrypted invitation queueing, owner-bound Stripe setup callbacks, Checkout expiry, raw signed webhooks, duplicate events, and the verified invoice ledger with a mock Stripe client.
- Vite production build passed. Project setup was inspected at desktop and 390px phone widths, and enquiry-to-project conversion was completed in a disposable local database: the client, profession-specific brief and opportunity link persisted. The Delivery tab was previously inspected in the browser as both studio owner and client using an isolated fictional database. Private draft save, client review and Studio viewer screens were inspected in a disposable local browser preview; the permission and snapshot paths have an HTTP integration test. The website was inspected at its Vercel production alias in a separate browser profile after sign-in protection was disabled.
- Provider test mode, real email delivery, and deployed workspace behavior have not been certified.

## Before a public workspace launch

1. Move data and uploaded files to durable shared services, and adapt the Node server for Vercel's request lifecycle. The current SQLite WAL file and local uploads cannot provide shared durable state on Vercel Functions.
2. Configure the real app domain. **Live payments are deferred by the owner:** keep collection disabled. Provider refunds/disputes and live acceptance remain outside this batch.
3. Configure a verified email sender, review the exact invitation/activity emails and recipients, then activate and verify delivery. Add account recovery and email verification.
4. Schedule encrypted backups, prove restore to a separate environment, and add monitoring, retention/export/deletion controls and a full public-service security review.

Do not interpret a green local build or the live marketing URL as proof that the workspace is production ready.


### 30 September: spatial references and recorded phase summaries

Local implementation: saved owner-arranged reference canvas, keyboard/numeric controls, zoom, source inspector and responsive grid fallback; project phase counts and next step use role-filtered delivery milestones. Stale board revisions are rejected. Client project responses omit raw private operations. All 34 local tests and the Vite production build pass; save/reload, pointer/keyboard, discussion, phase and narrow-screen journeys were checked in a disposable browser database. This does not change the provider or public workspace launch gates above.

### 30 September: studio intake, search and project contributors

Owners can configure up to eight enquiry questions; the hosted planner validates them and retains answers with each project's brief history. Owner-only search covers projects, clients, opportunities, next steps and invoices. Team members can contribute only to projects the owner explicitly assigns, and can be revoked without affecting client participants. The local build and 37 tests passed. A disposable browser journey checked configuration, submission, lookup and contributor edits. The saved four-project workspace was backed up and restarted on port 4324. Single-choice conditional questions and private design-file contribution were added in the next local batch. Wider editorial roles and richer form branching remain open; this does not change the public launch gates.

### 30 September: conditional intake and staff-prepared directions

A question can appear after a matching answer to an earlier single-choice question. The Settings editor restricts dependencies to earlier choices; the hosted and embedded planner hide inapplicable fields, and the server clears hidden answers. Brief revisions retain the question and whether it applied. Assigned studio contributors can prepare private directions with their own PNG/JPG/WebP/PDF files. Owners can review every draft and alone share an immutable client version. Revoking the project assignment blocks staff draft and file access. The focused connected tests, all 37 local tests and the Vite production build passed. Disposable browser inspection confirmed the contributor/owner draft handoff and the conditional question reveal/hide behavior. Provider and public workspace launch gates above remain open.

### Contracts, resource bookings and calendar export

Project Contract now supports owner-authored drafts, immutable issued versions, explicit client-approver acceptance/decline and preserved receipts. Delivery includes resource booking records with overlap protection and an authenticated ICS snapshot download. All 38 tests and the production build pass. A disposable browser journey verified the agreement draft/issue/acceptance flow. These records do not constitute provider-certified signing or automatic supplier reservations. See the implementation map's status table for the explicit unfinished account recovery, external delivery, hosting and lifecycle work.

## 1 October feature-completion update

Latest implementation: named project-task assignment/discussions/files; real message replies/files/mentions including studio contributors; rich proposals, paginated invoices, letters and private canonical-text PDF archives; account recovery/verification; manual selected-date Google/Outlook adapter; encrypted backup tooling and owner data controls. The current implementation map supersedes older counts/status notes above.

53 tests and build passed. Owner/client/contributor browser paths checked in isolated data. Real email and calendar providers are not connected. Public-workspace infrastructure still needs durable shared DB/files and server-lifecycle adaptation. Backups are not scheduled/offsite. Permanent purge is not implemented. Payments stay disabled.

Email worker: `scripts/mail-worker.mjs` requires explicit CALEANE_EMAIL_ENABLED=1 plus DATABASE_PATH, APP_ORIGIN, CALEANE_NOTIFICATION_KEY, RESEND_API_KEY, RESEND_FROM. Set CALEANE_ACCOUNT_MAIL_KEY (32 bytes, base64) on both the server and the worker to seal account recovery and verification mail with its own key; without it the notification key is used, and it continues to open mail queued before the change. Do not activate until sender and recipient delivery has been reviewed. Calendar setup: docs/CALENDAR-SYNC.md. Backup/export limits: docs/operations/.

## 1 October: connected Forms module

The studio now has a dedicated Forms area with multiple named questionnaires, eight answer types, 24-question capacity, ordered conditions, branded interactive previews, immutable publication versions, draft editing, pause/resume, duplication, archive/restore, required acknowledgements, hosted links and inline/popup/floating embeds. Responses retain the original form and brief snapshot, connect to client/project/opportunity records and support owner CSV/data exports. Legacy enquiry URLs and receipt retries are preserved. See [Forms implementation and limits](FORMS.md).

65 tests and the production build passed; focused tests passed again after browser fixes. Disposable browser checks confirmed publishing, conditional/multiple-choice submission, response/project review, unsaved draft protection, inline height changes, popup keyboard dismissal/focus return and phone layouts without horizontal overflow. The saved four-project database was integrity-backed up before the local server reload. This remains local implementation; public hosting and provider gates above still apply.


## 1 October: mixed screens, design and routing

Forms now has a screen outline and separate Content, Appearance and Logic controls. Studios can mix one-question screens with grouped pages, move and reorder questions, add welcome/statement screens, and design each screen with split/centred/stacked presentation, columns, image/alt text and continue label. Global theme controls cover serif/sans headings, background, button shape and accessible accent. Existing published forms retain their stored versions and derive the legacy grouping until the studio publishes a screen-based revision.

The shared browser/server route engine supports AND/OR conditions, typed comparisons, screen visibility and ordered forward branches. Publication rejects duplicate/missing field assignments, unavailable condition sources, deleted/backward destinations and routes that skip required contact/project fields. Changing an answer clears irrelevant browser values; submission validates the evaluated route and retains exclusions and the published design in the original response.

All 68 tests and the production build passed. Disposable browser evidence covers choosing one question per screen, regrouping fields, deleting empty screens, per-screen layout and columns, image/alt text, editorial theme, welcome screen ordering, draft saving/publication, branching, Back and cleared answers after reversing a branch, grouped contact fields, review and successful submission. Phone checks at an effective 355px viewport confirmed no horizontal overflow and one-column grouped fields. No provider services were used. The saved workspace was backed up again (`data/backups/pre-screens-20261001.sqlite`, integrity verified, four projects) before reloading its local server. [Repository research and broader feature checklist](FORMS-RESEARCH.md) records the inspected source snapshots and outstanding capabilities. Public hosting/provider launch gates remain open.
