import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoTokenizer, AutoModelForSequenceClassification, env } from "@huggingface/transformers";
import config from "../evaluation/claim-verifier-config.json" with { type: "json" };
import { probabilities } from "./claim-verifier.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export async function prepareClaimVerifier() {
  env.cacheDir = resolve(root, "data/model-cache");
  env.allowLocalModels = false;
  const tokenizer = await AutoTokenizer.from_pretrained(config.model_id, { revision: config.model_revision });
  const model = await AutoModelForSequenceClassification.from_pretrained(config.model_id, {
    revision: config.model_revision, dtype: config.dtype, device: "cpu",
    session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 }
  });
  return {
    config,
    async scorePair(premise, claim, signal) {
      signal?.throwIfAborted();
      const options = { text_pair: claim, truncation: false, padding: false };
      const encoded = await tokenizer(premise, { ...options, return_tensor: false });
      const ids = encoded.input_ids;
      const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
      if (tokens > config.max_pair_tokens) return { status: "too_long", pair_tokens: tokens };
      const output = await model(await tokenizer(premise, options));
      signal?.throwIfAborted();
      return { status: "scored", pair_tokens: tokens,
        probabilities: probabilities(Array.from(output.logits.data, Number), model.config.id2label) };
    },
    dispose: () => model.dispose()
  };
}
