import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const sql = neon(process.env.DATABASE_URL);
  const schema = readFileSync(
    new URL("../database/migrations/001_initial.sql", import.meta.url),
    "utf8"
  ).replace(/^\uFEFF/, "");

  // This initial migration contains only simple SQL statements.
  const statements = schema.split(";")
    .map(statement => statement.trim())
    .filter(Boolean);

  await sql.transaction(
    statements.map(statement => sql.query(statement))
  );

  const tables = await sql`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'fincite_sources', 'fincite_chunks', 'fincite_embeddings'
      )
    ORDER BY table_name
  `;

  const extensions = await sql`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname = 'vector'
  `;

  if (tables.length !== 3 || extensions.length !== 1) {
    throw new Error("Schema verification failed");
  }

  console.log("PASS: initial schema applied.");
  console.table(tables);
  console.table(extensions);
} catch (error) {
  console.error("FAIL: schema setup failed.");
  if (typeof error.code === "string" &&
      /^[A-Z0-9]{5}$/.test(error.code)) {
    console.error("Database error code:", error.code);
  }
  process.exitCode = 1;
}
