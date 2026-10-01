# pagedly

A React rich-text editor for letter / contract / report-style documents — built to feel like Microsoft Word's "Print Layout" view. As the user types, content flows automatically onto the next page; visible page boundaries appear in the edit surface; letterhead, signature, and page numbers render correctly when the document is printed.

```
HTML draft ──► editable A4 pages stacked on a grey "desk"
               │     (real-time pagination, word-level reflow at boundaries)
               │
               ├──► onChange(html) ──► host stores draft
               │
               └──► print ──► native browser print with letterhead
                              + signature + page numbers injected
```

## Install

Pagedly is distributed as a tarball, not via the public npm registry. After purchase you'll receive `pagedly-X.Y.Z.tgz` from your customer dashboard. Drop it into your project root, then:

```sh
npm install ./pagedly-X.Y.Z.tgz
```

This adds Pagedly to your `dependencies` as a file reference. Future updates ship as a new tarball — drop in the newer file and re-run `npm install`.

```tsx
import {
  LetterEditor,
  ContentEditableEditor,
  Toolbar,
  type LetterDraft,
} from "pagedly";
import "pagedly/styles.css";
```

## Framework compatibility

Pagedly works in any React framework — Vite, Next.js (App or Pages Router), Remix, CRA, Astro React islands, TanStack Start.

**One constraint**: the editor uses browser-only APIs (`document.execCommand`, `window.getSelection()`, `CSS.highlights`, `contentEditable`). It can't render on a server. Importing the package on a server is fine — no top-level browser access — but `<Editor />` itself must mount in the browser.

In **Next.js App Router**, wrap usage in a Client Component:

```tsx
// app/letter/page.tsx — server component
import { LetterClient } from "./letter-client";
export default function Page() {
  return <LetterClient />;
}
```

```tsx
// app/letter/letter-client.tsx
"use client";
import { useState } from "react";
import { LetterEditor, type LetterDraft } from "pagedly";
import "pagedly/styles.css";

export function LetterClient() {
  const [draft, setDraft] = useState<LetterDraft>(/* ... */);
  return <LetterEditor draft={draft} onDraftChange={setDraft} />;
}
```

**Vite, Remix routes, CRA, Pages Router, Astro client:directive** — all render client-side by default; no marker needed, just import and use.

## Quick start — letter editor (recommended)

The most common use case is `LetterEditor`: a letter-specific wrapper that owns a `LetterDraft` model (per-section HTML, employer details, evidence attachments) and renders an editable page surface with letterhead.

```tsx
import { useState } from "react";
import { LetterEditor, type LetterDraft } from "pagedly";
import "pagedly/styles.css";

function MyLetter() {
  const [draft, setDraft] = useState<LetterDraft>({
    id: "draft-1",
    mode: "employer",
    letterType: "warning",
    employer: {
      legalName: "Acme Ltd",
      letterheadDataUrl: "https://example.com/letterhead.png",
      signatureDataUrl: "https://example.com/signature.png",
    },
    sections: [
      { id: "opening",   sectionId: "opening",   html: "<p>Dear Alex,</p>" },
      { id: "body",      sectionId: "body",      html: "<p>...</p>" },
      { id: "signature", sectionId: "signature", html: "<p>Regards,</p>" },
    ],
    evidence: [],
  });

  return (
    <LetterEditor
      draft={draft}
      onDraftChange={setDraft}
      onSectionChange={(draftId, sectionId, html) => {
        // Persist per-section HTML if you care.
      }}
    />
  );
}
```

### Printing a letter

Press Cmd/Ctrl-P (or call `editorRef.current?.downloadPdf()`) and the browser's native print dialog opens. On `beforeprint`, the ce engine injects:

- **Letterhead** at the top of page 1 (from `draft.employer.letterheadDataUrl`)
- **Signature** above the signature section on the last page (from `draft.employer.signatureDataUrl`)
- **Attachments** at the end (from `draft.evidence` with `displayMode: "attached"`)

On `afterprint`, all injected chrome is removed so the edit view returns to its normal state. Works in Chromium + WebKit.

## Direct editor — `ContentEditableEditor`

For non-letter documents (contracts, reports, general rich text on paged surfaces) use the engine component directly:

```tsx
import { useState } from "react";
import { ContentEditableEditor } from "pagedly";
import "pagedly/styles.css";

function MyEditor() {
  const [html, setHtml] = useState("<p>Hello world</p>");
  return (
    <ContentEditableEditor
      html={html}
      onChange={setHtml}
    />
  );
}
```

### Props

| Prop | Type | Default | Notes |
| --- | --- | --- | --- |
| `html` | `string` | — | Initial HTML. Subsequent updates are treated as round-trips unless they differ. |
| `onChange` | `(html: string) => void` | — | Fires when content changes. Optionally piped through `sanitizeHtml`. |
| `sanitizePastedHtml` | `(html: string) => string` | built-in | Strips `style`/`class`/`id`/`data-*` from pasted HTML — kills Chrome's "select-all + copy + paste makes text bigger" regression. |
| `pageWidthMm` | `number` | `210` | A4 default. |
| `pageHeightMm` | `number` | `297` | A4 default. |
| `pagePadding` | `string` | `"25mm 20mm"` | CSS shorthand for the page's content padding. |
| `doNotBreak` | `(el: HTMLElement) => boolean` | — | Return `true` to keep an element from being split across pages. |
| `pageHeaderHtml` | `{ left?: string; right?: string }` | — | Per-page top-margin chrome. `{page}` / `{total}` placeholders are substituted per page. Rendered on screen and in print; never written to the saved source. |
| `pageFooterHtml` | `{ left?: string; right?: string }` | page numbers (`{page} / {total}`) | Per-page bottom-margin chrome. Same placeholders and source-exclusion as the header. Defaults to centered page numbers; pass `{}` to suppress. |
| `changeDebounceMs` | `number` | `120` | Debounce (ms) for the `onChange` notification — a burst of edits coalesces into one host notification this long after the last keystroke, keeping large documents responsive (host re-parse is O(document)). `getHTML()` is always synchronous and current, so save paths are unaffected. |

### Imperative handle

```tsx
import { useRef } from "react";
import type { ContentEditableEditorHandle } from "pagedly";

const editorRef = useRef<ContentEditableEditorHandle>(null);

editorRef.current?.focus();
editorRef.current?.getHTML();
editorRef.current?.setHTML("<p>...</p>");
editorRef.current?.execCommand("bold");
editorRef.current?.reflow();
```

## Toolbar

`Toolbar` is a Radix-based toolbar covering: bold / italic / underline / strikethrough, headings, paragraph reset, quote, alignment, lists, font family (+ Google Fonts), font size, text color, highlight color, links, images, tables, page-break sentinel, undo/redo, find/replace, print, download-as-PDF. Render it inside or outside the editor:

```tsx
<LetterEditor
  draft={draft}
  onDraftChange={setDraft}
  toolbar={true}                    // built-in toolbar (default)
  toolbarPosition="sticky"          // or "stationary"
  toolbarLayout="compact"           // or "full"
/>
```

Pass a function to render your own:

```tsx
<LetterEditor
  toolbar={(state) => <MyCustomToolbar state={state} />}
/>
```

## Find / replace

Cmd-F (or `editorRef.current?.openFind()`) opens an in-document find panel. Enter advances to the next match; Replace swaps the current match and advances. Escape closes. Works in Chromium + WebKit.

## Architecture

```
LetterEditor
  └── Editor
       └── ContentEditableEditor   ← contenteditable + DOM surgery
            ├── pageTransitionMgmt.ts   ← word migration between pages
            ├── beforeprint injection   ← letterhead, signature, attachments
            └── built-in paste sanitizer
```

Earlier pagination experiments (paged.js, TipTap-with-`tiptap-pagination-plus`, ProseMirror `<page>` nodes, flat-doc widget decorations) live in `src/_archive/` for reference. They are no longer bundled or exported from the package.

See `docs/internal/PAGINATION_NOTES.md` for the full architectural retrospective.

## Large documents

Pagination is incremental and runs off the critical path. Editing re-paginates
only the pages around the caret — typing speed is independent of document length
— while loading or pasting a large document paginates the visible portion up
front and settles the remainder during browser idle time, so it never blocks the
UI. Documents from a few up to ~1000 pages stay responsive: a big paste streams
in across frames rather than freezing, and a one-shot load is interactive
immediately. Tune the host-notification cadence with `changeDebounceMs` (or
`reflowDelayMs` at the `Editor` / `LetterEditor` level) if you want larger or
smaller `onChange` batches.

## Browser support

Chromium-based browsers (Chrome, Edge, Brave, Opera) and WebKit (Safari). The Playwright suite runs on both for every commit.

## Local development

```sh
npm install
npm run dev              # demo at http://127.0.0.1:5174
npm test                 # vitest unit suite
npm run test:e2e         # playwright (Chromium + WebKit)
npm run build            # vite build + tsc
```

## Tests

| Suite | Location | Coverage |
| --- | --- | --- |
| Vitest unit | `tests/*.test.ts(x)` | Engine internals: oversized splitting, source reconstruction, paste sanitisation, cursor recovery, page scale calc |
| Vitest acceptance | `tests/acceptance/*.test.tsx` | Editor public API contracts |
| Playwright e2e | `tests/e2e/*.spec.ts` | ce engine, cross-browser (Chromium + WebKit): pagination, backspace-boundary char conservation, find/replace, font size, print chrome injection |

## License

Pagedly is sold under a **commercial proprietary license**. A purchased license grants a perpetual right to use and modify the source within your own applications. Redistribution as a standalone library, public hosting of the source, and use to build a competing paged-editor product are prohibited.

Full terms in [LICENSE](./LICENSE). For licensing inquiries, contact `licensing@pagedly.dev`.
