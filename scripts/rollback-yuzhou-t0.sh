#!/usr/bin/env sh
set -eu

RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
TARGET_DATABASE="${YUZHOU_TARGET_DATABASE:-}"
PG_CONTAINER="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_COMPOSE_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"

fail() { printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = "yes" ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = "yes" ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf '%s' "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid YUZHOU_MIGRATION_RUN_ID"
printf '%s' "$TARGET_DATABASE" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "invalid isolated target database"
project="$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$PG_CONTAINER" 2>/dev/null || true)"
[ "$project" = "$EXPECTED_COMPOSE_PROJECT" ] || fail "PostgreSQL container is not the expected migration lab"

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$TARGET_DATABASE" \
  -v run_id="$RUN_ID" -v target_database="$TARGET_DATABASE" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='5min';
SELECT set_config('yuzhou.run_id',:'run_id',true);
SELECT set_config('yuzhou.target_database',:'target_database',true);

DO $$
DECLARE batch_uuid uuid; expected_employees bigint; rejected_employees bigint; expected_positions bigint; expected_orgs bigint;
BEGIN
  IF current_database()<>current_setting('yuzhou.target_database') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN
    RAISE EXCEPTION 'unsafe rollback target';
  END IF;
  SELECT id INTO batch_uuid FROM migration_batch WHERE run_id=current_setting('yuzhou.run_id') AND status='succeeded' FOR UPDATE;
  IF batch_uuid IS NULL THEN RAISE EXCEPTION 'succeeded migration batch not found'; END IF;
  SELECT count(*) INTO expected_employees FROM legacy_record_map WHERE batch_id=batch_uuid AND target_table='hr_employee' AND is_active;
  SELECT count(*) INTO rejected_employees FROM migration_error
    WHERE batch_id=batch_uuid AND error_code IN('EMPLOYEE_DATE_ORDER','EMPLOYEE_JOB_STATE_UNRESOLVED');
  SELECT count(*) INTO expected_positions FROM legacy_record_map WHERE batch_id=batch_uuid AND target_table='hr_position' AND is_active;
  SELECT count(*) INTO expected_orgs FROM legacy_record_map WHERE batch_id=batch_uuid AND target_table='sys_org' AND is_active;
  IF expected_employees + rejected_employees<>2949 OR expected_positions<>18 OR expected_orgs<>138 THEN RAISE EXCEPTION 'rollback source accounting drift'; END IF;
  IF EXISTS (
    SELECT 1 FROM migration_check
    WHERE batch_id=batch_uuid AND check_code IN ('T0_ORGANIZATION_COUNT','T0_POSITION_COUNT','T0_EMPLOYEE_ACCOUNTING') AND NOT passed
  ) THEN RAISE EXCEPTION 'rollback verification drift'; END IF;
  IF (SELECT count(*) FROM hr_employee e JOIN legacy_record_map m ON m.target_id=e.id WHERE m.batch_id=batch_uuid AND m.target_table='hr_employee' AND m.is_active)<>expected_employees THEN RAISE EXCEPTION 'employee rollback target drift'; END IF;
  IF (SELECT count(*) FROM hr_position p JOIN legacy_record_map m ON m.target_id=p.id WHERE m.batch_id=batch_uuid AND m.target_table='hr_position' AND m.is_active)<>expected_positions THEN RAISE EXCEPTION 'position rollback target drift'; END IF;
  IF (SELECT count(*) FROM sys_org o JOIN legacy_record_map m ON m.target_id=o.id WHERE m.batch_id=batch_uuid AND m.target_table='sys_org' AND m.is_active)<>expected_orgs THEN RAISE EXCEPTION 'organization rollback target drift'; END IF;
END $$;

DELETE FROM hr_employee e USING legacy_record_map m,migration_batch b
WHERE b.run_id=:'run_id' AND m.batch_id=b.id AND m.target_table='hr_employee' AND m.target_id=e.id AND m.is_active;
DELETE FROM hr_position p USING legacy_record_map m,migration_batch b
WHERE b.run_id=:'run_id' AND m.batch_id=b.id AND m.target_table='hr_position' AND m.target_id=p.id AND m.is_active;
DELETE FROM sys_org o USING legacy_record_map m,migration_batch b
WHERE b.run_id=:'run_id' AND m.batch_id=b.id AND m.target_table='sys_org' AND m.target_id=o.id AND m.is_active;

UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now()
WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND is_active;
UPDATE migration_batch_item SET phase='rollback',status='succeeded',finished_at=now(),update_time=now()
WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id');
UPDATE migration_rollback_point SET cleanup_manifest=cleanup_manifest||jsonb_build_object(
  'deletedEmployees',(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND target_table='hr_employee'),
  'deletedPositions',(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND target_table='hr_position'),
  'deletedOrganizations',(SELECT count(*) FROM legacy_record_map WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND target_table='sys_org')
),verified_at=now()
WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND rollback_code='T0_INITIAL_LOAD';
UPDATE migration_batch SET phase='rollback',status='rolled_back',finished_at=now(),update_time=now()
WHERE run_id=:'run_id';
COMMIT;
SQL

docker exec "$PG_CONTAINER" psql -X -A -t -F '|' -U jinhu -d "$TARGET_DATABASE" -c \
  "SELECT run_id,status,phase FROM migration_batch WHERE run_id='$RUN_ID';"
