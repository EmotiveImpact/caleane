# Calendar day details — 3 October 2026

## Done locally

- Replaced the agenda that moved below the month at narrow widths with a shared Radix day-details drawer. Clicking any day opens it immediately; day information never renders at the bottom of the month.
- Full-width month grid remains behind the 440px desktop panel. Mobile uses a full-width sheet. Compact mobile heading and controls keep the calendar higher in the page.
- Project dates and Tasks & follow-ups are grouped separately. Each item opens the exact project brief or task record, including private CRM follow-ups. Enquiry project dates are labelled tentative.
- Previous/next-day controls keep the panel open and update the displayed month when crossing a boundary. Today opens today's details; Day details reopens the selected date. Upcoming dates are disclosed inside the panel.
- Filters govern both month and panel. Loading and retryable follow-up errors are visible without hiding available project dates. Empty-state wording does not claim a clear schedule when follow-ups failed to load.
- Escape/close restores focus to the selected day; if that cell is no longer mounted after changing months, the stable Day details control is the fallback.

## Evidence

- Four component journeys pass: modal/focus return, exact project/CRM task routes, filters and month-boundary browsing, failed follow-up loading and retry.
- Desktop browser verified the real saved project task opens its exact Task details view. No tasks were edited or completed for QA.
- Mobile override 390x844 (355px effective CSS width at existing browser zoom): month and drawer have no horizontal overflow; Escape returns focus to the selected date. Override reset after checking.
- Production build passed; existing bundle-size advisory remains. This is local preview work, not a production deployment or external calendar connection.

## Scope / waiting

This calendar lists project brief dates, incomplete project tasks and private CRM task due dates. It does not create timed appointments, recurrence, resource reservations or background provider sync. Existing separate calendar-connection tooling has its own setup/acceptance requirements.
