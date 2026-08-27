#!/usr/bin/env sh
set -eu
umask 077
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
GROUP_CREDENTIAL_FILE="${YUZHOU_GROUP_WEB_ETL_CREDENTIAL_FILE:-}"
CLIENT_CREDENTIAL_FILE="${YUZHOU_CLIENT_ETL_CREDENTIAL_FILE:-}"
OUTPUT_ROOT="${YUZHOU_STAGING_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid run id"
for file in "$GROUP_CREDENTIAL_FILE" "$CLIENT_CREDENTIAL_FILE"; do [ -f "$file" ] || fail "read-only credential file is missing"; [ "$(stat -f '%Lp' "$file" 2>/dev/null || stat -c '%a' "$file")" = 600 ] || fail "credential file must be mode 0600"; done
. "$GROUP_CREDENTIAL_FILE"
. "$CLIENT_CREDENTIAL_FILE"
OUT="$OUTPUT_ROOT/staging-$RUN_ID"
[ ! -e "$OUT" ] || fail "staging run already exists"
mkdir -p "$OUT"; chmod 700 "$OUT"
export YUZHOU_GROUP_WEB_SQLSERVER YUZHOU_GROUP_WEB_DATABASE YUZHOU_GROUP_WEB_ETL_LOGIN YUZHOU_GROUP_WEB_ETL_PASSWORD
export YUZHOU_SQLSERVER_DATABASE YUZHOU_SQLSERVER_ETL_LOGIN YUZHOU_SQLSERVER_ETL_PASSWORD
export YUZHOU_CLIENT_SQLSERVER="${YUZHOU_CLIENT_SQLSERVER:-127.0.0.1,14333}"
export YUZHOU_RECONCILIATION_KEY_FILE="${YUZHOU_RECONCILIATION_KEY_FILE:-$OUTPUT_ROOT/dual-source-reconciliation.hmac}"
export YUZHOU_RECONCILIATION_OUTPUT="$OUT/employee-reconciliation.json"
node "$ROOT_DIR/scripts/hr-cutover/extract-dual-source-employee-reconciliation.mjs"
printf 'YUZHOU_DUAL_SOURCE_EMPLOYEE_RECONCILIATION_OK run_id=%s output=%s\n' "$RUN_ID" "$OUT"
