#!/usr/bin/env sh
set -eu
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"; DB="${YUZHOU_TARGET_DATABASE:-}"; PG="${YUZHOU_POSTGRES_CONTAINER:-jinhu-smart-park-postgres}"
EXPECTED_PROJECT="${YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT:-jinhu_hr_migration_lab}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
cleanup_role(){
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -q -c "REVOKE EXECUTE ON PROCEDURE rollback_yuzhou_t4_payroll_history(varchar,varchar) FROM yuzhou_t4_loader; REVOKE USAGE ON SCHEMA public FROM yuzhou_t4_loader;" >/dev/null 2>&1 || true
  docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "ALTER ROLE yuzhou_t4_loader NOLOGIN;" >/dev/null 2>&1 || true
}
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
[ "${ALLOW_YUZHOU_ROLLBACK:-no}" = yes ] || fail "set ALLOW_YUZHOU_ROLLBACK=yes"
printf %s "$RUN_ID"|grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$'||fail "invalid run id"
printf %s "$DB"|grep -Eq '^jinhu_hr_migration_lab_[A-Za-z0-9_]{6,64}$'||fail "invalid isolated target database"
[ "$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$PG" 2>/dev/null||true)" = "$EXPECTED_PROJECT" ]||fail "wrong PostgreSQL compose project"
trap cleanup_role EXIT HUP INT TERM
# The role is deliberately database-local in authority: it has CONNECT/USAGE and
# EXECUTE on one SECURITY DEFINER procedure, but no table DML privileges.
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "DO \$\$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='yuzhou_t4_loader')THEN CREATE ROLE yuzhou_t4_loader NOLOGIN NOINHERIT; END IF; END\$\$; ALTER ROLE yuzhou_t4_loader NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION;"
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d "$DB" -q -c "REVOKE ALL ON ALL TABLES IN SCHEMA public FROM yuzhou_t4_loader; GRANT CONNECT ON DATABASE \"$DB\" TO yuzhou_t4_loader; GRANT USAGE ON SCHEMA public TO yuzhou_t4_loader; GRANT EXECUTE ON PROCEDURE rollback_yuzhou_t4_payroll_history(varchar,varchar) TO yuzhou_t4_loader;"
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U jinhu -d postgres -q -c "ALTER ROLE yuzhou_t4_loader LOGIN;"
docker exec "$PG" psql -X -v ON_ERROR_STOP=1 -U yuzhou_t4_loader -d "$DB" -c "CALL rollback_yuzhou_t4_payroll_history('$RUN_ID','$DB');"
cleanup_role
docker exec "$PG" psql -X -q -A -t -F '|' -U jinhu -d "$DB" -c "SELECT b.status,(SELECT count(*) FROM legacy_record_map m WHERE m.batch_id=b.id AND m.is_active) FROM migration_batch b WHERE b.run_id='$RUN_ID';"
