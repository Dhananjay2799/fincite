import { createHash } from "node:crypto";

export function verifyHostedRows(rows, manifest) {
  const chunks = new Map(manifest.chunks.map(chunk => [chunk.chunk_id, chunk]));
  const documents = new Map(manifest.documents.map(document => [document.source_id, document]));
  for (const row of rows) {
    const chunk = chunks.get(row.chunk_id), document = documents.get(row.source_id);
    if (!chunk || !document || chunk.source_id !== row.source_id ||
        row.document_sha256 !== chunk.document_sha256 || row.document_sha256 !== document.document_sha256 ||
        row.chunk_sha256 !== chunk.chunk_sha256 || typeof row.chunk_text !== "string" ||
        createHash("sha256").update(row.chunk_text).digest("hex") !== chunk.chunk_sha256 ||
        row.url !== document.url || typeof row.title !== "string" || !row.title.trim()) {
      throw new Error("Retrieved source differs from the pinned corpus.");
    }
    const url = new URL(row.url);
    if (url.protocol !== "https:" || url.hostname !== "www.consumerfinance.gov") throw new Error("Invalid corpus URL.");
  }
  return rows;
}

// Same hybrid RRF query as the local bridge; metadata replaces ignored local text files.
export async function retrieveHostedRows(sql, question, embedding, config, manifest) {
  if (embedding.length !== config.dimensions || !embedding.every(Number.isFinite)) throw new Error("Invalid query embedding.");
  if (config.document_prefix !== "") throw new Error("Hosted embedding provenance expects an empty document prefix.");
  const vector = JSON.stringify(embedding);
  const chunkIds = manifest.chunks.map(chunk => chunk.chunk_id);
  const candidateLimit = 20, rrfConstant = 60;
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
        AND e.normalized = true AND e.input_sha256 = c.chunk_sha256
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
      c.chunk_id, c.source_id, c.chunk_index, c.document_sha256, c.chunk_sha256,
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
  return verifyHostedRows(rows, manifest).slice(0, 5);
}
