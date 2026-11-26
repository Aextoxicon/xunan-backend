import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { resolveActorId } from "../lib/auth.js";
import { withTransaction, recordNo } from "../lib/db.js";
import { ApiError, okJson } from "../lib/http.js";
import { toCst } from "../lib/time.js";
import { itemsForRoom, type CheckItem } from "../lib/catalog.js";
import { distanceMeters, fetchRoom } from "../lib/domain.js";
import { clientUuid, dateField, levelField, positiveId } from "../lib/validation.js";
import type { AppEnv } from "../lib/env.js";

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

const inlineHazardSchema = z.object({
  client_uuid: clientUuid,
  item_code: z.string().min(1).optional(),
  description: z.string().min(1).max(2000),
  level: levelField,
  photo_keys: z.array(z.string().min(1)).min(1),
  assignee_id: positiveId,
  created_by: positiveId.optional(),
  due_at: dateField,
});

const inspectionSchema = z.object({
  client_uuid: clientUuid,
  room_id: positiveId,
  inspector_id: positiveId.optional(),
  inspected_at: dateField,
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .optional(),
  items: z.array(inspectionItemSchema).min(1),
  hazards: z.array(inlineHazardSchema).max(20).optional(),
});

const inspectionListQuery = z.object({
  room_id: positiveId.optional(),
  inspector_id: positiveId.optional(),
  from: dateField.optional(),
  to: dateField.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const inspections = new Hono<AppEnv>();

inspections.post(
  "/inspections",
  zValidator("json", inspectionSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const inspectorId = resolveActorId(c, body.inspector_id);
    const result = await withTransaction(c, async (client) => {
      const room = await fetchRoom(client, body.room_id);
      if (!room) {
        throw new ApiError(422, "foreign_key_violation");
      }
      const catalog = itemsForRoom(room.check_item_codes);
      const catalogByCode = new Map<string, CheckItem>(
        catalog.map((item) => [item.item_code, item] as const),
      );
      const configs = body.items.map((item, index) => {
        const config = catalogByCode.get(item.item_code);
        if (!config) {
          throw new ApiError(400, "validation_error", [
            { path: ["items", index, "item_code"], message: "该实训室没有此检查项" },
          ]);
        }
        return config;
      });
      if (body.location && room.latitude !== null && room.longitude !== null) {
        const radius = room.radius_m ?? 200;
        const distance = distanceMeters(
          body.location.latitude,
          body.location.longitude,
          Number(room.latitude),
          Number(room.longitude),
        );
        if (distance > radius) {
          throw new ApiError(422, "location_out_of_range", [
            { path: ["location"], message: `距实训室 ${Math.round(distance)} 米，超出 ${radius} 米范围` },
          ]);
        }
      }
      const inlineHazards = body.hazards ?? [];
      const seenUuids = new Set<string>();
      for (const hazard of inlineHazards) {
        if (seenUuids.has(hazard.client_uuid)) {
          throw new ApiError(400, "validation_error", [
            { path: ["hazards"], message: `client_uuid 重复：${hazard.client_uuid}` },
          ]);
        }
        seenUuids.add(hazard.client_uuid);
      }
      const applicableCount = body.items.filter((item) => item.result !== "na").length;
      const normalCount = body.items.filter((item) => item.result === "normal").length;
      const score = applicableCount ? (normalCount / applicableCount) * 100 : null;

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
          inspectorId,
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
        const itemIds = new Map<string, string>();
        for (const [index, item] of body.items.entries()) {
          const config = configs[index];
          const { rows: inserted } = await client.query(
            `INSERT INTO inspection_items
              (inspection_id, item_code, category, item_name, result, photo_keys, remark)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
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
          itemIds.set(item.item_code, inserted[0].id);
        }
        for (const [index, hazard] of inlineHazards.entries()) {
          if (hazard.item_code && !itemIds.has(hazard.item_code)) {
            throw new ApiError(400, "validation_error", [
              { path: ["hazards", index, "item_code"], message: "隐患引用的检查项不在本次巡检中" },
            ]);
          }
          const createdBy = resolveActorId(c, hazard.created_by);
          const { rows: clock } = await client.query(`SELECT now() AS at`);
          const now = toCst(clock[0].at as Date);
          await client.query(
            `INSERT INTO hazards
              (client_uuid, hazard_no, room_id, inspection_id, inspection_item_id,
               description, level, photo_keys, assignee_id, created_by, due_at, status, status_history)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
             ON CONFLICT (client_uuid) DO NOTHING`,
            [
              hazard.client_uuid,
              await recordNo(client, "hazards", "hazard_no", "HZ"),
              body.room_id,
              inspection.id,
              hazard.item_code ? itemIds.get(hazard.item_code) ?? null : null,
              hazard.description,
              hazard.level,
              hazard.photo_keys,
              hazard.assignee_id,
              createdBy,
              hazard.due_at,
              "待整改",
              JSON.stringify([
                { status: "待整改", at: now, operator_id: createdBy, note: null },
              ]),
            ],
          );
        }
      }
      const { rows: counts } = await client.query(
        `SELECT
           (SELECT COUNT(*)::int FROM hazards WHERE inspection_id = $1) AS hazard_count,
           (SELECT COUNT(*)::int FROM inspection_items WHERE inspection_id = $1) AS items_count`,
        [inspection.id],
      );
      const data = {
        id: inspection.id,
        record_no: inspection.record_no,
        score: inspection.score === null ? null : Number(inspection.score),
        created_at: toCst(inspection.created_at),
        hazard_count: counts[0].hazard_count,
        items_count: counts[0].items_count,
      };
      return { data: duplicated ? { ...data, duplicated: true } : data, status: duplicated ? (200 as const) : (201 as const) };
    });
    return okJson(c, result.data, result.status);
  },
);

inspections.get("/inspections", async (c) => {
  const parsed = inspectionListQuery.safeParse({
    room_id: c.req.query("room_id"),
    inspector_id: c.req.query("inspector_id"),
    from: c.req.query("from"),
    to: c.req.query("to"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!parsed.success) {
    throw new ApiError(400, "validation_error", parsed.error.issues);
  }
  const query = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.room_id) {
    params.push(query.room_id);
    conditions.push(`i.room_id = $${params.length}`);
  }
  if (query.inspector_id) {
    params.push(query.inspector_id);
    conditions.push(`i.inspector_id = $${params.length}`);
  }
  if (query.from) {
    params.push(query.from);
    conditions.push(`i.inspected_at >= $${params.length}`);
  }
  if (query.to) {
    params.push(query.to);
    conditions.push(`i.inspected_at <= $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows: totalRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS total FROM inspections i ${where}`,
    params,
  );
  params.push(query.limit, query.offset);
  const { rows } = await c.var.db.query(
    `SELECT i.id, i.record_no, i.room_id, r.name AS room_name, i.inspector_id, u.name AS inspector_name,
       i.inspected_at, i.score, i.created_at,
       (SELECT COUNT(*)::int FROM inspection_items ii WHERE ii.inspection_id = i.id) AS item_count,
       (SELECT COUNT(*)::int FROM inspection_items ii WHERE ii.inspection_id = i.id AND ii.result = 'abnormal') AS abnormal_count,
       (SELECT COUNT(*)::int FROM hazards h WHERE h.inspection_id = i.id) AS hazard_count
     FROM inspections i
     LEFT JOIN rooms r ON r.id = i.room_id
     LEFT JOIN users u ON u.id = i.inspector_id
     ${where}
     ORDER BY i.inspected_at DESC, i.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return okJson(c, {
    inspections: rows.map((row) => ({
      ...row,
      inspected_at: toCst(row.inspected_at),
      created_at: toCst(row.created_at),
      score: row.score === null ? null : Number(row.score),
    })),
    total: totalRows[0].total,
    limit: query.limit,
    offset: query.offset,
  });
});

inspections.get("/inspections/:id", async (c) => {
  const id = c.req.param("id");
  if (!positiveId.safeParse(id).success) {
    throw new ApiError(400, "invalid_id");
  }
  const { rows } = await c.var.db.query(
    `SELECT i.id, i.record_no, i.room_id, r.name AS room_name, i.inspector_id, u.name AS inspector_name,
       i.inspected_at, i.latitude, i.longitude, i.score, i.created_at
     FROM inspections i
     LEFT JOIN rooms r ON r.id = i.room_id
     LEFT JOIN users u ON u.id = i.inspector_id
     WHERE i.id = $1`,
    [id],
  );
  if (!rows[0]) {
    throw new ApiError(404, "not_found");
  }
  const inspection = rows[0];
  const { rows: items } = await c.var.db.query(
    `SELECT id, item_code, category, item_name, result, photo_keys, remark
     FROM inspection_items WHERE inspection_id = $1 ORDER BY id`,
    [id],
  );
  const { rows: hazards } = await c.var.db.query(
    `SELECT id, hazard_no, description, level, status, inspection_item_id, due_at, closed_at,
       (status <> '已闭环' AND due_at < now()) AS overdue
     FROM hazards WHERE inspection_id = $1 ORDER BY id`,
    [id],
  );
  return okJson(c, {
    ...inspection,
    inspected_at: toCst(inspection.inspected_at),
    created_at: toCst(inspection.created_at),
    score: inspection.score === null ? null : Number(inspection.score),
    items,
    hazards: hazards.map((row) => ({
      ...row,
      due_at: toCst(row.due_at),
      closed_at: toCst(row.closed_at),
    })),
  });
});

export default inspections;
