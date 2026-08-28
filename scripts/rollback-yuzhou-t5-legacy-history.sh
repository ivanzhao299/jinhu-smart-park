#!/usr/bin/env sh
set -eu
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"; DB="${YUZHOU_TARGET_DATABASE:-}"; PG="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
fail(){ printf 'ERROR: %s\n' "$1" >&2;exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ]||fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ]||fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf %s "$RUN_ID"|grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'||fail "invalid run id"
printf %s "$DB"|grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'||fail "unsafe target database"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null||true)" = "$EXPECTED_PROJECT" ]||fail "wrong PostgreSQL compose project"
docker exec -i "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -v run="$RUN_ID" -v db="$DB" <<'SQL'
BEGIN;SET LOCAL lock_timeout='10s';SET LOCAL statement_timeout='5min';SELECT set_config('yuzhou.t5_rollback',:'run',true),set_config('yuzhou.t5_db',:'db',true);
DO $$DECLARE b uuid; expected_records bigint;expected_files bigint;BEGIN
 IF current_database()<>current_setting('yuzhou.t5_db') OR current_database()!~'^jinhu_hr_migration_lab_'THEN RAISE EXCEPTION'unsafe target';END IF;
 SELECT id INTO b FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_rollback')AND status='succeeded' FOR UPDATE;
 IF b IS NULL THEN RAISE EXCEPTION'succeeded batch not found';END IF;
 IF NOT EXISTS(SELECT 1 FROM hr_legacy_t5_import_batch WHERE migration_batch_id=b AND status='staged' FOR UPDATE)THEN RAISE EXCEPTION'unpublished staged batch not found';END IF;
 SELECT count(*)INTO expected_records FROM legacy_record_map WHERE batch_id=b AND target_table='hr_legacy_t5_record'AND is_active;
 SELECT count(*)INTO expected_files FROM legacy_record_map WHERE batch_id=b AND target_table='hr_legacy_t5_file_evidence'AND is_active;
 IF EXISTS(SELECT 1 FROM legacy_record_map WHERE batch_id=b AND is_active AND (
   target_table NOT IN('hr_legacy_t5_record','hr_legacy_t5_file_evidence','hr_legacy_t5_quarantine')
   OR (target_table='hr_legacy_t5_quarantine' AND (target_id IS NOT NULL OR mapping_status<>'quarantined'))
 ))THEN RAISE EXCEPTION'unexpected active rollback target table';END IF;
 IF(SELECT count(*)FROM hr_legacy_t5_record x JOIN legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_legacy_t5_record'AND m.batch_id=b AND m.is_active)<>expected_records THEN RAISE EXCEPTION'record rollback target drift';END IF;
 IF(SELECT count(*)FROM hr_legacy_t5_file_evidence x JOIN legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_legacy_t5_file_evidence'AND m.batch_id=b AND m.is_active)<>expected_files THEN RAISE EXCEPTION'file rollback target drift';END IF;
 IF EXISTS(SELECT 1 FROM hr_legacy_t5_record x JOIN legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_legacy_t5_record'AND m.batch_id=b AND m.is_active WHERE (m.source_table,m.source_identity_sha256,m.source_row_sha256)IS DISTINCT FROM(x.source_table,x.source_identity_sha256,x.source_row_sha256))THEN RAISE EXCEPTION'record rollback proof mismatch';END IF;
 IF EXISTS(SELECT 1 FROM hr_legacy_t5_file_evidence x JOIN legacy_record_map m ON m.target_id=x.id AND m.target_table='hr_legacy_t5_file_evidence'AND m.batch_id=b AND m.is_active WHERE (m.source_table,m.source_identity_sha256,m.source_row_sha256)IS DISTINCT FROM(x.source_table,x.source_identity_sha256,x.source_row_sha256))THEN RAISE EXCEPTION'file rollback proof mismatch';END IF;
END$$;
DELETE FROM hr_legacy_employee_materialization_gap g USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run' AND m.source_identity_sha256=g.source_identity_sha256 AND m.source_row_sha256=g.source_row_sha256;
DELETE FROM hr_employee_credential x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run' AND m.source_table='dbo.ticket' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_skill x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run' AND m.source_table='dbo.knowhow' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_family x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run' AND m.source_table='dbo.family' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_profile x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run' AND m.source_table='dbo.person.core_residue' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_legacy_t5_file_evidence x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run'AND m.target_table='hr_legacy_t5_file_evidence'AND m.target_id=x.id AND m.is_active;
DELETE FROM hr_legacy_t5_record x USING legacy_record_map m,migration_batch b WHERE m.batch_id=b.id AND b.run_id=:'run'AND m.target_table='hr_legacy_t5_record'AND m.target_id=x.id AND m.is_active;
UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now()WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run')AND is_active;
UPDATE hr_legacy_t5_import_batch SET status='rolled_back',update_time=now()WHERE migration_batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
UPDATE migration_batch SET status='rolled_back',phase='rollback',finished_at=now(),update_time=now()WHERE run_id=:'run';
COMMIT;
SQL
