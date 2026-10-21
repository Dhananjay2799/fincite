# Reranked evidence → fine-tuned generation experiment

This experiment tests the next development hypothesis without changing the live
app: supply several coherent, reranked evidence units to the model's original
answer-generation prompt instead of asking the adapter to select one paragraph ID.

## Inputs and provisional policy

- Uses the committed v0.6 saved responses and the actual offline reranker rankings.
- Checks question IDs, source attribution, exact source text and character offsets.
- Supplies at most three units within two raw-logit points of the best unit.
- If the best score is below -5, records an evidence-limited response without
  calling the generation model.
- Checks the real llama.cpp chat template and token count for each proposed set
  of whole evidence units; units are never truncated to force them into context.
- Uses the verified local Q4_K_M model artifact and the original source-grounded
  generation prompt, with greedy generation and 256 output tokens.

The -5 threshold and other evidence-packing settings are **development choices**.
The threshold lies in the separation interval seen on the already-used questions.
It is not a validated answerability probability or a production policy. No runtime
decision reads the question's answerability label or hard-codes question strings.

## Run once with the existing model service

Keep the launcher running in one terminal. In a second terminal, from the repo root:

```powershell
node evaluation/run-ranked-generation.mjs
```

No reranker download, database access, new Python environment or Colab upload is
needed for this generation experiment. It uses the saved rankings and local model
server on port 8080. Do not send other questions while it runs.

The script creates a new timestamped
`evaluation/results/ranked-generation-development-*.json` and saves each response
as it completes. It retains raw model text even if citation/format checks fail.
No failed validation is silently repaired or treated as a correct answer.

Each result identifies its origin:

- `fine_tuned_model_generation`: the local model generated an answer from the
  recorded evidence and exact recorded messages.
- `development_relevance_gate`: a provisional score rule produced the limitation
  response. This is not evidence that the model learned to refuse.

The report records model-file and input hashes, messages, selected/skipped evidence,
raw responses, format/citation validation errors and failures. File verification
does not attest the identity of the running model process. Timing covers this
generation experiment, not full live retrieval latency.

## What a successful experiment must show

Review answers against the stored reference/forbidden claims, not just citation
presence. Check whether cash advances remain distinguished from purchases,
multi-part questions retain notice/checklist details, and unsupported personal
outcomes receive appropriate limitations. Keep refusals, answer coverage, missing
citations, incomplete answers and unsupported claims visible together.

Several pipeline components differ from the v0.6 selector, so a better result
would not isolate an effect of LoRA. A controlled base-versus-adapter comparison
still requires identical evidence and settings. These questions have already been
used for tuning; they cannot become a held-out benchmark.

Do not merge the live default selector or install the provisional relevance gate
as a production reliability fix based on unit tests or these development examples.
