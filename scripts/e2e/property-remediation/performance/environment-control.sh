#!/bin/sh
set -eu

if [ "${1:-}" != "initialize" ]; then
  echo "usage: environment-control.sh initialize" >&2
  exit 2
fi

case "${PROPERTY_PERF_PROJECT_NAME:-}" in
  jinhu-track-c-perf-*) ;;
  *) echo "refusing non-isolated compose project" >&2; exit 2 ;;
esac
case "${POSTGRES_DB:-}" in
  jinhu_perf_*) ;;
  *) echo "refusing non-isolated database" >&2; exit 2 ;;
esac

export ADMIN_PASSWORD="$(cat /run/secrets/admin_password)"
export COMPOSE_FILE POSTGRES_DB POSTGRES_USER ADMIN_USERNAME ADMIN_PASSWORD ADMIN_NAME TENANT_ID PARK_ID ROLE_CODE

existing_tables="$(docker compose -p "$PROPERTY_PERF_PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres \
  psql -X -qAt -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');")"
if [ "$existing_tables" != "0" ]; then
  echo "refusing to restore into a non-empty performance database" >&2
  exit 2
fi

docker compose -p "$PROPERTY_PERF_PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --exit-on-error --no-owner --no-acl < /run/perf/dataset.dump

MIGRATION_EXECUTED_BY=track-c-performance \
  sh /workspace/scripts/db-migrate.sh
ALLOW_PRODUCTION_SEED=yes \
  sh /workspace/scripts/db-seed-prod.sh
sh /workspace/scripts/check-init-baseline.sh || true
sh /workspace/scripts/bootstrap-admin.sh
STRICT=true sh /workspace/scripts/check-init-baseline.sh

unset ADMIN_PASSWORD
echo "isolated Track C dataset initialized"
