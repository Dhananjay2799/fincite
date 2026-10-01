import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = "../evaluation/reranker-config.json";

if (existsSync(path)) {
  const config = JSON.parse(readFileSync(path, "utf8"));
  console.log("Existing reranker config retained:", config);
} else {
  const modelId = "Xenova/ms-marco-MiniLM-L-6-v2";

  const response = await fetch(
    `https://huggingface.co/api/models/${modelId}`,
    { signal: AbortSignal.timeout(30000) }
  );

  if (!response.ok) {
    throw new Error(`Metadata request failed: HTTP ${response.status}`);
  }

  const metadata = await response.json();

  if (!/^[a-f0-9]{40}$/.test(metadata.sha)) {
    throw new Error("Missing immutable model revision.");
  }

  const config = {
    model_id: modelId,
    model_revision: metadata.sha,
    dtype: "fp32",
    max_pair_tokens: 512,
    truncation: false,
    candidate_limit: 20,
    final_limit: 5,
    score_type: "raw_logit"
  };

  writeFileSync(
    path,
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );

  console.log("Reranker configuration saved:", config);
}
