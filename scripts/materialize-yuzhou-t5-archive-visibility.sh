#!/usr/bin/env sh
set -eu
umask 077
RUN_ID="${YUZHOU_ARCHIVE_MATERIALIZATION_RUN_ID:-}"
TENANT_ID="${YUZHOU_TENANT_ID:-}"
PARK_ID="${YUZHOU_PARK_ID:-}"
SOURCE_BATCH_ID="${YUZHOU_T5_SOURCE_BATCH_ID:-}"
DB="${YUZHOU_TARGET_DATABASE:-}"
PG="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
ROLE_SUFFIX="$(openssl rand -hex 8)"
ROLE="yuzhou_t5a_apply_$ROLE_SUFFIX"
ROLE_CREATED=no
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
cleanup_role_best_effort(){
  [ "$ROLE_CREATED" = yes ] || return 0
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "ALTER ROLE $ROLE NOLOGIN;" >/dev/null 2>&1 || true
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -q -c "REVOKE EXECUTE ON PROCEDURE materialize_yuzhou_t5_archive_visibility(varchar,varchar,uuid,varchar,varchar) FROM $ROLE; REVOKE USAGE ON SCHEMA public FROM $ROLE; REVOKE CONNECT ON DATABASE \"$DB\" FROM $ROLE; DROP OWNED BY $ROLE;" >/dev/null 2>&1 || true
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "DROP ROLE IF EXISTS $ROLE;" >/dev/null 2>&1 || true
}
cleanup_role(){
  [ "$ROLE_CREATED" = yes ] || return 0
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "ALTER ROLE $ROLE NOLOGIN;"
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -q -c "REVOKE EXECUTE ON PROCEDURE materialize_yuzhou_t5_archive_visibility(varchar,varchar,uuid,varchar,varchar) FROM $ROLE; REVOKE USAGE ON SCHEMA public FROM $ROLE; REVOKE CONNECT ON DATABASE \"$DB\" FROM $ROLE; DROP OWNED BY $ROLE;"
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "DROP ROLE $ROLE;"
}
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid T5A run id"
printf %s "$TENANT_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' || fail "invalid tenant id"
printf %s "$PARK_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' || fail "invalid park id"
printf %s "$SOURCE_BATCH_ID" | grep -Eq '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' || fail "invalid T5 source batch id"
printf %s "$DB" | grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$' || fail "invalid isolated target database"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null || true)" = "$EXPECTED_PROJECT" ] || fail "wrong PostgreSQL compose project"
trap cleanup_role_best_effort EXIT HUP INT TERM
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "CREATE ROLE $ROLE NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;"
ROLE_CREATED=yes
[ "$(docker exec "$PG" psql -X -A -t -U jinhu -d postgres -c "SELECT count(*) FROM pg_auth_members membership JOIN pg_roles member_role ON member_role.oid=membership.member WHERE member_role.rolname='$ROLE';")" = 0 ] || fail "temporary apply role unexpectedly has memberships"
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -q -c "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM $ROLE; GRANT CONNECT ON DATABASE \"$DB\" TO $ROLE; GRANT USAGE ON SCHEMA public TO $ROLE; GRANT EXECUTE ON PROCEDURE materialize_yuzhou_t5_archive_visibility(varchar,varchar,uuid,varchar,varchar) TO $ROLE;"
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "ALTER ROLE $ROLE LOGIN;"
docker exec "$PG" psql -X -q -v ON_ERROR_STOP=1 -U "$ROLE" -d "$DB" -c "BEGIN ISOLATION LEVEL SERIALIZABLE; CALL materialize_yuzhou_t5_archive_visibility('$TENANT_ID','$PARK_ID','$SOURCE_BATCH_ID'::uuid,'$RUN_ID','$DB'); COMMIT;"
cleanup_role
trap - EXIT HUP INT TERM
[ "$(docker exec "$PG" psql -X -A -t -U jinhu -d postgres -c "SELECT count(*) FROM pg_roles WHERE rolname='$ROLE';")" = 0 ] || fail "temporary apply role cleanup failed"
docker exec "$PG" psql -X -A -t -F '|' -U jinhu -d "$DB" -c "SELECT id,status,source_record_count,deferred_file_count,archive_record_count FROM hr_legacy_archive_materialization_batch WHERE tenant_id='$TENANT_ID' AND park_id='$PARK_ID' AND batch_code='$RUN_ID';"
