ALTER TABLE IF EXISTS biz_iot_device
  ALTER COLUMN device_secret TYPE text;

ALTER TABLE IF EXISTS biz_iot_alert_rule
  ADD COLUMN IF NOT EXISTS code varchar(64);

ALTER TABLE IF EXISTS biz_iot_alert
  ADD COLUMN IF NOT EXISTS handle_note text,
  ADD COLUMN IF NOT EXISTS close_reason varchar(500);

ALTER TABLE IF EXISTS biz_iot_device_data
  ADD COLUMN IF NOT EXISTS quality varchar(32) NOT NULL DEFAULT 'good';

ALTER TABLE IF EXISTS biz_iot_device_latest
  ADD COLUMN IF NOT EXISTS quality varchar(32) NOT NULL DEFAULT 'good';

CREATE INDEX IF NOT EXISTS idx_biz_iot_device_data_quality
  ON biz_iot_device_data (tenant_id, park_id, quality, report_time)
  WHERE is_deleted = false;
