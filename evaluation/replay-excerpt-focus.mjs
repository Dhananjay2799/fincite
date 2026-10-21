import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderExcerpts, EXCERPT_POLICY_VERSION } from "../ingestion/source-excerpts.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const text = path => readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
const json = path => JSON.parse(text(path));
const hash = value => createHash("sha256").update(value).digest("hex");
execFileSync(process.execPath, [resolve(root, "evaluation/build-excerpt-vocabulary.mjs"), "--check"], { cwd: root, stdio: "inherit" });
const inventory = json("training/datasets/source-inventory.json"), manifest = json("evaluation/datasets/corpus-manifest.json");
const urls = new Map(manifest.documents.map(d => [d.source_id, d.url]));
const passages = inventory.sources.flatMap(s => s.passages.map(p => ({
  source_id: s.source_id, title: s.title, url: urls.get(s.source_id), chunk_text: p.text
})));
const inputPaths = [
  "evaluation/results/reviewed-pilot-2026-10-21T22-08-42-062Z.json",
  "evaluation/results/source-excerpt-replay-2026-10-21T15-18-54-544Z.json"
];
const codePaths = ["ingestion/source-excerpts.mjs", "ingestion/excerpt-focus.mjs", "ingestion/excerpt-vocabulary.json",
  "evaluation/build-excerpt-vocabulary.mjs", "evaluation/replay-excerpt-focus.mjs"];
const tracked = [...inputPaths, ...codePaths, "training/datasets/source-inventory.json", "evaluation/datasets/corpus-manifest.json"];
const fingerprints = Object.fromEntries(tracked.map(p => [p, hash(text(p))]));
const results = [];
for (const [inputIndex, path] of inputPaths.entries()) {
  for (const row of json(path).results) {
    const before = row.response;
    assert.ok(Array.isArray(before.selected_units) && typeof row.question === "string", "Wrong saved response format.");
    const parts = [...before.answer.matchAll(/([\s\S]*?) \[(cfpb-\d+)\](?:\n\n|$)/gu)];
    assert.equal(parts.length, before.selected_units.length, "Cannot reconstruct copied excerpt groups.");
    const units = parts.map((part, index) => {
      const recorded = before.selected_units[index];
      assert.equal(recorded.source_id, part[2]);
      assert.equal(recorded.unit_id, hash(part[2] + "\n" + part[1].replace(/\s+/gu, " ").trim()), "Saved unit hash differs.");
      const passage = passages.find(p => p.source_id === part[2] && p.chunk_text.includes(part[1]));
      assert.ok(passage, "Saved text absent from source inventory.");
      const start = passage.chunk_text.indexOf(part[1]);
      return { ...recorded, title: passage.title, url: passage.url, text: part[1], start_char: start, end_char: start + part[1].length };
    });
    if (units.length) assert.equal(units.map(u => u.text + " [" + u.source_id + "]").join("\n\n"), before.answer);
    const after = renderExcerpts(passages, units, units.map(u => ({ unit_id: u.unit_id, score: u.score })), undefined, row.question);
    results.push({ input_path: path, input_group: inputIndex === 0 ? "pilot" : "development_probes",
      question_id: row.question_id, question: row.question, before_selected_units: before.selected_units.length,
      after_selected_units: after.selected_units.length, response: after });
    console.log(row.question_id + ": " + before.selected_units.length + " -> " + after.selected_units.length + " excerpts");
  }
}
const pilot = results.filter(r => r.input_group === "pilot"), probes = results.filter(r => r.input_group === "development_probes");
const pilotSupported = pilot.filter(r => Number(r.question_id.slice(-3)) <= 16);
const pilotUnsupported = pilot.filter(r => Number(r.question_id.slice(-3)) >= 17);
const supportedProbes = probes.filter(r => /0[1-6]$/u.test(r.question_id));
const failedExpectations = [
  ...pilotSupported.filter(r => !r.after_selected_units).map(r => r.question_id + ": supported pilot selection lost"),
  ...pilotUnsupported.filter(r => r.after_selected_units).map(r => r.question_id + ": unsupported pilot still selected"),
  ...supportedProbes.filter(r => !r.after_selected_units).map(r => r.question_id + ": supported paraphrase selection lost"),
  ...probes.filter(r => /(?:07|08|09|10)$/u.test(r.question_id) && r.after_selected_units).map(r => r.question_id + ": unsupported probe still selected")
];
for (const [path, digest] of Object.entries(fingerprints)) assert.equal(hash(text(path)), digest, "Replay input changed.");
const report = { status: failedExpectations.length ? "development_regression_failed" : "development_regression_passed",
  created_at: new Date().toISOString(), policy_version: EXCERPT_POLICY_VERSION, input_sha256_utf8_lf: fingerprints,
  summary: { saved_cases: results.length, supported_pilot_with_excerpts: pilotSupported.filter(r => r.after_selected_units).length,
    unsupported_pilot_without_excerpts: pilotUnsupported.filter(r => !r.after_selected_units).length,
    supported_paraphrases_with_excerpts: supportedProbes.filter(r => r.after_selected_units).length,
    failed_expectations: failedExpectations }, results, quality_scores: null,
  limitations: ["These inspected cases influenced the patch; this is a development regression replay, not held-out evaluation.",
    "Only saved previously selected units and scores are replayed. Other ranked candidates are unavailable.",
    "No live Neon retrieval, reranker inference, model generation or Vercel deployment is exercised.",
    "Selection presence/absence expectations do not grade correctness, completeness or applicability.",
    "Scope and lexical focus rules can still reject paraphrases or accept related-but-insufficient text."] };
const output = resolve(root, "evaluation/results/excerpt-focus-development-" + new Date().toISOString().replace(/[:.]/gu, "-") + ".json");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.table(report.summary); console.log("Saved: " + output);
if (failedExpectations.length) process.exitCode = 1;
