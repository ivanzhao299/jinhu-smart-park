-- canteen_module_rollback.sql
-- 000322_canteen_module.sql 的回滚脚本：按反向依赖 DROP 全部 17 张 biz_canteen_* 表。
-- 用法（在隔离的 canteen-dev-pg 上）：
--   psql -h 127.0.0.1 -p 55432 -U jinhu -d jinhu_smart_park -v ON_ERROR_STOP=1 -f scripts/sql/canteen_module_rollback.sql
-- 说明：仅回滚 M0 数据表；sys_module/sys_permission 等 RBAC 种子为幂等注册，不在此 DROP。

BEGIN;

DROP TABLE IF EXISTS biz_canteen_status_logs CASCADE;
DROP TABLE IF EXISTS biz_canteen_settlement_items CASCADE;
DROP TABLE IF EXISTS biz_canteen_settlements CASCADE;
DROP TABLE IF EXISTS biz_canteen_refunds CASCADE;
DROP TABLE IF EXISTS biz_canteen_meal_records CASCADE;
DROP TABLE IF EXISTS biz_canteen_wallet_txns CASCADE;
DROP TABLE IF EXISTS biz_canteen_subsidy_grants CASCADE;
DROP TABLE IF EXISTS biz_canteen_wallets CASCADE;
DROP TABLE IF EXISTS biz_canteen_payments CASCADE;
DROP TABLE IF EXISTS biz_canteen_order_items CASCADE;
DROP TABLE IF EXISTS biz_canteen_orders CASCADE;
DROP TABLE IF EXISTS biz_canteen_cashier_sessions CASCADE;
DROP TABLE IF EXISTS biz_canteen_qr_codes CASCADE;
DROP TABLE IF EXISTS biz_canteen_dishes CASCADE;
DROP TABLE IF EXISTS biz_canteen_categories CASCADE;
DROP TABLE IF EXISTS biz_canteen_outlets CASCADE;
DROP TABLE IF EXISTS biz_canteen_settings CASCADE;

COMMIT;
