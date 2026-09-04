#!/usr/bin/env sh
set -eu
umask 077
RUN_ID="${YUZHOU_T5_NONFILE_RUN_ID:-${YUZHOU_MIGRATION_RUN_ID:-}}"
DB="${YUZHOU_TARGET_DATABASE:-}"
PG="${YUZHOU_POSTGRES_CONTAINER:-}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid nonfile run id"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe core lab target database"
printf %s "$EXPECTED_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe expected core compose project"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null || true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
docker exec -i "$PG" psql -X -q -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -v run="$RUN_ID" -v db="$DB" >/dev/null <<'SQL'
BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='10min'; SELECT set_config('yuzhou.t5_rollback',:'run',true),set_config('yuzhou.custom_field_rollback',:'run',true),set_config('yuzhou.t5_db',:'db',true);
DO $$DECLARE b uuid;BEGIN
 IF current_database()<>current_setting('yuzhou.t5_db') OR current_database()!~'^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;
 SELECT id INTO b FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_rollback') AND status='succeeded' FOR UPDATE;
 IF b IS NULL OR NOT EXISTS(SELECT 1 FROM hr_legacy_t5_import_batch WHERE migration_batch_id=b AND status='staged' FOR UPDATE) THEN RAISE EXCEPTION 'staged nonfile batch not found'; END IF;
 IF EXISTS(SELECT 1 FROM hr_legacy_archive_materialization_batch a JOIN hr_legacy_t5_import_batch s ON s.id=a.source_t5_import_batch_id WHERE s.migration_batch_id=b AND a.status<>'rolled_back') THEN RAISE EXCEPTION 'archive materialization must roll back first'; END IF;
 IF EXISTS(SELECT 1 FROM legacy_record_map WHERE batch_id=b AND is_active AND (target_table NOT IN('hr_legacy_t5_record','hr_legacy_t5_quarantine','hr_custom_field_definition','hr_employee_custom_value') OR (target_table='hr_legacy_t5_quarantine' AND (target_id IS NOT NULL OR mapping_status<>'quarantined')))) THEN RAISE EXCEPTION 'unexpected nonfile rollback target'; END IF;
 IF EXISTS(SELECT 1 FROM hr_legacy_t5_file_evidence f JOIN hr_legacy_t5_import_batch s ON s.id=f.import_batch_id WHERE s.migration_batch_id=b) THEN RAISE EXCEPTION 'nonfile batch has prohibited file evidence'; END IF;
END$$;
DELETE FROM hr_legacy_employee_materialization_gap g USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND (g.tenant_id,g.park_id)=(s.tenant_id,s.park_id) AND m.source_identity_sha256=g.source_identity_sha256 AND m.source_row_sha256=g.source_row_sha256;
DELETE FROM hr_employee_credential x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id) AND m.source_table='dbo.ticket' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_skill x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id) AND m.source_table='dbo.knowhow' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_family x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id) AND m.source_table='dbo.family' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_employee_custom_value x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND m.target_table='hr_employee_custom_value' AND m.target_id=x.id AND m.is_active AND x.migration_batch_id=b.id AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id);
DELETE FROM hr_custom_field_definition d USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND m.target_table='hr_custom_field_definition' AND m.target_id=d.id AND m.is_active AND d.migration_batch_id=b.id AND (d.tenant_id,d.park_id)=(s.tenant_id,s.park_id);
DELETE FROM hr_employee_profile x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id) AND m.source_table='dbo.person.core_residue' AND x.legacy_source_identity_sha256=m.source_identity_sha256 AND x.legacy_source_row_sha256=m.source_row_sha256;
DELETE FROM hr_legacy_t5_record x USING legacy_record_map m,migration_batch b,hr_legacy_t5_import_batch s WHERE m.batch_id=b.id AND s.migration_batch_id=b.id AND b.run_id=:'run' AND m.target_table='hr_legacy_t5_record' AND m.target_id=x.id AND m.is_active AND (x.tenant_id,x.park_id)=(s.tenant_id,s.park_id);
DO $$DECLARE b uuid;BEGIN
 SELECT id INTO b FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_rollback');
 IF EXISTS(SELECT 1 FROM legacy_record_map m WHERE m.batch_id=b AND m.is_active AND m.target_table='hr_legacy_t5_record' AND EXISTS(SELECT 1 FROM hr_legacy_t5_record x WHERE x.id=m.target_id)) THEN RAISE EXCEPTION 'nonfile record rollback residual'; END IF;
 IF EXISTS(SELECT 1 FROM legacy_record_map m JOIN hr_employee_custom_value x ON m.target_table='hr_employee_custom_value' AND m.target_id=x.id WHERE m.batch_id=b AND m.is_active) THEN RAISE EXCEPTION 'nonfile custom value rollback residual'; END IF;
 IF EXISTS(SELECT 1 FROM legacy_record_map m JOIN hr_custom_field_definition d ON m.target_table='hr_custom_field_definition' AND m.target_id=d.id WHERE m.batch_id=b AND m.is_active) THEN RAISE EXCEPTION 'nonfile custom definition rollback residual'; END IF;
END$$;
UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run') AND is_active;
UPDATE hr_legacy_t5_import_batch SET status='rolled_back',update_time=now() WHERE migration_batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
UPDATE migration_batch SET status='rolled_back',phase='rollback',finished_at=now(),update_time=now() WHERE run_id=:'run';
COMMIT;
SQL
docker exec "$PG" psql -X -q -A -t -F '|' -U jinhu -d "$DB" -c "SELECT status FROM migration_batch WHERE run_id='$RUN_ID'"
