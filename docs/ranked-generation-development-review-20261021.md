# Ranked generation development review

Assistant review of `evaluation/results/ranked-generation-development-2026-10-21T15-06-22-871Z.json`, recorded in commit ac056d9. This is a development analysis of the saved responses and supplied evidence, not independent human grading or a held-out benchmark.

## Decision

Do not promote this generation policy to the live app. Better evidence selection did not prevent the model from contradicting supplied evidence. A supplied citation ID is insufficient to establish factual support. Keep the PR in draft; this experiment does not establish reliable grounding.

The run recorded all 13 questions: ten model generations and three relevance-gate abstentions. One generated response failed the existing guard and was withheld. No input changes were reported. API completion is not answer correctness.

## Response review

| Question | Finding against saved evidence and reference criteria |
| --- | --- |
| dev-001 | Correctly explains that minimum payments can leave interest charges, loss of a grace period, and interest on new purchases. Incomplete against the full criteria: does not explicitly state the no-carried-balance condition for avoiding purchase interest. |
| dev-002 | Partial notice checklist. Omits score factors and correction information, omits the alternative right to request reasons within 60 days, and describes the score as the lender's score rather than the score used. |
| dev-003 | Gate produced the canonical limitation; no model generation occurred. |
| dev-004 | Incorrect and contradicted by the supplied cash-advance paragraph: says the purchase grace period generally allows interest-free cash advances if paid in full. The citation-ID guard accepted it. |
| dev-005 | Explains a yearly interest rate but does not expand APR. Adds a fixed-or-variable claim under cfpb-44 that the cited unit does not establish; the additional variable-rate unit does not supply the fixed-rate claim. |
| dev-006 | Correctly says fixed does not mean immutable and mentions notice and subsequent transactions. Omits the index distinction and changes “generally must notify” to unconditional “must notify.” |
| dev-007 | Recognizes duplicate debt as an error to check. Does not explicitly preserve uncertainty about this person's entries and adds bureau correction advice absent from the supplied unit. |
| dev-008 | Answers that both the bureau and supplier should be contacted, with supported additional dispute-statement information. |
| dev-009 | Withheld by the guard for lacking a recognized citation. Raw text first reproduces copies-not-originals guidance, then contradicts it by instructing users to send originals directly to the bureau. Also emits literal [source_id]. This is a substantive grounding failure as well as a citation failure. |
| dev-010 | Partial checklist; omits consumer information and itemization, invents a notice-date checklist item, and adds a requirement-like instruction to provide evidence not established in the supplied units. |
| dev-011 | Correct core answer: each bureau must be contacted individually. Omits the requested contrast with fraud alerts. |
| dev-012 | Gate produced the canonical limitation; no model generation occurred. It does not give the requested issuer-contact next step. |
| dev-013 | Gate produced the canonical limitation; no model generation occurred. |

The qualitative entries above separate missing reference details from unsupported additions and direct contradictions. No aggregate correctness or unsupported-answer rate is claimed.

## What the experiment establishes

The reranked inputs contained the cash-advance exception and the complete copies-not-originals mailing checklist. Therefore these two failures cannot be attributed merely to missing evidence in these requests. The generation stage can still reverse conditions despite receiving the relevant wording.

The existing guard caught the malformed citation on dev-009. It did not detect the evidence contradiction on dev-004. It checks citation identifiers, not semantic entailment.

The three gate decisions were made using a threshold chosen on this development set. They are not learned model refusals, independently validated refusal scores, or evidence of generalization to new unsupported questions.

## Release boundary and next work

This run changed no live generation configuration. Do not merge the current candidate as a reliable-answer fix or claim a fine-tuning improvement from this experiment. Keep the raw artifact unchanged.

Stop adjusting prompts against these same 13 questions as a release strategy. A next implementation candidate should favor source excerpts with mechanically verified attribution and clearly show that they are excerpts. Evidence relevance and completeness still require separate validation; exact copying alone is not sufficient. Any free-form explanation should remain experimental until its unsupported claims are evaluated independently.

Permanent hosting and independent held-out evaluation remain separate outstanding work. No new paid service is required by this review.
