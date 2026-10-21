import { createHash } from "node:crypto";

const normalized = text => text.replace(/\s+/gu, " ").trim();
const isList = text => /^(?:[-*•]|\d+[.)])\s/u.test(text);
const isHeading = text => /[?:]$/u.test(text) || (!/[.!]$/u.test(text) && text.split(/\s+/u).length <= 18);

// Keep whole paragraphs and list groups for source excerpts and offline review.
// Offsets refer to the original supplied passage, not normalized display text.
export function buildEvidenceUnits(passages) {
  const units = [], seen = new Set();
  for (const passage of passages) {
    const text = passage.chunk_text;
    const paragraphs = [...text.matchAll(/\S[\s\S]*?(?=\r?\n[ \t]*\r?\n|$)/gu)].map(match => ({
      text: match[0].trim(), start: match.index, end: match.index + match[0].trimEnd().length
    }));
    let section = "";
    for (let i = 0; i < paragraphs.length; i++) {
      const first = paragraphs[i];
      if (normalized(first.text) === normalized(passage.title)) { section = first.text; continue; }
      const nextIsList = paragraphs[i + 1] && isList(paragraphs[i + 1].text);
      let end = i;
      if (isList(first.text) || nextIsList) {
        while (paragraphs[end + 1] && isList(paragraphs[end + 1].text)) end++;
      } else if (isHeading(first.text)) { section = first.text; continue; }
      const quote = text.slice(first.start, paragraphs[end].end);
      const key = passage.source_id + "\n" + normalized(quote);
      if (!seen.has(key)) {
        seen.add(key);
        units.push({ unit_id: createHash("sha256").update(key).digest("hex"), source_id: passage.source_id,
          title: passage.title, url: passage.url, section, text: quote,
          start_char: first.start, end_char: paragraphs[end].end });
      }
      i = end;
    }
  }
  return units;
}
