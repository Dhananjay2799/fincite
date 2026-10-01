import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");

const answerPath =
  "evaluation/results/answer-development-20261001T231733Z.json";
const reviewPath =
  "evaluation/results/fincite-answer-development-review.json";
const outputPath =
  "evaluation/results/answer-review-packet-v01.json";

assert(
  !existsSync(resolve(root, outputPath)),
  "Review packet already exists. Retain it to avoid overwriting reviews."
);

const answers = JSON.parse(read(answerPath));
const assistantReview = JSON.parse(read(reviewPath));
const questions = new Map(
  read("evaluation/datasets/development.jsonl")
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      const question = JSON.parse(line);
      return [question.id, question];
    })
);

const canonicalHash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const rubric = {
  version: "answer-review-0.1",
  status: "draft_pending_human_review",
  reference_statuses: [
    "met", "missing", "contradicted", "uncertain"
  ],
  evidence_statuses: [
    "supported", "unsupported", "contradicted", "uncertain"
  ],
  response_types: ["answer", "refusal", "mixed"],
  rules: [
    "Judge against the exact supplied passages.",
    "Preserve material conditions, exceptions and responsible actors.",
    "Missing required information affects completeness, not automatically grounding.",
    "Unsupported and contradicted factual claims are grounding failures.",
    "A valid citation ID does not establish citation support.",
    "Assess citation support and citation coverage separately.",
    "Accept semantic refusals; do not require an exact refusal phrase.",
    "An answer followed by an incompatible refusal is mixed.",
    "Keep uncertain judgments unresolved until adjudicated.",
    "Assistant suggestions do not count as human-reviewed labels.",
    "Development questions and answers must not enter training data."
  ]
};

const packet = {
  version: "0.1",
  status: "pending_human_review",
  input_answer_file: answerPath,
  input_answer_canonical_sha256: canonicalHash(answers),
  development_dataset_canonical_sha256:
    canonicalHash([...questions.values()]),
  rubric,
  reviews: answers.runs.map((run) => {
    const question = questions.get(run.question_id);
    assert(question, `Unknown question: ${run.question_id}`);

    const suggestion = assistantReview.reviews.find(
      (review) =>
        review.question_id === run.question_id &&
        review.prompt_version === run.prompt_version
    );
    assert(suggestion, "Missing assistant review.");

    return {
      review_id: `${run.question_id}:${run.prompt_version}`,
      question_id: run.question_id,
      prompt_version: run.prompt_version,
      question: run.question,
      answerability: question.answerability,
      answer: run.answer,
      passages: run.passages,
      reference_checks: question.reference_claims.map((claim, index) => ({
        criterion_id: `${question.id}:reference:${index + 1}`,
        criterion: claim,
        status: null,
        reason: null
      })),
      forbidden_checks: question.forbidden_claims.map((claim, index) => ({
        criterion_id: `${question.id}:forbidden:${index + 1}`,
        criterion: claim,
        present: null,
        reason: null
      })),
      factual_claim_checks: [],
      response_type: null,
      correct_refusal: null,
      assistant_suggestion: {
        assessment: suggestion.assessment,
        reason: suggestion.reason
      },
      reviewer_name: null,
      reviewed_at: null,
      human_review_status: "pending_human_review"
    };
  })
};

assert.equal(packet.reviews.length, 26);

writeFileSync(
  resolve(root, outputPath),
  JSON.stringify(packet, null, 2) + "\n",
  "utf8"
);

console.log(`PASS: ${packet.reviews.length} review entries prepared.`);
console.log("PASS: complete reference and forbidden claims included.");
console.log("Human labels remain empty; assistant suggestions are separate.");
console.log(`Saved: ${outputPath}`);
