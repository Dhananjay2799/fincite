// Development comparison harness, not part of CI. Runs the hosted source-excerpt
// responder with the real pinned CPU models against an in-process PGlite database
// that stands in for Neon, so corpus changes can be checked before a database import.
// PGlite is not Neon: ranking ties, text-search and vector results may differ slightly.
//
// Setup: in a scratch directory outside the repository, run
//   npm i @electric-sql/pglite @electric-sql/pglite-pgvector
// then copy this file into that directory and run it from there.
// <questions.json> is an array of { id, question, answerability, source_ids }.
//
// Usage: node run-corpus-comparison.mjs <repo-root> <processed-data-dir> <questions.json> <output.json>
// The manifest and excerpt vocabulary come from <repo-root>, so check out the matching commit.
import { readFileSync, writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
const [repo, dataDir, questionsPath, outPath] = process.argv.slice(2);
if (!outPath) throw new Error("Usage: node run-corpus-comparison.mjs <repo-root> <processed-data-dir> <questions.json> <output.json>");
const jsonl = p => readFileSync(p, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim()).map(JSON.parse);
const db = new PGlite({ extensions: { vector } });
await db.exec(readFileSync(repo + "/database/migrations/001_initial.sql", "utf8").replace(/^﻿/, ""));
const docs = jsonl(dataDir + "/documents.jsonl"), chunks = jsonl(dataDir + "/chunks.jsonl"), embs = jsonl(dataDir + "/embeddings.jsonl");
for (const d of docs) await db.query("INSERT INTO fincite_sources (source_id, document_sha256, title, url, raw_sha256, extractor_version, validation_status, document_text) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
  [d.source_id, d.text_sha256, d.title, d.url, d.raw_sha256, d.extractor_version, d.validation_status, d.text]);
for (const c of chunks) await db.query("INSERT INTO fincite_chunks (chunk_id, source_id, document_sha256, chunk_sha256, chunking_version, chunk_index, start_char, end_char, offset_unit, chunk_text) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
  [c.chunk_id, c.source_id, c.document_sha256, c.chunk_sha256, c.chunking_version, c.chunk_index, c.start_char, c.end_char, c.offset_unit, c.text]);
for (const e of embs) await db.query("INSERT INTO fincite_embeddings (chunk_id, model_id, model_revision, embedding, input_sha256, input_tokens, normalized) VALUES ($1,$2,$3,$4::vector,$5,$6,$7)",
  [e.chunk_id, e.model_id, e.model_revision, JSON.stringify(e.embedding), e.input_sha256, e.input_tokens, e.normalized]);
const createSQL = () => async (strings, ...values) => {
  let text = strings[0];
  values.forEach((_, i) => { text += "$" + (i + 1) + strings[i + 1]; });
  return (await db.query(text, values)).rows;
};
process.env.DATABASE_URL = "pglite://local";
const { loadHostedResources } = await import(repo + "/apps/web/src/lib/server/hosted-rag.mjs");
const { createHostedResponder } = await import(repo + "/apps/web/src/lib/server/hosted-service.mjs");
const answer = createHostedResponder(() => loadHostedResources({ createSQL }));
const questions = JSON.parse(readFileSync(questionsPath, "utf8"));
const out = [];
for (const q of questions) {
  const r = await answer(q.question);
  out.push({ id: q.id, question: q.question, answerability: q.answerability, expected: q.source_ids ?? [], disposition: r.disposition,
    sources: r.sources.map(s => s.id), units: (r.selected_units ?? []).map(u => ({ source_id: u.source_id, score: +u.score.toFixed(2) })), answer: r.answer });
  console.log(q.id, r.disposition, r.sources.map(s => s.id).join(","));
}
writeFileSync(outPath, JSON.stringify(out, null, 1));
process.exit(0);
