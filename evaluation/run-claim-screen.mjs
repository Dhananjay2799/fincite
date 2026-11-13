import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { screenAnswer } from "../ingestion/claim-verifier.mjs";
import { prepareClaimVerifier } from "../ingestion/nli-model.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const defaultInput = "evaluation/results/ranked-generation-development-2026-10-21T15-06-22-871Z.json";

async function main() {
  const inputPath = resolve(root, process.argv[2] ?? defaultInput);
  const inputBytes = readFileSync(inputPath), input = parse(inputBytes);
  assert.equal(input.status, "development_generation_complete_ungraded", "Requires a completed recorded generation run.");
  assert.ok(input.results?.length && new Set(input.results.map(r => r.question_id)).size === input.results.length);
  const originals = parse(readFileSync(resolve(root, "evaluation/results/local-development-2026-10-21T02-22-24-402Z.json")));
  const byId = new Map(originals.results.map(r => [r.question_id, r]));
  for (const record of input.results) {
    assert.equal(record.question, byId.get(record.question_id)?.question, "Question does not match recorded source run.");
    assert.ok(!record.request_error, "Incomplete request in saved run.");
    for (const unit of record.packed_units) {
      const source = byId.get(record.question_id).api_response.sources.find(s => s.id === unit.source_id);
      assert.ok(source, "Unknown evidence source.");
      assert.equal(source.quote.slice(unit.start_char, unit.end_char), unit.text, "Changed source span.");
    }
    if (record.generation_performed) {
      assert.equal(record.answer, record.raw_model_response?.choices?.[0]?.message?.content, "Changed raw model answer.");
    }
  }
  console.log("PASS: saved questions, raw answers and supplied source spans match.");
  console.log("Loading pinned CPU contradiction checker; first run downloads model files. No database or generation service is needed.");
  const started = performance.now();
  const verifier = await prepareClaimVerifier();
  const paths = ["evaluation/claim-verifier-config.json", "ingestion/claim-verifier.mjs", "ingestion/nli-model.mjs", "evaluation/run-claim-screen.mjs"];
  const hashes = Object.fromEntries(paths.map(p => [p, hash(readFileSync(resolve(root, p)))]));
  const output = resolve(root, `evaluation/results/claim-screen-development-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`);
  const report = { status: "in_progress", created_at: new Date().toISOString(), input_sha256: hash(inputBytes),
    code_sha256: hashes, policy: verifier.config, load_ms: performance.now() - started, results: [], quality_scores: null,
    limitations: ["Development replay of already-inspected answers, not held-out evaluation.",
      "NLI scores are automated model predictions, not human grades or calibrated correctness probabilities.",
      "A passed screen does not establish relevance, completeness, applicability or source freshness.",
      "Sentence-level scoring can miss an unsupported clause inside an otherwise supported sentence.",
      "Gate abstentions are not model refusals; citation errors and request failures stay separate.",
      "No live mode, prompt, trained weights or public deployment is changed."] };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  try {
    for (const record of input.results) {
      const start = performance.now();
      const result = { question_id: record.question_id, question: record.question, answer: record.answer,
        generation_performed: record.generation_performed, original_validation_error: record.validation_error };
      if (!record.generation_performed) result.screen = { decision: "gate_abstention_not_scored", claims: [], errors: [] };
      else if (record.raw_model_response.choices[0].finish_reason !== "stop") result.screen = { decision: "truncated_generation_not_scored", claims: [], errors: [] };
      else {
        try {
          result.screen = await screenAnswer(record.answer, record.packed_units.map(u => ({ source_id: u.source_id, chunk_text: u.text })),
            { policy: verifier.config, scorePair: verifier.scorePair });
        } catch { result.screen = { decision: "verifier_error", claims: [], errors: ["scoring_failed"] }; }
      }
      result.elapsed_ms = performance.now() - start;
      report.results.push(result); save();
      console.log(`${result.question_id}: ${result.screen.decision}`);
    }
    assert.equal(hash(readFileSync(inputPath)), report.input_sha256, "Input changed during replay.");
    for (const [p, digest] of Object.entries(hashes)) assert.equal(hash(readFileSync(resolve(root, p))), digest, "Code changed during replay.");
    report.status = report.results.some(r => r.screen.decision === "verifier_error") ? "incomplete" : "development_screen_complete_ungraded";
    report.decision_counts = report.results.reduce((counts, r) => {
      counts[r.screen.decision] = (counts[r.screen.decision] ?? 0) + 1; return counts;
    }, {});
  } finally {
    report.finished_at = new Date().toISOString(); save(); await verifier.dispose();
  }
  console.table(report.decision_counts);
  console.log(`Saved: ${output}`);
  console.log("Screening diagnostics only. No correctness, grounding or refusal score calculated.");
  if (report.status !== "development_screen_complete_ungraded") process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
