#!/usr/bin/env sh
set -eu

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }

require POSTGRES_HOST
require POSTGRES_PORT
require POSTGRES_DB
require POSTGRES_USER
require POSTGRES_PASSWORD

case "$POSTGRES_HOST" in 127.0.0.1|localhost|::1) ;; *) fail "attendance PostgreSQL gate requires loopback host" ;; esac
case "$POSTGRES_PORT" in *[!0-9]*|"") fail "attendance PostgreSQL gate requires numeric port" ;; esac
case "$POSTGRES_DB" in jinhu_hr_migration_lab_core_*) ;; *) fail "attendance PostgreSQL gate requires isolated migration lab database" ;; esac

export HR_ATTENDANCE_REQUEST_PG_REQUIRED=1
exec pnpm --filter @jinhu/api exec node --test --require ts-node/register src/modules/hr/hr-attendance-request.pg.spec.ts
