import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildEvidenceUnits } from "../ingestion/evidence-units.mjs";
import { excerptRankingText, RERANKER_INPUT_VERSION } from "../ingestion/reranker-input.mjs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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
 const candidates = readFileSync("evaluation/datasets/fresh-candidates-v1.jsonl","utf8").replace(/^\uFEFF/u,"").trim().split(/\r?\n/u).map(JSON.parse);
 const probes = json("evaluation/results/source-excerpt-replay-2026-10-21T15-18-54-544Z.json").results;
 const questions = [
  ...candidates.map(q => ({ id:q.id, question:q.question, expect_excerpt:q.answerability==="answerable" })),
  ...probes.map((q,i) => ({id:q.question_id,question:q.question,expect_excerpt:i<6})),
  {id:"live-cash",question:"Does my credit card’s purchase grace period apply to cash advances?",expect_excerpt:true},
  {id:"live-arbitration",question:"Must I use arbitration to dispute a credit-report error?",expect_excerpt:false},
  {id:"live-french",question:"Under French law, how long does a credit bureau have to investigate my dispute?",expect_excerpt:false},
  {id:"live-retention",question:"How long does a late payment stay on my credit report?",expect_excerpt:false},
  {id:"live-balance",question:"Can an incorrect account balance or credit limit be a credit-report error?",expect_excerpt:true},
  {id:"live-complaint",question:"What does the CFPB do after I submit a complaint?",expect_excerpt:true}
 ];
 const results=[];
 for(const q of questions){
  const started=performance.now(), rankings=[];
  for(const unit of units){
   const options={text_pair:excerptRankingText(unit),truncation:false,padding:false};
   const check=await tokenizer(q.question,{...options,return_tensor:false});
   const ids=check.input_ids,tokens=Array.isArray(ids[0])?ids[0].length:ids.length;
   if(tokens>config.max_pair_tokens)continue;
   const output=await model(await tokenizer(q.question,options));
   const score=Number(output.logits?.data[0]);
   if(!Number.isFinite(score))throw new Error("Invalid relevance score.");
   rankings.push({unit_id:unit.unit_id,score});
  }
  const response=renderExcerpts(passages,units,rankings,undefined,q.question);
  const matchesExpectation=Boolean(response.selected_units.length)===q.expect_excerpt;
  results.push({...q,elapsed_ms:performance.now()-started,matches_expectation:matchesExpectation,response});
  console.log(q.id+": "+(matchesExpectation?"selection check passed":"SELECTION REGRESSION"));
 }
 const complaint=results.find(r=>r.id==="live-complaint");
 const workflowPresent=/tracking number/u.test(complaint.response.answer)&&/forward/u.test(complaint.response.answer);
 const report={purpose:"full_corpus_publisher_context_development",client_git_head:execFileSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).trim(),
  model_config:config,reranker_input_version:RERANKER_INPUT_VERSION,corpus_chunks:passages.length,unit_count:units.length,
  input_sha256:Object.fromEntries(["training/datasets/source-inventory.json","evaluation/reranker-config.json","ingestion/reranker-input.mjs","ingestion/excerpt-focus.mjs","ingestion/source-excerpts.mjs"].map(p=>[p,createHash("sha256").update(readFileSync(p)).digest("hex")])),
  summary:{cases:results.length,selection_regressions:results.filter(r=>!r.matches_expectation).map(r=>r.id),complaint_workflow_present:workflowPresent},
  results,quality_scores:null,
  limitations:["These inspected development cases influenced the patch.","The full saved corpus is used, not live Neon retrieval or the deployed preview.","Selection presence is not a correctness, completeness or applicability grade."]};
 console.log("PUBLISHER_CONTEXT_DEVELOPMENT "+JSON.stringify(report));
 if(report.summary.selection_regressions.length||!workflowPresent)process.exitCode=1;
} finally {await model.dispose();}
