import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import assert from "node:assert/strict";
import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
  env
} from "@huggingface/transformers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = value =>
  createHash("sha256").update(value).digest("hex");

const inputPath = process.argv[2];
if (!inputPath) throw new Error("Pass a saved retrieval result path.");

const baselineBytes = readFileSync(resolve(root, inputPath));
const baseline = JSON.parse(
  baselineBytes.toString("utf8").replace(/^\uFEFF/, "")
);

const config = JSON.parse(
  readFileSync(resolve(root, "evaluation/reranker-config.json"), "utf8")
);

const datasetBytes = readFileSync(
  resolve(root, "evaluation/datasets/development.jsonl")
);
assert.equal(hash(datasetBytes), baseline.dataset_sha256,
  "Dataset changed since the baseline run.");

const chunks = readFileSync(
  resolve(root, "data/processed/chunks.jsonl"), "utf8"
).split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);

const chunkMap = new Map(chunks.map(chunk => [chunk.chunk_id, chunk]));
const hybridRuns = baseline.runs.filter(run => run.method === "hybrid");

assert.ok(hybridRuns.length > 0);
assert.equal(config.final_limit, baseline.config.final_limit);
assert.equal(config.candidate_limit, baseline.config.candidate_limit);

env.cacheDir = resolve(root, "data/model-cache");

const tokenizer = await AutoTokenizer.from_pretrained(
  config.model_id,
  { revision: config.model_revision }
);

// Check all candidate inputs before loading the model.
let pairCount = 0;
let maxPairTokens = 0;

for (const run of hybridRuns) {
  assert.ok(Array.isArray(run.candidates) && run.candidates.length > 0,
    "Baseline does not contain saved candidates.");

  assert.ok(run.candidates.length <= config.candidate_limit);
  assert.equal(
    new Set(run.candidates.map(c => c.chunk_id)).size,
    run.candidates.length
  );

  for (const candidate of run.candidates) {
    const chunk = chunkMap.get(candidate.chunk_id);
    assert.ok(chunk, "Candidate is missing from the local corpus.");
    assert.equal(candidate.chunk_text, chunk.text);
    assert.equal(candidate.source_id, chunk.source_id);

    const encoded = await tokenizer(run.question, {
      text_pair: candidate.chunk_text,
      truncation: false,
      padding: false,
      return_tensor: false
    });

    const ids = encoded.input_ids;
    const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;

    assert.ok(Number.isInteger(tokens) && tokens > 0);
    assert.ok(tokens <= config.max_pair_tokens,
      `Pair exceeds token limit: ${run.question_id}, ${candidate.chunk_id}`);

    maxPairTokens = Math.max(maxPairTokens, tokens);
    pairCount++;
  }
}

console.log(
  `PASS: ${pairCount} pairs checked; maximum ${maxPairTokens} tokens.`
);
console.log("Loading reranker. First run downloads model weights.");

const model = await AutoModelForSequenceClassification.from_pretrained(
  config.model_id,
  {
    revision: config.model_revision,
    dtype: config.dtype,
    device: "cpu"
  }
);

const rerankedRuns = [];

try {
  for (const run of hybridRuns) {
    const started = performance.now();
    const scored = [];

    // Score one pair at a time to limit CPU memory use.
    for (const candidate of run.candidates) {
      const features = await tokenizer(run.question, {
        text_pair: candidate.chunk_text,
        truncation: false,
        padding: false
      });

      const output = await model(features);
      assert.ok(output.logits, "Expected classification logits.");
      assert.equal(output.logits.data.length, 1);

      const score = Number(output.logits.data[0]);
      assert.ok(Number.isFinite(score));

      scored.push({ ...candidate, reranker_score: score });
    }

    scored.sort((a, b) =>
      b.reranker_score - a.reranker_score ||
      (a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0)
    );

    const results = scored.slice(0, config.final_limit);
    const answerable = run.answerability === "answerable";
    const found = results.findIndex(row =>
      run.accepted_source_ids.includes(row.source_id)
    );
    const rank = found >= 0 ? found + 1 : null;

    rerankedRuns.push({
      ...run,
      method: "hybrid_reranked",
      candidates: scored,
      results,
      first_accepted_rank: answerable ? rank : null,
      source_hit_at_5: answerable ? Number(rank !== null) : null,
      source_mrr_at_5: answerable ? (rank ? 1 / rank : 0) : null,
      rerank_ms: performance.now() - started
    });

    console.log(`Reranked: ${run.question_id}`);
  }
} finally {
  await model.dispose();
}

const scoredRuns = rerankedRuns.filter(
  run => run.answerability === "answerable"
);
assert.ok(scoredRuns.length > 0);

const rerankedSummary = {
  method: "hybrid_reranked",
  questions: scoredRuns.length,
  source_hit_at_5: scoredRuns.reduce(
    (sum, run) => sum + run.source_hit_at_5, 0
  ) / scoredRuns.length,
  source_mrr_at_5: scoredRuns.reduce(
    (sum, run) => sum + run.source_mrr_at_5, 0
  ) / scoredRuns.length
};

const summary = [...baseline.summary, rerankedSummary];
const runId = new Date().toISOString().replace(/[:.]/g, "-");
const path = `evaluation/results/reranker-${runId}.json`;

writeFileSync(resolve(root, path), JSON.stringify({
  status: "provisional",
  run_id: runId,
  baseline_path: inputPath,
  baseline_sha256: hash(baselineBytes),
  dataset_sha256: baseline.dataset_sha256,
  retrieval_config: baseline.config,
  reranker_config: config,
  max_pair_tokens: maxPairTokens,
  summary,
  runs: rerankedRuns
}, null, 2) + "\n", "utf8");

console.table(summary.map(row => ({
  method: row.method,
  answerable_questions: row.questions,
  source_hit_at_5: row.source_hit_at_5.toFixed(3),
  source_mrr_at_5: row.source_mrr_at_5.toFixed(3)
})));

console.log("RANK CHANGES:");
console.table(scoredRuns.map(run => ({
  question: run.question_id,
  before: hybridRuns.find(
    original => original.question_id === run.question_id
  ).first_accepted_rank,
  after: run.first_accepted_rank
})));

console.log("Saved:", path);
console.log("PROVISIONAL: source-level metrics; human review pending.");
