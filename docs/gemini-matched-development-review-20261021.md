# Base, LoRA and Gemini: matched-evidence development review

Status: assistant qualitative review; independent human grading pending.
Reviewed repository inputs at commit 956afbf8cefedff0c5a9f427f1ac7e30cd9431bd.

## Inputs and scope

- Qwen results: [52 saved responses](../evaluation/results/adapter-prompt-development-20261021T184544Z.json).
- Gemini results: [26 saved responses](../evaluation/results/gemini-development-2026-10-21T21-26-29-053Z.json).
- Qwen base: Qwen/Qwen3-1.7B, revision 70d244cc86ccca08cf5af4e1e306ecf908b1ad5e.
- LoRA: existing selected epoch 3 adapter; no new training.
- Gemini requested model: gemini-3.5-flash-lite; model metadata version 3.5-flash-lite-07-2026.
- Thirteen previously inspected development questions, each under original and evidence-contract-v1 prompts.
- All three arms receive identical system instructions, questions and supplied evidence for a given question/prompt.
- This compares generation over frozen evidence. It is not an end-to-end retrieval comparison or held-out benchmark.

## Record checks

An in-memory review through the GitHub connector checked 26 unique Gemini question/prompt records, exactly two matching Qwen controls per record, exact shared messages, HTTP 200, ok=true, STOP in saved and raw provider responses, and reconstruction of final answer text from non-thought response parts. All passed. Every cited CFPB ID is among that question's supplied IDs.

These checks do not establish semantic citation support. File SHA-256/code-provenance checks and repository tests were not rerun during this review because the execution environment is offline. The checks here used parsed GitHub file contents, not a running local validator. quality_scores remains null.

## Main findings

The stricter prompt is not a universal improvement. It corrects the base model's cash-advance premise error but produces an unnecessary Gemini refusal for that same question and an unnecessary adapter refusal for the freeze question. Gemini gives fuller denial/dispute/debt-notice checklists and preserves fixed-APR qualifiers better in these outputs, but still overstates the minimum-payment diagnosis and misses some reference criteria.

The saved runs do not establish an overall LoRA improvement or a production-ready generated-answer system. Use them to identify specific failures and write fresh evaluation cases; do not tune on future held-out labels.

## Question-level observations

### dev-001

All arms need care with grace-period eligibility and the carried-balance condition. Both Gemini prompts assert the user's reason for being charged interest and loss of a grace period as established facts. The excerpts give conditional general guidance, not an account diagnosis. The adapter answers omit relevant conditions and/or new-purchase consequences.

### dev-002

Both Gemini prompts include the denial reasons/request-within-60-days alternative, reporting-company contacts, free-report period, correction process, and score/factors. The adapter contract answer covers more items than its original answer but omits the denial-reasons alternative. The references condition score disclosure on a score having been used; the supplied snippet is less explicit about this, so evidence quality also needs review.

### dev-003

All six outputs avoid predicting Bitcoin's price. Contract-prompt responses use the canonical evidence limitation. This is an observation on one used development question, not a general refusal score.

### dev-004

Base/original incorrectly says the purchase grace period covers cash advances. Base/contract and both adapter answers reject that premise, although adapter wording drops some typical/general qualifiers. Gemini/original correctly preserves typically/generally and transaction-date interest. Gemini/contract instead returns the canonical limitation despite directly supporting evidence: a clear unnecessary refusal in this saved run.

### dev-005

All arms express APR as a yearly interest rate. Gemini/contract also expands annual percentage rate. Adapter/original lacks a citation. Both Gemini answers add supported variable-APR detail that the question did not require.

### dev-006

Both Gemini answers preserve generally for notice and in most circumstances for application of a higher rate. Both adapter answers strengthen generally must notify to must notify. Base/contract appends a contradictory evidence limitation. Gemini and adapter still omit the index distinction in the reference criteria.

### dev-007

All arms identify duplicated debt under different names as an error type to check. Adapter/contract repeats the user's duplicate-entry premise as a fact. Gemini retains category-level wording, but neither Gemini answer explicitly explains that the user's particular entries have not been verified as duplicates.

### dev-008

All arms cover contacting both the credit reporting company and the information supplier. Both Gemini answers preserve generally. Adapter/original lacks a citation; contract restores an ID.

### dev-009

Both Gemini answers enumerate the complete supplied checklist, retain if available for the report confirmation number, and specify copies rather than originals. Adapter answers omit some detail/qualifiers; original lacks a citation. Base/contract appends an unnecessary limitation after a substantive answer and has no citation. The broader development reference also mentions retaining copies, which the supplied snippet does not explicitly state; do not penalize an evidence-only model for failing to invent absent guidance.

### dev-010

Both Gemini answers include all supplied identification, itemization, response, and 30-day-end-date items, with citations for each list item. Base/contract also provides the full checklist. Adapter/original introduces the notice-sent date, which is not a checklist item in the supplied evidence, and omits several items. Adapter/contract is fuller, but places its only citation at the end rather than on each factual item.

### dev-011

Base and Gemini under both prompts, plus adapter/original, state that separate freeze requests are needed. Adapter/contract falsely refuses despite direct supporting evidence. Neither Gemini response explicitly develops the fraud-alert contrast in the reference criteria.

### dev-012

All six outputs avoid predicting the bank's fee-waiver decision. None suggests contacting the issuer, a reference next step absent from the supplied unrelated snippets. This highlights the need to align review criteria with evidence-only instructions.

### dev-013

All six outputs avoid predicting the landlord's approval decision. Gemini/original cites its description of the unrelated supplied material; contract gives only the canonical limitation.

## Comparison limits

Qwen used CPU BF16/SDPA, disabled thinking, greedy generation and a 256-token visible-output limit. Gemini used temperature zero, provider-default reasoning and a 1024-token output budget. Exact text inputs match; tokenization, runtime, precision and compute budget do not. CPU generation times and remote API elapsed times are not directly comparable deployment latency measurements.

The three previously gated unsupported questions were sent to all models with saved unrelated evidence, without the gate. Their model responses must not be conflated with earlier external-gate abstentions. No held-out or independent human correctness, grounding, refusal, or citation-support scores are reported. The draft reference criteria sometimes demand conditions or next steps absent from the supplied snippets; review evidence sufficiency before assigning completeness grades.

## Release decision and next work

Keep the public source-excerpt default. Do not switch production generation or retrain solely because this development run completed. The next evaluation needs fresh, semantically reviewed question groups, sufficient supporting evidence, frozen settings, and separate failure, answer coverage, unsupported-claim, false-refusal and citation-support judgments. Any generation change must also retain concrete guards and be evaluated on those fresh cases.

The Gemini comparison run is complete. Reliable generated public answers and independent held-out evaluation remain unfinished.
