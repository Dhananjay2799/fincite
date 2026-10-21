# Offline candidate-question review

Open `evaluation/review/fresh-question-review-v1.html` in a browser.
It embeds 24 candidate questions, all 85 reserved question texts and all eight
source articles' saved passages. No server, key, model or network is needed.

1. Enter your own reviewer name/ID.
2. Review a candidate, its proposed criteria and supporting excerpt. Use the
   complete saved corpus below for context, especially for absence claims.
3. Check the reserved questions and author overlap notes. New wording or a new
   group name is not proof of a new underlying task.
4. Choose Yes, No or Unsure for each of the three checks, then Save decision & next.
   Any No excludes the candidate; otherwise any Unsure marks follow-up; all Yes
   approves the proposed question. This is self-attested question review only.
5. Click Export reviews · one JSON. Export once after your session, not once
   per question. Partial exports are allowed. Keep the JSON as your backup.
   Restore review JSON imports saved decisions from the same embedded dataset.

Progress is stored in browser localStorage when available. If it is blocked,
the page says so and retains state in memory until closed. Export before changing
browsers or clearing data. Counts include excluded and Unsure decisions as
reviewed; they are not counted as approved. Editing a saved item makes it unsaved
until you save again. The page never fabricates approval or reviewer identities.

The page is bound to candidate data at commit 50927e2ad12de65326e36d65d08422c4dc82fd02.
It does not pick up later edits to the candidate JSONL. Update the embedded bundle
and its version together if the dataset is revised; do not reuse old decisions
against changed question text or evidence.

The exported file has kind=fincite_candidate_question_review_v1 and records
the dataset commit, question text, three choices, decision, reviewer ID,
timestamp, notes and pending IDs. No generated model answers are included or graded.
Reviewer identity and actual review work are not independently authenticated.

Approved here does not mean benchmark-ready. The 120-question minimum and
independent-review attestations in heldout.mjs remain unchanged. This page does not
freeze a test, run any model, lower a gate or produce model quality scores.
Overlapping candidates should be excluded, not renamed to evade the check.

Verification during authoring: five decision-rule fixtures passed in the tool's
JavaScript runtime, and the embedded application script parsed successfully without
execution. Browser rendering, file download/restore and persistence have not been
exercised because the coding environment is offline. Check those interactions on
your computer before relying on a long review session.
