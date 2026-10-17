-- Independent enterprises have distinct, explicitly configured HR role codes.
-- No grants or policy rows are created by this forward schema step.
ALTER TABLE public.hr_contract_reminder_policy
 DROP CONSTRAINT ck_hr_contract_reminder_recipient_config;
ALTER TABLE public.hr_contract_reminder_policy
 ADD CONSTRAINT ck_hr_contract_reminder_recipient_config CHECK (
  (recipient_scope='hr' AND recipient_role_code IS NOT NULL AND btrim(recipient_role_code)<>'')
  OR (recipient_scope<>'hr' AND recipient_role_code IS NULL)
 );
