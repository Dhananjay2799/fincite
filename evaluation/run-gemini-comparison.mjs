import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { comparisonRequests, remainingRequests, requestGemini } from "./gemini-comparison.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = b => createHash("sha256").update(b).digest("hex");
async function main() {
  const path = process.argv[2];
  assert.ok(path && (process.argv.length === 3 || (process.argv.length === 5 && process.argv[3] === "--resume")),
    "Usage: node --env-file=apps/web/.env.local evaluation/run-gemini-comparison.mjs COMPARISON.json [--resume GEMINI_RESULT.json]");
  const bytes = readFileSync(resolve(path));
  const report = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/u, ""));
  const requests = comparisonRequests(report);
  for (const [p, digest] of Object.entries(report.input_sha256)) {
    const bytes = readFileSync(resolve(root, p));
    assert.ok(hash(bytes) === digest || hash(bytes.toString("utf8").replace(/\r\n/gu, "\n")) === digest,
      `Comparison source changed: ${p}`);
  }
  const key = process.env.GEMINI_API_KEY?.trim();
  assert.ok(key, "Set GEMINI_API_KEY privately in your ignored env file. Never paste it into chat or commit it.");
  assert.equal(process.env.GEMINI_BILLING_PLAN, "free", "Use a project verified as Free in AI Studio, then set GEMINI_BILLING_PLAN=free. This runner cannot attest account billing status.");
  const model = process.env.GEMINI_MODEL?.trim();
  assert.ok(model && /^gemini-[a-zA-Z0-9.-]+$/u.test(model), "Set GEMINI_MODEL to an available free-tier model code; no automatic model fallback is used.");
  const metadata = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}`, {
    headers: { "x-goog-api-key": key }, signal: AbortSignal.timeout(30000)
  });
  assert.ok(metadata.ok, `Model availability check returned HTTP ${metadata.status}. No generation attempted.`);
  const modelMetadata = await metadata.json();
  assert.ok(modelMetadata.supportedGenerationMethods?.includes("generateContent"), "Model does not support generateContent.");
  const output = process.argv[4] ? resolve(process.argv[4]) :
    resolve(root, `evaluation/results/gemini-development-${new Date().toISOString().replace(/[:.]/gu, "-")}.json`);
  const codePaths = ["evaluation/gemini-comparison.mjs", "evaluation/run-gemini-comparison.mjs"];
  const fresh = { status: "in_progress", created_at: new Date().toISOString(), comparison_sha256: hash(bytes),
    code_sha256: Object.fromEntries(codePaths.map(p => [p, hash(readFileSync(resolve(root, p)))])),
    requested_model: model, model_metadata: modelMetadata, billing_plan: "user_attested_free_not_programmatically_verified",
    settings: requests[0].body.generationConfig, results: [], failed_attempts: [], quality_scores: null,
    limitations: ["Identical question, evidence and system instruction, but different tokenizer and provider inference runtime.",
      "Gemini reasoning uses provider defaults and shares a 1024-token budget; Qwen uses 256 visible tokens with thinking disabled.",
      "Temperature zero is not a guarantee of deterministic provider inference.",
      "Already-used development questions; this is not held-out evaluation.",
      "No tool use, search grounding, fallback model, billing upgrade or automatic retry is enabled."] };
  let result = fresh;
  if (process.argv[4]) {
    result = JSON.parse(readFileSync(output, "utf8"));
    assert.equal(result.comparison_sha256, fresh.comparison_sha256, "Cannot resume a different comparison.");
    assert.equal(result.requested_model, model, "Cannot change the Gemini model during resume.");
    assert.deepEqual(result.code_sha256, fresh.code_sha256, "Runner changed since this partial run.");
    assert.deepEqual(result.settings, fresh.settings, "Generation settings changed.");
    remainingRequests(requests, result.results);
    result.status = "in_progress";
  } else writeFileSync(output, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  const save = () => writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
  try {
    for (const request of remainingRequests(requests, result.results)) {
      const started = performance.now();
      let response;
      try { response = await requestGemini(model, key, request.body, { signal: AbortSignal.timeout(90000) }); }
      catch { response = { ok: false, error: "network_or_response_error" }; }
      const previous = result.results.findIndex(r => r.question_id === request.question_id && r.prompt_version === request.prompt_version);
      const record = { question_id: request.question_id, prompt_version: request.prompt_version,
        messages: request.messages, elapsed_ms: performance.now() - started, ...response };
      if (previous < 0) result.results.push(record);
      else { result.failed_attempts.push(result.results[previous]); result.results[previous] = record; }
      save();
      console.log(`${result.results.length}/${requests.length}: ${request.question_id}/${request.prompt_version}: ${response.ok ? "recorded" : "FAILED; stopping"}`);
      if (!response.ok) break;
      await new Promise(resolve => setTimeout(resolve, 6500));
    }
    assert.equal(hash(readFileSync(resolve(path))), result.comparison_sha256, "Comparison input changed during run.");
    for (const [p, digest] of Object.entries(result.code_sha256)) assert.equal(hash(readFileSync(resolve(root, p))), digest, "Code changed during run.");
    result.status = result.results.length === requests.length && result.results.every(r => r.ok) ?
      "gemini_development_complete_ungraded" : "incomplete";
  } finally { result.finished_at = new Date().toISOString(); save(); }
  console.log(`Saved: ${output}`);
  console.log("Development responses only. No correctness or grounding score calculated.");
  if (result.status !== "gemini_development_complete_ungraded") process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
