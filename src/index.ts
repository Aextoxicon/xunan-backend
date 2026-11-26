import "dotenv/config";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { serve } from "@hono/node-server";
import { Pool, type PoolClient } from "pg";
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

const pool = new Pool({ connectionString: env.databaseUrl, max: 10 });

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

const clientUuid = z.string().min(8).max(64);
const positiveId = z.string().regex(/^[1-9]\d*$/);
const positiveInt = z.number().int().positive();
const dateField = z.string().datetime();

const checkItems = [
  { item_code: "elec.socket", category: "用电", item_name: "插座与线路无破损", photo_required_when_abnormal: true },
  { item_code: "fire.extinguisher", category: "消防", item_name: "灭火器压力正常", photo_required_when_abnormal: true },
  { item_code: "chemical.cabinet", category: "危化品", item_name: "危化品柜双人双锁", photo_required_when_abnormal: true },
  { item_code: "equipment.grounding", category: "设备", item_name: "设备接地可靠", photo_required_when_abnormal: true },
] as const;
const checkItemByCode = new Map<string, (typeof checkItems)[number]>(
  checkItems.map((item) => [item.item_code, item] as const),
);

const inspectionItemSchema = z
  .object({
    item_code: z.string().min(1),
    result: z.enum(["normal", "abnormal", "na"]),
    photo_keys: z.array(z.string().min(1)).default([]),
    remark: z.string().max(500).optional(),
  })
  .refine((item) => item.result !== "abnormal" || item.photo_keys.length > 0, {
    path: ["photo_keys"],
    message: "异常项至少上传一张照片",
  });

const inspectionSchema = z.object({
  client_uuid: clientUuid,
  room_id: positiveId,
  inspector_id: positiveId,
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
  client_uuid: clientUuid,
  room_id: positiveId,
  inspection_id: positiveId.optional(),
  inspection_item_id: positiveId.optional(),
  description: z.string().min(1).max(2000),
  level: z.enum(["一般", "较大", "重大"]),
  photo_keys: z.array(z.string().min(1)).min(1),
  assignee_id: positiveId,
  created_by: positiveId,
  due_at: dateField,
});

const statusSchema = z.object({
  client_uuid: clientUuid,
  status: z.enum(["待整改", "整改中", "待验收", "已闭环"]),
  operator_id: positiveId,
  note: z.string().max(500).optional(),
});

const presignSchema = z.object({
  file_name: z.string().min(1),
  content_type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  file_size: positiveInt.max(10 * 1024 * 1024),
});

const allowedTransitions: Record<string, string[]> = {
  待整改: ["整改中"],
  整改中: ["待验收"],
  待验收: ["已闭环"],
  已闭环: [],
};

type StatusHistoryEntry = {
  status: string;
  at: string;
  operator_id?: string;
  note?: string | null;
  client_uuid?: string;
};

const errorMessages: Record<string, string> = {
  validation_error: "参数校验失败",
  invalid_id: "ID 必须为正整数字符串",
  not_found: "资源不存在",
  invalid_status_transition: "状态流转不允许",
  idempotency_key_conflict: "同一 client_uuid 不能用于不同的目标状态",
  foreign_key_violation: "引用的资源不存在",
  internal_error: "服务内部错误",
  r2_not_configured: "R2 未配置",
};

async function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await run(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function recordNo(
  client: PoolClient,
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

function isPgError(err: unknown, code: string): boolean {
  return typeof err === "object" && err !== null && "code" in err && err.code === code;
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
  return c.json(
    {
      ok: false,
      error: {
        code,
        message: errorMessages[code] ?? code,
        ...(issues ? { issues } : {}),
      },
    } as const,
    status,
  );
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
  if (isPgError(err, "23503")) {
    return failJson(c, 422, "foreign_key_violation");
  }
  console.error(err);
  return failJson(c, 500, "internal_error");
});

app.get("/health", (c) => okJson(c, { status: "ok", time: new Date().toISOString() }));

api.post(
  "/inspections",
  zValidator("json", inspectionSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const configs = body.items.map((item, index) => {
      const config = checkItemByCode.get(item.item_code);
      if (!config) {
        throw new ApiError(400, "validation_error", [
          { path: ["items", index, "item_code"], message: "检查项不存在" },
        ]);
      }
      return config;
    });
    const applicableCount = body.items.filter((item) => item.result !== "na").length;
    const normalCount = body.items.filter((item) => item.result === "normal").length;
    const score = applicableCount ? (normalCount / applicableCount) * 100 : null;

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO inspections
          (client_uuid, record_no, room_id, inspector_id, inspected_at, latitude, longitude, score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (client_uuid) DO NOTHING
         RETURNING id, record_no, score, created_at`,
        [
          body.client_uuid,
          await recordNo(client, "inspections", "record_no", "XJ"),
          body.room_id,
          body.inspector_id,
          body.inspected_at,
          body.location?.latitude ?? null,
          body.location?.longitude ?? null,
          score,
        ],
      );
      let inspection = rows[0];
      let duplicated = false;
      if (!inspection) {
        const { rows: existing } = await client.query(
          `SELECT id, record_no, score, created_at FROM inspections WHERE client_uuid = $1`,
          [body.client_uuid],
        );
        inspection = existing[0];
        duplicated = true;
      } else {
        for (const [index, item] of body.items.entries()) {
          const config = configs[index];
          await client.query(
            `INSERT INTO inspection_items
              (inspection_id, item_code, category, item_name, result, photo_keys, remark)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              inspection.id,
              item.item_code,
              config.category,
              config.item_name,
              item.result,
              item.photo_keys,
              item.remark ?? null,
            ],
          );
        }
      }
      const data = {
        id: inspection.id,
        record_no: inspection.record_no,
        score: inspection.score === null ? null : Number(inspection.score),
        created_at: inspection.created_at,
      };
      return { data: duplicated ? { ...data, duplicated: true } : data, status: duplicated ? (200 as const) : (201 as const) };
    });
    return okJson(c, result.data, result.status);
  },
);

api.post(
  "/hazards",
  zValidator("json", hazardSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const result = await withTransaction(async (client) => {
      if (body.inspection_item_id) {
        const { rows } = await client.query(
          `SELECT inspection_id FROM inspection_items WHERE id = $1`,
          [body.inspection_item_id],
        );
        if (!rows[0] || rows[0].inspection_id !== body.inspection_id) {
          throw new ApiError(422, "foreign_key_violation");
        }
      }
      const now = new Date().toISOString();
      const { rows } = await client.query(
        `INSERT INTO hazards
          (client_uuid, hazard_no, room_id, inspection_id, inspection_item_id,
           description, level, photo_keys, assignee_id, created_by, due_at,
           status, status_history)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (client_uuid) DO NOTHING
         RETURNING id, hazard_no, status, created_at`,
        [
          body.client_uuid,
          await recordNo(client, "hazards", "hazard_no", "HZ"),
          body.room_id,
          body.inspection_id ?? null,
          body.inspection_item_id ?? null,
          body.description,
          body.level,
          body.photo_keys,
          body.assignee_id,
          body.created_by,
          body.due_at,
          "待整改",
          JSON.stringify([{ status: "待整改", at: now, operator_id: body.created_by, note: null }]),
        ],
      );
      let hazard = rows[0];
      let duplicated = false;
      if (!hazard) {
        const { rows: existing } = await client.query(
          `SELECT id, hazard_no, status, created_at FROM hazards WHERE client_uuid = $1`,
          [body.client_uuid],
        );
        hazard = existing[0];
        duplicated = true;
      }
      const data = {
        id: hazard.id,
        hazard_no: hazard.hazard_no,
        status: hazard.status,
        created_at: hazard.created_at,
      };
      return { data: duplicated ? { ...data, duplicated: true } : data, status: duplicated ? (200 as const) : (201 as const) };
    });
    return okJson(c, result.data, result.status);
  },
);

api.patch(
  "/hazards/:id/status",
  zValidator("json", statusSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const id = c.req.param("id");
    if (!positiveId.safeParse(id).success) {
      throw new ApiError(400, "invalid_id");
    }
    const body = c.req.valid("json");
    const data = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT id, hazard_no, status, due_at, closed_at, updated_at, status_history
         FROM hazards WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const hazard = rows[0];
      if (!hazard) {
        throw new ApiError(404, "not_found");
      }
      const history: StatusHistoryEntry[] = Array.isArray(hazard.status_history)
        ? (hazard.status_history as StatusHistoryEntry[])
        : [];
      const replay = history.find((entry) => entry?.client_uuid === body.client_uuid);
      if (replay && replay.status !== body.status) {
        throw new ApiError(409, "idempotency_key_conflict");
      }
      const duplicated = replay !== undefined;
      const current = {
        id: hazard.id,
        hazard_no: hazard.hazard_no,
        status: hazard.status,
        due_at: hazard.due_at,
        closed_at: hazard.closed_at,
        updated_at: hazard.updated_at,
      };
      if (duplicated || hazard.status === body.status) {
        return duplicated ? { ...current, duplicated: true } : current;
      }
      if (!(allowedTransitions[hazard.status as string] ?? []).includes(body.status)) {
        throw new ApiError(409, "invalid_status_transition");
      }
      const now = new Date().toISOString();
      const { rows: updated } = await client.query(
        `UPDATE hazards
         SET status = $1, closed_at = $2, status_history = $3, updated_at = now()
         WHERE id = $4
         RETURNING id, hazard_no, status, due_at, closed_at, updated_at`,
        [
          body.status,
          body.status === "已闭环" ? now : null,
          JSON.stringify([
            ...history,
            {
              status: body.status,
              at: now,
              operator_id: body.operator_id,
              note: body.note ?? null,
              client_uuid: body.client_uuid,
            },
          ]),
          id,
        ],
      );
      return updated[0];
    });
    return okJson(c, data);
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
    `SELECT r.id AS room_id, r.name, COUNT(h.id)::int AS hazard_count
     FROM rooms r
     LEFT JOIN hazards h ON h.room_id = r.id
     GROUP BY r.id, r.name
     ORDER BY hazard_count DESC, r.id`,
  );
  const { rows: trend } = await pool.query(
    `WITH days AS (
       SELECT generate_series(
         date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai') - interval '6 days',
         date_trunc('day', now() AT TIME ZONE 'Asia/Shanghai'),
         interval '1 day'
       ) AS day
     )
     SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
       COUNT(h.id) FILTER (
         WHERE h.created_at AT TIME ZONE 'Asia/Shanghai' >= days.day
           AND h.created_at AT TIME ZONE 'Asia/Shanghai' < days.day + interval '1 day'
       )::int AS created,
       COUNT(h.id) FILTER (
         WHERE h.closed_at AT TIME ZONE 'Asia/Shanghai' >= days.day
           AND h.closed_at AT TIME ZONE 'Asia/Shanghai' < days.day + interval '1 day'
       )::int AS closed
     FROM days
     LEFT JOIN hazards h ON
       (h.created_at AT TIME ZONE 'Asia/Shanghai' >= days.day
        AND h.created_at AT TIME ZONE 'Asia/Shanghai' < days.day + interval '1 day')
       OR (h.closed_at AT TIME ZONE 'Asia/Shanghai' >= days.day
           AND h.closed_at AT TIME ZONE 'Asia/Shanghai' < days.day + interval '1 day')
     GROUP BY days.day
     ORDER BY days.day`,
  );
  return okJson(c, {
    pending_count: summary.pending_count,
    overdue_count: summary.overdue_count,
    closed_count: summary.closed_count,
    total_count: summary.total_count,
    closure_rate: summary.total_count
      ? Math.round((summary.closed_count / summary.total_count) * 10000) / 10000
      : 0,
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
  if (!positiveId.safeParse(roomId ?? "").success) {
    throw new ApiError(400, "validation_error");
  }
  const { rows } = await pool.query(`SELECT id FROM rooms WHERE id = $1`, [roomId]);
  if (!rows[0]) {
    throw new ApiError(404, "not_found");
  }
  return okJson(c, { room_id: roomId, items: checkItems });
});

api.post(
  "/uploads/presign",
  zValidator("json", presignSchema, (result) => {
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
