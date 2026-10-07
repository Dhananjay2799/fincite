import type { ChatFailure } from "@/lib/chat-types";
// Integration stub. Replace with server-side retrieval + generation next.
// Never pass off curated examples as inference.
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch {
    return Response.json({ error: { code: "INVALID_REQUEST", message: "Send a valid JSON question." } } satisfies ChatFailure, { status: 400 });
  }
  const question = body && typeof body === "object" && "question" in body ? body.question : undefined;
  if (typeof question !== "string" || !question.trim() || question.length > 1000) {
    return Response.json({ error: { code: "INVALID_QUESTION", message: "Enter a question between 1 and 1,000 characters." } } satisfies ChatFailure, { status: 400 });
  }
  return Response.json({ error: { code: "INFERENCE_NOT_CONNECTED", message: "Live answers are not connected yet. Choose an example to explore the interface. Your question has not been sent to a model." } } satisfies ChatFailure, { status: 503, headers: { "Cache-Control": "no-store" } });
}
