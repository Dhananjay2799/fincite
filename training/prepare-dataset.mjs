import { readFileSync, writeFileSync } from "node:fs";

const readJsonl = (path) =>
  readFileSync(path, "utf8")
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));

const chunks = readJsonl("data/processed/chunks.jsonl");
const development = readJsonl(
  "evaluation/datasets/development.jsonl"
);

const sources = new Map();

for (const chunk of chunks) {
  if (!chunk.source_id || typeof chunk.text !== "string") {
    throw new Error("Chunk is missing source_id or text.");
  }

  const entry = sources.get(chunk.source_id) ?? {
    source_id: chunk.source_id,
    title: chunk.title,
    passages: []
  };

  entry.passages.push({
    chunk_id: chunk.chunk_id ?? chunk.id,
    text: chunk.text
  });

  sources.set(chunk.source_id, entry);
}

const inventory = {
  version: "0.1",
  status: "training_preparation",
  purpose: "Teach grounded answers, citations, and refusals.",
  reserved_development_questions: development.map((q) => ({
    id: q.id,
    question: q.question
  })),
  rules: [
    "Do not copy development questions into training.",
    "Check for close paraphrases before exporting training data.",
    "Preserve conditions and exceptions from source passages.",
    "Refuse when supplied evidence cannot answer the question.",
    "Keep final test questions separate from training and tuning."
  ],
  sources: [...sources.values()]
};

writeFileSync(
  "training/datasets/source-inventory.json",
  JSON.stringify(inventory, null, 2) + "\n",
  "utf8"
);

console.log(`Sources: ${sources.size}`);
console.log(`Passages: ${chunks.length}`);
console.log(`Reserved development questions: ${development.length}`);
console.log("Saved: training/datasets/source-inventory.json");
console.log("Preparation only; no training examples approved yet.");
