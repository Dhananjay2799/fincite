import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoTokenizer, env } from "@huggingface/transformers";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const configPath = resolve(here, "embedding-config.json");

env.cacheDir = resolve(root, "data/model-cache");

let config;

if (existsSync(configPath)) {
  config = JSON.parse(readFileSync(configPath, "utf8"));
} else {
  const modelId = "Xenova/bge-small-en-v1.5";
  const response = await fetch(
    `https://huggingface.co/api/models/${modelId}`,
    { signal: AbortSignal.timeout(30000) }
  );

  if (!response.ok) {
    throw new Error(`Model metadata request failed: HTTP ${response.status}`);
  }

  const metadata = await response.json();

  if (!/^[a-f0-9]{40}$/.test(metadata.sha)) {
    throw new Error("Missing immutable model revision.");
  }

  config = {
    model_id: modelId,
    model_revision: metadata.sha,
    dimensions: 384,
    max_tokens: 512,
    pooling: "cls",
    normalize: true,
    dtype: "fp32",
    document_prefix: "",
    query_prefix: "Represent this sentence for searching relevant passages: "
  };

  writeFileSync(
    configPath,
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );
}

const tokenizer = await AutoTokenizer.from_pretrained(
  config.model_id,
  { revision: config.model_revision }
);

const chunks = readFileSync(
  resolve(root, "data/processed/chunks.jsonl"),
  "utf8"
).replace(/^\uFEFF/, "").split(/\r?\n/)
  .filter(line => line.trim()).map(JSON.parse);

const results = [];

for (const chunk of chunks) {
  const encoded = await tokenizer(
    config.document_prefix + chunk.text,
    {
      truncation: false,
      padding: false,
      return_tensor: false
    }
  );

  const ids = encoded.input_ids;
  const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;

  if (!Number.isInteger(tokens) || tokens < 1) {
    throw new Error(`Unexpected tokenizer output: ${chunk.chunk_id}`);
  }

  results.push({
    chunk_id: chunk.chunk_id,
    source_id: chunk.source_id,
    input_tokens: tokens,
    within_limit: tokens <= config.max_tokens
  });
}

writeFileSync(
  resolve(root, "data/processed/token-report.json"),
  JSON.stringify({ config, results }, null, 2) + "\n",
  "utf8"
);

console.table(results.map(result => ({
  source: result.source_id,
  tokens: result.input_tokens,
  within_limit: result.within_limit
})));

const oversized = results.filter(result => !result.within_limit);

console.log("Model:", config.model_id);
console.log("Revision:", config.model_revision);
console.log(`Checked ${results.length} chunks; ${oversized.length} exceed the limit.`);

if (oversized.length) process.exitCode = 1;
