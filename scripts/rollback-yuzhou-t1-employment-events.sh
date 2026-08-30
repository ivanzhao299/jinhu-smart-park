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
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$PG_CONTAINER" 2>/dev/null || true)" = "$EXPECTED_COMPOSE_PROJECT" ] || fail "PostgreSQL container is not the expected migration lab"

docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$TARGET_DATABASE" -v run_id="$RUN_ID" -v target_database="$TARGET_DATABASE" <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='5min';
SELECT set_config('yuzhou.run_id',:'run_id',true);
SELECT set_config('yuzhou.target_database',:'target_database',true);
DO $$ DECLARE batch_uuid uuid; mapped_count bigint; quarantined_without_target_write_count bigint; BEGIN
 IF current_database()<>current_setting('yuzhou.target_database') OR current_database() !~ '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe migration target'; END IF;
 SELECT id INTO batch_uuid FROM migration_batch WHERE run_id=current_setting('yuzhou.run_id') AND status='succeeded' FOR UPDATE;
 IF batch_uuid IS NULL THEN RAISE EXCEPTION 'succeeded migration batch not found'; END IF;
 SELECT count(*) INTO mapped_count FROM legacy_record_map WHERE batch_id=batch_uuid AND target_table='hr_employment_event' AND is_active;
 IF mapped_count=0 THEN
   SELECT count(*) INTO quarantined_without_target_write_count FROM migration_batch_item
    WHERE batch_id=batch_uuid AND domain='employment_event' AND status='quarantined' AND loaded_count=0;
   IF quarantined_without_target_write_count<>1 THEN RAISE EXCEPTION 'no active T1 event mappings found'; END IF;
 END IF;
END $$;
WITH target AS (SELECT m.target_id FROM legacy_record_map m JOIN migration_batch b ON b.id=m.batch_id WHERE b.run_id=:'run_id' AND m.target_table='hr_employment_event' AND m.is_active)
DELETE FROM hr_employment_event e USING target t WHERE e.id=t.target_id;
UPDATE legacy_record_map SET is_active=false,update_time=now() WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND target_table='hr_employment_event' AND is_active;
UPDATE migration_batch_item SET phase='rollback',status='succeeded',finished_at=now(),update_time=now() WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id');
UPDATE migration_rollback_point SET cleanup_manifest=cleanup_manifest||jsonb_build_object('deletedEvents',(SELECT count(*) FROM legacy_record_map WHERE batch_id=migration_rollback_point.batch_id AND target_table='hr_employment_event')),verified_at=now() WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run_id') AND rollback_code='T1_EMPLOYMENT_EVENTS';
UPDATE migration_batch SET phase='rollback',status='rolled_back',finished_at=now(),update_time=now() WHERE run_id=:'run_id';
COMMIT;
SQL
docker exec "$PG_CONTAINER" psql -X -A -t -F '|' -U jinhu -d "$TARGET_DATABASE" -c "SELECT run_id,status,phase FROM migration_batch WHERE run_id='$RUN_ID';"
