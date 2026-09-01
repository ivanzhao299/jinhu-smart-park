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
EVENTS_SHA256="${YUZHOU_T1_EVENTS_SHA256:-62519f3ebc86ec27235a1a4b3f3f09b023f093a4301b473f27c522981c15ab92}"
TYPES_SHA256="${YUZHOU_T1_TYPES_SHA256:-}"
TYPE_DICTIONARY_SHA256="${YUZHOU_T1_EVENT_TYPE_DICTIONARY_SHA256:-}"
STATE_DICTIONARY_SHA256="${YUZHOU_T1_EVENT_STATE_DICTIONARY_SHA256:-}"
TYPE_DECISION_FILE="${YUZHOU_T1_EVENT_TYPE_DECISION_FILE:-$ROOT_DIR/scripts/hr-cutover/contracts/yuzhou-t1-employment-event-type-decision-v1.json}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = "yes" ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf '%s' "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid YUZHOU_MIGRATION_RUN_ID"
printf '%s' "$TARGET_DATABASE" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "invalid isolated target database"
[ -f "$STAGING_DIR/employment-events.jsonl" ] && [ -f "$STAGING_DIR/employment-event-types.json" ] || fail "T1 staging files are missing"
[ -f "$TYPE_DECISION_FILE" ] || fail "employment event type decision contract is missing"
decision_result="$(node "$ROOT_DIR/scripts/hr-cutover/verify-yuzhou-t1-event-type-decision.mjs" "$TYPE_DECISION_FILE" "$STAGING_DIR/employment-event-types.json")" || fail "employment event type decision contract or staging binding is invalid"
decision_snapshot="$(printf '%s' "$decision_result" | node -e 'let value="";process.stdin.on("data",chunk=>value+=chunk).on("end",()=>{try{const parsed=JSON.parse(value);if(!/^[0-9a-f]{64}$/.test(parsed.sourceSnapshotSha256)||parsed.productionImport!=="HOLD")process.exit(1);process.stdout.write(parsed.sourceSnapshotSha256);}catch{process.exit(1);}})')" || fail "employment event type decision contract is invalid"
[ "$decision_snapshot" = "$SOURCE_SNAPSHOT_SHA256" ] || fail "employment event type decision source snapshot drift"
actual_events_sha="$(shasum -a 256 "$STAGING_DIR/employment-events.jsonl" | awk '{print $1}')"
actual_types_sha="$(shasum -a 256 "$STAGING_DIR/employment-event-types.json" | awk '{print $1}')"
[ "$actual_events_sha" = "$EVENTS_SHA256" ] || fail "employment events staging SHA-256 mismatch"
[ "$TYPES_SHA256" != "" ] || fail "employment event types staging SHA-256 is required"
[ "$actual_types_sha" = "$TYPES_SHA256" ] || fail "employment event types staging SHA-256 mismatch"
for dictionary_sha in "$TYPE_DICTIONARY_SHA256" "$STATE_DICTIONARY_SHA256"; do printf '%s' "$dictionary_sha" | grep -Eq '^[0-9a-f]{64}$' || fail "approved employment-event dictionary SHA-256 is required"; done

project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$PG_CONTAINER" 2>/dev/null || true)"
[ "$project" = "$EXPECTED_COMPOSE_PROJECT" ] || fail "PostgreSQL container is not the expected migration lab"
actual_database="$(docker exec "$PG_CONTAINER" psql -X -A -t -U jinhu -d "$TARGET_DATABASE" -c 'SELECT current_database()' 2>/dev/null || true)"
[ "$actual_database" = "$TARGET_DATABASE" ] || fail "isolated target database is unavailable"

container_root="/tmp/yuzhou-t1-$RUN_ID"
cleanup() {
  docker exec "$PG_CONTAINER" sh -c 'rm -f "$1/employment-events.jsonl"; rmdir "$1" 2>/dev/null || true' cleanup "$container_root" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
docker exec "$PG_CONTAINER" mkdir -p "$container_root"
docker cp "$STAGING_DIR/employment-events.jsonl" "$PG_CONTAINER:$container_root/employment-events.jsonl"
docker exec "$PG_CONTAINER" chown -R postgres:postgres "$container_root"
docker exec "$PG_CONTAINER" chmod 700 "$container_root"
docker exec "$PG_CONTAINER" chmod 600 "$container_root/employment-events.jsonl"

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$TARGET_DATABASE" \
  -v run_id="$RUN_ID" -v target_database="$TARGET_DATABASE" -v tenant_id="$TARGET_TENANT_ID" -v park_id="$TARGET_PARK_ID" \
  -v snapshot_sha="$SOURCE_SNAPSHOT_SHA256" -v events_path="$container_root/employment-events.jsonl" \
  -v events_sha="$EVENTS_SHA256" -v types_sha="$TYPES_SHA256" \
  -v type_dictionary_sha="$TYPE_DICTIONARY_SHA256" -v state_dictionary_sha="$STATE_DICTIONARY_SHA256" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='5min';
SELECT set_config('yuzhou.run_id',:'run_id',true);
SELECT set_config('yuzhou.target_database',:'target_database',true);
SELECT set_config('yuzhou.tenant_id',:'tenant_id',true);
SELECT set_config('yuzhou.park_id',:'park_id',true);
SELECT set_config('yuzhou.type_dictionary_sha',:'type_dictionary_sha',true);
SELECT set_config('yuzhou.state_dictionary_sha',:'state_dictionary_sha',true);

DO $$ BEGIN
  IF current_database()<>current_setting('yuzhou.target_database') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe migration target'; END IF;
  IF EXISTS (SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.run_id')) THEN RAISE EXCEPTION 'migration run already exists'; END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='hr_employment_event' AND column_name='legacy_event_no') THEN RAISE EXCEPTION 'T1 target migration is missing'; END IF;
  IF (SELECT count(*) FROM hr_legacy_dictionary_version WHERE tenant_id=current_setting('yuzhou.tenant_id') AND park_id=current_setting('yuzhou.park_id') AND source_system='yuzhou-v10' AND dictionary_code='employment_event_type' AND source_snapshot_sha256=current_setting('yuzhou.type_dictionary_sha') AND status='approved' AND is_deleted=false)<>1 THEN RAISE EXCEPTION 'T1 approved event-type dictionary is missing or drifted';END IF;
  IF (SELECT count(*) FROM hr_legacy_dictionary_version WHERE tenant_id=current_setting('yuzhou.tenant_id') AND park_id=current_setting('yuzhou.park_id') AND source_system='yuzhou-v10' AND dictionary_code='employment_event_state' AND source_snapshot_sha256=current_setting('yuzhou.state_dictionary_sha') AND status='approved' AND is_deleted=false)<>1 THEN RAISE EXCEPTION 'T1 approved event-state dictionary is missing or drifted';END IF;
END $$;

CREATE TEMP TABLE stg_employment_event(payload jsonb NOT NULL);
COPY stg_employment_event(payload) FROM :'events_path';
DO $$ BEGIN IF (SELECT count(*) FROM stg_employment_event)<>6887 THEN RAISE EXCEPTION 'T1 staging count drift'; END IF; END $$;

CREATE TEMP TABLE stg_employment_event_decision AS
SELECT staged.payload,employee.id employee_id,
       type_item.decision type_decision,type_item.target_domain type_target_domain,type_item.target_value event_type,
       state_item.decision state_decision,state_item.target_domain state_target_domain,state_item.target_value state_target_value
FROM stg_employment_event staged
JOIN hr_legacy_dictionary_version type_version ON type_version.tenant_id=:'tenant_id' AND type_version.park_id=:'park_id' AND type_version.source_system='yuzhou-v10' AND type_version.dictionary_code='employment_event_type' AND type_version.source_snapshot_sha256=:'type_dictionary_sha' AND type_version.status='approved' AND type_version.is_deleted=false
JOIN hr_legacy_dictionary_version state_version ON state_version.tenant_id=:'tenant_id' AND state_version.park_id=:'park_id' AND state_version.source_system='yuzhou-v10' AND state_version.dictionary_code='employment_event_state' AND state_version.source_snapshot_sha256=:'state_dictionary_sha' AND state_version.status='approved' AND state_version.is_deleted=false
LEFT JOIN hr_legacy_dictionary_item type_item ON type_item.version_id=type_version.id AND type_item.tenant_id=type_version.tenant_id AND type_item.park_id=type_version.park_id AND type_item.is_deleted=false AND lower(coalesce(NULLIF(btrim(type_item.source_value),''),E'\\x00'))=lower(coalesce(NULLIF(btrim(staged.payload->'source'->>'legacyEventType'),''),E'\\x00'))
LEFT JOIN hr_legacy_dictionary_item state_item ON state_item.version_id=state_version.id AND state_item.tenant_id=state_version.tenant_id AND state_item.park_id=state_version.park_id AND state_item.is_deleted=false AND lower(coalesce(NULLIF(btrim(state_item.source_value),''),E'\\x00'))=lower(coalesce(NULLIF(btrim(staged.payload->'source'->>'legacyState'),''),E'\\x00'))
LEFT JOIN hr_employee employee ON employee.tenant_id=:'tenant_id' AND employee.park_id=:'park_id' AND employee.employee_code=staged.payload->'source'->>'employeeCode' AND employee.is_deleted=false;

CREATE TEMP TABLE employee_state_before AS
SELECT encode(digest(COALESCE(string_agg(concat_ws('|',id::text,employment_status,COALESCE(primary_org_id::text,''),COALESCE(position_id::text,''),COALESCE(hire_date::text,''),COALESCE(departure_date::text,'')),';' ORDER BY id::text),''),'sha256'),'hex') AS checksum
FROM hr_employee WHERE tenant_id=:'tenant_id' AND park_id=:'park_id' AND is_deleted=false;

INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at)
VALUES (:'run_id','yuzhou-v10',:'snapshot_sha',:'target_database','load','running','t1-employment-event-loader-v1',now());
INSERT INTO legacy_source_object(source_system,source_database,object_type,object_schema,object_name,source_version,checksum_sha256,metadata)
VALUES ('yuzhou-v10','manpower10','table','dbo','readjust','t1-loader-v1',:'events_sha',jsonb_build_object('rows',6887)),
       ('yuzhou-v10','manpower10','table','dbo','readjust','t1-loader-v2',:'types_sha',jsonb_build_object('domain','readjusttype_usage'))
ON CONFLICT DO NOTHING;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id'), classified AS (SELECT * FROM stg_employment_event_decision)
INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at)
SELECT b.id,'employment_event','dbo.readjust','load','running',6887,
 count(*) FILTER(WHERE employee_id IS NOT NULL AND type_decision='map' AND type_target_domain='employment_event_type' AND event_type IN('start_probation','confirm_employment','transfer','suspend','depart','resume') AND state_decision='map' AND state_target_domain='migration_decision' AND state_target_value='accepted'),0,
 count(*) FILTER(WHERE (employee_id IS NOT NULL AND type_decision='map' AND type_target_domain='employment_event_type' AND event_type IN('start_probation','confirm_employment','transfer','suspend','depart','resume') AND state_decision='map' AND state_target_domain='migration_decision' AND state_target_value='accepted') IS NOT TRUE),:'events_sha',now()
FROM b CROSS JOIN classified GROUP BY b.id;

INSERT INTO hr_employment_event(tenant_id,park_id,employee_id,event_type,effective_date,before_snapshot,after_snapshot,reason,status,
 legacy_event_no,legacy_event_type,legacy_state,source_effective_at,migration_decision,is_historical_import,remark)
SELECT :'tenant_id',:'park_id',s.employee_id,s.event_type,(s.payload->'source'->>'sourceEffectiveAt')::timestamp::date,
 jsonb_strip_nulls(jsonb_build_object('orgCode',NULLIF(s.payload->'source'->>'beforeOrgCode',''),'positionCode',NULLIF(s.payload->'source'->>'beforePositionCode',''),'employeeState',NULLIF(s.payload->'source'->>'legacyEmployeeState',''))),
 jsonb_strip_nulls(jsonb_build_object('orgCode',NULLIF(s.payload->'source'->>'afterOrgCode',''),'positionCode',NULLIF(s.payload->'source'->>'afterPositionCode',''),'employeeState',NULLIF(s.payload->'source'->>'legacyEmployeeState',''))),
 NULLIF(s.payload->'source'->>'reason',''),'effective',s.payload->'source'->>'legacyEventNo',s.payload->'source'->>'legacyEventType',s.payload->'source'->>'legacyState',
 (s.payload->'source'->>'sourceEffectiveAt')::timestamp,
 'accepted',
 true,'Migrated from Yuzhou V10; run='||:'run_id'
FROM stg_employment_event_decision s
WHERE s.employee_id IS NOT NULL AND s.type_decision='map' AND s.type_target_domain='employment_event_type'
 AND s.event_type IN('start_probation','confirm_employment','transfer','suspend','depart','resume')
 AND s.state_decision='map' AND s.state_target_domain='migration_decision' AND s.state_target_value='accepted';

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status,is_active)
SELECT b.id,'yuzhou-v10','dbo.readjust','id='||(s.payload->>'sourceKey'),s.payload->>'sourceIdentitySha256',s.payload->>'sourceRowSha256','hr_employment_event',ev.id,'loaded',true
FROM stg_employment_event_decision s CROSS JOIN b JOIN hr_employment_event ev ON ev.tenant_id=:'tenant_id' AND ev.park_id=:'park_id' AND ev.legacy_event_no=s.payload->'source'->>'legacyEventNo' AND ev.is_deleted=false;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id'), item AS (SELECT id,batch_id FROM migration_batch_item WHERE batch_id=(SELECT id FROM b) AND domain='employment_event')
INSERT INTO migration_error(batch_id,batch_item_id,category,error_code,source_identity_sha256,redacted_evidence,evidence_redacted,retryable)
SELECT b.id,item.id,'mapping',CASE WHEN s.employee_id IS NULL THEN 'EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED' WHEN (s.type_decision='map' AND s.type_target_domain='employment_event_type' AND s.event_type IN('start_probation','confirm_employment','transfer','suspend','depart','resume')) IS NOT TRUE THEN 'EMPLOYMENT_EVENT_TYPE_UNRESOLVED' ELSE 'EMPLOYMENT_EVENT_STATE_UNRESOLVED' END,s.payload->>'sourceIdentitySha256',jsonb_build_object('rule','approved_dictionary_mapping_required'),true,false
FROM stg_employment_event_decision s CROSS JOIN b JOIN item ON item.batch_id=b.id
WHERE (s.employee_id IS NOT NULL AND s.type_decision='map' AND s.type_target_domain='employment_event_type' AND s.event_type IN('start_probation','confirm_employment','transfer','suspend','depart','resume') AND s.state_decision='map' AND s.state_target_domain='migration_decision' AND s.state_target_value='accepted') IS NOT TRUE;

UPDATE migration_batch_item SET loaded_count=(SELECT count(*) FROM legacy_record_map WHERE batch_id=migration_batch_item.batch_id AND target_table='hr_employment_event'),
 status=CASE WHEN rejected_count>0 THEN 'quarantined' ELSE 'succeeded' END,finished_at=now(),update_time=now()
WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND domain='employment_event';

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id'), employee_after AS (
 SELECT encode(digest(COALESCE(string_agg(concat_ws('|',id::text,employment_status,COALESCE(primary_org_id::text,''),COALESCE(position_id::text,''),COALESCE(hire_date::text,''),COALESCE(departure_date::text,'')),';' ORDER BY id::text),''),'sha256'),'hex') checksum
 FROM hr_employee WHERE tenant_id=:'tenant_id' AND park_id=:'park_id' AND is_deleted=false
)
INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T1_EVENT_ACCOUNTING','6887'::jsonb,to_jsonb((SELECT count(*) FROM legacy_record_map WHERE batch_id=b.id AND target_table='hr_employment_event')+(SELECT count(*) FROM migration_error WHERE batch_id=b.id AND error_code IN('EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED','EMPLOYMENT_EVENT_TYPE_UNRESOLVED','EMPLOYMENT_EVENT_STATE_UNRESOLVED'))),'{}'::jsonb,
 (SELECT count(*) FROM legacy_record_map WHERE batch_id=b.id AND target_table='hr_employment_event')+(SELECT count(*) FROM migration_error WHERE batch_id=b.id AND error_code IN('EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED','EMPLOYMENT_EVENT_TYPE_UNRESOLVED','EMPLOYMENT_EVENT_STATE_UNRESOLVED'))=6887,encode(digest('T1_EVENT_ACCOUNTING:6887','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T1_EMPLOYEE_STATE_UNCHANGED',to_jsonb(before.checksum),to_jsonb(after.checksum),'{}'::jsonb,before.checksum=after.checksum,encode(digest('T1_EMPLOYEE_STATE_UNCHANGED:'||before.checksum,'sha256'),'hex') FROM b CROSS JOIN employee_state_before before CROSS JOIN employee_after after
UNION ALL SELECT b.id,'T1_LEGACY_EVENT_NO_UNIQUE','0'::jsonb,to_jsonb((SELECT count(*)-count(DISTINCT legacy_event_no) FROM hr_employment_event WHERE tenant_id=:'tenant_id' AND park_id=:'park_id' AND is_historical_import AND is_deleted=false)),'{}'::jsonb,
 (SELECT count(*)=count(DISTINCT legacy_event_no) FROM hr_employment_event WHERE tenant_id=:'tenant_id' AND park_id=:'park_id' AND is_historical_import AND is_deleted=false),encode(digest('T1_LEGACY_EVENT_NO_UNIQUE:0','sha256'),'hex') FROM b;

WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run_id')
INSERT INTO migration_rollback_point(batch_id,rollback_code,reversible_scope,cleanup_manifest,evidence_sha256,verified_at)
SELECT id,'T1_EMPLOYMENT_EVENTS',jsonb_build_object('tenantId',:'tenant_id','parkId',:'park_id','runId',:'run_id'),jsonb_build_object('strategy','legacy_record_map','targetTables',jsonb_build_array('hr_employment_event')),encode(digest(:'run_id'||':T1_EMPLOYMENT_EVENTS','sha256'),'hex'),now() FROM b;

UPDATE migration_batch SET phase='verify',status=CASE WHEN EXISTS(SELECT 1 FROM migration_check WHERE batch_id=migration_batch.id AND NOT passed) THEN 'failed' ELSE 'succeeded' END,
 counts=jsonb_build_object('eventsLoaded',(SELECT count(*) FROM legacy_record_map WHERE batch_id=migration_batch.id AND target_table='hr_employment_event'),'eventsQuarantined',(SELECT count(*) FROM migration_error WHERE batch_id=migration_batch.id),'eventsNeedsReview',0),
 finished_at=now(),update_time=now() WHERE run_id=:'run_id';
DO $$ BEGIN IF EXISTS (SELECT 1 FROM migration_batch b JOIN migration_check c ON c.batch_id=b.id WHERE b.run_id=current_setting('yuzhou.run_id') AND NOT c.passed) THEN RAISE EXCEPTION 'T1 verification failed'; END IF; END $$;
COMMIT;
SQL

docker exec "$PG_CONTAINER" psql -X -A -t -F '|' -U jinhu -d "$TARGET_DATABASE" -c "SELECT run_id,status,counts::text FROM migration_batch WHERE run_id='$RUN_ID';"
