# Restored adapter and matched prompt comparison

## What was tested

The user supplied the original `fincite-experiment-20261002T213157Z.zip`.
The selected epoch-3 adapter was restored without retraining. Its base-model
revision matches the recorded experiment. The adapter tensor names and values
loaded into PEFT were compared with the saved safetensors file and matched.

- Archive SHA256: `36a01931d885a321a72dbb6834ebda163acdfa671ec040d6f20e7fc6ef518b31`
- Adapter SHA256: `1b68b5f1c76ad912eb958d6b365a8277db568738ebd3d3e1ee53a79b304b4b5e`
- Base: `Qwen/Qwen3-1.7B`, revision `70d244cc86ccca08cf5af4e1e306ecf908b1ad5e`.
- Runtime: PyTorch 2.11.0+cpu, Transformers 4.51.3, PEFT 0.15.2;
  CPU BF16, SDPA, six inference threads, greedy decoding, thinking disabled.

The complete comparison is recorded in
`evaluation/results/adapter-prompt-development-20261021T184544Z.json`.
It contains 52 responses: 13 previously inspected development questions × two
models × two prompts. Every arm receives the same evidence text for a question;
no reference answer or answerability label is put in the model's messages.

The ten earlier generated questions retain their saved, reranked whole evidence
units. For the other three questions, the earlier relevance gate is removed and
the top three saved units are supplied, even when their relevance scores are low.
The model itself must now handle insufficient evidence. These are not directly
comparable refusal counts to the previous gate-produced limitations.

The base control runs before PEFT is attached. Only after both base-prompt arms
finish is the adapter attached and verified. This avoids accidentally evaluating
an adapted model under a base label.

## Generation settings issue found before the complete run

Transformers 4.51.3 can replace values equal to `GenerationConfig` defaults with
the model's stored generation defaults. With this Qwen checkpoint, a plain
`GenerationConfig(do_sample=False)` did not prevent the stored `do_sample=True`
default from being substituted. The first four exploratory responses were
invalidated and are not used in this comparison.

The complete run uses `use_model_defaults=False`, explicit greedy keyword
arguments, and asserts the effective generation configuration. It records that
effective configuration in the output. Earlier historical artifacts are not
silently relabeled: their actual sampling settings must be assessed from their
own code and metadata.

## Assistant observations, not independent grades

The stricter `evidence-contract-v1` prompt is a general instruction to preserve
negations, conditions, uncertainty and time limits, cite each factual sentence,
and not accept a user's premise as fact. It contains no hard-coded financial
answer or development question ID. Its exact text is committed alongside the
original prompt.

All 52 responses were nonempty and ended before their generation limit. No
unknown CFPB source IDs were found. Uncited-response counts are 3/13 for
base/original, 4/13 for base/contract, 6/13 for adapter/original, and 4/13 for
adapter/contract. Those counts include evidence-limited responses, so they are
not citation-failure rates. In particular, the adapter/contract arm's fourth
uncited response is its false limitation on dev-011.

| Question | Observed behavior |
| --- | --- |
| dev-001 | The adapter still omits the explicit no-carried-balance and card-offers-a-grace-period conditions. A full-payment sentence alone is insufficient against the reference criteria. |
| dev-002 | The stricter prompt adds score factors, report-company contact information and the correction process. The answer still treats credit-score disclosure as unconditional and omits the alternative process for obtaining denial reasons. |
| dev-004 | The base/original response incorrectly says the purchase grace period covers cash advances. Base/contract and both adapter responses reject that premise. The adapter still makes the transaction-date interest statement more absolute than the source's "generally" qualification. |
| dev-005 | The original adapter omits its citation. The contract adapter restores `cfpb-44`, but neither expands APR to annual percentage rate. |
| dev-006 | The base/contract answer appends an unnecessary evidence limitation to relevant guidance. Adapter answers preserve some notice details but still replace "generally must notify" with an unconditional instruction and omit the index distinction. |
| dev-007 | Responses identify the duplicate-entry category; the contract adapter states the user's duplicate premise as fact instead of retaining uncertainty about the actual entries. |
| dev-008 | Both adapter arms say to contact both companies. The original lacks a citation; the contract restores it. |
| dev-009 | The adapter says copies, not originals, but drops the if-available qualification on the confirmation number and some checklist detail. The base/contract answer unnecessarily appends the canonical evidence limitation and lacks the required citations. |
| dev-010 | Original adapter invents a notice-date checklist item and omits several required fields. Contract adapter includes the consumer/collector identities, itemization and dispute end date; the list is followed by a single citation rather than per-item citations. |
| dev-011 | Original adapter gives the correct core freeze instruction. Contract adapter returns the canonical limitation despite supplied evidence answering the question. Base/contract gives the core answer but omits the fraud-alert contrast. |
| dev-003, dev-012, dev-013 | Every arm avoids the requested unsupported prediction. Contract arms return the canonical limitation. The fee-waiver answers omit the suggested issuer-contact next step in the development reference criteria. These are assistant observations, not independent refusal scores. |

These observations do not establish aggregate improvement. The prompt improves
some outputs while causing other problems. Citation presence does not establish
support, and a response containing the canonical limitation plus substantive text
must not automatically be counted as a correct refusal.

The adapter answers the cash-advance question differently here from the earlier
Q4_K_M runtime, despite using the recorded evidence and original prompt text.
This comparison does **not** isolate quantization as the cause: precision, chat
templating and inference runtime also differ. A same-runtime one-factor
comparison would be required before blaming or crediting quantization.

## Release decision and remaining work

Do not replace the public source-excerpt mode based on this experiment. Missing
conditions, incomplete answers, citation failures and false limitations remain.
The restored adapter is now available for further development; it does not need
to be retrained merely because a Colab session expired.

No independent held-out quality scores, Gemini responses or production-generation
improvement are claimed. Previously inspected questions remain development data.
Actual model weights and caches remain in ignored local directories.

## Reproduce locally on CPU

Use Python 3.12 in a separate virtual environment; this is the version tested.
Install the CPU wheel and pinned comparison requirements, restore the existing
adapter archive under the ignored `training/runs/`, then run:

```powershell
python -m pip install torch==2.11.0 --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r evaluation/requirements-comparison-cpu.txt
python evaluation/compare-adapter.py --adapter-dir training/runs/restored-20261021/fincite-experiment-20261002T213157Z/adapter-best
node evaluation/validate-adapter-comparison.mjs evaluation/results/adapter-prompt-development-20261021T184544Z.json
```

The script verifies the supplied adapter hash and refuses to overwrite results.
It downloads the public base model, needs several GB of RAM/storage, and has no
database, Modal or paid inference dependency. Timing in this CPU run is not a
Vercel latency measurement. Request packing is checked without truncation.

## Gemini comparison prepared, not executed

`evaluation/run-gemini-comparison.mjs` reuses the completed comparison's exact
question, evidence and system instructions for both prompts. It validates the
base/adapter bindings first, records the resolved provider model version, raw
responses and usage, and stops on the first failed request. There is no paid
fallback, automatic retry, tool use or search grounding.

Configure only a Google AI Studio project verified to be on the **Free** plan,
with billing disabled. Keep the key in the existing ignored local env file:

```dotenv
GEMINI_API_KEY=your-private-key
GEMINI_BILLING_PLAN=free
GEMINI_MODEL=gemini-3.5-flash-lite
```

`GEMINI_BILLING_PLAN=free` is a user attestation, not a programmatic billing
guarantee. The runner does not enable billing or provision a paid service.
Availability and free quota must be checked for the actual account. As checked
on October 21, 2026, Google's documentation lists free-tier text input/output
for Gemini 3.5 Flash-Lite; new projects should not assume access to legacy 2.5
models. Keys are sent in a request header, never URLs or stored reports.

```powershell
node --env-file=apps/web/.env.local evaluation/run-gemini-comparison.mjs evaluation/results/adapter-prompt-development-20261021T184544Z.json
```

If free quota interrupts the run, wait for that quota to recover and rerun the
same command with `--resume evaluation/results/gemini-development-TIMESTAMP.json`
using the saved result path. Successful requests are skipped; earlier failed
attempts are retained. The comparison, model, settings and runner hashes must
still match. There is no automatic upgrade or repeated paid-model fallback.

Gemini uses its provider reasoning defaults and a 1024-token output budget;
Qwen uses 256 visible tokens with thinking disabled. This preserves evidence and
instructions, not identical internal compute. A larger Gemini model is a
reference baseline, not a controlled LoRA ablation. Free-tier inputs may be used
by Google to improve its products; this bundle contains public CFPB passages and
non-personal development questions.

References checked for this integration:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite
- https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-lite
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/billing
