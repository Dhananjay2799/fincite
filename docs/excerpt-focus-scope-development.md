# Excerpt topic/scope guard: development patch

Status: draft; updated implementation passes automated checks; fresh live verification is pending.
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
   frozen vocabulary, with a 0.4 minimum and two matching anchors from the body
   plus verified publisher context (or the whole query when it has one term),
   always requiring at least one match in the actual excerpt;
3. withholds formal process/document terms ending in -tion/-ment that are absent
   from the frozen corpus, after excluding generic question-framing words;
4. removes duplicate excerpt text across sources before applying the result cap;
5. withholds explicit personal decision guarantees, following the wider-pool
   regression documented in [the publisher-context correction](complaint-excerpt-recall-development.md).

The source vocabulary is derived from the eight saved articles, not question
answers, review labels or a list of blocked financial questions. The normalizer
and thresholds were revised after inspecting development replays; that tuning is
reported below. No question IDs or fixed answer lookup are used in the live guard.
No new model, dependency or provider API is introduced.

Article-level context preserves terms that are implied by an article heading or
elsewhere in the article. The requirement for an actual body match prevents publisher/title context alone from
being enough. This is a topic heuristic, not proof that the body answers every
part of a question. Related conditional paragraphs can still be distracting.

Direct renderExcerpts calls without a question remain copying-only utilities for
compatibility; the live shared answerWithExcerpts path always passes the question.
focus_check_applied records that distinction. Policy version becomes
source-excerpts-v3-publisher, and guard version is excerpt-focus-v3-publisher-scope.
The current ranking input includes verified CFPB publisher context; the bounded
retrieval pool of up to 20 chunks is retained until excerpt ranking. The initial
replays below predate those refinements; see the publisher-context correction.

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

## Owner-reported preview checks

On October 21, 2026, the owner pasted three responses from
https://fincite-git-fix-excerpt-focus-scope-atom2799.vercel.app/ into the project
conversation. The assistant assessed the pasted text; it could not independently
access the protected preview or bind these requests to a deployment SHA.

| Question | Observed pasted response | Assessment |
| --- | --- | --- |
| Does my credit card’s purchase grace period apply to cash advances? | The two complete cash-advance sentences, ending in [cfpb-47]. | Supported excerpt retained for this question. |
| Must I use arbitration to dispute a credit-report error? | Search limit; no excerpt selected and no supporting source cited. | Previously non-answering dispute instructions withheld for this wording. |
| Under French law, how long does a credit bureau have to investigate my dispute? | Search limit; no excerpt selected and no supporting source cited. | US deadlines withheld for this explicit jurisdiction modifier. |

The cash-advance source-card quotation was blank in the pasted copy. The primary
answer quotation was present, but source-card rendering/expansion has not been
independently verified from that copy.

These are owner-reported spot checks, not an authenticated run, broad quality
measurement or independent benchmark. Live late-payment-retention, supported
balance/limit and complaint-workflow cases remain to be checked. The latter two
are useful safeguards against false abstention because a stricter global ranker
cutoff would have lost them in the prior pilot. The PR remains draft.

## Additional owner-reported preview checks and correction

The owner then pasted three more preview responses:
late-payment retention returned a search limit; the balance/limit question
returned the relevant cfpb-313 list; the complaint-workflow question returned
only invitations to submit a complaint. That last response did not explain the
requested next steps. These observations do not authenticate deployment SHAs or
provide independent answer grades.

The updated publisher-aware ranker/focus path and larger bounded candidate pool
are documented in [complaint-excerpt-recall-development.md](complaint-excerpt-recall-development.md).
A real-model 40-question full-corpus development run now passes all selection
expectations and includes the complaint workflow. The preceding failed run is
preserved, including the approval-guarantee regression that motivated the new
scope check. These runs do not replace fresh live verification of the changed
retrieval path. The PR remains draft.
