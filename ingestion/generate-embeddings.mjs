import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { pipeline, env } from "@huggingface/transformers";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const hash = value =>
  createHash("sha256").update(value).digest("hex");

const validation = spawnSync(
  process.execPath,
  [resolve(root, "evaluation/validate-chunks.mjs")],
  { cwd: root, stdio: "inherit" }
);

if (validation.error || validation.status !== 0) {
  throw new Error("Chunk validation failed.");
}

const config = JSON.parse(
  readFileSync(resolve(here, "embedding-config.json"), "utf8")
);

assert.equal(config.dimensions, 384);
assert.equal(config.pooling, "cls");
assert.equal(config.normalize, true);
assert.equal(config.dtype, "fp32");

env.cacheDir = resolve(root, "data/model-cache");

const chunks = readFileSync(
  resolve(root, "data/processed/chunks.jsonl"), "utf8"
).replace(/^\uFEFF/, "").split(/\r?\n/)
  .filter(line => line.trim()).map(JSON.parse);

console.log("Loading embedding model. First run downloads model weights.");

const extractor = await pipeline(
  "feature-extraction",
  config.model_id,
  {
    revision: config.model_revision,
    dtype: config.dtype,
    device: "cpu"
  }
);

const records = [];

for (const chunk of chunks) {
  const input = config.document_prefix + chunk.text;

  const encoded = await extractor.tokenizer(input, {
    truncation: false,
    padding: false,
    return_tensor: false
  });

  const ids = encoded.input_ids;
  const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;

  assert.ok(Number.isInteger(tokens) && tokens > 0);
  assert.ok(tokens <= config.max_tokens,
    `Input too long: ${chunk.chunk_id}`);

  const output = await extractor(input, {
    pooling: config.pooling,
    normalize: config.normalize,
    truncation: false
  });

  const embedding = Array.from(output.data);

  assert.equal(embedding.length, config.dimensions);
  assert.ok(embedding.every(Number.isFinite));

  const norm = Math.sqrt(
    embedding.reduce((sum, value) => sum + value * value, 0)
  );

  assert.ok(Math.abs(norm - 1) < 0.001,
    `Unexpected vector norm: ${chunk.chunk_id}`);

  records.push({
    chunk_id: chunk.chunk_id,
    chunk_sha256: chunk.chunk_sha256,
    model_id: config.model_id,
    model_revision: config.model_revision,
    input_sha256: hash(input),
    input_tokens: tokens,
    dimensions: config.dimensions,
    normalized: config.normalize,
    pooling: config.pooling,
    dtype: config.dtype,
    embedding
  });

  console.log(
    `${records.length}/${chunks.length}: ${chunk.source_id}; ` +
    `${tokens} tokens; ${embedding.length} dimensions`
  );
}

const path = resolve(root, "data/processed/embeddings.jsonl");

writeFileSync(
  `${path}.tmp`,
  records.map(record => JSON.stringify(record)).join("\n") + "\n",
  "utf8"
);
renameSync(`${path}.tmp`, path);

await extractor.dispose();

console.log(`PASS: ${records.length} embeddings saved locally.`);
console.log("PASS: token limits, dimensions, finite values, and unit norms.");
