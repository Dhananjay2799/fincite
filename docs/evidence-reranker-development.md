# Offline evidence reranking after the v0.6 live failure

Status: completed offline development experiment; not enabled in the live app.
The default selector in PR #1 remains unapproved. No new live model run is claimed.

## Changes tested

`ingestion/evidence-units.mjs` builds coherent evidence units from supplied source
text. It removes standalone headings and dangling list introductions, keeps each
list with its introduction and nested items, preserves original character spans,
and removes duplicate units without changing their source attribution.

`ingestion/evaluate-evidence-units.mjs` scores these units with the existing pinned
`Xenova/ms-marco-MiniLM-L-6-v2` relevance model. It runs on CPU, one pair at a time,
with no truncation and a 512-token pair limit. This experiment uses unit text
without section-heading prefixes; the script also supports a `section` comparison
mode. It does not call Neon or the local Qwen model and does not change live code.

## Actual execution

- Input: the uploaded 13-question v0.6 development run; analysis bytes were checked
  against GitHub blob `716dd356f89ff2824efbb23eb58a63ca8ee2428d`.
- Model revision: `a09144355adeed5f58c8ed011d209bf8ee5a1fec`.
- Runtime: Node v24.19.0, Transformers.js 4.3.0, CPU, fp32.
- All 13 questions completed; 115 units scored; zero token-limit skips.
- Raw rankings, text, offsets, scores, versions and hashes are retained in
  [the result file](../evaluation/results/evidence-reranker-development-v03.json).
- Six new structural tests pass; 33 tests pass across the branch's grounding,
  selector, evidence-unit and held-out-tool suites.

These are real reranker executions, not mocked model scores. The structural tests
are automated checks; assessment of answer relevance below is assistant review.

## Findings

| Question | Top-ranked evidence | Remaining qualification |
| --- | --- | --- |
| dev-001 | Grace-period eligibility, full payment, loss of grace period and new-purchase interest | A generated explanation still needs to connect this to minimum payments. |
| dev-002 | Complete adverse-action information list | The denial-reasons/request-window paragraph ranks second; more than one unit is needed. |
| dev-004 | Cash-advance exception and transaction-date interest | Correct relevant unit; this does not establish model generation quality. |
| dev-005 | APR definition and yearly rate | Correct relevant unit. |
| dev-006 | Fixed APR can change, notice and transaction qualifications | Correct relevant unit. |
| dev-007 | Complete account-status-error list including duplicate debts | Must still avoid diagnosing this person's entries. |
| dev-008 | Disputes generally involve both the bureau and supplier | Correct relevant unit. |
| dev-009 | Mailing checklist including copies, not originals | The list is retained rather than returning its introduction alone. |
| dev-010 | General validation-notice definition/timing | Required notice fields rank second; top-one selection remains insufficient. |
| dev-011 | Separate freeze requests and distinction from fraud alerts | Correct relevant unit. |

## Refusal calibration evidence, not a refusal result

For this fixed development sample, the smallest best-unit logit on an answerable
question is -0.014260; the largest best-unit logit on an unanswerable question is
-9.101458. Thus there is a separation interval on these already-used questions.
The three unanswerable questions themselves still have irrelevant top units;
rankers always return a best candidate if candidates exist.

No threshold is selected or installed automatically. Raw relevance logits are not
probabilities of answerability or entailment. Choosing a threshold in this interval
would be tuning on the same ten positives and three negatives, not a held-out
refusal result. Near-domain negatives and independently reviewed questions are
needed before using any threshold to assert reliability.

## Reproduce without running the app

From the repository root, with ingestion dependencies installed:

```powershell
node ingestion/evaluate-evidence-units.mjs evaluation/results/local-development-2026-10-21T02-22-24-402Z.json evaluation/results/evidence-reranker-reproduction.json text
```

First use may download the public, pinned relevance model. The output path must be
new; existing experiment files are not overwritten. Local runtime/hardware can
affect timing. No payment credentials, llama.cpp process or database connection
are needed. This is an optional reproduction command, not another required user run.

## What is not fixed yet

The live Qwen selector is unchanged. End-to-end refusal behavior, multi-part answer
completeness, generated-answer grounding, independent evaluation and permanent
hosting remain unresolved. Relevance ranking is evidence preparation, not a
replacement for the project's base-versus-LoRA generation comparison.

The next design must pack multiple coherent evidence units when needed, measure
abstention on near-domain negatives, and compare base and adapted generation with
identical evidence. Do not hard-code development question strings, answer IDs or
personal-outcome labels into runtime behavior. Do not merge the unsuccessful
default selector as a verified reliability improvement.
