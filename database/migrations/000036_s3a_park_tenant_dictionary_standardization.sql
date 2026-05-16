ALTER TABLE biz_park_tenant
  ALTER COLUMN status SET DEFAULT '10';

UPDATE biz_park_tenant
SET status = CASE status
    WHEN 'pending' THEN '10'
    WHEN 'active' THEN '20'
    WHEN 'exited' THEN '30'
    WHEN 'disabled' THEN '40'
    ELSE status
  END,
  tenant_type = CASE tenant_type
    WHEN 'company' THEN '10'
    WHEN 'individual' THEN '10'
    WHEN 'institution' THEN '10'
    ELSE tenant_type
  END,
  risk_level = CASE risk_level
    WHEN 'low' THEN '10'
    WHEN 'medium' THEN '20'
    WHEN 'high' THEN '40'
    WHEN 'critical' THEN '40'
    ELSE risk_level
  END,
  industry_code = CASE industry_code
    WHEN 'digital_economy' THEN 'tech'
    WHEN 'advanced_manufacturing' THEN 'manufacturing'
    WHEN 'biomedicine' THEN 'tech'
    WHEN 'modern_service' THEN 'general'
    WHEN 'culture_creative' THEN 'trade'
    ELSE industry_code
  END,
  update_time = now()
WHERE is_deleted = false
  AND (
    status IN ('pending', 'active', 'exited', 'disabled')
    OR tenant_type IN ('company', 'individual', 'institution')
    OR risk_level IN ('low', 'medium', 'high', 'critical')
    OR industry_code IN ('digital_economy', 'advanced_manufacturing', 'biomedicine', 'modern_service', 'culture_creative')
  );

UPDATE biz_park_tenant_risk_log
SET before_risk_level = CASE before_risk_level
    WHEN 'low' THEN '10'
    WHEN 'medium' THEN '20'
    WHEN 'high' THEN '40'
    WHEN 'critical' THEN '40'
    ELSE before_risk_level
  END,
  after_risk_level = CASE after_risk_level
    WHEN 'low' THEN '10'
    WHEN 'medium' THEN '20'
    WHEN 'high' THEN '40'
    WHEN 'critical' THEN '40'
    ELSE after_risk_level
  END,
  update_time = now()
WHERE is_deleted = false
  AND (
    before_risk_level IN ('low', 'medium', 'high', 'critical')
    OR after_risk_level IN ('low', 'medium', 'high', 'critical')
  );
