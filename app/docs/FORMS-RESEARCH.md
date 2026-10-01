# Screen-based form builder research

Research and source inspection: 1 October 2026. Public repository snapshots were downloaded into `/private/tmp/caleane-research-*`; no dependencies were installed and none of their code was copied into Caleane.

## Product references

- [Typeform: multiple questions on a page](https://help.typeform.com/hc/en-us/articles/38099463383188-How-to-add-multiple-questions-to-a-form-page): one-question pages and multi-question pages are distinct from Question Groups. Use an explicit screen model, retain stable field IDs, and keep individual answers independently accessible in results.
- [Typeform: logic jumps](https://www.typeform.com/developers/create/logic-jumps/): conditions and routing actions are separate. Apply the first matching branch and make ordering clear.
- [Fillout: page types](https://www.fillout.com/help/page-types): separate form, cover, review and ending pages; questions can also all appear on one page. Screen content, field assignment and presentation should be independently editable.
- [Fillout: page logic](https://www.fillout.com/help/page-logic): conditional page visibility and branching are separate from field visibility. Grouped pages need conditions that read already collected answers.

## Repository evidence

| Repository snapshot | Files inspected | Pattern adopted in our own implementation | License at snapshot |
| --- | --- | --- | --- |
| [HeyForm `92aa9f4`](https://github.com/heyform/heyform/tree/92aa9f4269a8f6b61d5154d00f8a3ca11d5c5ee3) | `packages/answer-utils/src/apply-logic-to-fields.ts`, `validate-condition.ts`; theme and test file inventory | A renderer separate from the builder; forward routing; typed comparison operators; first matching branch | Root AGPL-3.0 |
| [Formbricks `f1fc4ad`](https://github.com/formbricks/formbricks/tree/f1fc4adbc38bf49615fc13db30698c056a381a60) | `packages/surveys/src/lib/logic.ts`, `apps/web/modules/survey/editor/lib/logic-destination-error.ts`; logic schema/test inventory | Block/field distinction; structured conditions; explicit missing-destination diagnostics; the same evaluation model in preview and runtime | Root AGPLv3 with named MIT packages and separate enterprise directory license |
| [SurveyJS `e4e970c`](https://github.com/surveyjs/survey-library/tree/e4e970c7a42e2620ad61bce146f63b97e3f0e33b) | `packages/survey-core/src/survey.ts`: page modes, visible pages, invisible-value clearing; page/core inventory | Questions-per-screen is presentation; derived visible paths; explicit policy for clearing answers when their questions become invisible | This form-library repository is MIT; this statement does not cover its separate Creator product |

Licenses were read from each downloaded repository's root LICENSE. These are research references, not vendored components. The custom engine, schema validator, editor and renderer use the existing React/Node stack and add no runtime package.

## Implemented acceptance boundaries

- Stable screen IDs and question IDs. Each enabled question is assigned exactly once.
- Mixed one-question and grouped screens, splitting, moving, ordering, welcome/statement screens, and fixed review/thank-you steps.
- Per-screen split/centred/stacked layout, one/two columns, image with alt text, heading/description and continue label. Global accessible accent, serif/sans heading style, background and button shape.
- Screen visibility with AND/OR groups and typed comparisons; up to six conditions. Up to four ordered branches per screen. Field visibility retains the existing earlier-choice condition editor.
- Only earlier available fields can drive screen visibility. A branch can read current-screen answers. Branches go forward, have valid destinations and cannot bypass required contact or project fields.
- Recomputed route after edits, Back through the current route, cleared irrelevant browser state, server verification and rejection of missing visible required answers. Skipped values do not influence later conditions.
- Private drafts, revision conflicts, immutable publication, old published forms without screens, version-bound opt-in tab drafts, idempotent submission, connected client/project/opportunity and original response snapshots.
- Keyboard focus, native field validation, manual required multi-select validation, mobile columns, reduced motion and embeds using the same renderer.

## Broader product checklist

The requested screen/design/logic workflow is implemented locally. The following are separate capabilities, not implied by that completion: conditional endings, answer piping, calculations/scoring, repeatable groups, richer choice/rating/signature inputs, anonymous file uploads, saved cross-device drafts, partial-submission analytics, localization, spam challenges, provider notifications, external webhooks, payment/scheduling/login pages, project follow-up questionnaires and public hosting certification. Build each against a concrete user journey; avoid adding them as empty controls. Public hosting depends on the shared backend/database/files plan already recorded in READINESS.md.
