import { ABSTENTION, checkQuotedAnswer } from "./grounding-policy.mjs";
import { evidenceCandidates, selectionMessages, selectionFormat, selectedText } from "./evidence-selection.mjs";
export { OUTPUT_POLICY_VERSION } from "./grounding-policy.mjs";
export const PROMPT_VERSION = "local-live-v0.6";
const MAX_INPUT = 2048 - 256 - 64;
// Match the plain-text response format used for the LoRA experiment.
const system = "Answer using only the supplied passages. Keep the answer brief and preserve conditions and exceptions. Cite supported factual claims using [source_id]. If the passages cannot answer the question, explain that limitation without guessing or inventing a citation.";
const quoteSystem = `Use only the supplied passages. Answer with up to three complete source sentences copied verbatim, each followed by its [source_id]. Preserve conditions; do not paraphrase. If not answerable, return exactly: ${ABSTENTION}`;
export function messagesFor(question, passages, answerMode = "generated") {
  if (!["generated", "quoted"].includes(answerMode)) throw new Error("Invalid answer mode.");
  return [{ role: "system", content: answerMode === "quoted" ? quoteSystem : system }, { role: "user", content:
    "Question: " + question + "\n\nSupplied passages:\n" +
    passages.map(p => `[${p.source_id}]\n${p.chunk_text}`).join("\n\n") }];
}
export function finishAnswer(raw, passages, generation, answerMode = "generated") {
  if (generation.choices?.[0]?.finish_reason !== "stop") {
    throw new Error("The model answer was cut short. Please try a shorter question.");
  }
  const answer = typeof raw === "string" ? raw.trim() : "";
  if (!answer || /^(?:["']?evidence_limited["']?|["']?answer["']?)$/i.test(answer) ||
      answer.startsWith("{") || answer.startsWith("```json")) {
    throw new Error("The model returned an internal label or invalid answer format. The answer was withheld.");
  }
  const cited = new Set([...answer.matchAll(/\[(cfpb-[^\]\s]+)\]/g)].map(m => m[1]));
  if (/<\/?think\b|<\|[^]*?\|>/iu.test(answer)) {
    throw new Error("The model returned internal reasoning markers. The answer was withheld.");
  }
  const allowed = new Set(passages.map(p => p.source_id));
  if ([...cited].some(id => !allowed.has(id))) {
    throw new Error("The model cited a source that was not supplied. The answer was withheld.");
  }
  if (answerMode === "quoted") checkQuotedAnswer(answer, passages);
  if (cited.size === 0 && answer !== ABSTENTION) {
    throw new Error("The model did not cite its answer. The answer was withheld.");
  }
  const warnings = answer === ABSTENTION ? [] : [answerMode === "quoted" ?
    "Exact source wording checked. Relevance, completeness and applicability still need review." :
    "Citation IDs checked only. Factual support has not been verified."];
  const sources = [];
  for (const passage of passages) {
    const previous = sources.find(s => s.id === passage.source_id);
    if (previous) previous.quote += "\n\n" + passage.chunk_text;
    else sources.push({ id: passage.source_id, title: passage.title, url: passage.url,
      quote: passage.chunk_text, cited: cited.has(passage.source_id) });
  }
  // 'answer' is a response container, not an answerability or correctness grade.
  // Do not infer refusal success from a model-generated enum.
  return { answer, disposition: answer === ABSTENTION ? "evidence_limited" : "answer", sources, warnings };
}
export async function answerQuestion(question, { retrieve, modelPost, answerMode = "generated" }) {
  const rows = await retrieve(question);
  if (!rows.length) return { answer: "No passages were retrieved from the current corpus for this question.",
    disposition: "evidence_limited", sources: [], warnings: [] };
  const passages = [];
  // Whole passages only; reserve output tokens and account for the chat template.
  for (const row of rows.slice(0, 2)) {
    const proposed = [...passages, row];
    const formatted = await modelPost("/apply-template", {
      messages: answerMode === "quoted" ? selectionMessages(question, evidenceCandidates(proposed)) : messagesFor(question, proposed, answerMode),
      chat_template_kwargs: { enable_thinking: false }
    });
    if (typeof formatted.prompt !== "string") throw new Error("Could not verify model input size.");
    const encoded = await modelPost("/tokenize", {
      content: formatted.prompt, add_special: true, parse_special: true
    });
    if (!Array.isArray(encoded.tokens)) throw new Error("Could not verify model input size.");
    if (encoded.tokens.length <= MAX_INPUT) passages.push(row);
  }
  if (!passages.length) throw new Error("The retrieved passages do not fit the model context. Please shorten your question.");
  const candidates = evidenceCandidates(passages);
  if (answerMode === "quoted" && !candidates.length) {
    return { answer: ABSTENTION, disposition: "evidence_limited", sources: [], warnings: [] };
  }
  const generation = await modelPost("/v1/chat/completions", {
    model: "fincite-v01", messages: answerMode === "quoted" ? selectionMessages(question, candidates) : messagesFor(question, passages),
    temperature: 0, seed: 42, max_tokens: answerMode === "quoted" ? 64 : 256, stream: false,
    ...(answerMode === "quoted" ? { response_format: selectionFormat(candidates) } : {}),
    chat_template_kwargs: { enable_thinking: false }
  });
  const raw = generation.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("The model did not return answer text.");
  if (generation.choices?.[0]?.finish_reason !== "stop") {
    throw new Error("The model output was cut short. The answer was withheld.");
  }
  const selected = answerMode === "quoted" ? selectedText(raw, candidates) : { text: raw };
  const result = finishAnswer(selected.text, passages, generation, answerMode);
  return { ...result, generation_attempts: 1, ...(answerMode === "quoted" ? {
    selected_evidence_id: selected.selected_evidence_id, output_mode: "selected_source_excerpt"
  } : {}) };
}
