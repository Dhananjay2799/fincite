import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { pipeline, env } from "@huggingface/transformers";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const readJSON = path => JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
const config = readJSON(resolve(here, "embedding-config.json"));
const chunks = readFileSync(resolve(root, "data/processed/chunks.jsonl"), "utf8")
  .replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim()).map(JSON.parse);
const chunkMap = new Map(chunks.map(chunk => [chunk.chunk_id, chunk]));
const chunkIds = [...chunkMap.keys()];
assert.ok(chunkIds.length > 0);
const candidateLimit = 20;
const rrfConstant = 60;
env.cacheDir = resolve(root, "data/model-cache");
// Keep only the embedding model resident. Live reranking is not enabled yet.
export async function prepareRetriever() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const sql = neon(process.env.DATABASE_URL);
  await sql`SELECT 1`;
  const extractor = await pipeline("feature-extraction", config.model_id, {
    revision: config.model_revision, dtype: config.dtype, device: "cpu"
  });
  return {
    async retrieve(question) {
      const input = config.query_prefix + question;
      const encoded = await extractor.tokenizer(input, {
        truncation: false, padding: false, return_tensor: false
      });
      const ids = encoded.input_ids;
      const tokens = Array.isArray(ids[0]) ? ids[0].length : ids.length;
      if (tokens > config.max_tokens) {
        const error = new Error("Please shorten your question.");
        error.status = 400;
        throw error;
      }
      const output = await extractor(input, {
        pooling: config.pooling, normalize: config.normalize, truncation: false
      });
      const embedding = Array.from(output.data);
      assert.equal(embedding.length, config.dimensions);
      assert.ok(embedding.every(Number.isFinite));
      const vector = JSON.stringify(embedding);
  const rows = await sql`
    WITH terms AS (
      SELECT unnest(
        tsvector_to_array(to_tsvector('english', ${question}))
      ) AS term
    ),
    search_query AS (
      SELECT CASE WHEN count(*) > 0 THEN
        to_tsquery(
          'english',
          string_agg(quote_literal(term), ' | ' ORDER BY term)
        )
      ELSE NULL::tsquery END AS query
      FROM terms
    ),
    vector_candidates AS (
      SELECT
        c.chunk_id,
        row_number() OVER (
          ORDER BY e.embedding <=> ${vector}::vector, c.chunk_id
        ) AS vector_rank
      FROM fincite_embeddings e
      JOIN fincite_chunks c ON c.chunk_id = e.chunk_id
      WHERE e.model_id = ${config.model_id}
        AND e.model_revision = ${config.model_revision}
        AND c.chunk_id = ANY(${chunkIds}::text[])
      ORDER BY e.embedding <=> ${vector}::vector, c.chunk_id
      LIMIT ${candidateLimit}
    ),
    keyword_candidates AS (
      SELECT
        c.chunk_id,
        row_number() OVER (
          ORDER BY ts_rank_cd(c.search_vector, q.query) DESC,
                   c.chunk_id
        ) AS keyword_rank
      FROM fincite_chunks c
      CROSS JOIN search_query q
      WHERE c.search_vector @@ q.query
        AND c.chunk_id = ANY(${chunkIds}::text[])
      ORDER BY ts_rank_cd(c.search_vector, q.query) DESC,
               c.chunk_id
      LIMIT ${candidateLimit}
    ),
    fused AS (
      SELECT
        coalesce(v.chunk_id, k.chunk_id) AS chunk_id,
        v.vector_rank,
        k.keyword_rank,
        coalesce(
          1.0 / (${rrfConstant} + v.vector_rank), 0
        ) +
        coalesce(
          1.0 / (${rrfConstant} + k.keyword_rank), 0
        ) AS rrf_score
      FROM vector_candidates v
      FULL OUTER JOIN keyword_candidates k USING (chunk_id)
    )
    SELECT
      c.chunk_id, c.source_id, c.chunk_index,
      s.title, s.url, c.chunk_text,
      f.vector_rank, f.keyword_rank, f.rrf_score
    FROM fused f
    JOIN fincite_chunks c ON c.chunk_id = f.chunk_id
    JOIN fincite_sources s
      ON s.source_id = c.source_id
      AND s.document_sha256 = c.document_sha256
    ORDER BY f.rrf_score DESC, c.chunk_id
    LIMIT 20
  `;


      for (const row of rows) {
        const chunk = chunkMap.get(row.chunk_id);
        assert.ok(chunk && row.chunk_text === chunk.text && row.source_id === chunk.source_id,
          "Retrieved evidence differs from the local corpus.");
        const url = new URL(row.url);
        assert.ok(url.protocol === "https:" && url.hostname === "www.consumerfinance.gov");
      }
      return rows.slice(0, 5);
    },
    dispose: () => extractor.dispose()
  };
}
