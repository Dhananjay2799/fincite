# Excerpt topic/scope guard: development patch

Status: draft implementation, pending Node checks, build and live retrieval verification.
Public production behavior is not changed while this branch remains unmerged.

## Why the patch exists

The [public pilot review](public-pilot-response-review-20261021.md) found exact,
properly attributed quotations that did not establish answers about arbitration,
late-payment retention or French legal deadlines. Raising the ranker's global
cutoff would also remove useful low-scoring supported passages.

## Changes

The shared excerpt path keeps its existing ranker cutoff/margin and exact-copy
checks. When called with a question through answerWithExcerpts, it additionally:

1. checks recognized explicit law/regulation modifiers against the declared US
   CFPB/known-law-topic scope, rather than treating a place in an address as
   evidence of legal applicability;
2. measures IDF-weighted question-term coverage in the selected article's
   frozen vocabulary, with a 0.4 minimum and at least two matching terms in
   the actual excerpt (or the whole query when it has only one term);
3. withholds formal process/document terms ending in -tion/-ment that are absent
   from the frozen corpus, after excluding generic question-framing words;
4. removes duplicate excerpt text across sources before applying the result cap.

The source vocabulary is derived from the eight saved articles, not question
answers, review labels or a list of blocked financial questions. The normalizer
and thresholds were revised after inspecting development replays; that tuning is
reported below. No question IDs or fixed answer lookup are used in the live guard.
No new model, dependency or provider API is introduced.

Article-level context preserves terms that are implied by an article heading or
elsewhere in the article. Body-term matching prevents a title-only match from
being enough. This is a topic heuristic, not proof that the body answers every
part of a question. Related conditional paragraphs can still be distracting.

Direct renderExcerpts calls without a question remain copying-only utilities for
compatibility; the live shared answerWithExcerpts path always passes the question.
focus_check_applied records that distinction. Policy version becomes
source-excerpts-v2-focus, and guard version is excerpt-focus-v1.

## Authoring results and limitations

The first paragraph-only prototype at coverage 0.55 rejected supported pilot
questions 007 and 016. A lower coverage threshold with title context still lost
saved cash-withdrawal, original-document and collection-letter paraphrases.
Using frozen article context plus actual-body anchors retained those paraphrases.
Generic framing terms and common suffix forms were adjusted during this work.
Unseen-process and law-scope checks are deliberately conservative.

The in-memory final replay of the 24 pilot and ten older probes retained selections
for all 16 supported pilot cases and six supported paraphrase probes, while removing
the three targeted non-answering pilot selections and the earlier mortgage-guarantee
probe's selection. It also deduplicated complaint boilerplate.

These cases influenced the implementation. They are development regressions,
not a new held-out test or an independently graded improvement. Only previously
selected units/scores were available; a new full retrieval/reranker pass can differ.

The lexical filter can reject legitimate synonyms, unseen jargon and legal-scope
phrasings, and it can accept related but insufficient text. The suffix check is
not a POS/semantic model, and the scope parser covers only a few syntactic forms.
Nothing here guarantees factual completeness, personal applicability or current law.
The arbitration cutoff was close in an earlier prototype, illustrating why the
additional process-name check and fresh live cases are needed.

Authoring execution used pure functions in the tool JavaScript runtime with a
strict canonical-URL stub. The subsequent real Node 24.21.0 CI run passed the
vocabulary check, all 22 focused tests, all 34 saved-case expectations, web lint
and production build. This exercised Node imports, real URL parsing, filesystem
and hashing checks, and the production bundler.
See the [authoring record](../evaluation/results/excerpt-focus-authoring-replay-20261021.json)
and [successful CI run](https://github.com/Dhananjay2799/fincite/actions/runs/39688578705).

The initial CI run failed because the generated in-memory source-term map used
a null prototype while the saved JSON map had an ordinary object prototype.
The builder now returns JSON-compatible maps; the full deep comparison remains
enabled. The vocabulary terms and filter policy did not change in that correction.

Vercel reported preview deployment dpl_FHBQcYyZFJcSBfzaaHnarji7GV5h ready for
implementation commit 66973ad149445a452f46d5337948dca5cc7c18d5.
Live full-retrieval verification is still pending: the connected Vercel account
returned 403 for the atom2799 team and protected preview access. Build success
does not establish runtime configuration or relevance. The PR remains draft;
production is unchanged.

## Verification

GitHub's pull-request workflow runs the vocabulary check, focused Node tests,
34-case saved replay, locked web install, lint and build on a standard runner.
It uses read-only repository permissions, pinned official checkout/setup actions,
no secrets, no model calls, no uploaded artifacts and no persistent cache.

Equivalent local checks:

```powershell
node evaluation/build-excerpt-vocabulary.mjs --check
node --test ingestion/test-excerpt-focus.mjs ingestion/test-source-excerpts.mjs evaluation/test-hosted-rag.mjs
node evaluation/replay-excerpt-focus.mjs
npm run lint --prefix apps/web
npm run build --prefix apps/web
```

The replay reconstructs and hashes each saved copied unit against the source
inventory, fingerprints inputs, and writes a new development result. It does not
call Neon, load the embedding/reranking models or invoke generation.

Before release, check a live branch build with real retrieval on unsupported
process/jurisdiction/duration questions and supported low-score/paraphrase cases.
Record false abstentions as well as rejected non-answers. If checks fail, keep the
branch in draft and revise it; do not lower evidence-integrity requirements.
Any deployment after this work needs its own recorded version and live checks.
