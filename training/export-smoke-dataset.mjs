import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const input = "training/datasets/starter-candidates.jsonl";
const output = "training/datasets/smoke-train.jsonl";

const rows = readFileSync(input, "utf8")
  .replace(/^\uFEFF/, "")
  .split(/\r?\n/)
  .filter(line => line.trim())
  .map(line => JSON.parse(line));

if (rows.length !== 12) {
  throw new Error(`Expected 12 starter examples; found ${rows.length}.`);
}

for (const row of rows) {
  const roles = row.messages?.map(message => message.role);
  if (JSON.stringify(roles) !==
      JSON.stringify(["system", "user", "assistant"])) {
    throw new Error(`Unexpected message structure: ${row.id}`);
  }
  if (row.messages[2].content !== row.answer) {
    throw new Error(`Answer and training message differ: ${row.id}`);
  }
}

const content = rows
  .map(row => JSON.stringify({ messages: row.messages }))
  .join("\n") + "\n";

writeFileSync(output, content, "utf8");

const manifest = {
  version: "0.1",
  purpose: "pipeline_smoke_test_only",
  input_file: input,
  output_file: output,
  output_sha256: createHash("sha256")
    .update(content, "utf8").digest("hex"),
  example_ids: rows.map(row => row.id),
  examples: rows.length,
  review: {
    type: "assistant_guided",
    human_approval_recorded: false
  },
  limitations: [
    "Too small to establish fine-tuning quality.",
    "No independent human review recorded.",
    "Development questions are not training examples.",
    "Final held-out evaluation remains separate."
  ]
};

writeFileSync(
  "training/datasets/smoke-train-manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log("Saved: " + output);
console.log("Saved: training/datasets/smoke-train-manifest.json");
console.log(`Exported ${rows.length} examples for a training smoke test.`);
console.log("Original review statuses unchanged.");
