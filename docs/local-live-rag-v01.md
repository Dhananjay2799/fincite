# Local live RAG v0.2

Custom frontend questions now pass through the Next.js server to a loopback Node bridge:
Neon hybrid retrieval → up to two whole passages → local fine-tuned Qwen GGUF.
Example buttons still show curated examples.

The bridge reuses the pinned BGE embedding configuration and local chunk allowlist.
It uses the existing vector + English keyword OR search and reciprocal rank fusion
(candidate limit 20, constant 60, top five considered; at most the first two are
sent to generation). Live reranking is not enabled in this initial memory-conscious
connection. This differs from the hybrid-reranked development evaluation.

The llama-server chat template and tokenizer measure input size. The 2,048-token
context reserves 256 output tokens plus a 64-token margin. Whole passages that do
not fit are omitted. No passage is silently truncated. Generation uses plain-text answers and the system/user prompt format used in the
LoRA experiment (local-live-v0.2). v0.1 schema-constrained JSON produced an
internal status label as the answer on the Bitcoin smoke question; that test
failed. v0.2 removes model-generated answerability enums and rejects bare labels.
This is a changed generation setup and needs fresh evaluation.

Missing citations remain missing and produce a visible warning on all
uncited responses. Unknown CFPB citation IDs and incomplete/invalid model outputs are
withheld. Each displayed source is labelled cited-by-model or retrieved-only.
Cited IDs establish neither claim support nor answer correctness. The response disposition is a generic answer container; refusal success must
be graded from actual answer text. It is not inferred from model-generated enums.

## Run on Windows

1. Keep llama-server running on 127.0.0.1:8080 with alias fincite-v01, context 2048,
   parallel 1 and CPU layers 0, as used for the recorded smoke test.
2. From ingestion, run:
   `node --env-file=../apps/web/.env.local serve-local-rag.mjs`
3. Wait for `READY: FinCite RAG bridge http://127.0.0.1:8081`.
4. Add this server-only line to apps/web/.env.local:
   `FINCITE_API_URL=http://127.0.0.1:8081`
   Keep DATABASE_URL intact; never use NEXT_PUBLIC_ for either variable.
5. Restart the Next dev server from apps/web with `npm run dev`.
6. Open http://localhost:3000 and type a custom question. Example buttons do not
   invoke the live pipeline.

Three processes run: llama-server, Node RAG bridge, and Next.js. The bridge loads
only the embedding model, not another copy of Qwen. Both local services bind to
127.0.0.1. The bridge is single-request and rejects concurrent work with 429.

This is a local development connection, not public hosted inference. No payment
method or paid inference provider is needed. Availability depends on the computer
and all three processes remaining running.

## Checks

`node --test ingestion/test-live-rag.mjs` exercises missing/unknown citations,
context packing, incomplete output and empty retrieval. Web lint, TypeScript,
production build and browser/proxy interactions passed with mocked backend
responses in the preparation environment. Actual Neon credentials and model
weights were unavailable there. The combined live flow and Windows memory usage
must still be checked on the user's machine. No final quality scores are claimed.
