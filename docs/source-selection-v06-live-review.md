# Source-selection v0.6 live development review

Status: assistant review of a development run; not independent human evaluation.
Decision: **do not merge the default-mode change as a verified reliability improvement**.

Input: [raw run](../evaluation/results/local-development-2026-10-21T02-22-24-402Z.json).
Runtime health records prompt `local-live-v0.6`, mode `quoted`, policy `source-selection-v2`.
All 13 requests completed. All 13 output bodies match text in supplied source
passages after removing the appended citation and normalizing whitespace.
This confirms source copying, not answer correctness.

## Review against the saved reference criteria

| Question | Assessment | Finding |
| --- | --- | --- |
| dev-001 | Partial | Full-payment statement is relevant, but does not explain the minimum-payment distinction, grace-period eligibility and consequences of loss. |
| dev-002 | Partial | Includes reasons and the 60-day request window; omits bureau contact details, free-report right/window, correction information and score information. |
| dev-003 | Fail | Bitcoin prediction receives an unrelated extended-alert heading. No evidence-limited response. |
| dev-004 | Fail | Cash-advance paraphrase selects purchase-grace text instead of the supplied cash-advance exception and transaction-date interest. The earlier single-question success did not generalize. |
| dev-005 | Fail | Defines fixed APR behavior instead of what APR means and its annual basis. |
| dev-006 | Meets criteria | Preserves fixed-rate/index distinction, possibility of change, advance-notice qualification and future-transactions qualification. |
| dev-007 | Partial | Correctly selects duplicate-debt error bullet, but does not explicitly distinguish general guidance from deciding whether this user's entries are duplicates. |
| dev-008 | Meets criteria | Clearly states that disputes generally involve both the bureau and information supplier. |
| dev-009 | Fail | Returns only “If you mail a dispute, your dispute letter should include:” without any items or the copies-not-originals rule. |
| dev-010 | Fail | Provides validation-notice timing; does not list the requested debt-identifying or dispute information. |
| dev-011 | Meets criteria | Clearly explains separate freeze requests and distinguishes fraud alerts. |
| dev-012 | Fail | Personal bank fee-waiver prediction receives unrelated identity-theft heading. No limitation or issuer-contact guidance. |
| dev-013 | Fail | Landlord decision prediction receives an incomplete lender-notice list introduction. No limitation. |

Using these strict saved criteria: 3 of 10 answerable responses meet the criteria,
3 are partial, and 4 fail. None of the 3 unanswerable questions is correctly
refused. These are assistant judgments on already-used development questions,
not a held-out accuracy or refusal benchmark. No unsupported-answer-rate score is
assigned: exact copying does not settle relevance or misleading omission.

## Engineering findings

1. Exact copying alone is not a relevance or answerability check.
2. The current candidate builder allows standalone headings and list introductions.
   Selecting one can produce an empty-looking answer despite valid JSON and citation.
3. One-paragraph selection cannot reliably satisfy multi-part questions or preserve
   list contents. Lists and their introductions need coherent evidence units.
4. The selector needs reliable relevance and abstention behavior. Schema-constrained
   JSON guarantees output structure, not semantic correctness.
5. The quantized adapter was trained for a different response task; its ability to
   select evidence and abstain must be measured rather than assumed.
6. Before another live iteration, use this saved run for regression analysis and
   candidate-construction tests. Do not hard-code these question strings or their
   answerability into runtime behavior, and do not reuse them as a held-out test.

The PR remains a draft. Evaluation tooling and production-start support can be
reviewed separately, but the current default selector is not ready to be described
as a reliable-answer fix. No independent evaluation or permanent hosting is
completed by this result.
