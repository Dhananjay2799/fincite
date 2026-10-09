# One-command Windows startup

From the repository root:

```powershell
node scripts/start-local.mjs
```

Stop any previously started model, bridge and frontend with Ctrl+C in their respective terminals first. The launcher refuses occupied ports; it does not terminate existing services.

It starts the existing b11476 Windows CPU runtime, waits for model health, starts the bridge using the absolute server-only env path, waits for bridge health and then starts Next.js on port 3000. Keep its terminal open. Press Ctrl+C to stop the processes it started.

Required local artifacts: the exported GGUF, the b11476 runtime, apps/web/.env.local, installed app/ingestion dependencies, validated local chunks and the existing Neon imports. The script does not install dependencies, download models or provision a database. This remains a local development demo.

Model settings match the existing CPU setup: context 2048, one slot, four threads, output settings determined by the bridge. The launcher does not change retrieval, prompts or model weights. Startup readiness is not an accuracy check.

Validation in preparation: Node syntax and non-Windows fail-fast behavior. Full process startup and shutdown still require verification on the Windows machine.
