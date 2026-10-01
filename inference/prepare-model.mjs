import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = "inference/model-config.json";

if (existsSync(path)) {
  console.log(
    "Existing configuration retained:",
    JSON.parse(readFileSync(path, "utf8"))
  );
} else {
  const modelId = "Qwen/Qwen3-1.7B";

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
    enable_thinking: false,
    do_sample: false,
    max_new_tokens: 256,
    max_input_tokens: 6144,
    gpu: "T4",
    max_containers: 1,
    min_containers: 0,
    timeout_seconds: 300
  };

  writeFileSync(
    path,
    JSON.stringify(config, null, 2) + "\n",
    "utf8"
  );

  console.log("Model configuration saved:", config);
}
