# FinCite web app

Next.js interface and `/api/chat` route for FinCite. Live at https://fincite-rouge.vercel.app.

See the [repository README](../../README.md) for the project overview, and
[hosted setup](../../docs/vercel-source-excerpts.md) for the Vercel configuration.

## Run locally

From the repository root:

```powershell
npm ci --prefix apps/web
node scripts/start-local.mjs
```

This starts the local RAG bridge and the frontend at http://localhost:3000.
Copy `.env.example` to `.env.local` and set `DATABASE_URL` first.

To run the hosted API path locally without the bridge, set `FINCITE_BACKEND=hosted`
in `.env.local` and use `npm run dev --prefix apps/web`.

## Checks

```powershell
npm run lint --prefix apps/web
npm run build --prefix apps/web
```

## Layout

- `src/app/api/chat/route.ts`: request validation; hosted or local-bridge backend.
- `src/lib/server/`: hosted retrieval, reranking and source-excerpt responder.
- `src/components/fincite-workspace.tsx`: the single-page interface.
- `src/lib/preview-examples.ts`: curated example answers shown by the example buttons.
