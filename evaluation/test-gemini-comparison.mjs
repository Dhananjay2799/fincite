import test from "node:test";
import assert from "node:assert/strict";
import { comparisonRequests, remainingRequests, requestGemini } from "./gemini-comparison.mjs";

const report = () => {
  const r = { status: "development_comparison_complete_ungraded", adapter_loaded_weights_verified: true,
    cases: [{ question_id: "q1", question: "What is supported?", evidence: [{ source_id: "cfpb-47", text: "Exact reference." }] }],
    prompts: { original: "Use evidence." }, results: [] };
  r.results = ["base", "adapter"].map(model => ({ question_id: "q1", model, prompt_version: "original", messages: [
    { role: "system", content: "Use evidence." }, { role: "user", content: "Question: What is supported?\n\nSupplied passages:\n[cfpb-47]\nExact reference." }] }));
  return r;
};
test("Gemini receives precisely the same evidence and instructions as both controls", () => {
  const plan = comparisonRequests(report());
  assert.equal(plan.length, 1);
  assert.equal(plan[0].body.contents[0].parts[0].text, report().results[0].messages[1].content);
  assert.equal(plan[0].body.tools, undefined);
  const changed = report(); changed.results[1].messages[1].content += " hidden reference answer";
  assert.throws(() => comparisonRequests(changed), /differs/);
});
test("API key stays in the header, not the URL, report or error response", async () => {
  const result = await requestGemini("gemini-test-model", "test-secret", {}, { fetcher: async (url, options) => {
    assert.ok(!url.includes("test-secret"));
    assert.equal(options.headers["x-goog-api-key"], "test-secret");
    return { ok: false, status: 429 };
  } });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes("test-secret"));
  assert.equal(result.http_status, 429);
});
test("reasoning text is excluded and truncated responses are recorded as failures", async () => {
  const result = await requestGemini("gemini-test-model", "test-secret", {}, { fetcher: async () => ({ ok: true, status: 200,
    json: async () => ({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [
      { thought: true, text: "Private reasoning" }, { text: "Partial answer" }] } }], modelVersion: "test-version" }) }) });
  assert.equal(result.answer, "Partial answer");
  assert.equal(result.ok, false);
  assert.equal(result.model_version, "test-version");
});

test("resume skips successful requests, retries a failed record, and rejects rebinding", () => {
  const requests = comparisonRequests(report());
  const success = { ...requests[0], ok: true, answer: "A final answer", finish_reason: "STOP" };
  assert.deepEqual(remainingRequests(requests, [success]), []);
  assert.equal(remainingRequests(requests, [{ ...success, ok: false }]).length, 1);
  assert.throws(() => remainingRequests(requests, [{ ...success, question_id: "other" }]), /Unknown/);
  assert.throws(() => remainingRequests(requests, [{ ...success, messages: [] }]), /changed/);
});
