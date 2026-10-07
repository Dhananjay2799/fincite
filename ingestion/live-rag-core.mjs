export const PROMPT_VERSION = "local-live-v0.2";
const MAX_INPUT = 2048 - 256 - 64;
// Match the plain-text response format used for the LoRA experiment.
const system = "Answer using only the supplied passages. Keep the answer brief and preserve conditions and exceptions. Cite supported factual claims using [source_id]. If the passages cannot answer the question, explain that limitation without guessing or inventing a citation.";
export function messagesFor(question, passages) {
  return [{ role: "system", content: system }, { role: "user", content:
    "Question: " + question + "\n\nSupplied passages:\n" +
    passages.map(p => `[${p.source_id}]\n${p.chunk_text}`).join("\n\n") }];
}
export function finishAnswer(raw, passages, generation) {
  if (generation.choices?.[0]?.finish_reason !== "stop") {
    throw new Error("The model answer was cut short. Please try a shorter question.");
  }
  const answer = typeof raw === "string" ? raw.trim() : "";
  if (!answer || /^(?:["']?evidence_limited["']?|["']?answer["']?)$/i.test(answer) ||
      answer.startsWith("{") || answer.startsWith("```json")) {
    throw new Error("The model returned an internal label or invalid answer format. The answer was withheld.");
  }
  const cited = new Set([...answer.matchAll(/\[(cfpb-[^\]\s]+)\]/g)].map(m => m[1]));
  const allowed = new Set(passages.map(p => p.source_id));
  if ([...cited].some(id => !allowed.has(id))) {
    throw new Error("The model cited a source that was not supplied. The answer was withheld.");
  }
  const warnings = [];
  if (cited.size === 0) {
    warnings.push("The model did not cite its answer. The passages below are retrieved evidence, not verified support for its claims.");
  }
  const sources = [];
  for (const passage of passages) {
    const previous = sources.find(s => s.id === passage.source_id);
    if (previous) previous.quote += "\n\n" + passage.chunk_text;
    else sources.push({ id: passage.source_id, title: passage.title, url: passage.url,
      quote: passage.chunk_text, cited: cited.has(passage.source_id) });
  }
  // 'answer' is a response container, not an answerability or correctness grade.
  // Do not infer refusal success from a model-generated enum.
  return { answer, disposition: "answer", sources, warnings };
}
export async function answerQuestion(question, { retrieve, modelPost }) {
  const rows = await retrieve(question);
  if (!rows.length) return { answer: "No passages were retrieved from the current corpus for this question.",
    disposition: "evidence_limited", sources: [], warnings: [] };
  const passages = [];
  // Whole passages only; reserve output tokens and account for the chat template.
  for (const row of rows.slice(0, 2)) {
    const proposed = [...passages, row];
    const formatted = await modelPost("/apply-template", {
      messages: messagesFor(question, proposed),
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
  const generation = await modelPost("/v1/chat/completions", {
    model: "fincite-v01", messages: messagesFor(question, passages),
    temperature: 0, seed: 42, max_tokens: 256, stream: false,
    chat_template_kwargs: { enable_thinking: false }
  });
  const raw = generation.choices?.[0]?.message?.content;
  if (typeof raw !== "string") throw new Error("The model did not return answer text.");
  return finishAnswer(raw, passages, generation);
}
