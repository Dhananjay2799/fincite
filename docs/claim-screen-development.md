# Claim screening development experiment

## Purpose and decision

The earlier fine-tuned generation run contains a cash-advance contradiction even
though the relevant CFPB paragraph was supplied. Citation-ID validation accepted
that response. This experiment tests a separate, local natural-language inference
(NLI) model as an additional claim screen. It does not retrain the adapter, modify
the public application, or establish that free-form generation is ready to ship.

**Do not enable this screen as a production reliability fix.** The real-model
replay withholds the cash-advance error, but also withholds supported freeze
guidance and accepts a notice sentence that has dropped the source's "generally"
qualification. It is neither a sufficient correctness checker nor a measured
fine-tuning improvement.

## Implementation

- Pinned `Xenova/nli-deberta-v3-xsmall` revision
  `2a4f614a701367a02d51389039afc998faeda637`, q8 CPU inference.
- NLI label order is read and validated from the model configuration. A
  numerically stable softmax converts its three logits to model predictions.
- A citation terminates its preceding sentence block. Unknown citations,
  placeholder IDs, internal reasoning markers, and uncited trailing text are
  rejected before model scoring. Citation-at-the-start prose is conservatively
  rejected; a formatting rejection is not a factual-error grade.
- Whole sentences, including their conditions, are scored against each complete
  supplied evidence unit from the **cited** sources. Another retrieved source
  cannot silently repair wrong attribution.
- At least one cited unit must have entailment >= 0.9, and no cited unit may have
  contradiction > 0.1. These are provisional development thresholds, not
  calibrated probabilities of correctness.
- A pair over 512 tokens is unverified and withholds the answer. Evidence is not
  truncated to fit. One failed sentence withholds the complete explanation.
- Existing source text, original answers, and source offsets are checked against
  the saved run before replay. Reports retain per-pair scores, policy and file
  hashes. Inputs are checked again after the run.

The model card describes an SNLI/MultiNLI-trained three-way classifier, not a
financial compliance verifier:
https://huggingface.co/cross-encoder/nli-deberta-v3-xsmall
https://huggingface.co/Xenova/nli-deberta-v3-xsmall

## Actual CPU replay

Input:
`evaluation/results/ranked-generation-development-2026-10-21T15-06-22-871Z.json`.

Recorded v2 output:
`evaluation/results/claim-screen-development-2026-10-21T18-34-03-072Z.json`.

| Screen outcome | Records |
| --- | ---: |
| Passes the NLI screen | 2 |
| Withheld by NLI screen | 6 |
| Withheld for citation/format problems | 2 |
| Earlier retrieval-gate abstention; no model generation | 3 |

These are processing decisions, **not** correctness, unsupported-answer, or
refusal scores. Only ten original records contained model-generated answers.
No new answer generation or Neon query occurred during this replay.

Concrete observations against the earlier assistant review:

- **dev-004:** the incorrect interest-free-cash-advance explanation is withheld.
- **dev-006:** the screen passes the sentence that changes "generally must notify"
  into "must notify." The qualification problem remains.
- **dev-011:** the screen withholds a supported instruction to contact each
  bureau. It predicts a conflict with a separate general freeze paragraph that
  does not actually contradict this instruction.
- **dev-007 and dev-009:** format rejection remains distinct from semantic
  checking. No claim is made that NLI evaluated these responses.

An initial exploratory implementation concatenated all cited units into one
premise. It assigned high entailment to the incorrect cash-advance sentence.
That approach was rejected: a general rule can bury its exception in a long
premise. The final v2 policy scores whole units separately, but its false blocks
and missed qualification still prevent promotion. Do not lower thresholds on
these same questions merely to increase displayed answer coverage.

## Reproduce

From the repository root, after installing the existing ingestion dependencies:

```powershell
node --test ingestion/test-*.mjs evaluation/test-*.mjs
node evaluation/run-claim-screen.mjs
```

The model download is public and needs no paid inference endpoint. Hugging Face
can rate-limit anonymous downloads. This run completed after a temporary 429.
No API key, running model server, database credential, or Colab upload is required
for this saved-answer replay. No live code imports the new checker.

## Next dependency for actual generation work

The repository stores training reports and outputs, but deliberately excludes
adapter weights and the GGUF model. The existing archive
`fincite-experiment-20261002T213157Z.zip` contains the selected epoch-3 adapter.
Restore that artifact to test the actual trained model; do not retrain a new
adapter merely because the previous Colab runtime disappeared.

The remaining objective is an identical-evidence base/adapter comparison with
an improved generation candidate, followed by independent evaluation and the
Gemini comparison. This NLI experiment does not complete those steps. Generated
explanations must remain experimental until their unsupported claims, coverage,
false refusals and missed qualifications are evaluated together.
