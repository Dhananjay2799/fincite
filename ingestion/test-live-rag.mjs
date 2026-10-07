import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, finishAnswer } from "./live-rag-core.mjs";
const passage = { source_id: "cfpb-47", chunk_text: "If the card offers a grace period, pay in full.", title: "Grace period", url: "https://www.consumerfinance.gov/ask-cfpb/example/" };
const stop = { choices: [{ finish_reason: "stop" }] };
test("missing citations stay missing and are visibly flagged", () => {
  const output = finishAnswer("Pay in full.", [passage], stop);
  assert.equal(output.sources[0].cited, false);
  assert.equal(output.warnings.length, 1);
  assert.equal(output.answer, "Pay in full.");
});
test("unknown source IDs are rejected", () => {
  assert.throws(() => finishAnswer("Pay in full [cfpb-999].", [passage], stop), /not supplied/);
});
test("a cited ID is marked without asserting semantic support", () => {
  const output = finishAnswer("Pay in full [cfpb-47].", [passage], stop);
  assert.equal(output.sources[0].cited, true);
  assert.equal(output.warnings.length, 0);
});
test("truncated answers are withheld", () => {
  assert.throws(() => finishAnswer("{}", [passage], { choices: [{ finish_reason: "length" }] }), /cut short/);
});
test("context packing omits whole oversized passages", async () => {
  let submitted;
  const large = { ...passage, source_id: "cfpb-44", chunk_text: "oversized" };
  const output = await answerQuestion("Question?", {
    retrieve: async () => [passage, large],
    modelPost: async (path, body) => {
      if (path === "/apply-template") return { prompt: body.messages[1].content };
      if (path === "/tokenize") return { tokens: Array(body.content.includes("oversized") ? 2000 : 200).fill(1) };
      submitted = body;
      return { ...stop, choices: [{ finish_reason: "stop", message: { content: "Pay in full [cfpb-47]." } }] };
    }
  });
  assert.equal(output.sources.length, 1);
  assert.ok(!submitted.messages[1].content.includes("oversized"));
  assert.equal(submitted.chat_template_kwargs.enable_thinking, false);
  assert.equal(submitted.response_format, undefined);
});
test("empty retrieval does not manufacture evidence or call generation", async () => {
  const output = await answerQuestion("Question?", { retrieve: async () => [], modelPost: () => { throw new Error("must not generate"); } });
  assert.equal(output.disposition, "evidence_limited");
  assert.deepEqual(output.sources, []);
});

test("internal status labels are withheld instead of counted as refusals", () => {
  assert.throws(() => finishAnswer("evidence_limited", [passage], stop), /internal label/);
});
test("a plain-text limitation is kept without claiming graded refusal success", () => {
  const output = finishAnswer("The supplied passages cannot determine Bitcoin's future price.", [passage], stop);
  assert.equal(output.answer, "The supplied passages cannot determine Bitcoin's future price.");
  assert.equal(output.disposition, "answer");
});
