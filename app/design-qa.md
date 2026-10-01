# Calenne project journey — design QA

final result: passed

## Findings

No actionable P0, P1 or P2 differences remain. The approved studies established three complementary screens: project overview, shared plan and focused choice. The implemented screens keep the dark project rail, light document canvas, strong next action, two-column context and quiet dividers. The rendered content comes from the selected project and its service area.

**P3 follow-up polish:** The integrated Calenne project header and secondary tabs use about 80 more vertical pixels than the standalone studies. Small rail and supporting text is slightly denser. The key action remains visible in the 1487 × 1058 viewport. A later shell pass could put the project breadcrumb in the top bar and move secondary sections into a compact project menu.

## Comparison target and evidence

| Screen | Source visual truth | Browser-rendered implementation | Combined comparison |
| --- | --- | --- | --- |
| Overview | `/Users/augustusedem/.codex/generated_images/01a0ead5-2cf8-7652-9c62-69179d274922/exec-249daea5-9d5f-4db9-bd11-732605248be3.png` | `docs/design-qa/calenne-qa-overview-final-1487.png` | `docs/design-qa/calenne-qa-overview-final-comparison.png` |
| Plan | `/Users/augustusedem/.codex/generated_images/01a0ead5-2cf8-7652-9c62-69179d274922/exec-f1cc95fb-66b3-4f66-89b4-dc09a79fe305.png` | `docs/design-qa/calenne-qa-plan-final-1487.png` | `docs/design-qa/calenne-qa-plan-final-comparison.png` |
| Decision | `/Users/augustusedem/.codex/generated_images/01a0ead5-2cf8-7652-9c62-69179d274922/exec-5a2f7876-2b6e-42ce-a035-1597209d023f.png` | `docs/design-qa/calenne-qa-interior-choice-selected-1487.png` | `docs/design-qa/calenne-qa-decisions-final-comparison.png` |

The decision comparison intentionally uses an interior material choice against the study's wedding venue choice. The structure and selection state match; the subject and comparison facts change with the profession. The overview and plan compare the NAY DÉCOR event styling sample against the studies' Rowan Studio planning sample. Fake documents and milestones from the studies were replaced by recorded messages, references, tasks and dates.

All three source images and browser captures are 1487 × 1058 pixels. The browser CSS viewport was set to 1487 × 1058; screenshot pixels matched CSS pixels, so the comparisons were made at 1:1 density without scaling. Browser chrome is absent from both captures. The focused option-detail comparison is `docs/design-qa/calenne-qa-choice-focus.png`. It confirms the selected radio, title, description, two practical facts and submit affordance at readable size. The responsive capture is `docs/design-qa/calenne-qa-mobile-choice-390.png` at 390 × 844 CSS and screenshot pixels.

## Fidelity review

- **Typography:** Instrument Sans keeps the modern sans hierarchy of the studies. Journey headings, timeline milestones and choice titles were enlarged after comparison. The existing serif Calenne wordmark remains the product identity.
- **Spacing and layout:** Main and context columns, dividers and option rows follow the studies. The existing project header adds vertical space as noted above. The mobile choice screen stacks option facts and has no horizontal overflow (`scrollWidth = innerWidth = 390`).
- **Color:** The journey uses near-black, white and neutral greys. Selected and disabled states remain distinguishable; no profession is assigned an arbitrary color theme.
- **Imagery:** The overview uses the actual sample project's candlelit table reference. The study's sunlit venue image belongs to a different project; using it here would misrepresent the saved inspiration. Other screens rely on typography and real project data.
- **Copy and content:** Labels and extra brief questions vary by service area. Plan guides explicitly say they are guides until the studio records steps. A client's choice is a preference, not a booking or payment. Related design and estimate reviews point to their existing records.

## Comparison history

1. The first overview capture repeated generic guide text under each stage. Removed the repeated text and kept the single explanation below the guide. Final evidence: `docs/design-qa/calenne-qa-overview-final-comparison.png`.
2. The first plan capture had smaller milestone type and a generic “Review decision” button for design reviews. Increased journey type and spacing and made the button name match the review type. Final evidence: `docs/design-qa/calenne-qa-plan-final-comparison.png`.
3. The first choice capture lacked the reference's practical facts and showed an empty note field before a choice was made. Added optional profession-specific fact columns, collapsed the note behind a control and made the submit button full width. Final evidence: `docs/design-qa/calenne-qa-decisions-final-comparison.png` and the focused region above.

## Functional checks

The studio created an interior choice with three options and material/lead-time facts; the client saw and selected it. A prior choice was submitted by the client and remained recorded after reload. An interior brief was edited and persisted. Studio/client switching, desktop navigation and the 390-pixel mobile view were exercised. The browser error console returned no errors. `npm run build` passed and `npm test` passed 7/7 after the backend and choice-fact changes; the final note-toggle edit was rebuilt and checked in the browser.

## Implementation checklist

- [x] Overview, plan and decisions connected to real project records.
- [x] Profession-aware copy, intake choices, brief questions, plan guide and comparison facts.
- [x] Desktop and mobile visual comparison with approved studies.
- [x] Primary interactions, persistence, build, tests and browser console checked.

## Billing and sidebar follow-up — 29 September 2026

The integrated studio Billing view issued `INV-2026-0001` against Amelia's confirmed estimate. A fictional £400 external payment was recorded against its £1,000 deposit, leaving £600. The project invoice, studio Finances ledger, client-record Finances tab and client portal all showed the resulting state. Opening the invoice from the client record preserved its invoice ID in the URL. Desktop browser review found no console errors. The client-record finance layout was also checked at 390px without horizontal overflow.

The narrow dark sidebar uses the earlier `Calenne.` wordmark. The active item's pale vertical line is inset within the selected row and follows selection from Home to Finances; see [`docs/design-qa/calenne-selected-sidebar.png`](docs/design-qa/calenne-selected-sidebar.png). The last local production build and the normal `npm test` command passed (10/10). Temporary disk pressure briefly interrupted an earlier test attempt; the suite passed again after it cleared. The password-protected Railway preview was deployed and checked separately; see [`docs/PREVIEW_DEPLOYMENT.md`](docs/PREVIEW_DEPLOYMENT.md).

## Tasks option 2 — 1 October 2026

Reference: selected second task mock, exec-82c40f30-9916-4ecd-9c43-d0f7a5b63361.png, and dashboard handoff overview/clients/version-comparison/feedback screens. Implemented grouped compact task rows with contextual thumbnails, a selection rail on wide desktop and an overlay on narrower viewports. Kept the current palette at the user's explicit request. Role responsibility replaces fictional named staff assignment; a real project-conversation link replaces mock task comments.

Rendered browser comparison at 1440x1024 confirmed hierarchy, row spacing, group imagery, task metadata and a 350px detail rail. Focused mobile check at 390x844 found a drawer height gap; corrected to fill the viewport. Mobile list and drawer both report scrollWidth 390 and innerWidth 390. Search, grouping, completion/reopening, completed/overdue views, project task creation, private follow-up creation, priority editing, saved description/status and selected-task refresh were exercised in an isolated database. Escape dismissal passed. Added keyboard containment to the smaller-screen drawer.

Final production build passed. Test suite: 39 passed, including the new task mutation/permission/persistence test. The temporary parallel development server emitted HMR websocket errors from the competing Vite port; after shutting it down and restarting the saved server, the final saved-workspace browser reported no error logs. Saved database backed up with integrity check OK before restart; four projects retained. No deployment or live payments.

Remaining product scope: named staff task assignment, per-task comments/files and broader reference-driven page upgrades. Opportunity selection/link preservation is implemented and build-checked; its new UI association was not separately exercised end to end.

## Five-page implementation — 1 October 2026

### Scope and visual targets
Approved generated screen targets: review exec-53740438-b112-4caa-bb07-1c1620281560.png; contracts exec-19b88fcf-c217-480b-a91b-b6e5e450e4f0.png; messages exec-b92dc0c1-31f9-46a4-a186-bdb855883098.png; clients exec-8293d0d8-816c-4cdd-a9be-6c973743d2c9.png; overview exec-86fdb8c3-3f98-493d-b2ed-ba472a9653b1.png. Source images were viewed in the generation turn and by assigned implementers; rendered implementation was inspected in-browser. User explicitly changed the target palette to darker after selection. Live sample records differ from concept records; photography belongs to actual saved project content.

### Findings and correction loop
- P2: review canvas began around594px due to duplicate headings/draft/version blocks. Removed duplicate heading, combined controls and collapsed preparation. Rechecked canvas begins around375px in desktop view.
- P2: dark breadcrumb, finance totals and settings surfaces had legacy fixed colours. Added shared token overrides and visually rechecked. Existing ivory brand asset now used in settings preview.
- P2: contracts stacked overly tall headers above paper. Compressed headers/actions/metadata/zoom and removed subtitle; preserved white page and dark ink.
- P2: inbox placeholder could consume too much column width. Bounded media and checked conversation/client selection.

### Five required surfaces
Typography: original Instrument Sans,32px desktop page heading, readable list/message body. Contract paper retains its document typography. Layout: one main surface plus contextual rail; compact shared header; mobile stacks review/contracts and swaps inbox list/thread. Colour: charcoal #191a1c, surface #232427, light text and taupe controls; white documents intentional. Images: existing project assets retained, client initials separate identity from project images. Copy: real counts/roles/state only; no mock online status or fake attachment success.

### Browser evidence and functional boundaries
Isolated preview localhost4346: saved sample contract draft persisted and Fit/100% toggled; comment and reply persisted, resolved root retained reply and did not approve design. Agent verified direct-client message creation/send/reload/search and client selection. Desktop screenshots inspected for all five pages. Narrow viewport override390x844 rendered355 CSS pixels due to existing browser zoom; document scrollWidth equalled innerWidth355 across all five. Mobile conversation navigation and contract page fit inspected. Existing Finances/Settings/Tasks colour compatibility checked. During concurrent builds an obsolete lazy-chunk URL briefly failed; fresh navigation to final build loaded correctly. QA sessions initially shared127.0.0.1 cookies across ports; final QA moved to localhost to isolate cookies.

Build passed and 41 tests passed. Added backend tests exercise primary aliases, per-asset persistence, cross-version rejection, invalid reply parents and client resolution permissions. Fullscreen uses browser API and gives a visible fallback error if unavailable; browser fullscreen entry itself was not exercised. Multi-asset isolation was verified in automated tests; interactive browser review used the seeded one-asset version.

Final result: passed for the five-page layout/interaction scope with intentional dark-palette and real-data adaptation. Follow-up: document print parity and provider readiness are separate open gates; this is local verification, not deployment or production certification.

## 1 October — remaining feature integration

Light main workspace and dark sidebar retained. Verified isolated owner task assignment + comment persist after reload; message parent reply,196KB image upload/send/reload; client sees shared attachment and issued letter but not private draft; studio contributor can send into assigned project. Letter immediate type/save race found and fixed with Pagedly flush; retest retained final text. Letter archive link produced after issue. Mobile contributor chat at355CSSpx had scrollWidth355; desktop document layout inspected. Account security truthfully shows delivery setup required. Production providers not exercised.53 tests/build passed.
