import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildEvidenceUnits } from "../ingestion/evidence-units.mjs";
import { renderExcerpts } from "../ingestion/source-excerpts.mjs";
const require = createRequire(resolve("apps/web/package.json"));
const { AutoTokenizer, AutoModelForSequenceClassification, env } = require("@huggingface/transformers");
const json = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/u, ""));
const inventory = json("training/datasets/source-inventory.json");
const manifest = json("evaluation/datasets/corpus-manifest.json");
const config = json("evaluation/reranker-config.json");
const docs = new Map(manifest.documents.map(d => [d.source_id, d]));
const passages = inventory.sources.flatMap(s => s.passages.map(p => ({
  source_id: s.source_id, title: s.title, url: docs.get(s.source_id).url, chunk_id: p.chunk_id, chunk_text: p.text
})));
const units = buildEvidenceUnits(passages);
env.cacheDir = resolve(tmpdir(), "fincite-diagnostic-models");
env.allowLocalModels = false;
const tokenizer = await AutoTokenizer.from_pretrained(config.model_id, { revision: config.model_revision });
const model = await AutoModelForSequenceClassification.from_pretrained(config.model_id, {
  revision: config.model_revision, dtype: config.dtype, device: "cpu",
  session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 }
});
try {
  const question = "What does the CFPB do after I submit a complaint?";
  const rankings = [];
  for (const unit of units) {
    const options = { text_pair: unit.text, truncation: false, padding: false };
    const check = await tokenizer(question, { ...options, return_tensor: false });
    const ids = check.input_ids, tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
    if (tokens > config.max_pair_tokens) continue;
    const output = await model(await tokenizer(question, options));
    const score = Number(output.logits?.data[0]);
    if (!Number.isFinite(score)) throw new Error("Invalid relevance score.");
    rankings.push({ unit_id: unit.unit_id, score });
  }
  rankings.sort((a,b) => b.score-a.score);
  const byId = new Map(units.map(u => [u.unit_id,u]));
  console.log("COMPLAINT_DIAGNOSTIC " + JSON.stringify({
    purpose: "development_candidate_recall_diagnostic", question, corpus_chunks: passages.length,
    unit_count: units.length, ranked_units: rankings.length,
    top_units: rankings.slice(0,12).map(r => ({ ...r, ...byId.get(r.unit_id) })),
    full_corpus_result: renderExcerpts(passages, units, rankings, undefined, question),
    limitations: ["All saved corpus chunks are ranked; this does not reproduce live Neon top-five retrieval.", "Inspected development case, not independent quality evaluation."]
  }));
} finally { await model.dispose(); }
