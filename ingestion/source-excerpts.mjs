export const EXCERPT_POLICY_VERSION = "source-excerpts-v1";
// Development calibration only: logits are not probabilities or correctness scores.
export const EXCERPT_POLICY = Object.freeze({ minimum_logit: -5, score_margin: 2, max_units: 3 });

export function renderExcerpts(passages, candidates, rankings, policy = EXCERPT_POLICY) {
  const byId = new Map(candidates.map(unit => [unit.unit_id, unit]));
  const seen = new Set();
  const ranked = rankings.map(item => {
    const unit = byId.get(item.unit_id);
    if (!unit || seen.has(item.unit_id) || !Number.isFinite(item.score)) throw new Error("Invalid excerpt ranking.");
    seen.add(item.unit_id);
    // Never render model output. Verify exact span and attribution before copying.
    const valid = passages.some(p => p.source_id === unit.source_id && p.title === unit.title &&
      p.url === unit.url && Number.isInteger(unit.start_char) && Number.isInteger(unit.end_char) &&
      unit.start_char >= 0 && unit.end_char > unit.start_char &&
      p.chunk_text.slice(unit.start_char, unit.end_char) === unit.text);
    const url = new URL(unit.url);
    if (!valid || !/^cfpb-\d+$/.test(unit.source_id) || url.protocol !== "https:" || url.hostname !== "www.consumerfinance.gov") {
      throw new Error("Excerpt does not match its supplied source.");
    }
    return { ...unit, score: item.score };
  }).sort((a, b) => b.score - a.score || a.unit_id.localeCompare(b.unit_id));
  const best = ranked[0]?.score;
  const selected = best === undefined || best < policy.minimum_logit ? [] : ranked.filter(unit =>
    unit.score >= policy.minimum_logit && unit.score >= best - policy.score_margin).slice(0, policy.max_units);
  const sources = [];
  for (const unit of selected) {
    const previous = sources.find(source => source.id === unit.source_id);
    if (previous) previous.quote += "\n\n" + unit.text;
    else sources.push({ id: unit.source_id, title: unit.title, url: unit.url, quote: unit.text, cited: true });
  }
  return {
    answer: selected.length ? selected.map(unit => `${unit.text} [${unit.source_id}]`).join("\n\n") :
      "No sufficiently relevant source excerpt was selected. This search cannot determine the answer to your question.",
    disposition: selected.length ? "answer" : "evidence_limited",
    output_mode: "source_excerpts", answer_origin: "retrieved_source_text", generation_attempts: 0,
    sources,
    warnings: [selected.length ? "Source wording copied exactly. These excerpts may not fully answer your question. General guidance cannot determine account-specific decisions or future outcomes." :
      "The relevance filter uses a development threshold. A search limit is not proof that no guidance exists."],
    excerpt_policy_version: EXCERPT_POLICY_VERSION,
    selected_units: selected.map(unit => ({ unit_id: unit.unit_id, source_id: unit.source_id, score: unit.score,
      start_char: unit.start_char, end_char: unit.end_char })),
  };
}

export async function answerWithExcerpts(question, { retrieve, buildUnits, rank, signal }) {
  signal?.throwIfAborted();
  const passages = await retrieve(question);
  signal?.throwIfAborted();
  const candidates = buildUnits(passages);
  const rankings = candidates.length ? await rank(question, candidates, signal) : [];
  signal?.throwIfAborted();
  return renderExcerpts(passages, candidates, rankings);
}
