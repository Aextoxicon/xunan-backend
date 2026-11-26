-- 执行前需清理重名用户
CREATE UNIQUE INDEX IF NOT EXISTS "users_name_key" ON "users"("name");
