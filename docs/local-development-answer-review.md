# Local live RAG development review

Run: local-development-2026-10-07T18-59-53-043Z.json. Prompt: local-live-v0.2.

All 13 API requests succeeded. All 10 answerable responses contained citation IDs,
and an accepted article was supplied for each. All three unanswerable responses
avoided predicting the requested outcome. These are development observations,
not a held-out accuracy or hallucination-reduction benchmark. Median observed API
request time was 12.42 seconds; compilation and caching conditions were not controlled.

## Main findings

- dev-009: invented an exception allowing original documents with certified mail.
- dev-007: confused duplicate debt listings with mixed files or identity theft.
- dev-002: invented a notice requirement about the lender's right to deny.
- dev-001, dev-004 and dev-006: dropped important conditions or exceptions.
- dev-008: implied an unconditional report update after resolving a dispute.
- dev-005: cited APR source cfpb-44 for extra claims supported by cfpb-45.
- dev-013: leaked an internal formatting marker and duplicated its response.

The full 13-question assistant review is in the companion JSON. Human labels
remain untouched. Review is against saved source evidence, not current-law advice.

## Next experiment

Preserve this run as the current baseline. Compare the base and fine-tuned models
on identical evidence and settings before attributing errors or gains to fine-tuning
or quantization. Test broad prompt/format improvements on development questions;
do not copy these reserved questions or close paraphrases into training data.
The live reranker remains disabled, and its earlier source-ranking result does not
establish answer grounding for this local setup.
