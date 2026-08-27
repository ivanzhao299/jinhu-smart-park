BEGIN;

ALTER TABLE hr_legacy_t5_record
  DROP CONSTRAINT ck_hr_legacy_t5_record_domain;

ALTER TABLE hr_legacy_t5_record
  ADD CONSTRAINT ck_hr_legacy_t5_record_domain CHECK (domain IN (
    'candidate','family','experience','skill','credential','training_course','training_history','reward_category','reward_history',
    'employee_profile_raw','employment_change_raw','contract_raw'
  ));

COMMIT;
