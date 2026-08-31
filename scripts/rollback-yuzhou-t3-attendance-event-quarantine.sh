#!/usr/bin/env sh
set -eu

fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
require YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID
require YUZHOU_TARGET_DATABASE
require YUZHOU_POSTGRES_CONTAINER
require YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT
printf %s "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid attendance event run id"
printf %s "$YUZHOU_TARGET_DATABASE" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "unsafe target database"
printf %s "$YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[a-z0-9_]{6,36}$' || fail "unsafe expected compose project"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$YUZHOU_POSTGRES_CONTAINER" 2>/dev/null || true)" = "$YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT" ] || fail "wrong PostgreSQL compose project"

docker exec -i "$YUZHOU_POSTGRES_CONTAINER" psql -X -q -v ON_ERROR_STOP=1 -U jinhu -d "$YUZHOU_TARGET_DATABASE" -v run="$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" -v db="$YUZHOU_TARGET_DATABASE" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SELECT set_config('yuzhou.attendance_quarantine_rollback_run',:'run',true);
SELECT set_config('yuzhou.attendance_quarantine_rollback_db',:'db',true);
DO $$ DECLARE b uuid; BEGIN
  IF current_database()<>current_setting('yuzhou.attendance_quarantine_rollback_db') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe attendance quarantine rollback target'; END IF;
  SELECT id INTO b FROM migration_batch WHERE run_id=current_setting('yuzhou.attendance_quarantine_rollback_run') AND status='succeeded' FOR UPDATE;
  IF b IS NULL THEN RAISE EXCEPTION 'succeeded attendance quarantine batch not found'; END IF;
  IF (SELECT count(*) FROM migration_batch_item WHERE batch_id=b AND domain='attendance_punch_event' AND extracted_count=(SELECT (counts->>'sourceRows')::bigint FROM migration_batch WHERE id=b) AND valid_count=0 AND loaded_count=0 AND rejected_count=(SELECT (counts->>'sourceRows')::bigint FROM migration_batch WHERE id=b) AND status='quarantined')<>1 OR (SELECT count(*) FROM migration_error WHERE batch_id=b AND error_code IN('ATTENDANCE_PUNCH_PERSON_UNMAPPED','ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED'))<>(SELECT (counts->>'sourceRows')::bigint FROM migration_batch WHERE id=b) OR (SELECT count(*) FROM migration_check WHERE batch_id=b AND check_code='T3_ATTENDANCE_PUNCH_QUARANTINE_CONSERVATION' AND passed)<>1 OR (SELECT count(*) FROM migration_rollback_point WHERE batch_id=b AND rollback_code='T3_ATTENDANCE_PUNCH_QUARANTINE')<>1 THEN RAISE EXCEPTION 'attendance quarantine rollback accounting drift'; END IF;
  IF EXISTS(SELECT 1 FROM legacy_record_map WHERE batch_id=b) THEN RAISE EXCEPTION 'attendance quarantine wrote legacy mapping'; END IF;
END $$;
DELETE FROM migration_check WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
DELETE FROM migration_error WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
DELETE FROM migration_rollback_point WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
DELETE FROM migration_batch_item WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run');
DELETE FROM migration_batch WHERE run_id=:'run';
COMMIT;
SQL
docker exec "$YUZHOU_POSTGRES_CONTAINER" psql -X -q -A -t -U jinhu -d "$YUZHOU_TARGET_DATABASE" -c "SELECT json_build_object('status','PASS','auditResidual',(SELECT count(*)::int FROM migration_batch WHERE run_id='$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID'),'attendanceBusinessRows',(SELECT count(*)::int FROM hr_attendance_punch_event),'productionImport','HOLD');"
