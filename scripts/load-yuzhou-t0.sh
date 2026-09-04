#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
TARGET_DATABASE="${YUZHOU_TARGET_DATABASE:-}"
TARGET_TENANT_ID="${YUZHOU_TARGET_TENANT_ID:-10000001}"
TARGET_PARK_ID="${YUZHOU_TARGET_PARK_ID:-20000001}"
STAGING_DIR="${YUZHOU_STAGING_DIR:-$ROOT_DIR/database/import-reports/yuzhou-hr/staging-$RUN_ID}"
PG_CONTAINER="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_COMPOSE_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
SOURCE_SNAPSHOT_SHA256="${YUZHOU_BACKUP_SHA256:-3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e}"
DEPARTMENTS_SHA256="${YUZHOU_DEPARTMENTS_SHA256:-24d3d208bbbdbb5fd8a8a0b29804f4473b6c99b31d6d46f16c8d8e795e6366e1}"
POSITIONS_SHA256="${YUZHOU_POSITIONS_SHA256:-96489dedc6efb8e4a56cd4f8346aa0b9df18ff3969f9e46f0f0bebaadba7ddb5}"
EMPLOYEES_SHA256="${YUZHOU_EMPLOYEES_SHA256:-db17b4631aa7111bc534b6806ab3a6cc181d3efb0ba1d4eb7850503142490b9f}"
JOB_STATE_DICTIONARY_SHA256="${YUZHOU_T0_JOB_STATE_DICTIONARY_SHA256:-}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = "yes" ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf '%s' "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid YUZHOU_MIGRATION_RUN_ID"
printf '%s' "$TARGET_DATABASE" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "invalid isolated target database"
printf '%s' "$SOURCE_SNAPSHOT_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid source snapshot SHA-256"
[ -d "$STAGING_DIR" ] || fail "staging directory is missing"
for file in departments.jsonl positions.jsonl employees.jsonl manifest.json; do [ -f "$STAGING_DIR/$file" ] || fail "staging file is missing: $file"; done
for expected in "$DEPARTMENTS_SHA256" "$POSITIONS_SHA256" "$EMPLOYEES_SHA256"; do printf '%s' "$expected" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid staging SHA-256"; done
printf '%s' "$JOB_STATE_DICTIONARY_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "approved employee job-state dictionary SHA-256 is required"
actual_departments_sha="$(shasum -a 256 "$STAGING_DIR/departments.jsonl" | awk '{print $1}')"
actual_positions_sha="$(shasum -a 256 "$STAGING_DIR/positions.jsonl" | awk '{print $1}')"
actual_employees_sha="$(shasum -a 256 "$STAGING_DIR/employees.jsonl" | awk '{print $1}')"
[ "$actual_departments_sha" = "$DEPARTMENTS_SHA256" ] || fail "departments staging SHA-256 mismatch"
[ "$actual_positions_sha" = "$POSITIONS_SHA256" ] || fail "positions staging SHA-256 mismatch"
[ "$actual_employees_sha" = "$EMPLOYEES_SHA256" ] || fail "employees staging SHA-256 mismatch"

project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$PG_CONTAINER" 2>/dev/null || true)"
[ "$project" = "$EXPECTED_COMPOSE_PROJECT" ] || fail "PostgreSQL container is not the expected migration lab"
actual_database="$(docker exec "$PG_CONTAINER" psql -X -A -t -U jinhu -d "$TARGET_DATABASE" -c 'SELECT current_database()' 2>/dev/null || true)"
[ "$actual_database" = "$TARGET_DATABASE" ] || fail "isolated target database is unavailable"

container_root="/tmp/yuzhou-t0-$RUN_ID"
cleanup() {
  docker exec "$PG_CONTAINER" sh -c 'rm -f "$1/departments.jsonl" "$1/positions.jsonl" "$1/employees.jsonl"; rmdir "$1" 2>/dev/null || true' cleanup "$container_root" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
docker exec "$PG_CONTAINER" mkdir -p "$container_root"
for file in departments.jsonl positions.jsonl employees.jsonl; do docker cp "$STAGING_DIR/$file" "$PG_CONTAINER:$container_root/$file"; done
docker exec "$PG_CONTAINER" chown -R postgres:postgres "$container_root"
docker exec "$PG_CONTAINER" chmod 700 "$container_root"
docker exec "$PG_CONTAINER" chmod 600 "$container_root/departments.jsonl" "$container_root/positions.jsonl" "$container_root/employees.jsonl"

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$TARGET_DATABASE" \
  -v run_id="$RUN_ID" -v target_database="$TARGET_DATABASE" -v tenant_id="$TARGET_TENANT_ID" -v park_id="$TARGET_PARK_ID" \
  -v snapshot_sha="$SOURCE_SNAPSHOT_SHA256" -v dep_path="$container_root/departments.jsonl" \
  -v pos_path="$container_root/positions.jsonl" -v emp_path="$container_root/employees.jsonl" \
  -v dep_sha="$DEPARTMENTS_SHA256" -v pos_sha="$POSITIONS_SHA256" -v emp_sha="$EMPLOYEES_SHA256" \
  -v job_state_dictionary_sha="$JOB_STATE_DICTIONARY_SHA256" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='5min';
SELECT set_config('yuzhou.run_id',:'run_id',true);
SELECT set_config('yuzhou.target_database',:'target_database',true);
SELECT set_config('yuzhou.tenant_id',:'tenant_id',true);
SELECT set_config('yuzhou.park_id',:'park_id',true);
SELECT set_config('yuzhou.job_state_dictionary_sha',:'job_state_dictionary_sha',true);

DO $$ BEGIN
  IF current_database() <> current_setting('yuzhou.target_database') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN
    RAISE EXCEPTION 'unsafe migration target';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM sys_org WHERE tenant_id::text=current_setting('yuzhou.tenant_id') AND park_id::text=current_setting('yuzhou.park_id') AND is_deleted=false) THEN
    RAISE EXCEPTION 'target tenant/park scope does not exist';
  END IF;
END $$;

CREATE TEMP TABLE stg_department(payload jsonb NOT NULL);
CREATE TEMP TABLE stg_position(payload jsonb NOT NULL);
CREATE TEMP TABLE stg_employee(payload jsonb NOT NULL);
COPY stg_department(payload) FROM :'dep_path';
COPY stg_position(payload) FROM :'pos_path';
COPY stg_employee(payload) FROM :'emp_path';

-- Validate every legacy value that this loader will cast before any target write.
-- The helpers intentionally return only a boolean: the journal must identify the
-- failed field class without retaining a source value or employee identity.
CREATE FUNCTION pg_temp.yuzhou_t0_integer_input_valid(value text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(btrim(value),'') IS NULL THEN RETURN true; END IF;
  PERFORM btrim(value)::integer;
  RETURN true;
EXCEPTION WHEN SQLSTATE '22P02' OR SQLSTATE '22003' THEN
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.yuzhou_t0_smallint_input_valid(value text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(btrim(value),'') IS NULL THEN RETURN true; END IF;
  PERFORM btrim(value)::smallint;
  RETURN true;
EXCEPTION WHEN SQLSTATE '22P02' OR SQLSTATE '22003' THEN
  RETURN false;
END $$;

CREATE FUNCTION pg_temp.yuzhou_t0_date_input_valid(value text)
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF NULLIF(btrim(value),'') IS NULL THEN RETURN true; END IF;
  PERFORM btrim(value)::date;
  RETURN true;
EXCEPTION WHEN SQLSTATE '22P02' OR SQLSTATE '22007' OR SQLSTATE '22008' THEN
  RETURN false;
END $$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM stg_department s WHERE NOT pg_temp.yuzhou_t0_smallint_input_valid(s.payload->'source'->>'rating')) THEN
    RAISE EXCEPTION 'T0_DEPARTMENT_SMALLINT_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM stg_department s WHERE NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'legacySourceId')
     OR NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'plannedHeadcount')
     OR NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'sortOrder')) THEN
    RAISE EXCEPTION 'T0_DEPARTMENT_INTEGER_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM stg_position s WHERE NOT pg_temp.yuzhou_t0_smallint_input_valid(s.payload->'source'->>'rating')) THEN
    RAISE EXCEPTION 'T0_POSITION_SMALLINT_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM stg_position s WHERE NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'headcountLimit')
     OR NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'sortOrder')
     OR NOT pg_temp.yuzhou_t0_integer_input_valid(s.payload->'source'->>'legacySourceId')) THEN
    RAISE EXCEPTION 'T0_POSITION_INTEGER_INPUT_INVALID';
  END IF;
  IF EXISTS (SELECT 1 FROM stg_employee s WHERE NOT pg_temp.yuzhou_t0_date_input_valid(s.payload->'source'->>'hireDate')
     OR NOT pg_temp.yuzhou_t0_date_input_valid(s.payload->'source'->>'formalDate')
     OR NOT pg_temp.yuzhou_t0_date_input_valid(s.payload->'source'->>'departureDate')) THEN
    RAISE EXCEPTION 'T0_EMPLOYEE_DATE_INPUT_INVALID';
  END IF;
END $$;

DO $$ BEGIN
  IF (SELECT count(*) FROM hr_legacy_dictionary_version
      WHERE tenant_id=current_setting('yuzhou.tenant_id') AND park_id=current_setting('yuzhou.park_id')
        AND source_system='yuzhou-v10' AND dictionary_code='employee_job_state'
        AND source_snapshot_sha256=current_setting('yuzhou.job_state_dictionary_sha') AND status='approved' AND is_deleted=false) <> 1 THEN
    RAISE EXCEPTION 'T0 approved employee job-state dictionary is missing or drifted';
  END IF;
END $$;

CREATE TEMP TABLE stg_employee_decision AS
SELECT staged.payload,dictionary_item.id dictionary_item_id,dictionary_item.decision,
       dictionary_item.target_domain,dictionary_item.target_value,dictionary_item.reason_code
FROM stg_employee staged
JOIN hr_legacy_dictionary_version dictionary_version
  ON dictionary_version.tenant_id=:'tenant_id' AND dictionary_version.park_id=:'park_id'
 AND dictionary_version.source_system='yuzhou-v10' AND dictionary_version.dictionary_code='employee_job_state'
 AND dictionary_version.source_snapshot_sha256=:'job_state_dictionary_sha'
 AND dictionary_version.status='approved' AND dictionary_version.is_deleted=false
LEFT JOIN hr_legacy_dictionary_item dictionary_item
  ON dictionary_item.version_id=dictionary_version.id AND dictionary_item.tenant_id=dictionary_version.tenant_id
 AND dictionary_item.park_id=dictionary_version.park_id AND dictionary_item.is_deleted=false
 AND lower(coalesce(NULLIF(btrim(dictionary_item.source_code),''),E'\\x00'))=
     lower(coalesce(NULLIF(btrim(staged.payload->'source'->>'legacyStatus'),''),E'\\x00'))
 AND dictionary_item.source_value IS NULL;

DO $$ BEGIN
  IF (SELECT count(*) FROM stg_department)<>138 OR (SELECT count(*) FROM stg_position)<>18 OR (SELECT count(*) FROM stg_employee_decision)<>2949 THEN
    RAISE EXCEPTION 'T0 staging count drift';
  END IF;
  IF EXISTS (SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.run_id')) THEN RAISE EXCEPTION 'migration run already exists'; END IF;
  IF EXISTS (
    SELECT 1 FROM stg_department s JOIN sys_org o ON o.tenant_id::text=current_setting('yuzhou.tenant_id') AND o.park_id::text=current_setting('yuzhou.park_id')
      AND o.org_code=s.payload->>'sourceKey' AND o.is_deleted=false
  ) THEN RAISE EXCEPTION 'legacy organization code collides with existing target data'; END IF;
END $$;

INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at)
VALUES (:'run_id','yuzhou-v10',:'snapshot_sha',:'target_database','load','running','t0-loader-v1',now());

INSERT INTO legacy_source_object(source_system,source_database,object_type,object_schema,object_name,source_version,checksum_sha256,metadata)
VALUES
  ('yuzhou-v10','manpower10','table','dbo','departmentcode','t0-loader-v1',:'dep_sha',jsonb_build_object('rows',138)),
  ('yuzhou-v10','manpower10','table','dbo','job','t0-loader-v1',:'pos_sha',jsonb_build_object('rows',18)),
  ('yuzhou-v10','manpower10','table','dbo','person','t0-loader-v1',:'emp_sha',jsonb_build_object('rows',2949))
ON CONFLICT DO NOTHING;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at)
SELECT id,'organization','dbo.departmentcode','load','running',138,138,0,0,:'dep_sha',now() FROM b
UNION ALL SELECT id,'position','dbo.job','load','running',18,18,0,0,:'pos_sha',now() FROM b
UNION ALL SELECT id,'employee','dbo.person','load','running',2949,
  (SELECT count(*) FROM stg_employee_decision WHERE decision='map' AND target_domain='employment_status'
    AND target_value IN('active','probation','suspended','departed')),0,
  (SELECT count(*) FROM stg_employee_decision WHERE (decision='map' AND target_domain='employment_status'
    AND target_value IN('active','probation','suspended','departed')) IS NOT TRUE),:'emp_sha',now() FROM b;

INSERT INTO sys_org(tenant_id,park_id,parent_id,org_code,org_name,org_type,legacy_source_id,legacy_hierarchy_level,legacy_manager_reference,planned_headcount,contact_phone,sort_order,status,remark)
SELECT :'tenant_id',:'park_id',NULL,s.payload->>'sourceKey',s.payload->'source'->>'orgName',
  CASE WHEN COALESCE(NULLIF(btrim(s.payload->'source'->>'rating'),'')::int,1)<=1 THEN 'company' ELSE 'department' END,
  NULLIF(btrim(s.payload->'source'->>'legacySourceId'),'')::int,NULLIF(btrim(s.payload->'source'->>'rating'),'')::smallint,
  NULLIF(btrim(s.payload->'source'->>'legacyManagerValue'),''),NULLIF(btrim(s.payload->'source'->>'plannedHeadcount'),'')::int,NULLIF(btrim(s.payload->'source'->>'contactPhone'),''),
  COALESCE(NULLIF(btrim(s.payload->'source'->>'sortOrder'),'')::int,0),'enabled','Migrated from Yuzhou V10; run='||:'run_id'
FROM stg_department s ORDER BY length(s.payload->>'sourceKey'),s.payload->>'sourceKey';

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10','dbo.departmentcode','department='||(s.payload->>'sourceKey'),s.payload->>'sourceIdentitySha256',s.payload->>'sourceRowSha256','sys_org',o.id,'loaded'
FROM stg_department s CROSS JOIN b JOIN sys_org o ON o.tenant_id::text=:'tenant_id' AND o.park_id::text=:'park_id' AND o.org_code=s.payload->>'sourceKey' AND o.is_deleted=false;

UPDATE sys_org child SET parent_id=(
  SELECT candidate.id FROM sys_org candidate
  WHERE candidate.tenant_id=child.tenant_id AND candidate.park_id=child.park_id AND candidate.is_deleted=false
    AND length(candidate.org_code)<length(child.org_code) AND child.org_code LIKE candidate.org_code||'%'
    AND candidate.remark='Migrated from Yuzhou V10; run='||:'run_id'
  ORDER BY length(candidate.org_code) DESC LIMIT 1
)
WHERE child.tenant_id::text=:'tenant_id' AND child.park_id::text=:'park_id'
  AND child.remark='Migrated from Yuzhou V10; run='||:'run_id';

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM stg_position s
    WHERE NOT (s.payload->'source' ? 'legacyUptoCode')
  ) THEN RAISE EXCEPTION 'T0 position omitted legacy upto structural field'; END IF;
  IF EXISTS (
    SELECT 1 FROM stg_position s
    WHERE NULLIF(btrim(s.payload->'source'->>'departmentCode'),'') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sys_org o
        WHERE o.tenant_id::text=current_setting('yuzhou.tenant_id') AND o.park_id::text=current_setting('yuzhou.park_id')
          AND o.org_code=s.payload->'source'->>'departmentCode' AND o.is_deleted=false
      )
  ) THEN RAISE EXCEPTION 'T0 position references an unknown organization'; END IF;
END $$;

INSERT INTO hr_position(tenant_id,park_id,org_id,reports_to_position_id,position_code,position_name,job_family,job_level,headcount_limit,hierarchy_level,sort_order,legacy_source_id,legacy_upto_code,authority,qualification,responsibilities,position_manual,status,remark)
SELECT :'tenant_id',:'park_id',COALESCE(dept.id,root_org.id),NULL,s.payload->>'sourceKey',s.payload->'source'->>'positionName',
  NULLIF(btrim(s.payload->'source'->>'jobgrade'),''),NULLIF(btrim(s.payload->'source'->>'salarygrade'),''),NULLIF(btrim(s.payload->'source'->>'headcountLimit'),'')::int,
  NULLIF(btrim(s.payload->'source'->>'rating'),'')::smallint,COALESCE(NULLIF(btrim(s.payload->'source'->>'sortOrder'),'')::int,0),NULLIF(btrim(s.payload->'source'->>'legacySourceId'),'')::int,NULLIF(btrim(s.payload->'source'->>'legacyUptoCode'),''),
  NULLIF(btrim(s.payload->'source'->>'authority'),''),NULLIF(btrim(s.payload->'source'->>'qualification'),''),
  NULLIF(btrim(s.payload->'source'->>'responsibilities'),''),NULLIF(btrim(s.payload->'source'->>'positionManual'),''),
  'enabled','Migrated from Yuzhou V10; run='||:'run_id'
FROM stg_position s
LEFT JOIN sys_org dept ON dept.tenant_id::text=:'tenant_id' AND dept.park_id::text=:'park_id' AND dept.org_code=s.payload->'source'->>'departmentCode' AND dept.is_deleted=false
JOIN sys_org root_org ON root_org.tenant_id::text=:'tenant_id' AND root_org.park_id::text=:'park_id' AND root_org.org_code='000' AND root_org.is_deleted=false;

UPDATE hr_position child
SET reports_to_position_id=parent.id
FROM stg_position source
JOIN hr_position parent
  ON parent.tenant_id::text=:'tenant_id' AND parent.park_id::text=:'park_id'
 AND parent.position_code=source.payload->'source'->>'parentPositionCode' AND parent.is_deleted=false
WHERE child.tenant_id::text=:'tenant_id' AND child.park_id::text=:'park_id'
  AND child.position_code=source.payload->>'sourceKey' AND child.is_deleted=false
  AND child.remark='Migrated from Yuzhou V10; run='||:'run_id'
  AND NULLIF(btrim(source.payload->'source'->>'parentPositionCode'),'') IS NOT NULL;

DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM stg_position source
    JOIN hr_position child ON child.tenant_id::text=current_setting('yuzhou.tenant_id') AND child.park_id::text=current_setting('yuzhou.park_id')
      AND child.position_code=source.payload->>'sourceKey' AND child.is_deleted=false
    WHERE NULLIF(btrim(source.payload->'source'->>'parentPositionCode'),'') IS NOT NULL
      AND child.reports_to_position_id IS NULL
  ) THEN RAISE EXCEPTION 'T0 position references an unknown parent position'; END IF;
END $$;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10','dbo.job','job='||(s.payload->>'sourceKey'),s.payload->>'sourceIdentitySha256',s.payload->>'sourceRowSha256','hr_position',p.id,'loaded'
FROM stg_position s CROSS JOIN b JOIN hr_position p ON p.tenant_id=:'tenant_id' AND p.park_id=:'park_id' AND p.position_code=s.payload->>'sourceKey' AND p.is_deleted=false;

WITH valid_employee AS (
  SELECT * FROM stg_employee_decision WHERE decision='map' AND target_domain='employment_status'
    AND target_value IN('active','probation','suspended','departed')
  )
INSERT INTO hr_employee(tenant_id,park_id,employee_code,full_name,primary_org_id,position_id,employment_type,employment_status,hire_date,probation_end_date,departure_date,remark)
SELECT :'tenant_id',:'park_id',s.payload->>'sourceKey',s.payload->'source'->>'fullName',o.id,p.id,
  'full_time',s.target_value,
  NULLIF(btrim(s.payload->'source'->>'hireDate'),'')::date,NULLIF(btrim(s.payload->'source'->>'formalDate'),'')::date,
  CASE WHEN NULLIF(btrim(s.payload->'source'->>'hireDate'),'') IS NOT NULL AND NULLIF(btrim(s.payload->'source'->>'departureDate'),'') IS NOT NULL
      AND btrim(s.payload->'source'->>'departureDate')::date < btrim(s.payload->'source'->>'hireDate')::date THEN NULL
    ELSE NULLIF(btrim(s.payload->'source'->>'departureDate'),'')::date END,
  'Migrated from Yuzhou V10; legacy_status='||(s.payload->'source'->>'legacyStatus')||'; legacy_date_order=review_required; run='||:'run_id'
FROM valid_employee s
JOIN sys_org o ON o.tenant_id::text=:'tenant_id' AND o.park_id::text=:'park_id' AND o.org_code=s.payload->'source'->>'departmentCode' AND o.is_deleted=false
LEFT JOIN hr_position p ON p.tenant_id=:'tenant_id' AND p.park_id=:'park_id' AND p.position_code=s.payload->'source'->>'positionCode' AND p.is_deleted=false;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10','dbo.person','person='||(s.payload->>'sourceKey'),s.payload->>'sourceIdentitySha256',s.payload->>'sourceRowSha256','hr_employee',e.id,'loaded'
FROM stg_employee_decision s CROSS JOIN b JOIN hr_employee e ON e.tenant_id=:'tenant_id' AND e.park_id=:'park_id' AND e.employee_code=s.payload->>'sourceKey' AND e.is_deleted=false;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id'), item AS (SELECT id,batch_id FROM migration_batch_item WHERE domain='employee' AND source_object='dbo.person' AND phase='load')
INSERT INTO migration_error(batch_id,batch_item_id,category,error_code,source_identity_sha256,redacted_evidence,evidence_redacted,retryable)
SELECT b.id,item.id,'data_quality','EMPLOYEE_DATE_ORDER',s.payload->>'sourceIdentitySha256',jsonb_build_object('rule','departure_before_hire'),true,false
FROM stg_employee_decision s CROSS JOIN b JOIN item ON item.batch_id=b.id
WHERE NULLIF(btrim(s.payload->'source'->>'hireDate'),'') IS NOT NULL AND NULLIF(btrim(s.payload->'source'->>'departureDate'),'') IS NOT NULL
  AND btrim(s.payload->'source'->>'departureDate')::date < btrim(s.payload->'source'->>'hireDate')::date
UNION ALL
SELECT b.id,item.id,'mapping','EMPLOYEE_JOB_STATE_UNRESOLVED',s.payload->>'sourceIdentitySha256',
       jsonb_build_object('rule','approved_dictionary_mapping_required'),true,false
FROM stg_employee_decision s CROSS JOIN b JOIN item ON item.batch_id=b.id
WHERE (s.decision='map' AND s.target_domain='employment_status' AND s.target_value IN('active','probation','suspended','departed')) IS NOT TRUE;

UPDATE migration_batch_item i SET loaded_count=x.loaded_count,status=CASE WHEN i.rejected_count>0 THEN 'quarantined' ELSE 'succeeded' END,finished_at=now(),update_time=now()
FROM (VALUES ('organization',138::bigint),('position',18::bigint),('employee',(SELECT count(*)::bigint FROM hr_employee WHERE tenant_id=:'tenant_id' AND park_id=:'park_id' AND remark LIKE '%run='||:'run_id'))) x(domain,loaded_count)
WHERE i.batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND i.domain=x.domain;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T0_ORGANIZATION_COUNT','138'::jsonb,to_jsonb((SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='sys_org')),'{}'::jsonb,
  (SELECT count(*)=138 FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='sys_org'),encode(digest('T0_ORGANIZATION_COUNT:138','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T0_POSITION_COUNT','18'::jsonb,to_jsonb((SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='hr_position')),'{}'::jsonb,
  (SELECT count(*)=18 FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='hr_position'),encode(digest('T0_POSITION_COUNT:18','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T0_EMPLOYEE_ACCOUNTING','2949'::jsonb,to_jsonb((SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='hr_employee')+(SELECT count(*) FROM migration_error e WHERE e.batch_id=b.id AND e.error_code='EMPLOYEE_JOB_STATE_UNRESOLVED')),'{}'::jsonb,
  (SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=b.id AND m.target_table='hr_employee')+(SELECT count(*) FROM migration_error e WHERE e.batch_id=b.id AND e.error_code='EMPLOYEE_JOB_STATE_UNRESOLVED')=2949,encode(digest('T0_EMPLOYEE_ACCOUNTING:2949','sha256'),'hex') FROM b;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO migration_rollback_point(batch_id,rollback_code,reversible_scope,cleanup_manifest,evidence_sha256,verified_at)
SELECT id,'T0_INITIAL_LOAD',jsonb_build_object('tenantId',:'tenant_id','parkId',:'park_id','runId',:'run_id'),
  jsonb_build_object('strategy','legacy_record_map','targetTables',jsonb_build_array('hr_employee','hr_position','sys_org')),
  encode(digest(:'run_id'||':T0_INITIAL_LOAD','sha256'),'hex'),now() FROM b;

UPDATE migration_batch SET phase='verify',status=CASE WHEN EXISTS(SELECT 1 FROM migration_check WHERE batch_id=migration_batch.id AND NOT passed) THEN 'failed' ELSE 'succeeded' END,
  counts=jsonb_build_object('organizations',138,'positions',18,'employeesLoaded',(SELECT count(*) FROM legacy_record_map WHERE batch_id=migration_batch.id AND target_table='hr_employee'),'employeeDateOrderReview',(SELECT count(*) FROM migration_error WHERE batch_id=migration_batch.id AND error_code='EMPLOYEE_DATE_ORDER'),'employeesUnresolved',(SELECT count(*) FROM migration_error WHERE batch_id=migration_batch.id AND error_code='EMPLOYEE_JOB_STATE_UNRESOLVED')),finished_at=now(),update_time=now()
WHERE run_id=:'run_id';

DO $$ BEGIN IF EXISTS (SELECT 1 FROM migration_batch b JOIN migration_check c ON c.batch_id=b.id WHERE b.run_id=current_setting('yuzhou.run_id') AND NOT c.passed) THEN RAISE EXCEPTION 'T0 verification failed'; END IF; END $$;
COMMIT;
SQL

docker exec "$PG_CONTAINER" psql -X -A -t -F '|' -U jinhu -d "$TARGET_DATABASE" -c \
  "SELECT run_id,status,counts::text FROM migration_batch WHERE run_id='$RUN_ID';"
