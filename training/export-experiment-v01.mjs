import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const folder = "training/datasets/v01";
const sha = text => createHash("sha256")
  .update(text, "utf8").digest("hex");

execFileSync(
  process.execPath,
  [`${folder}/validate-dataset-v01.mjs`],
  { stdio: "inherit" }
);

const exports = {};

for (const split of ["train", "validation"]) {
  const input = `${folder}/${split}-candidates-v01.jsonl`;

  const rows = readFileSync(input, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter(line => line.trim())
    .map(line => JSON.parse(line));

  const content = rows.map(row =>
    JSON.stringify({ messages: row.messages })
  ).join("\n") + "\n";

  const filename = `experiment-${split}-v01.jsonl`;
  writeFileSync(`${folder}/${filename}`, content, "utf8");

  exports[split] = {
    filename,
    examples: rows.length,
    sha256: sha(content),
    example_ids: rows.map(row => row.id),
    group_ids: [...new Set(rows.map(row => row.group_id))]
  };

  console.log(`EXPORTED: ${split}: ${rows.length} examples.`);
}

const manifest = {
  version: "0.1",
  purpose: "controlled_development_experiment",
  label_provenance: "assistant_authored",
  human_approval_recorded: false,
  training_review_status: "pending_review",
  exports,
  rules: [
    "Start from the pinned base model, not the smoke adapter.",
    "Only train examples receive gradient updates.",
    "Use validation for tuning and comparison.",
    "Do not add development questions to training.",
    "Do not claim these results are a final held-out benchmark."
  ]
};

writeFileSync(
  `${folder}/experiment-manifest-v01.json`,
  JSON.stringify(manifest, null, 2) + "\n",
  "utf8"
);

console.log("Saved: experiment-manifest-v01.json");
console.log("Original candidate review statuses unchanged.");
