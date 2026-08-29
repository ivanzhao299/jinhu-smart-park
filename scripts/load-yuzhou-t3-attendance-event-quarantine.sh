#!/usr/bin/env sh
set -eu
umask 077

fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }

[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
require YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID
require YUZHOU_TARGET_DATABASE
require YUZHOU_T3_ATTENDANCE_EVENTS_STAGING_DIR
require YUZHOU_POSTGRES_CONTAINER
require YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT
require YUZHOU_BACKUP_SHA256

printf %s "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid attendance event run id"
printf %s "$YUZHOU_TARGET_DATABASE" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "unsafe target database"
printf %s "$YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[a-z0-9_]{6,36}$' || fail "unsafe expected compose project"
printf %s "$YUZHOU_BACKUP_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid source backup hash"

stage="$YUZHOU_T3_ATTENDANCE_EVENTS_STAGING_DIR"
manifest="$stage/manifest.json"
rows="$stage/attendance-punch-quarantine.jsonl"
[ -d "$stage" ] && [ "$(stat -f '%Lp' "$stage" 2>/dev/null || stat -c '%a' "$stage")" = 700 ] || fail "controlled attendance staging directory required"
[ -f "$manifest" ] && [ "$(stat -f '%Lp' "$manifest" 2>/dev/null || stat -c '%a' "$manifest")" = 600 ] || fail "controlled attendance manifest required"
[ -f "$rows" ] && [ "$(stat -f '%Lp' "$rows" 2>/dev/null || stat -c '%a' "$rows")" = 600 ] || fail "controlled attendance rows required"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$YUZHOU_POSTGRES_CONTAINER" 2>/dev/null || true)" = "$YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT" ] || fail "wrong PostgreSQL compose project"

stage_meta="$(node -e 'const fs=require("fs"),crypto=require("crypto");const [manifestPath,rowsPath,snapshot]=process.argv.slice(1);const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");const m=JSON.parse(fs.readFileSync(manifestPath,"utf8"));const rows=fs.readFileSync(rowsPath,"utf8").trim().split("\n").filter(Boolean).map(JSON.parse);const hash=/^[0-9a-f]{64}$/;if(m.artifactKind!=="yuzhou_t3_attendance_punch_quarantine_stage"||m.sourceReadOnly!==true||m.sourceSnapshotSha256!==snapshot||m.productionImport!=="HOLD"||m.businessWriteTarget!=="none"||m.sourceRows!==rows.length||m.eligibleRows!==0||m.quarantinedRows!==rows.length||m.quarantineFileSha256!==sha(rowsPath)||rows.some(r=>r.domain!=="attendance_punch_event"||r.sourceTable!=="dbo.attrecord"||r.status!=="quarantined"||!hash.test(r.sourceIdentitySha256??"")||!hash.test(r.sourceRowSha256??"")||!["ATTENDANCE_PUNCH_PERSON_UNMAPPED","ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED"].includes(r.quarantineCode)))throw Error("unsafe attendance quarantine stage");console.log(JSON.stringify({sourceRows:rows.length,quarantineFileSha256:m.quarantineFileSha256}));' "$manifest" "$rows" "$YUZHOU_BACKUP_SHA256")" || fail "unsafe attendance quarantine stage"
source_rows="$(node -e 'console.log(JSON.parse(process.argv[1]).sourceRows)' "$stage_meta")"
stage_sha="$(node -e 'console.log(JSON.parse(process.argv[1]).quarantineFileSha256)' "$stage_meta")"

remote="/tmp/$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
trap 'docker exec "$YUZHOU_POSTGRES_CONTAINER" rm -rf "$remote" >/dev/null 2>&1 || true' EXIT HUP INT TERM
docker exec "$YUZHOU_POSTGRES_CONTAINER" mkdir -p "$remote"
docker cp "$rows" "$YUZHOU_POSTGRES_CONTAINER:$remote/input.jsonl"
docker exec "$YUZHOU_POSTGRES_CONTAINER" chown -R postgres:postgres "$remote"
docker exec "$YUZHOU_POSTGRES_CONTAINER" chmod -R go-rwx "$remote"

docker exec -i "$YUZHOU_POSTGRES_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$YUZHOU_TARGET_DATABASE" \
  -v run="$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" -v db="$YUZHOU_TARGET_DATABASE" -v snapshot="$YUZHOU_BACKUP_SHA256" -v source_rows="$source_rows" -v stage_sha="$stage_sha" -v path="$remote/input.jsonl" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='5min';
SELECT set_config('yuzhou.attendance_quarantine_run',:'run',true);
SELECT set_config('yuzhou.attendance_quarantine_db',:'db',true);
SELECT set_config('yuzhou.attendance_quarantine_source_rows',:'source_rows',true);
SELECT set_config('yuzhou.attendance_quarantine_stage_sha',:'stage_sha',true);
DO $$ BEGIN
  IF current_database()<>current_setting('yuzhou.attendance_quarantine_db') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe attendance quarantine target'; END IF;
  IF EXISTS(SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.attendance_quarantine_run')) THEN RAISE EXCEPTION 'duplicate migration run'; END IF;
END $$;
CREATE TEMP TABLE source_rows(payload jsonb NOT NULL);
COPY source_rows FROM :'path';
DO $$ BEGIN
  IF (SELECT count(*) FROM source_rows)<>current_setting('yuzhou.attendance_quarantine_source_rows')::bigint OR EXISTS(SELECT 1 FROM source_rows WHERE payload->>'domain'<>'attendance_punch_event' OR payload->>'sourceTable'<>'dbo.attrecord' OR payload->>'status'<>'quarantined' OR payload->>'quarantineCode' NOT IN('ATTENDANCE_PUNCH_PERSON_UNMAPPED','ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED') OR (payload->>'sourceIdentitySha256') !~ '^[0-9a-f]{64}$' OR (payload->>'sourceRowSha256') !~ '^[0-9a-f]{64}$') OR (SELECT count(DISTINCT payload->>'sourceIdentitySha256') FROM source_rows)<>(SELECT count(*) FROM source_rows) THEN RAISE EXCEPTION 'attendance quarantine staging drift'; END IF;
END $$;
INSERT INTO migration_batch(run_id,source_system,source_snapshot_sha256,target_database,phase,status,tool_version,started_at,counts)
VALUES(:'run','yuzhou-v10',:'snapshot',:'db','load','running','t3-attendance-punch-quarantine-v1',now(),jsonb_build_object('sourceRows',current_setting('yuzhou.attendance_quarantine_source_rows')::bigint,'loadedRows',0));
WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run')
INSERT INTO migration_batch_item(batch_id,domain,source_object,phase,status,extracted_count,valid_count,loaded_count,rejected_count,checksum_sha256,started_at,finished_at)
SELECT b.id,'attendance_punch_event','dbo.attrecord','load','quarantined',current_setting('yuzhou.attendance_quarantine_source_rows')::bigint,0,0,current_setting('yuzhou.attendance_quarantine_source_rows')::bigint,current_setting('yuzhou.attendance_quarantine_stage_sha'),now(),now() FROM b;
WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run'), item AS (SELECT id FROM migration_batch_item WHERE batch_id=(SELECT id FROM b) AND domain='attendance_punch_event' AND source_object='dbo.attrecord' AND phase='load')
INSERT INTO migration_error(batch_id,batch_item_id,category,error_code,source_identity_sha256,redacted_evidence,evidence_redacted,retryable)
SELECT b.id,item.id,'mapping',payload->>'quarantineCode',payload->>'sourceIdentitySha256',jsonb_build_object('rule',payload->>'quarantineCode'),true,false FROM source_rows CROSS JOIN b CROSS JOIN item;
WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run'), item AS (SELECT id FROM migration_batch_item WHERE batch_id=(SELECT id FROM b) AND domain='attendance_punch_event')
INSERT INTO migration_check(batch_id,batch_item_id,check_code,expected_value,actual_value,tolerance,passed,evidence_sha256)
SELECT b.id,item.id,'T3_ATTENDANCE_PUNCH_QUARANTINE_CONSERVATION',jsonb_build_object('sourceRows',current_setting('yuzhou.attendance_quarantine_source_rows')::bigint,'loadedRows',0,'quarantinedRows',current_setting('yuzhou.attendance_quarantine_source_rows')::bigint),jsonb_build_object('sourceRows',(SELECT count(*) FROM source_rows),'loadedRows',0,'quarantinedRows',(SELECT count(*) FROM migration_error WHERE batch_id=b.id)), '{}'::jsonb, (SELECT count(*) FROM source_rows)=(SELECT count(*) FROM migration_error WHERE batch_id=b.id), encode(digest('T3_ATTENDANCE_PUNCH_QUARANTINE_CONSERVATION:'||current_setting('yuzhou.attendance_quarantine_stage_sha'),'sha256'),'hex') FROM b CROSS JOIN item;
WITH b AS (SELECT id FROM migration_batch WHERE run_id=:'run')
INSERT INTO migration_rollback_point(batch_id,rollback_code,reversible_scope,cleanup_manifest,evidence_sha256,verified_at)
SELECT b.id,'T3_ATTENDANCE_PUNCH_QUARANTINE',jsonb_build_object('runId',:'run','businessRows',0),jsonb_build_object('strategy','delete_migration_audit_only','businessWriteTarget','none'),encode(digest(:'run'||':T3_ATTENDANCE_PUNCH_QUARANTINE','sha256'),'hex'),now() FROM b;
UPDATE migration_batch SET phase='verify',status=CASE WHEN EXISTS(SELECT 1 FROM migration_check WHERE batch_id=migration_batch.id AND NOT passed) THEN 'failed' ELSE 'succeeded' END,counts=jsonb_build_object('sourceRows',current_setting('yuzhou.attendance_quarantine_source_rows')::bigint,'loadedRows',0,'quarantinedRows',(SELECT count(*) FROM migration_error WHERE batch_id=migration_batch.id)),finished_at=now(),update_time=now() WHERE run_id=:'run';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM migration_check c JOIN migration_batch b ON b.id=c.batch_id WHERE b.run_id=current_setting('yuzhou.attendance_quarantine_run') AND NOT c.passed) THEN RAISE EXCEPTION 'attendance quarantine verification failed'; END IF; END $$;
COMMIT;
SQL

docker exec "$YUZHOU_POSTGRES_CONTAINER" psql -X -A -t -U jinhu -d "$YUZHOU_TARGET_DATABASE" -v run="$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" -c "SELECT json_build_object('status','PASS','sourceRows',(counts->>'sourceRows')::bigint,'loadedRows',(counts->>'loadedRows')::bigint,'quarantinedRows',(counts->>'quarantinedRows')::bigint,'businessWriteTarget','none','productionImport','HOLD') FROM migration_batch WHERE run_id=:'run';"
