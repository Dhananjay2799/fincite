import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const children = [];
let stopping = false;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\nStopping services started by this launcher...");
  for (const { child } of children) {
    if (!child.pid || child.exitCode !== null) continue;
    // Only stop our own process trees, never arbitrary processes on a port.
    if (process.platform === "win32") {
      spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      try { process.kill(-child.pid, "SIGTERM"); } catch {}
    }
  }
  setTimeout(() => process.exit(code), 1200);
}
process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

function findServers(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true }).flatMap(entry => {
    const path = join(folder, entry.name);
    return entry.isDirectory() ? findServers(path) : entry.name === "llama-server.exe" ? [path] : [];
  });
}
function checkPort(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(
      `Port ${port} is occupied. Stop the existing model, bridge and frontend terminals before starting this launcher.`
    )));
    probe.listen(port, "127.0.0.1", () => probe.close(resolve));
  });
}
function start(name, executable, args, cwd) {
  if (stopping) throw new Error("Startup cancelled.");
  console.log(`\nStarting ${name}...`);
  const child = spawn(executable, args, {
    cwd, stdio: "inherit", shell: false, detached: process.platform !== "win32",
  });
  children.push({ name, child });
  child.once("error", error => {
    console.error(`${name} could not start: ${error.message}`);
    shutdown(1);
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(`${name} stopped unexpectedly (${signal || code}).`);
      shutdown(1);
    }
  });
}
async function waitReady(name, url, verify, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let nextNotice = Date.now() + 15000;
  while (Date.now() < deadline && !stopping) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (response.ok && await verify(response)) {
        console.log(`READY: ${name}`);
        return;
      }
    } catch {}
    if (Date.now() >= nextNotice) {
      console.log(`Still waiting for ${name}; see its output above.`);
      nextNotice = Date.now() + 15000;
    }
    await delay(1000);
  }
  throw new Error(`${name} did not become ready. Check the service output above.`);
}
async function main() {
  if (process.platform !== "win32") throw new Error("This launcher targets the existing Windows CPU setup.");
  const model = join(root, "inference/models/fincite-v01-q4_k_m.gguf");
  const env = join(root, "apps/web/.env.local");
  const bridge = join(root, "ingestion/serve-local-rag.mjs");
  const next = join(root, "apps/web/node_modules/next/dist/bin/next");
  for (const path of [model, env, bridge, next, join(root, "ingestion/node_modules"),
    join(root, "data/processed/chunks.jsonl")]) {
    if (!existsSync(path)) throw new Error(`Required local file or folder missing: ${path}`);
  }
  const servers = findServers(join(root, "inference/runtime/b11476"));
  if (servers.length !== 1) throw new Error(`Expected one llama-server.exe under inference/runtime/b11476; found ${servers.length}.`);
  for (const port of [8080, 8081, 3000]) await checkPort(port);

  start("local model", servers[0], [
    "--model", model, "--alias", "fincite-v01", "--host", "127.0.0.1", "--port", "8080",
    "--n-gpu-layers", "0", "--ctx-size", "2048", "--parallel", "1",
    "--threads", "4", "--batch-size", "128", "--ubatch-size", "128", "--jinja",
  ], root);
  await waitReady("local model", "http://127.0.0.1:8080/health",
    async response => (await response.json()).status === "ok", 180000);

  start("RAG bridge", process.execPath, [`--env-file=${env}`, bridge], join(root, "ingestion"));
  await waitReady("RAG bridge", "http://127.0.0.1:8081/health",
    async response => (await response.json()).status === "ok", 300000);

  start("frontend", process.execPath, [next, "dev", "--hostname", "127.0.0.1", "--port", "3000"], join(root, "apps/web"));
  await waitReady("frontend", "http://127.0.0.1:3000", async () => true, 180000);
  console.log("\nFinCite is ready: http://localhost:3000\nKeep this terminal open. Press Ctrl+C to stop all three services.\nService readiness does not grade answer accuracy.");
}
main().catch(error => {
  if (!stopping) console.error(`Startup failed: ${error.message}`);
  shutdown(1);
});
