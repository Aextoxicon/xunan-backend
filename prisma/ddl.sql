-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE IF NOT EXISTS "users" (
    "id" BIGSERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "password_hash" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "rooms" (
    "id" BIGSERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "radius_m" INTEGER,
    "inspection_cycle_days" INTEGER NOT NULL DEFAULT 7,
    "check_item_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inspections" (
    "id" BIGSERIAL NOT NULL,
    "client_uuid" TEXT NOT NULL,
    "record_no" TEXT NOT NULL,
    "room_id" BIGINT NOT NULL,
    "inspector_id" BIGINT NOT NULL,
    "inspected_at" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "score" DECIMAL(5,1),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "inspection_items" (
    "id" BIGSERIAL NOT NULL,
    "inspection_id" BIGINT NOT NULL,
    "item_code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item_name" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "photo_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "remark" TEXT,

    CONSTRAINT "inspection_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "hazards" (
    "id" BIGSERIAL NOT NULL,
    "client_uuid" TEXT NOT NULL,
    "hazard_no" TEXT NOT NULL,
    "room_id" BIGINT NOT NULL,
    "inspection_id" BIGINT,
    "inspection_item_id" BIGINT,
    "description" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "photo_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "assignee_id" BIGINT NOT NULL,
    "due_at" TIMESTAMPTZ(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT '待整改',
    "closed_at" TIMESTAMPTZ(3),
    "created_by" BIGINT NOT NULL,
    "status_history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remind_count" INTEGER NOT NULL DEFAULT 0,
    "last_reminded_at" TIMESTAMPTZ(3),

    CONSTRAINT "hazards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_name_key" ON "users"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "rooms_code_key" ON "rooms"("code");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "inspections_client_uuid_key" ON "inspections"("client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "inspections_record_no_key" ON "inspections"("record_no");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inspections_room_id_idx" ON "inspections"("room_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inspections_inspected_at_idx" ON "inspections"("inspected_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "inspection_items_inspection_id_idx" ON "inspection_items"("inspection_id");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "hazards_client_uuid_key" ON "hazards"("client_uuid");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "hazards_hazard_no_key" ON "hazards"("hazard_no");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazards_room_id_idx" ON "hazards"("room_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazards_inspection_id_idx" ON "hazards"("inspection_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazards_assignee_id_idx" ON "hazards"("assignee_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazards_status_idx" ON "hazards"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "hazards_due_at_idx" ON "hazards"("due_at");

-- AddForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_room_id_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT IF EXISTS "inspections_inspector_id_fkey";
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_inspector_id_fkey" FOREIGN KEY ("inspector_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_items" DROP CONSTRAINT IF EXISTS "inspection_items_inspection_id_fkey";
ALTER TABLE "inspection_items" ADD CONSTRAINT "inspection_items_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_room_id_fkey";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_inspection_id_fkey";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_inspection_id_fkey" FOREIGN KEY ("inspection_id") REFERENCES "inspections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_inspection_item_id_fkey";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_inspection_item_id_fkey" FOREIGN KEY ("inspection_item_id") REFERENCES "inspection_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_assignee_id_fkey";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hazards" DROP CONSTRAINT IF EXISTS "hazards_created_by_fkey";
ALTER TABLE "hazards" ADD CONSTRAINT "hazards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

