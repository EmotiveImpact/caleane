# Calenne — industry strategy, vision and product requirements

**Working decision · 29 September 2026**  
**Status:** product proposal, not a claim that the proposed features exist.

## The decision

Calenne should start with **owner-led creative service studios that sell and deliver a considered project with a client**. The common job is to turn an enquiry into a shared brief, keep people and decisions together, and show what was approved. NAY DÉCOR is the prelaunch founder scenario and the first connected website; it has not produced a real customer journey yet. Wedding/event planners and bespoke event studios are parallel external discovery candidates. Calenne is the software brand; each studio keeps its own name, website, customers and data.

The initial wedge is **high-touch, visual projects with several rounds of client input**. This is narrower and more credible than “software for every service business.” It also uses what the local product actually does well: a client relationship, an opportunity, a project, shared briefs, files, versioned designs, feedback, estimates and in-app correspondence. It does not yet complete a sale or run the business's finances.

## Industry order

| Order | Studio type and initial job | Why Calenne fits now | What must exist before a specific promise |
| --- | --- | --- | --- |
| **0 — founder scenario; external proof needed** | Event styling, balloon/backdrop work, floral/event design and experiential production. Capture a visual brief, coordinate the buyer and planner, review a proposal direction and record approvals. | NAY supplies the intended website intake and a realistic scenario for prototype testing. Events exercise date, venue, multiple stakeholders and time-sensitive decisions. | NAY has not launched. Do not claim observed demand or a booked date: live capacity, contracts, deposit, suppliers and production run sheets are missing. |
| **0 — parallel external discovery** | Wedding and event planners. Give clients a clear place to see the current plan, documents, decisions and next actions while the planner coordinates work. | A [planner discussion](https://www.reddit.com/r/EventPlanners/comments/1q4rux5/what_portals_do_you_use/) shows both interest in a more professional client experience and concern about forcing couples into an unfamiliar portal; the poster already uses Dubsado and Drive/Sheets. | Test whether clients use a focused project home and whether planners will pay for it. Timelines, vendors, budgets, guest/RSVP work and day-of changes may be prerequisite; current Calenne does not cover them. |
| **1 — first adjacent pilot** | Interior design and spatial styling studios, especially residential and boutique commercial projects. Bring client requirements, room references, iterations and approver decisions into one record. | The existing brief, inspiration, visual versions, pinned feedback, multi-contact access and estimates transfer naturally. [Dubsado's interior-design page](https://www.dubsado.com/industry/interior-designers) confirms that intake, documents, timelines and client collaboration are common jobs in this segment; it does not establish demand for Calenne. | Room/space structure, selections, specification and procurement need discovery. Avoid claims about ordering, site management or contractor coordination. |
| **1 — second adjacent pilot** | Brand, campaign and experience studios. Manage a business buyer, multiple reviewers, creative versions and decision history for a project. | Organisations, contacts, project stakeholders, revisions and approvals already form a useful core. The product can distinguish the commercial buyer from the design approver. | Deliverable/milestone structure, usage rights, external review links and export/handover need validation. Do not position the current file library as digital asset management. |
| **2 — research contrast** | Retail flower shops, custom cake makers and similar order-led businesses. Handle enquiries, custom requests, price and collection/payment. | Relationship, intake and visual approval may help the bespoke part of the work. | POS, stock, dispatch, delivery slots and fast order throughput may be the main operation. Do not treat a project workspace as a complete shop system. |
| **2 — conditional expansion** | Boutique hospitality and venue teams **for bespoke experience or event projects**. Handle repeat accounts, venue/brand contacts, project briefs and visual sign-off. | Relationship history and repeat projects may matter more here than a generic ticket queue. | Venue availability, holds, reservations, capacity, contracts and deposits are absent. Do not market Calenne as a venue booking system until those records have real authority. |

**Do not target yet:** clinical wellness providers, therapists, healthcare, legal/financial advisers, contractors needing regulated records, or high-volume appointment businesses. Their core workflows and data duties differ materially. The wellness photograph in sign-in can express a creative atmosphere, but it must not imply Calenne handles patient records, treatment plans or appointment booking. A wellness *brand or interior studio* can still fit the creative-project wedge.

This ranking is a **capability-fit hypothesis**, not a market-size estimate. UK government [business population statistics](https://www.gov.uk/government/statistics/business-population-estimates-2025/business-population-estimates-for-the-uk-and-regions-2025-statistical-release) show a large broad professional-services sector, but do not measure the addressable subsegments above. [HoneyBook's event-planner offer](https://www.honeybook.com/software-for-event-planners) and [Dubsado's client-portal guidance](https://help.dubsado.com/en/articles/15920587-what-are-client-portals) show established buyer expectations around forms, contracts, payments and optional portals. They are competitive context, not evidence that Calenne already offers those functions. Interview operating businesses and some of their clients before treating the order as validated.

## Vision

**A calm operating space for a creative studio and its clients: every relationship, project, version and decision has a clear home.**

Calenne should help a studio answer four questions without searching email threads: **Who is this for? What are we making? What needs a decision? What was agreed?** A client should be able to contribute without learning the studio's internal CRM. The product earns trust by keeping commercial state, creative approval and booking state separate.

### Product principles

1. **Relationship first.** People and organisations persist across projects; email is contact data, not the relationship's identity.
2. **One decision trail.** A decision names its version, brief revision, decision maker and time. Approved work remains inspectable.
3. **Useful without a portal.** An owner can record an enquiry and progress it before inviting a client. A client portal is invited and scoped to permitted work.
4. **Studio identity, shared platform.** Intake, portal and project vocabulary can adapt through templates and branding; tenant data and permissions remain separate.
5. **No false operational state.** An estimate is not an invoice; an approval is not a contract; a manually logged email is not a sent message; a project date is not a reservation.
6. **Quiet interface.** Primary navigation follows the work people do, not database modules. Icons support orientation but never replace a clear label.

### Primary users and jobs

| User | Job to be done | First success moment |
| --- | --- | --- |
| Studio owner | See new enquiries, qualify opportunities, follow up, open the client relationship and keep project decisions current. | Can find the next action and the latest approved version for a client in under a minute. |
| Studio collaborator (**future role**) | Work on assigned clients/projects without gaining access to every account or owner-only notes. | Can complete assigned work with an auditable permission boundary. |
| Client contact | Share a brief and references, ask questions, review designs and respond to an estimate. | Understands exactly which version they are reviewing and what action is requested. |
| Client approver | Make an authorised creative or planning decision. | Approval is attributed to them and preserved against the correct version. |
| Payer (**future permission**) | See the accepted commercial scope, invoice and deposit state without receiving unrelated private project records. | Can identify the amount due and whether payment has been verified. |
| Limited external participant (**future permission**) | See only the schedule, file or task relevant to a vendor, planner or contractor. | Can act on their assignment without seeing the client's invoice, private conversation or other vendors' work. |

## Current product boundary

The app is a **local single-server MVP**, not a hosted SaaS. The table reflects `app/README.md`, `app/PRODUCT.md`, `app/SERVICE_JOURNEY.md` and the current sidebar/code as reviewed on 29 September 2026.

| Capability | Current state | Requirement for the next product stage |
| --- | --- | --- |
| Tenant accounts and website connection | Local studio separation, branding, allowed origins, public enquiry API, hosted/embed planner. NAY's custom planner connects over localhost. | Configurable intake questions and wording; hosted origin and verified connection setup. |
| Relationship graph | Client accounts, organisations, contacts, project stakeholders, three participant roles. | Make primary email less central in UI and data migration; staff access model and robust account administration. |
| Sales | Owner-only opportunities, six manual stages, activity and dated tasks. Public enquiries currently create projects and Discovery opportunities. | Distinct lead/enquiry qualification before project creation, assigned ownership and source attribution. |
| Client work | Revisioned brief, inspiration, versions, pinned feedback, approvals/change requests, shared tasks and estimate decisions. | Industry templates for project structure; validate language and cross-industry cases. |
| Correspondence | In-app project/general conversations, unread state, status; manual email activity log. | Rename UI away from “Mail”; actual email delivery/sync only when implemented with delivery status. |
| Commercial operations | Planning estimates only. Opportunity “Won” is manual. | Formal scope/proposal, contract, date hold, invoice/deposit and provider-verified payment state, each independent. |
| Delivery operations | Calendar from project and task dates; shared library. | Industry-specific schedule, resources and handover only after pilot evidence. |
| Public service | Local SQLite with BLOB uploads, loopback server, in-process limits. | Hosted database/storage plan, tested restore, verified email/recovery, security/privacy/retention controls and support operations. |

## Phased PRD

### Phase A — validate the wedge and make the first journey coherent

**Objective:** test NAY's intended flow as a founder scenario and map the same core against external event stylists, wedding/event planners and adjacent studios. Use fictional or consented pilot data while public-service gates remain open.

**Requirements**

- **A1 — language and navigation:** Use neutral shell labels: Today, Inbox, Clients, Pipeline, Projects, Calendar, Library and Studio settings. Keep NAY-specific event wording inside NAY's intake template. “Mail” must not imply email delivery. See `NAVIGATION.md`.
- **A2 — project-type templates:** Define event styling, wedding/event planning, floral event design, interiors and brand/experience templates with labels, starter questions and optional project sections. The base relationship, opportunity, project and permission model remains the same for every template. Record each specialist capability as designed, prototype-tested, implemented or pilot-verified; a generic notes field does not count as a specialist workflow.
- **A3 — research:** Complete 10–12 recent-project walkthroughs across planners, event stylists, floral designers, interiors and one or two contrasting creative/order businesses, plus at least three client-side task tests. NAY is a separate founder prototype walkthrough, not an observed customer journey. Record exact vocabulary, approval roles, handoff artifacts, existing tools and where each person expects to find a next action. Compare a full Calenne journey with a client project home that coexists with the owner's current tools.

**Acceptance:** one representative user per pilot type can submit an enquiry, find the client, open a project, share a version and locate its decision without assisted navigation in the prototype; planner and client participants can locate one current next action and external document without coached navigation. The team records where each flow fails and what current tool the owner would retain. No template changes another studio's terminology or data. The website and sign-in do not claim payments, booking or clinical workflows.

### Phase B — operable multi-studio pilot

**Objective:** a small private cohort can complete and trust the enquiry-to-decision journey with real projects after operational review.

**Requirements**

- **B1 — first-class lead:** An enquiry is its own record with source, received time, qualification result, owner, next action and explicit conversion to opportunity/client/project. Existing NAY projects and opportunities retain IDs and history during migration.
- **B2 — staff and permissions:** Invite staff into a studio with least-privilege roles; assign lead/opportunity/project responsibility. Owner-only notes and tasks remain hidden from clients and unauthorised staff. Project Viewer, Collaborator and Approver semantics stay explicit.
- **B3 — real communication:** Verified email invitation, account verification/recovery and notification delivery. Show sent/failed/pending status from the delivery provider; keep manually logged email interactions clearly labelled as logs. In-app correspondence stays usable when email is unavailable.
- **B4 — operating safety:** Choose hosted database and file storage, isolate tenants and resources on the server, test backup **and restore**, establish monitoring, shared abuse controls, privacy notice, retention/export/deletion workflow and account support procedures before a hosted private pilot.
- **B5 — complete journey:** Record each step from intake to design decision with correct client and stakeholder context. No anonymous endpoint returns private records or invitation tokens.

**Acceptance:** a new enquiry can be qualified or declined without creating a project; conversion produces one linked opportunity/project without duplicates; migration preserves NAY's IDs, files, messages and decisions; multi-studio and multi-contact access tests pass; invitation/recovery emails have observed delivery states; a backup can be restored to a clean environment and checked. A private pilot starts only after these checks and a data-handling review.

### Phase C — commercial and delivery modules

**Objective:** support a service sale and fulfilment without borrowing creative states for legal or financial authority.

**Requirements**

- **C1 — proposal and scope:** Versioned deliverables, exclusions, price, expiry and acceptance evidence. A client's design approval does not accept a proposal.
- **C2 — booking and money:** Explicit date hold/booking, contract signature evidence, invoice/deposit schedule and verified provider events. Each state has its own actor, timestamp and audit trail.
- **C3 — optional delivery packs:** Events may add run sheets/suppliers; interiors may add selections/procurement; brand projects may add deliverables/usage rights. These are opt-in modules after pilot evidence, not universal fields.

**Acceptance:** test cases show all combinations that matter, including approved design with unpaid deposit, Won opportunity with unsigned contract, and paid deposit with unapproved design. The interface never conflates these states. A non-event studio sees no venue or strike controls unless it adopts that pack.

### Phase D — public SaaS and measured growth

**Objective:** self-service onboarding for the validated segments.

**Requirements:** tenant plans/quotas and billing, stronger account controls, observability and incident response, import/export and deletion, domain and brand controls, support access with audit, and production-scale storage/database architecture. Pricing and public domain go live only after commercial and legal decisions. `calenne.co` remains an intended name until purchased and configured.

**Acceptance:** an independent studio can create an account, connect its website, invite a client, complete a representative project and export/delete its data under documented policies; an operator can restore service and trace an access or delivery incident. These are release gates, not current claims.

## Pilot learning plan

Use NAY for a founder prototype walkthrough, then recruit **10–12 operating owners**: two to three wedding/event planners, two to three event decor/styling studios, two event florists, two interior/spatial studios and one or two creative or high-volume order businesses as contrasts. Observe one recent project per firm and test one specific client action with at least three real end clients. Ask for the artifacts they actually used: first enquiry, brief, version history, approval, proposal and handover. Do not import real client material into the local demo without consent and appropriate handling.

Test five hypotheses: (1) the relationship is the right top-level record; (2) versions and decisions reduce ambiguity; (3) clients will use a project home for a specific decision but may prefer email or familiar documents for routine work; (4) a shared core plus a small template is sufficient for at least one external segment; (5) an established planner can gain value without first replacing Dubsado and Drive/Sheets. Record disconfirming evidence. If a planner requires integrated guest/vendor operations, an interiors project requires procurement, or a brand studio requires external approval without login, make that a prerequisite for its pilot rather than disguising the gap.

**Pilot success measures, proposed targets rather than results:** all participants can identify the requested decision and latest version; at least four of five owners can find their next action without help after onboarding; no tenant/participant access regression; every real email shown as sent has provider evidence; no data loss in a tested restore. Instrument time-to-first-enquiry, time-to-invitation, version review completion and owner-reported administrative effort; do not claim time savings before measurement.

## Explicit non-goals for the first release

Clinical or regulated case records; a general appointment scheduler; live venue availability and booking; full accounting; e-commerce; supplier marketplace; inventory/procurement engine; automated creative approval; and an all-purpose no-code database builder.

## Decisions still needed

1. Choose the **first two external design partners** and the exact type of project each will test.
2. Decide whether the client portal is optional per project, and which review actions can occur through a secure link instead of sign-in.
3. Define staff roles before assigning owner-only CRM work to anyone besides the studio owner.
4. Decide the minimum commercial module required before the website can use “run your business” language.
5. Validate naming/domain availability and trademark clearance before a public brand launch; no domain ownership or deployment is assumed here.
