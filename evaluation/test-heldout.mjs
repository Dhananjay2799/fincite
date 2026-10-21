import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateTest, scoreRun } from "./heldout.mjs";

const questions = Array.from({ length: 4 }, (_, i) => ({ id: `test-${i}`, question: `Independent topic ${i}?`, split: "test",
  group_id: `new-group-${i}`, answerability: i < 2 ? "answerable" : "unanswerable", source_ids: i < 2 ? ["cfpb-47"] : [],
  reference_claims: ["Reviewed criterion"], forbidden_claims: [], review_status: "approved", authored_by: "author",
  review: { reviewer_type: "human", reviewer_id: "reviewer", semantic_overlap_checked: true, evidence_checked: true } }));
const clone = () => structuredClone(questions);
const validate = qs => validateTest(qs, [{ question: "Reserved question", group_id: "training-group" }], new Set(["cfpb-47"]), 4);

test("reviewed questions validate but do not bypass default benchmark size", () => {
  assert.equal(validate(clone()).total, 4);
  assert.throws(() => validateTest(clone(), [], new Set(["cfpb-47"])), /120/);
});
test("draft labels, self-review and skipped semantic checks cannot be frozen", () => {
  for (const mutate of [q => q.review_status = "pending", q => q.review.reviewer_id = "author", q => q.review.semantic_overlap_checked = false]) {
    const qs = clone(); mutate(qs[0]); assert.throws(() => validate(qs));
  }
});
test("normalized overlap and training-group leakage are rejected", () => {
  const qs = clone(); qs[0].question = "RESERVED question!!!"; assert.throws(() => validate(qs), /reserved/);
  const groups = clone(); groups[0].group_id = "training-group"; assert.throws(() => validate(groups), /collision/);
});
test("unknown sources and duplicate question IDs are rejected", () => {
  const qs = clone(); qs[0].source_ids = ["cfpb-999"]; assert.throws(() => validate(qs), /Unknown source/);
  const duplicate = clone(); duplicate[1].id = duplicate[0].id; assert.throws(() => validate(duplicate), /unique/);
});
const manifest = { questions };
const digest = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
const report = { status: "complete", manifest_sha256: digest, results: questions.map((q, i) => ({
  question_id: q.id, ok: i !== 1, response: { answer: i === 0 ? "Claim [cfpb-47]." : "Cannot answer." }
})) };
const labels = [
  { question_id: "test-0", reviewer_type: "human", reviewer_id: "independent", correct: false, substantive_answer: true,
    has_unsupported_claims: true, refused: false, citation_supported: false },
  ...[2, 3].map(i => ({ question_id: `test-${i}`, reviewer_type: "human", reviewer_id: "independent", correct: true,
    substantive_answer: false, has_unsupported_claims: false, refused: true }))
];
test("unsupported-answer scores retain coverage and failure denominators", () => {
  const score = scoreRun(manifest, report, labels);
  assert.equal(score.counts.failed_requests, 1);
  assert.equal(score.rates.unsupported_answer_rate, 1);
  assert.equal(score.rates.answer_coverage, 0.25);
  assert.equal(score.rates.answer_correctness, 0.5);
  assert.equal(score.rates.refusal_recall, 1);
  assert.equal(score.rates.supported_cited_response_rate, 0);
});
test("incomplete, misbound or unreviewed responses cannot produce scores", () => {
  assert.throws(() => scoreRun(manifest, { ...report, status: "in_progress" }, labels), /Incomplete/);
  assert.throws(() => scoreRun(manifest, { ...report, manifest_sha256: "changed" }, labels), /manifest/);
  assert.throws(() => scoreRun(manifest, report, []), /human answer review/);
  assert.throws(() => scoreRun(manifest, report, labels.map(l => ({ ...l, reviewer_type: "assistant" }))), /human answer review/);
});
test("no substantive responses produces null unsupported rate, not a perfect score", () => {
  const onlyRefusals = labels.map(l => ({ ...l, substantive_answer: false, has_unsupported_claims: false, refused: true }));
  assert.equal(scoreRun(manifest, report, onlyRefusals).rates.unsupported_answer_rate, null);
});
