import test from "node:test";
import assert from "node:assert/strict";
import { evidencePlan, validateRankedRecord } from "./ranked-generation-policy.mjs";

const unit = (id, score, text = "Evidence.") => ({ unit_id: id, score, text, source_id: "cfpb-47", start_char: 0, end_char: text.length });
test("a multi-part question can receive more than the top paragraph", () => {
  const plan = evidencePlan([unit("list", 3), unit("reasons", 2), unit("noise", -8)]);
  assert.equal(plan.decision, "generate");
  assert.deepEqual(plan.units.map(u => u.unit_id), ["list", "reasons"]);
});
test("low relevance abstains without using question ID or answerability labels", () => {
  assert.equal(evidencePlan([unit("a", -10)]).decision, "abstain");
  assert.equal(evidencePlan([]).decision, "abstain");
  assert.equal(evidencePlan([unit("a", -0.1)]).decision, "generate");
});
test("evidence planning caps context and removes duplicate units", () => {
  const plan = evidencePlan([unit("a", 4), unit("a", 4), unit("b", 4), unit("c", 4), unit("d", 4)]);
  assert.equal(plan.units.length, 3);
  assert.equal(new Set(plan.units.map(u => u.unit_id)).size, 3);
});
test("tampered source text and missing attribution cannot be passed to generation", () => {
  const original = { question_id: "dev-X", question: "Question?", api_response: { sources: [{ id: "cfpb-47", quote: "Evidence." }] } };
  const record = { question_id: "dev-X", question: "Question?", ranked_units: [unit("a", 1)] };
  assert.doesNotThrow(() => validateRankedRecord(record, original));
  assert.throws(() => validateRankedRecord({ ...record, ranked_units: [{ ...unit("a", 1), text: "Invented." }] }, original), /differ/);
  assert.throws(() => validateRankedRecord({ ...record, ranked_units: [{ ...unit("a", 1), source_id: "cfpb-999" }] }, original), /not supplied/);
});
