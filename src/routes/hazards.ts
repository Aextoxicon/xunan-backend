import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { resolveActorId } from "../lib/auth.js";
import { recordNo, withTransaction } from "../lib/db.js";
import { ApiError, okJson } from "../lib/http.js";
import { toCst } from "../lib/time.js";
import {
  allowedTransitions,
  escalateLevel,
  type StatusHistoryEntry,
} from "../lib/domain.js";
import { clientUuid, dateField, levelField, positiveId, statusField } from "../lib/validation.js";
import type { AppEnv } from "../lib/env.js";

const hazardSchema = z.object({
  client_uuid: clientUuid,
  room_id: positiveId,
  inspection_id: positiveId.optional(),
  inspection_item_id: positiveId.optional(),
  description: z.string().min(1).max(2000),
  level: levelField,
  photo_keys: z.array(z.string().min(1)).min(1),
  assignee_id: positiveId,
  created_by: positiveId.optional(),
  due_at: dateField,
});

const statusSchema = z.object({
  client_uuid: clientUuid,
  status: statusField,
  operator_id: positiveId.optional(),
  note: z.string().max(500).optional(),
});

const hazardUpdateSchema = z
  .object({
    client_uuid: clientUuid,
    operator_id: positiveId.optional(),
    description: z.string().min(1).max(2000).optional(),
    level: levelField.optional(),
    assignee_id: positiveId.optional(),
    due_at: dateField.optional(),
    note: z.string().max(500).optional(),
  })
  .refine(
    (body) =>
      body.description !== undefined ||
      body.level !== undefined ||
      body.assignee_id !== undefined ||
      body.due_at !== undefined,
    { path: [], message: "至少提供一个要修改的字段" },
  );

const remindSchema = z.object({
  client_uuid: clientUuid,
  operator_id: positiveId.optional(),
  note: z.string().max(200).optional(),
});

const hazardListQuery = z.object({
  status: z.string().optional(),
  room_id: positiveId.optional(),
  assignee_id: positiveId.optional(),
  overdue: z.enum(["true", "false"]).optional(),
  due: z.enum(["soon", "overdue"]).optional(),
  days: z.coerce.number().int().min(1).max(30).default(3),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const hazards = new Hono<AppEnv>();

hazards.post(
  "/hazards",
  zValidator("json", hazardSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const body = c.req.valid("json");
    const createdBy = resolveActorId(c, body.created_by);
    const result = await withTransaction(c, async (client) => {
      const { rows: existingRows } = await client.query(
        `SELECT id, hazard_no, status, created_at FROM hazards WHERE client_uuid = $1`,
        [body.client_uuid],
      );
      const existing = existingRows[0];
      if (existing) {
        const data = {
          id: existing.id,
          hazard_no: existing.hazard_no,
          status: existing.status,
          created_at: toCst(existing.created_at),
        };
        return { data: { ...data, duplicated: true }, status: 200 as const };
      }
      if (body.inspection_item_id) {
        const { rows } = await client.query(
          `SELECT inspection_id FROM inspection_items WHERE id = $1`,
          [body.inspection_item_id],
        );
        if (!rows[0] || rows[0].inspection_id !== body.inspection_id) {
          throw new ApiError(422, "foreign_key_violation");
        }
      }
      const { rows: clock } = await client.query(`SELECT now() AS at`);
      const now = toCst(clock[0].at as Date);
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
          createdBy,
          body.due_at,
          "待整改",
          JSON.stringify([{ status: "待整改", at: now, operator_id: createdBy, note: null }]),
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
        created_at: toCst(hazard.created_at),
      };
      return { data: duplicated ? { ...data, duplicated: true } : data, status: duplicated ? (200 as const) : (201 as const) };
    });
    return okJson(c, result.data, result.status);
  },
);

hazards.get("/hazards", async (c) => {
  const parsed = hazardListQuery.safeParse({
    status: c.req.query("status"),
    room_id: c.req.query("room_id"),
    assignee_id: c.req.query("assignee_id"),
    overdue: c.req.query("overdue"),
    due: c.req.query("due"),
    days: c.req.query("days"),
    limit: c.req.query("limit"),
    offset: c.req.query("offset"),
  });
  if (!parsed.success) {
    throw new ApiError(400, "validation_error", parsed.error.issues);
  }
  const query = parsed.data;
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.status) {
    const statuses = query.status
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const invalid = statuses.filter((value) => !(value in allowedTransitions));
    if (invalid.length || statuses.length === 0) {
      throw new ApiError(400, "validation_error", [
        { path: ["status"], message: `状态取值非法：${invalid.join(",") || "空"}` },
      ]);
    }
    params.push(statuses);
    conditions.push(`h.status = ANY($${params.length})`);
  }
  if (query.room_id) {
    params.push(query.room_id);
    conditions.push(`h.room_id = $${params.length}`);
  }
  if (query.assignee_id) {
    params.push(query.assignee_id);
    conditions.push(`h.assignee_id = $${params.length}`);
  }
  if (query.overdue === "true") {
    conditions.push(`h.status <> '已闭环' AND h.due_at < now()`);
  }
  if (query.due === "overdue") {
    conditions.push(`h.status <> '已闭环' AND h.due_at < now()`);
  }
  if (query.due === "soon") {
    params.push(query.days);
    conditions.push(`h.status <> '已闭环' AND h.due_at >= now() AND h.due_at < now() + ($${params.length} || ' days')::interval`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const { rows: totalRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS total FROM hazards h ${where}`,
    params,
  );
  params.push(query.limit, query.offset);
  const { rows } = await c.var.db.query(
    `SELECT h.id, h.hazard_no, h.room_id, r.name AS room_name, h.description, h.level, h.photo_keys,
       h.assignee_id, h.created_by, h.due_at, h.status, h.closed_at, h.created_at, h.updated_at,
       h.remind_count, h.last_reminded_at,
       (h.status <> '已闭环' AND h.due_at < now()) AS overdue
     FROM hazards h
     LEFT JOIN rooms r ON r.id = h.room_id
     ${where}
     ORDER BY (h.status = '已闭环'), (h.status <> '已闭环' AND h.due_at < now()) DESC, h.due_at, h.id
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return okJson(c, {
    hazards: rows.map((row) => ({
      ...row,
      due_at: toCst(row.due_at),
      closed_at: toCst(row.closed_at),
      created_at: toCst(row.created_at),
      updated_at: toCst(row.updated_at),
      last_reminded_at: toCst(row.last_reminded_at),
      escalated_level: row.overdue ? escalateLevel(row.level) : row.level,
    })),
    total: totalRows[0].total,
    limit: query.limit,
    offset: query.offset,
  });
});

hazards.patch(
  "/hazards/:id",
  zValidator("json", hazardUpdateSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const id = c.req.param("id");
    if (!positiveId.safeParse(id).success) {
      throw new ApiError(400, "invalid_id");
    }
    const body = c.req.valid("json");
    const operatorId = resolveActorId(c, body.operator_id);
    const data = await withTransaction(c, async (client) => {
      const { rows } = await client.query(
        `SELECT id, hazard_no, status, description, level, assignee_id, due_at, closed_at,
           status_history, updated_at
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
      const replay = history.find(
        (entry) => entry?.client_uuid === body.client_uuid && entry?.action === "edit",
      );
      const current = {
        id: hazard.id,
        hazard_no: hazard.hazard_no,
        description: hazard.description,
        level: hazard.level,
        assignee_id: hazard.assignee_id,
        due_at: toCst(hazard.due_at),
        status: hazard.status,
        updated_at: toCst(hazard.updated_at),
      };
      const changes: Record<string, unknown> = {};
      if (body.description !== undefined) changes.description = body.description;
      if (body.level !== undefined) changes.level = body.level;
      if (body.assignee_id !== undefined) changes.assignee_id = body.assignee_id;
      if (body.due_at !== undefined) changes.due_at = body.due_at;
      if (replay) {
        if (JSON.stringify(replay.changes ?? {}) !== JSON.stringify(changes)) {
          throw new ApiError(409, "idempotency_key_conflict");
        }
        return { ...(replay.snapshot ?? current), duplicated: true };
      }
      if (hazard.status === "已闭环") {
        throw new ApiError(409, "invalid_status_transition");
      }
      const { rows: clock } = await client.query(`SELECT now() AS at`);
      const at = clock[0].at as Date;
      const atCst = toCst(at) as string;
      const snapshot = {
        id: hazard.id,
        hazard_no: hazard.hazard_no,
        description: body.description ?? hazard.description,
        level: body.level ?? hazard.level,
        assignee_id: body.assignee_id ?? hazard.assignee_id,
        due_at: body.due_at ? toCst(new Date(body.due_at)) : toCst(hazard.due_at),
        status: hazard.status,
        updated_at: atCst,
      };
      const { rows: updated } = await client.query(
        `UPDATE hazards
         SET description = COALESCE($2, description),
             level = COALESCE($3, level),
             assignee_id = COALESCE($4, assignee_id),
             due_at = COALESCE($5, due_at),
             status_history = $6,
             updated_at = $7
         WHERE id = $1
         RETURNING id, hazard_no, description, level, assignee_id, due_at, status, updated_at`,
        [
          id,
          body.description ?? null,
          body.level ?? null,
          body.assignee_id ?? null,
          body.due_at ?? null,
          JSON.stringify([
            ...history,
            {
              status: hazard.status,
              at: atCst,
              operator_id: operatorId,
              note: body.note ?? null,
              client_uuid: body.client_uuid,
              action: "edit",
              changes,
              snapshot,
            },
          ]),
          at,
        ],
      );
      const row = updated[0];
      return {
        id: row.id,
        hazard_no: row.hazard_no,
        description: row.description,
        level: row.level,
        assignee_id: row.assignee_id,
        due_at: toCst(row.due_at),
        status: row.status,
        updated_at: toCst(row.updated_at),
      };
    });
    return okJson(c, data);
  },
);

hazards.get("/hazards/:id", async (c) => {
  const id = c.req.param("id");
  if (!positiveId.safeParse(id).success) {
    throw new ApiError(400, "invalid_id");
  }
  const { rows } = await c.var.db.query(
    `SELECT h.id, h.hazard_no, h.room_id, r.name AS room_name, h.inspection_id, h.inspection_item_id,
       h.description, h.level, h.photo_keys, h.assignee_id, h.created_by, h.due_at, h.status,
       h.closed_at, h.created_at, h.updated_at, h.status_history, h.remind_count, h.last_reminded_at,
       (h.status <> '已闭环' AND h.due_at < now()) AS overdue
     FROM hazards h
     LEFT JOIN rooms r ON r.id = h.room_id
     WHERE h.id = $1`,
    [id],
  );
  if (!rows[0]) {
    throw new ApiError(404, "not_found");
  }
  const hazard = rows[0];
  const history: StatusHistoryEntry[] = Array.isArray(hazard.status_history)
    ? (hazard.status_history as StatusHistoryEntry[])
    : [];
  return okJson(c, {
    ...hazard,
    due_at: toCst(hazard.due_at),
    closed_at: toCst(hazard.closed_at),
    created_at: toCst(hazard.created_at),
    updated_at: toCst(hazard.updated_at),
    last_reminded_at: toCst(hazard.last_reminded_at),
    escalated_level: hazard.overdue ? escalateLevel(hazard.level) : hazard.level,
    status_history: history.map((entry) => ({ ...entry, at: toCst(entry.at) ?? entry.at })),
  });
});

hazards.patch(
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
    const operatorId = resolveActorId(c, body.operator_id);
    const data = await withTransaction(c, async (client) => {
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
        due_at: toCst(hazard.due_at),
        closed_at: toCst(hazard.closed_at),
        updated_at: toCst(hazard.updated_at),
      };
      if (duplicated || hazard.status === body.status) {
        return duplicated ? { ...current, duplicated: true } : current;
      }
      if (!(allowedTransitions[hazard.status as string] ?? []).includes(body.status)) {
        throw new ApiError(409, "invalid_status_transition");
      }
      const { rows: clock } = await client.query(`SELECT now() AS at`);
      const at = clock[0].at as Date;
      const atCst = toCst(at) as string;
      const { rows: updated } = await client.query(
        `UPDATE hazards
         SET status = $1, closed_at = $2, status_history = $3, updated_at = $5
         WHERE id = $4
         RETURNING id, hazard_no, status, due_at, closed_at, updated_at`,
        [
          body.status,
          body.status === "已闭环" ? at : null,
          JSON.stringify([
            ...history,
            {
              status: body.status,
              at: atCst,
              operator_id: operatorId,
              note: body.note ?? null,
              client_uuid: body.client_uuid,
            },
          ]),
          id,
          at,
        ],
      );
      const updatedRow = updated[0];
      return {
        ...updatedRow,
        due_at: toCst(updatedRow.due_at),
        closed_at: toCst(updatedRow.closed_at),
        updated_at: toCst(updatedRow.updated_at),
      };
    });
    return okJson(c, data);
  },
);

hazards.post(
  "/hazards/:id/remind",
  zValidator("json", remindSchema, (result) => {
    if (!result.success) throw new ApiError(400, "validation_error", result.error.issues);
  }),
  async (c) => {
    const id = c.req.param("id");
    if (!positiveId.safeParse(id).success) {
      throw new ApiError(400, "invalid_id");
    }
    const body = c.req.valid("json");
    const operatorId = resolveActorId(c, body.operator_id);
    const data = await withTransaction(c, async (client) => {
      const { rows } = await client.query(
        `SELECT id, hazard_no, status, status_history, remind_count, last_reminded_at, updated_at
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
      const replay = history.find(
        (entry) => entry?.client_uuid === body.client_uuid && entry?.action === "remind",
      );
      if (replay) {
        return {
          id: hazard.id,
          hazard_no: hazard.hazard_no,
          status: hazard.status,
          remind_count: hazard.remind_count,
          last_reminded_at: toCst(hazard.last_reminded_at),
          updated_at: toCst(hazard.updated_at),
          duplicated: true,
        };
      }
      if (hazard.status === "已闭环") {
        throw new ApiError(409, "invalid_status_transition");
      }
      const { rows: clock } = await client.query(`SELECT now() AS at`);
      const at = clock[0].at as Date;
      const atCst = toCst(at) as string;
      const { rows: updated } = await client.query(
        `UPDATE hazards
         SET remind_count = remind_count + 1, last_reminded_at = $2,
             status_history = $3, updated_at = $2
         WHERE id = $1
         RETURNING id, hazard_no, status, remind_count, last_reminded_at, updated_at`,
        [
          id,
          at,
          JSON.stringify([
            ...history,
            {
              status: hazard.status,
              at: atCst,
              operator_id: operatorId,
              note: body.note ?? null,
              client_uuid: body.client_uuid,
              action: "remind",
            },
          ]),
        ],
      );
      const row = updated[0];
      return {
        id: row.id,
        hazard_no: row.hazard_no,
        status: row.status,
        remind_count: row.remind_count,
        last_reminded_at: toCst(row.last_reminded_at),
        updated_at: toCst(row.updated_at),
      };
    });
    return okJson(c, data);
  },
);

export default hazards;
