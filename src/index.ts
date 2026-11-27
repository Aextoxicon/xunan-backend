import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { Client } from "pg";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { allowedOrigins, connectionString, type AppEnv, type Bindings } from "./lib/env.js";
import { ApiError, failJson, isPgError, okJson } from "./lib/http.js";
import { toCst } from "./lib/time.js";
import inspections from "./routes/inspections.js";
import hazards from "./routes/hazards.js";
import catalog from "./routes/catalog.js";
import stats from "./routes/stats.js";
import reports from "./routes/reports.js";
import uploads from "./routes/uploads.js";
import auth from "./routes/auth.js";
import { authGuard } from "./lib/auth.js";

const app = new Hono<AppEnv>();
const api = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: (origin, c) => {
      const list = allowedOrigins(c.env.CORS_ORIGINS);
      if (list.length === 0) return undefined;
      if (list.includes("*")) return origin || "*";
      return list.includes(origin) ? origin : undefined;
    },
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 600,
  }),
);

app.use("*", async (c, next) => {
  const url = connectionString(c.env);
  if (!url) {
    return failJson(c, 500, "internal_error");
  }
  const db = new Client({ connectionString: url });
  try {
    await db.connect();
  } catch (err) {
    console.error(err);
    return failJson(c, 503, "database_unavailable");
  }
  c.set("db", db);
  try {
    await next();
  } finally {
    await db.end();
  }
});

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return failJson(c, err.status, err.code, err.issues);
  }
  if (err instanceof HTTPException) {
    return failJson(c, err.status as ContentfulStatusCode, err.message);
  }
  if (isPgError(err, "23503")) {
    return failJson(c, 422, "foreign_key_violation");
  }
  console.error(err);
  return failJson(c, 500, "internal_error");
});

app.get("/health", (c) => okJson(c, { status: "ok", time: toCst(new Date()) }));

api.use("*", authGuard());
api.route("/", auth);
api.route("/", inspections);
api.route("/", hazards);
api.route("/", catalog);
api.route("/", stats);
api.route("/", reports);
api.route("/", uploads);

app.route("/api/v1", api);

type FetchContext = Parameters<typeof app.fetch>[2];

const worker = {
  async fetch(request: Request, env: Bindings, ctx?: FetchContext): Promise<Response> {
    return await app.fetch(request, env, ctx);
  },
};

export default worker;
