import { Hono } from "hono";
import type { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../lib/env.js";
import { ApiError, failJson } from "../lib/http.js";
import uploads from "./uploads.js";

function createApp(registered: boolean) {
  const query = vi.fn().mockResolvedValue({ rows: [{ registered }] });
  const app = new Hono<AppEnv>();
  app.use("*", async (c, next) => {
    c.set("db", { query } as unknown as Client);
    c.set("user", { id: "7", name: "测试用户", role: "inspector" });
    await next();
  });
  app.onError((err, c) => err instanceof ApiError ? failJson(c, err.status, err.code, err.issues) : c.text("error", 500));
  app.route("/", uploads);
  return { app, query };
}

const env = {
  AWS_ENDPOINT_URL_S3: "https://storage.example.com",
  AWS_ACCESS_KEY_ID: "test-key",
  AWS_SECRET_ACCESS_KEY: "test-secret",
  AWS_REGION: "auto",
  STORAGE_BUCKET: "uploads",
};

describe("uploads", () => {
  it("signs a registered object key", async () => {
    const { app } = createApp(true);
    const response = await app.request("/uploads/presign?key=uploads/a.jpg", {}, env);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data.download_url).toContain("X-Amz-Signature");
  });

  it("rejects an unregistered object key", async () => {
    const { app } = createApp(false);
    const response = await app.request("/uploads/presign?key=uploads/missing.jpg", {}, env);
    expect(response.status).toBe(404);
  });
});
