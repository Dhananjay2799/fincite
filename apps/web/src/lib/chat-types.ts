export type Source = { id: string; title: string; url: string; quote: string };
export type ChatAnswer = { answer: string; disposition: "answer" | "evidence_limited"; sources: Source[] };
export type ChatFailure = { error: { code: string; message: string } };

// Validate server output before rendering. Never render raw HTML.
export function isChatAnswer(value: unknown): value is ChatAnswer {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.answer === "string" && item.answer.trim().length > 0 &&
    (item.disposition === "answer" || item.disposition === "evidence_limited") &&
    Array.isArray(item.sources) && item.sources.every((source: unknown) => {
      if (!source || typeof source !== "object") return false;
      const s = source as Record<string, unknown>;
      if (![s.id, s.title, s.quote, s.url].every((field) => typeof field === "string")) return false;
      try { const url = new URL(s.url as string); return url.protocol === "https:" && url.hostname === "www.consumerfinance.gov"; }
      catch { return false; }
    });
}
