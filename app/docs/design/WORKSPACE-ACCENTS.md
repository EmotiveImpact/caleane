# Workspace accent system

The workspace uses a white canvas, charcoal navigation, graphite text, and one studio accent. The accent belongs to the studio and can be changed in **Settings → Workspace accent**. The eight named presets are Graphite, Deep slate, Mulberry, Forest, Bronze, Indigo, Clay, and Aubergine. A custom hex colour is also available.

Use `--studio-accent` for primary actions, selected tabs and filters, focus indicators, and small active markers. Use `--studio-accent-soft` for selected surfaces and `--studio-accent-hover` for primary button hover. Keep page backgrounds, body text, separators, the sidebar, and semantic success/warning/error colours independent of the accent. Contracts and generated documents retain their own document styling.

The accent must reach 4.5:1 contrast against white because buttons and active labels may use white text or the accent itself. Settings validates custom colours before saving. The saved value is stored as `studios.accent` through the existing settings API and is applied from the app root so it reaches the main workspace and overlays.

When adding a screen, check its primary action, selected state, and focus treatment against this shared system. Older design handoffs in this folder are reference material; this document records the current colour decision.

## Shared components and local gallery

The shared React components live in `src/components/workspace/WorkspaceUI.jsx`, with control states and geometry in `workspace-ui.css`. They include actions, headings, fields, search, filters, Radix tabs, status labels, avatars, calendar date blocks, Radix dialogs and drawers, and empty states.

Open `/?view=components` on localhost to inspect them together. The gallery uses the actual inbox and project conversation components with isolated sample data, including replies, mentions, attachments, and an optional details drawer. Changes in the gallery stay in memory and do not call the workspace API. Workspace settings links to the gallery on localhost.

The owner inbox, project chat, studio status labels, and the app's existing button and heading wrappers now use this set. Other screen-specific controls still need migration before every page uses the same component source.

### Radix interactions

The shared library now uses Radix Select, Dropdown Menu, Popover, Tooltip, Checkbox, Switch, Toggle Group, Radio Group, Avatar, Alert Dialog, Tabs, and Dialog. Keep ordinary text and date inputs native. The shared wrappers define the appearance while Radix manages selection, keyboard navigation, positioning, and dismissal.

Tasks uses shared filters, completion checkboxes, and the grouping selector. Messages uses the shared conversation status selector. Workspace notifications and the sidebar account/studio switcher use shared popovers. Settings uses the studio practice selector and accent radio group. The gallery demonstrates all of these interactions with isolated sample state.

Portals read the studio theme from the document root. Controlled dialogs opened by external buttons explicitly restore focus to that opener; destructive confirmations initially focus Cancel. `test/workspace-ui.test.mjs` verifies form serialization, keyboard selection, menu dismissal, popover dismissal, focus containment/restoration, and confirmation behaviour in a synthetic DOM. It does not establish rendered browser fidelity.

### Field surfaces and focus

`workspace-controls.css` is the final shared field layer, loaded after screen styles. Text fields and selectors use a light neutral fill with no border or inset stripe. Focus uses the studio's subtle accent fill. Search and message composers have one continuous surface, with transparent inputs inside. This also covers legacy billing, project, CRM and settings forms and portalled dialogs.

The UI provider tracks Tab/arrow navigation and the workspace search shortcut. Keyboard navigation gets a visible accent outline; pointer clicks and typing after a click keep the borderless treatment. Errors retain their message and a pale error fill. Checkbox boundaries, selected sidebar markers, artwork annotations and structural dividers are separate from field styling.

The Brief stage, project stage filter, design comparison and proposal version selectors use `WorkspaceSelect`. Its chevron occupies a fixed slot inside the trigger's 12px padding, while long selected labels truncate. Radix menus are limited by both the trigger width and available viewport space; long menu labels wrap. Remaining native form selectors share the same inset chevron and reserve text space for it. Preserve disabled stage options: an approved stage can be displayed but cannot be assigned manually.

### Project image placeholders

`ProjectImage` owns the missing-image treatment through `components/project-image.css`. Page classes set the frame's size; an internal, centred content layer positions the icon and label. Image-specific `display` rules therefore cannot push the contents into a corner. Use `compact` for row thumbnails: those show only the icon. A narrow-frame container rule also hides labels below 120px, and longer cover labels are limited to two lines. Avoid page-specific placeholder alignment overrides.

### Sidebar layout

The desktop sidebar has a Collapse sidebar action above the account button. It becomes a 72px icon rail with Radix tooltips, retaining the active navigation line and the same role-based destinations. The shell width token moves the main content with it. The preference is stored locally as `caleane.sidebar.collapsed` and works across studios; a storage failure does not prevent toggling. The component gallery opts out of persistence.

Below 761px, navigation uses a Radix modal drawer with full labels, focus containment, Escape dismissal and focus restoration. The desktop preference is preserved for the return to a wider viewport. Layout motion respects reduced-motion preferences.

Remaining interaction polish from the source audit: native selectors in older forms, and browser confirmation dialogs in `TaskWorkspace`, `DesignReview` and `StudioMembers`. These still need migration to the shared Radix controls; this sidebar change does not complete that migration.
