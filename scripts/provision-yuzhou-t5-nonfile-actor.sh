#!/usr/bin/env sh
set -eu
umask 077
RUN_ID="${YUZHOU_T5_NONFILE_RUN_ID:-${YUZHOU_MIGRATION_RUN_ID:-}}"
ACTOR_ID="${YUZHOU_MATERIALIZATION_ACTOR_USER_ID:-}"
DB="${YUZHOU_TARGET_DATABASE:-}"
PG="${YUZHOU_POSTGRES_CONTAINER:-}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-}"
TENANT="${YUZHOU_TARGET_TENANT_ID:-10000001}"
PARK="${YUZHOU_TARGET_PARK_ID:-20000001}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,36}$' || fail "invalid nonfile run id"
printf %s "$ACTOR_ID" | grep -Eq '^[0-9a-fA-F-]{36}$' || fail "YUZHOU_MATERIALIZATION_ACTOR_USER_ID is required"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe core lab target database"
printf %s "$EXPECTED_PROJECT" | grep -Eq '^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' || fail "unsafe expected core compose project"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null || true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
ACTOR_NAME="yuzhou-t5n-$RUN_ID"
docker exec -i "$PG" psql -X -q -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -v run="$RUN_ID" -v actor="$ACTOR_ID" -v username="$ACTOR_NAME" -v tenant="$TENANT" -v park="$PARK" >/dev/null <<'SQL'
BEGIN;
SELECT set_config('yuzhou.t5_actor_run',:'run',true),set_config('yuzhou.t5_actor_id',:'actor',true),set_config('yuzhou.t5_actor_username',:'username',true),set_config('yuzhou.t5_actor_tenant',:'tenant',true),set_config('yuzhou.t5_actor_park',:'park',true);
DO $$BEGIN
 IF current_database()!~'^jinhu_hr_migration_lab_core_[A-Za-z0-9_]{6,64}$' THEN RAISE EXCEPTION 'unsafe target'; END IF;
 IF EXISTS(SELECT 1 FROM migration_batch WHERE run_id=current_setting('yuzhou.t5_actor_run')) THEN RAISE EXCEPTION 'nonfile migration run already exists'; END IF;
 IF EXISTS(SELECT 1 FROM sys_user WHERE id=current_setting('yuzhou.t5_actor_id')::uuid) OR EXISTS(SELECT 1 FROM sys_user WHERE tenant_id=current_setting('yuzhou.t5_actor_tenant') AND park_id=current_setting('yuzhou.t5_actor_park') AND username=current_setting('yuzhou.t5_actor_username')) THEN RAISE EXCEPTION 'nonfile materialization actor already exists'; END IF;
 INSERT INTO sys_user(id,tenant_id,park_id,username,display_name,password_hash,is_enabled,status,remark)
 VALUES(current_setting('yuzhou.t5_actor_id')::uuid,current_setting('yuzhou.t5_actor_tenant'),current_setting('yuzhou.t5_actor_park'),current_setting('yuzhou.t5_actor_username'),'Yuzhou T5 isolated materialization actor','not-a-login-hash',true,'enabled','isolated nonfile migration actor');
END$$;
COMMIT;
SQL
docker exec "$PG" psql -X -q -A -t -U jinhu -d "$DB" -c "SELECT CASE WHEN EXISTS(SELECT 1 FROM sys_user WHERE id='$ACTOR_ID'::uuid AND status='enabled' AND NOT is_deleted) THEN 'actor_ready' ELSE 'actor_missing' END"
