import test from "node:test";
import assert from "node:assert/strict";
import { citedClaims, probabilities, screenAnswer } from "./claim-verifier.mjs";
import { ABSTENTION } from "./grounding-policy.mjs";

const policy = { minimum_entailment: 0.9, maximum_contradiction: 0.1, maximum_claims: 24 };
const sources = [
  { source_id: "cfpb-47", chunk_text: "Cash advances generally accrue interest from the transaction date." },
  { source_id: "cfpb-31", chunk_text: "A freeze does not protect existing accounts." }
];
const score = (entailment, contradiction, neutral) => ({ status: "scored", pair_tokens: 30,
  probabilities: { entailment, contradiction, neutral } });

test("whole sentences and conditions are retained under a trailing block citation", () => {
  const result = citedClaims("If offered, a grace period covers purchases. It generally excludes advances. [cfpb-47]", sources);
  assert.deepEqual(result.errors, []);
  assert.equal(result.claims.length, 2);
  assert.equal(result.claims[0].claim, "If offered, a grace period covers purchases.");
  assert.deepEqual(result.claims.map(c => c.source_ids), [["cfpb-47"], ["cfpb-47"]]);
});

test("a source citation cannot hide a following uncited claim", () => {
  assert.ok(citedClaims("Advances accrue interest [cfpb-47]. Approval is guaranteed.", sources).errors.includes("uncited_trailing_text"));
});

test("unknown and placeholder citations fail without invoking semantic scoring", async () => {
  for (const answer of ["You are approved [cfpb-999].", "Send originals [source_id].", "<think>reason</think> Claim [cfpb-47]."]) {
    const output = await screenAnswer(answer, sources, { policy, scorePair: () => { throw new Error("must not score"); } });
    assert.equal(output.decision, "withhold_format");
  }
});

test("only the cited article is supplied to the NLI model", async () => {
  const output = await screenAnswer("A freeze does not protect existing accounts [cfpb-47].", sources, {
    policy, scorePair: async (premise, claim) => {
      assert.equal(premise, sources[0].chunk_text);
      assert.ok(!premise.includes(sources[1].chunk_text));
      assert.match(claim, /freeze/);
      return score(0.02, 0.01, 0.97);
    }
  });
  assert.equal(output.decision, "withhold_nli");
});

test("one contradicted sentence withholds the whole explanation", async () => {
  const output = await screenAnswer("Cash advances accrue interest. Cash advances are interest-free. [cfpb-47]", sources, {
    policy, scorePair: async (_, claim) => claim.includes("interest-free") ? score(0.01, 0.98, 0.01) : score(0.98, 0.01, 0.01)
  });
  assert.equal(output.decision, "withhold_nli");
  assert.deepEqual(output.claims.map(c => c.accepted), [true, false]);
});

test("a general supporting unit cannot override a conflicting exception unit", async () => {
  const output = await screenAnswer("Cash advances are interest-free [cfpb-47].", [
    ...sources, { source_id: "cfpb-47", chunk_text: "General purchase grace-period wording." }
  ], { policy, scorePair: async premise => premise.includes("General") ? score(0.99, 0.005, 0.005) : score(0.01, 0.98, 0.01) });
  assert.equal(output.decision, "withhold_nli");
  assert.equal(output.claims[0].pairs.length, 2);
});

test("ambiguous support and oversized premise pairs are withheld without truncation", async () => {
  for (const result of [score(0.6, 0.1, 0.3), { status: "too_long", pair_tokens: 900 }]) {
    const output = await screenAnswer("Cash advances accrue interest [cfpb-47].", sources, { policy, scorePair: async () => result });
    assert.equal(output.decision, "withhold_nli");
  }
});

test("a passed screen is explicitly not a human correctness or refusal grade", async () => {
  const output = await screenAnswer("Cash advances generally accrue interest [cfpb-47].", sources, {
    policy, scorePair: async () => score(0.98, 0.01, 0.01)
  });
  assert.equal(output.decision, "passes_nli_screen");
  assert.equal(output.correct, undefined);
  assert.equal(output.grounded, undefined);
  assert.match(output.warning, /not established/);
  const refusal = await screenAnswer(ABSTENTION, sources, { policy, scorePair: () => { throw new Error("must not score"); } });
  assert.equal(refusal.decision, "model_limitation_not_graded");
});

test("NLI class order comes from the model, not a guessed integer mapping", () => {
  const p = probabilities([0, 12, 0], { 0: "neutral", 1: "contradiction", 2: "entailment" });
  assert.ok(p.contradiction > 0.99);
  assert.throws(() => probabilities([0, NaN, 1], { 0: "neutral", 1: "contradiction", 2: "entailment" }), /Non-finite/);
  assert.throws(() => probabilities([0, 1, 2], { 0: "LABEL_0", 1: "LABEL_1", 2: "LABEL_2" }), /mapping/);
});

test("cancelled scoring and malformed model probabilities fail closed", async () => {
  const signal = AbortSignal.abort();
  await assert.rejects(screenAnswer("Claim [cfpb-47].", sources, { policy, signal, scorePair: async () => score(1, 0, 0) }));
  await assert.rejects(screenAnswer("Claim [cfpb-47].", sources, { policy, scorePair: async () => score(NaN, 0, 0) }));
});
