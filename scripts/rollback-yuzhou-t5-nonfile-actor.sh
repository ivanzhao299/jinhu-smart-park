#!/usr/bin/env sh
set -eu
umask 077
RUN_ID="${YUZHOU_T5_NONFILE_RUN_ID:-${YUZHOU_MIGRATION_RUN_ID:-}}"
ACTOR_ID="${YUZHOU_MATERIALIZATION_ACTOR_USER_ID:-}"
DB="${YUZHOU_TARGET_DATABASE:-}"
PG="${YUZHOU_POSTGRES_CONTAINER:-}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,36}$' || fail "invalid nonfile run id"
printf %s "$ACTOR_ID" | grep -Eq '^[0-9a-fA-F-]{36}$' || fail "YUZHOU_MATERIALIZATION_ACTOR_USER_ID is required"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe core lab target database"
printf %s "$EXPECTED_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe expected core compose project"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null || true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
docker exec -i "$PG" psql -X -q -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -v run="$RUN_ID" -v actor="$ACTOR_ID" >/dev/null <<'SQL'
BEGIN;
SELECT set_config('yuzhou.t5_actor_run',:'run',true),set_config('yuzhou.t5_actor_id',:'actor',true);
DO $$BEGIN
 IF current_database()!~'^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;
 IF NOT EXISTS(SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_actor_run') AND status='rolled_back') THEN RAISE EXCEPTION 'nonfile migration rollback must finish first'; END IF;
 IF EXISTS(SELECT 1 FROM hr_employee_profile WHERE create_by=current_setting('yuzhou.t5_actor_id')::uuid OR update_by=current_setting('yuzhou.t5_actor_id')::uuid) OR EXISTS(SELECT 1 FROM hr_employee_family WHERE create_by=current_setting('yuzhou.t5_actor_id')::uuid OR update_by=current_setting('yuzhou.t5_actor_id')::uuid) OR EXISTS(SELECT 1 FROM hr_employee_skill WHERE create_by=current_setting('yuzhou.t5_actor_id')::uuid OR update_by=current_setting('yuzhou.t5_actor_id')::uuid) OR EXISTS(SELECT 1 FROM hr_employee_credential WHERE create_by=current_setting('yuzhou.t5_actor_id')::uuid OR update_by=current_setting('yuzhou.t5_actor_id')::uuid) THEN RAISE EXCEPTION 'nonfile materialization actor still referenced'; END IF;
 DELETE FROM sys_user WHERE id=current_setting('yuzhou.t5_actor_id')::uuid AND username LIKE 'yuzhou-t5n-%' AND remark='isolated nonfile migration actor';
 IF EXISTS(SELECT 1 FROM sys_user WHERE id=current_setting('yuzhou.t5_actor_id')::uuid) THEN RAISE EXCEPTION 'nonfile materialization actor residual'; END IF;
END$$;
COMMIT;
SQL
printf 'actor_rollback=clean\n'
