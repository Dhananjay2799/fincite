import { isChatAnswer, type ChatFailure } from "@/lib/chat-types";
export const runtime = "nodejs";
const fail = (status: number, code: string, message: string) => Response.json(
  { error: { code, message } } satisfies ChatFailure,
  { status, headers: { "Cache-Control": "no-store" } }
);
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== process.env.FINCITE_PUBLIC_ORIGIN) return fail(403, "ORIGIN_BLOCKED", "Use the FinCite frontend.");
  let body: unknown;
  try { body = await request.json(); } catch {
    return fail(400, "INVALID_REQUEST", "Send a valid JSON question.");
  }
  const question = body && typeof body === "object" && "question" in body ? body.question : undefined;
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    return fail(400, "INVALID_QUESTION", "Enter a question between 1 and 1,000 characters.");
  }
  if (!process.env.FINCITE_API_URL) return fail(503, "INFERENCE_NOT_CONNECTED", "The local RAG connection has not been configured.");
  try {
    const url = new URL(process.env.FINCITE_API_URL);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.port !== "8081") {
      return fail(503, "INVALID_CONFIGURATION", "Check the local RAG connection settings.");
    }
    const upstream = await fetch(new URL("/chat", url), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: question.trim() }), cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(175000)])
    });
    const result: unknown = await upstream.json();
    if (!upstream.ok) {
      // Never forward arbitrary dependency errors or credentials.
      const message = upstream.status === 429 ? "FinCite is handling another question. Please try again shortly." :
        upstream.status === 400 ? "Please shorten your question." :
        "Retrieval or model output could not be verified. Check the local RAG terminal.";
      return fail([400, 429, 503].includes(upstream.status) ? upstream.status : 503, "RAG_UNAVAILABLE", message);
    }
    if (!isChatAnswer(result)) return fail(502, "INVALID_RESPONSE", "The answer format could not be verified.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail(503, "CONNECTION_FAILED", "The local RAG service is unavailable. Keep the model and RAG terminals running.");
  }
}

