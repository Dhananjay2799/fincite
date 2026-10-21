import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { bindPilotReviews, validPilotResponse } from "./run-reviewed-pilot.mjs";
const read = name => readFileSync(fileURLToPath(new URL(name, import.meta.url)), "utf8").replace(/^\uFEFF/u, "");
const candidates = read("datasets/fresh-candidates-v1.jsonl").split(/\r?\n/u).filter(s => s.trim()).map(JSON.parse);
const review = JSON.parse(read("results/fresh-question-review-2026-10-21T21-59-25-055Z.json"));
const clone = value => JSON.parse(JSON.stringify(value));

test("review binding preserves owner approvals as a pilot without changing candidates", () => {
  const before = JSON.stringify(candidates);
  const result = bindPilotReviews(candidates, review);
  assert.equal(result.questions.length, 24);
  assert.equal(result.questions.filter(q => q.answerability === "answerable").length, 16);
  assert.equal(result.purpose, "reviewed_question_pilot");
  assert.equal(result.benchmark_ready, false);
  assert.equal(result.quality_scores, null);
  assert.ok(result.questions.every(q => q.split === "pilot" && q.review_status === "approved"));
  assert.equal(JSON.stringify(candidates), before);
});
test("review binding rejects changed questions, duplicate IDs and missing decisions", () => {
  for (const mutate of [
    r => { r.reviews[0].question += " changed"; },
    r => { r.reviews[1].question_id = r.reviews[0].question_id; },
    r => { r.reviews.pop(); }
  ]) { const value = clone(review); mutate(value); assert.throws(() => bindPilotReviews(candidates, value)); }
});
test("review binding rejects misbound provenance, fabricated summaries and inconsistent choices", () => {
  for (const mutate of [
    r => { r.dataset_commit = "0".repeat(40); },
    r => { r.summary.approved = 23; },
    r => { r.reviews[0].checks.evidence = "no"; },
    r => { r.reviews[0].reviewer_id = candidates[0].authored_by; },
    r => { r.quality_scores = { correctness: 1 }; }
  ]) { const value = clone(review); mutate(value); assert.throws(() => bindPilotReviews(candidates, value)); }
});
test("HTTP response shape accepts a substantive response or limitation without grading either", () => {
  assert.equal(validPilotResponse({ answer: "Source excerpt [cfpb-47]", disposition: "answer",
    output_mode: "source_excerpts", sources: [{ id: "cfpb-47", title: "Title", quote: "Source excerpt",
    url: "https://www.consumerfinance.gov/ask-cfpb/example/" }] }), true);
  assert.equal(validPilotResponse({ answer: "No selected excerpt.", disposition: "evidence_limited", sources: [] }), true);
});
test("HTTP response shape rejects error bodies, blank answers, invalid dispositions and lookalike domains", () => {
  for (const body of [
    { error: { code: "UNAVAILABLE" } },
    { answer: "", disposition: "answer", sources: [] },
    { answer: "text", disposition: "correct_refusal", sources: [] },
    { answer: "text", disposition: "answer", sources: [{ id: "cfpb-47", title: "Title", quote: "text", url: "https://www.consumerfinance.gov.attacker.example/" }] }
  ]) assert.equal(validPilotResponse(body), false);
});
