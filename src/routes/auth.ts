import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { ApiError, okJson } from "../lib/http.js";
import { toCst } from "../lib/time.js";
import { signToken } from "../lib/auth.js";
import { verifyPassword } from "../lib/password.js";
import { jwtTtlDays } from "../lib/env.js";
import type { AppEnv } from "../lib/env.js";

const loginSchema = z.object({
  name: z.string().min(1).max(32),
  password: z.string().min(1).max(128),
});

const auth = new Hono<AppEnv>();

auth.post(
  "/auth/login",
  zValidator("json", loginSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      throw new ApiError(503, "auth_not_configured");
    }
    const body = c.req.valid("json");
    const { rows } = await c.var.db.query(
      `SELECT id, name, role, password_hash FROM users WHERE name = $1`,
      [body.name],
    );
    const user = rows[0];
    const passwordOk = await verifyPassword(body.password, user?.password_hash ?? null);
    if (!user || !passwordOk) {
      throw new ApiError(401, "invalid_credentials");
    }
    const { token, expiresAt } = await signToken(
      { id: String(user.id), name: user.name, role: user.role },
      secret,
      jwtTtlDays(c.env.JWT_TTL_DAYS),
    );
    return okJson(c, {
      token,
      token_type: "Bearer",
      expires_at: toCst(expiresAt),
      user: { id: String(user.id), name: user.name, role: user.role },
    });
  },
);

auth.get("/auth/me", async (c) => {
  const current = c.var.user!;
  return okJson(c, {
    id: current.id,
    name: current.name,
    role: current.role,
  });
});

export default auth;
