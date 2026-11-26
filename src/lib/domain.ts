import type { Client } from "pg";

export const allowedTransitions: Record<string, string[]> = {
  待整改: ["整改中"],
  整改中: ["待验收"],
  待验收: ["已闭环"],
  已闭环: [],
};

export const levelOrder = ["一般", "较大", "重大"] as const;

export function escalateLevel(level: string): string {
  const index = levelOrder.indexOf(level as (typeof levelOrder)[number]);
  return index >= 0 && index < levelOrder.length - 1 ? levelOrder[index + 1] : level;
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

export type RoomRow = {
  id: string;
  code: string;
  name: string;
  location: string | null;
  latitude: string | null;
  longitude: string | null;
  radius_m: number | null;
  inspection_cycle_days: number;
  check_item_codes: string[] | null;
};

export async function fetchRoom(client: Client, roomId: string): Promise<RoomRow | undefined> {
  const { rows } = await client.query(
    `SELECT id, code, name, location, latitude, longitude, radius_m, inspection_cycle_days, check_item_codes
     FROM rooms WHERE id = $1`,
    [roomId],
  );
  return rows[0];
}

export type StatusHistoryEntry = {
  status: string;
  at: string;
  operator_id?: string;
  note?: string | null;
  client_uuid?: string;
  action?: string;
  changes?: Record<string, unknown>;
  duplicated?: boolean;
};
