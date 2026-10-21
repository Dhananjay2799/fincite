import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { prepareExcerptReranker } from "../ingestion/excerpt-reranker.mjs";
import { buildEvidenceUnits } from "../ingestion/evidence-units.mjs";
import { answerWithExcerpts, EXCERPT_POLICY } from "../ingestion/source-excerpts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = "evaluation/results/local-development-2026-10-21T02-22-24-402Z.json";
const bytes = readFileSync(resolve(root, path));
const saved = JSON.parse(bytes.toString("utf8"));
const passages = [...new Map(saved.results.flatMap(row => row.api_response.sources.map(source => ({
  source_id: source.id, title: source.title, url: source.url, chunk_text: source.quote
}))).map(p => [p.source_id + "\n" + p.chunk_text, p])).values()];
// Assistant-authored supplemental development probes, not an independent test set.
const questions = [
  ["excerpt-probe-01", "Does a cash withdrawal on my card qualify for interest-free days?"],
  ["excerpt-probe-02", "Should I post my only original evidence when writing to correct a credit report?"],
  ["excerpt-probe-03", "What makes a variable card interest rate move up or down?"],
  ["excerpt-probe-04", "Where do I ask for a card agreement that is missing online?"],
  ["excerpt-probe-05", "Is a closed account still marked open something to check on a credit report?"],
  ["excerpt-probe-06", "Which details on a collection letter show the amount and the deadline for a dispute?"],
  ["excerpt-probe-07", "Which cryptocurrency will double in value next week?"],
  ["excerpt-probe-08", "What is my checking account balance right now?"],
  ["excerpt-probe-09", "Will disputing this error guarantee my mortgage application is approved?"],
  ["excerpt-probe-10", "Will a collector agree to my proposed settlement amount tomorrow?"]
];
const implementation = ["ingestion/source-excerpts.mjs", "ingestion/excerpt-reranker.mjs", "ingestion/evidence-units.mjs", "evaluation/reranker-config.json"];
const implementation_sha256 = Object.fromEntries(implementation.map(path => [path, createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex")]));
const report = { implementation_sha256, status: "excerpt_replay_in_progress", created_at: new Date().toISOString(),
  input_path: path, input_sha256: createHash("sha256").update(bytes).digest("hex"), policy: EXCERPT_POLICY,
  limitations: ["Assistant-authored development probes; no independent human grades.",
    "Replays the union of saved supplied passages, not live Neon retrieval or a retrieval-recall benchmark.",
    "The threshold was selected on earlier development questions; fresh probes do not make it a calibrated probability.",
    "No model generation or bank-account access occurs."], results: [], quality_scores: null };
const output = resolve(root, `evaluation/results/source-excerpt-replay-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
const ranker = await prepareExcerptReranker();
try {
  for (const [id, question] of questions) {
    const started = performance.now();
    const response = await answerWithExcerpts(question, { retrieve: async () => passages,
      buildUnits: buildEvidenceUnits, rank: ranker.rank });
    report.results.push({ question_id: id, question, response, elapsed_ms: performance.now() - started });
    writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
    console.log(`${id}: ${response.selected_units.length} excerpts; ${report.results.at(-1).elapsed_ms.toFixed(0)} ms`);
  }
  report.status = "excerpt_replay_complete_ungraded";
} finally {
  await ranker.dispose();
  report.finished_at = new Date().toISOString();
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
}
console.log(`Saved: ${output}`);
