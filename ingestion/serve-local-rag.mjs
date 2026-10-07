import { createServer } from "node:http";
import { prepareRetriever } from "./live-retrieval.mjs";
import { answerQuestion, PROMPT_VERSION } from "./live-rag-core.mjs";

const modelURL = new URL(process.env.FINCITE_MODEL_URL || "http://127.0.0.1:8080");
if (modelURL.protocol !== "http:" || modelURL.hostname !== "127.0.0.1") {
  throw new Error("This development bridge requires a loopback HTTP model URL.");
}
console.log("Checking local model...");
const health = await fetch(new URL("/health", modelURL), { signal: AbortSignal.timeout(10000) });
if (!health.ok || (await health.json()).status !== "ok") throw new Error("Start llama-server first.");
console.log("Connecting to Neon and loading the pinned embedding model...");
const retriever = await prepareRetriever();
let busy = false;
const send = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
const failure = (response, status, code, message) => send(response, status, { error: { code, message } });
const server = createServer(async (request, response) => {
  if (request.headers.origin) return failure(response, 403, "ORIGIN_BLOCKED", "Use the FinCite frontend.");
  if (request.method === "GET" && request.url === "/health") return send(response, 200, {
    status: "ok", retrieval: "hybrid", reranker: false, prompt_version: PROMPT_VERSION
  });
  if (request.method !== "POST" || request.url !== "/chat") return failure(response, 404, "NOT_FOUND", "Endpoint not found.");
  if (busy) return failure(response, 429, "BUSY", "FinCite is handling another question. Please try again shortly.");
  busy = true;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 165000);
  response.on("close", () => { if (!response.writableEnded) controller.abort(); });
  try {
    const body = await new Promise((resolve, reject) => {
      let bytes = 0;
      let text = "";
      request.setEncoding("utf8");
      request.on("data", part => {
        bytes += Buffer.byteLength(part);
        if (bytes > 8192) { reject(new Error("Request is too large.")); request.resume(); }
        else text += part;
      });
      request.on("end", () => { try { resolve(JSON.parse(text)); } catch { reject(new Error("Invalid JSON request.")); } });
      request.on("error", reject);
      request.on("aborted", () => reject(new Error("Request cancelled.")));
    }).catch(() => null);
    const question = body?.question;
    if (typeof question !== "string" || !question.trim() || question.length > 1000) {
      return failure(response, 400, "INVALID_QUESTION", "Enter a question between 1 and 1,000 characters.");
    }
    const modelPost = async (path, body) => {
      controller.signal.throwIfAborted();
      const result = await fetch(new URL(path, modelURL), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: controller.signal
      });
      if (!result.ok) throw new Error("The local model request failed.");
      return result.json();
    };
    const answer = await answerQuestion(question.trim(), { retrieve: retriever.retrieve, modelPost });
    controller.signal.throwIfAborted();
    send(response, 200, answer);
    console.log("Completed live question; citations checked for supplied IDs only.");
  } catch (error) {
    // Keep database credentials and dependency internals out of browser errors.
    failure(response, error.status === 400 ? 400 : 503, "RAG_UNAVAILABLE",
      controller.signal.aborted ? "The request timed out. Please try again." :
      error.status === 400 ? "Please shorten your question." :
      "Retrieval or model output could not be verified. Check the local bridge terminal.");
    console.error("Request failed:", error.name);
    if (!String(error.message).includes("postgres") && !String(error.message).includes("DATABASE_URL")) {
      console.error(String(error.message).replace(/https?:\/\/\S+/g, "[URL]"));
    }
  } finally { clearTimeout(deadline); busy = false; }
});
server.requestTimeout = 15000;
server.listen(8081, "127.0.0.1", () => console.log("READY: FinCite RAG bridge http://127.0.0.1:8081"));
process.on("SIGINT", () => { server.close(); retriever.dispose().finally(() => process.exit(0)); });
