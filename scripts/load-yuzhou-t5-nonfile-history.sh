#!/usr/bin/env sh
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_T5_NONFILE_RUN_ID:-${YUZHOU_MIGRATION_RUN_ID:-}}"
DB="${YUZHOU_TARGET_DATABASE:-}"
STAGE="${YUZHOU_T5_NONFILE_STAGING_DIR:-}"
BASELINE_FILE="${YUZHOU_T5_BASELINE_FILE:-}"
PG="${YUZHOU_POSTGRES_CONTAINER:-}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-}"
SNAPSHOT="${YUZHOU_BACKUP_SHA256:-}"
ACTOR="${YUZHOU_MATERIALIZATION_ACTOR_USER_ID:-}"
IDENTITY_RESOLUTION_FILE="${YUZHOU_T5_IDENTITY_RESOLUTION_FILE:-}"
TENANT="${YUZHOU_TARGET_TENANT_ID:-10000001}"
PARK="${YUZHOU_TARGET_PARK_ID:-20000001}"

fail(){
  case "$1" in
    "set ALLOW_YUZHOU_MIGRATION=yes") code=ALLOW_REQUIRED ;;
    "invalid nonfile run id") code=RUN_ID_INVALID ;;
    "unsafe core lab target database") code=TARGET_INVALID ;;
    "unsafe expected core compose project") code=COMPOSE_PROJECT_INVALID ;;
    "invalid backup SHA-256") code=SNAPSHOT_INVALID ;;
    "YUZHOU_MATERIALIZATION_ACTOR_USER_ID is required") code=ACTOR_REQUIRED ;;
    "nonfile stage is missing") code=STAGE_MISSING ;;
    "nonfile staging directory must be mode 0700") code=STAGING_DIR_MODE_INVALID ;;
    "nonfile manifest must be mode 0600") code=MANIFEST_MODE_INVALID ;;
    "wrong PostgreSQL compose project") code=WRONG_COMPOSE_PROJECT ;;
    "T5 candidate baseline must be a regular file") code=BASELINE_FILE_INVALID ;;
    "T5 candidate baseline must be mode 0600") code=BASELINE_MODE_INVALID ;;
    "domain items validation failed") code=DOMAIN_ITEMS_INVALID ;;
    "nonfile manifest validation failed") code=MANIFEST_INVALID ;;
    "identity resolution validation failed") code=IDENTITY_RESOLUTION_INVALID ;;
    "nonfile stage source snapshot differs from requested backup") code=SOURCE_SNAPSHOT_DRIFT ;;
    *) code=PRECONDITION_FAILED ;;
  esac
  printf 'ERROR: T5_NONFILE_%s\n' "$code" >&2
  exit 1
}
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid nonfile run id"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe core lab target database"
printf %s "$EXPECTED_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe expected core compose project"
printf %s "$SNAPSHOT" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid backup SHA-256"
printf %s "$ACTOR" | grep -Eq '^[0-9a-fA-F-]{36}$' || fail "YUZHOU_MATERIALIZATION_ACTOR_USER_ID is required"
[ -d "$STAGE" ] && [ -f "$STAGE/manifest.json" ] || fail "nonfile stage is missing"
[ "$(stat -f '%Lp' "$STAGE" 2>/dev/null || stat -c '%a' "$STAGE")" = 700 ] || fail "nonfile staging directory must be mode 0700"
[ "$(stat -f '%Lp' "$STAGE/manifest.json" 2>/dev/null || stat -c '%a' "$STAGE/manifest.json")" = 600 ] || fail "nonfile manifest must be mode 0600"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null || true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
if [ -n "$BASELINE_FILE" ]; then
  [ -f "$BASELINE_FILE" ] && [ ! -L "$BASELINE_FILE" ] || fail "T5 candidate baseline must be a regular file"
  [ "$(stat -f '%Lp' "$BASELINE_FILE" 2>/dev/null || stat -c '%a' "$BASELINE_FILE")" = 600 ] || fail "T5 candidate baseline must be mode 0600"
fi

if [ -n "$BASELINE_FILE" ]; then
  if ! ITEMS="$(node "$ROOT_DIR/scripts/hr-cutover/t5-nonfile-stage-domain-items.mjs" "$STAGE/manifest.json" --baseline "$BASELINE_FILE")"; then
    fail "domain items validation failed"
  fi
else
  if ! ITEMS="$(node "$ROOT_DIR/scripts/hr-cutover/t5-nonfile-stage-domain-items.mjs" "$STAGE/manifest.json")"; then
    fail "domain items validation failed"
  fi
fi
if ! META="$(node - "$STAGE" <<'NODE'
const {readFileSync,statSync}=require('fs'),{join}=require('path');
const stage=process.argv[2],manifest=JSON.parse(readFileSync(join(stage,'manifest.json'),'utf8'));
for(const name of ['person_core','family','knowhow','ticket']){const file=join(stage,manifest.domains?.[name]?.file??'');if((statSync(file).mode&0o777)!==0o600)throw Error(`unsafe staged file ${name}`);}
if(manifest.artifactKind!=='yuzhou_t5_nonfile_materialization_stage'||manifest.productionImport!=='HOLD'||manifest.sourceRows!==7752||manifest.businessWriteTarget!=='nonfile_employee_profile_family_skill_credential_only'||JSON.stringify(manifest.filesExcluded)!==JSON.stringify(['photo','docs']))throw Error('nonfile manifest boundary');
if(!/^[0-9a-f]{64}$/.test(manifest.sourceSnapshotSha256??'')||!/^[0-9a-f]{64}$/.test(manifest.sourceRestoreReceiptSha256??'')||!/^[0-9a-f]{64}$/.test(manifest.sourceCatalogSha256??'')||!/^[0-9a-f]{64}$/.test(manifest.mappingContractSha256??'')||!/^[0-9a-f]{64}$/.test(manifest.nonfileBusinessSha256??''))throw Error('nonfile manifest hash');
process.stdout.write(JSON.stringify({snapshot:manifest.sourceSnapshotSha256,catalog:manifest.sourceCatalogSha256,manifest:manifest.nonfileBusinessSha256}));
NODE
)"; then
  fail "nonfile manifest validation failed"
fi
MANIFEST_SNAPSHOT="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).snapshot)' "$META")"
CATALOG_HASH="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).catalog)' "$META")"
MANIFEST_HASH="$(node -e 'process.stdout.write(JSON.parse(process.argv[1]).manifest)' "$META")"
[ "$SNAPSHOT" = "$MANIFEST_SNAPSHOT" ] || fail "nonfile stage source snapshot differs from requested backup"
COMBINED="$(mktemp "${TMPDIR:-/tmp}/yuzhou-t5-nonfile.XXXXXX")"
EMPTY_RESOLUTION="$(mktemp "${TMPDIR:-/tmp}/yuzhou-t5-resolution.XXXXXX")"
LOAD_ERROR="$(mktemp "${TMPDIR:-/tmp}/yuzhou-t5-load-error.XXXXXX")"
RESOLUTION_META='{"status":"NONE","candidateCount":0,"mapCount":0,"quarantineCount":0,"resolutionSha256":null,"productionImport":"HOLD"}'
if [ -n "$IDENTITY_RESOLUTION_FILE" ]; then
  if ! RESOLUTION_META="$(node "$ROOT_DIR/scripts/verify-yuzhou-t5-identity-resolution-package.mjs" verify --stage "$STAGE" --decision "$IDENTITY_RESOLUTION_FILE")"; then
    fail "identity resolution validation failed"
  fi
  RESOLUTION_INPUT="$IDENTITY_RESOLUTION_FILE"
else
  RESOLUTION_INPUT="$EMPTY_RESOLUTION"
fi
RESOLUTION_MODE="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.status==="PASS"?"reviewed":"none")' "$RESOLUTION_META")"
RESOLUTION_HASH="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(x.resolutionSha256??"")' "$RESOLUTION_META")"
RESOLUTION_CANDIDATES="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.candidateCount))' "$RESOLUTION_META")"
RESOLUTION_MAPS="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.mapCount))' "$RESOLUTION_META")"
RESOLUTION_QUARANTINES="$(node -e 'const x=JSON.parse(process.argv[1]);process.stdout.write(String(x.quarantineCount))' "$RESOLUTION_META")"
REMOTE="/tmp/yuzhou-t5-nonfile-$RUN_ID"
cleanup(){ rm -f "$COMBINED" "$EMPTY_RESOLUTION" "$LOAD_ERROR"; docker exec "$PG" sh -c "rm -rf '$REMOTE'" >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
chmod 600 "$COMBINED"
node - "$STAGE" "$COMBINED" <<'NODE'
const {readFileSync,writeFileSync}=require('fs'),{join}=require('path');
const [stage,out]=process.argv.slice(2),manifest=JSON.parse(readFileSync(join(stage,'manifest.json'),'utf8'));
const content=['person_core','family','knowhow','ticket'].map(name=>readFileSync(join(stage,manifest.domains[name].file),'utf8')).join('');
writeFileSync(out,content,{mode:0o600});
NODE
docker exec "$PG" mkdir -p "$REMOTE"
docker cp "$COMBINED" "$PG:$REMOTE/all.jsonl"
docker cp "$RESOLUTION_INPUT" "$PG:$REMOTE/identity-resolution.json"
docker exec "$PG" sh -c "chown postgres:postgres '$REMOTE/all.jsonl' '$REMOTE/identity-resolution.json' && chmod 600 '$REMOTE/all.jsonl' '$REMOTE/identity-resolution.json'"

if ! docker exec -i "$PG" psql -X -q -v ON_ERROR_STOP=1 -U jinhu -d "$DB" \
  -v run="$RUN_ID" -v db="$DB" -v tenant="$TENANT" -v park="$PARK" -v snapshot="$SNAPSHOT" -v catalog="$CATALOG_HASH" -v manifest="$MANIFEST_HASH" -v actor="$ACTOR" -v path="$REMOTE/all.jsonl" -v resolution_path="$REMOTE/identity-resolution.json" -v resolution_mode="$RESOLUTION_MODE" -v resolution_hash="$RESOLUTION_HASH" -v resolution_candidates="$RESOLUTION_CANDIDATES" -v resolution_maps="$RESOLUTION_MAPS" -v resolution_quarantines="$RESOLUTION_QUARANTINES" -v items="$ITEMS" >/dev/null 2>"$LOAD_ERROR" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='10min';
LOCK TABLE hr_employee,sys_user,hr_employee_compensation,hr_payroll_run,hr_payslip,hr_performance_cycle,hr_performance_plan,hr_performance_item,biz_user_message IN SHARE MODE;
SELECT set_config('yuzhou.t5_run',:'run',true),set_config('yuzhou.t5_db',:'db',true),set_config('yuzhou.t5_tenant',:'tenant',true),set_config('yuzhou.t5_park',:'park',true),set_config('yuzhou.t5_actor',:'actor',true),set_config('yuzhou.t5_resolution_mode',:'resolution_mode',true);
DO $$BEGIN
 IF current_database()<>current_setting('yuzhou.t5_db') OR current_database()!~'^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;
 IF EXISTS(SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run')) THEN RAISE EXCEPTION 'duplicate migration run'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sys_user WHERE tenant_id=current_setting('yuzhou.t5_tenant') AND park_id=current_setting('yuzhou.t5_park') AND id=current_setting('yuzhou.t5_actor')::uuid AND is_deleted=false AND status='enabled') THEN RAISE EXCEPTION 'materialization actor is unavailable'; END IF;
END$$;
CREATE TEMP TABLE source_rows(payload jsonb); COPY source_rows FROM :'path';
CREATE TEMP TABLE identity_resolution_input(payload jsonb); COPY identity_resolution_input FROM :'resolution_path';
DO $$BEGIN
 IF(SELECT count(*) FROM source_rows)<>7752 THEN RAISE EXCEPTION 'T5 nonfile source count drift'; END IF;
 IF EXISTS(SELECT 1 FROM source_rows GROUP BY payload->>'sourceTable',payload->>'sourceIdentitySha256' HAVING count(*)<>1) THEN RAISE EXCEPTION 'T5 nonfile duplicate source identity'; END IF;
 IF EXISTS(SELECT 1 FROM source_rows WHERE payload->>'sourceIdentitySha256'!~'^[0-9a-f]{64}$' OR payload->>'sourceRowSha256'!~'^[0-9a-f]{64}$') THEN RAISE EXCEPTION 'T5 nonfile invalid source hash'; END IF;
 IF (SELECT count(*) FROM source_rows WHERE payload->>'sourceTable'='dbo.person.core_residue' AND payload->'materialized'->>'kind'='profile')<>2949
 OR (SELECT count(*) FROM source_rows WHERE payload->>'sourceTable'='dbo.family' AND payload->'materialized'->>'kind'='family')<>4560
 OR (SELECT count(*) FROM source_rows WHERE payload->>'sourceTable'='dbo.knowhow' AND payload->'materialized'->>'kind'='skill')<>6
 OR (SELECT count(*) FROM source_rows WHERE payload->>'sourceTable'='dbo.ticket' AND payload->'materialized'->>'kind'='credential')<>237
 OR EXISTS(SELECT 1 FROM source_rows WHERE payload->>'sourceTable' NOT IN('dbo.person.core_residue','dbo.family','dbo.knowhow','dbo.ticket')) THEN RAISE EXCEPTION 'T5 nonfile domain boundary drift'; END IF;
END$$;
CREATE TEMP TABLE protected_before AS SELECT
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee x) employee_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM sys_user x) user_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee_compensation x) compensation_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payroll_run x) payroll_run_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payslip x) payslip_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_cycle x) performance_cycle_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_plan x) performance_plan_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_item x) performance_item_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM biz_user_message x) message_hash;
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at)
VALUES(:'run','yuzhou-v10',:'snapshot',:'db','load','running','t5-nonfile-loader-v1',now());
INSERT INTO hr_legacy_t5_import_batch(tenant_id,park_id,migration_batch_id,batch_code,source_snapshot_sha256,catalog_sha256,manifest_sha256,source_row_count,loaded_row_count,quarantined_row_count,status)
SELECT :'tenant',:'park',id,:'run',:'snapshot',:'catalog',:'manifest',7752,0,7752,'unpublished' FROM migration_batch WHERE run_id=:'run';
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),v AS(SELECT item.domain,item."sourceObject" source_object,item."extractedCount" n,item."checksumSha256" h,item.status FROM jsonb_to_recordset(:'items'::jsonb) AS item(domain text,"sourceObject" text,"extractedCount" bigint,"checksumSha256" text,status text))
INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at)
SELECT b.id,v.domain,v.source_object,'load',v.status,v.n,v.n,0,0,v.h,now() FROM b CROSS JOIN v;
CREATE TEMP TABLE profile_identity_counts AS SELECT payload->'materialized'->'idNumber'->>'fingerprint' fingerprint,count(*)::bigint source_matches FROM source_rows WHERE payload->'materialized'->>'kind'='profile' AND NULLIF(payload->'materialized'->'idNumber'->>'fingerprint','') IS NOT NULL GROUP BY payload->'materialized'->'idNumber'->>'fingerprint';
DO $$BEGIN
 IF (SELECT count(*) FROM identity_resolution_input) > 1 THEN RAISE EXCEPTION 'multiple T5 identity resolution packages'; END IF;
 IF current_setting('yuzhou.t5_resolution_mode')='none' AND EXISTS(SELECT 1 FROM identity_resolution_input) THEN RAISE EXCEPTION 'unexpected T5 identity resolution package'; END IF;
 IF current_setting('yuzhou.t5_resolution_mode')='reviewed' AND (SELECT count(*) FROM identity_resolution_input)<>1 THEN RAISE EXCEPTION 'missing T5 identity resolution package'; END IF;
END$$;
CREATE TEMP TABLE reviewed_profile_resolution AS
SELECT decision->>'profileSourceIdentitySha256' profile_source_identity_sha256,decision->>'targetPersonSourceIdentitySha256' target_person_source_identity_sha256,decision->>'disposition' disposition,decision->>'reasonCode' reason_code
FROM identity_resolution_input CROSS JOIN LATERAL jsonb_array_elements(payload->'decisions') decision;
CREATE TEMP TABLE classified AS
SELECT s.payload,COALESCE(re.id,e.id) employee_id,e.matches,COALESCE(p.source_matches,0) source_matches,r.disposition resolution_disposition,r.reason_code resolution_reason_code,COALESCE(re.matches,0) reviewed_matches,
 CASE WHEN s.payload->'materialized'->>'disposition'='quarantined' THEN 'SOURCE_MATERIALIZATION_QUARANTINED'
      WHEN p.source_matches>1 AND r.disposition='map' AND re.matches=1 THEN NULL
      WHEN p.source_matches>1 AND r.disposition='quarantine' THEN 'EMPLOYEE_PROFILE_IDENTITY_REVIEWED_QUARANTINE'
      WHEN p.source_matches>1 THEN 'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS'
      WHEN EXISTS(SELECT 1 FROM hr_employee_profile x WHERE x.tenant_id=:'tenant' AND x.park_id=:'park' AND x.id_number_fingerprint=p.fingerprint AND NOT x.is_deleted) THEN 'EMPLOYEE_PROFILE_IDENTITY_CONFLICT'
      WHEN COALESCE(e.matches,0)=0 THEN 'EMPLOYEE_NOT_MAPPED'
      WHEN e.matches>1 THEN 'EMPLOYEE_MAPPING_AMBIGUOUS' END quarantine_code
FROM source_rows s LEFT JOIN LATERAL(
 SELECT min(x.id::text)::uuid id,count(*) matches FROM legacy_record_map m JOIN migration_batch mb ON mb.id=m.batch_id AND mb.status='succeeded' AND mb.target_database=current_database() JOIN hr_employee x ON x.id=m.target_id AND x.tenant_id=:'tenant' AND x.park_id=:'park' AND NOT x.is_deleted
 WHERE m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.target_table='hr_employee' AND m.mapping_status='loaded' AND m.is_active AND m.source_pk_canonical='person='||(s.payload->>'employeeCode')
)e ON true LEFT JOIN profile_identity_counts p ON p.fingerprint=s.payload->'materialized'->'idNumber'->>'fingerprint'
LEFT JOIN reviewed_profile_resolution r ON r.profile_source_identity_sha256=s.payload->>'sourceIdentitySha256'
LEFT JOIN LATERAL(
 SELECT min(x.id::text)::uuid id,count(*) matches FROM legacy_record_map m JOIN migration_batch mb ON mb.id=m.batch_id AND mb.status='succeeded' AND mb.target_database=current_database() JOIN hr_employee x ON x.id=m.target_id AND x.tenant_id=:'tenant' AND x.park_id=:'park' AND NOT x.is_deleted
 WHERE m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.target_table='hr_employee' AND m.mapping_status='loaded' AND m.is_active AND m.source_identity_sha256=r.target_person_source_identity_sha256
)re ON r.disposition='map';
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM classified WHERE resolution_disposition='map' AND reviewed_matches<>1) THEN RAISE EXCEPTION 'reviewed T5 identity resolution target is unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM classified c JOIN hr_employee_profile x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND NOT x.is_deleted WHERE c.quarantine_code IS NULL AND c.payload->'materialized'->>'kind'='profile')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_family x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND NOT x.is_deleted WHERE c.quarantine_code IS NULL AND c.payload->'materialized'->>'kind'='family')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_skill x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND NOT x.is_deleted WHERE c.quarantine_code IS NULL AND c.payload->'materialized'->>'kind'='skill')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_credential x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND NOT x.is_deleted WHERE c.quarantine_code IS NULL AND c.payload->'materialized'->>'kind'='credential') THEN RAISE EXCEPTION 'legacy employee materialization source already exists; rollback is required'; END IF;
END$$;
INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,id_type,id_number_encrypted,id_number_masked,id_number_fingerprint,gender,date_of_birth,ethnicity,native_place,political_status,marital_status,health_status,address,home_phone,personal_mobile,personal_email,highest_education,major,degree,graduation_school,graduation_date,foreign_language,job_title,job_grade,source_snapshot,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'idType',m->'idNumber'->>'encrypted',m->'idNumber'->>'masked',m->'idNumber'->>'fingerprint',m->>'gender',NULLIF(m->>'dateOfBirth','')::date,m->>'ethnicity',m->>'nativePlace',m->>'politicalStatus',m->>'maritalStatus',m->>'healthStatus',m->>'address',m->>'homePhone',m->>'personalMobile',m->>'personalEmail',m->>'highestEducation',m->>'major',m->>'degree',m->>'graduationSchool',NULLIF(m->>'graduationDate','')::date,m->>'foreignLanguage',m->>'jobTitle',m->>'jobGrade',jsonb_build_object('source','yuzhou-v10','sourceIdentitySha256',c.payload->>'sourceIdentitySha256'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor' FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)z WHERE c.quarantine_code IS NULL AND m->>'kind'='profile';
INSERT INTO hr_employee_family(tenant_id,park_id,employee_id,relationship,full_name_encrypted,full_name_masked,full_name_fingerprint,contact_encrypted,contact_masked,contact_fingerprint,birth_date,work_unit,job_title,political_status,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'relationship',m->'fullName'->>'encrypted',m->'fullName'->>'masked',m->'fullName'->>'fingerprint',m->'contact'->>'encrypted',m->'contact'->>'masked',m->'contact'->>'fingerprint',NULLIF(m->>'birthDate','')::date,m->>'workUnit',m->>'jobTitle',m->>'politicalStatus',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor' FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)z WHERE c.quarantine_code IS NULL AND m->>'kind'='family';
INSERT INTO hr_employee_skill(tenant_id,park_id,employee_id,skill_name,proficiency,legacy_grade,note,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'skillName',NULL,m->>'legacyGrade',m->>'note',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor' FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)z WHERE c.quarantine_code IS NULL AND m->>'kind'='skill';
INSERT INTO hr_employee_credential(tenant_id,park_id,employee_id,credential_type,credential_name,number_encrypted,number_masked,number_fingerprint,issuing_authority,acquired_date,valid_to,note,legacy_file_reference_sha256,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'credentialType',m->>'credentialName',m->'number'->>'encrypted',m->'number'->>'masked',m->'number'->>'fingerprint',m->>'issuingAuthority',NULLIF(m->>'acquiredDate','')::date,NULLIF(m->>'validTo','')::date,m->>'note',m->>'legacyFileReferenceSha256',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor' FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)z WHERE c.quarantine_code IS NULL AND m->>'kind'='credential';
INSERT INTO hr_legacy_employee_materialization_gap(tenant_id,park_id,source_table,source_identity_sha256,source_row_sha256,field_locator,reason_code)
SELECT :'tenant',:'park',c.payload->>'sourceTable',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',gap->>'fieldLocator',gap->>'reasonCode' FROM classified c CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload->'materialized'->'gaps','[]'::jsonb))gap WHERE c.quarantine_code IS NULL ON CONFLICT DO NOTHING;
INSERT INTO hr_legacy_t5_record(tenant_id,park_id,import_batch_id,employee_id,domain,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,mapping_status,record_payload)
SELECT :'tenant',:'park',b.id,c.employee_id,c.payload->>'domain',c.payload->>'sourceTable','id='||(c.payload->>'sourceKey'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256','employee_mapped',c.payload->'source' FROM classified c CROSS JOIN hr_legacy_t5_import_batch b WHERE b.batch_code=:'run' AND c.quarantine_code IS NULL;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),targets AS(SELECT id,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256 FROM hr_legacy_t5_record WHERE import_batch_id=(SELECT id FROM hr_legacy_t5_import_batch WHERE batch_code=:'run'))
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10',t.source_table,t.source_pk_canonical,t.source_identity_sha256,t.source_row_sha256,'hr_legacy_t5_record',t.id,'loaded' FROM b CROSS JOIN targets t;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10',c.payload->>'sourceTable','id='||(c.payload->>'sourceKey'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256','hr_legacy_t5_quarantine',NULL,'quarantined' FROM b CROSS JOIN classified c WHERE c.quarantine_code IS NOT NULL;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_error(batch_id,batch_item_id,category,error_code,source_identity_sha256,redacted_evidence,evidence_redacted,retryable)
SELECT b.id,i.id,'mapping',c.quarantine_code,c.payload->>'sourceIdentitySha256',jsonb_build_object('sourceTable',c.payload->>'sourceTable','rule',lower(c.quarantine_code)),true,false FROM b CROSS JOIN classified c JOIN migration_batch_item i ON i.batch_id=b.id AND i.source_object=c.payload->>'sourceTable' WHERE c.quarantine_code IS NOT NULL;
UPDATE migration_batch_item i SET loaded_count=(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='loaded'),rejected_count=(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined'),valid_count=extracted_count-(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined'),status=CASE WHEN EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined') THEN'quarantined' ELSE'succeeded'END,finished_at=now() WHERE i.batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
UPDATE hr_legacy_t5_import_batch b SET loaded_row_count=x.loaded,quarantined_row_count=7752-x.loaded,status='staged',update_time=now() FROM(SELECT count(*) FILTER(WHERE mapping_status='loaded') loaded FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run'))x WHERE b.batch_code=:'run';
DO $$DECLARE source_count bigint;map_count bigint;error_count bigint;BEGIN
 SELECT count(*) INTO source_count FROM source_rows; SELECT count(*) INTO map_count FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run')); SELECT count(*) INTO error_count FROM migration_error WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run'));
 IF map_count<>source_count THEN RAISE EXCEPTION 'T5 nonfile record-map conservation failed'; END IF;
 IF error_count<>(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run') AND mapping_status='quarantined')) THEN RAISE EXCEPTION 'T5 nonfile quarantine evidence conservation failed'; END IF;
 IF EXISTS(SELECT 1 FROM migration_batch_item WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run')) AND extracted_count<>loaded_count+rejected_count) THEN RAISE EXCEPTION 'T5 nonfile per-source conservation failed'; END IF;
END$$;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),a AS(SELECT loaded_row_count l,quarantined_row_count q FROM hr_legacy_t5_import_batch WHERE batch_code=:'run') INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_NONFILE_SOURCE_ACCOUNTING',to_jsonb(7752),to_jsonb(a.l+a.q),'{}'::jsonb,a.l+a.q=7752,encode(digest('T5_NONFILE_SOURCE_ACCOUNTING:7752','sha256'),'hex') FROM b CROSS JOIN a
UNION ALL SELECT b.id,'T5_NONFILE_FILES_EXCLUDED',jsonb_build_array('photo','docs'),jsonb_build_array('photo','docs'),'{}'::jsonb,true,encode(digest('T5_NONFILE_FILES_EXCLUDED','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T5_NONFILE_NO_FILE_EVIDENCE',to_jsonb(0),to_jsonb((SELECT count(*) FROM hr_legacy_t5_file_evidence f JOIN hr_legacy_t5_import_batch s ON s.id=f.import_batch_id WHERE s.batch_code=:'run')),'{}'::jsonb,(SELECT count(*) FROM hr_legacy_t5_file_evidence f JOIN hr_legacy_t5_import_batch s ON s.id=f.import_batch_id WHERE s.batch_code=:'run')=0,encode(digest('T5_NONFILE_NO_FILE_EVIDENCE','sha256'),'hex') FROM b;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_NONFILE_IDENTITY_RESOLUTION_BOUND',jsonb_build_object('mode',:'resolution_mode','candidateCount',:'resolution_candidates'::int,'mapCount',:'resolution_maps'::int,'quarantineCount',:'resolution_quarantines'::int),jsonb_build_object('mode',:'resolution_mode','candidateCount',(SELECT count(*) FROM reviewed_profile_resolution),'mapCount',(SELECT count(*) FROM reviewed_profile_resolution WHERE disposition='map'),'quarantineCount',(SELECT count(*) FROM reviewed_profile_resolution WHERE disposition='quarantine'),'resolutionSha256',NULLIF(:'resolution_hash','')),'{}'::jsonb,(CASE WHEN :'resolution_mode'='none' THEN (SELECT count(*) FROM reviewed_profile_resolution)=0 ELSE (SELECT count(*) FROM reviewed_profile_resolution)=:'resolution_candidates'::int END),encode(digest('T5_NONFILE_IDENTITY_RESOLUTION_BOUND:'||:'resolution_mode'||':'||COALESCE(NULLIF(:'resolution_hash',''),'none'),'sha256'),'hex') FROM b;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_NONFILE_ONLINE_STATE_UNCHANGED',to_jsonb(p),to_jsonb(a),'{}'::jsonb,p=a,encode(digest(to_jsonb(p)::text,'sha256'),'hex') FROM b CROSS JOIN protected_before p CROSS JOIN(SELECT
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee x) employee_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM sys_user x) user_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee_compensation x) compensation_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payroll_run x) payroll_run_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payslip x) payslip_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_cycle x) performance_cycle_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_plan x) performance_plan_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_item x) performance_item_hash,(SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM biz_user_message x) message_hash)a;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_rollback_point(batch_id,rollback_code,reversible_scope,cleanup_manifest,evidence_sha256,verified_at)
SELECT b.id,'T5_LEGACY_HISTORY',jsonb_build_object('runId',:'run','filesExcluded',jsonb_build_array('photo','docs')),jsonb_build_object('strategy','exact_nonfile_record_maps','identityResolutionMode',:'resolution_mode','identityResolutionSha256',NULLIF(:'resolution_hash',''),'targetTables',jsonb_build_array('hr_legacy_employee_materialization_gap','hr_employee_credential','hr_employee_skill','hr_employee_family','hr_employee_profile','hr_legacy_t5_record')),encode(digest(:'run'||':T5_LEGACY_HISTORY','sha256'),'hex'),now() FROM b;
UPDATE migration_batch SET phase='verify',status=CASE WHEN EXISTS(SELECT 1 FROM migration_check WHERE batch_id=migration_batch.id AND NOT passed)THEN'failed'ELSE'succeeded'END,counts=(SELECT jsonb_build_object('source',source_row_count,'loaded',loaded_row_count,'quarantined',quarantined_row_count) FROM hr_legacy_t5_import_batch WHERE migration_batch_id=migration_batch.id),finished_at=now() WHERE run_id=:'run';
DO $$BEGIN IF EXISTS(SELECT 1 FROM migration_check c JOIN migration_batch b ON b.id=c.batch_id WHERE b.run_id=current_setting('yuzhou.t5_run') AND NOT c.passed) THEN RAISE EXCEPTION 'T5 nonfile verification failed'; END IF; END$$;
COMMIT;
SQL
then
  if grep -q 'canceling statement due to statement timeout' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_STATEMENT_TIMEOUT'
  fi
  if grep -q 'T5 nonfile source count drift' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_SOURCE_COUNT_DRIFT'
  fi
  if grep -q 'T5 nonfile duplicate source identity' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_DUPLICATE_SOURCE_IDENTITY'
  fi
  if grep -q 'T5 nonfile invalid source hash' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_SOURCE_HASH_INVALID'
  fi
  if grep -q 'T5 nonfile domain boundary drift' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_DOMAIN_BOUNDARY_DRIFT'
  fi
  if grep -q 'T5 nonfile record-map conservation failed' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_RECORD_MAP_CONSERVATION_FAILED'
  fi
  if grep -q 'T5 nonfile quarantine evidence conservation failed' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_QUARANTINE_CONSERVATION_FAILED'
  fi
  if grep -q 'T5 nonfile per-source conservation failed' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_PER_SOURCE_CONSERVATION_FAILED'
  fi
  if grep -q 'T5 nonfile verification failed' "$LOAD_ERROR"; then
    fail 'T5_NONFILE_TRANSACTION_VERIFICATION_FAILED'
  fi
  fail 'T5_NONFILE_TRANSACTION_REJECTED'
fi
docker exec "$PG" psql -X -q -A -t -F '|' -U jinhu -d "$DB" -c "SELECT status,counts->>'source',counts->>'loaded',counts->>'quarantined' FROM migration_batch WHERE run_id='$RUN_ID'"
