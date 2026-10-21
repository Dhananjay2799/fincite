import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROMPT_VERSION, OUTPUT_POLICY_VERSION } from "../ingestion/live-rag-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const json = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/u, ""));
const jsonl = path => readFileSync(path, "utf8").replace(/^\uFEFF/u, "").split(/\r?\n/u).filter(s => s.trim()).map(JSON.parse);
const normalized = q => q.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const nonempty = value => typeof value === "string" && value.trim().length > 0;
const saveNew = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
};

export function validateTest(questions, reserved, knownSources, minimum = 120) {
  assert.ok(questions.length >= minimum, `Need at least ${minimum} reviewed test questions.`);
  const ids = new Set(), texts = new Set();
  const usedTexts = new Set(reserved.map(q => normalized(q.question)));
  const usedGroups = new Set(reserved.map(q => q.group_id).filter(Boolean));
  for (const q of questions) {
    assert.ok(nonempty(q.id) && !ids.has(q.id), "Question IDs must be unique."); ids.add(q.id);
    assert.ok(nonempty(q.question) && q.question.length <= 1000, `Invalid question: ${q.id}`);
    const text = normalized(q.question);
    assert.ok(!texts.has(text) && !usedTexts.has(text), `Duplicate or reserved question: ${q.id}`); texts.add(text);
    assert.ok(q.split === "test" && nonempty(q.group_id) && !usedGroups.has(q.group_id), `Split/group collision: ${q.id}`);
    assert.ok(["answerable", "unanswerable"].includes(q.answerability), `Invalid answerability: ${q.id}`);
    assert.ok(q.review_status === "approved" && q.review?.reviewer_type === "human", `Human question review required: ${q.id}`);
    assert.ok(nonempty(q.authored_by) && nonempty(q.review.reviewer_id) && q.authored_by !== q.review.reviewer_id,
      `Different question author and reviewer required: ${q.id}`);
    assert.ok(q.review.semantic_overlap_checked === true && q.review.evidence_checked === true,
      `Semantic overlap and evidence review required: ${q.id}`);
    assert.ok(Array.isArray(q.source_ids) && q.source_ids.every(id => knownSources.has(id)), `Unknown source: ${q.id}`);
    assert.ok(q.answerability !== "answerable" || q.source_ids.length > 0, `Missing supporting source: ${q.id}`);
    assert.ok(Array.isArray(q.reference_claims) && q.reference_claims.length && q.reference_claims.every(nonempty), `Missing criteria: ${q.id}`);
    assert.ok(Array.isArray(q.forbidden_claims) && q.forbidden_claims.every(nonempty), `Invalid forbidden claims: ${q.id}`);
  }
  const answerable = questions.filter(q => q.answerability === "answerable").length;
  assert.ok(answerable && answerable < questions.length, "Include both answerable and unanswerable questions.");
  return { total: questions.length, answerable, unanswerable: questions.length - answerable,
    question_groups: new Set(questions.map(q => q.group_id)).size };
}

export function scoreRun(manifest, report, labels) {
  assert.equal(report.status, "complete", "Incomplete or changed-input runs cannot be scored.");
  assert.equal(report.manifest_sha256, hash(JSON.stringify(manifest)), "Wrong manifest for run.");
  assert.equal(report.results.length, manifest.questions.length, "Missing responses.");
  const byQuestion = new Map(report.results.map(r => [r.question_id, r]));
  assert.equal(byQuestion.size, manifest.questions.length, "Duplicate response IDs.");
  const reviews = new Map(labels.map(r => [r.question_id, r]));
  assert.equal(reviews.size, labels.length, "Duplicate reviews.");
  const counts = { total: manifest.questions.length, failed_requests: 0, correct: 0, substantive_answers: 0,
    unsupported_answers: 0, answerable: 0, unanswerable: 0, correct_refusals: 0, false_refusals: 0,
    cited_responses: 0, supported_cited_responses: 0 };
  for (const q of manifest.questions) {
    const r = byQuestion.get(q.id);
    assert.ok(r, `Missing response: ${q.id}`);
    counts[q.answerability]++;
    if (!r.ok) { counts.failed_requests++; continue; }
    const review = reviews.get(q.id);
    assert.ok(review?.reviewer_type === "human" && nonempty(review.reviewer_id) && review.reviewer_id !== q.authored_by,
      `Independent human answer review required: ${q.id}`);
    for (const field of ["correct", "substantive_answer", "has_unsupported_claims", "refused"]) {
      assert.equal(typeof review[field], "boolean", `Missing ${field}: ${q.id}`);
    }
    assert.ok(!(review.refused && review.substantive_answer), `Conflicting refusal/substantive labels: ${q.id}`);
    assert.ok(!review.has_unsupported_claims || review.substantive_answer, `Unsupported claims require substantive answer: ${q.id}`);
    const cites = /\[cfpb-[^\]\s]+\]/u.test(r.response.answer);
    if (cites) {
      assert.equal(typeof review.citation_supported, "boolean", `Missing citation-support review: ${q.id}`);
      counts.cited_responses++; counts.supported_cited_responses += Number(review.citation_supported);
    }
    counts.correct += Number(review.correct);
    counts.substantive_answers += Number(review.substantive_answer);
    counts.unsupported_answers += Number(review.has_unsupported_claims);
    if (q.answerability === "unanswerable" && review.refused && review.correct) counts.correct_refusals++;
    if (q.answerability === "answerable" && review.refused) counts.false_refusals++;
  }
  assert.ok(labels.every(l => manifest.questions.some(q => q.id === l.question_id)), "Unknown review question ID.");
  const ratio = (a, b) => b ? a / b : null;
  return { status: "human_reviewed_test_results", counts, rates: {
    answer_correctness: ratio(counts.correct, counts.total),
    answer_coverage: ratio(counts.substantive_answers, counts.total),
    unsupported_answer_rate: ratio(counts.unsupported_answers, counts.substantive_answers),
    refusal_recall: ratio(counts.correct_refusals, counts.unanswerable),
    false_refusal_rate: ratio(counts.false_refusals, counts.answerable),
    supported_cited_response_rate: ratio(counts.supported_cited_responses, counts.cited_responses)
  }, limitations: ["Human identity and review attestations are recorded, not externally authenticated.",
    "Citation support is measured per cited response, not per citation.",
    "Failure counts are reported; failed requests count against correctness and coverage.",
    "Reusing this test for tuning invalidates future held-out claims."] };
}

async function main() {
  const [command, first, second, third, fourth] = process.argv.slice(2);
  const corpusPath = resolve(root, "evaluation/datasets/corpus-manifest.json");
  const chunkPath = resolve(root, "data/processed/chunks.jsonl");
  if (command === "freeze") {
    assert.ok(first && second, "Usage: node evaluation/heldout.mjs freeze QUESTIONS.jsonl MANIFEST.json");
    const files = ["evaluation/datasets/development.jsonl", "training/datasets/starter-candidates.jsonl",
      "training/datasets/v01/train-candidates-v01.jsonl", "training/datasets/v01/validation-candidates-v01.jsonl"];
    const reserved = files.flatMap(p => jsonl(resolve(root, p)));
    const corpus = json(corpusPath), questions = jsonl(resolve(first));
    const summary = validateTest(questions, reserved, new Set(corpus.documents.map(d => d.source_id)));
    const manifest = { version: 1, purpose: "held_out_test", frozen_at: new Date().toISOString(), summary,
      corpus_sha256: hash(readFileSync(corpusPath)), chunks_sha256: hash(readFileSync(chunkPath)),
      reserved_sha256: Object.fromEntries(files.map(p => [p, hash(readFileSync(resolve(root, p)))])),
      question_file_sha256: hash(readFileSync(resolve(first))), questions };
    saveNew(resolve(second), manifest);
    console.log("Frozen:", summary, "Keep this test out of training and prompt tuning.");
  } else if (command === "run") {
    assert.ok(first && second, "Usage: node evaluation/heldout.mjs run MANIFEST.json OUTPUT.json");
    const manifest = json(resolve(first));
    assert.equal(manifest.purpose, "held_out_test");
    const verifyInputs = () => {
      assert.equal(hash(readFileSync(corpusPath)), manifest.corpus_sha256, "Corpus manifest changed.");
      assert.equal(hash(readFileSync(chunkPath)), manifest.chunks_sha256, "Chunks changed.");
      for (const [p, digest] of Object.entries(manifest.reserved_sha256)) assert.equal(hash(readFileSync(resolve(root, p))), digest, "Reserved dataset changed.");
    };
    verifyInputs();
    const healthResponse = await fetch("http://127.0.0.1:8081/health", { signal: AbortSignal.timeout(10000) });
    assert.ok(healthResponse.ok); const health = await healthResponse.json();
    assert.equal(health.prompt_version, PROMPT_VERSION); assert.equal(health.output_policy_version, OUTPUT_POLICY_VERSION);
    const codePaths = ["ingestion/live-rag-core.mjs", "ingestion/grounding-policy.mjs", "ingestion/live-retrieval.mjs", "ingestion/serve-local-rag.mjs"];
    const codeHashes = Object.fromEntries(codePaths.map(p => [p, hash(readFileSync(resolve(root, p)))]));
    const output = resolve(second);
    const report = { status: "in_progress", manifest_sha256: hash(JSON.stringify(manifest)), created_at: new Date().toISOString(),
      bridge_health: health, code_sha256: codeHashes, model_identity: "Not attested by this HTTP runner", results: [] };
    saveNew(output, report);
    try {
      for (const q of manifest.questions) {
        const started = performance.now();
        let result;
        try {
          const response = await fetch("http://127.0.0.1:3000/api/chat", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ question: q.question }), signal: AbortSignal.timeout(185000) });
          const body = await response.json();
          result = { ok: response.ok && nonempty(body.answer) && Array.isArray(body.sources), http_status: response.status, response: body };
        } catch (error) { result = { ok: false, error: error.name }; }
        report.results.push({ question_id: q.id, elapsed_ms: performance.now() - started, ...result });
        writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
        console.log(`${report.results.length}/${manifest.questions.length}: ${result.ok ? "recorded" : "FAILED"}`);
      }
      verifyInputs();
      for (const [p, digest] of Object.entries(codeHashes)) assert.equal(hash(readFileSync(resolve(root, p))), digest, "Code changed during run.");
      report.status = "complete";
    } finally { report.finished_at = new Date().toISOString(); writeFileSync(output, JSON.stringify(report, null, 2) + "\n"); }
    console.log("Responses saved. No quality scores until independent human reviews are supplied.");
  } else if (command === "score") {
    assert.ok(first && second && third && fourth, "Usage: node evaluation/heldout.mjs score MANIFEST.json RUN.json REVIEWS.json SCORES.json");
    saveNew(resolve(fourth), scoreRun(json(resolve(first)), json(resolve(second)), json(resolve(third))));
    console.log("Saved reviewed scores with coverage and failure counts.");
  } else throw new Error("Commands: freeze, run, score. See docs/reliability-and-release.md.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
