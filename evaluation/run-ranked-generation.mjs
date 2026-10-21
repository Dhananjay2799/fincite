import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { messagesFor, finishAnswer } from "../ingestion/live-rag-core.mjs";
import { ABSTENTION } from "../ingestion/grounding-policy.mjs";
import { evidencePlan, validateRankedRecord, DEVELOPMENT_POLICY } from "./ranked-generation-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const baselinePath = "evaluation/results/local-development-2026-10-21T02-22-24-402Z.json";
const rankingsPath = "evaluation/results/evidence-reranker-development-v03.json";
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
const outputTokens = 256, inputBudget = 2048 - outputTokens - 64;
const endpoint = "http://127.0.0.1:8080";
const codePaths = ["evaluation/run-ranked-generation.mjs", "evaluation/ranked-generation-policy.mjs", "ingestion/live-rag-core.mjs", "ingestion/grounding-policy.mjs"];
const post = async (path, body) => {
  const response = await fetch(endpoint + path, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), signal: AbortSignal.timeout(175000) });
  if (!response.ok) throw new Error(`Local model returned HTTP ${response.status}.`);
  return response.json();
};

async function main() {
  const baselineBytes = readFileSync(resolve(root, baselinePath)), rankingBytes = readFileSync(resolve(root, rankingsPath));
  const baseline = parse(baselineBytes), rankings = parse(rankingBytes);
  assert.equal(rankings.status, "offline_development_ranking_complete_ungraded");
  // Git on Windows may change physical newlines during checkout. Normalize only
  // actual CRLF bytes, never escaped newline characters inside source quotations.
  const normalizedHash = hash(baselineBytes.toString("utf8").replace(/\r\n/gu, "\n"));
  assert.ok(rankings.input_sha256 === hash(baselineBytes) || rankings.input_sha256 === normalizedHash, "Rankings do not match the saved run.");
  assert.equal(rankings.results.length, baseline.results.length);
  assert.equal(new Set(rankings.results.map(r => r.question_id)).size, rankings.results.length);
  const originals = new Map(baseline.results.map(r => [r.question_id, r]));
  for (const r of rankings.results) {
    assert.ok(originals.has(r.question_id), "Unknown ranked question.");
    validateRankedRecord(r, originals.get(r.question_id));
  }
  const inputHashes = Object.fromEntries([baselinePath, rankingsPath, ...codePaths].map(p => [p, hash(readFileSync(resolve(root, p)))]));
  try {
    const health = await fetch(endpoint + "/health", { signal: AbortSignal.timeout(10000) });
    assert.ok(health.ok && (await health.json()).status === "ok");
  } catch { throw new Error("Start node scripts/start-local.mjs in another terminal and keep it running. The model must be ready on port 8080."); }
  console.log("Verifying the local fine-tuned model file...");
  const digest = createHash("sha256");
  for await (const block of createReadStream(resolve(root, "inference/models/fincite-v01-q4_k_m.gguf"))) digest.update(block);
  const modelHash = digest.digest("hex");
  assert.equal(modelHash, "a58fb6679a4af4eaa0625d7049ecc55478382590d5fe1639d5365d2243a59e5b");
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  const output = resolve(root, `evaluation/results/ranked-generation-development-${stamp}.json`);
  const report = { status: "development_generation_in_progress_ungraded", created_at: new Date().toISOString(),
    policy: DEVELOPMENT_POLICY, model_file_sha256: modelHash, input_sha256: inputHashes,
    model_identity_note: "Local file checked; the HTTP runner does not attest the model process identity.",
    comparison_note: "Evidence, decision policy and output task differ from the v0.6 selector. This is a pipeline development experiment, not an isolated LoRA effect or a held-out benchmark.",
    settings: { temperature: 0, seed: 42, max_tokens: outputTokens, enable_thinking: false, input_budget: inputBudget },
    results: [], quality_scores: null };
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  console.log("Running saved development questions. Do not send other model requests during this experiment.");
  let failures = 0;
  try {
    for (const ranked of rankings.results) {
      const original = originals.get(ranked.question_id);
      const started = performance.now();
      const plan = evidencePlan(ranked.ranked_units);
      const record = { question_id: ranked.question_id, question: ranked.question, answerability: original.answerability,
        reference_claims: original.reference_claims, forbidden_claims: original.forbidden_claims,
        previous_answer: original.api_response.answer, evidence_plan: plan, packed_units: [], skipped_units: [],
        answer_origin: null, answer: null, raw_model_response: null, validation_error: null, request_error: null,
        human_review: null };
      try {
        if (plan.decision === "abstain") {
          record.answer = ABSTENTION;
          record.answer_origin = "development_relevance_gate";
          record.generation_performed = false;
        } else {
          for (const unit of plan.units) {
            const proposed = [...record.packed_units, unit];
            const passages = proposed.map(u => ({ source_id: u.source_id, chunk_text: u.text }));
            const messages = messagesFor(ranked.question, passages);
            const formatted = await post("/apply-template", { messages, chat_template_kwargs: { enable_thinking: false } });
            assert.equal(typeof formatted.prompt, "string");
            const encoded = await post("/tokenize", { content: formatted.prompt, add_special: true, parse_special: true });
            assert.ok(Array.isArray(encoded.tokens));
            if (encoded.tokens.length <= inputBudget) { record.packed_units.push(unit); record.input_tokens = encoded.tokens.length; }
            else record.skipped_units.push({ unit_id: unit.unit_id, reason: "context_budget" });
          }
          assert.ok(record.packed_units.length, "No whole evidence unit fits the context.");
          const passages = record.packed_units.map(u => ({ source_id: u.source_id, chunk_text: u.text,
            title: u.title, url: u.url }));
          record.messages = messagesFor(ranked.question, passages);
          const response = await post("/v1/chat/completions", { model: "fincite-v01", messages: record.messages,
            temperature: 0, seed: 42, max_tokens: outputTokens, stream: false, chat_template_kwargs: { enable_thinking: false } });
          record.raw_model_response = response;
          record.answer = response.choices?.[0]?.message?.content ?? null;
          record.answer_origin = "fine_tuned_model_generation";
          record.generation_performed = true;
          try { record.checked_response = finishAnswer(record.answer, passages, response, "generated"); }
          catch (error) { record.validation_error = error.message; }
        }
        failures = 0;
      } catch (error) { record.request_error = error.name + ": " + error.message; failures++; }
      record.elapsed_ms = performance.now() - started;
      report.results.push(record); save();
      console.log(`${report.results.length}/${rankings.results.length} ${ranked.question_id}: ${record.request_error ? "FAILED" : record.answer_origin === "development_relevance_gate" ? "gate abstention recorded" : record.validation_error ? "raw answer recorded; guard failed" : "model answer recorded"}`);
      if (failures >= 3) { console.log("Stopping after three consecutive request failures."); break; }
    }
    const changed = Object.entries(inputHashes).filter(([p, expected]) => hash(readFileSync(resolve(root, p))) !== expected).map(([p]) => p);
    report.changed_inputs = changed;
    report.status = changed.length ? "invalidated_inputs_changed" : report.results.length !== rankings.results.length || report.results.some(r => r.request_error) ?
      "development_generation_incomplete_ungraded" : "development_generation_complete_ungraded";
  } finally { report.finished_at = new Date().toISOString(); save(); }
  console.log(`Saved: ${output}`);
  console.log("Development results only. Gate decisions are not model refusals; no correctness or grounding score calculated.");
  if (report.status !== "development_generation_complete_ungraded") process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
