# Reliability and release changes

## What this patch changes

The bridge now defaults to `FINCITE_ANSWER_MODE=quoted`. The same fine-tuned
model selects complete sentences from the retrieved evidence. A deterministic
check requires each selected sentence to occur in the cited passage, with its
original wording. Arbitrary substring matches are not sufficient: clipping the
condition off an `if` sentence is rejected. Unknown citations, uncited claims,
internal reasoning markers and cut-off responses are withheld.

This deliberately trades paraphrasing for inspectable source wording. It does
not establish relevance, completeness, personal applicability, source freshness,
or semantic correctness. A model can choose the wrong sentence or omit a related
exception. Source passages can also contain instructions, which must still be
treated as untrusted data. Quote matching is not a prompt-injection solution.

Use `FINCITE_ANSWER_MODE=generated` in `apps/web/.env.local` to compare the
original generation prompt. This mode checks citation IDs, withholds entirely
uncited output, and warns that factual support has not been verified.

Prompt version is now `local-live-v0.5`; policy version and mode appear in bridge
health. The canonical evidence-limited response is a UI state, not a quality
grade. The model may abstain on an answerable question.

The first local check exposed a false refusal on the cash-advance question even
though the first passage contained an answer. Quoted mode now makes one bounded
retry after an initial abstention, using only the first-ranked packed passage and
a focused sentence-extraction instruction. The retry is token-budgeted and subject
to the same quotation checks. It can still abstain. `generation_attempts` and
`initial_abstention` identify retries in saved API responses. Mock regression tests
exercise this path; improved live answer coverage has not yet been measured.

### Local verification

```powershell
node --test ingestion/test-live-rag.mjs evaluation/test-heldout.mjs
node scripts/start-local.mjs
```

Record another **development** run before choosing this mode for a presentation:

```powershell
node evaluation/run-local-development.mjs
```

Compare completed answers, withheld outputs, correct answers, false refusals and
source relevance. The code tests use mocked model responses; the model, Neon
database and large runtime artifacts are not available in the patch environment.
No new model-quality or latency result is claimed by this patch.

## Independent held-out evaluation

`evaluation/heldout.mjs` provides a freeze → run → score workflow. It requires
at least 120 questions, both answerability categories, known supporting sources,
distinct IDs, human review attestations, an author different from the reviewer,
and no exact normalized question or declared-group overlap with the existing
development, starter, training or validation questions. Semantic overlap checks
must be performed by the reviewer; software cannot authenticate that attestation.

Prepare `evaluation/datasets/test-reviewed.jsonl` with one object per line.
Example schema below is illustrative, not an approved question to copy into the
test. Reference criteria must be written and checked against the frozen corpus.

```json
{
  "id": "test-001",
  "split": "test",
  "group_id": "new-question-family",
  "question": "A new question not used for training or prompt tuning",
  "answerability": "answerable",
  "source_ids": ["cfpb-47"],
  "reference_claims": ["Criteria checked against the source"],
  "forbidden_claims": [],
  "authored_by": "question-author-id",
  "review_status": "approved",
  "review": {
    "reviewer_type": "human",
    "reviewer_id": "different-reviewer-id",
    "semantic_overlap_checked": true,
    "evidence_checked": true
  }
}
```

Freeze once, after review and before exposing the test to the model:

```powershell
node evaluation/heldout.mjs freeze evaluation/datasets/test-reviewed.jsonl evaluation/datasets/test-frozen.json
```

The manifest records questions and hashes of the corpus, chunks and reserved
datasets. It refuses to overwrite an existing file. A 120-question test on eight
articles is still a small-domain evaluation, not proof of large-scale retrieval.
Increase article coverage separately and freeze a new matching corpus before
claiming broader generalization. Keep the test out of all tuning and training.

With local services running, record every request, including failures:

```powershell
node evaluation/heldout.mjs run evaluation/datasets/test-frozen.json evaluation/results/test-run.json
```

Have an independent person grade successful responses against the supplied
passages and reference criteria. Save a JSON array in `test-reviews.json`:

```json
[
  {
    "question_id": "test-001",
    "reviewer_type": "human",
    "reviewer_id": "independent-reviewer-id",
    "correct": false,
    "substantive_answer": true,
    "has_unsupported_claims": true,
    "refused": false,
    "citation_supported": false
  }
]
```

For a refusal use `substantive_answer=false`, `has_unsupported_claims=false`, and
`refused=true`; mark `correct` using the actual question, not the API disposition.
The scorer requires a citation-support label whenever the response cites a source.
Do not label automated or assistant-generated grades as independent human review.

```powershell
node evaluation/heldout.mjs score evaluation/datasets/test-frozen.json evaluation/results/test-run.json evaluation/results/test-reviews.json evaluation/results/test-scores.json
```

Scores retain coverage, failed requests, unsupported answers, correctness, refusal
recall, false refusals and supported cited responses. No substantive answers means
an undefined unsupported-answer rate, not 0%. Successful requests missing human
reviews cannot be scored. This patch supplies tools, not a completed independent
test or an invented improvement number.

## Production server preparation

Stop the local launcher before building, then run:

```powershell
npm run build --prefix apps/web
node scripts/start-local.mjs --production
```

This starts `next start` instead of `next dev`, while inference and the bridge
remain bound to loopback. The default launcher behavior remains development mode.
The production option requires a completed build before starting any services.
Changing application code requires rebuilding. Existing public-origin checks
remain in place. Avoid exposing ports 8080 or 8081 directly.

**Permanent hosting is not completed by this command.** It still depends on the
laptop and the separately retained model, runtime and corpus artifacts. A Quick
Tunnel is a temporary demonstration link, even when serving a production build.

Under the current no-payment-method constraint, a compute host with sufficient
RAM/storage and continuous service must be verified before selecting a deployment.
Hugging Face currently requires a paid plan to create compute Spaces; its free
static Spaces cannot run this Node/model backend:
https://huggingface.co/docs/hub/en/spaces-overview

The available deployment artifacts do not include a reusable public model download
URL, a Linux inference runtime or a provisioned always-on server. Do not change the
deployment status to completed until an external-browser request succeeds with
the laptop stopped. A permanent frontend showing curated examples must be labelled
as a preview and is not equivalent to hosted RAG inference.
