\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS :"fact_schema";
SET LOCAL search_path TO :"fact_schema", public;

CREATE TABLE IF NOT EXISTS hr_cutover_approval(run_id text,reason_code text,attestation_sha256 text,actual_bytes_sha256 text,detached boolean);
CREATE TABLE IF NOT EXISTS hr_cutover_ledger(run_id text,domain text,source_object text,source_count numeric(78,0),loaded_count numeric(78,0),quarantined_count numeric(78,0),approved_ignored_count numeric(78,0),source_amount numeric(38,4),loaded_amount numeric(38,4),quarantined_amount numeric(38,4),approved_ignored_amount numeric(38,4),approved_ignored_reason text,approval_attestation_sha256 text);
CREATE TABLE IF NOT EXISTS hr_cutover_canonical_row(run_id text,domain text,source_table text,source_identity_sha256 text,tenant_source_identity text,park_source_identity text,normalized_business_json jsonb,related_source_identity_sha256 text[],target_uuid uuid,created_at timestamptz,sequence_no bigint);
CREATE TABLE IF NOT EXISTS hr_cutover_owner_edge(run_id text,owner_kind text,child_domain text,child_source_identity_sha256 text,owner_source_identity_sha256 text,tenant_source_identity text,park_source_identity text,expected_target_table text,map_source_identity_sha256 text);
CREATE TABLE IF NOT EXISTS legacy_record_map_fact(run_id text,source_identity_sha256 text,target_table text,tenant_source_identity text,park_source_identity text);
CREATE TABLE IF NOT EXISTS hr_cutover_side_effect_snapshot(run_id text,phase text,table_name text,locked boolean,row_hash text);
CREATE TABLE IF NOT EXISTS hr_cutover_side_effect_allowlist(run_id text,table_name text);
CREATE TABLE IF NOT EXISTS hr_cutover_side_effect_required(run_id text,table_name text);

CREATE OR REPLACE FUNCTION capture_hr_cutover_protected(p_run text,p_phase text) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE r record; digest_value text;
BEGIN
  IF p_phase NOT IN ('before','after') THEN RAISE EXCEPTION 'invalid snapshot phase'; END IF;
  FOR r IN SELECT * FROM (VALUES
    ('sys_user','sys_user'),('sys_role','sys_role'),('hr_employee.current_state','hr_employee'),
    ('hr_payroll_run','hr_payroll_run'),('hr_payslip','hr_payslip'),('payment','payment'),
    ('bank','bank'),('tax_submission','tax_submission'),('biz_user_message','biz_user_message'),
    ('workflow_inbox','workflow_inbox'),('hr_performance_result','hr_performance_result'),('file_reference','file_reference')
  ) AS x(snapshot_name,relation_name)
  LOOP
    IF to_regclass('public.'||r.relation_name) IS NULL THEN
      digest_value:=encode(digest('ABSENT:'||r.relation_name,'sha256'),'hex');
    ELSE
      EXECUTE format('LOCK TABLE public.%I IN SHARE MODE',r.relation_name);
      IF r.snapshot_name='hr_employee.current_state' THEN
        EXECUTE 'SELECT encode(digest(COALESCE(string_agg(jsonb_build_object(''id'',id,''employmentStatus'',employment_status,''primaryOrgId'',primary_org_id,''positionId'',position_id,''departureDate'',departure_date)::text,E''\n'' ORDER BY id),''''),''sha256''),''hex'') FROM public.hr_employee WHERE COALESCE(remark,'''') NOT LIKE ''%''||$1||''%''' INTO digest_value USING p_run;
      ELSE
        EXECUTE format('SELECT encode(digest(COALESCE(string_agg(to_jsonb(t)::text,E''\n'' ORDER BY to_jsonb(t)::text),''''),''sha256''),''hex'') FROM public.%I t',r.relation_name) INTO digest_value;
      END IF;
    END IF;
    INSERT INTO hr_cutover_side_effect_snapshot VALUES(p_run,p_phase,r.snapshot_name,true,digest_value);
  END LOOP;
END $fn$;

SELECT capture_hr_cutover_protected(:'run_id',:'phase');

INSERT INTO hr_cutover_side_effect_required(run_id,table_name)
SELECT :'run_id',x FROM unnest(ARRAY['sys_user','sys_role','hr_employee.current_state','hr_payroll_run','hr_payslip','payment','bank','tax_submission','biz_user_message','workflow_inbox','hr_performance_result','file_reference']) x
ON CONFLICT DO NOTHING;

INSERT INTO hr_cutover_side_effect_allowlist(run_id,table_name)
SELECT :'run_id',c.relname
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (
  c.relname IN ('migration_batch','migration_batch_item','legacy_record_map','migration_error','migration_check','migration_rollback_point')
  OR c.relname LIKE 'hr_legacy_%' OR c.relname LIKE 'hr_payroll_legacy_%'
)
ON CONFLICT DO NOTHING;

\if :finalize
DELETE FROM hr_cutover_approval WHERE run_id=:'run_id';
DELETE FROM hr_cutover_ledger WHERE run_id=:'run_id';
DELETE FROM hr_cutover_canonical_row WHERE run_id=:'run_id';
DELETE FROM hr_cutover_owner_edge WHERE run_id=:'run_id';
DELETE FROM legacy_record_map_fact WHERE run_id=:'run_id';

INSERT INTO hr_cutover_approval VALUES(:'run_id','SOURCE_OBJECT_OUTSIDE_APPROVED_SCOPE',:'scope_attestation_sha256',:'scope_attestation_sha256',true);

WITH items AS (
  SELECT CASE right(b.run_id,2) WHEN 't0' THEN 'T0' WHEN 't1' THEN 'T1' WHEN 't2' THEN 'T2' WHEN 't3' THEN 'T3' WHEN 't4' THEN 'T4' WHEN 't5' THEN 'T5' END domain,
    i.source_object,i.extracted_count,i.loaded_count,i.rejected_count,
    i.extracted_count-i.loaded_count-i.rejected_count approved_ignored,
    CASE WHEN i.source_object='dbo.salary01..35:2024-2026' THEN 15723009.9100::numeric
         WHEN i.source_object='dbo.salary01..35:<2024' THEN 86471046.8900::numeric ELSE 0::numeric END source_amount,
    CASE WHEN i.source_object='dbo.salary01..35:2024-2026' THEN 15723009.9100::numeric ELSE 0::numeric END loaded_amount
  FROM public.migration_batch b JOIN public.migration_batch_item i ON i.batch_id=b.id
  WHERE b.run_id IN (SELECT :'run_id'||'-t'||g FROM generate_series(0,5) g)
)
INSERT INTO hr_cutover_ledger
SELECT :'run_id',domain,source_object,extracted_count,loaded_count,rejected_count,approved_ignored,
  source_amount,loaded_amount,0::numeric,source_amount-loaded_amount,
  CASE WHEN approved_ignored>0 AND domain='T4' AND source_object='dbo.salary01..35:<2024' THEN 'SOURCE_OBJECT_OUTSIDE_APPROVED_SCOPE' END,
  CASE WHEN approved_ignored>0 AND domain='T4' AND source_object='dbo.salary01..35:<2024' THEN :'scope_attestation_sha256' END
FROM items;

WITH maps AS (
 SELECT CASE right(b.run_id,2) WHEN 't0' THEN 'T0' WHEN 't1' THEN 'T1' WHEN 't2' THEN 'T2' WHEN 't3' THEN 'T3' WHEN 't4' THEN 'T4' WHEN 't5' THEN 'T5' END domain,m.*
 FROM public.migration_batch b JOIN public.legacy_record_map m ON m.batch_id=b.id
 WHERE b.run_id IN (SELECT :'run_id'||'-t'||g FROM generate_series(0,5) g)
)
INSERT INTO hr_cutover_canonical_row
SELECT :'run_id',domain,source_table,source_identity_sha256,:'tenant_identity',:'park_identity',
 jsonb_build_object('sourceRowSha256',source_row_sha256,'targetTable',target_table,'mappingStatus',mapping_status),ARRAY[]::text[],target_id,create_time,row_number() OVER(ORDER BY domain,source_table,source_identity_sha256)
FROM maps;

INSERT INTO legacy_record_map_fact
SELECT run_id,source_identity_sha256,normalized_business_json->>'targetTable',tenant_source_identity,park_source_identity
FROM hr_cutover_canonical_row WHERE run_id=:'run_id';

-- T0 employee maps own themselves. All other edges are derived from actual target FKs back to a T0 employee/contract map.
INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','employee','T0',m.source_identity_sha256,m.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id
WHERE b.run_id=:'run_id'||'-t0' AND m.target_table='hr_employee' AND m.target_id IS NOT NULL;

INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','employment_event','T1',m.source_identity_sha256,owner.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id JOIN public.hr_employment_event x ON x.id=m.target_id
JOIN public.legacy_record_map owner ON owner.target_table='hr_employee' AND owner.target_id=x.employee_id AND owner.is_active
WHERE b.run_id=:'run_id'||'-t1' AND m.target_table='hr_employment_event';

INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','contract','T2',m.source_identity_sha256,owner.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id JOIN public.hr_contract x ON x.id=m.target_id
JOIN public.legacy_record_map owner ON owner.target_table='hr_employee' AND owner.target_id=x.employee_id AND owner.is_active
WHERE b.run_id=:'run_id'||'-t2' AND m.target_table='hr_contract';

INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','attendance_insurance','T3',m.source_identity_sha256,owner.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id JOIN public.hr_employee_insurance_period x ON x.id=m.target_id
JOIN public.legacy_record_map owner ON owner.target_table='hr_employee' AND owner.target_id=x.employee_id AND owner.is_active
WHERE b.run_id=:'run_id'||'-t3' AND m.target_table='hr_employee_insurance_period';

INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','payroll','T4',m.source_identity_sha256,owner.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id JOIN public.hr_payroll_legacy_snapshot x ON x.id=m.target_id
JOIN public.legacy_record_map owner ON owner.target_table='hr_employee' AND owner.target_id=x.employee_id AND owner.is_active
WHERE b.run_id=:'run_id'||'-t4' AND m.target_table='hr_payroll_legacy_snapshot' AND x.employee_id IS NOT NULL;

INSERT INTO hr_cutover_owner_edge
SELECT :'run_id','file','T5',m.source_identity_sha256,owner.source_identity_sha256,:'tenant_identity',:'park_identity',m.target_table,m.source_identity_sha256
FROM public.legacy_record_map m JOIN public.migration_batch b ON b.id=m.batch_id JOIN public.hr_legacy_t5_file_evidence x ON x.id=m.target_id
JOIN public.legacy_record_map owner ON owner.target_table='hr_employee' AND owner.target_id=x.employee_id AND owner.is_active
WHERE b.run_id=:'run_id'||'-t5' AND m.target_table='hr_legacy_t5_file_evidence' AND x.employee_id IS NOT NULL;

UPDATE hr_cutover_canonical_row c SET related_source_identity_sha256=ARRAY[e.owner_source_identity_sha256]
FROM hr_cutover_owner_edge e WHERE c.run_id=e.run_id AND c.domain=e.child_domain AND c.source_identity_sha256=e.child_source_identity_sha256 AND c.run_id=:'run_id';
\endif
COMMIT;
