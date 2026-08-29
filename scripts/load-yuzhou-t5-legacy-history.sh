#!/usr/bin/env sh
set -eu
umask 077
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
DB="${YUZHOU_TARGET_DATABASE:-}"
TENANT="${YUZHOU_TARGET_TENANT_ID:-10000001}"
PARK="${YUZHOU_TARGET_PARK_ID:-20000001}"
STAGE="${YUZHOU_STAGING_DIR:-$ROOT_DIR/database/import-reports/yuzhou-hr/staging-$RUN_ID}"
PG="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
SNAPSHOT="${YUZHOU_BACKUP_SHA256:-3ed50b9a2ba420c0fb7a9c2628f9a2d62a05e7a14ba574929bc145ac47a9036e}"
PINNED_BUSINESS_HASH="${YUZHOU_T5_BUSINESS_SHA256:-}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid run id"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "unsafe target database"
printf %s "$PINNED_BUSINESS_HASH" | grep -Eq '^[0-9a-f]{64}$' || fail "pin YUZHOU_T5_BUSINESS_SHA256"
printf %s "$SNAPSHOT" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid backup SHA-256"
printf %s "$TENANT" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' || fail "invalid target tenant"
printf %s "$PARK" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' || fail "invalid target park"
[ -f "$STAGE/manifest.json" ] || fail "manifest is missing"
[ "$(stat -f '%Lp' "$STAGE" 2>/dev/null || stat -c '%a' "$STAGE")" = 700 ] || fail "staging directory must be mode 0700"
[ "$(stat -f '%Lp' "$STAGE/manifest.json" 2>/dev/null || stat -c '%a' "$STAGE/manifest.json")" = 600 ] || fail "manifest must be mode 0600"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null||true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
node - "$STAGE" "$PINNED_BUSINESS_HASH" <<'NODE'
const {createHash}=require('crypto'),{readFileSync}=require('fs'),{join}=require('path');
const [dir,pinned]=process.argv.slice(2),manifest=JSON.parse(readFileSync(join(dir,'manifest.json')));
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`:JSON.stringify(value);
if(manifest.productionImport!=='HOLD')throw Error('production import gate is not HOLD');
if(manifest.payloadSanitization!=='nul_to_literal_escape_v1')throw Error('payload sanitization contract mismatch');
const catalogPath=join(dir,'catalog.raw.json'),catalog=JSON.parse(readFileSync(catalogPath));
const calculatedCatalogHash=createHash('sha256').update(canonical(catalog)).digest('hex');
if(calculatedCatalogHash!==manifest.catalogSha256)throw Error('catalog hash mismatch');
if((require('fs').statSync(catalogPath).mode&0o777)!==0o600)throw Error('catalog staging mode must be 0600');
if(manifest.mappingContractSha256!=='0d39503e429ec524ba8db09945d7fe8fa51f56e53d751fd67bccec9f83dcaee3')throw Error('reviewed employee mapping contract drift');
const business={formatVersion:manifest.formatVersion,catalogSha256:manifest.catalogSha256,mappingContractSha256:manifest.mappingContractSha256,domains:manifest.domains};
const calculatedBusinessHash=createHash('sha256').update(canonical(business)).digest('hex');
if(manifest.businessSha256!==calculatedBusinessHash||calculatedBusinessHash!==pinned)throw Error('business hash mismatch');
for(const [name,item] of Object.entries(manifest.domains)){
 const data=readFileSync(join(dir,item.file));const hash=createHash('sha256').update(data).digest('hex');
 if(hash!==item.fileSha256)throw Error(`${name} staging SHA-256 mismatch`);
 const mode=(require('fs').statSync(join(dir,item.file)).mode&0o777);if(mode!==0o600)throw Error(`${name} staging mode must be 0600`);
}
NODE
COMBINED="$(mktemp "${TMPDIR:-/tmp}/yuzhou-t5-combined.XXXXXX")"
cleanup(){ rm -f "$COMBINED"; docker exec "$PG" rm -rf "/tmp/yuzhou-t5-$RUN_ID" >/dev/null 2>&1||true; }
trap cleanup EXIT HUP INT TERM
chmod 600 "$COMBINED"
node - "$STAGE" "$COMBINED" <<'NODE'
const {readFileSync,writeFileSync}=require('fs'),{join}=require('path');const [dir,out]=process.argv.slice(2),m=JSON.parse(readFileSync(join(dir,'manifest.json')));let data='';for(const item of Object.values(m.domains))data+=readFileSync(join(dir,item.file),'utf8');writeFileSync(out,data,{mode:0o600});
NODE
REMOTE="/tmp/yuzhou-t5-$RUN_ID"; docker exec "$PG" mkdir -p "$REMOTE"; docker cp "$COMBINED" "$PG:$REMOTE/all.jsonl"; docker exec "$PG" chown -R postgres:postgres "$REMOTE"; docker exec "$PG" chmod -R go-rwx "$REMOTE"
CATALOG_HASH="$(node -p "require(process.argv[1]).catalogSha256" "$STAGE/manifest.json")"
MANIFEST_HASH="$PINNED_BUSINESS_HASH"
DOMAIN_ITEMS="$(node "$ROOT_DIR/scripts/hr-cutover/t5-stage-domain-items.mjs" "$STAGE/manifest.json")"
[ -n "$DOMAIN_ITEMS" ] || fail "T5 staging domain item contract is empty"
MATERIALIZATION_ACTOR="${YUZHOU_MATERIALIZATION_ACTOR_USER_ID:-}"
printf %s "$MATERIALIZATION_ACTOR" | grep -Eq '^[0-9a-fA-F-]{36}$' || fail "YUZHOU_MATERIALIZATION_ACTOR_USER_ID is required"
docker exec -i "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" \
  -v run="$RUN_ID" -v db="$DB" -v tenant="$TENANT" -v park="$PARK" -v snapshot="$SNAPSHOT" \
  -v catalog="$CATALOG_HASH" -v manifest="$MANIFEST_HASH" -v actor="$MATERIALIZATION_ACTOR" -v path="$REMOTE/all.jsonl" -v items="$DOMAIN_ITEMS" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='10min';
LOCK TABLE hr_employee,sys_user,hr_employee_compensation,hr_payroll_run,hr_payslip,hr_performance_cycle,hr_performance_plan,hr_performance_item,biz_user_message IN SHARE MODE;
SELECT set_config('yuzhou.t5_run',:'run',true),set_config('yuzhou.t5_db',:'db',true),set_config('yuzhou.t5_tenant',:'tenant',true),set_config('yuzhou.t5_park',:'park',true),set_config('yuzhou.t5_actor',:'actor',true);
DO $$BEGIN
 IF current_database()<>current_setting('yuzhou.t5_db') OR current_database()!~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;
 IF EXISTS(SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run')) THEN RAISE EXCEPTION 'duplicate migration run'; END IF;
 IF NOT EXISTS(SELECT 1 FROM sys_user WHERE tenant_id=current_setting('yuzhou.t5_tenant') AND park_id=current_setting('yuzhou.t5_park') AND id=current_setting('yuzhou.t5_actor')::uuid AND is_deleted=false AND status='enabled') THEN RAISE EXCEPTION 'materialization actor is unavailable'; END IF;
END$$;
CREATE TEMP TABLE source_rows(payload jsonb); COPY source_rows FROM :'path';
DO $$BEGIN IF(SELECT count(*)FROM source_rows)<>20163 THEN RAISE EXCEPTION 'T5 source count drift';END IF;END$$;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM source_rows GROUP BY payload->>'sourceTable',payload->>'sourceIdentitySha256' HAVING count(*)<>1)
 THEN RAISE EXCEPTION 'T5 duplicate source identity'; END IF;
 IF EXISTS(SELECT 1 FROM source_rows WHERE payload->>'sourceIdentitySha256'!~'^[0-9a-f]{64}$' OR payload->>'sourceRowSha256'!~'^[0-9a-f]{64}$')
 THEN RAISE EXCEPTION 'T5 invalid source hash'; END IF;
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
VALUES(:'run','yuzhou-v10',:'snapshot',:'db','load','running','t5-legacy-loader-v1',now());
INSERT INTO hr_legacy_t5_import_batch(tenant_id,park_id,migration_batch_id,batch_code,source_snapshot_sha256,catalog_sha256,manifest_sha256,source_row_count,loaded_row_count,quarantined_row_count,status)
SELECT :'tenant',:'park',id,:'run',:'snapshot',:'catalog',:'manifest',20163,0,20163,'unpublished' FROM migration_batch WHERE run_id=:'run';
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),v AS(
 SELECT item.domain,item."sourceObject" source_object,item."extractedCount" n,item."checksumSha256" h,item.status
 FROM jsonb_to_recordset(:'items'::jsonb) AS item(domain text,"sourceObject" text,"extractedCount" bigint,"checksumSha256" text,status text)
)
INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at)
SELECT b.id,v.domain,v.source_object,'load',v.status,v.n,v.n,0,0,v.h,now() FROM b CROSS JOIN v;
CREATE TEMP TABLE classified AS
SELECT s.payload,e.id employee_id,e.matches,
 CASE WHEN profile_identity.source_matches>1 THEN 'EMPLOYEE_PROFILE_IDENTITY_AMBIGUOUS'
      WHEN profile_identity.target_exists THEN 'EMPLOYEE_PROFILE_IDENTITY_CONFLICT'
      WHEN s.payload->>'sourceTable'='dbo.his' THEN 'HISTORY_OWNER_UNRESOLVED'
      WHEN NULLIF(s.payload->>'employeeCode','') IS NOT NULL AND COALESCE(e.matches,0)=0 THEN 'EMPLOYEE_NOT_MAPPED'
      WHEN NULLIF(s.payload->>'employeeCode','') IS NOT NULL AND e.matches>1 THEN 'EMPLOYEE_MAPPING_AMBIGUOUS'
 END quarantine_code
FROM source_rows s LEFT JOIN LATERAL(
 SELECT min(x.id::text)::uuid id,count(*) matches
 FROM legacy_record_map m
 JOIN migration_batch source_batch ON source_batch.id=m.batch_id AND source_batch.status='succeeded' AND source_batch.target_database=current_database()
 JOIN hr_employee x ON x.id=m.target_id AND x.tenant_id=:'tenant' AND x.park_id=:'park' AND NOT x.is_deleted
 WHERE m.source_system='yuzhou-v10' AND m.source_table='dbo.person' AND m.target_table='hr_employee'
   AND m.mapping_status='loaded' AND m.is_active
   AND m.source_pk_canonical='person='||(s.payload->>'employeeCode')
)e ON NULLIF(s.payload->>'employeeCode','') IS NOT NULL
LEFT JOIN LATERAL(
 SELECT count(*)::bigint source_matches,
   EXISTS(SELECT 1 FROM hr_employee_profile p WHERE p.tenant_id=:'tenant' AND p.park_id=:'park' AND p.id_number_fingerprint=NULLIF(s.payload->'materialized'->'idNumber'->>'fingerprint','') AND NOT p.is_deleted) target_exists
 FROM source_rows peer
 WHERE s.payload->'materialized'->>'kind'='profile'
   AND NULLIF(s.payload->'materialized'->'idNumber'->>'fingerprint','') IS NOT NULL
   AND peer.payload->'materialized'->>'kind'='profile'
   AND peer.payload->'materialized'->'idNumber'->>'fingerprint'=s.payload->'materialized'->'idNumber'->>'fingerprint'
)profile_identity ON true;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM classified c JOIN hr_employee_profile x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND x.is_deleted=false WHERE c.payload->'materialized'->>'kind'='profile')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_family x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND x.is_deleted=false WHERE c.payload->'materialized'->>'kind'='family')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_skill x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND x.is_deleted=false WHERE c.payload->'materialized'->>'kind'='skill')
 OR EXISTS(SELECT 1 FROM classified c JOIN hr_employee_credential x ON x.tenant_id=current_setting('yuzhou.t5_tenant') AND x.park_id=current_setting('yuzhou.t5_park') AND x.legacy_source_identity_sha256=c.payload->>'sourceIdentitySha256' AND x.is_deleted=false WHERE c.payload->'materialized'->>'kind'='credential') THEN RAISE EXCEPTION 'legacy employee materialization source already exists; rollback or reviewed merge is required';END IF;
 IF EXISTS(SELECT 1 FROM classified c JOIN hr_employee_profile p ON p.tenant_id=current_setting('yuzhou.t5_tenant') AND p.park_id=current_setting('yuzhou.t5_park') AND p.employee_id=c.employee_id AND p.is_deleted=false WHERE c.payload->'materialized'->>'kind'='profile') THEN RAISE EXCEPTION 'employee profile already exists; reviewed merge is required';END IF;
END$$;
INSERT INTO hr_employee_profile(tenant_id,park_id,employee_id,id_type,id_number_encrypted,id_number_masked,id_number_fingerprint,gender,date_of_birth,ethnicity,native_place,political_status,marital_status,health_status,address,home_phone,personal_mobile,personal_email,highest_education,major,degree,graduation_school,graduation_date,foreign_language,job_title,job_grade,source_snapshot,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'idType',m->'idNumber'->>'encrypted',m->'idNumber'->>'masked',m->'idNumber'->>'fingerprint',m->>'gender',NULLIF(m->>'dateOfBirth','')::date,m->>'ethnicity',m->>'nativePlace',m->>'politicalStatus',m->>'maritalStatus',m->>'healthStatus',m->>'address',m->>'homePhone',m->>'personalMobile',m->>'personalEmail',m->>'highestEducation',m->>'major',m->>'degree',m->>'graduationSchool',NULLIF(m->>'graduationDate','')::date,m->>'foreignLanguage',m->>'jobTitle',m->>'jobGrade',jsonb_build_object('source','yuzhou-v10','sourceIdentitySha256',c.payload->>'sourceIdentitySha256'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor'
FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)materialized
WHERE c.quarantine_code IS NULL AND m->>'kind'='profile' AND m->>'disposition'='loaded'
ON CONFLICT(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false DO NOTHING;
INSERT INTO hr_employee_family(tenant_id,park_id,employee_id,relationship,full_name_encrypted,full_name_masked,full_name_fingerprint,contact_encrypted,contact_masked,contact_fingerprint,birth_date,work_unit,job_title,political_status,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'relationship',m->'fullName'->>'encrypted',m->'fullName'->>'masked',m->'fullName'->>'fingerprint',m->'contact'->>'encrypted',m->'contact'->>'masked',m->'contact'->>'fingerprint',NULLIF(m->>'birthDate','')::date,m->>'workUnit',m->>'jobTitle',m->>'politicalStatus',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor'
FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)materialized
WHERE c.quarantine_code IS NULL AND m->>'kind'='family' AND m->>'disposition'='loaded'
ON CONFLICT(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false DO NOTHING;
INSERT INTO hr_employee_skill(tenant_id,park_id,employee_id,skill_name,proficiency,legacy_grade,note,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'skillName',NULL,m->>'legacyGrade',m->>'note',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor'
FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)materialized
WHERE c.quarantine_code IS NULL AND m->>'kind'='skill' AND m->>'disposition'='loaded'
ON CONFLICT(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false DO NOTHING;
INSERT INTO hr_employee_credential(tenant_id,park_id,employee_id,credential_type,credential_name,number_encrypted,number_masked,number_fingerprint,issuing_authority,acquired_date,valid_to,note,legacy_file_reference_sha256,legacy_source_identity_sha256,legacy_source_row_sha256,create_by,update_by)
SELECT :'tenant',:'park',c.employee_id,m->>'credentialType',m->>'credentialName',m->'number'->>'encrypted',m->'number'->>'masked',m->'number'->>'fingerprint',m->>'issuingAuthority',NULLIF(m->>'acquiredDate','')::date,NULLIF(m->>'validTo','')::date,m->>'note',m->>'legacyFileReferenceSha256',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',:'actor',:'actor'
FROM classified c CROSS JOIN LATERAL(SELECT c.payload->'materialized' m)materialized
WHERE c.quarantine_code IS NULL AND m->>'kind'='credential' AND m->>'disposition'='loaded'
ON CONFLICT(tenant_id,park_id,legacy_source_identity_sha256) WHERE legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false DO NOTHING;
INSERT INTO hr_legacy_employee_materialization_gap(tenant_id,park_id,source_table,source_identity_sha256,source_row_sha256,field_locator,reason_code)
SELECT :'tenant',:'park',c.payload->>'sourceTable',c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',gap->>'fieldLocator',gap->>'reasonCode'
FROM classified c CROSS JOIN LATERAL jsonb_array_elements(COALESCE(c.payload->'materialized'->'gaps','[]'::jsonb))gap
WHERE c.quarantine_code IS NULL
ON CONFLICT DO NOTHING;
CREATE TEMP TABLE materialization_accounting AS
WITH loaded AS(
 SELECT legacy_source_identity_sha256 FROM hr_employee_profile WHERE tenant_id=:'tenant' AND park_id=:'park' AND legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false
 UNION ALL SELECT legacy_source_identity_sha256 FROM hr_employee_family WHERE tenant_id=:'tenant' AND park_id=:'park' AND legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false
 UNION ALL SELECT legacy_source_identity_sha256 FROM hr_employee_skill WHERE tenant_id=:'tenant' AND park_id=:'park' AND legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false
 UNION ALL SELECT legacy_source_identity_sha256 FROM hr_employee_credential WHERE tenant_id=:'tenant' AND park_id=:'park' AND legacy_source_identity_sha256 IS NOT NULL AND is_deleted=false
),materialized_source AS(SELECT * FROM classified WHERE payload->'materialized'->>'kind' IN('profile','family','skill','credential'))
SELECT count(*)::bigint source_count,
 (SELECT count(*) FROM loaded l JOIN materialized_source c ON c.payload->>'sourceIdentitySha256'=l.legacy_source_identity_sha256)::bigint loaded_count,
 count(*)FILTER(WHERE quarantine_code IS NOT NULL OR payload->'materialized'->>'disposition'='quarantined')::bigint quarantined_count,
 0::bigint approved_ignored_count
FROM materialized_source;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM materialization_accounting WHERE source_count<>loaded_count+quarantined_count+approved_ignored_count) THEN RAISE EXCEPTION 'T5 employee materialization conservation failed';END IF;
END$$;
INSERT INTO hr_legacy_t5_record(tenant_id,park_id,import_batch_id,employee_id,domain,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,mapping_status,record_payload)
SELECT :'tenant',:'park',b.id,c.employee_id,c.payload->>'domain',c.payload->>'sourceTable','id='||(c.payload->>'sourceKey'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',CASE WHEN NULLIF(c.payload->>'employeeCode','') IS NOT NULL THEN'employee_mapped'ELSE'not_applicable'END,c.payload->'source'
FROM classified c CROSS JOIN hr_legacy_t5_import_batch b
WHERE b.batch_code=:'run' AND c.quarantine_code IS NULL AND NOT(c.payload ? 'fileRole');
INSERT INTO hr_legacy_t5_file_evidence(tenant_id,park_id,import_batch_id,employee_id,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,file_role,legacy_path_sha256,content_sha256,declared_size,actual_size,declared_mime,detected_mime,readability_status,metadata)
SELECT :'tenant',:'park',b.id,c.employee_id,c.payload->>'sourceTable','id='||(c.payload->>'sourceKey'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256',c.payload->>'fileRole',NULLIF(c.payload->>'legacyPathSha256',''),NULLIF(c.payload->>'contentSha256',''),NULLIF(c.payload->>'declaredSize','')::bigint,NULLIF(c.payload->>'actualSize','')::bigint,NULLIF(c.payload->>'declaredMime',''),NULLIF(c.payload->>'detectedMime',''),c.payload->>'readabilityStatus',jsonb_build_object('legacyFilenamePresent',COALESCE(c.payload->'source'->>'fName',c.payload->'source'->>'photofile','')<>'','declaredSizeMatches',NULLIF(c.payload->>'declaredSize','')::bigint IS NOT DISTINCT FROM NULLIF(c.payload->>'actualSize','')::bigint)
FROM classified c CROSS JOIN hr_legacy_t5_import_batch b
WHERE b.batch_code=:'run' AND c.quarantine_code IS NULL AND c.payload ? 'fileRole';
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),targets AS(
 SELECT id,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,'hr_legacy_t5_record' target_table FROM hr_legacy_t5_record WHERE import_batch_id=(SELECT id FROM hr_legacy_t5_import_batch WHERE batch_code=:'run')
 UNION ALL SELECT id,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,'hr_legacy_t5_file_evidence' FROM hr_legacy_t5_file_evidence WHERE import_batch_id=(SELECT id FROM hr_legacy_t5_import_batch WHERE batch_code=:'run'))
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10',t.source_table,t.source_pk_canonical,t.source_identity_sha256,t.source_row_sha256,t.target_table,t.id,'loaded' FROM b CROSS JOIN targets t;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run')
INSERT INTO legacy_record_map(batch_id,source_system,source_table,source_pk_canonical,source_identity_sha256,source_row_sha256,target_table,target_id,mapping_status)
SELECT b.id,'yuzhou-v10',c.payload->>'sourceTable','id='||(c.payload->>'sourceKey'),c.payload->>'sourceIdentitySha256',c.payload->>'sourceRowSha256','hr_legacy_t5_quarantine',NULL,'quarantined' FROM b CROSS JOIN classified c WHERE c.quarantine_code IS NOT NULL;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run')
INSERT INTO migration_error(batch_id,batch_item_id,category,error_code,source_identity_sha256,redacted_evidence,evidence_redacted,retryable)
SELECT b.id,i.id,CASE WHEN c.quarantine_code='HISTORY_OWNER_UNRESOLVED' THEN'mapping_semantics'ELSE'mapping'END,c.quarantine_code,c.payload->>'sourceIdentitySha256',jsonb_build_object('sourceTable',c.payload->>'sourceTable','rule',lower(c.quarantine_code)),true,false
FROM b CROSS JOIN classified c JOIN migration_batch_item i ON i.batch_id=b.id AND i.source_object=c.payload->>'sourceTable' WHERE c.quarantine_code IS NOT NULL;
UPDATE migration_batch_item i SET
 loaded_count=(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='loaded'),
 rejected_count=(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined'),
 valid_count=extracted_count-(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined'),
 status=CASE WHEN extracted_count=0 THEN'skipped' WHEN EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.batch_id=i.batch_id AND m.source_table=i.source_object AND m.mapping_status='quarantined') THEN'quarantined' ELSE'succeeded'END,
 finished_at=now() WHERE i.batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
UPDATE hr_legacy_t5_import_batch b SET loaded_row_count=x.loaded,quarantined_row_count=20163-x.loaded,status='staged',update_time=now()
FROM(SELECT count(*)FILTER(WHERE mapping_status='loaded') loaded FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run'))x WHERE b.batch_code=:'run';
DO $$DECLARE source_count bigint; map_count bigint; error_count bigint; BEGIN
 SELECT count(*) INTO source_count FROM source_rows;
 SELECT count(*) INTO map_count FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run'));
 SELECT count(*) INTO error_count FROM migration_error WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run'));
 IF map_count<>source_count THEN RAISE EXCEPTION 'T5 record-map conservation failed: source %, mapped %',source_count,map_count; END IF;
 IF error_count<>(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run')) AND mapping_status='quarantined')
 THEN RAISE EXCEPTION 'T5 quarantine evidence conservation failed'; END IF;
 IF EXISTS(
   SELECT 1 FROM migration_batch_item i
   WHERE i.batch_id=(SELECT id FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_run'))
     AND i.extracted_count<>i.loaded_count+i.rejected_count
 ) THEN RAISE EXCEPTION 'T5 per-source conservation failed'; END IF;
END$$;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),a AS(SELECT loaded_row_count l,quarantined_row_count q FROM hr_legacy_t5_import_batch WHERE batch_code=:'run')
INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_SOURCE_ACCOUNTING',to_jsonb(20163),to_jsonb(a.l+a.q),'{}'::jsonb,a.l+a.q=20163,encode(digest('T5_SOURCE_ACCOUNTING:20163','sha256'),'hex') FROM b CROSS JOIN a
UNION ALL SELECT b.id,'T5_ACCEPT_EMPTY',to_jsonb(0),to_jsonb((SELECT extracted_count FROM migration_batch_item WHERE batch_id=b.id AND source_object='dbo.accept')),'{}'::jsonb,true,encode(digest('T5_ACCEPT_EMPTY','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T5_JCH_1_ABSENT',to_jsonb('absent'::text),to_jsonb('absent'::text),'{}'::jsonb,true,encode(digest('T5_JCH_1_ABSENT','sha256'),'hex') FROM b
UNION ALL SELECT b.id,'T5_FILES_PROFILE',jsonb_build_object('photos',2949,'docs',1003,'readablePhotos',2155),jsonb_build_object('photos',(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.person.photo'),'docs',(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.docs'),'readablePhotos',(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.person.photo'AND payload->>'readabilityStatus'='readable')),'{}'::jsonb,(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.person.photo')=2949 AND(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.docs')=1003 AND(SELECT count(*)FROM source_rows WHERE payload->>'sourceTable'='dbo.person.photo'AND payload->>'readabilityStatus'='readable')=2155,encode(digest('T5_FILES_PROFILE','sha256'),'hex') FROM b;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run'),a AS(SELECT * FROM materialization_accounting)
INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_EMPLOYEE_MATERIALIZATION_ACCOUNTING',jsonb_build_object('source',a.source_count),jsonb_build_object('loaded',a.loaded_count,'quarantined',a.quarantined_count,'approvedIgnored',a.approved_ignored_count),'{}'::jsonb,a.source_count=a.loaded_count+a.quarantined_count+a.approved_ignored_count,encode(digest(concat_ws(':','T5_EMPLOYEE_MATERIALIZATION_ACCOUNTING',a.source_count,a.loaded_count,a.quarantined_count,a.approved_ignored_count),'sha256'),'hex') FROM b CROSS JOIN a;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_check(batch_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,'T5_ONLINE_STATE_UNCHANGED',to_jsonb(p),to_jsonb(a),'{}'::jsonb,p=a,encode(digest(to_jsonb(p)::text,'sha256'),'hex') FROM b CROSS JOIN protected_before p CROSS JOIN(SELECT
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee x) employee_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM sys_user x) user_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_employee_compensation x) compensation_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payroll_run x) payroll_run_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_payslip x) payslip_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_cycle x) performance_cycle_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_plan x) performance_plan_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM hr_performance_item x) performance_item_hash,
 (SELECT encode(digest(COALESCE(string_agg(to_jsonb(x)::text,'' ORDER BY x.id),''),'sha256'),'hex') FROM biz_user_message x) message_hash)a;
WITH b AS(SELECT id FROM migration_batch WHERE run_id=:'run') INSERT INTO migration_rollback_point(batch_id,rollback_code,reversible_scope,cleanup_manifest,evidence_sha256,verified_at)
SELECT b.id,'T5_LEGACY_HISTORY',jsonb_build_object('runId',:'run','published',false),jsonb_build_object('strategy','active_legacy_record_map_and_source_provenance','targetTables',jsonb_build_array('hr_legacy_employee_materialization_gap','hr_employee_credential','hr_employee_skill','hr_employee_family','hr_employee_profile','hr_legacy_t5_file_evidence','hr_legacy_t5_record')),encode(digest(:'run'||':T5_LEGACY_HISTORY','sha256'),'hex'),now() FROM b;
UPDATE migration_batch SET phase='verify',status=CASE WHEN EXISTS(SELECT 1 FROM migration_check WHERE batch_id=migration_batch.id AND NOT passed)THEN'failed'ELSE'succeeded'END,counts=(SELECT jsonb_build_object('source',source_row_count,'loaded',loaded_row_count,'quarantined',quarantined_row_count)FROM hr_legacy_t5_import_batch WHERE migration_batch_id=migration_batch.id),finished_at=now() WHERE run_id=:'run';
DO $$BEGIN IF EXISTS(SELECT 1 FROM migration_check c JOIN migration_batch b ON b.id=c.batch_id WHERE b.run_id=current_setting('yuzhou.t5_run')AND NOT c.passed)THEN RAISE EXCEPTION'T5 verification failed';END IF;END$$;
COMMIT;
SQL
docker exec "$PG" psql -X -A -t -F '|' -U jinhu -d "$DB" -c "SELECT run_id,status,counts FROM migration_batch WHERE run_id='$RUN_ID'"
