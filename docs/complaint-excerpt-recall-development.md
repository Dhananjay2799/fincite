# Complaint workflow excerpt: development correction

## Observed behavior

In the owner-pasted preview response on October 21, 2026,
"What does the CFPB do after I submit a complaint?" returned invitations to submit
a complaint. Those excerpts did not explain what happens afterward.
The same live round retained the supported balance/limit list and withheld
a late-payment-retention answer. These are owner-reported spot checks; the
assistant could not access the protected deployment or authenticate request SHAs.

## Diagnosis and change

A pinned-model diagnostic ranked all 75 evidence units from the 17 saved chunks.
The unmodified input scored a complaint invitation at 4.8928 and the workflow
paragraph at -4.1531. Increasing candidate recall alone did not fix that ordering.
Adding the same verified publisher context to every ranking input moved the
workflow paragraph to 6.0494, above the invitation at 5.9299. The source paragraph
says "we" and does not repeat "CFPB".

The final change:

- adds "Consumer Financial Protection Bureau (CFPB) source excerpt:" only to
  ranking inputs, for verified canonical CFPB URLs and IDs;
- allows the frozen source publisher to supplement question-term anchors, while
  still requiring at least one matching term in the actual excerpt;
- passes the bounded pool of up to 20 retrieved chunks to excerpt reranking
  instead of discarding all but five beforehand, on hosted and local paths;
- retains exact source span and attribution checks, token limits, score cutoff,
  score margin, three-unit cap and exact-text deduplication;
- withholds explicit personal decision guarantees (such as guaranteeing the
  user's mortgage approval) through a narrow query-scope rule.

The source vocabulary remains derived from the saved source texts. Publisher
metadata supplies context; it does not alter copied quotations. The output
policy is source-excerpts-v3-publisher; the focus policy is
excerpt-focus-v3-publisher-scope; the ranking input is cfpb-publisher-context-v1.

Raw retrieved rows from the failing live question were not captured, so early
top-five truncation is a recall risk, not an independently established cause of
that specific request. The full-corpus diagnostic does establish the ranking
and focus-anchor failures with these fixed inputs.

## Regressions and limits

The first 40-question run with publisher context and the larger candidate pool
returned a non-answering anti-discrimination excerpt for a mortgage-approval
guarantee question. That failed result is preserved in
[publisher-context-regression-development-20261021.json](../evaluation/results/publisher-context-regression-development-20261021.json).
The personal-decision-guarantee scope rule was added in response.
It covers explicit guarantee/ensure/promise wording tied to personal decisions;
it is not a complete parser for future or account-specific questions.

The earlier plain/publisher comparison is preserved in
[complaint-publisher-diagnostic-20261021.json](../evaluation/results/complaint-publisher-diagnostic-20261021.json).
Its post-ranking result predates the publisher-aware focus adjustment and
therefore still excludes the workflow paragraph despite the improved rank.

These inspected cases influenced the changes. Full-corpus selection checks
are development regressions, not held-out correctness or refusal scores.
They exercise the real pinned ranker but do not contact Neon or the preview.
The broader candidate pool can admit different related non-answers. The guards
remain lexical heuristics and may falsely abstain or accept incomplete material.

The workflow paragraph is expected to explain forwarding the issue to the
company, a tracking number, and status updates. The owner-reported updated complaint preview check is recorded below.

## Automated verification

Implementation commit 2bdd7468e4597c4c45917074f1f8c8828a55a2a4 passed
[GitHub checks](https://github.com/Dhananjay2799/fincite/actions/runs/39691656479):
26 focused Node tests, vocabulary reproducibility, the 34-case saved replay,
all selection expectations in the 40-question real-model full-corpus run,
web lint and production build. The complaint workflow paragraph appears first
in the saved development answer, followed by related submission invitations.

[Saved full-corpus run](../evaluation/results/publisher-context-development-20261021.json)
includes raw copied responses, model config, input hashes and limitations.
Forty passing selection expectations are not forty independently correct answers.
The selection rules and checks were developed using these cases; no benchmark
quality or refusal score is claimed.

The tests also cover a supporting passage arriving after five retrieved rows,
publisher context without rewriting source text, hostile source domains,
publisher-only false matches, and personal-decision guarantees.

## Updated owner-reported preview check

On October 21, 2026, the owner pasted the updated response from
https://fincite-git-fix-excerpt-focus-scope-atom2799.vercel.app/ .
For "What does the CFPB do after I submit a complaint?", the first excerpt now
describes forwarding the issue to the company, providing a tracking number and
keeping the user updated, attributed to cfpb-313. Two related submission
invitations follow. This addresses the observed missing-workflow issue, while
the extra invitations remain less useful than the first excerpt.

This is an owner-pasted UI observation, not an independently authenticated HTTP
capture or a binding to a deployment SHA. The protected preview remained
inaccessible to this assistant. No new quality score is inferred from the check.

The latest complete CI run for branch commit
358e226a0889d0f0ce84e9ebb3dc51749ae3df05 passed:
https://github.com/Dhananjay2799/fincite/actions/runs/39691942812 .
The earlier failed notification for 5a04e42 refers to the preserved
approval-guarantee regression, which the later scope correction addresses.
The implementation is ready for review; this record does not assert a
production deployment or independent benchmark result.
