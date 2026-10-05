# Caleane platform audit — 29 September 2026

**Implementation update:** The relationship-foundation slice described in this audit is now built locally. See [SERVICE_JOURNEY.md](SERVICE_JOURNEY.md) for the current service map, graph, permission rules and remaining gaps. The table and build-order observations below record the pre-slice baseline and explain why this work was prioritised. The current local database has a consistent backup; the new schema has been verified against a copy and backfills on the next start.

This is a working product audit, not a claim that the local app is a finished SaaS. NAY DÉCOR is the first service business; the product should eventually work for other studios through configuration, branding and integrations. The current app is a useful local prototype with a client portal and a small CRM layer. The mistake was to treat a pipeline and client screen as enough proof of a CRM before modelling the complete service-business lifecycle.

## Product thesis

The primary object is a **durable relationship** between a service business and the people and organisations it serves. Enquiries, opportunities, projects, conversations, documents, decisions, dates and money attach to that relationship. A client portal is a shared view of permitted work, not the entire product. NAY needs a high-end creative workflow; the underlying platform must also handle ordinary service operations reliably.

The lifecycle to support is: **capture → qualify → consult → scope → propose → contract/deposit → schedule → design/deliver → handover → follow up**. Each transition needs a defined owner, record, permission and evidence. A visual design approval does not equal a signed contract, paid deposit or confirmed booking.

## What the local app really has

| Capability | Current state | Evidence / consequence |
| --- | --- | --- |
| Website intake, studio account, client portal | Implemented locally | The NAY planner can create an enquiry; clients can edit a brief and review creative work. See `README.md` and `PRODUCT.md`. |
| Client directory and relationship record | Partial | `store.mjs` has one `clients` row per `(studio_id,email)` and projects linked by `client_email`. One contact/email effectively *is* the customer; organisations, multiple contacts, changing email and per-project stakeholders lack first-class identities. |
| Opportunity pipeline | Implemented locally, limited | Stages, value, probability, source, tasks and activity exist. There is no independent lead qualification object, owner assignment, configurable stages, forecasting controls or structured import/merge. |
| Correspondence | Partial | Canonical in-app conversations exist. Email activity is only a manual log; it does not send, receive or sync email. No external channels, delivery states or shared inbox routing. |
| Creative collaboration | Implemented locally | Revisioned briefs, design versions, decisions, inspiration, estimate versions, messages and project tasks exist. This is the strongest differentiated part. |
| Commercial commitment | Mostly absent | Estimate planning exists. Formal proposals/quotes, contracts, signatures, deposits, invoices, payment schedules and booking authority do not. |
| Delivery operations | Mostly absent | No resource/capacity planning, site visits, venue/access details, supplier assignments, run sheets, install/strike schedule, inventory/hire return or client handover. |
| Team operations | Absent | Membership roles are only `owner` and `client`; CRM tasks lack an assignee. No staff roles, queues, escalation, workload or internal approvals. |
| White-label SaaS | Prototype boundary only | Studios and brand settings exist. No staff onboarding, custom domains, tenant plans/quotas/billing, configurable form definitions, support tooling or export/deletion workflow. |
| Public-service readiness | Absent | The local app uses a single-server SQLite file and BLOB files, in-process rate limits, and has no verified outbound mail, account recovery/MFA, production backups/restore tests, or operational security review. See `README.md` for the existing launch list. |

## Key modelling correction

Separate **organisation/account**, **person/contact**, **lead/enquiry**, **opportunity**, **project/engagement**, and **participation**. A contact can work for an organisation or be private; one project can have several contacts with explicit roles (buyer, planner, approver, venue contact, guest, supplier). Email is contact data, not a foreign key or immutable identity. A project can still have one primary client relationship. Migration must preserve existing project IDs, portal access, threads, decisions and references, with tenant-scoped constraints and tests.

Avoid a giant generic object builder at this stage. Start with durable core entities and typed relationships, then add a small extension mechanism for studio-specific fields and intake questions. Tenant-customisable views and automations can follow a stable model.

## What external products teach us

- [Frappe CRM](https://docs.frappe.io/crm/setup-guide/your-first-steps-with-frappe-crm) distinguishes leads, deals, contacts and organisations and carries history through conversion. Its [lead](https://docs.frappe.io/crm/lead), [organisation](https://docs.frappe.io/crm/organization), [task](https://docs.frappe.io/crm/task) and [assignment](https://docs.frappe.io/crm/assignment-rule) documentation shows the depth missing from our CRM model: multi-contact accounts, real task owners, routing, reminders, import and timeline. [Email communication](https://docs.frappe.io/crm/email-communication) means actual sync, not a manually entered activity.
- [HoneyBook's lead guide](https://help.honeybook.com/en/articles/6554485-manage-your-leads-in-honeybook) separates a prospect from a booked client. Its [pipeline documentation](https://help.honeybook.com/en/articles/2463528-customize-your-pipeline-in-honeybook) ties stages to proposals, contracts and payments. These are a useful model for service-business progression, not a reason to copy every feature.
- [Dubsado proposals](https://help.dubsado.com/en/articles/3508875-what-is-a-proposal) connect service selection, contract and invoice in a client-facing flow. We need equivalent boundaries and records, while retaining NAY's premium creative experience.
- [ChurchCRM's person/family model](https://docs.churchcrm.io/user-guide/persons) shows the importance of people, groupings and custom fields. It is a different domain and should inform the data graph rather than be merged wholesale.
- [OWASP's multi-tenant guidance](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) makes tenant isolation, object-level authorisation, storage boundaries and noisy-neighbour controls product requirements, not late deployment polish.

The supplied Frappe CRM and ChurchCRM repositories, and locally saved references in the NAY DÉCOR repository's `reference/upstream/` folder (Atomic CRM, Chatwoot, Better Auth), are research material. Inspect current licences and architecture before reusing any code. In particular, [Frappe states CRM is AGPLv3](https://docs.frappe.io/legal/others/license-and-trademark); a commercial white-label SaaS needs a deliberate licensing decision before incorporating code. The local Chatwoot tree separates its MIT community code from an `enterprise/` licence.

## Build order that earns the word “platform”

1. **Map the real journeys and data graph.** Document NAY private event, wedding, brand launch and recurring venue scenarios; include what happens after enquiry and after approval. Define contact roles, account boundaries, authoritative states and permissions. Inspect the existing schema and migration paths before coding.
2. **Repair relationship foundations.** Add contacts/organisations/participation with backward-compatible migration; preserve all existing data and owner/client access. Implement multi-contact project context, lead qualification and explicit opportunity ownership. Test tenant isolation, changed email, duplicate contact and two stakeholders on one project.
3. **Make work operable.** Staff membership/roles, assigned tasks, next-action queues, structured timeline, saved filters, source attribution and import/export. Then genuine outbound/inbound email and notification delivery with status/retry; never display a manual note as a sent message.
4. **Make the service sale real.** Versioned proposal and scope, accepted terms/signature evidence, dates/holds, deposits/invoices/payment reconciliation. Distinguish creative approval, booking, contract and money state in both code and interface.
5. **Support delivery.** Venue, installation logistics, supplier/resource assignments, production schedule, assets and final handover. Make optional modules so a non-event service business does not inherit irrelevant UI.
6. **Turn local software into SaaS.** Tenant administration, configurable intake and brand, plan/quotas, domains, public-service auth and recovery, shared storage/database, backups/restore, observability, audit log, retention/export/deletion and billing. Check each gate in a hosted environment before describing the app as production-ready.

The first coding slice should likely be the relationship model and one real end-to-end journey, because other features built on email-as-identity would compound the problem. Confirm that choice against the code and a concrete NAY scenario before changing schema. Keep the selected monochrome Studio Folio direction and improve information architecture around the relationship rather than adding more disconnected screens.

## Acceptance standard for the next task

The next task should produce (a) a source-backed product map with current/partial/missing states, (b) a safe migration plan and implemented vertical slice, (c) meaningful API, permission and browser checks for that slice, and (d) an honest status split between local functionality, unverified integrations and SaaS launch gates. Preserve the supplied Aetheria source and existing NAY site; do not overwrite local work or import reference repositories wholesale.
