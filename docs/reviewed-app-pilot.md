# Reviewed 24-question app pilot

## Question review received

The owner-supplied [review export](../evaluation/results/fresh-question-review-2026-10-21T21-59-25-055Z.json)
contains 24 saved approvals by reviewer Dhananjay, covering all three question-review checks.
The IDs and question strings match the original candidate snapshot exactly.
All candidates remain unchanged in their original file; the runner derives a separate
split=pilot question set and preserves the review provenance.

These are self-attested question-review decisions, not independent authentication
of the reviewer or model-answer grades. Approval does not remove known adjacency
to earlier question families. This small same-corpus pilot does not meet the current
120-question formal-test requirement, and it does not change that requirement.

## What runs next

The runner sends only the reviewed question text to the chosen app's /api/chat.
The default public app behavior is source excerpts. This evaluates the HTTP app
path, not a matched base/LoRA/Gemini generation comparison. No Gemini key, model
download, training, local inference server or billing change is needed.

Before requests, the runner:

- verifies the normalized candidate Git blob against the reviewed snapshot;
- binds every review ID, question, saved decision, reviewer and choice;
- reruns the candidate audit and existing corpus/chunk validators;
- checks all 17 local chunks against the source inventory;
- fingerprints the local corpus, reserved data, question review and client code;
- saves those inputs in a new result file before the first request.

It records raw successful/error responses, output modes, transport failures,
elapsed times and citation-ID diagnostics. It sends no reference claims or human
labels to the app. An entirely uncited limitation can be a valid HTTP response;
it is not automatically a correct refusal. Exact source IDs do not prove relevance.

The remote deployment, Neon corpus snapshot and model identity are not attested
by this HTTP client. Local input fingerprints do not prove that a remote server
used those exact inputs. Avoid deployments, database changes and other requests
during the run, and record these limits when interpreting results.

## Commands

From the repository root, check the pure functions:

```powershell
node --test evaluation/test-reviewed-pilot.mjs
```

Then record the public app pilot:

```powershell
node evaluation/run-reviewed-pilot.mjs --base-url https://fincite-rouge.vercel.app
```

To verify inputs and write a preparation record without sending requests:

```powershell
node evaluation/run-reviewed-pilot.mjs --base-url https://fincite-rouge.vercel.app --prepare-only
```

Reports are saved under evaluation/results/reviewed-pilot-<UTC timestamp>.json.
The file exists before requests begin and is updated after each response.
Three consecutive failures stop the run with partial results preserved.
HTTP failures still count as attempts. There is no automatic failed-request retry.

Resume an interrupted or failed run explicitly, preserving the same app and inputs:

```powershell
node evaluation/run-reviewed-pilot.mjs --base-url https://fincite-rouge.vercel.app --resume evaluation/results/REPLACE-WITH-THE-SAVED-REPORT.json
```

Successful records are skipped. Failed records are retried only on this explicit
resume, and the earlier failed attempts remain in the report. Changed inputs or
client code reject resume. Invalidated runs cannot be resumed.

## Status and interpretation

A complete response run is complete_ungraded_pilot, with quality_scores=null and
benchmark_ready=false. Do not pass a pilot report to heldout.mjs or change its
purpose to make it look like a formal held-out test. The formal 120-question
freeze and score workflow remains unchanged.

Once this pilot is run, these question/response pairs are exposed evaluation
data. Do not tune on them and later reuse them as an untouched final test.
Fresh formal test families and broader corpus coverage remain separate work.
A reviewer must assess answer correctness, source relevance, completeness,
unsupported claims and refusals after responses exist. The earlier approval
covered the questions, not the eventual answers.

Authoring verification: the binding function passed the actual 24-review fixture
and rejected eight provenance/decision mutations in the tool JavaScript runtime.
The module body was syntax-parsed after imports were removed and import.meta was
substituted. This is not a substitute for Node module execution. Node tests,
filesystem checks and public HTTP requests have not been run by the assistant
because its coding environment is offline; the commands above perform those checks
on the owner's computer.
