# Pipeline: enquiries and next steps

## Implemented locally

- Replaced the large statistic strip and duplicate stage controls with a compact summary, a contextual stage filter and four Radix view choices: Needs attention, All enquiries, Board and Insights.
- Needs attention uses real open enquiries and linked private tasks. Overdue and due-today steps come first, followed by undated tasks and missing steps. Closed enquiries and unrelated client tasks are excluded.
- Lists group enquiries by stage; the board supports dragging to a stage. The drawer's Radix stage selector is the keyboard and touch alternative.
- Visible stage labels follow the studio's profession. Internal stage IDs and existing records remain unchanged. Arbitrary custom stage editing is not added.
- Currency totals keep currencies separate, exclude unknown values and describe recorded values as estimates.
- The 440px desktop drawer becomes a full-screen mobile sheet. Next steps, team responsibility and history precede project context. Editing replaces the reading pane; forecasting fields are disclosed separately.
- Follow-up suggestions fill the task draft. A title and date are required for new steps; these are private studio tasks, not calendar bookings or messages sent to clients.
- Existing member assignments appear next to steps. Edit opens the existing Tasks detail where assignment, date, discussion and attachments can be managed.
- Proposal and estimate shortcuts open the linked project. Creating a linked project preserves the client/opportunity relationship and asks for the actual project date.
- Stage changes support revision-safe Undo. Not proceeding requires a reason. Enquiry confirmation does not automatically approve a design, sign a contract or record payment.
- New enquiry creation starts with client, title and an optional brief note. Secondary commercial fields are disclosed on request.
- Mutation errors remain visible inside the active dialog; reload results are guarded against stale studio requests. Closing returns focus to the opener or page heading if its row disappeared.

## Evidence

- Production build passed; existing large-bundle advisory remains.
- Nine focused checks passed: seven pipeline experience checks plus CRM persistence/revision/tenant and malformed-input integration checks. Integration uses isolated temporary databases.
- Browser inspected local data at the normal desktop viewport and mobile override (355px effective CSS width). List, board, detail/editor and new enquiry dialog inspected. Page and mobile drawer had no horizontal overflow; board overflow is contained.
- Browser checks did not create or change workspace records. Mutation journeys are exercised in the isolated checks.

## Scope

Local implementation and preview. No push or public deployment in this change. Customer usability validation is still needed; this is not evidence from customer interviews.

## List pagination follow-up

- Needs attention and All enquiries now show 25 records per page by default, with 10/25/50 choices, Previous/Next and a visible range/total.
- Pagination slices the stage-grouped sequence, resets with search, filters, scope and view changes, and clamps the current page when results shrink.
- Page navigation returns keyboard focus to the results. Board columns and Insights are unchanged.
- Eight pipeline experience tests pass, including a 53-enquiry pagination journey checking disjoint pages, page-size/filter resets and stage grouping. Build and desktop/mobile browser checks pass.
- This paginates the displayed list. The existing API still loads the enquiry dataset for summaries, board and attention calculations; paged server fetching is not implemented here.

## Form intake and review follow-up — Done locally

- The enquiry drawer now puts “Their request” before next steps: source/form name, submitted date/version, vision, profession-specific project date/place, client budget and a disclosure of the saved original answers and consent where available.
- Published form responses remain immutable snapshots. Later brief edits do not replace those original answers. Older projects without a saved response show clearly labelled current brief details instead.
- Review is an explicit revision-protected action. Opening the drawer does not mark anything reviewed; “Mark for review” can reopen review without changing the enquiry stage. Reviewed requests stop generating the Overview/bell enquiry-review action.
- Project dates and expected decision dates are separate. New enquiry projects no longer copy the event/project date into forecasting. A guarded, idempotent correction clears only untouched automatic values; revised values or records with activities remain intact.
- “Open conversation” opens the linked project's conversation. “Start planning” requires a reviewed request and matching opportunity/project revisions; it moves the existing project into Planning without confirming the booking or changing the commercial stage.
- Projects has an Enquiries group. Unaccepted enquiry projects are excluded from Active and Overview's Work in progress, while their original IDs, briefs and client relationships remain accessible.
- Review records are tenant scoped and included in owner studio exports. An additive review table and response lookup index are used; the saved local database was backed up before the migration.

### Current evidence / remaining work

- 24 focused automated checks pass across intake, revisions, tenant access, CRM robustness, exports, attention, project grouping, pipeline interactions and calendar interactions. HTTP checks use disposable databases.
- Desktop browser inspected the existing legacy brief drawer, matching studio accent and project-scoped conversation controls. Existing local data contains no saved form responses; the original-submission and planning mutation journeys are verified in isolated HTTP and component tests, not on the user's business records.
- Current production build passes. The existing large-bundle advisory remains.
- Waiting: server-paged enquiry retrieval, persisted notification event/read history and customer usability validation. Existing list pagination bounds visible rows, not API payloads. No public deployment in this batch.
