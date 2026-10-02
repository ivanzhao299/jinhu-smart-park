-- 000034_canteen_settings_default.sql
-- 园区餐厅 M0：为默认租户/园区写入一行可配置设置默认值（幂等，production-safe，无密钥）。
-- 与 apps/api/src/modules/canteen/canteen-settings.service.ts 的 DEFAULT_CANTEEN_SETTINGS 保持一致。
-- 默认范围：tenant_id=10000001, park_id=20000001（S1 默认园区 JH）。新租户/园区由
-- CanteenSettingsService.getSettings 在读取时兜底返回默认值，无需在此预置。

INSERT INTO biz_canteen_settings (
  id, tenant_id, park_id,
  monthly_lunch_subsidy, grant_day, expiry_mode, expiry_day, expiry_time,
  eligible_rule, funds_company_account, settlement_day,
  management_fee_enabled, management_fee_rule,
  create_time, update_time, is_deleted, version
)
SELECT
  uuid_generate_v4(), '10000001', '20000001',
  300.00, 1, 'last_day', NULL, '23:59',
  '{"employee_type":"regular","status":"active"}'::jsonb, true, 1,
  false, NULL,
  now(), now(), false, 1
WHERE NOT EXISTS (
  SELECT 1 FROM biz_canteen_settings s
  WHERE s.tenant_id = '10000001' AND s.park_id = '20000001' AND s.is_deleted = false
);
