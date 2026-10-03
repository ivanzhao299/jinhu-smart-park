-- 000328_canteen_status_log_entity_expand.sql
-- M4 审计：放宽 biz_canteen_status_logs.entity_type CHECK，新增 session / dish 两类，
-- 使开/结班、菜品上下架动作可落入同一张审计表。
-- 前向：DROP + ADD（7 类）。down：还原为原 5 类（见文件尾/回滚脚本）。
BEGIN;

ALTER TABLE biz_canteen_status_logs
  DROP CONSTRAINT IF EXISTS ck_canteen_status_logs_entity_type;

ALTER TABLE biz_canteen_status_logs
  ADD CONSTRAINT ck_canteen_status_logs_entity_type
  CHECK (entity_type IN ('order','payment','settlement','grant','refund','session','dish'));

COMMIT;

-- [down] 还原：
-- ALTER TABLE biz_canteen_status_logs DROP CONSTRAINT IF EXISTS ck_canteen_status_logs_entity_type;
-- ALTER TABLE biz_canteen_status_logs
--   ADD CONSTRAINT ck_canteen_status_logs_entity_type
--   CHECK (entity_type IN ('order','payment','settlement','grant','refund'));
