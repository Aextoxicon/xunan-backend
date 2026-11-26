import type { Context } from "hono";
import type { Client } from "pg";
import type { AppEnv } from "./env.js";

export async function withTransaction<T>(
  c: Context<AppEnv>,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = c.var.db;
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function recordNo(
  client: Client,
  table: "inspections" | "hazards",
  field: "record_no" | "hazard_no",
  prefix: "XJ" | "HZ",
): Promise<string> {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${prefix}:${day}`]);
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(RIGHT(${field}, 4))::int, 0) + 1 AS seq
     FROM ${table} WHERE ${field} LIKE $1`,
    [`${prefix}-${day}-%`],
  );
  return `${prefix}-${day}-${String(rows[0].seq).padStart(4, "0")}`;
}
