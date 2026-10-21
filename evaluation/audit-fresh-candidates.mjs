import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export function auditFreshCandidates(questions,reserved,inventory){
 const check=(ok,message)=>{if(!ok)throw new Error(message);};
 const norm=q=>q.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
 const str=v=>typeof v==="string"&&v.trim().length>0;
 check(Array.isArray(questions)&&questions.length>0,"No candidates.");
 const passages=new Map(); const sources=new Set();
 for(const s of inventory.sources){sources.add(s.source_id);for(const p of s.passages)passages.set(s.source_id+"/"+p.chunk_id,p.text);}
 const usedTexts=new Set(reserved.map(q=>norm(q.question))),usedGroups=new Set(reserved.map(q=>q.group_id).filter(Boolean));
 const ids=new Set(),texts=new Set(),groups=new Map(),warnings=[];let answerable=0,quotes=0;
 for(const q of questions){
  check(str(q.id)&&!ids.has(q.id),"Duplicate/missing candidate ID.");ids.add(q.id);
  check(str(q.question)&&q.question.length<=1000,"Invalid question "+q.id);
  const n=norm(q.question);check(!texts.has(n)&&!usedTexts.has(n),"Duplicate/reserved question "+q.id);texts.add(n);
  check(str(q.group_id)&&!usedGroups.has(q.group_id),"Reserved group "+q.id);
  check(q.split==="candidate"&&q.proposed_split==="test","Candidates must not masquerade as frozen test data.");
  check(q.review_status==="pending_human_review"&&str(q.authored_by),"Candidate review state invalid "+q.id);
  check(q.review&&q.review.reviewer_type===null&&q.review.reviewer_id===null&&q.review.semantic_overlap_checked===false&&q.review.evidence_checked===false,"Do not manufacture human approval "+q.id);
  check(["answerable","unanswerable"].includes(q.answerability),"Invalid answerability "+q.id);
  if(groups.has(q.group_id))check(groups.get(q.group_id)===q.answerability,"Group mixes answerability labels.");groups.set(q.group_id,q.answerability);
  check(Array.isArray(q.source_ids)&&new Set(q.source_ids).size===q.source_ids.length&&q.source_ids.every(s=>sources.has(s)),"Unknown/duplicate source "+q.id);
  check(Array.isArray(q.reference_claims)&&q.reference_claims.length>0&&q.reference_claims.every(str),"Missing criteria "+q.id);
  check(Array.isArray(q.forbidden_claims)&&q.forbidden_claims.every(str),"Invalid forbidden claims "+q.id);
  check(Array.isArray(q.evidence)&&str(q.overlap_review_notes),"Missing evidence/review notes "+q.id);
  check(q.model_exposure==="not_run_on_candidate_questions","Candidate already exposed "+q.id);
  if(q.answerability==="answerable"){
   answerable++;check(q.source_ids.length>0&&q.evidence.length>0,"Missing answer evidence "+q.id);
   for(const e of q.evidence){
    const text=passages.get(e.source_id+"/"+e.chunk_id);
    check(q.source_ids.includes(e.source_id)&&typeof text==="string","Unbound evidence "+q.id);
    check(Number.isInteger(e.start_char_in_chunk)&&Number.isInteger(e.end_char_in_chunk)&&e.start_char_in_chunk>=0&&e.end_char_in_chunk>e.start_char_in_chunk&&e.end_char_in_chunk<=text.length,"Invalid chunk offsets "+q.id);
    check(str(e.text)&&text.slice(e.start_char_in_chunk,e.end_char_in_chunk)===e.text,"Changed quote "+q.id);quotes++;
   }
   check(q.source_ids.every(s=>q.evidence.some(e=>e.source_id===s)),"Declared source lacks quote "+q.id);
  }else check(q.source_ids.length===0&&q.evidence.length===0&&str(q.unanswerable_reason),"Unsupported label requires absence review "+q.id);
  const words=new Set(n.split(" "));const closest=reserved.map(r=>{const other=new Set(norm(r.question).split(" "));const intersection=[...words].filter(w=>other.has(w)).length;return {id:r.id,score:intersection/(words.size+other.size-intersection)};}).sort((a,b)=>b.score-a.score)[0];
  warnings.push({question_id:q.id,nearest_reserved_by_word_jaccard:closest,semantic_overlap_checked:false,notes:q.overlap_review_notes});
 }
 check(answerable>0&&answerable<questions.length,"Both categories required.");
 return {status:"candidate_integrity_only",candidates:questions.length,answerable,unanswerable:questions.length-answerable,question_groups:groups.size,bound_quotes:quotes,reserved_records:reserved.length,human_approved:0,frozen:false,quality_scores:null,benchmark_ready:false,required_reviewed_test_questions:120,warnings,limitations:["Exact and lexical checks do not establish semantic novelty.","Bound quotations do not establish completeness, current legal applicability or answerability.","No generation or scoring is performed. The existing heldout.mjs human-review and 120-question gates remain unchanged."]};
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const readJson = p => JSON.parse(readFileSync(resolve(root, p), "utf8").replace(/^\uFEFF/u, ""));
  const readJsonl = p => readFileSync(resolve(root, p), "utf8").replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(s => s.trim()).map(JSON.parse);
  const reservedPaths = [
    "evaluation/datasets/development.jsonl",
    "training/datasets/starter-candidates.jsonl",
    "training/datasets/v01/train-candidates-v01.jsonl",
    "training/datasets/v01/validation-candidates-v01.jsonl"
  ];
  const [candidatePath = "evaluation/datasets/fresh-candidates-v1.jsonl", outputPath] = process.argv.slice(2);
  if (process.argv.length > 4) throw new Error("Usage: node evaluation/audit-fresh-candidates.mjs [CANDIDATES.jsonl] [NEW_AUDIT.json]");
  const result = auditFreshCandidates(readJsonl(candidatePath), reservedPaths.flatMap(readJsonl), readJson("training/datasets/source-inventory.json"));
  console.log(`PASS: ${result.candidates} candidates; ${result.answerable} answerable; ${result.unanswerable} unanswerable.`);
  console.log(`PASS: ${result.bound_quotes} exact chunk-bound quotes; ${result.reserved_records} reserved records checked.`);
  console.log("Candidate integrity only. Semantic novelty, evidence sufficiency and corpus-wide absence await independent human review.");
  console.log("Not frozen; no model calls or benchmark scores. Existing 120-question gate unchanged.");
  if (outputPath) {
    writeFileSync(resolve(root, outputPath), JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
    console.log("Saved: " + resolve(root, outputPath));
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
