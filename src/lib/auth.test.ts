import type { Context } from "hono";
import { verify } from "hono/jwt";
import { describe, expect, it } from "vitest";
import type { AppEnv } from "./env.js";
import { ApiError } from "./http.js";
import { resolveActorId, signToken } from "./auth.js";

describe("auth", () => {
  it("signs and verifies the user id", async () => {
    const { token } = await signToken({ id: "7", name: "测试用户", role: "inspector" }, "test-secret", 1);
    const payload = await verify(token, "test-secret", "HS256");
    expect(payload.sub).toBe("7");
  });

  it("defaults to the token user and allows only admin override", () => {
    const user = { id: "7", name: "测试用户", role: "inspector" };
    const context = { var: { user } } as Context<AppEnv>;
    expect(resolveActorId(context)).toBe("7");
    expect(() => resolveActorId(context, "8")).toThrow(ApiError);
    expect(resolveActorId({ var: { user: { ...user, role: "admin" } } } as Context<AppEnv>, "8")).toBe("8");
  });
});
