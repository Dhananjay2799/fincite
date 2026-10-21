# Fresh evaluation candidate pilot v1

Status: draft candidate pool, not a held-out benchmark.
Question author: assistant-fresh-candidates-v1.
Independent human review: pending for every record.
Generation on these candidate questions: not performed.

## Prepared artifacts

- [24 candidate questions](../evaluation/datasets/fresh-candidates-v1.jsonl): 16 proposed answerable, eight proposed unanswerable, 24 proposed question groups.
- [Candidate integrity audit](../evaluation/results/fresh-candidates-audit-v1.json).
- [Repeatable audit script](../evaluation/audit-fresh-candidates.mjs).

Sixteen evidence quotations are bound to exact chunk IDs and offsets in the existing source inventory. The inventory was read from GitHub at commit 956afbf8cefedff0c5a9f427f1ac7e30cd9431bd (blob 9f7d99eec49cc6c56d133dc34fe7e62a56d320f3). The corpus is the existing eight-article snapshot. The questions are new drafts; the source text itself has appeared in project data and sometimes model contexts. This is not source-held-out evaluation.

The audit checked 85 reserved records: 13 development, 12 starter, 48 training and 12 validation questions. There are no exact normalized question or declared group-ID collisions. This is not proof of semantic novelty: renaming a group or rephrasing a question cannot make it held out.

## Overlap and evidence limits

Each record includes overlap-review notes. Initial-alert report benefits, active-duty marketing exclusions, extended-alert verification, compromised-account actions and score-effect questions are particularly close to previously used families. These should be excluded or replaced if a reviewer finds the same underlying task. Do not accept them just because the lexical check passes. Other reporting/dispute tasks need the same semantic review.

Proposed unanswerable records need corpus-wide absence review; empty evidence arrays do not prove absence. Proposed answerable criteria need evidence-sufficiency review. No record claims a completed human review.

The CLI validates exact quotes against training/datasets/source-inventory.json, not a freshly downloaded CFPB page or independently reverified raw snapshot. Run the existing corpus/chunk validators separately before a frozen test. Do not treat this as current financial or legal advice.

## Run the integrity audit

From the repository root:

```powershell
node evaluation/audit-fresh-candidates.mjs
```

This needs no API key, model, database or local services. It sends no network requests and performs no inference. An optional second positional path saves a new audit without overwriting a file:

```powershell
node evaluation/audit-fresh-candidates.mjs evaluation/datasets/fresh-candidates-v1.jsonl evaluation/results/fresh-candidates-audit-local.json
```

The exported pure validation function was exercised on the 24 records in the tool's JavaScript runtime. Six negative fixtures were rejected: a reserved question, altered quote, unknown source, fabricated approval, duplicate ID and invalid offsets. The Node CLI and repository tests were not executed because the coding environment is offline. No CLI execution is implied by the saved audit.

## Before a real held-out run

1. Keep these candidates out of training, prompt changes, model selection and response inspection. Model developers should not tune against their criteria.
2. Have a human other than the question author review semantic overlap, corpus-wide answerability and supporting evidence. Exclude overlapping groups rather than renaming them. Record actual reviewer identities and decisions; never synthesize approval.
3. Expand corpus coverage and the candidate pool to obtain at least 120 accepted questions under the existing project policy. Repeated paraphrases of eight articles are not 120 independent tasks. Keep related question variants in the same split and report group-level uncertainty.
4. Choose and freeze system settings before test outputs are inspected. Bind corpus, candidate, code and model identities using the existing heldout workflow, extending it for matched model arms only after that extension is verified.
5. Run once and collect independent answer reviews. Report failures, substantive answer coverage, correctness, unsupported claims, false refusals and citation support with their denominators.

The current heldout.mjs freezes only approved split=test records with human attestations and its default 120-question minimum. These split=candidate records are intentionally ineligible. No gates, app behavior or production generation settings have changed. The current HTTP heldout runner evaluates the deployed/local response path; it does not yet run all three generation arms with matched evidence.

This pilot prepares reviewable inputs. It does not complete independent evaluation, establish model improvement, or justify switching the public app away from source excerpts.
