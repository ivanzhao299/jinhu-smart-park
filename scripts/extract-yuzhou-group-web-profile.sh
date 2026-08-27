#!/usr/bin/env sh
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
CREDENTIAL_FILE="${YUZHOU_GROUP_WEB_ETL_CREDENTIAL_FILE:-}"
OUTPUT_ROOT="${YUZHOU_STAGING_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr}"
SQL_FILE="$ROOT_DIR/scripts/hr-cutover/sql/profile-group-web-source.sql"

fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid run id"
[ -n "$CREDENTIAL_FILE" ] && [ -f "$CREDENTIAL_FILE" ] || fail "Group Web read-only credential file is missing"
[ "$(stat -f '%Lp' "$CREDENTIAL_FILE" 2>/dev/null || stat -c '%a' "$CREDENTIAL_FILE")" = 600 ] || fail "credential file must be mode 0600"
. "$CREDENTIAL_FILE"

[ -n "${YUZHOU_GROUP_WEB_SQLSERVER:-}" ] || fail "Group Web SQL Server is missing"
[ -n "${YUZHOU_GROUP_WEB_DATABASE:-}" ] || fail "Group Web database is missing"
[ -n "${YUZHOU_GROUP_WEB_ETL_LOGIN:-}" ] || fail "Group Web ETL login is missing"
[ -n "${YUZHOU_GROUP_WEB_ETL_PASSWORD:-}" ] || fail "Group Web ETL password is missing"
[ "$(printf %s "$YUZHOU_GROUP_WEB_ETL_LOGIN" | tr '[:upper:]' '[:lower:]')" != sa ] || fail "sa is forbidden for extraction"
[ -f "$SQL_FILE" ] || fail "profile SQL is missing"
command -v tsql >/dev/null 2>&1 || fail "FreeTDS tsql is required"

OUT="$OUTPUT_ROOT/staging-$RUN_ID"
[ ! -e "$OUT" ] || fail "staging run already exists"
mkdir -p "$OUT"
chmod 700 "$OUT"
PROFILE="$OUT/group-web-profile.raw.json"
export YUZHOU_GROUP_WEB_SQLSERVER YUZHOU_GROUP_WEB_DATABASE YUZHOU_GROUP_WEB_ETL_LOGIN YUZHOU_GROUP_WEB_ETL_PASSWORD
export YUZHOU_GROUP_WEB_PROFILE_OUTPUT="$PROFILE"
node "$ROOT_DIR/scripts/hr-cutover/run-group-web-profile.mjs"
printf 'YUZHOU_GROUP_WEB_PROFILE_OK run_id=%s output=%s\n' "$RUN_ID" "$OUT"
