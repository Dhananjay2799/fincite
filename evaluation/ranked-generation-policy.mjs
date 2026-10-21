import assert from "node:assert/strict";

// Provisional settings chosen for this used development sample only. They must
// not be presented as a validated refusal policy or installed in the live app.
export const DEVELOPMENT_POLICY = Object.freeze({
  version: "ranked-generation-development-v1", threshold_logit: -5,
  score_margin: 2, max_evidence_units: 3, calibration_status: "development_only_unvalidated"
});

export function evidencePlan(rankedUnits, policy = DEVELOPMENT_POLICY) {
  assert.ok(Number.isFinite(policy.threshold_logit) && Number.isFinite(policy.score_margin) && policy.score_margin >= 0);
  assert.ok(Number.isInteger(policy.max_evidence_units) && policy.max_evidence_units > 0);
  assert.ok(rankedUnits.every(u => Number.isFinite(u.score) && typeof u.text === "string" && u.text.trim()));
  const sorted = [...rankedUnits].sort((a, b) => b.score - a.score || a.unit_id.localeCompare(b.unit_id));
  const top = sorted[0];
  if (!top || top.score < policy.threshold_logit) return { decision: "abstain", units: [], best_logit: top?.score ?? null };
  const units = [], seen = new Set();
  for (const unit of sorted) {
    if (unit.score < policy.threshold_logit || top.score - unit.score > policy.score_margin || seen.has(unit.unit_id)) continue;
    seen.add(unit.unit_id); units.push(unit);
    if (units.length === policy.max_evidence_units) break;
  }
  return { decision: "generate", units, best_logit: top.score };
}

export function validateRankedRecord(record, original) {
  assert.equal(record.question_id, original.question_id);
  assert.equal(record.question, original.question);
  assert.ok(Array.isArray(record.ranked_units));
  for (const unit of record.ranked_units) {
    assert.ok(typeof unit.unit_id === "string" && unit.unit_id && typeof unit.text === "string" && unit.text.trim());
    const source = original.api_response.sources.find(s => s.id === unit.source_id);
    assert.ok(source, "Evidence source was not supplied in the saved run.");
    assert.ok(Number.isInteger(unit.start_char) && Number.isInteger(unit.end_char) && unit.start_char >= 0 && unit.end_char > unit.start_char);
    assert.equal(source.quote.slice(unit.start_char, unit.end_char), unit.text, "Evidence text/offsets differ from the saved passage.");
  }
}
