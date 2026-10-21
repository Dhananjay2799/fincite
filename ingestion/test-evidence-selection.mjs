import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion } from "./live-rag-core.mjs";
import { evidenceCandidates, selectedText, selectionFormat } from "./evidence-selection.mjs";
import { ABSTENTION } from "./grounding-policy.mjs";

const text = "With credit cards, grace periods typically apply only to purchase transactions. If you use your card to get a cash advance or use a check you received from your card issuer, generally you must start paying interest as of the date of the transaction.";
const passage = { source_id: "cfpb-47", title: "Grace period", chunk_text: "Grace period\n\n" + text,
  url: "https://www.consumerfinance.gov/ask-cfpb/example/" };
const other = { ...passage, source_id: "cfpb-31", title: "Identity theft", chunk_text: "An extended alert is good for seven years." };
function model(reply, { oversized = false, finish = "stop" } = {}) {
  const requests = [];
  return { requests, async post(path, body) {
    requests.push({ path, body });
    if (path === "/apply-template") return { prompt: JSON.stringify(body.messages) };
    if (path === "/tokenize") return { tokens: Array(oversized && body.content.includes("seven years") ? 2000 : 100).fill(1) };
    return { choices: [{ finish_reason: finish, message: { content: reply } }] };
  } };
}
test("source paragraphs become request-local IDs without losing conditions", () => {
  const candidates = evidenceCandidates([passage, other]);
  assert.deepEqual(candidates.map(c => c.id), ["E1", "E2"]);
  assert.equal(candidates[0].text, text);
});
test("cash-advance response is copied from selected evidence, never generated", async () => {
  const llm = model('{"evidence_id":"E1"}');
  const result = await answerQuestion("Does my purchase grace period apply to cash advances?", {
    answerMode: "quoted", retrieve: async () => [passage, other], modelPost: llm.post
  });
  assert.equal(result.answer, text + " [cfpb-47]");
  assert.equal(result.output_mode, "selected_source_excerpt");
  const generation = llm.requests.find(r => r.path === "/v1/chat/completions").body;
  assert.deepEqual(generation.response_format.schema.properties.evidence_id.enum, ["NONE", "E1", "E2"]);
  assert.equal(generation.max_tokens, 64);
  assert.deepEqual(llm.requests.filter(r => r.path === "/apply-template").at(-1).body.messages, generation.messages);
});
test("NONE remains an abstention and does not force any source answer", async () => {
  const llm = model('{"evidence_id":"NONE"}');
  const result = await answerQuestion("What is next year's Bitcoin price?", { answerMode: "quoted", retrieve: async () => [passage], modelPost: llm.post });
  assert.equal(result.answer, ABSTENTION);
  assert.equal(result.disposition, "evidence_limited");
  assert.equal(llm.requests.filter(r => r.path === "/v1/chat/completions").length, 1);
});
test("model prose, extra fields, arrays and nonexistent IDs cannot bypass allowlist", () => {
  const candidates = evidenceCandidates([passage]);
  for (const raw of ['Pay no interest [cfpb-47].', '{"evidence_id":"E99"}', '{"evidence_id":"E1","answer":"invented"}', '[]', 'null']) {
    assert.throws(() => selectedText(raw, candidates));
  }
});
test("copied punctuation and Unicode are preserved", () => {
  const unicode = { ...passage, chunk_text: "You don’t get a guarantee. Check the issuer’s terms." };
  const candidates = evidenceCandidates([unicode]);
  assert.equal(selectedText('{"evidence_id":"E1"}', candidates).text, unicode.chunk_text + " [cfpb-47]");
});
test("IDs from omitted passages cannot be selected", async () => {
  const llm = model('{"evidence_id":"E2"}', { oversized: true });
  await assert.rejects(answerQuestion("Question?", { answerMode: "quoted", retrieve: async () => [passage, other], modelPost: llm.post }), /not supplied/);
  const generation = llm.requests.find(r => r.path === "/v1/chat/completions").body;
  assert.doesNotMatch(generation.messages[1].content, /seven years/);
});
test("truncated selector output is withheld even when the JSON looks valid", async () => {
  const llm = model('{"evidence_id":"E1"}', { finish: "length" });
  await assert.rejects(answerQuestion("Question?", { answerMode: "quoted", retrieve: async () => [passage], modelPost: llm.post }), /cut short/);
});
test("schema allows only evidence selection and no free-text answer", () => {
  const schema = selectionFormat(evidenceCandidates([passage])).schema;
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(Object.keys(schema.properties), ["evidence_id"]);
});
