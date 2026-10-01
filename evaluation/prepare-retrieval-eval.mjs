import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = value =>
  createHash("sha256").update(value).digest("hex");

const readJsonl = path =>
  readFileSync(resolve(root, path), "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(JSON.parse);

const documents = readJsonl("data/processed/documents.jsonl");
const chunks = readJsonl("data/processed/chunks.jsonl");
const embeddings = readJsonl("data/processed/embeddings.jsonl");

const model = JSON.parse(
  readFileSync(resolve(root, "ingestion/embedding-config.json"), "utf8")
);

assert.equal(embeddings.length, chunks.length);
assert.equal(
  new Set(embeddings.map(record => record.chunk_id)).size,
  chunks.length
);

const embeddingMap = new Map(
  embeddings.map(record => [record.chunk_id, record])
);

for (const chunk of chunks) {
  const record = embeddingMap.get(chunk.chunk_id);
  assert.ok(record, `Missing embedding: ${chunk.chunk_id}`);
  assert.equal(record.chunk_sha256, chunk.chunk_sha256);
  assert.equal(record.model_id, model.model_id);
  assert.equal(record.model_revision, model.model_revision);
  assert.equal(record.pooling, model.pooling);
  assert.equal(record.dtype, model.dtype);
}

const corpus = {
  documents: documents.map(document => ({
    source_id: document.source_id,
    url: document.url,
    raw_sha256: document.raw_sha256,
    document_sha256: document.text_sha256,
    extractor_version: document.extractor_version,
    validation_status: document.validation_status
  })).sort((a, b) => a.source_id.localeCompare(b.source_id)),

  chunks: chunks.map(chunk => ({
    chunk_id: chunk.chunk_id,
    source_id: chunk.source_id,
    chunk_sha256: chunk.chunk_sha256,
    document_sha256: chunk.document_sha256,
    chunking_version: chunk.chunking_version
  })).sort((a, b) => a.chunk_id.localeCompare(b.chunk_id))
};

const corpusSha256 = hash(JSON.stringify(corpus));

writeFileSync(
  resolve(root, "evaluation/datasets/corpus-manifest.json"),
  JSON.stringify({
    corpus_sha256: corpusSha256,
    ...corpus
  }, null, 2) + "\n",
  "utf8"
);

writeFileSync(
  resolve(root, "evaluation/retrieval-config.json"),
  JSON.stringify({
    version: "0.1",
    corpus_sha256: corpusSha256,
    embedding: model,
    methods: ["vector", "keyword", "hybrid"],
    candidate_limit: 20,
    final_limit: 5,
    rrf_constant: 60,
    keyword_policy: "english_lexemes_OR_ts_rank_cd",
    tie_breaker: "chunk_id_ascending",
    metrics: ["source_hit_at_5", "source_mrr_at_5"],
    benchmark_status: "provisional_until_human_review"
  }, null, 2) + "\n",
  "utf8"
);

console.log(`PASS: manifest records ${documents.length} documents and ${chunks.length} chunks.`);
console.log("Corpus fingerprint:", corpusSha256);
console.log("PASS: retrieval comparison settings saved.");
console.log("Question and content review statuses remain unchanged.");
