import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const hash = value =>
  createHash("sha256").update(value).digest("hex");

const readJsonl = path =>
  readFileSync(resolve(root, path), "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(JSON.parse);

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const config = JSON.parse(
    readFileSync(resolve(here, "embedding-config.json"), "utf8")
  );
  const chunks = readJsonl("data/processed/chunks.jsonl");
  const records = readJsonl("data/processed/embeddings.jsonl");
  const chunkMap = new Map(chunks.map(c => [c.chunk_id, c]));

  assert.equal(records.length, chunks.length);
  assert.equal(new Set(records.map(r => r.chunk_id)).size, records.length);

  for (const record of records) {
    const chunk = chunkMap.get(record.chunk_id);
    assert.ok(chunk, "Embedding references an unknown chunk");

    assert.equal(hash(chunk.text), chunk.chunk_sha256);
    assert.equal(record.chunk_sha256, chunk.chunk_sha256);
    assert.equal(
      record.input_sha256,
      hash(config.document_prefix + chunk.text)
    );

    assert.equal(record.model_id, config.model_id);
    assert.equal(record.model_revision, config.model_revision);
    assert.equal(record.pooling, config.pooling);
    assert.equal(record.dtype, config.dtype);
    assert.equal(record.normalized, true);
    assert.equal(record.dimensions, 384);
    assert.equal(record.embedding.length, 384);
    assert.ok(record.embedding.every(Number.isFinite));
    assert.ok(Number.isInteger(record.input_tokens));
    assert.ok(record.input_tokens > 0 &&
      record.input_tokens <= config.max_tokens);

    const norm = Math.sqrt(
      record.embedding.reduce((sum, x) => sum + x * x, 0)
    );
    assert.ok(Math.abs(norm - 1) < 0.001);
  }

  const sql = neon(process.env.DATABASE_URL);

  // Check that Neon contains the same chunks before uploading.
  for (const record of records) {
    const rows = await sql`
      SELECT chunk_sha256, chunk_text
      FROM fincite_chunks
      WHERE chunk_id = ${record.chunk_id}
    `;

    assert.equal(rows.length, 1);
    assert.equal(rows[0].chunk_sha256, record.chunk_sha256);
    assert.equal(rows[0].chunk_text, chunkMap.get(record.chunk_id).text);
  }

  const results = await sql.transaction(records.map(record => sql`
    INSERT INTO fincite_embeddings (
      chunk_id, model_id, model_revision, embedding,
      input_sha256, input_tokens, normalized
    ) VALUES (
      ${record.chunk_id},
      ${record.model_id},
      ${record.model_revision},
      ${JSON.stringify(record.embedding)}::vector,
      ${record.input_sha256},
      ${record.input_tokens},
      ${record.normalized}
    )
    ON CONFLICT (chunk_id, model_id, model_revision) DO NOTHING
    RETURNING chunk_id
  `));

  const inserted = results.reduce((sum, rows) => sum + rows.length, 0);

  // Verify reused records too, including vector values.
  for (const record of records) {
    const rows = await sql`
      SELECT input_sha256, input_tokens, normalized,
             embedding::text AS vector_text
      FROM fincite_embeddings
      WHERE chunk_id = ${record.chunk_id}
        AND model_id = ${record.model_id}
        AND model_revision = ${record.model_revision}
    `;

    assert.equal(rows.length, 1);
    const stored = rows[0];

    assert.equal(stored.input_sha256, record.input_sha256);
    assert.equal(stored.input_tokens, record.input_tokens);
    assert.equal(stored.normalized, true);

    const vector = JSON.parse(stored.vector_text);
    assert.equal(vector.length, 384);

    vector.forEach((value, index) => {
      assert.ok(
        Number.isFinite(value) &&
        Math.abs(value - record.embedding[index]) < 0.000001,
        "Stored vector differs from local embedding"
      );
    });
  }

  console.log(`PASS: ${records.length} embeddings verified in Neon.`);
  console.log(`New embeddings inserted: ${inserted}`);
} catch (error) {
  console.error("FAIL: embedding import or verification failed.");

  if (typeof error.code === "string" &&
      /^[A-Z0-9]{5}$/.test(error.code)) {
    console.error("Database error code:", error.code);
  }

  if (error.code === "ERR_ASSERTION") {
    console.error("Local or stored embedding data failed an integrity check.");
  }

  process.exitCode = 1;
}
