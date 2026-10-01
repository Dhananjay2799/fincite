import { readFileSync } from "node:fs";
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
const byId = new Map(documents.map(document =>
  [document.source_id, document]
));

assert.ok(chunks.length > 0, "No chunks found");
assert.equal(new Set(chunks.map(c => c.chunk_id)).size, chunks.length);

for (const chunk of chunks) {
  const document = byId.get(chunk.source_id);
  assert.ok(document, `Unknown source: ${chunk.source_id}`);

  assert.equal(chunk.document_sha256, document.text_sha256);
  assert.equal(chunk.url, document.url);
  assert.equal(chunk.title, document.title);
  assert.equal(chunk.offset_unit, "UTF-16 code units");

  assert.ok(Number.isInteger(chunk.start_char));
  assert.ok(Number.isInteger(chunk.end_char));
  assert.ok(chunk.start_char >= 0);
  assert.ok(chunk.end_char > chunk.start_char);
  assert.ok(chunk.end_char <= document.text.length);

  assert.equal(
    chunk.text,
    document.text.slice(chunk.start_char, chunk.end_char),
    `Chunk differs from source: ${chunk.chunk_id}`
  );
  assert.equal(hash(chunk.text), chunk.chunk_sha256);

  assert.equal(
    chunk.chunk_id,
    hash([
      chunk.source_id,
      chunk.document_sha256,
      chunk.chunking_version,
      chunk.start_char,
      chunk.end_char
    ].join(":"))
  );
}

for (const document of documents) {
  const group = chunks
    .filter(chunk => chunk.source_id === document.source_id)
    .sort((a, b) => a.chunk_index - b.chunk_index);

  assert.ok(group.length > 0, `No chunks: ${document.source_id}`);

  let coveredUntil = 0;

  group.forEach((chunk, index) => {
    assert.equal(chunk.chunk_index, index);

    if (chunk.start_char > coveredUntil) {
      assert.equal(
        document.text.slice(coveredUntil, chunk.start_char).trim(),
        "",
        `Missing content: ${document.source_id}`
      );
    }

    assert.ok(
      chunk.end_char > coveredUntil,
      `Redundant trailing chunk: ${document.source_id}`
    );

    coveredUntil = chunk.end_char;
  });

  assert.equal(document.text.slice(coveredUntil).trim(), "");
}

console.log(
  `PASS: ${chunks.length} chunks verified against ${documents.length} documents.`
);
console.log("PASS: hashes, offsets, IDs, ordering, and coverage.");
