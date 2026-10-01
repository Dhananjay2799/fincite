import {
  readFileSync, writeFileSync, existsSync,
  mkdirSync, renameSync
} from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as pause } from "node:timers/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = resolve(root, "evaluation/datasets/sources.json");
const hash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

const sources = JSON.parse(
  readFileSync(registry, "utf8").replace(/^\uFEFF/, "")
);

if (!Array.isArray(sources) || sources.length === 0) {
  throw new Error("Expected a nonempty, flat source array.");
}

const ids = new Set();

for (const source of sources) {
  if (typeof source.id !== "string" ||
      !/^cfpb-\d+$/.test(source.id) ||
      ids.has(source.id)) {
    throw new Error("Invalid or duplicate source ID.");
  }

  ids.add(source.id);

  const url = new URL(source.url);
  if (url.protocol !== "https:" ||
      url.hostname !== "www.consumerfinance.gov" ||
      !url.pathname.startsWith("/ask-cfpb/")) {
    throw new Error(`Unexpected source URL: ${source.id}`);
  }
}

mkdirSync(resolve(root, "data/raw"), { recursive: true });
const results = [];

for (const source of sources) {
  const relativePath = `data/raw/${source.id}.html`;
  const path = resolve(root, relativePath);

  try {
    if (existsSync(path)) {
      const actualHash = hash(readFileSync(path));

      if (!source.snapshot_sha256 ||
          actualHash !== source.snapshot_sha256) {
        throw new Error("Existing snapshot has no matching registered hash.");
      }

      source.snapshot_status = "downloaded";
      results.push({ id: source.id, status: "reused" });
      console.log(`REUSED: ${source.id}`);
      continue;
    }

    let bytes;
    let lastError;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(source.url, {
          headers: {
            "User-Agent": "FinCite/0.1 (consumer-finance research)",
            "Accept": "text/html"
          },
          signal: AbortSignal.timeout(30000)
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const finalUrl = new URL(response.url);
        if (finalUrl.hostname !== "www.consumerfinance.gov") {
          throw new Error("Unexpected redirect destination.");
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("text/html")) {
          throw new Error(`Unexpected content type: ${contentType}`);
        }

        bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length === 0) throw new Error("Empty response.");
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await pause(attempt * 2000);
      }
    }

    if (!bytes) throw lastError;

    writeFileSync(`${path}.tmp`, bytes);
    renameSync(`${path}.tmp`, path);

    source.snapshot_path = relativePath;
    source.snapshot_sha256 = hash(bytes);
    source.snapshot_status = "downloaded";
    source.downloaded_at = new Date().toISOString();

    results.push({ id: source.id, status: "downloaded" });
    console.log(`DOWNLOADED: ${source.id}`);
  } catch (error) {
    results.push({
      id: source.id,
      status: "failed",
      error: error.message
    });
    console.error(`FAILED: ${source.id}: ${error.message}`);
  }

  await pause(1000);
}

writeFileSync(
  `${registry}.tmp`,
  JSON.stringify(sources, null, 2) + "\n",
  "utf8"
);
renameSync(`${registry}.tmp`, registry);

writeFileSync(
  resolve(root, "data/raw/download-report.json"),
  JSON.stringify({
    completed_at: new Date().toISOString(),
    results
  }, null, 2) + "\n",
  "utf8"
);

const failed = results.filter(result => result.status === "failed");
console.log(`Finished: ${results.length - failed.length} succeeded; ${failed.length} failed.`);
if (failed.length) process.exitCode = 1;
