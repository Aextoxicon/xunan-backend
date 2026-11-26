-- 一次性迁移：把已有的 timestamp without time zone 列改为 timestamptz(3)
-- 旧库里的墙钟值本来是按 UTC 写入的，所以用 AT TIME ZONE 'UTC' 解释后转成瞬时值
-- 可重复执行：只处理仍为 timestamp without time zone 的列

DO $$
DECLARE
  target record;
BEGIN
  FOR target IN
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
      AND column_name IN ('created_at', 'updated_at', 'inspected_at', 'due_at', 'closed_at')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE TIMESTAMPTZ(3) USING %I AT TIME ZONE ''UTC''',
      target.table_name, target.column_name, target.column_name
    );
  END LOOP;
END $$;
