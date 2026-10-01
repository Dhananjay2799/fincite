import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { neon } from "@neondatabase/serverless";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readJsonl = path =>
  readFileSync(resolve(root, path), "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(JSON.parse);

try {
  // Check local integrity before sending data to Neon.
  for (const script of [
    "evaluation/validate.mjs",
    "evaluation/validate-chunks.mjs"
  ]) {
    const result = spawnSync(
      process.execPath,
      [resolve(root, script)],
      { cwd: root, stdio: "inherit" }
    );

    if (result.error || result.status !== 0) {
      throw new Error("Local validation failed");
    }
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const documents = readJsonl("data/processed/documents.jsonl");
  const chunks = readJsonl("data/processed/chunks.jsonl");
  const sql = neon(process.env.DATABASE_URL);

  const inserts = [
    ...documents.map(d => sql`
      INSERT INTO fincite_sources (
        source_id, document_sha256, title, url,
        raw_sha256, extractor_version,
        validation_status, document_text
      ) VALUES (
        ${d.source_id}, ${d.text_sha256}, ${d.title}, ${d.url},
        ${d.raw_sha256}, ${d.extractor_version},
        ${d.validation_status}, ${d.text}
      )
      ON CONFLICT (source_id, document_sha256) DO NOTHING
      RETURNING source_id
    `),

    ...chunks.map(c => sql`
      INSERT INTO fincite_chunks (
        chunk_id, source_id, document_sha256,
        chunk_sha256, chunking_version, chunk_index,
        start_char, end_char, offset_unit, chunk_text
      ) VALUES (
        ${c.chunk_id}, ${c.source_id}, ${c.document_sha256},
        ${c.chunk_sha256}, ${c.chunking_version}, ${c.chunk_index},
        ${c.start_char}, ${c.end_char}, ${c.offset_unit}, ${c.text}
      )
      ON CONFLICT (chunk_id) DO NOTHING
      RETURNING chunk_id
    `)
  ];

  const results = await sql.transaction(inserts);
  const inserted = results.reduce((sum, rows) => sum + rows.length, 0);

  // Compare the stored records with local content, including reused rows.
  for (const d of documents) {
    const rows = await sql`
      SELECT title, url, raw_sha256, extractor_version, document_text
      FROM fincite_sources
      WHERE source_id = ${d.source_id}
        AND document_sha256 = ${d.text_sha256}
    `;

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      title: d.title,
      url: d.url,
      raw_sha256: d.raw_sha256,
      extractor_version: d.extractor_version,
      document_text: d.text
    });
  }

  for (const c of chunks) {
    const rows = await sql`
      SELECT source_id, document_sha256, chunk_sha256,
             chunking_version, chunk_index, start_char,
             end_char, offset_unit, chunk_text
      FROM fincite_chunks
      WHERE chunk_id = ${c.chunk_id}
    `;

    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], {
      source_id: c.source_id,
      document_sha256: c.document_sha256,
      chunk_sha256: c.chunk_sha256,
      chunking_version: c.chunking_version,
      chunk_index: c.chunk_index,
      start_char: c.start_char,
      end_char: c.end_char,
      offset_unit: c.offset_unit,
      chunk_text: c.text
    });
  }

  console.log(`PASS: ${documents.length} documents verified in Neon.`);
  console.log(`PASS: ${chunks.length} chunks verified in Neon.`);
  console.log(`New records inserted: ${inserted}`);
} catch (error) {
  console.error("FAIL: import or stored-content verification failed.");

  if (typeof error.code === "string" &&
      /^[A-Z0-9]{5}$/.test(error.code)) {
    console.error("Database error code:", error.code);
  }

  if (error.code === "ERR_ASSERTION") {
    console.error("Stored data does not match the expected local record.");
  }

  process.exitCode = 1;
}
