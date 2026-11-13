import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import vocabulary from "./excerpt-vocabulary.json" with { type: "json" };
import { assessExcerptFocus, assessLegalScope, buildFocusVocabulary } from "./excerpt-focus.mjs";
import { buildEvidenceUnits } from "./evidence-units.mjs";
import { answerWithExcerpts, renderExcerpts } from "./source-excerpts.mjs";

const unit = (source_id, text, title = "CFPB guidance") => ({ source_id, text, title });
const passage = (source_id, text, title = "CFPB guidance") => ({ source_id, title,
  url: "https://www.consumerfinance.gov/ask-cfpb/example/", chunk_text: text });
const ranks = units => units.map(u => ({ unit_id: u.unit_id, score: 5 }));

test("frozen focus vocabulary is reproduced from source text without question labels", () => {
  const raw = readFileSync(fileURLToPath(new URL("../training/datasets/source-inventory.json", import.meta.url)), "utf8")
    .replace(/^\uFEFF/u, "").replace(/\r\n/gu, "\n");
  const bytes = Buffer.from(raw, "utf8");
  const blob = createHash("sha1").update("blob " + bytes.length + "\0").update(bytes).digest("hex");
  assert.deepEqual(buildFocusVocabulary(JSON.parse(raw), blob), vocabulary);
});

test("ordinary cash-withdrawal paraphrase retains credit-card source wording", async () => {
  const text = "With credit cards, grace periods typically apply only to purchase transactions. If you use your card to get a cash advance or use a check you received from your card issuer, generally you must start paying interest as of the date of the transaction.";
  const p = passage("cfpb-47", text, "What is a grace period for a credit card?");
  const result = await answerWithExcerpts("Does a cash withdrawal on my card qualify for interest-free days?", {
    retrieve: async () => [p], buildUnits: buildEvidenceUnits, rank: async (_, units) => ranks(units)
  });
  assert.equal(result.answer, text + " [cfpb-47]");
  assert.equal(result.focus_check_applied, true);
  assert.equal(result.generation_attempts, 0);
});

test("unsupported process-name paraphrases fail even when supplied an attractive ranking", async () => {
  const p = passage("cfpb-314", "The credit reporting company you sent the dispute letter to must investigate your dispute, forward the dispute and all relevant information you provided to the company that provided the information about you, and report the results back to you.");
  for (const question of ["Is arbitration required for a credit report dispute?", "Must I use arbitration to dispute a credit report?"]) {
    const result = await answerWithExcerpts(question, { retrieve: async () => [p], buildUnits: buildEvidenceUnits,
      rank: async (_, units) => ranks(units) });
    assert.equal(result.disposition, "evidence_limited");
    assert.deepEqual(result.sources, []);
  }
});

test("jurisdiction modifiers are checked without a denylist of particular countries", () => {
  for (const question of ["Under Canadian law, what deadline applies?", "According to German regulations, what is required?",
    "Under the laws of Canada, what is the deadline?", "Under New Zealand law, what is required?", "Under PA law, what is required?"]) {
    assert.equal(assessLegalScope(question, vocabulary).confirmed, false);
  }
  for (const question of ["Under U.S. law, what is the deadline?", "Under federal law, what is the deadline?"]) {
    assert.equal(assessLegalScope(question, vocabulary).confirmed, true);
  }
});

test("a marketing-list duration is not accepted for a late-payment-record question", () => {
  const text = "When you place an active-duty alert on your credit report, your name will also be removed for two years from prescreened credit offers and insurance marketing lists.";
  const result = assessExcerptFocus("How many years may an accurate late-payment entry remain on a credit report?",
    unit("cfpb-31", text), vocabulary);
  assert.equal(result.accepted, false);
});

test("corpus context cannot make a title-only match count as body support", () => {
  const result = assessExcerptFocus("What is the annual percentage rate?",
    unit("cfpb-44", "Contact the company for more information.", "Annual percentage rate"), vocabulary);
  assert.equal(result.accepted, false);
  assert.deepEqual(result.body_matched_terms, []);
});

test("duplicate boilerplate across sources is copied once while attribution remains valid", () => {
  const text = "If you have a complaint, tell us about your issue—we'll forward your issue to the company, give you a tracking number, and keep you updated on the status of your complaint.";
  const passages = [passage("cfpb-313", text), passage("cfpb-331", text)];
  const units = buildEvidenceUnits(passages);
  const result = renderExcerpts(passages, units, ranks(units), undefined, "What happens after I submit a company complaint?");
  assert.equal(result.selected_units.length, 1);
  assert.equal(result.sources.length, 1);
  assert.ok(result.answer === text + " [cfpb-313]" || result.answer === text + " [cfpb-331]");
});

test("unseen prototype-like words remain finite data, and invalid focus policies fail", () => {
  const u = unit("cfpb-47", "Cash advances generally accrue interest.");
  const result = assessExcerptFocus("constructor", u, vocabulary);
  assert.equal(Number.isFinite(result.coverage), true);
  assert.equal(result.accepted, false);
  assert.throws(() => assessExcerptFocus("Cash advances?", u, vocabulary, { minimum_coverage: NaN, minimum_body_terms: 2 }));
});

test("source-span integrity is checked before a focus filter can discard a unit", () => {
  const p = passage("cfpb-314", "This is the complete source sentence.");
  const units = buildEvidenceUnits([p]);
  assert.throws(() => renderExcerpts([p], [{ ...units[0], text: "Changed source." }], ranks(units), undefined,
    "Under Canadian law, what is required?"));
});
