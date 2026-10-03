# Workspace UI review — 3 October 2026

## Implemented in this pass (local)

- Top bar retains location, workspace search and notifications. Removed the Local demo/Demo preview tag, demo role switch, manual Refresh and generic New project action from this bar. Real staff permission labels remain. Login sample disclosure and sample record labels remain accurate.
- Page headings own the primary action. Projects → New project; Clients → Add client; Tasks → New task. The top bar no longer adds a project action to unrelated sections.
- Search opens with the current supported collection selected: Projects, Clients, Pipeline, Tasks or Invoices. The same dialog offers All workspace without clearing the query. Other sections currently start with All workspace; no unsupported contextual search is presented.
- Collection text filters use a shared Radix popover next to collection controls. Applied to Projects, Clients, Briefs, Approvals, Tasks, Pipeline and Finances. The filter has active state, Clear, Escape dismissal and focus restoration; it narrows visible records rather than navigating.
- Workspace search now includes project tasks as well as private CRM follow-ups. Task results open their exact detail record, including when the user is already on Tasks or has previously closed that task.
- Brief-list image placeholders now match photograph thumbnail dimensions at intermediate/mobile widths, preventing overlapping text.

## Next UI priorities

1. **Responsive client preview.** At the inspected intermediate width, Clients stacks a substantial selected-client preview below the directory. Use a compact selection summary and explicit View client, or a deliberate preview drawer with close/back behavior. Avoid a full extra profile silently stretching the list.
2. **Empty states with a next action.** Finances explains that an invoice requires a confirmed estimate but gives no direct path to choose a project. Calendar, Library and Approvals should each offer a relevant next action when genuinely useful and explain permission-limited states.
3. **Search coverage.** Global search currently indexes projects, clients, opportunities, project/CRM tasks and invoices. Forms, brief text as a separate result, design decisions, files and message contents are not universal search results yet. Add each with an authorized destination before advertising universal coverage. Keep message-thread search local to its conversation.
4. **Collection toolbar consistency.** Forms and Library retain their existing local controls; message search is a separate content operation. Continue the shared filter pattern where it matches the collection job, preserving the active Forms work in the separate chat.
5. **Language and density.** Finances uses a promotional sentence as its title while neighboring pages use section names. Brief rows give descriptions unusually large space; move toward one name, one secondary line, status and revision. Review without changing the established fonts, palette or identity.
6. **Representative content.** The same sample event photograph appears in several projects. Add distinct, clearly fictional practice-specific examples so interiors, brand and floral workflows can be assessed visually. Real projects retain their own uploads and neutral missing-image state.
7. **Provider status clarity.** The Finances footnote describes Stripe Checkout generally although live payments are deliberately disabled. Show connection/collection state where relevant; don't imply a provider is active merely because adapter code exists.

## Evidence and limits

- Production frontend build passed; focused workspace search and task HTTP tests passed in isolated databases, including scope validation and tenant/client isolation.
- Browser checks: removed top-bar controls; Projects-only vs All workspace results; collection filtering/clear; Escape; exact task navigation and reopening; Projects/Clients/Tasks/Finances/Briefs/Approvals layouts; mobile project/filter/search geometry at the browser's effective 355 CSS px width without horizontal overflow.
- Mechanical UI detector reported no findings for the primary changed surfaces. A source diff review covered the final narrow additions.
- Existing four-project local database was backed up with an integrity check before restarting the server. No saved project content was changed for QA.
- This is a local polish pass. It does not complete a platform-wide visual audit, real-user acceptance or production provider setup. No deployment was performed.
