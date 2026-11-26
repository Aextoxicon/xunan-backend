import { Hono } from "hono";
import type { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/env.js";
import { ApiError, failJson } from "../lib/http.js";
import hazards from "./hazards.js";

const hazard = {
  id: "10",
  hazard_no: "HZ-20261127-0001",
  status: "待整改",
  description: "原描述",
  level: "一般",
  assignee_id: "7",
  due_at: new Date("2026-12-01T00:00:00Z"),
  closed_at: null,
  status_history: [],
  updated_at: new Date("2026-11-27T00:00:00Z"),
};

function createApp(history: unknown[] = []) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    if (sql.includes("FROM hazards WHERE id = $1 FOR UPDATE")) {
      return { rows: [{ ...hazard, status_history: history }] };
    }
    if (sql === "SELECT now() AS at") return { rows: [{ at: new Date("2026-11-27T01:00:00Z") }] };
    if (sql.startsWith("UPDATE hazards")) {
      return { rows: [{ ...hazard, description: "新描述", updated_at: new Date("2026-11-27T01:00:00Z") }] };
    }
    throw new Error(`unexpected sql: ${sql}`);
  });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", { query } as unknown as Client);
    c.set("user", { id: "7", name: "测试用户", role: "inspector" });
    await next();
  });
  app.onError((err, c) => err instanceof ApiError ? failJson(c, err.status, err.code, err.issues) : c.text("error", 500));
  app.route("/", hazards);
  return { app, query };
}

const request = {
  method: "PATCH",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ client_uuid: "edit-uuid-0001", description: "新描述" }),
};

describe("hazard edit", () => {
  it("stores the first edit snapshot", async () => {
    const { app, query } = createApp();
    const response = await app.request("/hazards/10", request);
    expect(response.status).toBe(200);
    const update = query.mock.calls.find(([sql]) => String(sql).startsWith("UPDATE hazards"));
    const history = JSON.parse(String(update?.[1]?.[5]));
    expect(history[0].snapshot.description).toBe("新描述");
  });

  it("returns the first snapshot on replay", async () => {
    const snapshot = { ...hazard, description: "新描述" };
    const { app } = createApp([
      { status: "待整改", client_uuid: "edit-uuid-0001", action: "edit", changes: { description: "新描述" }, snapshot },
    ]);
    const response = await app.request("/hazards/10", request);
    const body = await response.json();
    expect(body.data.description).toBe("新描述");
    expect(body.data.duplicated).toBe(true);
  });
});
