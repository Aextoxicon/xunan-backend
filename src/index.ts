import "dotenv/config";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { serve } from "@hono/node-server";
import { Pool } from "pg";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

const env = {
  databaseUrl: process.env.DATABASE_URL,
  r2AccountId: process.env.R2_ACCOUNT_ID,
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID,
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  r2Bucket: process.env.R2_BUCKET,
  port: Number(process.env.PORT ?? 3000),
};

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
});

pool.on("error", (err) => {
  console.error("unexpected pg pool error", err);
});

const s3 =
  env.r2AccountId && env.r2AccessKeyId && env.r2SecretAccessKey
    ? new S3Client({
        region: "auto",
        endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.r2AccessKeyId,
          secretAccessKey: env.r2SecretAccessKey,
        },
      })
    : null;

const idField = z.string().min(8).max(64);
const dateField = z.string().datetime();
const posInt = z.number().int().positive();

const inspectionItemSchema = z.object({
  check_item_id: posInt,
  result: z.enum(["normal", "abnormal", "na"]),
  photo_key: z.string().optional(),
  remark: z.string().max(500).optional(),
});

const inspectionSchema = z.object({
  client_uuid: idField,
  room_id: posInt,
  inspector_id: posInt,
  inspected_at: dateField,
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  items: z.array(inspectionItemSchema).min(1),
});

const hazardSchema = z.object({
  client_uuid: idField,
  room_id: posInt,
  inspection_id: posInt.optional(),
  inspection_item_id: posInt.optional(),
  description: z.string().min(1).max(2000),
  level: z.enum(["一般", "较大", "重大"]),
  photo_keys: z.array(z.string()).default([]),
  assignee_id: posInt,
  due_at: dateField,
});

const statusSchema = z.object({
  client_uuid: idField,
  status: z.enum(["待整改", "整改中", "待验收", "已闭环"]),
  operator_id: posInt,
  note: z.string().max(500).optional(),
});

const presignSchema = z.object({
  file_name: z.string().min(1),
  content_type: z.string().min(1),
  file_size: posInt,
});

const allowedTransitions: Record<string, string[]> = {
  待整改: ["整改中"],
  整改中: ["待验收"],
  待验收: ["已闭环"],
  已闭环: [],
};

const defaultCheckItems = [
  { category: "用电", item_name: "插座与线路无破损", result: "normal" },
  { category: "消防", item_name: "灭火器压力正常", result: "normal" },
  { category: "危化品", item_name: "危化品柜双人双锁", result: "normal" },
  { category: "设备", item_name: "设备接地可靠", result: "normal" },
];

function recordNo(prefix: string): string {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const tail = Date.now().toString().slice(-6);
  return `${prefix}-${day}-${tail}`;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "23505";
}

class ApiError extends Error {
  constructor(public status: ContentfulStatusCode, public code: string, public issues?: unknown) {
    super(code);
    this.name = "ApiError";
  }
}

function okJson<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ ok: true, data } as const, status);
}

function failJson(c: Context, status: ContentfulStatusCode, code: string, issues?: unknown) {
  return c.json({ ok: false, error: { code, ...(issues ? { issues } : {}) } } as const, status);
}

const app = new Hono();
const api = new Hono();

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return failJson(c, err.status, err.code, err.issues);
  }
  if (err instanceof HTTPException) {
    return failJson(c, err.status as ContentfulStatusCode, err.message);
  }
  console.error(err);
  return failJson(c, 500, "internal_error");
});

app.get("/health", (c) => okJson(c, { status: "ok", time: new Date().toISOString() }));

api.post(
  "/inspections",
  zValidator("json", inspectionSchema, (result, _c) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query(
        `INSERT INTO inspections
          (client_uuid, record_no, room_id, inspector_id, inspected_at, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, record_no, created_at`,
        [
          body.client_uuid,
          recordNo("XJ"),
          body.room_id,
          body.inspector_id,
          body.inspected_at,
          body.location?.latitude ?? null,
          body.location?.longitude ?? null,
        ],
      );
      const inspection = rows[0];
      for (const item of body.items) {
        await client.query(
          `INSERT INTO inspection_items
            (inspection_id, category, item_name, result, photo_key, remark)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [inspection.id, "", item.check_item_id.toString(), item.result, item.photo_key ?? null, item.remark ?? null],
        );
      }
      await client.query("COMMIT");
      return okJson(c, { id: inspection.id, record_no: inspection.record_no, created_at: inspection.created_at }, 201);
    } catch (err) {
      await client.query("ROLLBACK");
      if (isUniqueViolation(err)) {
        return failJson(c, 409, "duplicate_client_uuid");
      }
      throw err;
    } finally {
      client.release();
    }
  },
);

api.post(
  "/hazards",
  zValidator("json", hazardSchema, (result, _c) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const now = new Date().toISOString();
    const { rows } = await pool.query(
      `INSERT INTO hazards
        (client_uuid, hazard_no, room_id, inspection_id, inspection_item_id,
         description, level, photo_keys, assignee_id, due_at, status, status_history, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id, hazard_no, status, created_at`,
      [
        body.client_uuid,
        recordNo("HZ"),
        body.room_id,
        body.inspection_id ?? null,
        body.inspection_item_id ?? null,
        body.description,
        body.level,
        JSON.stringify(body.photo_keys),
        body.assignee_id,
        body.due_at,
        "待整改",
        JSON.stringify([{ status: "待整改", at: now }]),
        body.assignee_id,
      ],
    );
    const hazard = rows[0];
    return okJson(
      c,
      { id: hazard.id, hazard_no: hazard.hazard_no, status: hazard.status, created_at: hazard.created_at },
      201,
    );
  },
);

api.patch(
  "/hazards/:id/status",
  zValidator("json", statusSchema, (result, _c) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");
    if (!Number.isInteger(id) || id <= 0) {
      throw new ApiError(400, "invalid_id");
    }
    const { rows } = await pool.query(
      `SELECT id, status, status_history, client_uuid FROM hazards WHERE id = $1`,
      [id],
    );
    const hazard = rows[0];
    if (!hazard) {
      throw new ApiError(404, "not_found");
    }
    const allowed = allowedTransitions[hazard.status as string] ?? [];
    if (!allowed.includes(body.status)) {
      throw new ApiError(409, "invalid_status_transition");
    }
    const now = new Date().toISOString();
    const history = Array.isArray(hazard.status_history) ? hazard.status_history : [];
    const nextHistory = [
      ...history,
      { status: body.status, at: now, operator_id: body.operator_id, note: body.note ?? null },
    ];
    const { rows: updated } = await pool.query(
      `UPDATE hazards
        SET status = $1, closed_at = $2, status_history = $3, updated_at = now()
        WHERE id = $4
        RETURNING id, hazard_no, status, due_at, closed_at, updated_at`,
      [body.status, body.status === "已闭环" ? now : null, JSON.stringify(nextHistory), id],
    );
    return okJson(c, updated[0]);
  },
);

api.get("/stats/overview", async (c) => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> '已闭环')::int AS pending_count,
       COUNT(*) FILTER (WHERE status <> '已闭环' AND due_at < now())::int AS overdue_count,
       COUNT(*) FILTER (WHERE status = '已闭环')::int AS closed_count,
       COUNT(*)::int AS total_count
     FROM hazards`,
  );
  const summary = rows[0];
  const { rows: roomRanking } = await pool.query(
    `SELECT r.name, COUNT(h.id)::int AS hazard_count
     FROM rooms r
     LEFT JOIN hazards h ON h.room_id = r.id
     GROUP BY r.id, r.name
     ORDER BY hazard_count DESC`,
  );
  const { rows: trend } = await pool.query(
    `SELECT date_trunc('day', created_at)::date AS day, COUNT(*)::int AS created
     FROM hazards
     WHERE created_at >= now() - interval '7 days'
     GROUP BY day
     ORDER BY day`,
  );
  return okJson(c, {
    pending_count: summary.pending_count,
    overdue_count: summary.overdue_count,
    closed_count: summary.closed_count,
    total_count: summary.total_count,
    closure_rate: summary.total_count ? summary.closed_count / summary.total_count : 0,
    room_ranking: roomRanking,
    trend,
  });
});

api.get("/rooms", async (c) => {
  const { rows } = await pool.query(`SELECT id, code, name, location, active FROM rooms ORDER BY id`);
  return okJson(c, { rooms: rows });
});

api.get("/check-items", async (c) => {
  const roomId = c.req.query("room_id");
  if (!roomId) {
    throw new ApiError(400, "missing_room_id");
  }
  return okJson(c, { room_id: Number(roomId), sample: true, items: defaultCheckItems });
});

api.post(
  "/uploads/presign",
  zValidator("json", presignSchema, (result, _c) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    if (!s3 || !env.r2Bucket) {
      throw new ApiError(503, "r2_not_configured");
    }
    const body = c.req.valid("json");
    const ext = body.file_name.split(".").pop()?.toLowerCase() || "bin";
    const objectKey = `uploads/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: env.r2Bucket,
        Key: objectKey,
        ContentType: body.content_type,
      }),
      { expiresIn: 300 },
    );
    return okJson(c, {
      object_key: objectKey,
      upload_url: uploadUrl,
      method: "PUT",
      headers: { "Content-Type": body.content_type },
      expires_at: new Date(Date.now() + 300_000).toISOString(),
    });
  },
);

app.route("/api/v1", api);

if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  serve({ fetch: app.fetch, port: env.port }, (info) => {
    console.log(`xunan-server listening on http://localhost:${info.port}`);
  });
}

export default app;
