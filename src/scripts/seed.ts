import "dotenv/config";
import { Pool } from "pg";
import { hashPassword } from "../lib/password.js";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const demoPassword = "xunan2026";

const rooms = [
  { code: "XN-01", name: "电子实训室", location: "实训楼 3 层", latitude: 30.123456, longitude: 120.654321, radius_m: 200, inspection_cycle_days: 7, check_item_codes: ["elec.socket", "fire.extinguisher", "chemical.cabinet", "equipment.grounding"] },
  { code: "XN-02", name: "机电实训室", location: "实训楼 3 层", latitude: 30.223456, longitude: 120.754321, radius_m: 200, inspection_cycle_days: 7, check_item_codes: ["elec.socket", "fire.extinguisher", "equipment.grounding"] },
  { code: "XN-03", name: "汽车实训室", location: "实训楼 1 层", latitude: 30.323456, longitude: 120.854321, radius_m: 200, inspection_cycle_days: 14, check_item_codes: ["elec.socket", "fire.extinguisher", "equipment.grounding"] },
  { code: "XN-04", name: "化工实训室", location: "实训楼 2 层", latitude: 30.423456, longitude: 120.954321, radius_m: 200, inspection_cycle_days: 7, check_item_codes: ["elec.socket", "fire.extinguisher", "chemical.cabinet"] },
  { code: "XN-05", name: "数控实训室", location: "实训楼 4 层", latitude: 30.523456, longitude: 121.054321, radius_m: 200, inspection_cycle_days: 14, check_item_codes: ["elec.socket", "equipment.grounding"] },
  { code: "XN-06", name: "网络实训室", location: "实训楼 4 层", latitude: 30.623456, longitude: 121.154321, radius_m: 200, inspection_cycle_days: 30, check_item_codes: ["elec.socket", "equipment.grounding"] },
  { code: "XN-07", name: "烹饪实训室", location: "实训楼 1 层", latitude: 30.723456, longitude: 121.254321, radius_m: 200, inspection_cycle_days: 7, check_item_codes: ["elec.socket", "fire.extinguisher"] },
  { code: "XN-08", name: "焊接实训室", location: "实训楼 2 层", latitude: 30.823456, longitude: 121.354321, radius_m: 200, inspection_cycle_days: 14, check_item_codes: ["elec.socket", "fire.extinguisher", "equipment.grounding"] },
  { code: "XN-09", name: "物流实训室", location: "实训楼 1 层", latitude: 30.923456, longitude: 121.454321, radius_m: 200, inspection_cycle_days: 30, check_item_codes: ["elec.socket"] },
  { code: "XN-10", name: "财会实训室", location: "实训楼 5 层", latitude: 31.023456, longitude: 121.554321, radius_m: 200, inspection_cycle_days: 30, check_item_codes: ["elec.socket", "fire.extinguisher"] },
  { code: "XN-11", name: "BIM实训室", location: "实训楼 5 层", latitude: 31.123456, longitude: 121.654321, radius_m: 200, inspection_cycle_days: 14, check_item_codes: ["elec.socket", "equipment.grounding"] },
  { code: "XN-12", name: "工业机器人实训室", location: "实训楼 2 层", latitude: 31.223456, longitude: 121.754321, radius_m: 200, inspection_cycle_days: 7, check_item_codes: ["elec.socket", "fire.extinguisher", "equipment.grounding"] },
];

const users = [
  { name: "李文斌", role: "inspector" },
  { name: "王思远", role: "admin" },
  { name: "陈志强", role: "inspector" },
];

const checkItems = [
  { item_code: "elec.socket", category: "用电", item_name: "插座与线路无破损" },
  { item_code: "fire.extinguisher", category: "消防", item_name: "灭火器压力正常" },
  { item_code: "chemical.cabinet", category: "危化品", item_name: "危化品柜双人双锁" },
  { item_code: "equipment.grounding", category: "设备", item_name: "设备接地可靠" },
];

type SeedItem = {
  item_code: string;
  result: "normal" | "abnormal" | "na";
  photo_keys?: string[];
  remark?: string;
};

type SeedInspection = {
  room_index: number;
  inspector_index: number;
  days_ago: number;
  hour: number;
  items: SeedItem[];
};

const inspections: SeedInspection[] = [
  {
    room_index: 0,
    inspector_index: 0,
    days_ago: 6,
    hour: 9,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "normal" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    room_index: 1,
    inspector_index: 2,
    days_ago: 5,
    hour: 14,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "abnormal", photo_keys: ["seed-fire-01.jpg"], remark: "压力表指针低于红区" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    room_index: 2,
    inspector_index: 0,
    days_ago: 4,
    hour: 10,
    items: [
      { item_code: "elec.socket", result: "abnormal", photo_keys: ["seed-elec-01.jpg"], remark: "配电箱外壳破损" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "abnormal", photo_keys: ["seed-chem-01.jpg"], remark: "柜门锁损坏" },
      { item_code: "equipment.grounding", result: "na" },
    ],
  },
  {
    room_index: 3,
    inspector_index: 1,
    days_ago: 3,
    hour: 9,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "abnormal", photo_keys: ["seed-chem-02.jpg"], remark: "双人双锁记录缺失" },
    ],
  },
  {
    room_index: 4,
    inspector_index: 0,
    days_ago: 2,
    hour: 15,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    room_index: 5,
    inspector_index: 2,
    days_ago: 1,
    hour: 10,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "equipment.grounding", result: "abnormal", photo_keys: ["seed-ground-01.jpg"], remark: "接地线松脱" },
    ],
  },
  {
    room_index: 0,
    inspector_index: 1,
    days_ago: 0,
    hour: 8,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "normal" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    room_index: 6,
    inspector_index: 0,
    days_ago: 0,
    hour: 11,
    items: [
      { item_code: "elec.socket", result: "abnormal", photo_keys: ["seed-elec-02.jpg"], remark: "插座面板松动" },
      { item_code: "fire.extinguisher", result: "normal" },
    ],
  },
];

type SeedHazard = {
  room_index: number;
  inspection_index: number;
  item_code?: string;
  description: string;
  level: string;
  photo_keys: string[];
  assignee_index: number;
  created_by_index: number;
  due_in_days: number;
  status: string;
  remind?: number;
  transitions?: number;
};

const hazards: SeedHazard[] = [
  {
    room_index: 1,
    inspection_index: 1,
    item_code: "fire.extinguisher",
    description: "灭火器压力不足，已过期未更换",
    level: "较大",
    photo_keys: ["seed-fire-01.jpg"],
    assignee_index: 0,
    created_by_index: 2,
    due_in_days: 5,
    status: "待整改",
  },
  {
    room_index: 2,
    inspection_index: 2,
    item_code: "elec.socket",
    description: "配电箱外壳破损，存在漏电风险",
    level: "重大",
    photo_keys: ["seed-elec-01.jpg"],
    assignee_index: 0,
    created_by_index: 0,
    due_in_days: 3,
    status: "整改中",
    transitions: 1,
  },
  {
    room_index: 3,
    inspection_index: 3,
    item_code: "chemical.cabinet",
    description: "危化品柜门锁损坏，需双人双锁",
    level: "一般",
    photo_keys: ["seed-chem-02.jpg"],
    assignee_index: 2,
    created_by_index: 1,
    due_in_days: 2,
    status: "待验收",
    transitions: 2,
  },
  {
    room_index: 4,
    inspection_index: 4,
    description: "设备接地线松脱",
    level: "一般",
    photo_keys: ["seed-ground-01.jpg"],
    assignee_index: 1,
    created_by_index: 0,
    due_in_days: -2,
    status: "已闭环",
    transitions: 3,
  },
  {
    room_index: 0,
    inspection_index: 0,
    description: "插座面板松动，存在触电风险",
    level: "一般",
    photo_keys: ["seed-elec-03.jpg"],
    assignee_index: 1,
    created_by_index: 0,
    due_in_days: -1,
    status: "待整改",
    remind: 1,
  },
  {
    room_index: 5,
    inspection_index: 5,
    item_code: "equipment.grounding",
    description: "网络机柜接地线松脱",
    level: "较大",
    photo_keys: ["seed-ground-02.jpg"],
    assignee_index: 1,
    created_by_index: 2,
    due_in_days: -3,
    status: "待整改",
    remind: 2,
  },
  {
    room_index: 2,
    inspection_index: 2,
    item_code: "chemical.cabinet",
    description: "消防通道堆放杂物，影响疏散",
    level: "重大",
    photo_keys: ["seed-chem-03.jpg"],
    assignee_index: 0,
    created_by_index: 0,
    due_in_days: 1,
    status: "整改中",
    transitions: 1,
  },
  {
    room_index: 6,
    inspection_index: 7,
    item_code: "elec.socket",
    description: "燃气软管老化，建议更换",
    level: "较大",
    photo_keys: ["seed-gas-01.jpg"],
    assignee_index: 2,
    created_by_index: 0,
    due_in_days: 2,
    status: "整改中",
    transitions: 1,
  },
  {
    room_index: 1,
    inspection_index: 1,
    description: "灭火器箱被杂物遮挡",
    level: "一般",
    photo_keys: ["seed-fire-02.jpg"],
    assignee_index: 1,
    created_by_index: 2,
    due_in_days: -5,
    status: "待验收",
    transitions: 2,
  },
  {
    room_index: 3,
    inspection_index: 3,
    description: "化学品标签缺失，无法识别",
    level: "一般",
    photo_keys: ["seed-chem-04.jpg"],
    assignee_index: 2,
    created_by_index: 1,
    due_in_days: -3,
    status: "已闭环",
    transitions: 3,
  },
];

function at(daysAgo: number, hour: number, minute = 0): Date {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function dayTag(daysAgo: number): string {
  return at(daysAgo, 12).toISOString().slice(0, 10).replaceAll("-", "");
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "TRUNCATE hazards, inspection_items, inspections, rooms, users RESTART IDENTITY CASCADE",
    );

    const roomIds: string[] = [];
    for (const room of rooms) {
      const { rows } = await client.query(
        `INSERT INTO rooms
           (code, name, location, latitude, longitude, radius_m, inspection_cycle_days, check_item_codes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [
          room.code,
          room.name,
          room.location,
          room.latitude,
          room.longitude,
          room.radius_m,
          room.inspection_cycle_days,
          room.check_item_codes,
        ],
      );
      roomIds.push(rows[0].id);
    }

    const userIds: string[] = [];
    const passwordHash = await hashPassword(demoPassword);
    for (const user of users) {
      const { rows } = await client.query(
        `INSERT INTO users (name, role, password_hash) VALUES ($1, $2, $3) RETURNING id`,
        [user.name, user.role, passwordHash],
      );
      userIds.push(rows[0].id);
    }

    const inspectionIds: string[] = [];
    const itemIdsByInspection: Map<string, string>[] = [];
    const dayCounters = new Map<string, number>();

    for (const inspection of inspections) {
      const tag = dayTag(inspection.days_ago);
      const seq = (dayCounters.get(tag) ?? 0) + 1;
      dayCounters.set(tag, seq);
      const applicable = inspection.items.filter((item) => item.result !== "na").length;
      const normal = inspection.items.filter((item) => item.result === "normal").length;
      const score = applicable ? Math.round((normal / applicable) * 1000) / 10 : null;
      const inspectedAt = at(inspection.days_ago, inspection.hour);
      const { rows } = await client.query(
        `INSERT INTO inspections
           (client_uuid, record_no, room_id, inspector_id, inspected_at, latitude, longitude, score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          `seed-inspection-${String(inspectionIds.length + 1).padStart(4, "0")}`,
          `XJ-${tag}-${String(seq).padStart(4, "0")}`,
          roomIds[inspection.room_index],
          userIds[inspection.inspector_index],
          inspectedAt,
          rooms[inspection.room_index].latitude,
          rooms[inspection.room_index].longitude,
          score,
        ],
      );
      const inspectionId = rows[0].id;
      inspectionIds.push(inspectionId);
      const itemIds = new Map<string, string>();
      for (const item of inspection.items) {
        const config = checkItems.find((entry) => entry.item_code === item.item_code);
        const inserted = await client.query(
          `INSERT INTO inspection_items
             (inspection_id, item_code, category, item_name, result, photo_keys, remark)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id`,
          [
            inspectionId,
            item.item_code,
            config?.category ?? "",
            config?.item_name ?? "",
            item.result,
            item.photo_keys ?? [],
            item.remark ?? null,
          ],
        );
        itemIds.set(item.item_code, inserted.rows[0].id);
      }
      itemIdsByInspection.push(itemIds);
    }

    const hazardCounters = new Map<string, number>();
    for (const [index, hazard] of hazards.entries()) {
      const inspection = inspections[hazard.inspection_index];
      const created = at(inspection.days_ago, 9, (index * 7) % 60);
      const tag = dayTag(inspection.days_ago);
      const seq = (hazardCounters.get(tag) ?? 0) + 1;
      hazardCounters.set(tag, seq);
      const dueAt = at(-hazard.due_in_days, 18);
      const history: { status: string; at: string; operator_id: string; note: string | null; action?: string }[] = [
        { status: "待整改", at: created.toISOString(), operator_id: userIds[hazard.created_by_index], note: null },
      ];
      if ((hazard.transitions ?? 0) >= 1) {
        history.push({ status: "整改中", at: addHours(created, 6).toISOString(), operator_id: userIds[hazard.assignee_index], note: "已安排整改" });
      }
      if ((hazard.transitions ?? 0) >= 2) {
        history.push({ status: "待验收", at: addHours(created, 30).toISOString(), operator_id: userIds[hazard.assignee_index], note: "整改完成，申请验收" });
      }
      if ((hazard.transitions ?? 0) >= 3) {
        history.push({ status: "已闭环", at: addHours(created, 48).toISOString(), operator_id: userIds[1], note: "验收通过" });
      }
      for (let remind = 0; remind < (hazard.remind ?? 0); remind += 1) {
        history.push({
          status: hazard.status,
          at: addHours(created, 8 + remind * 4).toISOString(),
          operator_id: userIds[1],
          note: "请尽快处理",
          action: "remind",
        });
      }
      const closedEvent = history.find((entry) => entry.status === "已闭环");
      const lastEvent = history[history.length - 1];
      const itemId = hazard.item_code
        ? itemIdsByInspection[hazard.inspection_index]?.get(hazard.item_code) ?? null
        : null;
      await client.query(
        `INSERT INTO hazards
           (client_uuid, hazard_no, room_id, inspection_id, inspection_item_id,
            description, level, photo_keys, assignee_id, created_by, due_at,
            status, closed_at, status_history, remind_count, last_reminded_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
        [
          `seed-hazard-${String(index + 1).padStart(4, "0")}`,
          `HZ-${tag}-${String(seq).padStart(4, "0")}`,
          roomIds[hazard.room_index],
          inspectionIds[hazard.inspection_index],
          itemId,
          hazard.description,
          hazard.level,
          hazard.photo_keys,
          userIds[hazard.assignee_index],
          userIds[hazard.created_by_index],
          dueAt,
          hazard.status,
          closedEvent ? new Date(closedEvent.at) : null,
          JSON.stringify(history),
          hazard.remind ?? 0,
          hazard.remind ? new Date(history.filter((entry) => entry.action === "remind").at(-1)?.at ?? created) : null,
          created,
          new Date(lastEvent.at),
        ],
      );
    }

    await client.query("COMMIT");
    console.log(
      `seed done: ${rooms.length} rooms, ${users.length} users (password: ${demoPassword}), ` +
        `${inspections.length} inspections, ${hazards.length} hazards`,
    );
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

await main();
