import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  const ddl = await readFile(new URL("../../prisma/ddl.sql", import.meta.url), "utf8");
  await pool.query(ddl);
  const constraints = await readFile(new URL("../../prisma/constraints.sql", import.meta.url), "utf8");
  await pool.query(constraints);
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`,
  );
  console.log(`setup done, tables: ${rows.map((row) => row.table_name).join(", ")}`);
} finally {
  await pool.end();
}
