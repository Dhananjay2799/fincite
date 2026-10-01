import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (path) =>
  readFileSync(resolve(root, path), "utf8").replace(/^\uFEFF/, "");

const jsonl = (path) =>
  read(path).split(/\r?\n/).filter((line) => line.trim()).map(JSON.parse);

const input = process.argv[2];
assert(input, "Pass the answer-results file path.");

const batch = JSON.parse(read(input));
const questions = new Map(
  jsonl("evaluation/datasets/development.jsonl").map((q) => [q.id, q])
);
const chunks = new Map(
  jsonl("data/processed/chunks.jsonl").map((c) => [c.chunk_id, c])
);
const model = JSON.parse(read("inference/model-config.json"));
const retrieval = JSON.parse(
  read(`evaluation/results/${batch.retrieval_file}`)
);

assert.equal(batch.model_id, model.model_id);
assert.equal(batch.model_revision, model.model_revision);
assert.equal(batch.enable_thinking, false);
assert.equal(batch.generation_settings.do_sample, false);
assert.equal(batch.generation_settings.num_beams, 1);
assert.equal(
  batch.generation_settings.max_new_tokens,
  model.max_new_tokens
);

const versions = Object.keys(batch.prompt_versions);
assert.equal(batch.runs.length, questions.size * versions.length);

const seen = new Set();
const diagnostics = new Map(
  versions.map((version) => [version, {
    prompt_version: version,
    answers: 0,
    unknown_citation_responses: 0,
    empty_answers: 0,
    token_limit_reached: 0,
  }])
);

for (const run of batch.runs) {
  const question = questions.get(run.question_id);
  assert(question, `Unknown question: ${run.question_id}`);
  assert.equal(run.question, question.question);
  assert.equal(run.answerability, question.answerability);
  assert(diagnostics.has(run.prompt_version), "Unknown prompt version.");

  const key = `${run.question_id}:${run.prompt_version}`;
  assert(!seen.has(key), `Duplicate answer: ${key}`);
  seen.add(key);

  const matches = retrieval.runs.filter(
    (r) => r.question_id === run.question_id &&
      r.method === "hybrid_reranked"
  );
  assert.equal(matches.length, 1);
  assert.deepEqual(
    run.passages,
    matches[0].results.slice(0, batch.context_limit)
  );

  for (const passage of run.passages) {
    const chunk = chunks.get(passage.chunk_id);
    assert(chunk, `Unknown chunk: ${passage.chunk_id}`);
    assert.equal(passage.source_id, chunk.source_id);
    assert.equal(passage.chunk_text, chunk.text);
  }

  const context = run.passages.map(
    (p) => `SOURCE [${p.source_id}]\n${p.chunk_text}`
  ).join("\n\n");

  assert.deepEqual(run.messages, [
    { role: "system", content: batch.prompt_versions[run.prompt_version] },
    {
      role: "user",
      content: `Question: ${run.question}\n\nRetrieved passages:\n${context}`,
    },
  ]);

  const cited = [...new Set(
    [...run.answer.matchAll(/\[(cfpb-\d+)\]/g)].map((m) => m[1])
  )].sort();
  const allowed = new Set(run.passages.map((p) => p.source_id));
  const unknown = cited.filter((id) => !allowed.has(id));

  assert.deepEqual(run.cited_source_ids, cited);
  assert.deepEqual(run.unknown_citation_ids, unknown);
  assert(Number.isFinite(run.generation_seconds));
  assert(run.generation_seconds >= 0);
  assert(Number.isInteger(run.input_tokens) && run.input_tokens > 0);
  assert(run.input_tokens <= model.max_input_tokens);
  assert(Number.isInteger(run.generated_tokens) && run.generated_tokens > 0);
  assert(run.generated_tokens <= batch.generation_settings.max_new_tokens);
  assert.equal(
    run.reached_token_limit,
    run.generated_tokens >= batch.generation_settings.max_new_tokens
  );

  const stats = diagnostics.get(run.prompt_version);
  stats.answers++;
  stats.unknown_citation_responses += Number(unknown.length > 0);
  stats.empty_answers += Number(!run.answer.trim());
  stats.token_limit_reached += Number(run.reached_token_limit);
}

console.log(`PASS: ${batch.runs.length} answer records verified.`);
console.log("PASS: questions, model revision, prompts and retrieved passages.");
console.log("PASS: saved citation-ID diagnostics match recomputed values.");
console.table([...diagnostics.values()]);
console.log("Integrity checks only. Grounding and human-review status unchanged.");
