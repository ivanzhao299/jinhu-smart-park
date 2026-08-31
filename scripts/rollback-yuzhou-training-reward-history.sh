#!/usr/bin/env sh
set -eu
umask 077
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
RUN_ID="${YUZHOU_TRAINING_REWARD_HISTORY_RUN_ID:-}"; DB="${YUZHOU_TARGET_DATABASE:-}"; PG="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"; PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf %s "$RUN_ID"|grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'||fail "invalid run id"
printf %s "$DB"|grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'||fail "unsafe target database"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null||true)" = "$PROJECT" ]||fail "wrong PostgreSQL compose project"
docker exec -i "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -v run="$RUN_ID" -v db="$DB" <<'SQL'
BEGIN; SET LOCAL lock_timeout='10s'; SET LOCAL statement_timeout='5min'; SET CONSTRAINTS ALL DEFERRED; SELECT set_config('yuzhou.training_reward_rollback',:'run',true),set_config('yuzhou.training_reward_db',:'db',true);
DO $$DECLARE v_batch_id uuid; projected bigint; mapped bigint; expected bigint; BEGIN
 IF current_database()<>current_setting('yuzhou.training_reward_db') OR current_database()!~'^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION'unsafe target'; END IF;
 SELECT id INTO v_batch_id FROM migration_batch WHERE run_id=current_setting('yuzhou.training_reward_rollback') AND status='succeeded' AND target_database=current_database() FOR UPDATE;
 IF v_batch_id IS NULL THEN RAISE EXCEPTION 'rollbackable batch not found'; END IF;
 SELECT COALESCE((counts->>'loadedRows')::bigint,-1) INTO expected FROM migration_batch WHERE id=v_batch_id;
 SELECT count(*) INTO projected FROM hr_legacy_training_reward_projection WHERE migration_batch_id=v_batch_id AND status='staged';
 SELECT count(*) INTO mapped FROM legacy_record_map m WHERE m.batch_id=v_batch_id AND m.is_active AND m.mapping_status='loaded';
 IF expected<0 OR projected<>expected OR mapped<>expected THEN RAISE EXCEPTION 'rollback target accounting drift'; END IF;
END$$;
DELETE FROM hr_training_participant x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.training_participant_id=x.id;
DELETE FROM hr_training_plan x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.training_plan_id=x.id;
DELETE FROM hr_training_course_version x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.training_course_version_id=x.id;
DELETE FROM hr_training_course x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.training_course_id=x.id;
DELETE FROM hr_reward_discipline_category_version x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.reward_category_version_id=x.id;
DELETE FROM hr_reward_discipline_category x USING hr_legacy_training_reward_projection p,migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run' AND p.reward_category_id=x.id;
DELETE FROM hr_legacy_training_reward_projection p USING migration_batch b WHERE p.migration_batch_id=b.id AND b.run_id=:'run';
UPDATE legacy_record_map SET mapping_status='rolled_back',is_active=false,update_time=now() WHERE batch_id=(SELECT id FROM migration_batch WHERE run_id=:'run') AND is_active;
UPDATE migration_batch SET phase='rollback',status='rolled_back',finished_at=now(),update_time=now() WHERE run_id=:'run';
DO $$BEGIN IF EXISTS(SELECT 1 FROM hr_legacy_training_reward_projection p JOIN migration_batch b ON b.id=p.migration_batch_id WHERE b.run_id=current_setting('yuzhou.training_reward_rollback')) OR EXISTS(SELECT 1 FROM legacy_record_map m JOIN migration_batch b ON b.id=m.batch_id WHERE b.run_id=current_setting('yuzhou.training_reward_rollback') AND m.is_active) THEN RAISE EXCEPTION 'rollback residual'; END IF; END$$;
COMMIT;
SQL
docker exec "$PG" psql -X -A -t -U jinhu -d "$DB" -c "SELECT json_build_object('status','PASS','residualCount',(SELECT count(*) FROM hr_legacy_training_reward_projection p JOIN migration_batch b ON b.id=p.migration_batch_id WHERE b.run_id='$RUN_ID'),'productionImport','HOLD');"
