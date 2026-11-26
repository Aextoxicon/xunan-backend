import { Hono } from "hono";
import { ApiError, okJson } from "../lib/http.js";
import { toCst } from "../lib/time.js";
import { itemsForRoom } from "../lib/catalog.js";
import { positiveId } from "../lib/validation.js";
import type { AppEnv } from "../lib/env.js";

const catalog = new Hono<AppEnv>();

catalog.get("/rooms", async (c) => {
  const { rows } = await c.var.db.query(
    `SELECT r.id, r.code, r.name, r.location, r.active,
       r.latitude, r.longitude, r.radius_m, r.inspection_cycle_days, r.check_item_codes,
       (SELECT MAX(i.inspected_at) FROM inspections i WHERE i.room_id = r.id) AS last_inspected_at,
       EXISTS (
         SELECT 1 FROM inspections i
         WHERE i.room_id = r.id
           AND (i.inspected_at AT TIME ZONE 'Asia/Shanghai')::date = (now() AT TIME ZONE 'Asia/Shanghai')::date
       ) AS inspected_today
     FROM rooms r
     ORDER BY r.id`,
  );
  const now = Date.now();
  return okJson(c, {
    rooms: rows.map((row) => {
      const cycleDays = Number(row.inspection_cycle_days ?? 7);
      const last = row.last_inspected_at as Date | null;
      const dueAt = last ? new Date(last.getTime() + cycleDays * 24 * 60 * 60 * 1000) : null;
      return {
        ...row,
        latitude: row.latitude === null ? null : Number(row.latitude),
        longitude: row.longitude === null ? null : Number(row.longitude),
        last_inspected_at: toCst(last),
        cycle_due: dueAt ? dueAt.getTime() <= now : true,
        cycle_due_at: toCst(dueAt),
      };
    }),
  });
});

catalog.get("/check-items", async (c) => {
  const roomId = c.req.query("room_id");
  if (!positiveId.safeParse(roomId ?? "").success) {
    throw new ApiError(400, "validation_error");
  }
  const { rows } = await c.var.db.query(`SELECT id, check_item_codes FROM rooms WHERE id = $1`, [roomId]);
  if (!rows[0]) {
    throw new ApiError(404, "not_found");
  }
  const codes = (rows[0].check_item_codes as string[] | null) ?? [];
  return okJson(c, { room_id: roomId, items: itemsForRoom(codes), scope: codes.length ? "room" : "global" });
});

catalog.get("/users", async (c) => {
  const { rows } = await c.var.db.query(`SELECT id, name, role FROM users ORDER BY id`);
  return okJson(c, { users: rows });
});

export default catalog;
