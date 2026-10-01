# Calenne dashboard design handoff

## Read this first

Apply the supplied design philosophy to the EXISTING extensive Calenne dashboard. This is an additive visual upgrade, not a replacement product, reduced feature set or new starter application. The user explicitly said: 'its not taking away from what we have but we add certain things in places and design better in others as we already have an extensive dashboard that now needs this design philsphy'. Preserve that intent throughout implementation.

The user wants the attached exact Projects screen as the primary visual reference. It has the architectural double-L symbol with tracked uppercase CALENNE, a dark green-black sidebar, ivory workspace, stone/sage accents, natural photographic projects and people, and spacious clean sans typography. Earlier recommendations for a different Shared Frame logo do not override this selected dashboard reference.

This package contains 20 desktop visual references, including the selected Projects source and five earlier project screens, plus fourteen additional screen concepts. It defines the core workflow's visual treatment. It does not claim to cover every route, feature or state in the existing repository, which was not accessible from this design conversation.

## Instructions for the receiving backend/dashboard conversation

1. Read the current repository's AGENTS.md and active handoff files. Inspect the existing dashboard, its route map, navigation, components, API contracts, permission rules and tests. Continue the current stack and branch workflow.
2. Inventory existing capabilities before changing the UI. Build a mapping from each current route/module/action to a visual pattern from this pack. Record current paths and existing endpoints; do not treat suggested screen names as replacement routes.
3. Keep every existing capability reachable. Modules absent from the mockups still need their current functionality and an appropriate treatment using the same design system. Keep existing filters, search, sorting, bulk actions, history, integrations, exports, settings and permission affordances where they already exist. Reorganise only when it improves usability without hiding or removing capability.
4. Apply shared tokens, type, spacing, sidebar, buttons, inputs, tables, photographs and status patterns first. Then upgrade current screens in place. Add only genuinely missing workflow pieces that fit the current product; do not build duplicates of existing functions under new labels.
5. Keep current data, API contracts, authentication, workspace/tenant boundaries, roles and approval semantics intact. UI design work is not authorisation to replace a database, reset data or bypass permissions. If a specific addition requires backend work, document the gap and implement the smallest compatible change within the existing project instructions.
6. Use actual reference PNGs during implementation. These are generated concept images, not a background to paste over the app. Build real components with working controls, current records and accessible states. Use the existing authorised media and asset pipeline; the project imagery and people here are illustrative.
7. Verify implemented screens against their appropriate references at comparable viewport sizes, and verify the existing workflows still operate. Report preserved features, visual changes, deliberate additions and genuine outstanding gaps. Do not declare all dashboard work complete based solely on the 20 images.

## Files and intended use

See SCREEN-INDEX.md for numbered image files and source mapping. Start with 01-selected-projects.png. Other images demonstrate related surfaces, states and visual patterns.

| Area | Reference patterns |
| --- | --- |
| Studio work | Selected Projects; studio overview |
| Client relationship | Clients directory; client profile; enquiry detail |
| Project initiation | Create project from enquiry or current starting points |
| Project direction | Project overview; shared brief; brief editor; reference board |
| Visual collaboration | Add references; reference detail; version comparison; new version; feedback |
| Decisions | Studio approvals queue; client review awaiting decision; approved client receipt |
| Administration | Workspace settings; members and access |

Do not remove existing modules merely because they do not appear here. Additional existing screens can use the appropriate table, form, photo-led overview or document/discussion pattern above.

## Visual system

Primary brand reference: Studio Ligature double-L with CALENNE in capitals, no period. Retain the reference geometry and fixed wordmark spacing rather than inventing a new logo on every page. The symbol in these concept PNGs is not an editable vector master; use the current authorised logo asset or create a reviewed vector master from the selected identity during production. Do not import the earlier Shared Frame symbol accidentally.

Colours: green-black #101B17, warm ivory #F4F1EB, stone #C4B8A8, restrained sage near #ADB8A7. Use semantic approval, pending and error tones separately from branding. Text contrast must be checked on the actual implementation. Avoid decorative gradients and glows.

Typography: continue Instrument Sans if it is already the site's face. Upright only; regular body, medium labels, medium/semibold headings. Start interface body at 14–16px and line height 20–24px. Marketing typography is not a reason to enlarge every dashboard heading. No decorative fonts or italic emphasis.

Layout: retain a slim dark sidebar appropriate to current navigation depth; a light content surface; spacious aligned headings; one clear primary action per task; tables and row lists on a common surface; restrained separators; occasional purposeful panels. Avoid wrapping every field, list row and status in another card. Existing dense functionality may need a toolbar, secondary navigation or disclosure, not deletion.

Photography: natural, warm, editorial project imagery with distinct subjects for interiors, events, hospitality and production. Diverse human avatars with stable identity per person; no repeated placeholder avatar used to imply different users. Never require media to load before the record or workflow is usable.

Links and controls: no decorative arrows on text links. Use conventional functional icons where they communicate the action, such as upload/download, and accessible names for icon-only controls. No fake disabled-looking primary button without a reason. Treat generated arrow decorations as an artefact to correct.

## Correct concept artefacts during implementation

The PNGs are visual references, not exact product specifications. Sidebar items, active selection, dates, avatars, project titles, file counts and statuses vary between generated images. Standardise them against the ACTUAL route map and record data. In the selected source, the main page says Projects while Overview is highlighted: the production screen must highlight its actual route. Do not copy that error.

Keep one consistent navigation shell across internal screens. Some concepts show global References or Versions and others project tabs; preserve the real application's hierarchy and avoid duplicate navigation solely because an image included it. Keep the current navigation breadth. The client-facing shell is deliberately simpler, without granting or exposing internal studio access.

The screens illustrate different times in a workflow. Riverside Version 03 is an approved historical direction; Version 04 is a later draft/in-review direction. Do not make an approved project globally unapproved simply because a new review version exists. Generated images and example chronology are not a production data migration.

## State and workflow rules to retain

Brief draft, shared brief and agreed brief are distinct. Saving a draft must not silently replace the agreed record.

A reference is not an approved design version. Adding, annotating or discussing a reference does not change the approved direction.

Versions need stable identity and lineage according to the existing backend. Publishing a new version does not overwrite the old version or carry forward a prior approval automatically. When supported, show scope and change summaries without inventing unsupported guarantees.

Resolving feedback is not approval. Keep resolution state separate from approval records. Pending requests, requested changes and approval must remain distinguishable with both text and colour.

The studio should see pending decisions and history. An authorised client makes an explicit decision on a named version and scope. An approved receipt displays the specific version, reviewer, timestamp and scope that the backend actually stores. Do not add false legal or audit guarantees to match a mockup.

Keep share controls, invitations, recipient selection and role boundaries explicit. A client sees only intentionally shared records. Reuse the existing secure access model rather than assuming the example roles are a new permissions specification.

## Responsive and non-happy-path work

These are desktop references, not tested mobile layouts. Preserve and refine current responsive behaviour. Collapse the rail appropriately, move supplementary panels below the main content or into an accessible drawer, and keep review actions visible without squeezing three columns into a narrow display.

Implement current supported empty, loading, error, validation, permission-denied, expired-share, upload-progress and conflicting-edit states in the new design language. Preserve existing confirmation/recovery behaviour for destructive operations. Existing functionality determines which states are relevant. Do not add payment, scheduling, AI or unrelated integrations just to fill a mockup.

## Suggested implementation sequence

First: current feature inventory, shared tokens and shell, then the existing Projects page using the selected source. Second: existing project overview/brief/reference/version screens and their editing interactions. Third: feedback, pending decisions and client review. Fourth: clients/enquiries and project setup where present. Fifth: remaining current modules, settings/access, responsiveness and regression verification. Adjust order to the receiving conversation's active roadmap and dependencies.

## Verification and acceptance

Build and run the checks required by the current repository. Exercise real paths through project creation/opening, brief editing, reference upload/discussion, version review, feedback, client decision and history as applicable. Verify state persists correctly and current permissions hold. Compare screenshots to the supplied direction and explain purposeful deviations needed to preserve existing functionality.

Acceptance requires: no unaccounted removed route or action; consistent typography and tokens; selected route reflects navigation state; existing records and filters work; authorised clients can act only within permitted scope; approved-version history remains intact; keyboard and focus behaviour remains usable; responsive and error states are covered. No claim of deployment or test completion should be based on these generated PNGs.

## Provenance and limits

The fourteen additional screens were generated with built-in image generation, using the exact user-selected Projects image as their attached source. The earlier five project screens were generated using the preceding Calenne homepage's embedded app as reference. All images are conceptual raster output, not editable Figma files or implemented frontends. The selected image came from the user. No access to /Users/augustusedem/Calenne, its localhost preview, current backend or the receiving conversation was available here. The package was prepared for transfer, not posted directly to another chat.
