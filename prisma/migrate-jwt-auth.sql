-- JWT登录：users增加口令哈希列（PBKDF2-SHA256）
-- 可重复执行；执行后跑npm run db:seed写入演示口令

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
