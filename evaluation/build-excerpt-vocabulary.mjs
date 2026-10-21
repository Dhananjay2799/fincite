import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFocusVocabulary } from "../ingestion/excerpt-focus.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] ?? "--check";
assert.ok(["--check", "--write"].includes(mode) && process.argv.length <= 3, "Use --check or --write.");
const text = readFileSync(resolve(root, "training/datasets/source-inventory.json"), "utf8").replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
const bytes = Buffer.from(text, "utf8");
const blob = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
const value = buildFocusVocabulary(JSON.parse(text), blob);
const path = resolve(root, "ingestion/excerpt-vocabulary.json");
if (mode === "--write") {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
  console.log("Saved vocabulary derived only from the source inventory.");
} else {
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8")), value, "Vocabulary changed; rebuild deliberately after reviewing corpus changes.");
  console.log("PASS: excerpt vocabulary matches all " + value.document_count + " saved source articles.");
}
