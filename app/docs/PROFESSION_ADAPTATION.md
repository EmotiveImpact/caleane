# Profession-aware project experience

Calenne serves small, service-led studios that need an enquiry, a shared project space, client communication and clear decisions. A studio chooses its **practice** in Settings. Every new project inherits that practice, and the owner can choose another **service area** when starting or editing a project. Existing projects retain their saved project details. The service area changes the client's language and prompts, while the underlying records and permissions stay consistent.

| Service area | Enquiry choices | Extra brief questions | Plan guide |
| --- | --- | --- | --- |
| Event styling | Celebrations, launches, dinners, installations | Guest count; areas to style | Brief and references → creative direction → production and installation |
| Event planning | Parties, corporate events, milestones, gatherings | Guest count; planning support | Event brief → suppliers and schedule → final coordination |
| Wedding planning | Full, partial, day and destination planning | Guest count; planning support | Planning brief → key choices → final coordination |
| Floral design | Wedding, event, installation, bespoke arrangement | Floral areas; arrangement scale | Floral brief → arrangement direction → preparation and delivery |
| Balloon styling | Installations, backdrops, arches, displays | Installation size; site constraints | Site and dimensions → design direction → preparation and installation |
| Interior design | Room, home, commercial space, consultation | Spaces; constraints | Space and requirements → design direction → sourcing and installation |
| Creative studio | Identity, campaign, art direction, digital | Deliverables; channels | Discovery and brief → concept and feedback → production and delivery |
| Bespoke making | Custom piece, commission, small batch, repair | Quantity; materials | Specification → design and materials → making and handover |

The project overview shows the next real request, the shared plan shows recorded tasks and project dates, and Decisions shows owner-authored choices plus links to current design and estimate reviews. Each service area suggests two optional comparison facts for choices: venue setting and capacity for wedding planners, installation size and setting for event stylists, material and lead time for interior designers, and equivalent practical details for the other practices. A plan guide is labelled as a guide until the studio adds actual tasks. Choice responses are recorded as **preferences** with the approver, time and selected option; they do not make a booking or collect money. Inspiration links and files remain labelled by their real source.

The shared backbone is currently enquiry → project and participants → brief → tasks, references and conversation → decisions, design approval and estimate review → owner-issued invoice and owner-recorded external payment. The invoice workflow is common to all eight service areas; the service-specific language and brief questions change while financial authority stays consistent. Stripe Connect and Checkout are implemented behind a disabled-by-default collection flag, with provider and operational gates still open in `docs/READINESS.md`. PayPal collection, contracts, supplier management and automatic email delivery are not available in these screens.

Retail order-taking florists and other product-led businesses need a separate order and inventory workflow before they are treated as supported users. The floral service area is for bespoke floral work and installations.
