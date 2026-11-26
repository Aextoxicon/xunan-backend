import "dotenv/config";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";

const sql = await readFile(new URL("../../prisma/constraints.sql", import.meta.url), "utf8");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log("constraints applied");
} finally {
  await pool.end();
}
