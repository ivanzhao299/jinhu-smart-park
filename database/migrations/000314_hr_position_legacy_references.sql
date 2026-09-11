BEGIN;

-- Yuzhou dbo.job.parentjob / dbo.job.department are free-text varchar(30)
-- columns with no FK constraint and zero stored-procedure usage (contract
-- JOB_PARENTJOB_UPTO_SEPARATION_V1). When no position/org reference resolves,
-- the legacy text is retained verbatim so import evidence stays queryable;
-- the modern hierarchy is expressed only through reports_to_position_id.
ALTER TABLE hr_position
  ADD COLUMN IF NOT EXISTS legacy_parent_reference varchar(30),
  ADD COLUMN IF NOT EXISTS legacy_department_reference varchar(30);

COMMENT ON COLUMN hr_position.legacy_parent_reference IS
  'Yuzhou dbo.job.parentjob free-text retained verbatim when no position reference resolves.';
COMMENT ON COLUMN hr_position.legacy_department_reference IS
  'Yuzhou dbo.job.department free-text retained verbatim when no org reference resolves.';

COMMIT;
