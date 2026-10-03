# Shared workspace positioning

Implemented locally on 3 October 2026.

## Layout contract

- One outer gutter shared with the topbar, including Clients and Messages,
  which render outside the usual workspace body.
- Page headings start 24 px below the topbar. A short heading and description
  occupy 68 px, followed by 24 px of separation on desktop.
- Title, description and action geometry is owned by `workspace-layout.css`.
  Shared `WorkspaceHeading` includes the `workspace-page-heading` class;
  existing feature headings use the same class.
- Primary header actions align at the top right, with 40 px height, a 16 px
  icon and 8 px icon/label gap. Mobile actions use a 44 px touch target.
- Collection controls share a 48 px row and consistent separation from content.
  Long filter rows scroll within their available width; mobile project/task
  tools move to a second row rather than compressing their labels.
- Client records return to the directory through the topbar breadcrumb. Their
  identity and primary action start at the same height as project records.
- Existing colour tokens, identity, content and business behavior are retained.

## Coverage and verification

Browser checked Overview, Projects, Clients, Forms, Briefs, Approvals, Pipeline,
Tasks, Finances, Messages, Calendar, Library, Team and Settings at desktop and
mobile sizes. Titles shared the same vertical start; no document-level
horizontal overflow was observed in these checks.

Wide-screen outer edges were compared across Projects, Clients, Forms, Messages
and Finances. Collapsed sidebar checks confirmed the same heading inset in
Projects and Clients. The sidebar was restored afterward.

Client and project records were inspected, the client return breadcrumb was
exercised, and the mobile New project action opened its existing creation dialog.
The production build and whitespace check passed. The scoped design detector
reported no primary findings.

## Deliberate variants

- Long titles and descriptions grow naturally; Team's longer explanatory copy
  can increase the header height. No text is clipped to force equal height.
- Project records include two navigation levels. Client records include their
  own record tabs. Their content starts reflect these navigation levels.
- The Forms editor keeps its compact canvas header, sharing the outer gutter.
- Shared heading styling also covers the client correspondence and read-only
  staff viewer components. These roles were not separately signed into during
  this layout pass.

This is local UI verification, not a deployment or a full feature readiness audit.
