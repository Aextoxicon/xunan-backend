import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

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

function iso(daysFromNow: number, hour = 9): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function dayTag(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

const inspections: {
  client_uuid: string;
  record_no: string;
  room_index: number;
  inspector_index: number;
  inspected_at: string;
  latitude: number;
  longitude: number;
  items: SeedItem[];
}[] = [
  {
    client_uuid: "seed-inspection-0001",
    record_no: `XJ-${dayTag(-2)}-0001`,
    room_index: 0,
    inspector_index: 0,
    inspected_at: iso(-2, 9),
    latitude: 30.123456,
    longitude: 120.654321,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "normal" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    client_uuid: "seed-inspection-0002",
    record_no: `XJ-${dayTag(-1)}-0001`,
    room_index: 1,
    inspector_index: 2,
    inspected_at: iso(-1, 14),
    latitude: 30.223456,
    longitude: 120.754321,
    items: [
      { item_code: "elec.socket", result: "normal" },
      { item_code: "fire.extinguisher", result: "abnormal", photo_keys: ["uploads/seed-fire-01.jpg"], remark: "压力表指针低于红区" },
      { item_code: "equipment.grounding", result: "normal" },
    ],
  },
  {
    client_uuid: "seed-inspection-0003",
    record_no: `XJ-${dayTag(0)}-0001`,
    room_index: 2,
    inspector_index: 0,
    inspected_at: iso(0, 10),
    latitude: 30.323456,
    longitude: 120.854321,
    items: [
      { item_code: "elec.socket", result: "abnormal", photo_keys: ["uploads/seed-elec-01.jpg"], remark: "配电箱外壳破损" },
      { item_code: "fire.extinguisher", result: "normal" },
      { item_code: "chemical.cabinet", result: "abnormal", photo_keys: ["uploads/seed-chem-01.jpg"], remark: "柜门锁损坏" },
      { item_code: "equipment.grounding", result: "na" },
    ],
  },
];

const hazards: {
  client_uuid: string;
  hazard_no: string;
  room_index: number;
  inspection_index: number;
  description: string;
  level: string;
  photo_keys: string[];
  assignee_index: number;
  created_by_index: number;
  due_at: string;
  status: string;
  closed_at: string | null;
  status_history: { status: string; at: string; operator_id: number; note: string | null }[];
}[] = [
  {
    client_uuid: "seed-hazard-0001",
    hazard_no: `HZ-${dayTag(-3)}-0001`,
    room_index: 1,
    inspection_index: 1,
    description: "灭火器压力不足，已过期未更换",
    level: "较大",
    photo_keys: ["uploads/seed-fire-01.jpg"],
    assignee_index: 0,
    created_by_index: 2,
    due_at: iso(-1, 18),
    status: "待整改",
    closed_at: null,
    status_history: [],
  },
  {
    client_uuid: "seed-hazard-0002",
    hazard_no: `HZ-${dayTag(0)}-0001`,
    room_index: 2,
    inspection_index: 2,
    description: "配电箱外壳破损，存在漏电风险",
    level: "重大",
    photo_keys: ["uploads/seed-elec-01.jpg"],
    assignee_index: 0,
    created_by_index: 0,
    due_at: iso(5, 18),
    status: "整改中",
    closed_at: null,
    status_history: [],
  },
  {
    client_uuid: "seed-hazard-0003",
    hazard_no: `HZ-${dayTag(-6)}-0001`,
    room_index: 0,
    inspection_index: 0,
    description: "危化品柜门锁损坏，需双人双锁",
    level: "一般",
    photo_keys: ["uploads/seed-chem-01.jpg"],
    assignee_index: 2,
    created_by_index: 0,
    due_at: iso(-4, 18),
    status: "已闭环",
    closed_at: iso(-2, 16),
    status_history: [],
  },
];

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
    for (const user of users) {
      const { rows } = await client.query(
        `INSERT INTO users (name, role) VALUES ($1, $2) RETURNING id`,
        [user.name, user.role],
      );
      userIds.push(rows[0].id);
    }
    const inspectionIds: string[] = [];
    for (const inspection of inspections) {
      const applicable = inspection.items.filter((item) => item.result !== "na").length;
      const normal = inspection.items.filter((item) => item.result === "normal").length;
      const score = applicable ? Math.round((normal / applicable) * 1000) / 10 : null;
      const { rows } = await client.query(
        `INSERT INTO inspections
          (client_uuid, record_no, room_id, inspector_id, inspected_at, latitude, longitude, score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          inspection.client_uuid,
          inspection.record_no,
          roomIds[inspection.room_index],
          userIds[inspection.inspector_index],
          inspection.inspected_at,
          inspection.latitude,
          inspection.longitude,
          score,
        ],
      );
      inspectionIds.push(rows[0].id);
      for (const item of inspection.items) {
        const config = checkItems.find((entry) => entry.item_code === item.item_code);
        await client.query(
          `INSERT INTO inspection_items
            (inspection_id, item_code, category, item_name, result, photo_keys, remark)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            rows[0].id,
            item.item_code,
            config?.category ?? "",
            config?.item_name ?? "",
            item.result,
            item.photo_keys ?? [],
            item.remark ?? null,
          ],
        );
      }
    }
    for (const hazard of hazards) {
      const history = [
        { status: "待整改", at: hazard.status_history[0]?.at ?? iso(-1, 9), operator_id: userIds[hazard.created_by_index], note: null },
        ...hazard.status_history,
      ];
      await client.query(
        `INSERT INTO hazards
          (client_uuid, hazard_no, room_id, inspection_id, description, level, photo_keys,
           assignee_id, created_by, due_at, status, closed_at, status_history)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          hazard.client_uuid,
          hazard.hazard_no,
          roomIds[hazard.room_index],
          inspectionIds[hazard.inspection_index],
          hazard.description,
          hazard.level,
          hazard.photo_keys,
          userIds[hazard.assignee_index],
          userIds[hazard.created_by_index],
          hazard.due_at,
          hazard.status,
          hazard.closed_at,
          JSON.stringify(history),
        ],
      );
    }
    await client.query("COMMIT");
    console.log(
      `seed done: ${rooms.length} rooms, ${users.length} users, ${inspections.length} inspections, ${hazards.length} hazards`,
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
