# Creation dialog repair

Implemented and verified locally on 3 October 2026.

## Cause

Several Radix dialogs used `.modal` without `.modal-dialog`. The legacy `.modal` was positioned relatively because it originally lived inside a centered backdrop. Radix portals place overlay and content beside each other. Add client, New conversation, New task and Pipeline creation forms therefore appeared below the page with an automatic stacking order, covered by the fixed overlay.

## Changes

- Every `.modal[role="dialog"]` gets fixed viewport positioning, a layer above the backdrop, bounded dimensions and internal scrolling. Existing specialised dialog widths remain intact.
- The task drawer's keyboard trap pauses while New task is open.
- Successful task creation returns to All tasks and clears the text filter so the newly created task is visible.

## Verification

- Reproduced Add client before the fix: content was positioned below the viewport at y=1214, with an automatic stacking order beneath the overlay.
- Desktop browser checks: Add client, New task, New opportunity, New conversation and existing New project render above the overlay and within the viewport.
- Mobile browser checks at 355 CSS pixels: Add client and New task fit the viewport, with no page horizontal overflow.
- Keyboard focus stays in the task creation dialog when an existing task detail is open.
- Three synthetic UI tests pass for project task creation from a filtered view, private follow-up creation and failed creation retaining the draft.
- Two isolated HTTP tests pass for task persistence, collaboration and access boundaries. Temporary databases used; no browser-created test records in the user's workspace.
- Build and diff whitespace checks pass. No deployment performed.
