import { readFileSync, mkdirSync, writeFileSync, createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import { PROMPT_VERSION } from "../ingestion/live-rag-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const parse = bytes => JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
const paths = ["evaluation/datasets/development.jsonl", "data/processed/chunks.jsonl",
  "ingestion/live-rag-core.mjs", "ingestion/live-retrieval.mjs", "ingestion/serve-local-rag.mjs",
  "ingestion/embedding-config.json", "apps/web/src/app/api/chat/route.ts"];
const inputHashes = Object.fromEntries(paths.map(path => [path, hash(readFileSync(resolve(root, path)))]));
const questions = readFileSync(resolve(root, paths[0]), "utf8").replace(/^\uFEFF/, "")
  .split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
assert.equal(questions.length, 13, "Expected the current 13-question development set.");
assert.equal(new Set(questions.map(q => q.id)).size, questions.length);
assert.ok(questions.every(q => q.split === "development" && typeof q.question === "string"));
const modelPath = resolve(root, "inference/models/fincite-v01-q4_k_m.gguf");
console.log("Verifying local model file...");
const digest = createHash("sha256");
for await (const block of createReadStream(modelPath)) digest.update(block);
const modelHash = digest.digest("hex");
assert.equal(modelHash, "a58fb6679a4af4eaa0625d7049ecc55478382590d5fe1639d5365d2243a59e5b", "Local model file changed.");

async function health(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  assert.ok(response.ok, `Service is not ready: ${url}`);
  const body = await response.json();
  assert.equal(body.status, "ok");
  return body;
}
await health("http://127.0.0.1:8080/health");
const bridgeHealth = await health("http://127.0.0.1:8081/health");
assert.equal(bridgeHealth.prompt_version, PROMPT_VERSION,
  "Bridge is using an older prompt. Restart the RAG bridge.");
const web = await fetch("http://127.0.0.1:3000", { signal: AbortSignal.timeout(10000) });
assert.ok(web.ok, "Start the frontend on port 3000.");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(root, `evaluation/results/local-development-${stamp}.json`);
mkdirSync(dirname(output), { recursive: true });
const report = {
  status: "development_diagnostics_in_progress_ungraded",
  created_at: new Date().toISOString(),
  endpoint: "http://127.0.0.1:3000/api/chat",
  prompt_version: PROMPT_VERSION,
  bridge_health: bridgeHealth,
  local_model_file_sha256: modelHash,
  model_note: "File integrity verified. Runtime loading used the previously documented local-server command; this runner does not attest process identity.",
  input_sha256: inputHashes,
  embedding_config: parse(readFileSync(resolve(root, "ingestion/embedding-config.json"))),
  expected_questions: questions.length,
  grading_status: "ungraded",
  latency_note: "Sequential observed API request times, including retrieval and generation. Model was already loaded. Cache/compilation effects may vary; not a cold/warm latency benchmark.",
  results: [], summary: null
};
const save = () => writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");
save();
console.log("Running 13 development questions. Avoid sending other questions during this run.");
let consecutiveFailures = 0;
try {
  for (const q of questions) {
    const started = performance.now();
    const record = {
      question_id: q.id, question: q.question, answerability: q.answerability,
      question_review_status: q.review_status, accepted_source_ids: q.source_ids,
      reference_claims: q.reference_claims, forbidden_claims: q.forbidden_claims,
      request: { question: q.question }, http_status: null, api_response: null,
      diagnostics: null,
      human_review: { answer_correctness: null, unsupported_claims: null,
        citation_support: null, refusal_correctness: null, notes: null }
    };
    try {
      const response = await fetch(report.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record.request), signal: AbortSignal.timeout(185000)
      });
      record.http_status = response.status;
      record.api_response = await response.json();
      if (response.ok) {
        const body = record.api_response;
        assert.ok(typeof body.answer === "string" && body.answer.trim());
        assert.ok(Array.isArray(body.sources));
        assert.ok(body.sources.every(s => typeof s.id === "string" && typeof s.quote === "string"));
        const supplied = new Set(body.sources.map(s => s.id));
        const cited = [...new Set([...body.answer.matchAll(/\[(cfpb-[^\]\s]+)\]/g)].map(m => m[1]))];
        record.diagnostics = {
          returned_citation_ids: cited,
          unknown_returned_citation_ids: cited.filter(id => !supplied.has(id)),
          no_returned_citation_ids: cited.length === 0,
          supplied_source_ids: [...supplied],
          accepted_source_supplied: q.answerability === "answerable" ?
            q.source_ids.some(id => supplied.has(id)) : null
        };
        // Source presence and citation-ID validity do not grade correctness or grounding.
        consecutiveFailures = 0;
      } else consecutiveFailures++;
    } catch (error) {
      record.client_error = error.name;
      consecutiveFailures++;
    }
    record.api_request_ms = Number((performance.now() - started).toFixed(1));
    report.results.push(record);
    save();
    console.log(`${report.results.length}/13 ${q.id}: ${record.diagnostics ? "recorded" : "FAILED"}; ${(record.api_request_ms / 1000).toFixed(2)} seconds`);
    if (consecutiveFailures >= 3) {
      console.log("Stopping after three consecutive failures. Partial results preserved.");
      break;
    }
  }
} finally {
  const changed = paths.filter(path => hash(readFileSync(resolve(root, path))) !== inputHashes[path]);
  const successful = report.results.filter(r => r.diagnostics);
  const answerable = successful.filter(r => r.answerability === "answerable");
  report.finished_at = new Date().toISOString();
  report.changed_inputs = changed;
  report.status = changed.length ? "invalidated_inputs_changed" :
    successful.length === questions.length ? "development_diagnostics_complete_ungraded" :
      "development_diagnostics_incomplete_or_failed_ungraded";
  report.summary = {
    attempted: report.results.length, successful: successful.length,
    failed: report.results.length - successful.length,
    answerable_responses: answerable.length,
    answerable_responses_without_citation_ids: answerable.filter(r => r.diagnostics.no_returned_citation_ids).length,
    unanswerable_responses: successful.length - answerable.length,
    first_api_request_ms: report.results[0]?.api_request_ms ?? null,
    quality_scores: null
  };
  save();
}
console.table(report.summary);
console.log(`Saved: ${output}`);
console.log("UNGRADED development diagnostics. No correctness, grounding or refusal scores calculated.");
if (report.status !== "development_diagnostics_complete_ungraded") process.exitCode = 1;
