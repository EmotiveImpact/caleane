# Caleane Forms

Implemented locally on 1 October 2026. Forms is a dedicated area of the studio workspace. It shares studio ownership, client identity, project briefs and opportunities. A forms-only entry plan could use this same module later; it does not require a separate application or disconnected customer database.

The recommendation is to keep it in the same product. The value for a creative studio is the continuity from enquiry to delivery. Dubsado’s [lead capture workflow](https://help.dubsado.com/en/articles/467093-how-to-start-a-workflow-from-your-lead-capture-form) illustrates this connected model. Typeform’s [embed SDK](https://www.typeform.com/developers/embed/) and [integration model](https://help.typeform.com/hc/en-us/articles/4406628624788-How-to-connect-your-form-to-other-apps) illustrate the extra integration surface required by a separate forms product. These are product references, not dependencies.

## Studio workflow

Open **Forms** in the workspace navigation. The existing website enquiry is imported on the first visit, retaining `/intake/<studio>` and the original submission API. Historical enquiries remain in Projects; response counts cover submissions captured by the new Forms module.

- Create several named forms with stable addresses. New forms start as drafts with project fields tailored to one of the eight supported studio practices.
- Build an ordered set of screens. Choose one question per screen or multiple, split a grouped screen, move existing questions between screens, reorder screens and add welcome/statement screens. Every enabled question is assigned exactly once. Required project/contact fields and the final review remain reachable.
- Design each screen with a split, centred or stacked layout, one or two columns, image and description, and a custom continue label. Pick a form-wide minimal/editorial/warm style or customize heading style, background and button shape.
- Add screen visibility rules using AND/OR groups, choice membership, text comparisons, numbers, dates and answered/empty checks. Add ordered forward branches. First matching branch wins; invalid references, cycles and routes that skip required core fields are rejected.
- Customize the introduction, project types, optional brief fields, logo, accessible accent, step-by-step or single-page layout, button and thank-you copy.
- Add up to 24 ordered custom questions: short text, long text, single choice, multiple choices, number, date, email and web link. Choices support 2–12 options. Questions have required/optional status, help text and answer hints.
- Show a question only after a matching answer to an earlier single-choice question. Reordering, changing options or removing a parent clears an invalid dependency. Hidden answers are cleared by the server.
- Add a privacy-notice link and an optional mandatory acknowledgement. An acknowledgement is recorded with the exact submitted text; it does not create marketing consent or a contract.
- Save a private draft, preview it interactively and publish an immutable version. Saving a draft leaves the live version intact. Unsaved navigation is guarded, and stale editor revisions are rejected.
- Share a link, copy popup/inline/floating-button code, test the widget, pause/resume enquiries, duplicate a saved form or archive/restore it. Restoring a previously published form leaves it paused until explicitly resumed.
- Read paginated responses, search loaded responses by name/email/project type, open their client or project and export all responses as CSV. Exported cells are protected against spreadsheet formula interpretation.

Every successful response atomically creates the client relationship, project and Discovery opportunity. Existing contact relationships are reused through the established project-relationship logic. The project retains form provenance. The response independently retains the exact published definition, original brief, acknowledgement and version. Later project edits do not rewrite the submitted response.

## Public experience

Clients complete the form without an account, see the evaluated screen path and conditional questions, change direction using Back, review their answers in the step-by-step layout and receive an enquiry reference. Name, email and project type are required. Optional brief fields are cleared server-side when disabled by the studio. Values, choices, dates, numbers and links are checked by the server. Changing an earlier answer clears now-irrelevant answers in the browser; the server independently evaluates the published route and clears excluded fields. Conditions on skipped fields do not match. Screen exclusions are retained in the brief snapshot so later brief normalization does not incorrectly require skipped questions.

Remembering answers is opt-in, limited to the current browser tab using session storage and can be cleared. Sending clears the stored draft. Nothing is emailed or booked by a submission.

Requests use an idempotency key. An identical retry returns the original reference, including after a newer form version or a pause; reusing a key for a different submission is rejected. New submissions from an outdated form version require a reload. Legacy API clients may still supply their own free-text project type and omit a version. Previously issued legacy receipts continue to retry against the original brief snapshot.

## Installation

A published form lives at `/intake/<studio>/<form-address>`. Add the parent website’s exact origin (scheme and hostname, with port for local development) in **Settings → Connected website origins**.

```html
<script
  src="https://YOUR-WORKSPACE-ORIGIN/embed.js"
  data-studio="your-studio"
  data-form="wedding-enquiries"
  data-mode="inline"
  data-label="Begin your brief"
  data-color="#344c40"
  defer
></script>
```

Modes are `inline`, `popup` and `floating`. Inline frames resize as the client advances. Popups use a native dialog, restore focus when closed and restore the parent’s scroll state. Each script supports its own instance. Frame messages are checked against both the workspace origin and the actual iframe window.

A successful submission dispatches a bubbling `caleane:submitted` event from the widget container. Its `detail` contains only `studio`, `form` and `reference`.

## API and stored records

Owner APIs require the authenticated studio query `?studio=<id>`:

- `GET /api/forms`: list and import the existing enquiry once.
- `POST /api/forms`: create with `{slug, definition}`.
- `POST /api/forms/<id>`: `{action, revision, definition?}`; actions are save, publish, pause, resume, archive and restore.
- `GET /api/forms/<id>/responses`: 50 responses per page, `offset`, total and next offset.
- `GET /api/forms/<id>/export`: all responses as CSV.

Public APIs are `GET /api/public/<studio>/forms/<address>` and `POST /api/public/<studio>/forms/<address>/enquiries`. New submissions include `formVersion`, the core brief values, `intakeAnswers` keyed by question ID, and `consent: true` if an acknowledgement is configured. Multiple-choice values are arrays. POST requires JSON and an `Idempotency-Key` header.

Only published definitions are exposed publicly. Management, response reading and exports are owner-only, with studio checks on each lookup. Connected origins, frame-ancestor restrictions, the honeypot, bounded request sizes and the existing enquiry rate limit apply to the public routes.

SQLite tables: `enquiry_forms`, `enquiry_form_versions`, `enquiry_form_responses`. Tenant-scoped foreign keys connect responses to forms, projects and clients. All three are included in the owner studio export and whole-database backups. Archiving retains records; permanent deletion is unavailable.

## Verification and remaining scope

The expanded suite contains 68 tests. It includes focused screen-engine and HTTP cases for AND/OR conditions, skipped required answers, valid numeric sources, missing/duplicate assignments, deleted destinations, forward-only routes, required-contact protection and published design snapshots. See the current README/READINESS validation record for the latest completed run. Focused HTTP tests also cover drafts versus published versions, stale saves/submissions, conditional and multiple-choice validation, acknowledgements, retries, old API compatibility, connected clients/projects/opportunities, immutable responses, CSV, owner/client access, cross-studio access and data export.

Disposable browser checks covered creation, editing, publication, a conditional wedding enquiry, multiple-choice validation, submission, response review, project navigation, unsaved-change protection, inline resizing, popup Escape/focus return, and narrow client/builder layouts with no horizontal overflow. Provider services were not used. The sample database is separate from the saved four-project workspace, which was backed up before its local server was reloaded.

This completes the local public-enquiry widget workflow. Public workspace hosting still needs the shared database/files and server-lifecycle migration in READINESS.md; the live marketing website cannot host these widgets yet. Private follow-up questionnaires for existing projects, anonymous file-upload questions, calculations/scoring, conditional endings, answer piping, webhooks, form analytics beyond recorded response counts, automatic notifications and provider certification are outside this implementation.

## Screen model and research

Definitions may include `screens` and `theme`. Each screen has `id`, `kind` (questions/welcome), `mode` (single/group), ordered `fields`, heading/description, layout, columns, image/alt text, button label, optional `showWhen`, and ordered `jumps`. A condition is `{match: "all" | "any", rules: [{field, operator, value}]}`. A jump is `{to: screenId, when: condition}`. Core references use `core:<key>`, practice details use `detail:<key>` and custom questions keep their `q-` IDs. Screens without custom questions are supported. Legacy published definitions derive their original project/custom-question/contact grouping at render time; their stored versions are not rewritten.

`src/lib/form-flow.js` is the shared browser/server route engine. `form-screens.mjs` validates publication. `FormScreenEditor.jsx` is the owner screen/design/logic editor. See [FORMS-RESEARCH.md](FORMS-RESEARCH.md) for downloaded repository commits, inspected files, licensing and the wider feature checklist.

## Visual form studio (1 October 2026)

The screen editor now puts the client canvas between the screen outline and a separate Content / Design inspector. Use **Expand** for an interactive desktop or phone preview. The preview never writes enquiries; closing it restores keyboard focus to the Expand button.

Each screen supports Full page, Image left, Image right, Full image, Image above, and Brand split. Image left/right divide the desktop canvas equally; small canvases stack the photograph above the questions. Full image places an opaque form panel over the photograph to keep text readable. Image fit (fill / whole image), focal position and content width are saved per screen. Existing screen definitions receive compatible defaults during validation. Review uses a focused full page.

Appearance includes square, soft and pill buttons, solid or outline finish, heading style, paper/background and accent. These settings belong to the published definition and are retained in submission snapshots. Images currently use HTTP(S) URLs; the builder does not upload or crop image files. Focal position is a predefined alignment, not a pixel crop editor.

Radix Select, RadioGroup, Tabs, Switch, Checkbox and Dialog power the editing controls through the workspace primitives. The custom question editor also uses the shared Radix select and checkbox. The client form retains its native HTML inputs and browser validation. The expanded dialog stays below the shared Radix menu layer.

Validation for this pass: production build passed; 69 tests passed, including new layout/theme validation and HTTP response-snapshot checks. Browser checks covered left/right photographic splits, full-image presentation, the expanded phone preview, Radix keyboard selection, Escape focus restoration, an effective 390px public viewport without horizontal overflow, inline embedding, and an end-to-end fictional submission through a conditional path. The version 4 QA response appeared in Responses. QA used `/private/tmp/caleane-forms-browser-20261001.sqlite` on port 4326; the main workspace remained on port 4324. Main data was backed up to `data/backups/pre-form-design-20261001.sqlite` with an integrity check before its server reload. External deployment and image uploads were not part of this verification.
