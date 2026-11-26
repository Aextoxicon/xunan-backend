-- Prisma 不支持 CHECK 约束
-- 执行npm run db:constraints

ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_role_check";
ALTER TABLE "users" ADD CONSTRAINT "users_role_check" CHECK ("role" IN ('inspector', 'admin'));

ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_score_check";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100));
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_latitude_check";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_latitude_check" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_longitude_check";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_longitude_check" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));

ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS "inspection_items_result_check";
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_result_check" CHECK ("result" IN ('normal', 'abnormal', 'na'));
ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS "inspection_items_photo_check";
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_photo_check" CHECK ("result" <> 'abnormal' OR cardinality("photo_keys") > 0);
ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS "inspection_items_remark_check";
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_remark_check" CHECK ("remark" IS NULL OR char_length("remark") <= 500);

ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_level_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_level_check" CHECK ("level" IN ('一般', '较大', '重大'));
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_status_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_status_check" CHECK ("status" IN ('待整改', '整改中', '待验收', '已闭环'));
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_photo_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_photo_check" CHECK (cardinality("photo_keys") > 0);
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_description_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_description_check" CHECK (char_length("description") BETWEEN 1 AND 2000);
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_closed_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_closed_check" CHECK (("status" = '已闭环') = ("closed_at" IS NOT NULL));

ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_radius_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_radius_check" CHECK ("radius_m" IS NULL OR "radius_m" > 0);
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_latitude_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_latitude_check" CHECK ("latitude" IS NULL OR ("latitude" >= -90 AND "latitude" <= 90));
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_longitude_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_longitude_check" CHECK ("longitude" IS NULL OR ("longitude" >= -180 AND "longitude" <= 180));
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_cycle_check";
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cycle_check" CHECK ("inspection_cycle_days" BETWEEN 1 AND 365);

ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_remind_count_check";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_remind_count_check" CHECK ("remind_count" >= 0);
