# Hosted source-excerpt candidate

## What changed

On Vercel, `/api/chat` runs the source-excerpt pipeline inside the Node.js function. It does not fetch `127.0.0.1:8081`, start an HTTP bridge, load the Qwen GGUF, or generate explanations. Local development still uses the existing launcher and bridge by default. Set `FINCITE_BACKEND=hosted` to exercise the hosted path locally.

The function loads the same pinned BGE query encoder and MiniLM relevance classifier. It uses the existing hybrid RRF query and the committed corpus manifest to allowlist chunk IDs, bind document hashes and canonical URLs, and hash-check returned chunk text. Ignored local snapshot/chunk files are not needed by the hosted function. Embeddings with stale input hashes or without normalization are excluded from vector candidates.

Model files download into a disposable cache under the operating system temporary directory. Warm instances reuse model resources; cold instances may need to download them again. Inference runs one request at a time per instance. This is a resource bound, not a distributed rate limit. Model initialization failures can be retried on a later request. Excerpt selection remains development-calibrated, with the same known relevance/completeness limitations documented in `source-excerpts-v1.md`.

## Vercel project configuration

- Repository: `Dhananjay2799/fincite`.
- Root Directory: `apps/web`.
- Framework: Next.js.
- Node.js: 24.x; the package engine is pinned to the supported major.
- Plan: Hobby only for the current no-payment-method goal. Do not upgrade or provision paid inference.
- `apps/web/vercel.json` provides the build and install commands and enables Fluid Compute.
- Set server-only `DATABASE_URL` in the Vercel project dashboard for the environment being tested. Do not paste credentials into chat or commit them. The existing Neon schema, imported chunks and embeddings are still required; this change performs no migrations or database writes.
- No `FINCITE_API_URL`, model endpoint, Hugging Face token or LLM-provider key is needed on Vercel.
- The function exports a 180-second maximum duration and a shorter internal request deadline. Check actual hosted cold starts before presenting a reliable public demo.

The install command skips optional ONNX GPU downloads. Linux CPU runtime files are included explicitly in the Next.js trace; Windows/macOS/ARM and CUDA/TensorRT files are excluded from Vercel's `/api/chat` bundle. This does not change the Windows local runtime. Large-function beta settings and paid compute are not required by the measured trace.

## Verification performed

- 50 Node tests pass: existing grounding/evaluation tests plus hosted hash validation, query parameter binding, stale-embedding exclusion, resource reuse, failed initialization recovery, overlapping-request rejection and cancellation.
- Frontend lint, TypeScript and a Vercel-mode production build pass.
- The Next.js API file trace totals approximately 79.66 MiB and includes both the Linux x64 ONNX binding and its core shared library. This is a local file-trace measurement, not a Vercel-reported final deployment size.
- Real hosted model resources processed the cash-advance probe using a database-query fixture. The returned response had source-excerpt mode, zero generation attempts and the correct transaction-date exception. Observed model initialization plus request time was 91.68 seconds; process RSS at measurement was approximately 441 MiB. This is one environment, not a hosted cold-start benchmark or a peak-memory guarantee.
- The actual production Next.js `/api/chat` path, both real CPU models and Neon HTTP client processed the same probe with only the Neon HTTP response replaced by a fixture. It returned 200 with zero generation attempts in approximately 21.10 seconds with cached model files. No local bridge was running.
- Vercel-mode API with no database configured returns a sanitized 503 rather than attempting the loopback bridge. Empty input returns 400; an untrusted origin returns 403.
- No visual browser test, live Neon query or real Vercel invocation was performed in this environment.

## Current deployment status

The connected Vercel account returned no accessible teams/workspaces and no matching project. Therefore no Vercel project, public deployment, URL, environment secret, plan change or paid resource was created. The implementation is prepared for a preview after workspace access and the server-only database configuration are available.

After connecting the correct Vercel workspace, deploy the reviewed candidate as a preview, configure the preview database secret privately, and verify cash-advance and unsupported-question responses through the deployed UI. Keep the existing local demo available. Do not claim hosted success, permanent availability, independently measured answer quality, or fine-tuning improvement based on local build results.
