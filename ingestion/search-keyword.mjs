import { neon } from "@neondatabase/serverless";

const question = process.argv.slice(2).join(" ").trim();

if (!question) {
  throw new Error("Pass a question as a command-line argument.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL.");
}

const sql = neon(process.env.DATABASE_URL);

const rows = await sql`
  WITH terms AS (
    SELECT unnest(
      tsvector_to_array(to_tsvector('english', ${question}))
    ) AS term
  ),
  search_query AS (
    SELECT CASE
      WHEN count(*) > 0 THEN
        to_tsquery(
          'english',
          string_agg(quote_literal(term), ' | ' ORDER BY term)
        )
      ELSE NULL::tsquery
    END AS query
    FROM terms
  )
  SELECT
    c.chunk_id,
    c.source_id,
    c.chunk_index,
    s.title,
    s.url,
    c.chunk_text,
    ts_rank_cd(c.search_vector, q.query) AS keyword_score
  FROM fincite_chunks c
  JOIN fincite_sources s
    ON s.source_id = c.source_id
    AND s.document_sha256 = c.document_sha256
  CROSS JOIN search_query q
  WHERE c.search_vector @@ q.query
  ORDER BY keyword_score DESC, c.chunk_id
  LIMIT 5
`;

console.log("\nQuestion:", question);

console.table(rows.map((row, index) => ({
  rank: index + 1,
  source: row.source_id,
  chunk: row.chunk_index,
  keyword_score: Number(row.keyword_score).toFixed(4),
  title: row.title
})));

if (rows.length) {
  console.log("\nTOP PASSAGE:\n");
  console.log(rows[0].chunk_text);
  console.log("\nSOURCE:", rows[0].url);
} else {
  console.log("No keyword matches.");
}
