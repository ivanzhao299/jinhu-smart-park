#!/usr/bin/env sh

# Produces a hash-only T0-T3 target inventory. Raw rows exist only in private
# temporary files on the production host and are never printed or persisted.
set -eu

mode="${1:-report}"
deploy_path="${2:-.}"
target_scope_sha256="${3:-}"
compose_file="${COMPOSE_FILE:-infra/docker/docker-compose.prod.yml}"
env_file="${ENV_FILE:-.env.production}"

case "$mode" in report) ;; *) echo 'YUZHOU_HR_TARGET_INVENTORY_USAGE' >&2; exit 2 ;; esac
case "$deploy_path" in /*|.) ;; *) echo 'YUZHOU_HR_TARGET_INVENTORY_INVALID_PATH' >&2; exit 2 ;; esac

classify_probe_failure() {
  case "$1" in
    PRODUCTION_IMPORT_TARGET_INVENTORY_INPUT_INVALID|PRODUCTION_IMPORT_TARGET_INVENTORY_SCOPE_INVALID|PRODUCTION_IMPORT_TARGET_INVENTORY_RECORD_INVALID|PRODUCTION_IMPORT_TARGET_INVENTORY_DUPLICATE|PRODUCTION_IMPORT_TARGET_INVENTORY_FAILED|PRODUCTION_IMPORT_TARGET_INVENTORY_ARGUMENT_INVALID) printf '%s\n' "$1" ;;
    *'password authentication failed'*|*'no password supplied'*|*'authentication failed'*) printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_DB_AUTH_FAILED' ;;
    *'could not connect to server'*|*'connection refused'*|*'server is starting up'*|*'No such container'*|*'No such service: postgres'*) printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_RUNTIME_UNAVAILABLE' ;;
    *'permission denied'*) printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_DB_PERMISSION_DENIED' ;;
    *'relation '*' does not exist'*|*'column '*' does not exist'*|*'function '*' does not exist'*) printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_SCHEMA_MISSING' ;;
    *) printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_PROBE_FAILED' ;;
  esac
}

cd "$deploy_path"
umask 077
query="$(mktemp)"
payload="$(mktemp)"
receipt="$(mktemp)"
probe_error="$(mktemp)"
trap 'rm -f "$query" "$payload" "$receipt" "$probe_error"' EXIT HUP INT TERM

node scripts/hr-cutover/materialize-production-target-inventory.mjs --sql "$target_scope_sha256" > "$query"
if ! docker compose --env-file "$env_file" -f "$compose_file" exec -T postgres \
  sh -c 'database_name="${POSTGRES_DB}"; exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$database_name"' \
  < "$query" > "$payload" 2> "$probe_error"; then
  printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_SQL_STAGE_FAILED' >&2
  classify_probe_failure "$(cat "$probe_error")" >&2
  exit 1
fi
if ! node scripts/hr-cutover/materialize-production-target-inventory.mjs < "$payload" > "$receipt" 2> "$probe_error"; then
  printf '%s\n' 'YUZHOU_HR_TARGET_INVENTORY_MATERIALIZE_STAGE_FAILED' >&2
  classify_probe_failure "$(cat "$probe_error")" >&2
  exit 1
fi
cat "$receipt"
