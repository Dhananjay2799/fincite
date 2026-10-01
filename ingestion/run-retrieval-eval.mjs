import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { pipeline, env } from "@huggingface/transformers";
import { neon } from "@neondatabase/serverless";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = path =>
  readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");
const jsonl = path =>
  read(path).split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
const hash = text =>
  createHash("sha256").update(text).digest("hex");

if (!process.env.DATABASE_URL) throw new Error("Missing DATABASE_URL.");

for (const script of ["evaluation/validate.mjs", "evaluation/validate-chunks.mjs"]) {
  const result = spawnSync(process.execPath, [resolve(root, script)], {
    cwd: root, stdio: "inherit"
  });
  if (result.error || result.status !== 0) throw new Error("Validation failed.");
}

const config = JSON.parse(read("evaluation/retrieval-config.json"));
const manifest = JSON.parse(read("evaluation/datasets/corpus-manifest.json"));
const chunks = jsonl("data/processed/chunks.jsonl");
const documents = jsonl("data/processed/documents.jsonl");
const questionBytes = readFileSync(
  resolve(root, "evaluation/datasets/development.jsonl")
);
const questions = jsonl("evaluation/datasets/development.jsonl");

const currentCorpus = {
  documents: documents.map(d => ({
    source_id: d.source_id,
    url: d.url,
    raw_sha256: d.raw_sha256,
    document_sha256: d.text_sha256,
    extractor_version: d.extractor_version,
    validation_status: d.validation_status
  })).sort((a, b) => a.source_id.localeCompare(b.source_id)),
  chunks: chunks.map(c => ({
    chunk_id: c.chunk_id,
    source_id: c.source_id,
    chunk_sha256: c.chunk_sha256,
    document_sha256: c.document_sha256,
    chunking_version: c.chunking_version
  })).sort((a, b) => a.chunk_id.localeCompare(b.chunk_id))
};

assert.equal(hash(JSON.stringify(currentCorpus)), manifest.corpus_sha256);
assert.equal(config.corpus_sha256, manifest.corpus_sha256);
assert.deepEqual(
  JSON.parse(read("ingestion/embedding-config.json")),
  config.embedding
);

const chunkIds = chunks.map(c => c.chunk_id);
const model = config.embedding;
const sql = neon(process.env.DATABASE_URL);

// Ensure every selected chunk has an embedding for this model revision.
const stored = await sql`
  SELECT c.chunk_id, c.chunk_sha256, c.chunk_text, e.input_sha256
  FROM fincite_chunks c
  JOIN fincite_embeddings e ON e.chunk_id = c.chunk_id
  WHERE c.chunk_id = ANY(${chunkIds}::text[])
    AND e.model_id = ${model.model_id}
    AND e.model_revision = ${model.model_revision}
`;

assert.equal(stored.length, chunks.length);
const storedMap = new Map(stored.map(row => [row.chunk_id, row]));
for (const chunk of chunks) {
  const row = storedMap.get(chunk.chunk_id);
  assert.ok(row);
  assert.equal(row.chunk_sha256, chunk.chunk_sha256);
  assert.equal(row.chunk_text, chunk.text);
  assert.equal(row.input_sha256, hash(model.document_prefix + chunk.text));
}

env.cacheDir = resolve(root, "data/model-cache");
const extractor = await pipeline("feature-extraction", model.model_id, {
  revision: model.model_revision, dtype: model.dtype, device: "cpu"
});

const runs = [];

try {
  for (const question of questions) {
    const input = model.query_prefix + question.question;
    const encoded = await extractor.tokenizer(input, {
      truncation: false, padding: false, return_tensor: false
    });
    const ids = encoded.input_ids;
    const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
    assert.ok(Number.isInteger(tokens) && tokens > 0 && tokens <= model.max_tokens);

    const output = await extractor(input, {
      pooling: model.pooling, normalize: model.normalize, truncation: false
    });
    const vector = Array.from(output.data);
    assert.equal(vector.length, model.dimensions);
    assert.ok(vector.every(Number.isFinite));

    const [vectorRows, keywordRows] = await Promise.all([
      sql`
        SELECT c.chunk_id, c.source_id, c.chunk_index, c.chunk_text,
               e.embedding <=> ${JSON.stringify(vector)}::vector AS distance
        FROM fincite_chunks c
        JOIN fincite_embeddings e ON e.chunk_id = c.chunk_id
        WHERE c.chunk_id = ANY(${chunkIds}::text[])
          AND e.model_id = ${model.model_id}
          AND e.model_revision = ${model.model_revision}
        ORDER BY distance, c.chunk_id
        LIMIT ${config.candidate_limit}
      `,
      sql`
        WITH terms AS (
          SELECT unnest(tsvector_to_array(
            to_tsvector('english', ${question.question})
          )) AS term
        ), query AS (
          SELECT CASE WHEN count(*) > 0 THEN
            to_tsquery('english',
              string_agg(quote_literal(term), ' | ' ORDER BY term))
          ELSE NULL::tsquery END AS q FROM terms
        )
        SELECT c.chunk_id, c.source_id, c.chunk_index, c.chunk_text,
               ts_rank_cd(c.search_vector, query.q) AS keyword_score
        FROM fincite_chunks c CROSS JOIN query
        WHERE c.chunk_id = ANY(${chunkIds}::text[])
          AND c.search_vector @@ query.q
        ORDER BY keyword_score DESC, c.chunk_id
        LIMIT ${config.candidate_limit}
      `
    ]);

    const fused = new Map();
    for (const [method, rows] of [
      ["vector", vectorRows], ["keyword", keywordRows]
    ]) {
      rows.forEach((row, index) => {
        const item = fused.get(row.chunk_id) || {
          chunk_id: row.chunk_id,
          source_id: row.source_id,
          chunk_index: row.chunk_index,
          chunk_text: row.chunk_text,
          rrf_score: 0
        };
        item[`${method}_rank`] = index + 1;
        item.rrf_score += 1 / (config.rrf_constant + index + 1);
        fused.set(row.chunk_id, item);
      });
    }

    const hybridRows = [...fused.values()].sort((a, b) =>
      b.rrf_score - a.rrf_score ||
      (a.chunk_id < b.chunk_id ? -1 : a.chunk_id > b.chunk_id ? 1 : 0)
    );

    for (const [method, candidates] of [
      ["vector", vectorRows], ["keyword", keywordRows], ["hybrid", hybridRows]
    ]) {
      const results = candidates.slice(0, config.final_limit);
      const answerable = question.answerability === "answerable";
      const found = results.findIndex(row =>
        question.source_ids.includes(row.source_id)
      );
      const rank = found >= 0 ? found + 1 : null;

      runs.push({
        question_id: question.id,
        question: question.question,
        review_status: question.review_status,
        answerability: question.answerability,
        accepted_source_ids: question.source_ids,
        method,
        source_hit_at_5: answerable ? Number(rank !== null) : null,
        source_mrr_at_5: answerable ? (rank ? 1 / rank : 0) : null,
        first_accepted_rank: answerable ? rank : null,
        results
      });
    }
    console.log(`Completed: ${question.id}`);
  }
} finally {
  await extractor.dispose();
}

const summary = config.methods.map(method => {
  const scored = runs.filter(run =>
    run.method === method && run.answerability === "answerable"
  );
  assert.ok(scored.length > 0);
  return {
    method,
    questions: scored.length,
    source_hit_at_5: scored.reduce((s, r) => s + r.source_hit_at_5, 0) / scored.length,
    source_mrr_at_5: scored.reduce((s, r) => s + r.source_mrr_at_5, 0) / scored.length
  };
});

const runId = new Date().toISOString().replace(/[:.]/g, "-");
const path = `evaluation/results/retrieval-${runId}.json`;
mkdirSync(resolve(root, "evaluation/results"), { recursive: true });
writeFileSync(resolve(root, path), JSON.stringify({
  status: "provisional",
  run_id: runId,
  dataset_sha256: hash(questionBytes),
  config,
  summary,
  runs
}, null, 2) + "\n", "utf8");

console.table(summary.map(row => ({
  method: row.method,
  answerable_questions: row.questions,
  source_hit_at_5: row.source_hit_at_5.toFixed(3),
  source_mrr_at_5: row.source_mrr_at_5.toFixed(3)
})));
console.log("Saved:", path);
console.log("PROVISIONAL: development diagnostics; human review pending.");
