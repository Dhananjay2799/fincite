import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const folder = dirname(fileURLToPath(import.meta.url));
const read = path => readFileSync(path, "utf8").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
const sha = value => createHash("sha256").update(value, "utf8").digest("hex");
const manifest = JSON.parse(read(join(folder, "dataset-manifest-v01.json")));
const inventory = JSON.parse(read("training/datasets/source-inventory.json"));
const development = read("evaluation/datasets/development.jsonl").split("\n").filter(l => l.trim()).map(JSON.parse);
const normalize = s => s.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
const reserved = new Set(development.map(q => normalize(q.question)));
const passages = new Map();
for (const source of inventory.sources) {
  for (const p of source.passages) passages.set(`${source.source_id}:${p.chunk_id}`, p.text);
}
const allIds = new Set();
const allQuestions = new Set();
const groups = new Map();
for (const split of ["train", "validation"]) {
  const file = `${split}-candidates-v01.jsonl`;
  const content = read(join(folder, file));
  if (sha(content) !== manifest.files[file]) throw new Error(`Dataset file changed: ${file}`);
  const rows = content.split("\n").filter(l => l.trim()).map(JSON.parse);
  if (rows.length !== manifest.counts[split].examples) throw new Error("Count mismatch.");
  for (const row of rows) {
    if (row.split !== split || row.review_status !== "pending_review") throw new Error(`Unexpected status: ${row.id}`);
    if (allIds.has(row.id) || allQuestions.has(normalize(row.question))) throw new Error("Duplicate ID or question.");
    allIds.add(row.id); allQuestions.add(normalize(row.question));
    if (reserved.has(normalize(row.question))) throw new Error("Development question copied.");
    if (groups.has(row.group_id) && groups.get(row.group_id) !== split) throw new Error("Group crosses splits.");
    groups.set(row.group_id, split);
    for (const p of row.passages) {
      const original = passages.get(`${p.source_id}:${p.chunk_id}`);
      if (original === undefined || sha(original) !== p.source_passage_sha256 || original.slice(p.start_char, p.end_char) !== p.text) {
        throw new Error(`Source evidence mismatch: ${row.id}`);
      }
    }
    const sourceIds = new Set(row.passages.map(p => p.source_id));
    const citations = [...row.answer.matchAll(/\[([^\[\]]+)\]/g)].map(m => m[1]);
    if (citations.some(id => !sourceIds.has(id))) throw new Error("Unknown citation.");
    if (row.answerability === "answerable" && (!citations.length || !row.evidence_quotes.length)) throw new Error("Missing support.");
    if (row.evidence_quotes.some(q => !row.passages.some(p => p.text.includes(q)))) throw new Error("Quote mismatch.");
    const expectedUser = `Question: ${row.question}\n\nSupplied passages:\n` + row.passages.map(p => `[${p.source_id}]\n${p.text}`).join("\n\n");
    if (row.messages.length !== 3 || row.messages.map(m => m.role).join(",") !== "system,user,assistant" || row.messages[1].content !== expectedUser || row.messages[2].content !== row.answer) throw new Error("Training messages mismatch.");
  }
  console.log(`PASS: ${split}: ${rows.length} drafts; source spans, hashes, citations and messages verified.`);
}
console.log(`PASS: ${groups.size} question groups; no group crosses train and validation.`);
console.log(`PASS: ${development.length} exact development questions excluded.`);
console.log("Integrity checks only. Human review and semantic approval remain pending.");
