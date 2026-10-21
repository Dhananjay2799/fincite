export const ABSTENTION = "The supplied passages do not answer this question.";
export const OUTPUT_POLICY_VERSION = "source-quotes-v1";
const normalize = text => text.normalize("NFC").replace(/\s+/gu, " ").trim();
const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });

// Check complete source sentences, not arbitrary substrings. This prevents
// copying only the conclusion of an 'if ...' sentence and dropping its condition.
function isCompleteQuote(quote, text) {
  const wanted = normalize(quote);
  for (const paragraph of text.split(/\n\s*\n/u)) {
    const sentences = [...segmenter.segment(paragraph)].map(s => normalize(s.segment));
    for (let start = 0; start < sentences.length; start++) {
      let candidate = "";
      for (let end = start; end < sentences.length; end++) {
        candidate += (candidate ? " " : "") + sentences[end];
        if (candidate === wanted) return true;
        if (candidate.length >= wanted.length) break;
      }
    }
  }
  return false;
}

export function checkQuotedAnswer(answer, passages) {
  if (answer === ABSTENTION) return;
  const units = [...answer.matchAll(/([^]*?)\[(cfpb-[^\]\s]+)\]/gu)];
  if (!units.length || answer.slice(units.at(-1).index + units.at(-1)[0].length).trim()) {
    throw new Error("Each source quotation must end with its supplied citation. The answer was withheld.");
  }
  if (units.length > 3) throw new Error("Too many source quotations. The answer was withheld.");
  for (const [, quote, id] of units) {
    const matching = passages.filter(p => p.source_id === id);
    if (!matching.some(p => isCompleteQuote(quote.trim(), p.chunk_text))) {
      throw new Error("The answer is not a complete quotation from its cited passage. The answer was withheld.");
    }
  }
}
