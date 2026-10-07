# Controlled base-versus-adapter development comparison

The pinned Qwen3-1.7B base and selected epoch 3 LoRA adapter received identical reconstructed messages and evidence on 13 development questions. This is a Colab comparison, not the local Q4_K_M deployment. Grouped source quotes can differ from original local chunk formatting.

This run does not establish overall answer-quality improvement. The adapter introduces a furnisher-first dispute sequence (dev-008), retains an unsupported exception for original documents (dev-009), drops an APR citation (dev-005), and shortens away important notice details (dev-002 and dev-010). Both models incorrectly apply the purchase grace period to cash advances (dev-004).

Citation IDs appear in 10/10 answerable base responses and 9/10 adapter responses. Neither model reaches the generation limit. These are integrity diagnostics, not grounding scores. Both avoid predicting the three personal/future outcomes; the fee-waiver answers omit the suggested issuer contact.

## Per-question observations

- **dev-001:** Both omit grace-period eligibility conditions. Adapter omits an explicit explanation of minimum payment and new-purchase interest after losing the grace period.
- **dev-002:** Base covers more notice information. Adapter calls the score the lender’s credit score and omits telephone number, the 60-day free-report window and correction process. Both omit the alternative process for requesting denial reasons.
- **dev-003:** Both avoid a Bitcoin price prediction and explain the evidence limitation.
- **dev-004:** Both incorrectly say the purchase grace period covers a cash advance. Supplied evidence says cash advances generally accrue interest from the transaction date.
- **dev-005:** Both explain APR. Adapter drops the source citation present in the base answer.
- **dev-006:** Both lose generally/in-most-circumstances qualifications and omit the index distinction.
- **dev-007:** Base misclassifies duplicate debt as a data management error; the passage lists it under account status. Adapter adds a possible identity-theft explanation that this duplicate entry alone does not establish.
- **dev-008:** Base answers contact-both correctly. Adapter invents a furnisher-first sequence and tells the user to wait before contacting the reporting companies, contrary to the supplied bureau-first then furnisher guidance.
- **dev-009:** Adapter invents an exception allowing originals if the reporting company requires them; evidence says copies, not originals. Both make the optional certified-mail route sound mandatory and omit if-available qualification for confirmation number.
- **dev-010:** Base covers the main notice requirements. Adapter omits consumer/collector identity details, itemization, response information and written-dispute detail; it also omits if-any qualification for account number.
- **dev-011:** Both correctly say freezes do not propagate and each company must be contacted; both omit the fraud-alert contrast in the reference criteria.
- **dev-012:** Both avoid predicting a fee waiver; both omit the suggested next step of checking with the issuer.
- **dev-013:** Both avoid predicting approval. Adapter uses the confusing phrase landlord’s application instead of the applicant’s rental application.

## Limits

Assistant observations only; no independent human grades or final held-out benchmark. Development questions have already been inspected and must not be relabeled as a blind test. Earlier shorter-snippet validation improvements do not demonstrate broader end-to-end quality. Preserve this result and document regressions rather than claim fine-tuning reduces hallucinations.
