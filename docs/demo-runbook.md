# Running the FinCite demo

## Start locally
From the repository root:
    node scripts/start-local.mjs

Wait for "FinCite is ready", then open http://localhost:3000.
Keep the launcher terminal open.

## Share temporarily
In another terminal:
    cloudflared tunnel --url http://127.0.0.1:3000

Keep both terminals running and keep the computer awake.

If Cloudflare generates a new hostname:
- Update FINCITE_PUBLIC_ORIGIN in apps/web/.env.local to the new HTTPS origin.
- Update allowedDevOrigins in apps/web/next.config.ts to the new hostname.
- Restart the launcher and refresh the public page.

The launcher currently uses the Next.js development server.
The tunnel is temporary, not permanent production hosting.

## Demonstrate
Type "What does APR mean?" to show live generation.
Show the retrieved passages and source links.
Clearly identify curated examples when using them.

## Verified
- ESLint passed.
- TypeScript passed.
- Production build passed.
- Public Send functionality was confirmed by the developer.

## Limitations
The corpus contains eight articles.
Citation-ID checks do not prove factual support.
Fine-tuning results include documented regressions.
A final held-out hallucination-reduction score is not established.
