-- S9-B IoT runtime alert values can be numeric, boolean, enum, or text.
-- Older S6-A schema used numeric trigger_value, which breaks offline/status alerts.
DROP VIEW IF EXISTS iot_alert;

ALTER TABLE biz_iot_alert
  ALTER COLUMN trigger_value TYPE varchar(100) USING trigger_value::text;

CREATE VIEW iot_alert AS
SELECT *
FROM biz_iot_alert
WHERE is_deleted = false;
