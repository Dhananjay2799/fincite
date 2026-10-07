# FinCite frontend — Session 9

A responsive consumer finance workspace replaces the Next.js starter screen.
It contains curated example questions and answers, expandable CFPB source
passages, an evidence-limit example, copy, reset, project information,
and an accessible question form with loading and error states.

## Current integration status

The examples are authored interface fixtures, not live inference or evaluation
results. The UI labels them accordingly. Custom questions POST to `/api/chat`.
The route validates input, then deliberately returns HTTP 503 with
`INFERENCE_NOT_CONNECTED`. It makes no database or model calls. No browser
credentials, new dependencies, or environment variables are required.

Next session: replace the stub with server-side retrieval and generation.
Keep database credentials and inference credentials server-side. Return:

```ts
{
  answer: string;
  disposition: "answer" | "evidence_limited";
  sources: Array<{ id: string; title: string; url: string; quote: string }>;
}
```

Errors return `{ error: { code: string, message: string } }` with a suitable
HTTP error status. The client accepts HTTPS source links on
www.consumerfinance.gov, renders text without HTML, and never falls back to
curated examples for a custom question. The current request contains a single
question; conversation context handling is not implemented.

## Verified

- Next.js 16.3.8 / React 19.2.8 production build and TypeScript checks passed.
- ESLint passed with no warnings for the verification app.
- Browser: desktop, 390px and 320px widths have no horizontal overflow.
- Example selection, source expansion and links, copy, reset, project dialog.
- Evidence-limited example has no fabricated source.
- Form → POST → 503 → clearly labeled unavailable message; question preserved.
- Invalid JSON, empty question, and question over 1,000 characters → 400.
- Reset during an in-flight request prevents stale response rendering.
- No browser exceptions during interaction checks.
- Source quotes match the provided source inventory snapshots.

Checks used a reconstructed copy of the supplied app context and the exact
Next.js and React dependencies. Run lint/build in the full Windows repository
before committing. No live model quality or end-to-end RAG behavior was tested.

## Files

Replaced: src/app/page.tsx, src/app/layout.tsx, src/app/globals.css.
Added: src/components/fincite-workspace.tsx and its CSS module,
src/lib/chat-types.ts, src/lib/preview-examples.ts, src/app/api/chat/route.ts.
Layout uses system fonts to avoid a build-time Google Fonts download.
Package configuration, secrets, ingestion, training, and evaluation data are
not included in this patch.
