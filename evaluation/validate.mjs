import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");
const jsonl = (path) =>
  read(path).split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
const hash = (value) =>
  createHash("sha256").update(value).digest("hex");

const rubric = JSON.parse(read("evaluation/rubric.json"));
const sources = JSON.parse(read("evaluation/datasets/sources.json"));
const questions = jsonl("evaluation/datasets/development.jsonl");
const documents = jsonl("data/processed/documents.jsonl");

assert.ok(rubric.metrics, "Missing evaluation metrics");
assert.ok(Array.isArray(sources), "Sources must be an array");
assert.ok(questions.length > 0, "No development questions");

for (const [name, records, key] of [
  ["sources", sources, "id"],
  ["questions", questions, "id"],
  ["documents", documents, "source_id"]
]) {
  assert.equal(
    new Set(records.map(record => record[key])).size,
    records.length,
    `Duplicate IDs in ${name}`
  );
}

for (const source of sources) {
  const raw = readFileSync(resolve(root, source.snapshot_path));
  assert.equal(hash(raw), source.snapshot_sha256,
    `Changed snapshot: ${source.id}`);

  const document = documents.find(d => d.source_id === source.id);
  assert.ok(document, `Missing document: ${source.id}`);
  assert.equal(document.raw_sha256, source.snapshot_sha256);
  assert.equal(hash(document.text), document.text_sha256,
    `Changed document text: ${source.id}`);
  assert.equal(
    read(`data/processed/${source.id}.txt`),
    document.text,
    `Text file differs from JSONL: ${source.id}`
  );
}

for (const question of questions) {
  assert.equal(question.split, "development");
  assert.ok(["answerable", "unanswerable"].includes(question.answerability));
  assert.ok(question.reference_claims.length > 0);

  for (const id of question.source_ids) {
    assert.ok(sources.some(source => source.id === id),
      `Unknown source ${id} in ${question.id}`);
  }

  if (question.answerability === "answerable") {
    assert.ok(question.source_ids.length > 0,
      `Answerable question has no source: ${question.id}`);
  }
}

console.log(`PASS: ${sources.length} snapshots and documents verified.`);
console.log(`PASS: ${questions.length} development questions validated.`);
console.log("Human-review status unchanged. No benchmark scores yet.");
