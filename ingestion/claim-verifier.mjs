import assert from "node:assert/strict";
import { ABSTENTION } from "./grounding-policy.mjs";

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const citation = /\[cfpb-\d+\]/gu;

// A citation terminates its preceding claim block. It never supplies attribution
// to a following uncited sentence. Keep whole sentences, including qualifications.
export function citedClaims(answer, passages, maximumClaims = 24) {
  assert.equal(typeof answer, "string");
  assert.ok(Array.isArray(passages));
  assert.ok(Number.isInteger(maximumClaims) && maximumClaims > 0);
  const sources = new Map();
  for (const p of passages) {
    assert.ok(/^cfpb-\d+$/u.test(p.source_id) && typeof p.chunk_text === "string" && p.chunk_text.trim());
    sources.set(p.source_id, [...(sources.get(p.source_id) ?? []), p.chunk_text]);
  }
  const text = answer.trim();
  const claims = [], errors = [];
  if (!text) return { claims, errors: ["empty_answer"] };
  if (/<\/?think\b|<\|[^]*?\|>|```|\[source_id\]/iu.test(text)) {
    return { claims, errors: ["invalid_answer_format"] };
  }
  let cursor = 0;
  for (const match of text.matchAll(/((?:\s*\[cfpb-\d+\])+)/gu)) {
    const block = text.slice(cursor, match.index).trim();
    const ids = [...new Set([...match[0].matchAll(citation)].map(m => m[0].slice(1, -1)))];
    cursor = match.index + match[0].length;
    // Sentence punctuation immediately AFTER a citation belongs to that block.
    if (/^[.!?]/u.test(text.slice(cursor))) cursor++;
    if (ids.some(id => !sources.has(id))) { errors.push("unknown_citation"); continue; }
    if (!block) { errors.push("citation_without_claim"); continue; }
    if (/\[[^\]]*\]/u.test(block)) { errors.push("unrecognized_citation_or_brackets"); continue; }
    const premises = ids.flatMap(id => sources.get(id).map(text => ({ source_id: id, text })));
    for (const { segment } of segmenter.segment(block)) {
      const claim = segment.trim();
      if (claim) claims.push({ claim, source_ids: ids, premises });
    }
  }
  if (text.slice(cursor).trim()) errors.push("uncited_trailing_text");
  if (!claims.length) errors.push("no_cited_claims");
  if (claims.length > maximumClaims) errors.push("too_many_claims");
  return { claims, errors: [...new Set(errors)] };
}

export function probabilities(logits, id2label) {
  assert.equal(logits.length, 3, "NLI model must return three labels.");
  assert.ok(logits.every(Number.isFinite), "Non-finite NLI logits.");
  const labels = logits.map((_, i) => id2label[i]?.toLowerCase());
  assert.deepEqual(new Set(labels), new Set(["contradiction", "entailment", "neutral"]), "Unexpected NLI label mapping.");
  const max = Math.max(...logits), exp = logits.map(x => Math.exp(x - max));
  const denominator = exp.reduce((a, b) => a + b, 0);
  return Object.fromEntries(labels.map((label, i) => [label, exp[i] / denominator]));
}

export async function screenAnswer(answer, passages, { scorePair, policy, signal } = {}) {
  assert.equal(typeof scorePair, "function");
  assert.ok(Number.isFinite(policy?.minimum_entailment) && policy.minimum_entailment >= 0 && policy.minimum_entailment <= 1);
  assert.ok(Number.isFinite(policy.maximum_contradiction) && policy.maximum_contradiction >= 0 && policy.maximum_contradiction <= 1);
  signal?.throwIfAborted();
  if (answer?.trim() === ABSTENTION) return { decision: "model_limitation_not_graded", claims: [], errors: [] };
  const parsed = citedClaims(answer, passages, policy.maximum_claims);
  if (parsed.errors.length) return { decision: "withhold_format", ...parsed };
  const claims = [];
  for (const { claim, source_ids, premises } of parsed.claims) {
    signal?.throwIfAborted();
    // Score against only the CITED sources; another retrieved article cannot
    // rescue a citation that attributes a claim to the wrong source.
    const pairs = [];
    for (const premise of premises) {
      const result = await scorePair(premise.text, claim, signal);
      signal?.throwIfAborted();
      assert.ok(["too_long", "scored"].includes(result.status));
      if (result.status === "scored") {
        const p = result.probabilities;
        assert.ok([p?.entailment, p?.contradiction, p?.neutral].every(x => Number.isFinite(x) && x >= 0 && x <= 1));
        assert.ok(Math.abs(p.entailment + p.contradiction + p.neutral - 1) < 1e-5);
      }
      pairs.push({ source_id: premise.source_id, ...result });
    }
    // A general rule must not bury its exception inside a concatenated premise.
    // One supporting unit is insufficient if ANY cited unit predicts a conflict.
    // Oversized units remain unverified; never silently remove that evidence.
    const allScored = pairs.every(p => p.status === "scored");
    claims.push({ claim, source_ids, pairs, accepted: allScored &&
      pairs.some(p => p.probabilities.entailment >= policy.minimum_entailment) &&
      pairs.every(p => p.probabilities.contradiction <= policy.maximum_contradiction) });
  }
  return { decision: claims.every(c => c.accepted) ? "passes_nli_screen" : "withhold_nli", claims, errors: [],
    warning: "Automated NLI screening only. Relevance, completeness, applicability and correctness are not established." };
}
