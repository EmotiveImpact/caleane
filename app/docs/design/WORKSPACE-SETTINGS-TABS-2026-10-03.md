# Workspace settings tabs

Implemented locally on 3 October 2026.

## Structure

- Studio: identity, portal wording, logo URL and profession, with a portal preview.
- Appearance: existing accent presets and custom colour, with an action preview.
- Website: connected origins, Forms shortcut, planner embed and direct intake link.
- Connections: existing Google/Outlook and Stripe setup/status controls.
- Data: existing exports, archiving and retention review.
- Status: existing service readiness checks.
- Members and access opens the existing Team page.

Radix tabs use manual keyboard activation. Panels remain mounted but inactive panels are hidden, so unfinished edits survive tab switches. The selected tab is reflected in the URL; provider returns open Connections.

Each identity, appearance or website save overlays only that pane's changes onto the latest saved studio record. It preserves another pane's unsaved draft and retains edits made while a save is in flight. This is necessary because the current settings endpoint replaces the complete settings record.

## Local verification

- Four synthetic tests cover independent saves, latest saved values, accent drafts, in-flight edits, callback routing and keyboard activation. No user database writes.
- All six panels inspected at desktop and 355 CSS pixels. One accessible panel at a time, no page horizontal overflow.
- Connection layout checked visually and adjusted to avoid a nested two-column Stripe layout inside a narrow column.
- Build passed; existing bundle-size advisory remains.

No deployment or provider configuration performed.
