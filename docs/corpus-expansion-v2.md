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

49 questions: the 13 development questions, the 24 reviewed pilot questions and
12 new-topic questions written for this check.

| Check | Original 8 articles | Expanded 163 articles |
| --- | ---: | ---: |
| Answerable questions (26) returning a labelled source | 26 | 23 |
| Answerable questions (26) with a labelled source first | 26 | 19 |
| Unanswerable-labelled questions (11) returning no excerpt | 11 | 9 |
| New-topic questions (12) returning an excerpt from an article on that topic | 0 | 12 |

The labels were written for the 8-article corpus, so a lower count is not always
a worse result. Inspected changes:

- **New topics improve.** On the original corpus the 12 new-topic questions
  returned nothing (4) or an excerpt from an unrelated article (8). On the expanded
  corpus each returns an excerpt from an article about the question's topic. These
  12 questions have no reviewed labels and were not graded for completeness.
- **dev-007 loses its answer.** The highest-ranked excerpt is now from cfpb-1357
  and directly addresses a debt listed more than once, but the lexical focus check
  rejects it (coverage 0.29, below 0.40). The cfpb-313 excerpt scores 0.97, more than
  the 2-point margin below the best score of 3.23, so nothing is shown.
- **fresh-candidate-022 gains a wrong answer.** A question about documents for a
  student-loan deferment now returns student-loan default excerpts with reranker
  scores of -2.0 to -2.6. They pass the -5 minimum and the focus check but do not
  answer the question.
- **dev-001 leads with a weaker excerpt.** A medical credit card passage (3.68) ranks
  just ahead of the grace-period passages (3.58 and 3.29), which are still shown.
- **dev-010, dev-008 and fresh-candidate-016** show excerpts from articles outside
  the label that contain the relevant text (validation notice, disputing with both
  companies, the CFPB complaint description).
- **fresh-candidate-019** was labelled unanswerable and now returns the seven-year
  period for negative items from cfpb-1449.

## Checks that now fail

Both encode calibration on the 8-article corpus:

- `ingestion/test-excerpt-focus.mjs`, "unsupported process-name paraphrases fail":
  the test relies on "arbitration" being absent from the corpus vocabulary. The
  expanded corpus contains it, so the unseen-term rule no longer rejects the question.
- `evaluation/replay-excerpt-focus.mjs`, `excerpt-probe-04`: the saved selection for
  "Where do I ask for a card agreement that is missing online?" is rejected under
  the new document-frequency weights.

These have not been edited. The selection policy (`minimum_logit: -5`,
`score_margin: 2`, focus coverage 0.40) was calibrated on 17 chunks and needs to be
re-examined against the larger corpus before these expectations are replaced.

## Limits

- No response was graded by an independent human reviewer.
- PGlite stands in for Neon; production ranking can differ slightly.
- All new documents carry `validation_status: pending_human_review`.
- The saved replay and pilot records in `evaluation/results/` describe the original corpus.

## Applying it to the hosted database

Import before merging. The hosted query only returns chunk IDs in the committed
manifest, so new rows are ignored until the new manifest is deployed, and the
import does not modify existing rows.

1. Place the matching `data/raw` and `data/processed` files in the working copy.
2. On this branch, from the repository root, run `node --env-file=apps/web/.env.local ingestion/import-documents.mjs`, then `node --env-file=apps/web/.env.local ingestion/import-embeddings.mjs`.
3. Merge, then update the article and passage counts in the README and interface.
