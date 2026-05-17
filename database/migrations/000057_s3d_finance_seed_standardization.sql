ALTER TABLE biz_leasing_receivable
  ALTER COLUMN status SET DEFAULT '20';

UPDATE biz_leasing_receivable
SET status = CASE status
  WHEN '10' THEN '20'
  WHEN '20' THEN '40'
  WHEN '30' THEN '50'
  WHEN '40' THEN '60'
  WHEN '45' THEN '70'
  WHEN '50' THEN '80'
  ELSE status
END,
update_time = now()
WHERE status IN ('10', '20', '30', '40', '45', '50');

UPDATE biz_leasing_receivable_status_log
SET before_status = CASE before_status
  WHEN '10' THEN '20'
  WHEN '20' THEN '40'
  WHEN '30' THEN '50'
  WHEN '40' THEN '60'
  WHEN '45' THEN '70'
  WHEN '50' THEN '80'
  ELSE before_status
END,
update_time = now()
WHERE before_status IN ('10', '20', '30', '40', '45', '50');

UPDATE biz_leasing_receivable_status_log
SET after_status = CASE after_status
  WHEN '10' THEN '20'
  WHEN '20' THEN '40'
  WHEN '30' THEN '50'
  WHEN '40' THEN '60'
  WHEN '45' THEN '70'
  WHEN '50' THEN '80'
  ELSE after_status
END,
update_time = now()
WHERE after_status IN ('10', '20', '30', '40', '45', '50');

UPDATE biz_leasing_invoice
SET invoice_type = CASE invoice_type
  WHEN '10' THEN 'normal'
  WHEN '20' THEN 'special'
  WHEN '90' THEN 'other'
  ELSE invoice_type
END,
update_time = now()
WHERE invoice_type IN ('10', '20', '90');
