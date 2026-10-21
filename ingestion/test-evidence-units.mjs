import test from "node:test";
import assert from "node:assert/strict";
import { buildEvidenceUnits } from "./evidence-units.mjs";

const p = text => ({ source_id: "cfpb-314", title: "Dispute guidance", url: "https://www.consumerfinance.gov/example/", chunk_text: text });
test("a mailing checklist retains its introduction, nested item and original-document qualification", () => {
  const passage = p("Dispute guidance\n\nHow to dispute an error?\n\nIf you mail a dispute, your dispute letter should include:\n\n- Your contact information\n\n  - A confirmation number, if available\n\n- Copies (not originals) of supporting documents\n\nYou can choose certified mail.");
  const units = buildEvidenceUnits([passage]);
  assert.equal(units.length, 2);
  assert.match(units[0].text, /^If you mail/);
  assert.match(units[0].text, /Copies \(not originals\)/);
  assert.match(units[0].text, /if available/);
  for (const unit of units) assert.equal(passage.chunk_text.slice(unit.start_char, unit.end_char), unit.text);
});
test("headings and dangling list introductions never become answer candidates", () => {
  const units = buildEvidenceUnits([p("What should I do?\n\nSubmit a complaint\n\nThe lender is also required to:")]);
  assert.deepEqual(units, []);
});
test("complete conditional paragraph remains intact", () => {
  const text = "If the card gives a grace period, paying in full can avoid interest. This does not apply to cash advances.";
  assert.equal(buildEvidenceUnits([p(text)])[0].text, text);
});
test("duplicate source units are removed but identical words from different sources retain attribution", () => {
  const a = p("This is source text.");
  assert.equal(buildEvidenceUnits([a, a]).length, 1);
  assert.equal(buildEvidenceUnits([a, { ...a, source_id: "cfpb-47" }]).length, 2);
});
test("CRLF paragraph boundaries and nested list indentation preserve exact offsets", () => {
  const passage = p("Include these items:\r\n\r\n- Copies\r\n\r\n  - Not originals\r\n\r\nKeep records.");
  const units = buildEvidenceUnits([passage]);
  assert.equal(units.length, 2);
  assert.match(units[0].text, /\r\n\r\n  - Not originals/);
  for (const unit of units) assert.equal(passage.chunk_text.slice(unit.start_char, unit.end_char), unit.text);
});
test("a prose list introduction is kept with its required notice fields", () => {
  const passage = p("The information helps you recognize the debt.\n\n- The creditor's name\n\n- The current amount\n\n- The end date of the dispute period");
  const units = buildEvidenceUnits([passage]);
  assert.equal(units.length, 1);
  assert.equal(units[0].text, passage.chunk_text);
});
