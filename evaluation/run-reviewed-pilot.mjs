import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { auditFreshCandidates } from "./audit-fresh-candidates.mjs";

export function bindPilotReviews(candidates,review) {
 const check=(ok,message)=>{if(!ok)throw Error(message);};
 check(review.kind==="fincite_candidate_question_review_v1","Wrong review format.");
 check(review.dataset_commit==="50927e2ad12de65326e36d65d08422c4dc82fd02"&&review.dataset_path==="evaluation/datasets/fresh-candidates-v1.jsonl","Review is for a different candidate snapshot.");
 check(review.status==="question_review_only_not_test_ready"&&review.benchmark_ready===false&&review.quality_scores===null,"Do not present question review as scored benchmark results.");
 check(Array.isArray(candidates)&&candidates.length===24,"Expected the reviewed 24-candidate pool.");
 check(Array.isArray(review.reviews)&&review.reviews.length===candidates.length,"Review is incomplete.");
 const byId=new Map(candidates.map(q=>[q.id,q])),seen=new Set(),approved=[];
 check(byId.size===candidates.length,"Duplicate candidate IDs.");
 const counts={total:candidates.length,reviewed:0,approved:0,excluded:0,needs_follow_up:0,pending:0};
 for(const r of review.reviews){
  const q=byId.get(r.question_id);check(q&&!seen.has(r.question_id),"Unknown or duplicate reviewed question.");seen.add(r.question_id);
  check(r.question===q.question&&r.saved===true,"Question text changed or decision unsaved.");
  check(r.reviewer_type==="human"&&typeof r.reviewer_id==="string"&&r.reviewer_id.trim()&&r.reviewer_id!==q.authored_by,"Missing distinct human reviewer attestation.");
  check(Number.isFinite(Date.parse(r.reviewed_at))&&Date.parse(r.reviewed_at)<=Date.parse(review.exported_at),"Invalid review timestamp.");
  const values=["evidence","novelty","wording"].map(k=>r.checks?.[k]);check(values.every(v=>["yes","no","unsure"].includes(v)),"Missing review choice.");
  const decision=values.includes("no")?"exclude":values.includes("unsure")?"needs_follow_up":"approve";
  check(r.decision===decision,"Saved decision disagrees with review choices.");counts.reviewed++;
  counts[decision==="approve"?"approved":decision==="exclude"?"excluded":"needs_follow_up"]++;
  if(decision==="approve")approved.push({...q,split:"pilot",review_status:"approved",review:{reviewer_type:"human",reviewer_id:r.reviewer_id,semantic_overlap_checked:true,evidence_checked:true,wording_checked:true,reviewed_at:r.reviewed_at,notes:r.notes??""}});
 }
 check(Object.entries(counts).every(([k,v])=>review.summary?.[k]===v),"Review summary does not match saved records.");
 check(Array.isArray(review.pending_question_ids)&&review.pending_question_ids.length===0,"Unexpected pending IDs.");
 check(approved.some(q=>q.answerability==="answerable")&&approved.some(q=>q.answerability==="unanswerable"),"Pilot needs both approved answerability categories.");
 return {questions:approved,review_summary:counts,purpose:"reviewed_question_pilot",benchmark_ready:false,quality_scores:null};
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const candidatePath = "evaluation/datasets/fresh-candidates-v1.jsonl";
const reviewPath = "evaluation/results/fresh-question-review-2026-10-21T21-59-25-055Z.json";
const reservedPaths = ["evaluation/datasets/development.jsonl", "training/datasets/starter-candidates.jsonl",
  "training/datasets/v01/train-candidates-v01.jsonl", "training/datasets/v01/validation-candidates-v01.jsonl"];
const text = path => readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
const hash = value => createHash("sha256").update(value).digest("hex");
const json = path => JSON.parse(text(path));
const jsonl = path => text(path).split("\n").filter(line => line.trim()).map(JSON.parse);
const save = (path, value, fresh = false) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", fresh ? { flag: "wx" } : {});
};
export function validPilotResponse(body) {
  return Boolean(body && typeof body === "object" && typeof body.answer === "string" && body.answer.trim() &&
    ["answer", "evidence_limited"].includes(body.disposition) && Array.isArray(body.sources) &&
    body.sources.every(s => {
      if (!s || !["id", "title", "quote", "url"].every(k => typeof s[k] === "string")) return false;
      try { const url = new URL(s.url); return url.protocol === "https:" && url.hostname === "www.consumerfinance.gov"; }
      catch { return false; }
    }));
}
function endpoint(value) {
  const url = new URL(value);
  assert.ok(!url.username && !url.password && !url.search && !url.hash && url.pathname === "/", "Use a bare app origin without credentials, query or path.");
  assert.ok(url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)), "Use HTTPS, or loopback HTTP for a local app.");
  return url.origin;
}
async function main() {
  const args = process.argv.slice(2), options = {};
  for (let i=0; i<args.length; i++) {
    const arg = args[i];
    if (arg === "--prepare-only") { assert.ok(!options.prepare); options.prepare = true; }
    else if (["--base-url", "--resume"].includes(arg)) {
      assert.ok(args[i+1] && !args[i+1].startsWith("--"), "Missing flag value.");
      assert.ok(!options[arg], "Duplicate flag."); options[arg] = args[++i];
    } else throw new Error("Usage: node evaluation/run-reviewed-pilot.mjs --base-url APP_ORIGIN [--prepare-only] [--resume REPORT.json]");
  }
  assert.ok(options["--base-url"], "Provide the app to evaluate using --base-url.");
  assert.ok(!(options.prepare && options["--resume"]), "Prepare-only cannot resume a run.");
  const origin = endpoint(options["--base-url"]);
  console.log("Verifying reviewed questions and local corpus...");
  const candidateBytes = Buffer.from(text(candidatePath), "utf8");
  const candidateBlob = createHash("sha1").update("blob " + candidateBytes.length + "\0").update(candidateBytes).digest("hex");
  assert.equal(candidateBlob, "295f7933a641afed4c36c75a929d6d81d753f021", "Candidate snapshot changed after question review.");
  const candidates = jsonl(candidatePath), review = json(reviewPath), inventory = json("training/datasets/source-inventory.json");
  auditFreshCandidates(candidates, reservedPaths.flatMap(jsonl), inventory);
  const bound = bindPilotReviews(candidates, review);
  const chunks = jsonl("data/processed/chunks.jsonl");
  const localChunks = new Map(chunks.map(c => [c.chunk_id, c]));
  const inventoryChunks = inventory.sources.flatMap(s => s.passages.map(p => ({ ...p, source_id: s.source_id })));
  assert.equal(localChunks.size, chunks.length, "Duplicate local chunks.");
  assert.equal(chunks.length, inventoryChunks.length, "Local corpus differs from review inventory.");
  for (const p of inventoryChunks) {
    const chunk = localChunks.get(p.chunk_id);
    assert.ok(chunk && chunk.source_id === p.source_id && chunk.text === p.text, "Local passage changed since question review.");
  }
  for (const script of ["evaluation/validate.mjs", "evaluation/validate-chunks.mjs"]) {
    execFileSync(process.execPath, [resolve(root, script)], { cwd: root, stdio: "inherit" });
  }
  const fingerprintPaths = [candidatePath, reviewPath, "training/datasets/source-inventory.json",
    "evaluation/datasets/corpus-manifest.json", "data/processed/chunks.jsonl", "data/processed/documents.jsonl",
    ...reservedPaths, "evaluation/run-reviewed-pilot.mjs", "evaluation/audit-fresh-candidates.mjs",
    "evaluation/validate.mjs", "evaluation/validate-chunks.mjs"];
  const fingerprints = Object.fromEntries(fingerprintPaths.map(p => [p, hash(text(p))]));
  const verify = () => { for (const [p, digest] of Object.entries(fingerprints)) assert.equal(hash(text(p)), digest, "Input or client code changed: " + p); };
  const manifest = { version: 1, purpose: "reviewed_question_pilot", benchmark_ready: false, question_review_summary: bound.review_summary,
    approved_question_count: bound.questions.length, questions: bound.questions, input_sha256_utf8_lf: fingerprints,
    review_attestation: "Owner-supplied human question review; identity and actual review work are not independently authenticated.",
    limits: ["Small same-corpus pilot, not the 120-question formal held-out test.",
      "Source passages have been used in the project; semantic novelty is a reviewer attestation.",
      "Question approval is not model-answer grading.",
      "Remote deployment, database snapshot and model identity are not attested by this client.",
      "The HTTP response path is evaluated; this is not a matched three-generation-model comparison."] };
  const manifestDigest = hash(JSON.stringify(manifest));
  const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
  if (options.prepare) {
    const output = resolve(root, "evaluation/results/reviewed-pilot-plan-" + stamp + ".json");
    save(output, { status: "prepared_no_requests", manifest_sha256: manifestDigest, base_url: origin, manifest, quality_scores: null }, true);
    console.log("PASS: " + bound.questions.length + " approved pilot questions bound to their source snapshot.");
    console.log("Saved: " + output); return;
  }
  let output, report;
  if (options["--resume"]) {
    output = resolve(root, options["--resume"]); report = json(options["--resume"]);
    assert.equal(report.purpose, "reviewed_question_pilot");
    assert.ok(["in_progress", "incomplete", "complete_ungraded_pilot"].includes(report.status), "Invalidated runs cannot be resumed.");
    assert.equal(report.base_url, origin, "App origin changed.");
    assert.equal(report.manifest_sha256, manifestDigest, "Questions, review, corpus or client code changed.");
    assert.equal(hash(JSON.stringify(report.manifest)), manifestDigest, "Saved manifest changed.");
    assert.ok(Array.isArray(report.results) && Array.isArray(report.failed_attempts), "Invalid resume report.");
    const seen = new Set();
    for (const r of report.results) {
      const q = bound.questions.find(q => q.id === r.question_id);
      assert.ok(q && !seen.has(q.id) && r.question === q.question && typeof r.ok === "boolean", "Misbound or duplicate saved result."); seen.add(q.id);
      if (r.ok) assert.ok(r.http_status >= 200 && r.http_status < 300 && validPilotResponse(r.response), "Invalid successful saved response.");
    }
    report.status = "in_progress";
  } else {
    output = resolve(root, "evaluation/results/reviewed-pilot-" + stamp + ".json");
    let clientCommit = null;
    try { clientCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(); } catch {}
    report = { purpose: "reviewed_question_pilot", status: "in_progress", created_at: new Date().toISOString(),
      base_url: origin, manifest_sha256: manifestDigest, manifest, client_git_head: clientCommit,
      results: [], failed_attempts: [], quality_scores: null, benchmark_ready: false };
    save(output, report, true);
  }
  console.log("Recording " + bound.questions.length + " reviewed pilot questions against " + origin + ".");
  console.log("Avoid other requests or redeployments during this run. No model API key is used by this script.");
  const knownSources = new Set(inventory.sources.map(s => s.source_id));
  let consecutiveFailures = 0;
  try {
    for (const q of bound.questions) {
      const previous = report.results.findIndex(r => r.question_id === q.id);
      if (previous >= 0 && report.results[previous].ok) continue;
      verify();
      const started = performance.now(); let result;
      try {
        const response = await fetch(origin + "/api/chat", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q.question }), signal: AbortSignal.timeout(185000)
        });
        const body = await response.json();
        result = { ok: response.ok && validPilotResponse(body), http_status: response.status, response: body };
        if (result.ok) {
          const supplied = new Set(body.sources.map(s => s.id));
          const cites = [...body.answer.matchAll(/\[(cfpb-[^\]\s]+)\]/gu)].map(m => m[1]);
          result.citation_id_diagnostics = { cited_ids: [...new Set(cites)],
            cited_ids_not_in_response_sources: [...new Set(cites.filter(id => !supplied.has(id)))],
            response_source_ids_not_in_local_corpus: [...new Set([...supplied].filter(id => !knownSources.has(id)))] };
        }
      } catch (error) { result = { ok: false, error: error.name }; }
      const record = { question_id: q.id, question: q.question, elapsed_ms: performance.now() - started, ...result };
      if (previous < 0) report.results.push(record);
      else { report.failed_attempts.push(report.results[previous]); report.results[previous] = record; }
      consecutiveFailures = record.ok ? 0 : consecutiveFailures + 1;
      save(output, report);
      console.log(report.results.length + "/" + bound.questions.length + " " + q.id + ": " + (record.ok ? "recorded" : "FAILED") + "; " + (record.elapsed_ms / 1000).toFixed(2) + " seconds");
      if (consecutiveFailures >= 3) { console.log("Stopping after three consecutive failures. Partial results preserved."); break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    verify();
    report.status = report.results.length === bound.questions.length ? "complete_ungraded_pilot" : "incomplete";
  } catch (error) { report.status = "invalidated"; report.failure = error.message; throw error; }
  finally {
    report.finished_at = new Date().toISOString();
    report.summary = { approved_questions: bound.questions.length, attempted: report.results.length,
      successful: report.results.filter(r => r.ok).length, failed: report.results.filter(r => !r.ok).length,
      response_output_modes: Object.fromEntries([...new Set(report.results.filter(r => r.ok).map(r => r.response.output_mode ?? "unspecified"))]
        .map(mode => [mode, report.results.filter(r => r.ok && (r.response.output_mode ?? "unspecified") === mode).length])),
      quality_scores: null };
    save(output, report); console.table(report.summary); console.log("Saved: " + output);
  }
  console.log("Ungraded pilot responses. Question review does not establish response correctness, source relevance or refusal success.");
  if (report.status !== "complete_ungraded_pilot" || report.summary.failed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
