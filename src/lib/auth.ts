import type { MiddlewareHandler } from "hono";
import { sign, verify } from "hono/jwt";
import type { AppEnv } from "./env.js";
import { ApiError } from "./http.js";

export type AuthUser = {
  id: string;
  name: string;
  role: string;
};

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}

export async function signToken(
  user: AuthUser,
  secret: string,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ttlDays * 24 * 60 * 60;
  const token = await sign(
    { sub: user.id, name: user.name, role: user.role, iat: now, exp },
    secret,
    "HS256",
  );
  return { token, expiresAt: new Date(exp * 1000) };
}

const PUBLIC_PATHS = new Set(["/api/v1/auth/login"]);

export function authGuard(): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method === "POST" && PUBLIC_PATHS.has(c.req.path)) {
      await next();
      return;
    }
    const secret = c.env.JWT_SECRET;
    if (!secret) {
      throw new ApiError(503, "auth_not_configured");
    }
    const token = bearerToken(c.req.header("Authorization"));
    if (!token) {
      throw new ApiError(401, "unauthorized");
    }
    try {
      const payload = await verify(token, secret, "HS256");
      c.set("user", {
        id: String(payload.sub ?? ""),
        name: String(payload.name ?? ""),
        role: String(payload.role ?? ""),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      throw new ApiError(401, /expired/i.test(message) ? "token_expired" : "unauthorized");
    }
    await next();
  };
}
