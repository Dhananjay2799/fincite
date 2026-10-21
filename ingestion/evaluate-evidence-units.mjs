import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { AutoTokenizer, AutoModelForSequenceClassification, env } from "@huggingface/transformers";
import { buildEvidenceUnits } from "./evidence-units.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [input, destination, contextMode = "section"] = process.argv.slice(2);
if (!["section", "text"].includes(contextMode)) throw new Error("Context mode must be section or text.");
if (!input || !destination) throw new Error("Usage: node ingestion/evaluate-evidence-units.mjs SAVED_RUN.json NEW_OUTPUT.json");
const inputBytes = readFileSync(resolve(root, input));
const run = JSON.parse(inputBytes.toString("utf8").replace(/^\uFEFF/u, ""));
if (!Array.isArray(run.results) || !run.results.length || !run.results.every(r => r.api_response?.sources)) throw new Error("Expected saved API responses and supplied sources.");
const configBytes = readFileSync(resolve(root, "evaluation/reranker-config.json"));
const config = JSON.parse(configBytes.toString("utf8").replace(/^\uFEFF/u, ""));
const sha = value => createHash("sha256").update(value).digest("hex");
const report = { status: "offline_development_ranking_in_progress_ungraded", input_path: input,
  input_sha256: sha(inputBytes), reranker_config_sha256: sha(configBytes), reranker_config: config,
  builder_sha256: sha(readFileSync(resolve(root, "ingestion/evidence-units.mjs"))),
  evaluator_sha256: sha(readFileSync(fileURLToPath(import.meta.url))),
  runtime_versions: { node: process.version, transformers: JSON.parse(readFileSync(resolve(root, "ingestion/node_modules/@huggingface/transformers/package.json"), "utf8")).version },
  created_at: new Date().toISOString(), context_mode: contextMode, results: [], quality_scores: null,
  limitations: ["Uses previously retrieved passages only; does not measure retrieval recall.",
    "Relevance logits are not answerability probabilities or factual entailment scores.",
    "No refusal threshold is selected automatically; calibration on these examples is development tuning.",
    "No live code, database, model adapter or human labels are changed."] };
const output = resolve(root, destination);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
env.cacheDir = resolve(root, "data/model-cache");
let model;
try {
  console.log("Loading the existing pinned relevance reranker; no llama.cpp or Neon connection is needed.");
  const tokenizer = await AutoTokenizer.from_pretrained(config.model_id, { revision: config.model_revision });
  model = await AutoModelForSequenceClassification.from_pretrained(config.model_id, {
    revision: config.model_revision, dtype: config.dtype, device: "cpu"
  });
  for (const r of run.results) {
    const units = buildEvidenceUnits(r.api_response.sources.map(s => ({ source_id: s.id, title: s.title, url: s.url, chunk_text: s.quote })));
    const scored = [], skipped = [];
    const started = performance.now();
    for (const unit of units) {
      const text = contextMode === "section" && unit.section ? unit.section + "\n\n" + unit.text : unit.text;
      const check = await tokenizer(r.question, { text_pair: text, truncation: false, padding: false, return_tensor: false });
      const ids = check.input_ids; const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
      if (tokens > config.max_pair_tokens) { skipped.push({ unit_id: unit.unit_id, reason: "token_limit", tokens }); continue; }
      const features = await tokenizer(r.question, { text_pair: text, truncation: false, padding: false });
      const result = await model(features);
      if (result.logits?.data.length !== 1 || !Number.isFinite(Number(result.logits.data[0]))) throw new Error("Invalid reranker score.");
      scored.push({ ...unit, score: Number(result.logits.data[0]), pair_tokens: tokens });
    }
    scored.sort((a, b) => b.score - a.score || a.unit_id.localeCompare(b.unit_id));
    report.results.push({ question_id: r.question_id, question: r.question, answerability: r.answerability,
      reference_claims: r.reference_claims, previous_answer: r.api_response.answer, candidate_count: units.length,
      elapsed_ms: performance.now() - started, ranked_units: scored, skipped });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(`${r.question_id}: ${scored.length} scored; ${skipped.length} skipped; top logit ${scored[0]?.score.toFixed(3) ?? "none"}`);
  }
  if (sha(readFileSync(resolve(root, input))) !== report.input_sha256) throw new Error("Input changed during evaluation.");
  report.status = "offline_development_ranking_complete_ungraded";
} catch (error) { report.status = "offline_development_ranking_failed"; report.error = error.name; throw error; }
finally {
  if (model) await model.dispose();
  report.finished_at = new Date().toISOString();
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
console.log("Saved rankings for review. No answer-quality or refusal score calculated.");
