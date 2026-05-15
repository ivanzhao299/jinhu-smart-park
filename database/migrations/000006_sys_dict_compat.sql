CREATE OR REPLACE VIEW sys_dict AS
SELECT
  id,
  tenant_id,
  park_id,
  dict_code,
  dict_name,
  status,
  create_by,
  create_time,
  update_by,
  update_time,
  is_deleted,
  version,
  remark
FROM sys_dict_type;
