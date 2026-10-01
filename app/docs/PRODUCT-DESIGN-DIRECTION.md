# Caleane product design direction

Keep Forms inside the same product, with an independently embeddable public renderer. The studio, client relationship, brief and response history are the shared foundation. A separate form product would split the first conversation from the work it creates; a distinct Forms area and clean embed boundary provide room to package it separately later.

## Design Bible application

Use the [homepage Design Bible](../../frontpage-design/DESIGN_BIBLE.md) as the visual reference, and `src/components/workspace/WorkspaceUI.jsx` with its stylesheet as the shared control implementation. Apply its principles to workspace density rather than copying marketing headline sizes into controls.

- Reuse workspace tokens for ink, paper, rules, accents and control geometry. Avoid a separate palette for each editor.
- Keep editor panels quiet: thin borders, restrained rectangular corners and no ornamental shadows or gradients. A selection outline communicates state; visible keyboard focus remains distinct.
- Use readable labels and at least 44 px action targets in the phone layout. Give the canvas room before stacking its controls.
- Client-facing typography, photography and button-shape settings belong to the studio's configurable form. Do not overwrite saved designs to match the workspace shell.
- Keep plain text actions free of decorative link arrows.

## The shared visual language

- Instrument Sans, white and charcoal for workspace navigation and editing; warm photography and optional editorial type belong to the studio's client-facing work.
- Give the work the largest area. The form editor keeps a preview and selected-screen inspector in view, with a compact horizontal screen strip underneath. Smaller windows switch between Preview and Edit screen, rather than stacking the entire editor.
- Keep workspace actions on the existing WorkspaceButton scale and soft corner radius. Use solid primary, quieter secondary and text actions consistently. A form's customizable square / soft / pill shape affects the client form, not workspace navigation.
- Use the shared Radix controls for keyboard interaction, focus restoration, portals and consistent states. Menu layers must sit above dialogs. Reuse the primitives rather than creating page-specific dropdowns.
- Show actual content in previews and library covers. Empty content has an intentional placeholder. Avoid invented metrics or sample records in a user's real studio.
- Photography must earn its space: full page, equal split or an image above the content. Mobile becomes a considered stacked composition. Use an opaque reading surface over busy images.
- Make draft, published, paused, unsaved and loading states visible. Design changes become public only through the existing Publish action.

## Implemented in this pass

Forms library covers; canvas-first screen editing; six layouts; image fit and focal controls; content widths; button shape and finish; Radix editor controls; expanded desktop / phone preview; server validation and published response snapshots for the new design properties.

## Further product work

1. Carry the same editing arrangement into proposal and client-portal customization while preserving the existing homepage and dashboard composition.
2. Add a media library picker and authorized uploads to Forms, including focal-point cropping and image replacement, using the actual configured storage provider.
3. Add reusable branded form templates and ending-screen design, with explicit template application and no replacement of saved client answers.
4. Improve form completion with appropriate visual answer cards, accessible error summaries and clearer optional-field grouping.
5. Apply the same spacing, action hierarchy, responsive checks and empty-state quality to operations screens, one complete user journey at a time.

These are follow-on recommendations, not claims of implemented functionality. This pass changes local code and locally verified previews; it does not deploy the product or configure external storage.

## Standing interface rule

Do not add decorative link arrows, northeast arrows, or external-link glyphs to buttons, links, previews, form samples or search results. Use plain text actions and the shared button sizing. Directional controls with an actual directional function, such as calendar navigation and screen reordering, remain explicit controls. Check both the workspace development view and the built preview when changing shared presentation.

## Simple form builder structure

Typeform is the interaction reference: select a screen, change its content, design or logic, and test the result. Use Fillout-style grouping as an optional capability without adding more primary menus.

- Primary navigation is Build, Share and Responses.
- Keep the canvas and screen strip within the window. Only the selected inspector or a long client screen needs its own scroll.
- Theme and Form settings open focused Radix dialogs. Form settings uses General, Project brief, Questions, Privacy and Ending topics. The question library expands one entry on demand.
- Add screen offers a working one-question screen or a welcome/statement. Questions can be edited directly in the selected screen. Stable field IDs and saved responses are preserved.
- Logic belongs to the selected screen: when it appears, answer-based rules, and the otherwise destination. Rules show readable summaries and expand for editing. Destination choices stop at essential project/contact fields, matching server validation.
- Test from the beginning opens the interactive preview. Existing forward-only rules and publication validation remain authoritative. This does not introduce calculations, scoring or arbitrary end destinations.

References: [Typeform branching logic](https://help.typeform.com/hc/en-us/articles/360029116392-What-is-branching-logic), [Fillout form pages](https://www.fillout.com/help/form-page).
