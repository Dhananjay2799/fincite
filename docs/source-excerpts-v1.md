# Source excerpt demo

## Behavior

The default Windows launcher starts the retrieval bridge and frontend, without llama.cpp or the GGUF. Hybrid Neon retrieval supplies the top five chunks. A pinned CPU cross-encoder ranks complete source paragraphs and list groups. The application copies up to three selected units and attaches source IDs. It verifies their exact offsets, titles, source IDs and CFPB URLs before returning them.

The language model does not select or write the displayed text in this mode. A source excerpt is not a personalized answer. The interface labels results “Related source excerpts” and shows relevance and applicability limits. Generated explanations remain available only as an experimental mode; the LoRA pipeline and all prior results are preserved.

## Run on the existing Windows setup

Stop the old launcher with Ctrl+C before updating. From the repository root:

```powershell
git pull --ff-only origin fix/grounding-and-heldout-evaluation
node scripts/start-local.mjs
```

Open http://localhost:3000 after readiness. Keep the launcher running. Existing Neon credentials and validated local chunks are still required. No new npm dependency or paid inference provider is added. The first run may download the pinned reranker weights, using the existing model cache.

The launcher deliberately sets excerpt mode even if an older FINCITE_ANSWER_MODE value remains in the environment. Historical generation experiments require an explicit opt-in:

```powershell
node scripts/start-local.mjs --experimental-generated
```

The old generation evaluation runners require port 8080 and this experimental mode. They are not the default source-excerpt demo check. The legacy quoted selector remains available to direct bridge users for reproducing earlier experiments.

## Verification

- 43 Node tests pass, including exact-span attribution, cash-advance conditions, complete nested lists, cancellation, unknown units, altered source text, missing evidence, and held-out scoring safeguards.
- Frontend ESLint, TypeScript and production build pass.
- HTTP integration through the actual Next.js chat API and real pinned reranker returns 200, source-excerpt mode, zero generation attempts, and the correct cash-advance exception. Empty questions return 400 and an untrusted origin returns 403. This uses a temporary retrieval fixture populated from the saved passages, not a live Neon connection. The page HTML includes the new default-mode description; all ten replay responses also pass the frontend response validator.
- The integration check found that Next.js normalized the internal request origin differently from the 127.0.0.1 frontend origin. The API now explicitly accepts both local port-3000 origins while continuing to reject untrusted origins.
- Ten supplemental assistant-authored probes ran through the actual pinned cross-encoder and excerpt engine. Raw results and implementation hashes are in `evaluation/results/source-excerpt-replay-2026-10-21T15-18-54-544Z.json`.
- The replay uses the union of saved retrieved passages. It does not test live Neon recall, independent benchmark accuracy, Windows memory use or cold-start performance.
- Browser automation was unavailable because the Chromium download failed. A successful frontend build is not a visual browser test.

## Supplemental probe review

These are assistant observations, not independent human grades. No quality score is calculated.

| Probe | Observation |
| --- | --- |
| 01: cash withdrawal and interest-free days | Includes the source exception: cash advances generally accrue interest from the transaction date. Additional purchase-related excerpts are also shown. |
| 02: posting original evidence | Returns guidance to include copies, but misses the more explicit mailing checklist with “not originals.” Includes less relevant investigation material. |
| 03: variable rate movement | Returns the index-rate paragraph. |
| 04: missing online card agreement | Returns issuer website/request guidance. |
| 05: closed account reported open | Returns the complete account-status error list. |
| 06: collection amount and dispute deadline | Includes the complete validation-notice list, alongside a credit-report mailing checklist that is less relevant to this question. |
| 07: cryptocurrency doubling next week | No excerpt selected. |
| 08: personal checking balance | No excerpt selected. |
| 09: guaranteed mortgage approval after dispute | Returns general dispute guidance; it cannot determine the requested outcome. This remains a relevance/completeness failure if judged as an answer. The interface presents related excerpts and an explicit limitation instead. |
| 10: collector accepting a settlement tomorrow | No excerpt selected. |

## Limits and release status

The -5 relevance-logit threshold, two-logit margin and maximum of three units were chosen during development. They are not calibrated probabilities and do not establish answerability, factual completeness or personal applicability. Oversized pair inputs are omitted as whole units, never truncated. Exact source copying prevents generation from reversing the source wording; it does not establish that the selected excerpts answer the question.

This change completes the source-excerpt implementation, not the independent evaluation or permanent deployment. Keep the PR in draft until the existing Windows/Neon flow has been exercised. Do not claim the adapter improves grounding or that this local demo is production ready.
