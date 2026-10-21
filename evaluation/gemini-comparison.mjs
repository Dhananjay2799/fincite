import assert from "node:assert/strict";

export function comparisonRequests(report) {
  assert.equal(report.status, "development_comparison_complete_ungraded");
  assert.equal(report.adapter_loaded_weights_verified, true);
  const requests = [];
  for (const c of report.cases) {
    for (const [prompt, system] of Object.entries(report.prompts)) {
      const controls = report.results.filter(r => r.question_id === c.question_id && r.prompt_version === prompt);
      assert.equal(controls.length, 2);
      assert.deepEqual(new Set(controls.map(c => c.model)), new Set(["base", "adapter"]));
      assert.deepEqual(controls[0].messages, controls[1].messages, "Base and adapter evidence differs.");
      const expectedUser = "Question: " + c.question + "\n\nSupplied passages:\n" +
        c.evidence.map(u => `[${u.source_id}]\n${u.text}`).join("\n\n");
      assert.deepEqual(controls[0].messages, [{ role: "system", content: system }, { role: "user", content: expectedUser }]);
      requests.push({ question_id: c.question_id, prompt_version: prompt, messages: controls[0].messages,
        body: { systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: "user", parts: [{ text: expectedUser }] }],
          generationConfig: { temperature: 0, candidateCount: 1, maxOutputTokens: 1024 } } });
    }
  }
  assert.equal(report.results.length, requests.length * 2);
  return requests;
}

export function remainingRequests(requests, results) {
  const byKey = new Map(requests.map(r => [`${r.question_id}/${r.prompt_version}`, r]));
  const seen = new Set(), done = new Set();
  for (const result of results) {
    const key = `${result.question_id}/${result.prompt_version}`;
    assert.ok(byKey.has(key) && !seen.has(key), "Unknown or duplicate saved Gemini response.");
    seen.add(key);
    assert.deepEqual(result.messages, byKey.get(key).messages, "Saved Gemini messages changed.");
    if (result.ok) {
      assert.ok(typeof result.answer === "string" && result.answer.trim() && result.finish_reason === "STOP");
      done.add(key);
    }
  }
  return requests.filter(r => !done.has(`${r.question_id}/${r.prompt_version}`));
}

export async function requestGemini(model, apiKey, body, { fetcher = fetch, signal } = {}) {
  assert.ok(/^gemini-[a-zA-Z0-9.-]+$/u.test(model), "Use an explicit Gemini model code.");
  assert.ok(typeof apiKey === "string" && apiKey.trim(), "GEMINI_API_KEY is required.");
  const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body), signal
  });
  if (!response.ok) return { ok: false, http_status: response.status, error: "provider_request_failed" };
  const raw = await response.json();
  const candidate = raw.candidates?.[0];
  // Reasoning summaries are not the final answer and are never mixed into it.
  const answer = candidate?.content?.parts?.filter(p => p.thought !== true && typeof p.text === "string").map(p => p.text).join("").trim() ?? "";
  return { ok: Boolean(answer) && candidate?.finishReason === "STOP", http_status: response.status,
    answer, finish_reason: candidate?.finishReason ?? "missing_candidate", model_version: raw.modelVersion ?? null,
    usage: raw.usageMetadata ?? null, raw_response: raw };
}
