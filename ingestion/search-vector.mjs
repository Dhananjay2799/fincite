import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { pipeline, env } from "@huggingface/transformers";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  throw new Error("Pass a question as a command-line argument.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL.");
}

const config = JSON.parse(
  readFileSync(resolve(here, "embedding-config.json"), "utf8")
);

env.cacheDir = resolve(root, "data/model-cache");

const extractor = await pipeline(
  "feature-extraction",
  config.model_id,
  {
    revision: config.model_revision,
    dtype: config.dtype,
    device: "cpu"
  }
);

try {
  const input = config.query_prefix + question;

  const encoded = await extractor.tokenizer(input, {
    truncation: false,
    padding: false,
    return_tensor: false
  });

  const ids = encoded.input_ids;
  const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;

  assert.ok(Number.isInteger(tokens) && tokens > 0);
  assert.ok(tokens <= config.max_tokens, "Question exceeds token limit.");

  const output = await extractor(input, {
    pooling: config.pooling,
    normalize: config.normalize,
    truncation: false
  });

  const embedding = Array.from(output.data);
  assert.equal(embedding.length, 384);
  assert.ok(embedding.every(Number.isFinite));

  const vector = JSON.stringify(embedding);
  const sql = neon(process.env.DATABASE_URL);

  const rows = await sql`
    SELECT
      c.chunk_id,
      c.source_id,
      c.chunk_index,
      s.title,
      s.url,
      c.chunk_text,
      1 - (e.embedding <=> ${vector}::vector) AS similarity
    FROM fincite_embeddings e
    JOIN fincite_chunks c ON c.chunk_id = e.chunk_id
    JOIN fincite_sources s
      ON s.source_id = c.source_id
      AND s.document_sha256 = c.document_sha256
    WHERE e.model_id = ${config.model_id}
      AND e.model_revision = ${config.model_revision}
    ORDER BY e.embedding <=> ${vector}::vector, c.chunk_id
    LIMIT 5
  `;

  console.log("\nQuestion:", question);

  console.table(rows.map((row, index) => ({
    rank: index + 1,
    source: row.source_id,
    chunk: row.chunk_index,
    similarity: Number(row.similarity).toFixed(4),
    title: row.title
  })));

  if (rows.length) {
    console.log("\nTOP PASSAGE:\n");
    console.log(rows[0].chunk_text);
    console.log("\nSOURCE:", rows[0].url);
  } else {
    console.log("No matching embeddings found.");
    process.exitCode = 1;
  }
} finally {
  await extractor.dispose();
}
