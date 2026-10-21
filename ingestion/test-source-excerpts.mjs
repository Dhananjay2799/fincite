import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceUnits } from "./evidence-units.mjs";
import { renderExcerpts, answerWithExcerpts } from "./source-excerpts.mjs";

const passage = text => ({ source_id: "cfpb-47", title: "Credit guidance", url: "https://www.consumerfinance.gov/ask-cfpb/example/", chunk_text: text });
const score = (units, value = 5) => units.map(unit => ({ unit_id: unit.unit_id, score: value }));

test("cash-advance exception and conditions are copied without model rewriting", async () => {
  const text = "Grace periods typically apply only to purchases. Cash advances generally accrue interest from the transaction date.";
  const p = passage(text);
  const result = await answerWithExcerpts("Does a cash withdrawal get a grace period?", {
    retrieve: async () => [p], buildUnits: buildEvidenceUnits, rank: async (_, units) => score(units)
  });
  assert.equal(result.answer, text + " [cfpb-47]");
  assert.equal(result.generation_attempts, 0);
  assert.equal(result.output_mode, "source_excerpts");
});

test("mailing list preserves not-originals qualification and nested items", () => {
  const p = passage("Include these documents:\n\n- Contact details\n\n  - A reference number, if available\n\n- Copies (not originals) of supporting documents");
  const units = buildEvidenceUnits([p]);
  const result = renderExcerpts([p], units, score(units));
  assert.equal(result.answer, p.chunk_text + " [cfpb-47]");
  assert.equal(result.sources[0].quote, p.chunk_text);
});

test("ranker cannot invent units, alter text, relabel attribution, or repeat IDs", () => {
  const p = passage("This is the complete source sentence.");
  const units = buildEvidenceUnits([p]);
  assert.throws(() => renderExcerpts([p], units, [{ unit_id: "invented", score: 5 }]));
  assert.throws(() => renderExcerpts([p], [{ ...units[0], text: "Invented advice." }], score(units)));
  assert.throws(() => renderExcerpts([p], [{ ...units[0], source_id: "cfpb-314" }], score(units)));
  assert.throws(() => renderExcerpts([p], units, [...score(units), ...score(units)]));
  assert.throws(() => renderExcerpts([p], units, score(units, NaN)));
});

test("low relevance and empty retrieval produce an explicitly limited search response", async () => {
  const p = passage("This source concerns credit reports.");
  const units = buildEvidenceUnits([p]);
  const result = renderExcerpts([p], units, score(units, -10));
  assert.equal(result.disposition, "evidence_limited");
  assert.deepEqual(result.sources, []);
  assert.match(result.answer, /No sufficiently relevant source excerpt/);
  const empty = await answerWithExcerpts("Question?", { retrieve: async () => [], buildUnits: buildEvidenceUnits,
    rank: async () => { throw new Error("Ranker must not be called"); } });
  assert.equal(empty.generation_attempts, 0);
});

test("a cancelled request does not continue into scoring", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(answerWithExcerpts("Question?", { signal: controller.signal,
    retrieve: async () => { throw new Error("Should not retrieve"); }, buildUnits: buildEvidenceUnits, rank: async () => [] }), { name: "AbortError" });
});

test("multiple complementary units retain source grouping and a bounded result count", () => {
  const p = passage("The notice includes the score used.\n\nIt also includes the bureau contact information.\n\nRequest the reasons within the stated period.\n\nKeep a copy of the notice.");
  const units = buildEvidenceUnits([p]);
  const result = renderExcerpts([p], units, score(units));
  assert.equal(result.selected_units.length, 3);
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].quote.split("\n\n").length, 3);
});
