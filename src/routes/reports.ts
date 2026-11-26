import { Hono } from "hono";
import { z } from "zod";
import { ApiError, okJson } from "../lib/http.js";
import { toCst, weekStartCst } from "../lib/time.js";
import { dateField } from "../lib/validation.js";
import type { AppEnv } from "../lib/env.js";

const weeklyQuery = z.object({
  week_start: dateField.optional(),
});

const reports = new Hono<AppEnv>();

reports.get("/reports/weekly", async (c) => {
  const parsed = weeklyQuery.safeParse({ week_start: c.req.query("week_start") });
  if (!parsed.success) {
    throw new ApiError(400, "validation_error", parsed.error.issues);
  }
  const start = parsed.data.week_start ? new Date(parsed.data.week_start) : weekStartCst(new Date());
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  const range = [start, end];

  const { rows: inspectionRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS count,
       COALESCE(AVG(score), 0)::float AS avg_score,
       COUNT(*) FILTER (WHERE score < 60)::int AS low_score_count
     FROM inspections WHERE inspected_at >= $1 AND inspected_at < $2`,
    range,
  );
  const { rows: itemRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ii.result = 'abnormal')::int AS abnormal
     FROM inspection_items ii
     JOIN inspections i ON i.id = ii.inspection_id
     WHERE i.inspected_at >= $1 AND i.inspected_at < $2`,
    range,
  );
  const { rows: hazardRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS created,
       COUNT(*) FILTER (WHERE level = '重大')::int AS major,
       COUNT(*) FILTER (WHERE level = '较大')::int AS medium,
       COUNT(*) FILTER (WHERE level = '一般')::int AS minor,
       COUNT(*) FILTER (WHERE status <> '已闭环' AND due_at < now())::int AS overdue
     FROM hazards WHERE created_at >= $1 AND created_at < $2`,
    range,
  );
  const { rows: closedRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS closed FROM hazards WHERE closed_at >= $1 AND closed_at < $2`,
    range,
  );
  const { rows: totalRows } = await c.var.db.query(
    `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = '已闭环')::int AS closed FROM hazards`,
  );
  const { rows: topRooms } = await c.var.db.query(
    `SELECT h.room_id, r.name, COUNT(*)::int AS hazard_count
     FROM hazards h
     LEFT JOIN rooms r ON r.id = h.room_id
     WHERE h.created_at >= $1 AND h.created_at < $2
     GROUP BY h.room_id, r.name
     ORDER BY hazard_count DESC, h.room_id
     LIMIT 5`,
    range,
  );
  const { rows: topHazards } = await c.var.db.query(
    `SELECT h.id, h.hazard_no, h.room_id, r.name AS room_name, h.level, h.status, h.due_at,
       (h.status <> '已闭环' AND h.due_at < now()) AS overdue
     FROM hazards h
     LEFT JOIN rooms r ON r.id = h.room_id
     WHERE h.status <> '已闭环'
     ORDER BY (h.due_at < now()) DESC,
       CASE h.level WHEN '重大' THEN 0 WHEN '较大' THEN 1 ELSE 2 END,
       h.due_at
     LIMIT 5`,
  );
  const { rows: byCategory } = await c.var.db.query(
    `SELECT ii.category, COUNT(*)::int AS abnormal_count
     FROM inspection_items ii
     JOIN inspections i ON i.id = ii.inspection_id
     WHERE i.inspected_at >= $1 AND i.inspected_at < $2 AND ii.result = 'abnormal'
     GROUP BY ii.category
     ORDER BY abnormal_count DESC`,
    range,
  );

  const totalHazards = totalRows[0].total;
  return okJson(c, {
    range: { start: toCst(start), end: toCst(end) },
    summary: {
      inspection_count: inspectionRows[0].count,
      avg_score: Math.round(Number(inspectionRows[0].avg_score) * 10) / 10,
      low_score_count: inspectionRows[0].low_score_count,
      item_total: itemRows[0].total,
      abnormal_count: itemRows[0].abnormal,
      hazard_created: hazardRows[0].created,
      hazard_closed: closedRows[0].closed,
      overdue_now: hazardRows[0].overdue,
      closure_rate: totalHazards ? Math.round((totalRows[0].closed / totalHazards) * 10000) / 10000 : 0,
    },
    by_level: { 重大: hazardRows[0].major, 较大: hazardRows[0].medium, 一般: hazardRows[0].minor },
    by_category: byCategory,
    top_rooms: topRooms,
    top_hazards: topHazards.map((row) => ({
      ...row,
      due_at: toCst(row.due_at),
    })),
  });
});

export default reports;
