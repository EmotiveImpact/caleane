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
