import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = process.argv[2];
assert.ok(path, "Usage: node evaluation/validate-adapter-comparison.mjs RESULT.json");
const report = JSON.parse(readFileSync(resolve(path), "utf8").replace(/^\uFEFF/u, ""));
assert.equal(report.status, "development_comparison_complete_ungraded");
assert.equal(report.adapter_loaded_weights_verified, true);
assert.equal(report.generation.use_model_defaults, false);
assert.equal(report.effective_generation_config.do_sample, false);
assert.equal(report.effective_generation_config.num_beams, 1);
assert.ok(report.cases.length && new Set(report.cases.map(c => c.question_id)).size === report.cases.length);
assert.deepEqual(Object.keys(report.prompts).sort(), ["evidence-contract-v1", "original"]);
const expected = new Set(report.cases.flatMap(c => ["base", "adapter"].flatMap(model =>
  Object.keys(report.prompts).map(prompt => `${c.question_id}/${model}/${prompt}`))));
assert.equal(report.results.length, expected.size, "Missing comparison records.");
for (const [path, digest] of Object.entries(report.input_sha256)) {
  const bytes = readFileSync(resolve(root, path));
  const actual = createHash("sha256").update(bytes).digest("hex");
  const normalized = createHash("sha256").update(bytes.toString("utf8").replace(/\r\n/gu, "\n")).digest("hex");
  assert.ok(actual === digest || normalized === digest, `Changed input: ${path}`);
}
const diagnostics = {};
for (const record of report.results) {
  assert.ok(expected.delete(`${record.question_id}/${record.model}/${record.prompt_version}`), "Unknown or duplicate result.");
  const c = report.cases.find(c => c.question_id === record.question_id);
  const user = "Question: " + c.question + "\n\nSupplied passages:\n" +
    c.evidence.map(u => `[${u.source_id}]\n${u.text}`).join("\n\n");
  assert.deepEqual(record.messages, [{ role: "system", content: report.prompts[record.prompt_version] }, { role: "user", content: user }],
    "Evidence or prompt differs between comparison arms.");
  assert.equal(typeof record.answer, "string");
  assert.ok(Number.isFinite(record.generation_seconds) && record.generation_seconds >= 0);
  assert.ok(Number.isInteger(record.generated_tokens) && record.generated_tokens >= 0);
  assert.ok(Number.isInteger(record.input_tokens) && record.input_tokens <= report.generation.max_input_tokens);
  assert.ok(["stop", "length"].includes(record.finish_reason));
  const ids = [...record.answer.matchAll(/\[(cfpb-[^\]\s]+)\]/gu)].map(m => m[1]);
  const allowed = new Set(c.evidence.map(u => u.source_id));
  const key = `${record.model}/${record.prompt_version}`;
  const d = diagnostics[key] ??= { answers: 0, empty: 0, truncated: 0, responses_with_unknown_citation_ids: 0,
    responses_without_citation_ids: 0 };
  d.answers++; d.empty += Number(!record.answer.trim()); d.truncated += Number(record.finish_reason !== "stop");
  d.responses_with_unknown_citation_ids += Number(ids.some(id => !allowed.has(id)));
  d.responses_without_citation_ids += Number(!ids.length);
}
assert.equal(expected.size, 0);
assert.equal(report.quality_scores, null);
console.log("PASS: all comparison arms have identical bound questions, evidence and generation settings.");
console.log("PASS: recorded input and code hashes match; selected adapter weights were verified.");
console.table(diagnostics);
console.log("Integrity diagnostics only; uncited responses include possible limitations. No correctness or refusal grades inferred.");
