import { excerptRankingText } from "../../../../../ingestion/reranker-input.mjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { pipeline, AutoTokenizer, AutoModelForSequenceClassification, env } from "@huggingface/transformers";
import embeddingConfig from "../../../../../ingestion/embedding-config.json" with { type: "json" };
import rerankerConfig from "../../../../../evaluation/reranker-config.json" with { type: "json" };
import manifest from "../../../../../evaluation/datasets/corpus-manifest.json" with { type: "json" };
import { retrieveHostedRows } from "./hosted-retrieval.mjs";
import { createHostedResponder } from "./hosted-service.mjs";

export async function loadHostedResources({ createSQL = neon } = {}) {
  const databaseURL = process.env.DATABASE_URL?.trim();
  if (!databaseURL) throw Object.assign(new Error("Database is not configured."), { status: 503 });
  // Function source files are read-only. This cache is disposable and may be
  // absent on every cold start; model revisions stay pinned across downloads.
  env.cacheDir = join(tmpdir(), "fincite-model-cache");
  env.allowLocalModels = false;
  const options = { device: "cpu", session_options: { intraOpNumThreads: 1, interOpNumThreads: 1 } };
  const extractor = await pipeline("feature-extraction", embeddingConfig.model_id, {
    ...options, revision: embeddingConfig.model_revision, dtype: embeddingConfig.dtype
  });
  let classifier;
  try {
    const tokenizer = await AutoTokenizer.from_pretrained(rerankerConfig.model_id, { revision: rerankerConfig.model_revision });
    classifier = await AutoModelForSequenceClassification.from_pretrained(rerankerConfig.model_id, {
      ...options, revision: rerankerConfig.model_revision, dtype: rerankerConfig.dtype
    });
    return {
      async retrieve(question, signal) {
        signal?.throwIfAborted();
        const input = embeddingConfig.query_prefix + question;
        const encoded = await extractor.tokenizer(input, { truncation: false, padding: false, return_tensor: false });
        const ids = encoded.input_ids;
        const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
        if (tokens > embeddingConfig.max_tokens) throw Object.assign(new Error("Please shorten your question."), { status: 400 });
        const output = await extractor(input, { pooling: embeddingConfig.pooling, normalize: embeddingConfig.normalize, truncation: false });
        signal?.throwIfAborted();
        const sql = createSQL(databaseURL, { fetchOptions: { signal } });
        return retrieveHostedRows(sql, question, Array.from(output.data), embeddingConfig, manifest);
      },
      async rank(question, units, signal) {
        const ranked = [];
        for (const unit of units) {
          signal?.throwIfAborted();
          const pair = { text_pair: excerptRankingText(unit), truncation: false, padding: false };
          const check = await tokenizer(question, { ...pair, return_tensor: false });
          const ids = check.input_ids;
          const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
          if (tokens > rerankerConfig.max_pair_tokens) continue;
          const result = await classifier(await tokenizer(question, pair));
          if (result.logits?.data.length !== 1 || !Number.isFinite(Number(result.logits.data[0]))) throw new Error("Invalid relevance score.");
          ranked.push({ unit_id: unit.unit_id, score: Number(result.logits.data[0]) });
        }
        return ranked;
      },
      dispose: () => Promise.allSettled([extractor.dispose(), classifier.dispose()])
    };
  } catch (error) {
    await Promise.allSettled([extractor.dispose(), classifier?.dispose()]);
    throw error;
  }
}

export const answerHostedQuestion = createHostedResponder(loadHostedResources);
