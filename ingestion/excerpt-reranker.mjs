import { excerptRankingText } from "./reranker-input.mjs";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoTokenizer, AutoModelForSequenceClassification, env } from "@huggingface/transformers";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(resolve(root, "evaluation/reranker-config.json"), "utf8").replace(/^\uFEFF/u, ""));

export async function prepareExcerptReranker() {
  env.cacheDir = resolve(root, "data/model-cache");
  const tokenizer = await AutoTokenizer.from_pretrained(config.model_id, { revision: config.model_revision });
  const model = await AutoModelForSequenceClassification.from_pretrained(config.model_id, {
    revision: config.model_revision, dtype: config.dtype, device: "cpu"
  });
  return {
    async rank(question, units, signal) {
      const ranked = [];
      for (const unit of units) {
        signal?.throwIfAborted();
        const options = { text_pair: excerptRankingText(unit), truncation: false, padding: false };
        const check = await tokenizer(question, { ...options, return_tensor: false });
        const ids = check.input_ids;
        const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
        // Preserve whole units and list conditions; never silently truncate evidence.
        if (tokens > config.max_pair_tokens) continue;
        const features = await tokenizer(question, options);
        const output = await model(features);
        if (output.logits?.data.length !== 1 || !Number.isFinite(Number(output.logits.data[0]))) {
          throw new Error("Invalid excerpt relevance score.");
        }
        ranked.push({ unit_id: unit.unit_id, score: Number(output.logits.data[0]), pair_tokens: tokens });
      }
      return ranked;
    },
    dispose: () => model.dispose()
  };
}
