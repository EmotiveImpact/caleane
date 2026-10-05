# Caleane dashboard handoff: implementation map

30 September 2026 · Local workspace only. Current visible brand: Caleane in the original Instrument Sans wordmark, with the supplied Shared Frame symbol. Historical files retain Calenne in their names and older instructions.  The 20 supplied PNGs are design references, not screenshots of the working app. The separately supplied `Calenne-Identity` folder is the later, final identity decision; the app uses its Shared Frame assets even where the older dashboard handoff depicts a different symbol.

## Current implementation status

**Done (local)** means implemented and locally checked, not publicly deployed or provider certified. **Waiting — implementation** means code is still missing; it is not an account-credentials blocker. **Waiting — setup** names the external dependency. **Deferred** is explicitly excluded by the owner.

| Feature | Status | Where / what remains |
| --- | --- | --- |
| All 20 dashboard handoff screens below | **Implemented with adaptations; refinement ongoing** | Existing screens cover the workflows; richer multi-asset review is implemented. Exact reference fidelity and broader visual refinement remain separate. |
| Eight profession workflows | **Done (local)** | Settings practice, project-specific brief fields and Delivery milestone templates |
| Custom and conditional enquiry questions | **Done (local)** | Settings → enquiry form; hosted planner and website embed |
| Workspace search | **Done (local)** | Top bar → Search; scoped projects, clients, opportunities, tasks and invoices |
| Staff contribution and private design preparation | **Done (local)** | Team → project assignment; owner reviews and shares versions |
| Pipeline opportunity inspector | **Done (local)** | Contextual drawer: preserved form request, explicit review, dated next steps, project conversation and revision-protected start planning |
| Enquiry review and active-project separation | **Done (local)** | Unaccepted projects remain in Enquiries; Active and Overview work exclude them. Project date and expected decision date are separate |
| Calendar day-details drawer | **Done (local)** | Click a day → desktop drawer/mobile sheet; exact project and task navigation, filters, day browsing and retryable follow-up errors |
| Notification history and read state | **Waiting — implementation** | Current bell is a needs-attention popover, not a persisted event inbox; full drawer, read history and exact-item navigation remain |
| Server-paged pipeline retrieval | **Waiting — implementation** | Visible lists paginate locally; the API still returns the dataset used by board, summaries and attention |
| Estimates, proposals, invoices and external payment records | **Done (local)** | Project commercial tabs and Finances; owner-recorded payments are not live collection |
| Versioned contracts and portal acceptance | **Done (local)** | Project → Contract: owner-authored terms, issue/withdraw, approver accept/decline, immutable receipt; no certified signing provider |
| Venue, supplier, equipment and studio-time booking records | **Done (local)** | Project → Delivery → Resources: dates, confirmations, conflicts, history and optional client sharing; no supplier is contacted or reserved automatically |
| Calendar download | **Done (local)** | Project → Delivery → Download project calendar; private/authenticated ICS snapshot, not ongoing sync |
| Live payments | **Deferred — owner request** | Collection remains disabled; no live charge or provider activation performed |
| Automatic invitation/activity email | **Waiting — setup and activation** | Encrypted outbox and Resend adapter exist; needs verified sender/domain, configured keys, worker activation and delivery acceptance |
| Account recovery and email verification | **Done (local); waiting — delivery setup** | Single-use expiring links, encrypted queue, password reset session revocation and account screen; real sender/worker delivery not activated |
| Google/Outlook two-way calendar sync | **Done (local adapter tests); waiting — provider setup** | OAuth/PKCE, encrypted tokens, explicit selected all-day task/milestone dates, manual sync, conflicts and disconnect. Real Google/Outlook acceptance not performed; background/range/recurrence sync not implemented |
| Public multi-user workspace | **Waiting — infrastructure** | Durable shared database/file storage and Vercel-compatible server lifecycle, domain and deployment verification; marketing site is separate |
| Encrypted backups and monitoring | **Done (local tooling); waiting — operations setup** | Authenticated encrypted backup/restore, one-shot CLI and owner readiness checks; scheduling, offsite destination and external alerts remain |
| Retention and data controls | **Done (local, non-destructive scope)** | Owner-scoped export including optional files, reversible archive/restore and retention review candidates. Permanent purge and individual self-service deletion/export remain unimplemented |
| Reusable studio templates, richer branching and expanded roles | **Waiting — later product work** | Existing profession templates, earlier-choice conditions and assigned contributor role are implemented; broader versions are not |
| Custom portal domains, quotas and subscription billing | **Waiting — later product work** | Not implemented; subscription collection is also outside the current live-payment scope |

No item is labelled In progress merely because it is planned. This table deliberately keeps unfinished implementation visible.

| Handoff screen | Working location | State |
| --- | --- | --- |
| 01 Selected Projects | Projects gallery, list and delivery board | **Done (local)** — Working with saved projects, status filters, search, decisions and attention |
| 02 Studio overview | Overview | **Done (local)** — Working from saved project, pipeline and task records |
| 03 Clients directory | Clients | **Done (local)** — Working directory, stage filters, search and preview |
| 04 Client profile | Clients → client record | **Done (local)** — Working relationship, people, projects, activity, conversations and files; layout adapted to existing data |
| 05 Enquiry detail | Pipeline → opportunity drawer | **Done (local)** — Working opportunity, notes, tasks, activity and linked project; drawer format differs from the concept page |
| 06 Create project | New project setup from Projects, Clients and top bar | **Done (local)** — Working two-column dialog, profession-aware brief, new project or conversion from an unlinked opportunity |
| 07 Project overview | Project → Overview | **Done (local)** — Working project image when uploaded, brief, next step, recorded decisions and profession-aware phase summary from saved delivery milestones |
| 08 Shared brief | Project → Brief | **Done (local)** — Working saved brief and version history |
| 09 Brief editor | Project → Brief → Edit brief | **Done (local)** — Working profession-specific fields, revision control and change request after approval |
| 10 Reference board | Project → References | **Done (local)** — Working spatial canvas and grid, image/file/link filters, practice categories, source inspector, and approved-direction context. Owners arrange and save; clients can inspect the shared board. |
| 11 Add references | Project → References → Add references | **Done (local)** — Working multi-file upload, per-file title, category, note and source |
| 12 Reference detail | Project → References → reference | **Done (local)** — Working details, source credit, discussion and image pins |
| 13 Version comparison | Project → Versions → Compare versions | **Done (local)** — Working comparison of recorded versions and their brief revisions |
| 14 Prepare new direction | Project → Versions → private draft → Share for review | **Done (local)** — Working: studio owner can save/edit a private draft, attach private files or existing references, and explicitly publish a new version. Assigned staff can prepare their own private drafts and upload files for owner review; only the owner can publish. The version records brief, author and immutable file metadata/content hashes. |
| 15 Feedback workspace | Project → Versions → discussion | **Done (local)** — Working comments, image pins, open/resolved filter and owner resolution |
| 16 Approvals queue | Approvals | **Done (local)** — Working studio index of pending and historic version decisions |
| 17 Client review | Client project → Versions | **Done (local)** — Working: a client-specific review landing shows the current shared version, brief revision, feedback and exact decision requested. Collaborators may comment; only approvers may decide. |
| 18 Approval receipt | Approved version → View approval record | **Done (local)** — Working read-only record of the exact version, brief revision, client and time |
| 19 Workspace settings | Settings | **Done (local)** — Working studio identity, practice, configurable enquiry questions with earlier-choice conditions, intake embed and connection settings; layout adapted |
| 20 Members and access | Team; separately Project → People | **Done (local)** — Working: owner-managed, single-use studio invitations, revocation and member removal. Staff begin with read-only project summaries; owners can grant contribution to selected projects for brief, task, reference, message and private draft preparation. Client Viewer, Collaborator and Approver remain separate roles. |

The project setup preview image is explicitly labelled illustrative. New real projects have no image until the studio adds project media. An opportunity carries its client identity, description and relationship history into a linked project; opportunity records currently do not hold reference images. The public intake form creates a project directly. These are two different entry paths and should stay plainly labelled.

## This batch: verified locally

- Private draft data and uploads are stored outside client project records. A saved draft is never listed in a client response. Sharing creates a numbered version; it does not rewrite prior approvals. Shared assets keep file IDs, names, types, sizes and SHA-256 hashes. The underlying uploaded file records are immutable in this app.
- The client review landing keeps a current decision prominent and retains previous versions. A changed brief makes a pending version ineligible for approval until the studio shares a fresh one.
- Team is a studio authority path with its own invitations. A staff member starts with read-only project summaries. An owner may grant contribution to named projects; those members can edit the shared brief, tasks, link/note references and project messages there. In that batch, they could not see private drafts or files; assigned staff now see only their own private drafts and uploads (see latest section). They still cannot see finances or CRM notes, change settings, or make client approvals. Unassigned projects stay read-only.
- The old direct `POST /api/projects/:id/designs` route remains for compatibility with existing tests/clients; the workspace UI now uses private draft → explicit share.
- The new HTTP integration test, all 32 local tests and the production build passed. Owner, client and studio-viewer screens were checked in a disposable local browser preview. The saved port 4324 workspace was backed up and restarted with its four projects intact.

## Spatial references and phase summaries: implemented locally

- References now opens as a spatial canvas on desktop and a grid on narrow screens. Drag handles, arrow-key movement, numeric placement and sizing, zoom, source inspection, discussion and image pins operate on the same reference records. Arrangement changes require Save arrangement; a revision check prevents overwriting a newer arrangement. Source details, comments and approval records are preserved.
- Owners arrange the shared board. Project clients inspect it and retain their existing comment permissions; studio viewers cannot access reference files. The board is a bounded spatial surface, not an infinite canvas, and does not yet offer export, connectors or grouping.
- Project Overview now shows completed/total recorded milestones, the current in-progress or next unfinished step, and the saved phase timeline. Existing profession templates remain managed in Delivery. Empty plans stay empty until the owner starts them. Client summaries include only shared, active milestones. No illustrative completion percentages are presented as project state.
- The general client project DTO no longer includes raw operations data; delivery information comes from its role-filtered endpoint.
- All 34 tests and the production build passed. Disposable browser checks covered keyboard and pointer arrangement, save/reload persistence, reference discussion, milestone counts and narrow-screen grid fallback without page overflow. Final Shared Frame identity and the existing local project data are retained.

See `/Users/augustusedem/Documents/Codex/Calenne-shared-concepts/REVIEW.md` for the original image critique.

Live payment collection, email delivery and public workspace operations have separate gates in `docs/READINESS.md`; local browser verification here does not close those gates.

## Enquiry, search and team follow-through: implemented locally

- Settings now lets an owner add up to eight short, long or single-choice enquiry questions, mark them required and order them. The hosted and embedded planner use the same saved form. The public API validates current questions; answers are stored as labelled snapshots in the project brief, remain visible if the question set changes, and can be revised with the brief's existing revision history.
- The top bar provides owner-only workspace search for projects, clients, opportunities, CRM next steps and invoices. Results stay within the selected studio. Project, client, opportunity and invoice results open their record; task results open and highlight the exact next step.
- Team project contribution is assigned per project after the member accepts a single-use invitation. The contributor workspace covers brief, shared tasks, link/note references and messages. Server checks both current staff membership and current project assignment on every request. Removing or revoking an assignment blocks further access. Staff can now prepare their own private directions and files for owner review. Owner-only finances/CRM and client decision authority have not been granted.
- All 37 local tests and the Vite production build passed. Browser checks in a disposable studio covered settings → hosted planner → saved brief, workspace search, owner grant → staff login → brief/task edits. The saved port 4324 workspace still has its four projects after restart; a verified backup preceded the restart.

## Conditional intake and staff design preparation: implemented locally

- Owners may show a custom question only when an earlier single-choice question has a selected answer. Reordering/removing questions clears invalid conditions. The hosted/embedded planner hides irrelevant questions, while server validation saves only applicable answers. Owner, client and assigned-staff brief editors follow the same conditions and maintain revision history.
- Assigned studio contributors prepare private drafts with up to eight of their own uploaded files. They can read/edit only their private drafts and files on currently assigned projects. Owners see the author, may refine a staff draft and alone can share a numbered version. A client cannot read the draft or its assets before that share.
- Focused connected tests and all 37 local tests passed. The production build passed. Disposable browser checks confirmed the staff draft appearing in the owner's review list and a conditional question appearing/disappearing with its parent choice. The live saved workspace was not used for QA content.

## Contracts, resources and calendar: latest local batch

- Contract drafts and issued versions live outside the shared project DTO. Only the owner and current project approvers can read contract records. Issued content has a SHA-256 digest; acceptance records the exact version, account identity, timestamp and explicit consent. Expiry, changed brief, stale revision and role checks run on the server. Previous accepted terms cannot be overwritten or withdrawn.
- Resource bookings check overlapping dates for the same named resource and kind within the studio. Confirmed status requires a recorded external confirmation reference. Updates retain prior booking details; clients receive only explicitly shared title, kind, dates, location and status.
- Authenticated ICS downloads contain visible date holds, milestones and resources. Private notes and confirmation references are excluded from client downloads. Each download is a snapshot.
- All 38 local tests passed; the production build passed. Disposable browser QA exercised draft → issue → client acceptance and shared booking visibility. An authenticated HTTP check verified booking creation and ICS download. The saved port 4324 preview was restarted after an integrity-checked backup, with all four projects intact and no QA agreements or bookings added. The new features do not enable live payment collection or send emails.

## 1 October: Pagedly contract editor — Done (local)

- Integrated the existing packaged Pagedly 1.1.0 from HRLETTER as a local tarball dependency. The original Pagedly repositories are unchanged. Editor code is lazy-loaded on document access.
- Project → Contract → New agreement/Edit draft now uses A4 paginated editing with headings, emphasis, lists, alignment and tables. Saves canonical server-sanitised HTML; formatting is included in the issued version fingerprint. Existing plain-text agreements remain readable. Draft updates use revision checks; issued/accepted content cannot be edited.
- Read-only page preview and a dedicated Print / save PDF action for the selected saved agreement are available. Print includes title, version and available response/fingerprint details. Browser print output is separate from the editor's page layout; exact PDF pagination parity and automatic PDF generation/storage remain **Waiting — implementation/verification**. No archived PDF is claimed.
- All 38 tests pass, including formatting sanitisation, stale draft rejection and immutable issued content. Production build passes. Disposable browser QA confirmed create/save/reload/edit/issue and the read-only paginated preview; the print action created its isolated print document, but a saved PDF artifact was not verified.
- Pagedly integration for proposals, invoices and general letters remains **Waiting — implementation**. This batch covers contracts only. Live payments remain deferred and hosting migration is unchanged.

## 1 October: document workspace refinement — Done (local)

- Contracts now use a compact action bar, selectable version rail and a single document canvas. Creating/editing stays inside that workspace; issued versions retain their existing protections. Warm paper, muted green selection and smaller typography align with the existing workspace identity.
- Proposals now have Summary and Document / PDF views. The paginated document renders the saved scope, delivery, exclusions and estimate snapshot, with an isolated browser-print action. This is a read-only document view; rich proposal authoring is not yet implemented.
- Both document canvases have Fit page and 100% controls. A4 pages fit narrow containers without causing page-wide horizontal overflow; actual size remains available for reading/editing. The native reply-date input now handles input events as well as change events.
- Verification: all 38 local tests passed; final production build passed. Disposable browser checks verified creating/saving a new contract draft, version selection state, proposal snapshot rendering and a 390px viewport with no document-wide horizontal overflow. Saved workspace data was not used for QA.
- **Waiting — implementation:** rich proposal authoring; invoice and general-letter Pagedly integration; automatic PDF generation and private archival storage.
- **Waiting — verification:** saved PDF artifact and exact print/editor pagination parity. Browser print remains a separate layout.
- **Deferred:** live payments. No hosting migration, deployment or external messages in this batch.

## Project conversation redesign — Done (local)

- Project Messages stays inside its project. A compact chat timeline replaces the letter-style correspondence view, with sender initials, timestamps, day separators, message search, quoted reply context and a keyboard-send shortcut.
- People panel shows authenticated studio owners and project stakeholders with portal access, using actual role records without exposing their email addresses. Viewer access remains read-only. Staff contribution permissions and private studio channels are unchanged.
- Existing conversation endpoints persist messages; failed sends retain their idempotency key for retry. Refresh checks run every six seconds; this is not live presence or a websocket service.
- Production build and 38 existing tests pass. Local browser review confirmed real messages and the owner/approver participant panel. No test messages were sent to saved project conversations.
- Waiting: private team channels, mentions/notifications, threaded replies and attachment composition within this new chat surface. Quoted replies are text context, not nested threads.

## Tasks option 2 — 1 October 2026

**Done (local):** unified project tasks and private CRM follow-ups; project/date grouping; search; studio/overdue/completed views; creation, editing, completion/reopening; due dates, studio/client responsibility, project task status and description; private follow-up priority and optional opportunity association; context links; selected-task URL; desktop detail rail and responsive overlay with Escape and keyboard containment. Existing sidebar, brand and palette retained.

**Verified:** production build; 39 automated tests including task permissions, status consistency and persistence; isolated browser creation/edit/save/refresh/completion/filter/search journeys; desktop 1440x1024, mobile 390x844 (no horizontal overflow), saved workspace at its normal viewport. Four saved projects preserved; QA data kept separate.

**Waiting — implementation:** individual staff task assignment, task-specific comment threads and attachments. The UI currently assigns studio/client responsibility and links to the actual project conversation.

**Next design upgrades (reviewed against original handoff):** Versions/Review first (selectable assets, asset-specific pinned feedback and reply threads); Contracts/Proposals; Messages; Clients; Overview. These are recommendations, not completed upgrades. Detailed review: /Users/augustusedem/Documents/Codex/caleane-page-upgrade-review.md.

## Five-page dark workspace upgrade — 1 October 2026

**Done (local):** approved Overview, Versions/Review, Contracts, Messages and Clients layouts integrated with shared charcoal surfaces, warm neutral controls and original Caleane mark. Existing records and permissions retained.

- Overview puts actual project tasks, due CRM follow-ups, messages and enquiries first; project tasks open their exact task URL. Compact project strip, upcoming dates and pending client reviews replace duplicate metric blocks.
- Review provides asset selection, image zoom/fit/fullscreen, an adjacent Comments/Details rail, asset-linked pinned comments, one-level replies and resolution. Legacy comments remain on the primary asset. Server rejects cross-asset/cross-version replies and non-image pins. Draft controls are collapsed until needed.
- Contracts place white paginated documents beside status/client/version history. Existing save/edit/issue/withdraw/response actions and functional Fit page/100% preserved.
- Messages provide conversation list, exact project-thread selection, message search, status, participant context and a responsive thread view. Existing quoted replies are shown as quotations; no live presence or in-chat attachment delivery is claimed.
- Clients use client initials as identity and reserve project photos for related work, with aligned columns and contextual details.

**Verification:** final production build; 41 passing tests, including cross-asset/version feedback isolation; browser draft persistence, comment/reply/resolve persistence, message persistence/search/selection, responsive layouts. QA records were confined to a separate database. Saved database backed up with integrity check OK.

**Still waiting:** named individual task assignment; task-specific discussion/files; full message reply-thread model and message attachments; automatic document PDF archival; provider/infrastructure gates above. These are not completed by the visual upgrade. Live payments remain deferred.

## Feature completion batch — 1 October 2026

This section supersedes earlier Waiting bullets for features listed below. The workspace uses a **light warm main area and charcoal sidebar**, correcting the earlier full-dark interpretation.

### Done locally

- **Tasks:** individual project-team assignment, persistent task comments and image/PDF files. Available to owner, participating clients and assigned studio contributors. Private CRM follow-ups remain owner-only; their access is not widened by assignment.
- **Messages:** real parent-linked reply threads, up to five image/PDF attachments, participant mentions, filename search and attachment-aware previews. Owner inbox, project chat, client portal and assigned contributor chat share the same surface. Unsent uploads remain private; revocation removes file/message access.
- **Documents:** rich Pagedly proposal content; issued invoice preview/print; draft/issued letters; automatic immutable private PDF records for issued proposals, invoices, contracts and letters. Documents tab is owner/approver only. PDF archives are canonical text records, not a claim of exact Pagedly visual pagination. Latest editor content is flushed before saving.
- **Account security:** recovery/verification screens, hashed one-use expiring tokens, encrypted queued email, generic recovery responses and session invalidation after password reset. Account menu exposes verification status.
- **Calendar:** Google/Outlook authorization and explicit manual two-way all-day task/milestone sync, conflict choices, encrypted credentials and disconnect. Tested against fake providers; no real accounts connected.
- **Operations:** encrypted backup/restore tools, owner-only readiness checks, core studio export including scoped file contents, reversible archive/restore and retention review controls.

### Waiting for setup / live acceptance

- Resend verified sender, stable encryption key, explicitly enabled worker and real delivery acceptance. No external email sent.
- Google/Microsoft OAuth applications, calendar encryption key and live connection/sync acceptance.
- Durable shared database and private file storage, Vercel-compatible server lifecycle, real workspace domain and deployment checks. Current runtime still uses local SQLite.
- Backup scheduler, offsite copies and external alert destination. Local encrypted tooling does not establish offsite recovery.

### Still not implemented / excluded

- Background calendar sync, recurrence, date ranges/resources and arbitrary external-event import.
- Destructive retention purge and individual self-service deletion/export; current studio controls are reversible and owner-scoped.
- Broader custom roles, subscription/quotas/custom portal domains and reusable studio-template expansion remain later product work.
- Live payment collection remains **deferred by owner**.

### Evidence

53 automated tests passed and production build passed. Isolated browser journeys verified task assignment/comment reload, actual message reply and 196 KB attachment persistence, client shared chat and issued-only document visibility, assigned contributor messaging, letter issue/archive creation and immediate typing-to-save correctness. Mobile contributor chat had no horizontal overflow (355 CSS px at the browser's current zoom). Provider APIs were faked in tests; no production deployment or delivery activation occurred.


## 3 October: enquiry intake and calendar context — Done (local)

- Finished the pipeline intake recommendations: original saved form answers, provenance, explicit reviewed state, separate project/decision dates, enquiry project grouping, exact conversation navigation and protected start-planning action. Historic brief-only records are clearly distinguished from original submissions.
- Calendar day details now open immediately in a Radix side panel instead of falling beneath the month. Project dates, tasks and private follow-ups have exact destinations; mobile uses a full-screen panel.
- 24 focused checks passed; production build passed. Desktop and mobile browser checks verified layout, exact task navigation and focus return. Mutations were tested with isolated databases. No business records created or modified during browser QA.
- **Waiting — implementation:** server-paged enquiry queries. Persisted notifications are done; see 5 October below.
- **Waiting — validation:** customer usability sessions. Provider setup/live acceptance and deferred live payments retain the statuses above.


## 5 October: persisted notifications — Done (local)

- `notification-feed.mjs` stores one `notification_events` row per recipient with its own read state. Sources: public and form enquiries (owners only), project and client-level messages (everyone else in the conversation, including assigned contributors), project activity (owners and invited clients, not contributors) and task assignments (the assignee, only when the assignee changes). The actor is never notified about their own action, and the email outbox is unchanged.
- Access is checked again whenever the feed is read, so removing a client or contributor from a project hides its notifications without deleting history. Read state cannot be changed for another person.
- `GET /api/notifications` pages newest first by insertion order (`before` cursor, up to 50 per page) and returns the visible unread count. `POST /api/notifications/read` accepts `ids` or `all`; `POST /api/notifications/unread` reverses individual items.
- The needs-attention bell and the new history share one bell. It opens the shared Radix drawer with two tabs: **Needs attention** (the same live list the bell always showed, opening first) and **Updates** (saved history with All/Unread, Mark all as read, Mark unread and Show older). Updates open the exact pipeline record, conversation, Activity tab, Messages or task. The badge counts waiting work plus unread project updates and assignments; unread messages and enquiries are already in Needs attention, so they are not counted twice. Contributors, who had no bell, get one with Updates only.
- Evidence: 116 automated tests pass, including the new API and drawer tests; production build passes. Chromium checks on an isolated demo database at 1280px and 390px showed owner and client feeds, navigation to the project conversation, read count updates, no horizontal overflow and no console errors. Existing records do not create a notification backlog.
- **Not included:** email or push delivery of these notifications, per-person notification preferences and retention clean-up of old rows.

## 5 October: onboarding — Done

- `onboarding.mjs` adds `GET/POST /api/onboarding`. Owners see a "Get your studio ready" checklist at the top of Overview: brand, enquiry form, first project and client invite, plus optional team and calendar. Each step ticks itself from real records; only "Hide for now" is stored (`restore-setup` exists in the API but has no button yet).
- Invited clients see a one-time welcome dialog in the studio's own name and welcome text, with a shortcut into their project when they have exactly one.

## 5 October: creatives positioning and kinds of work — Done

- Website copy speaks to creatives: "A considered workspace for creatives and their clients", "For creatives" in the nav and footer, and a wider list of who it is for. The app's account wording still says "studio".
- Sign-up, Settings and forms offer seven broad groups (Events and experiences, Weddings, Interiors and spaces, Brand and design, Photography and film, Made to order, Other creative work). Older narrow choices (event planning, floral design, balloon styling) remain valid and stay selectable only where already in use. The kind of work changes project wording, types, brief questions, plan stages and delivery milestones, not the dashboard.

## 5 October: studio commerce batch (local, draft PR)

- **Refunds and credit notes.** Studios record a refund on a paid invoice and can reduce the invoice with a numbered credit note (`CN-YYYY-0001`) in the same step. Invoice status now reads Refund due, Refunded, Partly refunded or Credited where it applies. Caleane records refunds only; it does not move money. Code: `invoice-adjustments.mjs`, `Billing.jsx`.
- **Payment plans.** A confirmed estimate can be split into scheduled payments from the studio's default plan (30% deposit, 70% balance 14 days before the event). Steps are issued in order; issued steps are locked. Code: `payment-plans.mjs`, `PaymentPlan.jsx`.
- **Pricing and billing defaults.** Saved studio address, contact, tax number, payment instructions and payment terms prefill every invoice. A price list feeds estimate lines. Code: `studio-commerce.mjs`, Settings, Pricing & billing.
- **Message templates.** Four starter templates with placeholders, insertable from the project conversation and client record. Settings, Templates.
- **Automatic reminders.** Off by default. When on, an hourly check posts one in-app message per reminder for invoices due or overdue, proposals and contracts about to expire and designs awaiting approval, and creates studio tasks for plan payments due. Clients without portal access are skipped. Email is still not sent. Code: `reminders.mjs`.
- **Client-booked consultations.** Off by default. A public page at `/book/:slug` shows free times from the studio's weekly hours, buffer, notice and daily limit. A booking creates a lead and a calendar task. Code: `consultations.mjs`, `PublicBooking.jsx`, Settings, Bookings.
- Tests pass, including 5 new ones in `test/studio-commerce.test.mjs`; production build passes. Browser QA at 1280px and 390px with a throwaway database.
- **Waiting:** email delivery for reminders and booking confirmations; Stripe refunds through the provider; calendar sync for bookings.
