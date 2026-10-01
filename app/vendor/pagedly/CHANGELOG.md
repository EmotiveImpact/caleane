# Changelog

## HRLETTER vendor patches (re-apply on upstream refresh)

- **2026-07-05 (c) — full suggestion-mark metadata round-trips.** Added
  `data-author-id`, `data-body`, `data-created-at`, `data-suggestion` to the
  same four allowlists so the reviewer's identity, rationale note and
  timestamp survive an author page-edit (previously the first review-mode
  persist silently dropped them from the marks).

- **2026-07-05 (b) — suggestion marks survive the LETTER pipeline too.** The
  2026-07-05 patch covered sanitize.ts only; the letter build path has its own
  allowlists in `letter/sourceHtml.ts` (`SAVED_DATA_ATTRS` + the
  `sanitizePagedLetterHtml` ALLOWED_ATTR/ADD_ATTR/ADD_URI_SAFE_ATTR trio) whose
  post-sanitize `stripDisallowedDataAttributes` pass was still removing
  `data-suggestion-id/-kind/data-status/data-author` from `<ins>/<del>` —
  leaving a bare `<ins class>` on the page (tag kept, identity lost, so the
  host's redline CSS/author chip never applied). Added the four attrs to all
  four lists in the SOURCE and rebuilt. This was the actual "no visual redline
  on the review page" root cause.

- **2026-07-05 — inline suggestion marks preserved (invest).** Rebuilt from
  pagedly source (v1.1.0, ~/pagedly-codebase) with `data-suggestion-id`,
  `data-suggestion-kind`, `data-status`, `data-author` added to the sanitizer's
  EDITOR_DATA_ATTRS allowlist, so the HOST app's `<ins>/<del>` review redlines
  round-trip through paginate/reconstruct + render on the page (styled by the
  app's global `ins[data-suggestion-id]` CSS). The 2026-07-03 base64 hardening
  (FQ-03) was re-applied IN THE SOURCE (sanitize.ts EDITOR_URI_REGEXP + the
  data-url scheme test; letter/sourceHtml.ts isSafeImageRef) so this rebuild
  keeps it. Source + vendor are now in sync at 1.1.0.

- **2026-07-03 — base64 image-validator hardening (audit FQ-03).** Both dist
  bundles patched in-place: the whitespace-tolerant data-URL payload class
  `[a-z0-9+/=\s]+` now requires a leading real base64 char
  (`[a-z0-9+/=][a-z0-9+/=\s]*`), and the three prefix-only gates
  (`ALLOWED_URI_REGEXP` ×2 + one inline `;base64,` test) require at least one
  payload char so a bare/empty `data:image/png;base64,` no longer passes.
  Matches the host app's `isSafeImageDataUrl` discipline (R9/R13).

## Unreleased (dev)

DOCX round-trip fidelity + editing-UX polish. Builds on the import-fidelity work
(run/paragraph formatting, spacing, indentation, source page geometry, inline
images, hyperlinks, numbering.xml lists, document-default typing baseline).

### DOCX

- **Export now mirrors import.** `htmlToDocx` was the weak side of the round-trip
  (only b/i/u/strike + lists + tables); it now emits run-level font-size/color/
  background/font (`w:sz`/`w:color`/`w:shd`/`w:rFonts`), paragraph alignment +
  spacing + indentation (`w:jc`/`w:spacing`/`w:ind`, with the hanging-indent
  inversion matching the importer), hyperlinks (`w:hyperlink` + external rels),
  embedded data-URL images (`word/media` + inline `w:drawing`), table `gridSpan`,
  and the source page geometry as the exported `sectPr`. Verified by 6 export→
  import round-trip tests (the importer checks the exporter).

### Editing UX

- **Inline pickers replace `window.prompt`.** Cross-reference (heading list),
  footnote text, AI tone/translate, and image alt now use caret-anchored
  popovers (keyboard-navigable list picker + autofocus input picker) instead of
  the blocking browser prompt; both restore the original selection before acting.
- **Find options.** Match-case (`Aa`), whole-word (`W`), and regex (`.*`) toggles
  in the find bar, matching Docs/VS Code; a single global RegExp drives match
  collection with an invalid-pattern guard.
- **Suggesting mode tracks paste and drop.** Pasted/dropped text lands as a
  tracked `<ins>` (replaced selections are `<del>`-wrapped, reject restores the
  original exactly); previously pastes bypassed tracking entirely. Enter/IME
  remain documented limitations (structural change the text-level model can't
  represent).

- **Document-metrics persistence API.** New `documentMetrics` prop +
  `onDocumentMetricsChange` callback (forwarded by LetterEditor): hosts can
  store the page geometry + typing baseline a DOCX import adopted and seed
  them back on the next mount, so a saved document re-opens with the same
  page setup.

### Security

- **Dropped HTML is sanitized.** Dropping `text/html` previously inserted via
  the browser default, bypassing the sanitizer (the sibling of the fixed
  paste-XSS path) — a dropped `<img onerror>` executed. Drops now route through
  `sanitizeEditorHtml`.

### Guards

196 smoke checks (synthetic DOCX import fixture; cross-ref picker; find options;
suggesting paste/drop; drop sanitization), 260 unit (incl. 6 DOCX round-trip), 7 undo-redo. Locked `incremental == full`
reflow invariant untouched.

## 1.1.0 — 2026-05-28

Scale & performance release. The contentEditable pagination engine was
overhauled so very large documents edit, load, and paste without freezing — from
a multi-minute freeze (or tab crash) on big documents to smooth past 1000 pages.
**No public API removals and no output change:** final pagination is
byte-identical to 1.0.0, verified by a locked `incremental == full reflow` guard.
This release is purely faster, plus a higher page cap and two tuning props.

### Performance

- **Incremental, windowed re-pagination.** Editing re-paginates only a bounded
  window of pages around the caret instead of walking the whole document on every
  keystroke; the remainder settles in browser idle time. End-of-document typing in
  a 200-page document is ~6ms regardless of length.
- **Windowed initial load / `setHTML` / `reflow`.** A one-shot load paginates a
  budget of pages synchronously, then drains the rest cooperatively in idle time.
  Loading ~200 pages dropped from a ~6s main-thread freeze to ~150ms synchronous
  plus a background settle that never blocks interaction.
- **O(n) bulk pre-distribute.** A massively over-full page (a big paste or load
  dumped into one page) is sliced into roughly page-sized pages in a single linear
  pass before the word-level split — removing the O(n²) blow-up that previously
  froze the tab for ~2 minutes on a ~100-page paste (and could crash it).
- **Whole-block fast path in the forward split.** The split now moves a block
  whole in one height measurement when it would move entirely anyway, word-
  splitting only the single block that straddles a page boundary. ~9× fewer layout
  measurements at scale (≈90k → ≈10k when loading 3,600 paragraphs); total
  load-and-settle main-thread work fell from a ~6s freeze to ~300ms.
- **Chunked paste.** A large paste is inserted in chunks across animation frames,
  so pasting ~130 pages streams in with no single main-thread task ≥50ms (was a
  ~2s freeze). Normal-size pastes are unchanged (single insert).
- **Cooperative idle drain.** Background settling of a large document runs only
  when the main thread is idle, in small slices, so it never preempts scrolling or
  typing.
- **Debounced `onChange`.** Host notification is coalesced so a burst of typing
  pays one document serialize instead of one per keystroke.

### Added

- **`changeDebounceMs`** prop — tune the `onChange` coalescing window.
- **`reflowDelayMs`** is now actually applied (wired to the reflow/onChange
  debounce); it was previously inert.

### Changed

- **Maximum page count raised from 200 to 5000.** Documents are no longer capped
  at 200 pages.

### Notes

- Verified at scale: 1000-page documents scroll at ~60fps with ~38MB heap and no
  main-thread scroll stalls. Viewport virtualization was evaluated and
  deliberately **not** built — it offers no benefit for pagination and none for
  scroll/memory at realistic sizes. Full investigation and per-fix detail in
  `docs/internal/BUGS_AND_FIXES.md`.

## 1.0.0 — 2026-05-28

First stable commercial release. Rebranded to **Pagedly**, narrowed to a
single shipping engine, hardened the editing surface, and added the
feature set needed for real document editing. This is a **breaking**
release — import names and CSS class names changed.

### Breaking

- **Package renamed** `paged-html-editor` → `pagedly`. Build output is now
  `dist/pagedly.js` / `dist/pagedly.umd.cjs` / `dist/index.css`. Install via
  the tarball (`npm install ./pagedly-X.Y.Z.tgz`); not on the public npm
  registry. `package.json` is `private: true` (distribution is via polar.sh).
- **Components renamed** (the `Paged` prefix is gone — the namespace comes
  from the `pagedly` import path):
  - `PagedEditor` → `Editor`
  - `PagedLetterEditor` → `LetterEditor`
  - `PagedContentEditableEditor` → `ContentEditableEditor`
  - `PagedEditorToolbar` → `Toolbar`
- **Types renamed** likewise: `PagedHtmlEditorHandle` → `EditorHandle`,
  `PagedHtmlEditorProps` → `EditorProps`, `PagedEditorCommand` →
  `EditorCommand`, `PagedLetterDraft` → `LetterDraft`, etc. The old names
  remain as `@deprecated` aliases for one cycle.
- **CSS class prefix** `phe-*` → `pagedly-*` across the public DOM. Custom
  styles targeting `.phe-…` must update to `.pagedly-…`.
- **Single engine.** The legacy / pageNode / flow engines were retired to
  `src/_archive/` (not bundled, not exported). The `engine` prop is now
  ignored (kept on the type as `@deprecated`). The contentEditable +
  DOM-surgery engine is the only one shipped.
- **License** changed from MIT to the **Pagedly Commercial License v1.0**
  (see `LICENSE`). Third-party OSS attribution stays in
  `THIRD_PARTY_NOTICES.md`.

### Added

- **Toolbar — block style:** a one-click **Paragraph** button plus a
  **Heading** dropdown (H1/H2/H3) that shows the active level, and a
  **Quote** (blockquote) toggle.
- **Toolbar — type & colour:** **Font family** picker with 4 system stacks +
  14 OFL-licensed Google Fonts (lazy-loaded via `<link>` on first use),
  **Text colour** and **Highlight colour** pickers (20 / 12 swatches).
- **Toolbar — Print** button (`window.print()` against the paged CSS),
  alongside the existing Download-as-PDF.
- **Find: highlight all matches** at once (CSS Custom Highlight API), live as
  you type, active match distinguished; cleared on close.
- **Insert table** — the picker now inserts a real
  `<table class="pagedly-table">`; `table-layout: fixed` keeps columns stable
  while typing; **columns and rows are drag-resizable** (drag a cell border).
- **Insert image** — file-picker insert that **downscales** large images
  (≤1600px, JPEG q0.85) so phone photos don't lag the editor; inserted images
  are **click-to-select and drag-to-resize** (aspect-preserved).
- **Manual page break** — toolbar sentinel that forces a new sheet in print
  and shows a dashed "Page break" marker on screen.
- **Undo / redo** now covers structural operations (table insert, block
  merges, image insert/resize, sanitised paste) via an engine-owned snapshot
  stack — not just typing. Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z (and Ctrl+Y).

### Fixed

- **Backspace / Delete at block boundaries** rewritten for stability:
  boundary detection now measures text (robust to placeholder `<br>` and
  element-level carets); empty-line deletion no longer pushes the caret to a
  blank line; mid-line backspace never merges whole blocks; same-section
  merges restore the caret at the seam; cross-section merges are a deliberate
  no-op (they previously destabilised the caret via the section round-trip).
- **Multi-section delete** preserves every `<template data-section-anchor>` so
  section attribution survives a cross-section selection delete.
- **Paste from Word / Google Docs** sanitiser hardened: strips Office
  namespaced tags, HTML comments, `lang`/`dir`/etc. attributes, and Docs's
  bold-everything wrapper.
- **Table picker** cells were invisible (portaled outside the CSS-variable
  scope) — fixed with literal colour fallbacks.
- Toolbar "More options" row stays open until dismissed; removed the
  double-grey band between toolbar and desk.

### Internal

- `docs/internal/BUGS_AND_FIXES.md` — reference log of every fix (symptom →
  root cause → commit → regression guard); now mandatory to keep current.
- `scripts/smoke-test-all.mjs` — 58-check Playwright smoke suite covering the
  full toolbar + editing surface, run on demand.

---

## 0.14.0 — 2026-05-23

### Added — ce engine (Architecture F) is production-ready

The contentEditable + DOM-surgery engine ported from
[vue-document-editor](https://github.com/motla/vue-document-editor)
is now feature-complete and the recommended engine for new projects.
Opt in by passing `engine="ce"` to `PagedLetterEditor`, or use
`PagedContentEditableEditor` directly.

Highlights since v0.13.2:

- **Word/Docs-style word-level reflow** at page boundaries. One
  Backspace at the start of page 2 deletes one char from page 1's
  tail and, when geometry allows, migrates the next word back from
  page 2 to fill the freed space. If the migrated word would
  overflow, the engine rolls back the migration and lets the
  boundary stick for that keystroke — same behavior as Word.
- **Find / replace** via Cmd-F. In-document panel, Enter advances,
  Replace swaps and advances, Escape closes. Cross-browser (Safari
  parity confirmed via Playwright).
- **Font size toolbar** via Range API (not `execCommand` — the
  latter produced mid-text breakage on Safari). Selection is frozen
  on mousedown so the Radix dropdown's focus shift doesn't drop the
  selection. Works on Chromium + WebKit.
- **Print / PDF export** via browser print dialog. On `beforeprint`,
  the engine injects letterhead (page 1), signature image (last
  page, above signature section), and any attached evidence
  (after content). On `afterprint`, all injected chrome is removed.
- **`sanitizeHtml` prop** on the ce adapter — every `onChange`
  emission runs through the host-provided sanitizer before reaching
  the host's state.
- **Cmd+A + Backspace preserves section anchor templates** on both
  Chromium and WebKit (Safari's native handler used to wipe every
  child of the page, including `<template data-section-anchor>`
  markers the letter editor relies on for section attribution).
- **Built-in paste sanitizer** strips `style` / `class` / `id` /
  `data-*` from pasted HTML. Kills Chrome's "select all + copy +
  paste makes text bigger" regression (Chrome bakes computed
  font-size into pasted spans).

Quality / hygiene:

- **Real Playwright e2e suite** at `tests/e2e/*.spec.ts`, replacing
  ~50 ad-hoc `*.mjs` scripts. Runs on Chromium + WebKit headless
  for every commit. 28 tests, ~1m 30s.
- **Char-conservation contract** for boundary Backspace verified in
  CI: a single Backspace at start of page 2 deletes exactly one
  user-visible char (innerText delta = 1) and preserves the
  opening/body/signature template order.
- Repo cleanup: deleted ~50 root-level `debug-*.mjs` / `test-*.mjs`
  / `diag*.mjs` scripts; moved internal docs (CLAUDE_*,
  PAGINATION_NOTES, PRD) to `docs/internal/`.
- README rewritten to lead with the ce engine and document the
  engine landscape.

## 0.13.2 — 2026-05-22

### Fixed — pageNode Backspace at boundary moves chars Word-style

Backspace at the continuation boundary now takes the previous letter
AND takes back the next one — the bidirectional char migration that
makes the boundary feel like Word's. Combined with the v0.13.0
char-level reflow, this completes the boundary feel for the pageNode
engine.

## 0.13.1 — 2026-05-22

### Fixed — pageNode Backspace + Delete at continuation boundary

- Backspace at continuation boundary deletes the char (was jumping
  the cursor backward without deleting).
- Delete at end of continuation does join + resplit (was a cursor
  jump only).
- Last page sizes to content with an A4 cap so the visual feedback
  on every keystroke is correct. (Reverted in 0.13.2 — half-page
  card looked broken; full A4 height restored.)

## 0.13.0 — 2026-05-22

### Added — pageNode char-level reflow in BOTH directions

Character-level merge in the pageNode engine: content now flows
back UP across page boundaries, not just down. Backspace at the
start of a continuation paragraph joins it with the previous page's
tail and re-splits at the new boundary.

Also: Delete at end of continuation mirrors Backspace
(`9da3493`).

## 0.12.0 — 2026-05-21

### Changed — pageNode engine is the production default

The pageNode engine (Architecture D — real `<page>` ProseMirror
nodes) becomes the production default after a comprehensive
real-Chrome stress test pass. Visual treatment matches
vue-document-editor.

### Fixed during the bake

- Mismatched-tx error when mid-split fired its own transaction —
  don't dispatch the outer tx after.
- Non-continuation Backspace/Delete falls through to PM default.
- Killed `scrollIntoView` on cross-page Backspace/Delete (eliminated
  the scroll jump).
- `overflow-anchor: none` cascaded everywhere — actually kills the
  scroll-jump flashing in real usage.

## 0.11.2 — 2026-05-21

### Fixed — PagedFlowEditor visual fixes

Pages now render at full A4 height (visual was broken in 0.11.1).

## 0.11.1 — 2026-05-21

### Fixed — click-in-gap + Backspace near widget bugs

- Click-in-gap bottom-half off-by-one — `spec.pos` not `+1`.
- Backspace/Delete now bridges the gap (cursor was stuck).

## 0.11.0 — 2026-05-21

### Added — production-ready PagedFlowEditor (Architecture E)

Margin-aware cumulative height, print CSS, initial-paint sync,
oversized-block fallback, aria, clipboard. Smart click-in-gap UX
routes the cursor to the closer side of the page boundary.

## 0.10.1 — 2026-05-21

### Fixed — Architecture E now matches tiptap-pagination-plus quality

A pass on `PagedFlowEditor` based on a research dossier comparing
the proven open-source pagination implementations (tiptap-pagination-plus,
tiptap-pages, tiptap-extension-pagination, ProseMirror forum threads).

- **Reverse-reflow fix.** `findInBlockSplitPosition` returned the PM
  position one less than required, displacing the boundary character
  by one and cascading backward each subsequent recompute. Deleting a
  letter in the heading shifted page-2 content the WRONG way.
- **Multi-page cascade.** A single paragraph spanning 3+ pages
  previously got only the first page break. Now finds every boundary
  the block crosses (verified to 6 pages with an 18 000-char
  paragraph; intervals all within 20 px of perfect).
- **Convergence loop.** Recompute runs up to 6 passes after every
  transaction. Pass 1 measures in a no-widget DOM; later passes see
  the just-dispatched widgets and refine boundaries. Idempotent.
- **IME safety.** Compositions are gated — `compositionstart` flag
  suppresses re-pagination until `compositionend`, preventing
  candidate-window corruption on CJK keyboards.
- **Font + viewport responsiveness.** `document.fonts.ready` and a
  ResizeObserver on the editor DOM trigger reflow when text metrics
  change post-load or the content width changes on a resize.
- **Stable widget keys.** Keys are now `pageIndex`-based rather than
  `pos`-based; ProseMirror reuses the same widget DOM element across
  edits instead of destroying and recreating it on every keystroke
  (Marijn-recommended pattern from the PM forum).
- **No blank-frame flicker.** Recompute is synchronous inside the
  view `update()` hook; there is no ~16 ms gap between an edit and
  the widget re-appearing at its new position.
- **Edge-to-edge gap.** The grey desk band spans the full A4 width
  (was a narrow strip with white margins).
- **Selection highlight suppressed across gap.** Drag-selecting from
  page 1 to page 2 no longer paints a giant blue rectangle across
  the desk area.

End-to-end test: 10 successive backspaces in the heading × 5 page
boundaries = 0 drift on any boundary. Forward direction also correct
— adding 100 chars to "Dear Alex" pushes the cascade backward through
the doc by the expected number of characters.

## 0.10.0 — 2026-05-21

### Added — Architecture E: flat-doc + widget-driven pagination (`PagedFlowEditor`)

A new editor architecture that achieves Word/Docs-style character-level
reflow by making pagination a **render concern**, not a document
concern. The document schema is flat (`doc > block*`, StarterKit's
default — no `Page` nodes). Pagination is handled by a ProseMirror
plugin that walks blocks, measures cumulative heights, and inserts
widget decorations at page boundaries.

Two kinds of widgets:

- **`before`** — placed BEFORE a block that doesn't fit on the
  current page. The block moves whole to the next page. Same
  behaviour as the D-engine's whole-block move, but the doc never
  restructures.
- **`inside`** — placed INSIDE a textblock at the exact character
  whose visible line bottom reaches the page content edge. The
  paragraph visually splits across two pages while remaining ONE
  node in the doc. **This is what unlocks character-level reflow.**

Each widget renders three stacked bands so the continuous editor
surface looks like discrete A4 page cards:

1. White card-bottom band (dynamic height — fills remaining of
   page N + 95 px padding-bottom).
2. Grey desk band (48 px).
3. White card-top band (95 px padding-top of page N+1).

Every [content + widget] section is exactly 1171 px = A4 height
(1123 px) + desk gap (48 px). All cards render at full A4 dimensions
regardless of content fullness.

The split-position finder uses `Range.getBoundingClientRect` (binary
search), so the boundary character is found regardless of viewport
visibility — no reliance on `caretPositionFromPoint` which fails
off-screen.

Public API:

```ts
import { PagedFlowEditor, FlowPaginationExtensions } from "paged-html-editor";

// Drop-in component
<PagedFlowEditor html={html} onChange={setHtml} />

// Or assemble manually
const editor = useEditor({
  extensions: [
    ...FlowPaginationExtensions(),
    StarterKit,
    // ...your other extensions
  ],
});
```

The flow engine ships **side-by-side** with the existing engines.
`PagedEditor` (default `pageNode`), `PagedEditorLegacy` (v0.5), and
`PagedNodeEditor` (D-architecture) are all unchanged. Once the flow
engine ships feature parity (cursor crossing, selection, find,
header/footer), it will become the default in a future release.

### Known polish items (deferred)

- Inline gap widget's negative horizontal margin causes a thin
  horizontal scroll on some layouts — needs a different way to
  bleed the desk colour edge-to-edge.
- Cursor arrow-key crossing the gap untested.
- Selection range across the boundary untested.
- Page count not yet exposed via the toolbar handle for the flow
  engine.

## 0.9.0 — 2026-05-20

### Changed — `PagedTiptapEditor` renamed to `PagedEditor`

The TipTap library is an implementation detail, not part of our
public API. Renamed the public components accordingly:

- `PagedTiptapEditor` → `PagedEditor`
- `PagedTiptapEditorLegacy` → `PagedEditorLegacy`
- `src/PagedTiptapEditor.tsx` → `src/PagedEditor.tsx`
- `src/PagedTiptapEditorLegacy.tsx` → `src/PagedEditorLegacy.tsx`
- `tests/acceptance/tiptap.test.tsx` → `tests/acceptance/editor.test.tsx`

**Deprecated aliases are exported for one release cycle** —
`PagedTiptapEditor` and `PagedTiptapEditorLegacy` still work as
re-exports of the new names. They will be removed in 1.0.0.

The `@tiptap/*` package imports inside the codebase are unchanged —
TipTap is still the underlying ProseMirror wrapper we use. The
rename only affects the public component names.

## 0.8.2 — 2026-05-20

### Fixed — runaway split/merge oscillation

0.8.0 and 0.8.1 attempted character-level reflow via auto-merge in
the under-fill pass paired with mid-split on overflow. In practice
the two operations are inverse: every mid-split set
`phePagContinues: true` on the first half, the next reflow merged
them back, the page overflowed again, mid-split fired again, and the
split position drifted by a character or two each cycle — producing
hundreds of tiny per-character paragraphs all marked as
continuations.

This release **disables both auto-merges** (the marker-based merge
and the aggressive fallback). Mid-split on overflow is kept — it's
the essential primitive for paragraphs taller than a page. Deletion
flow reverts to block-level: when the user deletes content and frees
a whole block's worth of space, the multi-pull pass moves the next
whole block back; smaller deletions don't visually reflow until
enough space accumulates.

True Word/Docs-style character-level reflow needs a different
mechanism (NodeView that renders one logical block across two page
cards without restructuring the document). That's deferred to a
later release.

The `phePagContinues` attribute and `ContinuationAttribute`
extension remain in place — they'll be the foundation when the
virtual-rendering NodeView lands.

### Fixed — mid-split now moves second half to next page in ONE transaction

Earlier the mid-split dispatched a separate transaction that split
the overflowing block but left the second half on the same page,
relying on the next reflow's whole-block move to push it onward.
That worked when there were no other concerns, but combined with
the runaway merge it produced 40+ tiny fragments per page.

Now mid-split builds a single transaction that:

1. Replaces the overflowing block with its first half (marker = true),
2. Builds a Fragment of [secondHalfNode, ...childrenAfter] and
   inserts it at the start of the next page (creating a new page if
   this was the last).

Exactly one mid-split per overflow. Reflow count drops from ~114 to
3-5 for typical content.

### Fixed — split position uses Range.getBoundingClientRect

`caretPositionFromPoint` returns `null` for off-screen Y values — so
split position lookup failed silently when the page boundary was
below the visible viewport. Replaced with a binary search using
`Range.getBoundingClientRect`, which works regardless of viewport
visibility because it queries layout positions, not paint.

## 0.8.1 — 2026-05-20

### Changed — aggressive merge fallback delivers character flow on user-typed paragraphs

The 0.8.0 character-level reflow only worked for paragraphs the
pagination plugin itself had split. For paragraphs the user typed
independently (separated by Enter), deleting characters on page 1
did not pull content from page 2 because the safe-merge logic
required a `phePagContinues: true` marker — which only our own
mid-split sets.

This release adds an **aggressive merge fallback**: in the under-fill
pass, when no whole block from the next page fits in the freed
space AND page A's last child + page B's first child are the same
type+attrs (excluding the marker), the two are merged without
requiring the marker. The overflow pass then mid-splits at the
new line boundary on the next reflow, delivering the same
character-by-character flow the user expects from Word/Docs.

The fallback only fires when whole-block multi-pull found nothing
that fit — so for content where paragraphs are smaller than the
page (the common case), the aggressive merge stays out of the way.

**Trade-off, documented as a known consequence:** when the
aggressive merge fires, two structurally distinct paragraphs become
one paragraph in the document model. The user's intentional
paragraph break is consumed. This matches Word's behaviour — Word's
internal model treats adjacent paragraphs as one continuous text
stream and the paragraph break is just a character that gets
absorbed during reflow. Hosts that need to preserve strict
paragraph structure should use `engine="legacy"` (the v0.5 engine)
or insert a heading / list / blockquote between paragraphs so the
two blocks aren't the same type+attrs and the merge refuses.

### Changed — under-fill free-space threshold lowered from 40 px to 2 px

The 40 px threshold was a perf shortcut to avoid running multi-pull
when only a tiny gap existed. It prevented the new aggressive-merge
fallback from firing on small (single-character) deletions, which
is exactly when it's most useful. Threshold is now 2 px (just a
rounding tolerance) so character-level deletes always feed the
under-fill pass.

## 0.8.0 — 2026-05-20

### Added — Word/Docs-style character-level reflow across page boundaries

When the user types in a paragraph that grows past the page boundary,
or deletes characters from a paragraph that previously overflowed,
content now flows **character by character** between pages — exactly
the Word "Print Layout" / Google Docs behaviour. Previously content
moved between pages in whole-block chunks.

Three coordinated changes ship in this release:

1. **`ContinuationAttribute`** (new extension, registered globally
   on `paragraph` and `heading`) — adds a `phePagContinues` boolean
   attribute that records "this block was split mid-text by the
   pagination engine and continues on the next page." Rendered as
   `data-phe-pag-continues="true"` so CSS can target it.

2. **Mid-paragraph split in the overflow pass** — when a textblock
   is the only child of its page and overflows the content area,
   the pagination plugin now finds the exact character position at
   the page boundary using `document.caretPositionFromPoint`
   (with `caretRangeFromPoint` fallback for older WebKit/Chrome),
   splits the block there via `tr.split()`, and marks the first
   half with `phePagContinues: true`. The next reflow pass moves
   the second half onto the next page via the normal whole-block
   move path. Tables, lists, images and other non-textblock content
   still fall back to the v0.6 clipped-via-overflow-hidden behaviour
   (with `data-oversized-child="true"` set on the page for hosts to
   style if they want).

3. **Safe re-merge in the under-fill pass** — before checking whether
   to pull whole blocks back, the plugin now looks for adjacent
   page A's last child + page B's first child where:
   - page A's last child has `phePagContinues: true`, AND
   - both blocks are the same type with matching attributes
     (excluding `phePagContinues` itself).

   When that pattern is found, the two blocks are merged into
   page A's last child (page B's first child's content is appended;
   the original is removed). The merged block inherits page B's
   first child's `phePagContinues` value, supporting cascading
   continuations across many pages. The overflow pass then mid-
   splits at the new character boundary on the following reflow.

Together: deleting one character on page 1 frees ~16 px → under-fill
merges the marked split halves → page 1 overflows by ~16 px → mid-
split shaves one character off and drops it to page 2. The user sees
content shift by exactly one character across the entire document.

`canMergeBlocks` returns false when types differ or any non-marker
attribute mismatches — so two paragraphs the user typed independently
(both have `phePagContinues: false`) are never merged.

### Added — under-fill pulls all fitting blocks in one transaction

Previously the under-fill pass moved one block per reflow tick — so
when the user freed up enough space for several blocks at once, those
blocks "popped" onto the previous page over multiple frames. Now
under-fill measures every child of the next page upfront, greedily
collects as many leading children as will fit in the available free
space, and moves them all in a single insert+delete transaction. Doc
order preserved; selection inside any moved block is re-placed at the
corresponding offset in the inserted fragment.

### Added — under-fill diagnostic logging

Behind `window.__phePagDebug = true` in the browser console — logs
every under-fill candidate's measurement and the reason it was or
wasn't pulled. Off by default; zero overhead in normal use.

### Fixed — cross-boundary keymap no longer fires from inside nested wrappers

The 0.7.1 `PageBoundaryKeymap` fired any time the cursor satisfied
"parentOffset 0 AND index-in-page 0", which incorrectly fired for
cursors inside list items / blockquotes / table cells that happened
to sit at the very start of the page's first child. Tightened to
require `$from.depth === pageDepth + 1` — i.e. the cursor must be
in a textblock that is a *direct* child of the page node. Inside
those wrappers Backspace now correctly does its default thing (lift
bullet, exit blockquote, leave cell).

## 0.7.1 — 2026-05-20

### Fixed — cursor stranded across page boundary after backspace

Two related bugs in the page-node engine caused the cursor to get
stuck at a page boundary after the user deleted content and the
pagination plugin's under-fill pass pulled blocks back. Symptoms
were: "I can see an empty line on page 2 but typing goes to page 3"
and "holding backspace doesn't move past one fixed point."

**Fix 1 — under-fill preserves selection (`paginationPlugin.ts`).**
The under-fill pass builds two transaction steps to move a block from
the start of page N+1 to the end of page N: `insert(copy)` followed
by `delete(original)`. ProseMirror's default mapping treats these as
unrelated steps, so a cursor inside the moved block fell through the
delete and landed at the start of page N+1's NEW first child — i.e.
the user thought they were on page 2 but their cursor was actually on
page 3. The fix captures the user's in-block offset BEFORE the
transaction and explicitly re-places the selection inside the
inserted copy after both steps land.

**Fix 2 — Backspace / Delete / arrow keys cross page boundaries
(`PageBoundaryKeymap.ts`, new).** Under the `doc > page+ > block*`
schema, ProseMirror's default Backspace at the start of the first
child of page N+1 would try to join across the page boundary and
fail silently (the structural transform isn't legal). The new
extension installs handlers that detect "cursor at start of first
child of a non-first page" (and the symmetric "end of last child of
a non-last page" for Delete / ArrowRight / ArrowDown), and explicitly
jumps the cursor across the boundary into the adjacent page.

Cursor jumps are dispatched as normal transactions and land in the
undo history, so Cmd-Z behaves naturally.

The PageBoundaryKeymap extension runs at `priority: 1000` so it wins
over StarterKit's default Backspace / arrow commands.

## 0.7.0 — 2026-05-20

### Changed — `PagedTiptapEditor` defaults to the page-node engine

`PagedTiptapEditor` is now a thin router on a new `engine` prop:

```ts
<PagedTiptapEditor engine="pageNode" />  // default since 0.7.0
<PagedTiptapEditor engine="legacy"   />  // opt back to v0.5 engine
```

- `engine="pageNode"` (default): renders via the v0.6 D-architecture —
  real ProseMirror `Page` nodes with `overflow: hidden` page DOM. The
  underlying implementation is `PagedNodeEditor`, exposed through a
  thin adapter so the public `PagedHtmlEditorHandle` ref contract is
  unchanged for callers.
- `engine="legacy"`: renders via the v0.5 engine (widget decorations +
  gap-mask CSS), now exported as `PagedTiptapEditorLegacy` for hosts
  that prefer to pin the import directly.

The legacy implementation is **kept in-tree** as
`src/PagedTiptapEditorLegacy.tsx` and exported from the package
(`PagedTiptapEditorLegacy`). Hosts that hit a regression on the new
engine can opt back by setting `engine="legacy"` or by swapping the
import — `git revert HEAD` also cleanly restores the v0.6.0 default.

`PagedLetterEditor` pins `engine="legacy"` internally because it
depends on features the page-node engine does not yet implement:

- per-page header/footer chrome (`pageHeaderHtml` / `pageFooterHtml`)
- `sanitizeHtml` on every emit
- `viewMode="preview"` paged.js preview surface
- `actionsRef` find/replace integration

When these features land on the page-node engine, `PagedLetterEditor`
will flip its internal pin and the gap will close.

### Added — feature parity in `PagedNodeEditor.runCommand`

- `runCommand("insertTable", JSON.stringify({ rows, cols, header }))`
  inserts a real `<table>` via TipTap's table extension, matching the
  legacy engine's command protocol.
- `runCommand("createLink", "example.com")` now normalises bare hosts
  to `https://example.com` (was a leak from the v0.5 engine that this
  release closes).

### Added — `PagedNodeEditorHandle` extends `PagedHtmlEditorHandle`

The outer handle returned by `PagedNodeEditor` is now a superset of
`PagedHtmlEditorHandle` — it exposes `getState()`, `subscribe()`,
`runCommand()`, `insertHtml()`, `insertImage()`, plus the existing
`getEditor()`. This makes the page-node editor a true drop-in for
host code that was holding a `PagedHtmlEditorHandle` ref to the
legacy editor.

> Note: `flush()` on `PagedNodeEditorHandle` changed from `() => string`
> (v0.6.0) to `() => Promise<string>` (v0.7.0) to match the canonical
> handle shape. Callers should `await` the result.

## 0.6.0 — 2026-05-20

### Added — D-architecture: real page nodes (no more decorations)

`PagedNodeEditor` ships as a new, opt-in editor component that takes a
fundamentally different approach to pagination than `PagedTiptapEditor`
(v0.5):

- The document schema is now `doc > page+ > block*`. Each page is a
  real ProseMirror `Page` node, rendered as `<div class="phe-page-node">`
  with `overflow: hidden` and a fixed A4 footprint (794×1123px).
- A new `PaginationPlugin` (`src/paged/pageNode/paginationPlugin.ts`)
  measures each page after every transaction and dispatches a single
  bundled transaction that moves whole trailing blocks onto a new page
  (creating one if needed). When a page under-fills, it pulls leading
  blocks back from the next page; empty trailing pages are removed.
- The bleed problem from v0.5 is solved structurally — `overflow:
  hidden` on the real page DOM makes content visually incapable of
  escaping its page card, with no gap-mask layer required.
- One source of truth (one editor), so undo/redo, paste, find/replace,
  selection, and toolbar commands work via the existing ProseMirror
  transaction system — no per-page coordinator.

Public exports (in `index.ts`):

```ts
export { PagedNodeEditor } from "./PagedNodeEditor";
export type { PagedNodeEditorHandle, PagedNodeEditorProps } from "./PagedNodeEditor";
export { PageNodeExtensions, Page as PageNode, PagedDocument } from "./paged/pageNode";
```

`PagedTiptapEditor`, `PagedLetterEditor`, and `PagedHtmlEditor` are
unchanged so existing hosts keep working. Phase 7 (next release) will
flip `PagedTiptapEditor` to use the D-architecture under the hood.

### Fixed during D-Phase 8 code review

- **Empty-page nodeSize math** (`paginationPlugin.ts`): the empty-page
  cleanup now re-resolves both ends through `transaction.mapping.map`
  rather than relying on pre-tx arithmetic, so it's robust to mapping
  fixups beyond the single child removal.
- **Overflow tolerance mismatch**: aligned the per-child overflow
  threshold (`A4.marginTop + target + 2`) with the page-level overflow
  detection threshold (`scroll - client < 2`). Previously a 1px gap
  could detect overflow but find no child to move — a potential
  infinite-pass risk.
- **`useEditor` deps**: `PagedNodeEditor` now captures `extensions` in
  a ref alongside the initial-HTML ref. The editor is only rebuilt
  when `readOnly` changes, so placeholder or onChange identity changes
  from the parent no longer destroy pagination state / undo history.
- **Oversized single block**: when one block is taller than the page
  content area, the page is now flagged with `data-oversized-child` on
  the DOM and a one-time console warning is emitted (so hosts can style
  a warning band). Previously the bleed was clipped silently.

## 0.5.9 — 2026-05-18

### Fixed — pagination convergence past page 1

The 0.5.7 "count margins via offsetTop" fix worked for page 1 but BROKE page 2+. Root cause: the plugin used `block.offsetTop` to compute cumulative — but `offsetTop` SHIFTS by +238 every time a widget is inserted. Each measurement cycle the plugin saw new positions, emitted a different break, ProseMirror re-rendered, layout shifted again, ad infinitum. The break for page 2 kept moving DOWN 238px each cycle until it landed past the page boundary.

Rewrote the measurement to be **position-independent**:

```ts
for each top-level block:
  contribution = block.offsetHeight + parseFloat(getComputedStyle(block).marginBottom)
  if (cumulative + contribution > target):
    break before this block
    cumulative = contribution  // this block starts the next page
  else:
    cumulative += contribution
```

No `offsetTop`. No `pageContentTop`. Just sum block heights + their bottom margins, reset cumulative at each break. The result is idempotent: same DOM → same breaks → no oscillation.

**Verified across 5 pages with 80 pasted paragraphs**: zero overflow on any page. Every page's last block sits cleanly inside its card boundary. Grey gaps are empty.

## 0.5.8 — 2026-05-18

### Fixed — PageCards subdividing at narrow viewports

PageCards' `pushSubdivided` fallback (which splits the trailing region into A4-sized cards when content can't be split by the engine) was running at narrow viewports too. Result: at 600px viewport you'd see 4 A4 cards stacked, with most of each card outside the viewport.

Now matches the pagination plugin's `pageWidth - 32` guard: at narrow viewports, PageCards renders a SINGLE card covering the full editor (no subdivision). The host CSS shows the editor as a continuous scrollable surface, which is the correct rendering when there isn't room for the A4 page card.

## 0.5.7 — 2026-05-18

### Fixed — text no longer bleeds into the grey gap between pages

Two stacked fixes give the editor a real Word/Docs visual contract: text stops at the page boundary.

**1. Pagination measurement now counts margins** (`src/paged/livePagination/plugin.ts`)

The plugin used to sum `offsetHeight` of each block to decide where to break. But paragraphs have CSS `margin: 0 0 0.6em` (~9px) between them — these margins push the next block's offsetTop down but don't appear in `offsetHeight`. So 22 paragraphs counted as 22×42=924px (under the 933px page-content target) actually took 22×~50=1100px on screen — pushing 3-4 paragraphs past the page boundary into the grey gap.

Rewrote the plugin to compute cumulative as `(block.offsetTop + block.offsetHeight) - pageContentTop`. That naturally includes inter-block margins. Page breaks now fire at the correct block — the last block on each page fits within the page's content area (95–1028px on A4).

**2. Gap masks above content** (`src/paged/PageCards.tsx` + `default.css`)

Added a second layer of grey rectangles painted on top of the editor content (z-index 5), covering the visible desk strip between consecutive cards plus the trailing area below the last card. If any text DOES overflow the page card (e.g. a single paragraph too tall for one page that can't be split), the mask visually clips it instead of letting it bleed onto the desk. Word-style appearance: text never visible in the gap.

Tested with 60 pasted paragraphs across 4 pages — content stays cleanly inside each page card; grey gaps are empty.

## 0.5.6 — 2026-05-18

### Fixed — pagination runaway at narrow viewports

When the editor's rendered width was less than its A4 page width (794 px), paragraph text wrapped to one-word-per-line, every block reported a huge `offsetHeight`, and the pagination plugin emitted a break before EVERY block — a "runaway widget" that filled the document with `.phe-pagebreak` decorations.

Added a min-width guard in `src/paged/livePagination/plugin.ts`. Below `pageWidth - 32` the plugin skips pagination entirely (the host's CSS is showing the editor as a continuous scrollable surface, which is the correct rendering when there isn't room for the A4 page card).

### Fixed — PageCards never rendered (stuck at 0 cards)

The PageCards overlay (the white "paper sheet" backgrounds) wasn't rendering any cards, even when pagination had emitted multiple breaks. Two stacked bugs in `src/paged/PageCards.tsx`:

1. **rAF-cancellation starvation.** The measure function used a `cancelAnimationFrame(rafRef.current); rafRef.current = requestAnimationFrame(...)` pattern. Rapid React re-renders (HMR / repeated useLayoutEffect runs) cancelled each rAF before it could fire. The rAF never reached its callback, cards never measured. Replaced with a "skip if already scheduled" pattern; later removed rAF entirely in favour of synchronous measurement + observer-driven re-measure.

2. **Transient-detach wipe.** During React HMR the OLD `editorEl` reference is briefly still in the DOM tree but with 0 dimensions. The measure ran with `editorH=0`, computed `rects=[]`, and called `setPages([])` — wiping any previously-rendered cards. Added a 0-height guard with a 50ms retry so the layer recovers when the editor catches up.

### Verified clean on fresh load

Tested: fresh dev server + fresh browser tab → 1 content copy, 1 card, 8 children. The "4× duplicate content" the user saw earlier was an HMR-accumulation artifact in dev mode, not a real bug. Production / fresh-load is correct.

## 0.5.5 — 2026-05-18

### Changed — toolbar layout tweaks (per user request)

- **Insert table** moved from the primary row to the secondary (More) row. Tables are an occasional action — bullet/numbered lists are still on the primary.
- **More (•••)** button moved to AFTER undo/redo. Primary row now ends `… link, image, undo, redo, •••`. Cleaner reading order: editing actions → history → overflow.

Two acceptance tests (`tests/editor.test.tsx`, `tests/acceptance/formatting.test.tsx`) updated to open the More menu first before clicking Insert table.

## 0.5.4 — 2026-05-18

### Fixed — paste duplicates content (root cause: stale section ids)

The `SectionMarker` TipTap extension declares `data-section-id` as a global attribute on every block. When a user copied a paragraph from one section (e.g. "opening") and pasted it elsewhere in the document, the pasted block kept its **stale** `data-section-id="opening"`. On the next render, `splitBySection` walked the editor HTML, saw the opening-id block at the end, and routed it BACK into the opening section — while it still lived at the cursor location. `buildPagedLetterEditorHtml` then re-emitted BOTH copies. Each paste cycle amplified the duplication; users could end up with four copies of the demo letter stacked on top of each other.

**Two layers of defence:**

1. `src/PagedTiptapEditor.tsx` — added `editorProps.transformPastedHTML` calling a new `stripSectionAttributes()` helper that removes `data-section-id` and `data-section-anchor` from clipboard HTML before TipTap parses it.
2. `src/letter/sourceHtml.ts` — hardened `splitBySection`: once a section is flushed, blocks carrying that section id are ignored (left in the current section) unless an explicit anchor re-opens it.

Regression test added in `tests/editor.test.tsx`. Test count: 119 → 120.

### Investigated — "huge text" perception NOT a bug

User reported text rendering at 24–28px. Agent reproduced and measured: body text at 845px viewport is **12.675px**, H2 is **17.745px** — exactly what `clamp(11.5px, 1.5vw, 14px)` should produce. The visual "huge" text in the screenshot was the duplicated content rendered with H1/H2 formatting accidentally applied (the user had headings on the bottom duplicate). With the paste-dup fix above, the symptom goes away.

## 0.5.3 — 2026-05-18

### Fixed — widget was being placed INSIDE paragraphs (invalid HTML)

The 0.5.0 pagination plugin used `view.posAtDOM(child, 0, -1)` to find break positions. But that returns the position INSIDE the child paragraph at offset 0 — so my `Decoration.widget` was rendering as `<div>` INSIDE a `<p>` (invalid HTML, and cursor couldn't cleanly cross the break).

Rewrote `doMeasure` to walk the doc structure directly via `view.state.doc.forEach((node, offset) => …)`. For each top-level doc node, `offset` is the position BEFORE that node (between paragraphs). We then call `view.nodeDOM(offset)` to get the corresponding DOM element for height measurement.

Result: widgets are now direct children of `.ProseMirror`, between paragraphs, valid HTML. The cursor can navigate through breaks naturally.

## 0.5.2 — 2026-05-18

### Major — proper page margins on EVERY page

The 0.5.0 / 0.5.1 page surface was flush — content went edge-to-edge of the page card with no Word-like top/bottom/left/right margin. This release fixes that.

**1. First-page margins.** Added `padding: 95px 76px` + `box-sizing: border-box` to the ProseMirror element. The first page now shows content positioned inside an A4 margin frame (95px ≈ 1 inch top/bottom, 76px ≈ 0.8 inch sides).

**2. Per-page margins on page 2+.** This was the harder one. The previous break widget was 48px (visible desk gap only). Pages 2, 3, 4… had no visible top margin — content started right after the gap. Fixed by making the break widget **238px tall = 95 (page-bottom margin of upper page) + 48 (visible desk) + 95 (page-top margin of lower page)**. The break widget is transparent; the PageCards layer (white "paper") covers the first 95px and the last 95px of the widget, so visually those 95px regions read as the page chrome (white margins inside the page card) and only the middle 48px shows as desk.

**3. PageCards positioning rewritten.** Every card is now exactly A4-sized (1123×794). Card N's top is computed: `card1 = 0; cardN>1 = breaks[N-1].top + 143` (where 143 = 95 page-bottom + 48 visible desk). This guarantees consistent page surface dimensions regardless of how content packs.

**4. `geometry.ts` now also exports `visibleGapHeight`** (48) separately from `gapHeight` (238) so the visible desk strip stays constant while the structural break widget can carry the per-page chrome bands.

### Verified

- 80-paragraph paste → 7 breaks emitted, 8 page cards rendered, each 1123 tall.
- Multi-page screenshot shows page 1 ending with bottom margin, visible desk gap, page 2 starting with top margin — exactly Word Print Layout.
- Responsive viewport (500×800) still works — page shrinks to fit, fonts clamp, toolbar wraps to two rows.
- All 119 acceptance + engine tests still pass.

## 0.5.1 — 2026-05-18

### Fixed — page card now visibly stands on the desk

The 0.5.0 canvas background (`#e5e7eb`) matched the typical host body colour exactly, so the page card had no surrounding contrast — it just blended into the page. Darkened the canvas to `#d1d5db` (Tailwind gray-300) so the white sheet visibly lifts off the desk again, matching the 0.2.4 paper-on-desk look.

## 0.5.0 — 2026-05-18

### Major — in-house pagination engine

Replaced `tiptap-pagination-plus` with our own ProseMirror plugin. The third-party dependency is gone from `package.json`.

**New module layout: `src/paged/livePagination/`**

```
src/paged/livePagination/
  index.ts        — public Extension factory + types + LIVE_PAGINATION_CANVAS_CLASS
  plugin.ts       — the ProseMirror Plugin (measurement + state + decorations)
  geometry.ts     — A4 page geometry constants (page height/width/margins/gap)
```

**How it works:**

1. `plugin.ts` exports `createLivePaginationPlugin(geometry)`.
2. On every editor view update (and on `ResizeObserver` fires on the canvas), the plugin walks the editor's direct DOM children, accumulating their `offsetHeight`s.
3. When the cumulative height would exceed `geometry.contentHeight` (933px for A4 at 96 DPI), the plugin records a `PageBreak { pos, y }` for the position immediately before the overflowing child.
4. The plugin dispatches a transaction with the new break list as a meta (only when the break list has actually changed, to avoid infinite loops).
5. The plugin's `decorations` prop maps each break to a `Decoration.widget` at `pos`, rendered as `<div class="phe-pagebreak" contenteditable="false">` with `height: 48px` (the desk gap).
6. CSS styles `.phe-pagebreak` as a transparent strip — the desk canvas behind shows through, creating the visible "two pages meeting on a desk" look.
7. `PageCards.tsx` (the white-paper overlay) queries `.phe-pagebreak` to find break Y coordinates and renders one white card per page section. Same architecture as before, just reading from our own widgets instead of the third-party's `.rm-pagination-gap`.

**Why this matters:**

- **No third-party engine to fight.** The Safari giant-caret IFC bleed bug had no clean workaround through CSS — the engine's `inline-flex` chrome elements leaked into the IFC of body paragraphs. With our plugin we choose the widget element style (`display: block; line-height: 0; font-size: 0`) so no IFC leak exists.
- **Smaller bundle.** Dropped 5 KB gzipped (235 KB → 230 KB).
- **Clear ownership.** All pagination logic lives in three small files we own. Easy to extend (different page sizes, page-break-before/after rules, header/footer chrome) without touching another library.

### Internal: cleaned up `default.css`

Removed all the `.rm-page-header / .rm-page-footer / .rm-pages-wrapper / .rm-pagination-gap / .rm-with-pagination` selectors — they referenced classes that the third-party engine emitted and we no longer have. The Safari caret CSS workaround comments stay as documentation of what we tried.

### Test infra

All 119 acceptance + engine tests still pass. The plugin uses `setTimeout`-based debouncing (not `requestAnimationFrame`) so it works in jsdom-only test envs and in headless preview tools.

### Migration / Compatibility

The public API is unchanged:

- `createLivePaginationExtension(options)` — same signature.
- `LIVE_PAGINATION_CANVAS_CLASS` — same value.
- `PagedTiptapEditor` / `PagedLetterEditor` props — unchanged.

If you were targeting the `.rm-pagination-gap` CSS class in custom styles, switch to `.phe-pagebreak`.

## 0.4.1 — 2026-05-18

### Added — Radix Popover for link + table dialogs

Finishes the deferred items from 0.4.0. Both popovers are now anchored to their trigger buttons via `@radix-ui/react-popover` instead of being free-floating absolute-positioned divs.

What this buys:

- **Auto-positioning** — Radix figures out whether to render below (default) or flip above based on viewport edge.
- **Focus trap + return** — opening focuses the input; closing returns focus to the trigger.
- **Outside-click + Escape dismissal** — handled internally by Radix Popover, no longer needs the document-level `pointerdown` handler we wrote in 0.3.3.
- **Arrow tail** — small visual arrow pointing at the trigger button.
- **Slide-in animation** — 140ms cubic-bezier entry, matches the toolbar feel.

The 0.3.3 outside-click `pointerdown` handler is now scoped to just the More-menu row (since Radix handles its own popovers).

## 0.4.0 — 2026-05-18

### Added — Radix UI primitives

Toolbar widgets now use Radix UI for proper accessibility, focus management, and behaviour the old custom components couldn't deliver.

- **FontSize dropdown** swapped from native `<select>` → `Radix Select`. Fixes the **"works once then doesn't work again"** bug. The native `<select>` stole focus when opened, collapsing the editor's text selection — so the second click had a collapsed cursor and `setFontSize` no-op'd. Radix Select uses an internal portal/listbox without ripping focus from the editor, so the selection survives the entire interaction.
- **Tooltips on every toolbar button** — small black tooltips with a 400ms hover delay and 150ms skip-delay between adjacent buttons. Replaces the native `title` attribute (which had no styling control and inconsistent delays across browsers).
- **All toolbar buttons** wrapped in `Radix Tooltip.Trigger` so they get proper hover + focus tooltip behaviour with arrows and animation.

### Dependencies added

- `@radix-ui/react-dropdown-menu` ^2.1
- `@radix-ui/react-popover` ^1.1
- `@radix-ui/react-select` ^2.2
- `@radix-ui/react-tooltip` ^1.2
- `@radix-ui/react-toolbar` ^1.1

(Bundle: +20 KB gzipped — within budget for the UX upgrade.)

### Test infrastructure

Radix uses pointer-capture APIs (`hasPointerCapture` / `setPointerCapture` / `releasePointerCapture`) and `DOMRect.fromRect` for positioning, neither of which jsdom implements. Added stubs to `tests/setup.ts` so all 119 acceptance + engine tests still pass.

### Known: link / table popovers

These two custom popovers remain non-Radix for now. They work fine via the existing outside-click dismiss handler from 0.3.3. Will move them to Radix Popover in a follow-up if there's demand — the primary "works once" bug fix is already shipped.

## 0.3.7 — 2026-05-18

### Fixed — fonts adjust again on narrow viewports

The 0.3.6 `zoom`-everything approach scaled fonts uniformly with the page, so at 425px viewport a 14px body font rendered as 7px visually. Unreadable.

Reverted the zoom; replaced with:

- **Page card width is responsive** — `width: min(794px, 100%)` — full A4 on wide viewports, shrinks to viewport width on narrow ones.
- **Fonts scale INDEPENDENTLY via `clamp()`** so they stay readable even when the page card is at 320px wide. Body: `clamp(11.5px, 1.5vw, 14px)`. Headings proportional.

At 1400px: body 14px (Word default 11pt), page at 794px centered.
At 425px: body ~11.5px (still readable), page fills viewport.
At 320px: body 11.5px (min), page fills viewport.

## 0.3.6 — 2026-05-18

### Removed — per-page header/footer chrome (default OFF)

Per-page letterhead chrome ("Demo Ltd / Confidential — warning" header + "Page N" footer) is no longer rendered by default. The `pageHeaderHtml` / `pageFooterHtml` props remain on the public API — hosts that want letterhead can still pass them through `PagedTiptapEditor` or `PagedLetterEditor`. Default footer string in `livePagination.ts` changed from `"Page {page}"` to `""`.

**Why:** the engine-injected chrome is the trigger for the Safari giant-caret WebKit bug (caret on first line of page 2 stretches up through the chrome). Removing the chrome from the default rendering eliminates the bug for everyone who doesn't explicitly opt in.

**Re-enabling:** pass header/footer HTML through the editor props. Example in [README.md](README.md).

### Changed — truly A4-responsive page card

The page card now uses CSS `zoom` to proportionally scale the entire stack on narrow viewports — width, height, font sizes, margins, paragraph spacing, line height all shrink together. The page maintains its A4 proportions at every viewport size.

- `>=850px viewport`: page renders at full A4 (794×1123 px, 14px body, 24/19/16/14 px headings).
- `425px viewport`: page renders at half-A4 (zoom: 0.5). All elements proportional.
- `320px viewport`: page renders at ~38% A4. Still readable.

The CSS `zoom` property shrinks layout space (unlike `transform: scale()` which leaves a phantom box), so there's no overflow / scroll artefact. Layout-wise the page is still 794px so the underlying pagination engine paginates at exactly the right A4 break points.

The per-element `clamp()` font sizing introduced earlier is replaced by fixed pixel sizes — they now scale automatically via the parent `zoom`.

### Known issue — Safari giant caret (deferred)

The Safari/WebKit caret bug (when chrome is enabled) is fundamentally caused by the single-ProseMirror-element architecture: the engine's chrome lives inside the ProseMirror, and WebKit's caret-height calculation in the IFC of the containing block reaches up through the widget chrome into the caret's line-box. CSS workarounds either fight the engine's internal float layout (breaks chrome) or break the float-clearing of subsequent paragraphs (text collapses into a 1-character-wide column).

The proper fix requires replacing the pagination engine so each page is a truly separate DOM element. That's the next major architectural change — tracking as item for v0.4.

## 0.3.5 — 2026-05-18

### Fixed — Safari giant caret on first line after a page boundary (proper fix)

The 0.3.4 attempt set `caret-color` only, which changed the caret colour but not its height — Safari was still drawing a ~200px tall bar from the previous page's footer down through the gap and onto the new page's first line.

A specialist agent diagnosed the actual root cause: the engine sets `.rm-page-header` and `.rm-page-footer` to `display: inline-flex`. Safari computes caret height from the inline-formatting context (IFC) of the caret's containing block, and inline-level descendants of a non-isolated widget leak their height into the IFC of the surrounding paragraph.

Two-layer fix:

1. **Force the chrome to `display: flex`** (block-level) — `.rm-page-header`, `.rm-page-footer`. They no longer participate in the paragraph's IFC.
2. **Add `isolation: isolate` + `contain: layout style` + explicit `line-height: 1.5`** on every direct body block (`p`, `h1-h4`, `ul`, `ol`) inside the editable ProseMirror. Each block becomes a fresh formatting context that Safari can't leak across.

The earlier attempt (Fix A from the agent) added `display: block; contain: layout style` to `.rm-pages-wrapper` itself — that broke the engine's widget layout (the chrome started stacking visibly as 21,729px of content). Reverted; only the per-paragraph isolation + chrome `display: flex` is needed.

References: [WebKit bug 225695](https://bugs.webkit.org/show_bug.cgi?id=225695), [ProseMirror Issue #1069](https://github.com/ProseMirror/prosemirror/issues/1069), [ProseMirror discuss — caret and widget decorations](https://discuss.prosemirror.net/t/caret-and-widget-decorations/897).

## 0.3.4 — 2026-05-18

Four user-reported bugs fixed.

### Fixed — font-size dropdown "works once then stops"

When the user opened the native `<select>`, focus moved off the editor and collapsed its selection. By the time `onChange` fired the range we wanted to apply font-size to was gone, so the second use silently no-op'd. Fix: PagedTiptapEditor now stashes the last NON-collapsed selection in a ref (`lastValidRangeRef`) on every `onSelectionUpdate`. The `setFontSize` command checks for a collapsed current selection and restores the stashed range before applying.

### Fixed — Safari renders giant black caret on first line of page 2

Safari sizes the caret to the tallest element on the current line. The engine's header chrome above page 2 has its own line-height which leaks into the first line's baseline calc on WebKit, producing a chunky black bar. Fixed by pinning `caret-color: #2563eb` on `.ProseMirror` + inheriting it to all inline children, so Safari uses a 1px coloured caret instead.

### Fixed — toolbar cascaded to 4 rows at 320px viewport

The toolbar had 17+ buttons all visible; at 320px each row could hold 4-5 so it cascaded to 4 lines. The fix is a two-step responsive cascade keyed off the toolbar container:

- **≤ 480px:** icons shrink 30 → 26 px, gaps tighten 4 → 2 px, the **alignment group** is hidden (still available via the More menu).
- **≤ 380px:** icons shrink to 24 px, the **headings group** also hides (still in More).

At a 320px viewport the toolbar is now Bold/Italic/Underline + Font Size + Lists + Link/Image/Table + More + Undo/Redo on two clean rows, with alignment and headings tucked into the More menu.

### Fixed — reverse selection over-selects entire paragraph

Dragging a text selection upward across a page boundary swept through the engine's `contenteditable=false` chrome (page-break gap, page header). The browser's selection logic expanded to the nearest editable ancestor, swallowing whole paragraphs. Fix: `user-select: none` on the gap + header + footer chrome so the drag path skips over them cleanly.

## 0.3.3 — 2026-05-18

The "B until icons get tight, then smart C" toolbar pass + bug-hunt fixes.

### Changed — toolbar matches page width with smart wrap

- Toolbar visually aligns with the page surface: `width: min(794px, 100%)`, centred. On a 1400px viewport the toolbar is 794px wide (same as the A4 page card below it). On a 1024px viewport, same. On viewports narrower than 794px, the toolbar shrinks WITH the page.
- One line at desktop widths. Below the 720px breakpoint, the row wraps to a second (or third) line instead of horizontally scrolling — every button stays visible without truncation. The history group's `margin-left: auto` is dropped at narrow widths so undo/redo don't push themselves onto their own line.

### Fixed — bugs from the bug-hunt agent

- **C1 Critical — oversized blocks no longer render as one giant card.** When the engine can't insert a page break inside content (e.g., an image taller than A4), the trailing region is now subdivided into A4-sized cards with 48px synthetic gaps between them. The visual contract — "every white sheet is one A4 page" — holds in all cases.
- **H1 High — page header / footer chrome hidden below 540px viewport.** The third-party engine uses float-based layout for the header which collapses (left and right halves overlap, header height balloons) at very narrow widths. Hide it entirely below the point where it can no longer fit two columns.
- **M1 Medium — More menu / link popover / table popover now close on outside-click.** A single `pointerdown` listener on `document` dismisses all three when the user clicks anywhere outside the toolbar.
- **M2 Medium — PageCards skips state updates when layout unchanged.** Added a deep-equal check before `setPages` and stored the last emitted layout in a ref. Stops the N-extra-reconciliations-per-keystroke regression introduced by 0.3.1.
- **M3 Medium — FontSizeSelect now renders the active font-size even when not in the preset list.** Pasting content with `font-size: 15px` (or any other non-preset size) used to silently fall back to the "Size" placeholder. Now the active value is added as an option so the select reflects reality.

### Known issues (deferred to next release)

- M4 — Test coverage for FontSize / PageCards / More menu is still zero. Will be added in 0.3.4.
- L1, L2 — minor edge cases in `textContentMatches` and `editor.view.dom` ref handling.

## 0.3.2 — 2026-05-18

### Fixed — responsive page width on narrow viewports

The 0.3.1 stack was fixed at 794px (A4) width which on narrow browser windows caused content to bleed off the visible area. The stack now uses `width: min(794px, 100%)` and the ProseMirror inside fills it — so on viewports ≥ 794px the page renders at full A4 width, and on narrower viewports it shrinks gracefully with content wrapping to fit. Vertical pagination still happens at A4 page heights.

## 0.3.1 — 2026-05-18

### Changed — real separate page cards (not a styled gap inside a slab)

User feedback: even with the previous gap fixes, the editor was still ONE white slab with shadows painted between pages. They wanted truly distinct pages.

This release switches to that model:

- The `.ProseMirror` element is now **transparent** — no white background, no shadow.
- A new `PageCards` React component (`src/paged/PageCards.tsx`) renders **one real `<div class="phe-page-card">` per logical page**, sitting in a layer BEHIND the editable content (`z-index: 0`).
- Each card has its own white background + paper-on-desk shadow stack.
- Card positions track the engine's chosen page-break Y coords by measuring `.rm-pagination-gap` elements via a `ResizeObserver` + `MutationObserver`.
- The engine's own gap is now fully transparent — the desk shows through naturally between cards.

What the user sees: 2+ separate white A4 sheets stacked vertically, each with its own drop shadow, with grey desk visible in the 48px gap between them. Typing, selection, cursor placement, paste, formatting — all unchanged (they go through the single ProseMirror above).

## 0.3.0 — 2026-05-18

### Fixed — page boundary now reads as two real sheets on a desk

The 0.2.6 page-break still painted a gradient strip INSIDE the white slab — alpha values let the white show through and it looked like a styled band on a page, not the space between two sheets.

This release commits fully:

- Gap is painted **opaque desk colour** (`#e5e7eb` — exact match to the canvas), so when the user looks at it they see "the desk peeking between two sheets".
- Inset `box-shadow` at the top + bottom of the gap (`rgba(15, 23, 42, 0.35)` 14/18 bleed) simulate **per-page drop shadows** falling from the upper page and rising from the lower page — exactly the effect of two physical sheets resting on a desk.
- Gap height stays at 48px (set in `livePagination.ts`) so the visual layers have room to breathe.

### Added — font-size selector

- New `FontSize` TipTap extension (`src/paged/fontSize.ts`) — adds a `fontSize` attribute to TextStyle marks so any inline range can have its own size. Renders as `<span style="font-size: …">`.
- New `runCommand("setFontSize", "14px")` — pass any CSS length string, or `""` / `null` to unset.
- Toolbar gets a **font-size dropdown** with 17 common Word sizes (8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72).
- Toolbar state surfaces `fontSize` so external toolbars stay in sync.

### Changed — toolbar split into Primary + "More options"

The toolbar got cluttered as we added page break / find / PDF / sub-sup / etc. 0.3.0 splits it into two rows:

**Primary (always visible)**: Bold • Italic • Underline | Size | ¶ H1 H2 H3 | • 1. | ←  ↔  → ↕ | 🔗 image table | ⋯ More | undo redo

**Secondary (behind "More options" toggle)**: Strikethrough • Superscript • Subscript • Clear formatting | Remove link • HR • Page break | Find • Download PDF

The secondary row only mounts to the DOM when open — keeps the visual surface area minimal.

### Test coverage

- 3 existing tests updated to click "More options" before asserting on now-secondary controls.
- All 119 tests pass.

## 0.2.6 — 2026-05-18

### Fixed — page-boundary gap now reads as two physical sheets

The 0.2.5 gap was a flat 32px strip — visually it looked like a band painted INSIDE the page, not the space between two pages. Pagination-plus stamps inline styles on the gap element which were defeating my CSS rules.

This release rebuilds the gap visual:

- **Gap width raised 32px → 48px** (in `livePagination.ts` `pageGap`) so each visual layer has room to breathe.
- **Multi-stop linear gradient** painted on the gap, top-to-bottom:
  - `0px`  — 1px sharp dark line (bottom edge of upper page, the "paper edge")
  - `1–6px` — soft drop shadow falling off the upper page
  - `12px–(end-12px)` — flat `#d1d5db` desk recess
  - `(end-6px)–(end-1px)` — soft drop shadow rising under the lower page
  - `end` — 1px sharp dark line (top edge of lower page)
- **Higher specificity selector** (`.rm-pagination-gap[style]`) plus `!important` so my gradient defeats the engine's inline `background-color`.
- **Border and inline `box-shadow` from the engine forced off** to keep the gradient clean.

Net effect: when content flows from page 1 to page 2 the boundary now visibly reads as **paper-edge → desk → paper-edge**, exactly like flipping between two sheets in a stack.

## 0.2.5 — 2026-05-18

### Fixed — canvas / body colour mismatch

The 0.2.4 desk was `#dde0e3` but most host apps' body is `#e5e7eb` (Tailwind gray-200) — slightly lighter. Wherever the canvas didn't fully cover the viewport (above the toolbar, below the document end), the lighter body bled through and read as a dark vertical band on whichever side the user was looking at. Aligning both to `#e5e7eb` eliminates the band; the desk is now perfectly uniform with any sensible host background.

Gutter between sheets shifted from `#cfd3d8` → `#d4d7dc` to keep its "slight recess" feel against the new (lighter) desk.

### Docs

- README: added a "Per-page header and footer (letterhead)" section explaining the chrome is **opt-in** — only appears when the host passes `pageHeaderHtml` / `pageFooterHtml`. Shows how to suppress page numbers entirely.
- Demo `App.tsx`: added a comment making clear that the visible "Demo Ltd / Confidential / Page N" chrome comes from props the demo sets, not the editor defaults.

## 0.2.4 — 2026-05-18

### Changed — desk colour + document typography

- **Desk is now a uniform lighter grey** (`#dde0e3`) — replaces the 0.2.2 gradient that read as "lighter at top, darker immediately" on small windows. The gradient was over-engineering; flat is calmer.
- **Inter-page gutter** raised to `#cfd3d8` so it still reads as a slight recess between sheets without being a dark stripe.
- **Default in-page typography** rewritten to look like a Word business document:
  - Body: 14px Calibri / 1.5 line-height (≈ Word's 11pt default)
  - H1: 24px (≈ 18pt), H2: 19px (≈ 14pt), H3: 16px (≈ 12pt), H4: 14px
  - Paragraph spacing tightened from `1em` browser default to `0.6em`
  - Lists indented from 1.6em (was browser default 2.5em — too wide for narrow A4 columns)
- Page dimensions confirmed true A4: 794×1126 px = 210mm × 297mm at 96 DPI.

## 0.2.3 — 2026-05-18

### Fixed

- Removed the blue focus ring that appeared around the page card when the editor was focused. The cursor caret inside the document is already the focus indicator — the ring was visual noise. The shadow stack now stays identical between resting and focused states.

## 0.2.2 — 2026-05-18

The "fully there now" shading pass.

### Changed — page shading + gutter depth

The 0.2.1 page card was the right shape but flat. This release pushes the depth so each page really reads as a physical sheet of paper resting on a wooden desk:

- **Deeper drop shadow stack** under each page — 4 layers (1px hairline border, 1px close ambient, 6/14 mid, 20/48 long) at higher opacities so the lift is unmistakable.
- **Top edge highlight** — a 1px gradient pseudo-element on the leading edge of the page simulates light catching the top of the topmost sheet.
- **Wider inter-page gutter** (24px → 32px) so the desk shows through clearly when content flows from page to page.
- **Sharper page edges where they meet the gutter** — gutter has a 1px dark inset at its top (bottom edge of the upper sheet) and a 1px light inset at its bottom (top edge of the lower sheet), each followed by an 8/12 softer fall-off.
- **Desk gradient** — the canvas background is now a barely-perceptible 80px top/bottom gradient from `#c8ccd2` to `#d1d5db` so the surface reads as surfaced material, not a flat fill.
- **Focus ring** brightened from 18% to 35% blue so the active page is unambiguous.

## 0.2.1 — 2026-05-18

The "looks like Microsoft Word now" patch.

### Fixed — Word Print Layout visuals

In 0.2.0 the edit surface paginated correctly but didn't *look* paginated — the canvas was a single transparent slab over a grey body, so the user saw one long blob of text with thin horizontal dividers instead of distinct page sheets.

This release fixes that:

- The paginated canvas (`.phe-editor__canvas--paginated`) now paints a real grey "desk" background.
- The ProseMirror surface renders as a white A4 sheet (`794px × 1123px`), centred, with a soft drop shadow — exactly like Word's Print Layout view.
- The inter-page gap is now a clear grey gutter with subtle inset shadows that read as page edges, not a thin amber border on a white slab.
- The browser default amber focus outline on the ProseMirror is suppressed in favour of a subtle blue focus ring on the page card.
- A matching style block kicks in when `realtimePagination={false}` so the single-card "continuous" mode also renders as a centred white sheet on a grey desk.

### Changed — ownership boundary moved into our codebase

The wiring for the live pagination engine moved out of `PagedTiptapEditor.tsx` and into `src/paged/livePagination.ts` — a small facade module that owns:

- The A4 geometry defaults.
- Our `{ left, right }` header / footer prop shape (separate from the underlying engine's prop names).
- The CSS class our renderer stamps on the canvas for the Word-style page-card visuals.

The underlying engine is still `tiptap-pagination-plus` for now, but the swap-in point is here — a future hand-rolled ProseMirror pagination plugin can replace the contents of `livePagination.ts` without any change to `PagedTiptapEditor` or the public API.

## 0.2.0 — 2026-05-18

The "Word / Google Docs feel" release.

### Added — real-time pagination

- New `realtimePagination` prop on `PagedTiptapEditor` / `PagedLetterEditor` (default `true`). When on, content flows automatically onto the next visible page as the user types — the same "Print Layout" experience Microsoft Word ships. Powered by `tiptap-pagination-plus`.
- New `pageHeaderHtml` / `pageFooterHtml` props (`{ left?, right? }`). HTML is rendered as the per-page header / footer chrome on every page. Use the `{page}` placeholder for the current page number.
- Default footer right is `Page {page}` so multi-page drafts get page numbering out of the box.
- Set `realtimePagination={false}` to keep the previous single-card editor (continuous editing, no automatic page splitting).

### Added — toolbar / commands

- Superscript and subscript marks (`runCommand("superscript")` / `runCommand("subscript")`, with toolbar buttons).
- Manual `insertPageBreak` command — inserts an HR with `break-after: page` that both the live pagination extension and the paged.js preview path honour.
- Find / replace dialog (`editorRef.current?.openFind()`). In-house implementation via direct `setTextSelection` traversal — no decoration-bearing extension to clean up.
- Download PDF button on the toolbar (`editorRef.current?.downloadPdf({ filename })`). Opens the browser print preview prefilled with the document.
- Visible save indicator next to the toolbar (Idle / Saving / Error).

### Changed

- Bundle size went from ~190 KB gzipped → ~197 KB gzipped (+6 KB for live pagination).
- README rewritten to lead with the Word-style paged-editing story, with the previous TipTap-as-source-of-truth architecture details preserved.

### Removed

- Dropped `@sereneinserenade/tiptap-search-and-replace` — the extension's decoration cleanup throws on `componentWillUnmount`, so find/replace is now in-house.

## 0.1.0 — 2026-05-13

Initial public release.

- TipTap-backed editor (`PagedTiptapEditor`) wired as the canonical editor surface — replaces the legacy contenteditable + execCommand engine.
- `PagedLetterEditor` wraps the TipTap editor with letter-section round-tripping.
- Legacy `PagedHtmlEditor` kept for backward compatibility.
- Paged.js available as an optional print/preview path via `buildPagedLetterFullHtml` + `createPagedLetterPrintCss`.
- 119 acceptance tests covering typing, deletion, formatting, paste, undo / redo, find, persistence, and section reconstruction round-trips.
