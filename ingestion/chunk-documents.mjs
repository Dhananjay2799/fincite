import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = value =>
  createHash("sha256").update(value).digest("hex");

const documents = readFileSync(
  resolve(root, "data/processed/documents.jsonl"), "utf8"
).replace(/^\uFEFF/, "").split(/\r?\n/)
  .filter(line => line.trim()).map(JSON.parse);

const targetChars = 1800;
const overlapLimit = 600;
const policyVersion = "paragraphs-v1";
const chunks = [];

for (const document of documents) {
  assert.equal(hash(document.text), document.text_sha256);

  // Find paragraphs and preserve their exact positions.
  const paragraphs = [...document.text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)]
    .map(match => ({
      start: match.index,
      end: match.index + match[0].length,
      table: match[0].includes(" | ")
    }));

  // Keep consecutive table rows together, including the header.
  const units = [];

  for (const paragraph of paragraphs) {
    const previous = units.at(-1);

    if (paragraph.table && previous?.table) {
      previous.end = paragraph.end;
    } else {
      units.push({ ...paragraph });
    }
  }

  let first = 0;
  let coveredUntil = 0;
  let index = 0;

  while (first < units.length) {
    let last = first;

    while (
      last + 1 < units.length &&
      units[last + 1].end - units[first].start <= targetChars
    ) {
      last++;
    }

    const start = units[first].start;
    const end = units[last].end;
    const text = document.text.slice(start, end);

    // Gaps between spans may contain only paragraph separators.
    assert.ok(
      document.text.slice(coveredUntil, start).trim() === "",
      `Missing content in ${document.source_id}`
    );
    coveredUntil = Math.max(coveredUntil, end);

    chunks.push({
      chunk_id: hash([
        document.source_id,
        document.text_sha256,
        policyVersion,
        start,
        end
      ].join(":")),
      source_id: document.source_id,
      title: document.title,
      url: document.url,
      document_sha256: document.text_sha256,
      chunk_sha256: hash(text),
      chunk_index: index++,
      start_char: start,
      end_char: end,
      offset_unit: "UTF-16 code units",
      chunking_version: policyVersion,
      oversized: text.length > targetChars,
      validation_status: document.validation_status,
      text
    });

    // Stop once the final unit has been included.
    if (last === units.length - 1) break;

    // Repeat the final short unit when doing so makes forward progress.
    const finalUnitLength = units[last].end - units[last].start;
    first = last > first && finalUnitLength <= overlapLimit
      ? last
      : last + 1;
  }

  assert.equal(document.text.slice(coveredUntil).trim(), "");
  console.log(`${document.source_id}: ${index} chunks`);
}

assert.equal(
  new Set(chunks.map(chunk => chunk.chunk_id)).size,
  chunks.length,
  "Duplicate chunk IDs"
);

writeFileSync(
  resolve(root, "data/processed/chunks.jsonl"),
  chunks.map(chunk => JSON.stringify(chunk)).join("\n") + "\n",
  "utf8"
);

console.log(`PASS: ${chunks.length} chunks; document coverage checked.`);
console.log(
  `Oversized chunks: ${chunks.filter(chunk => chunk.oversized).length}`
);

