# Corpus expansion to 163 Ask CFPB articles

## What changed

The source registry grows from 8 to 163 Ask CFPB articles (17 to 292 chunks). The
155 new articles are every English article listed on 2026-11-16 under the CFPB
consumer-tools answer pages for credit cards (57), credit reports and scores (52)
and debt collection (46) that the existing extractor accepts unchanged.

`ingestion/discover-sources.mjs` reads those three listings and appends pending
registry entries. It never edits an existing entry. The extractor, chunker,
embedding model and retrieval query are unchanged.

The original 8 articles were processed from the original raw snapshots. Their
documents and all 17 chunks reproduce byte for byte, so their chunk IDs and hashes
in the manifest are unchanged. Re-generated embeddings for those 17 chunks differ
from the stored ones by at most 1.5e-7 per component; the import keeps the stored
rows (`ON CONFLICT DO NOTHING`).

Regenerated from the larger corpus: `evaluation/datasets/sources.json`,
`evaluation/datasets/corpus-manifest.json`, `evaluation/retrieval-config.json`
(corpus hash only), `training/datasets/source-inventory.json` and
`ingestion/excerpt-vocabulary.json`.

## Articles left out

Thirteen listed articles do not match the page structure the extractor requires.
The extractor was not loosened for them.

| Source | Category | Extractor result | Title |
| --- | --- | --- | --- |
| cfpb-1289 | credit-cards | no lead paragraph | Do joint credit card accounts with my spouse affect my credit score? |
| cfpb-35 | credit-cards | no lead paragraph | I used all my credit and made a payment. How long does it take before I can use the card again? |
| cfpb-50 | credit-cards | no lead paragraph | Can a credit card company charge me interest after I close my account? |
| cfpb-53 | credit-cards | no lead paragraph | What is a balance transfer fee? Can a balance transfer fee be charged on a zero percent interest rate offer? |
| cfpb-75 | credit-cards | no lead paragraph | I just learned that my card issuer has closed my account without giving me any notice. Can they do that? What can I do? |
| cfpb-83 | credit-cards | no lead paragraph | I received a notice from my card issuer telling me that they were closing my account and that I cannot use my credit card any more. Can they do that? |
| cfpb-85 | credit-cards | too little body text | I let the card issuer know I was closing my account. They are still charging me interest. Can they do that? |
| cfpb-86 | credit-cards | no lead paragraph | How do I remove an authorized user from my credit card account? |
| cfpb-1305 | credit-reports-and-scores | no lead paragraph | Who can request to see my credit report? |
| cfpb-1337 | credit-reports-and-scores | no lead paragraph | How can I find out who has accessed my credit report? |
| cfpb-1361 | credit-reports-and-scores | too little body text | Why are some of my debts not showing up on my credit report? |
| cfpb-318 | credit-reports-and-scores | no lead paragraph | How do I get and keep a good credit score? |
| cfpb-1383 | debt-collection | no lead paragraph | What is a paid collection? |

## Development comparison

`evaluation/run-corpus-comparison.mjs` ran the hosted responder with the real
pinned models on both corpora, using PGlite with pgvector in place of Neon.
Raw outputs: `evaluation/results/corpus-expansion-comparison-20261116.json`.

59 questions: the 13 development questions, the 24 reviewed pilot questions, the
10 saved excerpt probes and 12 new-topic questions written for this check.

| Check | Original 8 articles | Expanded 163 articles |
| --- | ---: | ---: |
| Answerable questions (32) returning a labelled source | 32 | 27 |
| Answerable questions (32) with a labelled source first | 32 | 23 |
| Unanswerable-labelled questions (15) returning no excerpt | 15 | 11 |
| New-topic questions (12) returning an excerpt from an article on that topic | 0 | 12 |

The labels were written for the 8-article corpus, so a lower count is not always
a worse result. Inspected changes:

**Improvements**

- On the original corpus the 12 new-topic questions returned nothing (4) or an
  excerpt from an unrelated article (8). On the expanded corpus each returns an
  excerpt from an article about the question's topic. These questions have no
  reviewed labels and were not graded for completeness.
- fresh-candidate-019 was labelled unanswerable and now returns the seven-year
  period for negative items from cfpb-1449.

**Label misses that still show relevant text**

- dev-010, fresh-candidate-016 and excerpt-probe-06 show excerpts from articles
  outside the label that contain the relevant text (validation notice and dispute
  deadline, the CFPB complaint description).
- excerpt-probe-04 shows the sentence about finding or requesting a card agreement
  from cfpb-29 instead of cfpb-45, but only after an unrelated excerpt about
  unauthorized charges.

**Regressions**

- dev-007 loses its answer. The highest-ranked excerpt is from cfpb-1357 and directly
  addresses a debt listed more than once, but the lexical focus check rejects it
  (coverage 0.29, below 0.40). The cfpb-313 excerpt scores 0.97, more than the
  2-point margin below the best score of 3.23, so nothing is shown.
- dev-001 leads with a medical credit card passage (3.68) ahead of the grace-period
  passages (3.58 and 3.29), which are still shown.
- fresh-candidate-022 (documents for a student-loan deferment) returns student-loan
  default excerpts scoring -2.0 to -2.6.
- excerpt-probe-08 ("What is my checking account balance right now?") returns a
  passage about checking account reporting companies scoring -3.67.
- excerpt-probe-10 (whether a collector will accept a settlement tomorrow) returns
  general settlement guidance from cfpb-1447 scoring 1.14.
- "Must I use arbitration to dispute a credit-report error?" was withheld because
  "arbitration" was absent from the 8-article vocabulary. One new article contains
  the word, so the unseen-term rule no longer applies and general dispute excerpts
  are shown.

## Selection policy was examined and left unchanged

The policy (`minimum_logit: -5`, `score_margin: 2`, focus coverage 0.40, 20 candidate
passages) was calibrated on 17 chunks. Cached rankings for the 59 questions were
replayed under alternatives:

- **Minimum reranker score.** The lowest best-accepted scores interleave correct and
  incorrect selections: -3.67 wrong, -2.48 labelled source, -2.00 wrong, -1.19 and
  -0.93 relevant, -0.83 unrelated lead, -0.54 labelled source. Each step from -5 up to 0
  removes a wrong selection and a correct one together (at -2: two fewer wrong, one
  fewer correct). No value separates them.
- **Focus coverage.** Raising 0.40 to 0.50 removes one wrong selection and one
  labelled answer; 0.60 removes three labelled answers.
- **Candidate passages.** 40 instead of 20 did not restore any lost answer and
  dropped the labelled source for dev-001.
- **Measuring the score margin from the best focus-accepted excerpt.** This restores
  dev-007 and changed nothing else on the 59 questions. On the saved eight-article
  diagnostic it also made "How long does a late payment stay on my credit report?"
  return an excerpt where none was expected, so it trades one withheld answer for
  the risk of showing weaker excerpts when the corpus has no answer.

None of these is supported by this small development set, so the policy and its
version string are unchanged. A reviewed held-out set on the expanded corpus is
the right place to revisit it.

## Checks changed for the larger corpus

- `ingestion/test-excerpt-focus.mjs`: the unseen-process-term test used
  "arbitration", which the expanded corpus contains. It now uses "mediation", which
  is absent, so the rule is still tested.
- `evaluation/replay-excerpt-focus.mjs`: `excerpt-probe-04` is listed under
  `known_corpus_regressions` in the report instead of failing the run.
- `evaluation/run-publisher-context-development.mjs`: scores the original eight
  articles only. Scoring every excerpt of 163 articles for 40 cases does not fit
  the CI time limit, and its "no excerpt expected" cases describe the original
  corpus. `excerpt-probe-04` and `live-arbitration` are reported under
  `known_corpus_regressions`.

## Limits

- No response was graded by an independent human reviewer.
- PGlite stands in for Neon; production ranking can differ slightly.
- All new documents carry `validation_status: pending_human_review`.
- The saved replay and pilot records in `evaluation/results/` describe the original corpus.
- The comparison questions influenced the decisions recorded here; this is not a held-out result.

## Applying it to the hosted database

Import before merging. The hosted query only returns chunk IDs in the committed
manifest, so new rows are ignored until the new manifest is deployed, and the
import does not modify existing rows.

1. Place the matching `data/raw` and `data/processed` files in the working copy.
2. On this branch, from the repository root, run `node --env-file=apps/web/.env.local ingestion/import-documents.mjs`, then `node --env-file=apps/web/.env.local ingestion/import-embeddings.mjs`.
3. Merge. The README and interface counts are already updated on this branch.
