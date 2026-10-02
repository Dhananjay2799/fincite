# FinCite Session 8 dataset drafts

48 training examples (32 grounded answers, 16 refusals) and 12 validation examples (8 grounded answers, 4 refusals). All 60 are assistant-authored drafts with `pending_review` status.

Save this folder under `training/datasets/v01/`. From the FinCite repository root, run:

```powershell
node training/datasets/v01/validate-dataset-v01.mjs
```

Evidence snippets are exact source spans, with offsets and SHA-256 hashes of their originating uploaded passages. Half of the grounded examples also include an unrelated snippet from the same split. Refusal examples have irrelevant evidence and source-limited answers. These deliberately short contexts exercise evidence use; they do not reproduce the full retrieval pipeline.

Two question variants share each target group. Group variants stay in one split. The 13 development questions and their main question intents are reserved. Related financial topics still overlap; automatic validation excludes exact copies but does not certify absence of semantic leakage. The accompanying manifest records the intended exclusions.

Validation groups differ from training target groups. Source articles are shared, so this is not an article-disjoint benchmark. The earlier smoke run used some of the training facts and full source passages: start the new experiment from the pinned base model, not its smoke adapter. Do not concatenate the old smoke dataset into these splits.

Before model training, review target answers for support, necessary qualifiers, refusal adequacy, and overlap with development questions. No human approval or independent judge labels are asserted. Do not use validation questions for gradient updates. A separate, broader final held-out test is still needed.

The dataset is intentionally small (eight articles). Report any later result as a small development experiment; do not claim that 60 examples are a large training corpus or that these drafts have already improved the model.
