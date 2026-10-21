import test from "node:test";
import assert from "node:assert/strict";
import { answerQuestion, finishAnswer } from "./live-rag-core.mjs";
import { ABSTENTION, checkQuotedAnswer } from "./grounding-policy.mjs";
const passage = { source_id: "cfpb-47", chunk_text: "If the card offers a grace period, pay in full.", title: "Grace period", url: "https://www.consumerfinance.gov/ask-cfpb/example/" };
const stop = { choices: [{ finish_reason: "stop" }] };
test("uncited model claims are withheld", () => {
  assert.throws(() => finishAnswer("Pay in full.", [passage], stop), /did not cite/);
});
test("unknown source IDs are rejected", () => {
  assert.throws(() => finishAnswer("Pay in full [cfpb-999].", [passage], stop), /not supplied/);
});
test("a cited ID is marked without asserting semantic support", () => {
  const output = finishAnswer("Pay in full [cfpb-47].", [passage], stop);
  assert.equal(output.sources[0].cited, true);
  assert.equal(output.warnings.length, 1);
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
test("canonical limitation is a UI disposition, not a refusal correctness grade", () => {
  const output = finishAnswer(ABSTENTION, [passage], stop, "quoted");
  assert.equal(output.answer, ABSTENTION);
  assert.equal(output.disposition, "evidence_limited");
  assert.equal(output.correct_refusal, undefined);
});

test("quoted mode rejects invented claims even with a supplied citation ID", () => {
  assert.throws(() => finishAnswer("Minimum payments always prevent interest [cfpb-47].", [passage], stop, "quoted"), /quotation|citation/);
});
test("quoted mode accepts a complete condition and rejects a clipped condition", () => {
  assert.doesNotThrow(() => checkQuotedAnswer("If the card offers a grace period, pay in full. [cfpb-47]", [passage]));
  assert.throws(() => checkQuotedAnswer("pay in full. [cfpb-47]", [passage]), /complete quotation/);
});
test("correct source text cannot be attributed to a different supplied source", () => {
  const other = { ...passage, source_id: "cfpb-31", chunk_text: "A freeze does not protect existing accounts." };
  assert.throws(() => checkQuotedAnswer("A freeze does not protect existing accounts. [cfpb-47]", [passage, other]), /quotation/);
});
test("trailing uncited claims and internal reasoning are withheld", () => {
  assert.throws(() => checkQuotedAnswer("If the card offers a grace period, pay in full. [cfpb-47] You are guaranteed approval.", [passage]), /citation/);
  assert.throws(() => finishAnswer("</think> Pay in full [cfpb-47].", [passage], stop), /reasoning/);
});
test("quoted prompt is used for both packing and generation", async () => {
  const prompts = [];
  await answerQuestion("Question?", { answerMode: "quoted", retrieve: async () => [passage], modelPost: async (path, body) => {
    if (path === "/apply-template") { prompts.push(body.messages); return { prompt: "template" }; }
    if (path === "/tokenize") return { tokens: [1] };
    prompts.push(body.messages);
    return { choices: [{ finish_reason: "stop", message: { content: "If the card offers a grace period, pay in full. [cfpb-47]" } }] };
  } });
  assert.deepEqual(prompts[0], prompts[1]);
  assert.match(prompts[0][0].content, /verbatim/);
});

function refusingModel(retryText, prompts, oversizedRetry = false) {
  let attempts = 0;
  return async (path, body) => {
    if (path === "/apply-template") return { prompt: body.messages[0].content };
    if (path === "/tokenize") return { tokens: Array(oversizedRetry && body.content.startsWith("Find the source sentences") ? 1800 : 100).fill(1) };
    attempts++; prompts.push(body.messages);
    return { choices: [{ finish_reason: "stop", message: { content: attempts === 1 ? ABSTENTION : retryText } }] };
  };
}
test("false refusal gets one focused retry with unrelated article omitted", async () => {
  const text = "With credit cards, grace periods typically apply only to purchase transactions. If you use your card to get a cash advance, generally you must start paying interest as of the date of the transaction.";
  const relevant = { ...passage, chunk_text: text };
  const unrelated = { ...passage, source_id: "cfpb-31", chunk_text: "An extended alert is good for seven years." };
  const prompts = [];
  const result = await answerQuestion("Does a purchase grace period apply to cash advances?", {
    answerMode: "quoted", retrieve: async () => [relevant, unrelated],
    modelPost: refusingModel(text + " [cfpb-47]", prompts)
  });
  assert.equal(prompts.length, 2);
  assert.match(prompts[0][1].content, /seven years/);
  assert.doesNotMatch(prompts[1][1].content, /seven years/);
  assert.equal(result.answer, text + " [cfpb-47]");
  assert.equal(result.sources.length, 1);
  assert.equal(result.generation_attempts, 2);
});
test("focused retry can still abstain and never loops", async () => {
  const prompts = [];
  const result = await answerQuestion("Unknown future outcome?", { answerMode: "quoted", retrieve: async () => [passage],
    modelPost: refusingModel(ABSTENTION, prompts) });
  assert.equal(prompts.length, 2);
  assert.equal(result.disposition, "evidence_limited");
});
test("retry cannot bypass grounding checks", async () => {
  await assert.rejects(answerQuestion("Question?", { answerMode: "quoted", retrieve: async () => [passage],
    modelPost: refusingModel("All cash advances are interest free. [cfpb-47]", []) }), /quotation/);
});
test("retry checks its own token budget and skips generation if too large", async () => {
  const prompts = [];
  const result = await answerQuestion("Question?", { answerMode: "quoted", retrieve: async () => [passage],
    modelPost: refusingModel("Must not generate", prompts, true) });
  assert.equal(prompts.length, 1);
  assert.equal(result.disposition, "evidence_limited");
});
