import { neon } from "@neondatabase/serverless";

try {
  if (!process.env.DATABASE_URL) {
    throw new Error("Missing DATABASE_URL");
  }

  const sql = neon(process.env.DATABASE_URL);

  const connection = await sql`
    SELECT
      1 AS connected,
      current_setting('server_version') AS postgres_version
  `;

  console.log("PASS: connected to Neon.");
  console.log("PostgreSQL version:", connection[0].postgres_version);

  const extensions = await sql`
    SELECT name, default_version, installed_version
    FROM pg_available_extensions
    WHERE name = 'vector'
  `;

  if (extensions.length === 0) {
    console.log("CHECK: vector extension is not available.");
    process.exitCode = 1;
  } else {
    console.log("PASS: vector extension is available.");
    console.table(extensions);
  }
} catch (error) {
  console.error("FAIL: database connection or query failed.");

  if (typeof error.code === "string" &&
      /^[A-Z0-9]{5}$/.test(error.code)) {
    console.error("Database error code:", error.code);
  }

  console.error(
    "Check DATABASE_URL in apps/web/.env.local and the Neon project status."
  );
  process.exitCode = 1;
}
