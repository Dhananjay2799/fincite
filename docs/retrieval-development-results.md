# Initial retrieval development results

Status: provisional; full human review remains pending.

Corpus: 8 CFPB articles, 17 chunks.
Dataset: 10 answerable and 3 unanswerable development questions.
Unanswerable questions are excluded from retrieval metrics.

| Method | Source hit@5 | Source MRR@5 |
| --- | ---: | ---: |
| Vector | 1.000 | 0.950 |
| Keyword | 1.000 | 0.933 |
| Hybrid | 1.000 | 0.900 |
| Hybrid + reranker | 1.000 | 1.000 |

Reranking promoted the accepted source from rank 2 to rank 1
for dev-001 and dev-005. Inspection of those two passages
confirmed relevant supporting text. No source-rank regressions
occurred on the other eight answerable questions.

These results do not establish answer correctness, refusal quality,
or performance on unseen questions. The corpus and dataset are small.
Reranking examined all 17 chunks in this run, so this does not test
candidate selection at larger scale.

Earlier score changes caused by corrected source labels must not
be attributed to retrieval improvements.

Baseline:
evaluation/results/retrieval-2026-10-01T22-39-45-979Z.json

Reranker comparison:
evaluation/results/reranker-2026-10-01T22-42-02-076Z.json
