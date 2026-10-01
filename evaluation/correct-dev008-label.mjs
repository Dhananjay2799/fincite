import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const path = "../evaluation/datasets/development.jsonl";

const questions = readFileSync(path, "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter(line => line.trim())
  .map(JSON.parse);

const documents = readFileSync(
  "../data/processed/documents.jsonl", "utf8"
).split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);

const question = questions.find(q => q.id === "dev-008");
const source = documents.find(d => d.source_id === "cfpb-1253");

assert.ok(question && source);
assert.ok(
  source.text.includes(
    "dispute what is in the report"
  ) &&
  source.text.includes(
    "with the credit reporting company and the company that provided the information"
  ),
  "Expected supporting passage not found; inspect the snapshot."
);

if (!question.source_ids.includes("cfpb-1253")) {
  question.source_ids.push("cfpb-1253");
}

question.label_notes = {
  reason: "cfpb-1253 also supports disputing with both the reporting company and the information supplier.",
  supporting_document_sha256: source.text_sha256,
  status: "pending_human_review"
};

writeFileSync(
  path,
  questions.map(q => JSON.stringify(q)).join("\n") + "\n",
  "utf8"
);

console.log("dev-008 accepted sources:", question.source_ids.join(", "));
console.log("Review status remains:", question.review_status);
