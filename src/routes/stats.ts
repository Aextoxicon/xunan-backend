import { Hono } from "hono";
import { okJson } from "../lib/http.js";
import type { AppEnv } from "../lib/env.js";

const stats = new Hono<AppEnv>();

stats.get("/stats/overview", async (c) => {
  const { rows } = await c.var.db.query(
    `SELECT
       COUNT(*) FILTER (WHERE status <> '已闭环')::int AS pending_count,
       COUNT(*) FILTER (WHERE status <> '已闭环' AND due_at < now())::int AS overdue_count,
       COUNT(*) FILTER (WHERE status = '已闭环')::int AS closed_count,
       COUNT(*)::int AS total_count
     FROM hazards`,
  );
  const summary = rows[0];
  const { rows: roomRanking } = await c.var.db.query(
    `SELECT r.id AS room_id, r.name, COUNT(h.id)::int AS hazard_count
     FROM rooms r
     LEFT JOIN hazards h ON h.room_id = r.id
     GROUP BY r.id, r.name
     ORDER BY hazard_count DESC, r.id`,
  );
  const { rows: trend } = await c.var.db.query(
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

export default stats;
