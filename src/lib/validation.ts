import { z } from "zod";

export const clientUuid = z.string().min(8).max(64);
export const positiveId = z.string().regex(/^[1-9]\d*$/);
export const positiveInt = z.number().int().positive();
export const dateField = z.string().datetime({ offset: true });

export const statusField = z.enum(["待整改", "整改中", "待验收", "已闭环"]);
export const levelField = z.enum(["一般", "较大", "重大"]);
