#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../../../../../.." && pwd)"
GATE_DB="${PROPERTY_RUNTIME_PG_DATABASE:-jinhu_property_runtime_gate_$(date +%s)_$$}"
GATE_MIGRATIONS="$(mktemp -d "${TMPDIR:-/tmp}/property-runtime-migrations.XXXXXX")"
GATE_DB_CREATED=no
GATE_TEST_MODE="${PROPERTY_RUNTIME_GATE_TEST_MODE:-0}"
DOCKER_BIN=docker
PHASE_ONE="$GATE_MIGRATIONS/phase-one"
PHASE_TWO="$GATE_MIGRATIONS/phase-two"

cleanup() {
  cleanup_status="$1"
  trap - EXIT HUP INT TERM
  if [ "$GATE_DB_CREATED" = yes ]; then
    if ! "$DOCKER_BIN" compose -f "$ROOT_DIR/infra/docker/docker-compose.yml" exec -T postgres \
      dropdb -U "${POSTGRES_USER:-jinhu}" "$GATE_DB"; then
      echo "failed to drop property runtime gate database: $GATE_DB" >&2
      cleanup_status=1
    fi
  fi
  if ! rm -rf "$GATE_MIGRATIONS"; then
    echo "failed to remove property runtime gate migrations: $GATE_MIGRATIONS" >&2
    cleanup_status=1
  fi
  exit "$cleanup_status"
}
trap 'cleanup "$?"' EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

if [ "$GATE_TEST_MODE" = 1 ]; then
  if [ -z "${PROPERTY_RUNTIME_DOCKER_BIN:-}" ]; then
    echo "PROPERTY_RUNTIME_DOCKER_BIN is required in property runtime gate test mode" >&2
    exit 2
  fi
  DOCKER_BIN="$PROPERTY_RUNTIME_DOCKER_BIN"
elif [ "$GATE_TEST_MODE" != 0 ]; then
  echo "PROPERTY_RUNTIME_GATE_TEST_MODE must be 0 or 1" >&2
  exit 2
fi

is_node22() {
  [ -x "$1" ] && [ "$("$1" -p "process.versions.node.split('.')[0]" 2>/dev/null)" = 22 ]
}

resolve_node22() {
  if [ -n "${PROPERTY_RUNTIME_NODE_BIN:-}" ]; then
    if is_node22 "$PROPERTY_RUNTIME_NODE_BIN"; then
      printf '%s\n' "$PROPERTY_RUNTIME_NODE_BIN"
      return 0
    fi
    echo "PROPERTY_RUNTIME_NODE_BIN must reference an executable Node.js 22 binary" >&2
    return 1
  fi
  for node_candidate in \
    "$ROOT_DIR/.node/bin/node" \
    "$ROOT_DIR/node_modules/.bin/node" \
    "${HOME:-/nonexistent}/.nvm/versions/node/v22.23.2/bin/node" \
    "${NVM_BIN:-/nonexistent}/node"
  do
    if is_node22 "$node_candidate"; then
      printf '%s\n' "$node_candidate"
      return 0
    fi
  done
  path_node="$(command -v node 2>/dev/null || true)"
  if [ -n "$path_node" ] && is_node22 "$path_node"; then
    printf '%s\n' "$path_node"
    return 0
  fi
  echo "property runtime PostgreSQL gate requires Node.js 22; set PROPERTY_RUNTIME_NODE_BIN" >&2
  return 1
}

NODE_BIN="$(resolve_node22)"
case "$GATE_DB" in
  *[!a-zA-Z0-9_]*|'') echo "invalid gate database name" >&2; exit 2 ;;
esac
if [ "$GATE_TEST_MODE" = 0 ]; then
  mkdir -p "$PHASE_ONE" "$PHASE_TWO"
  for migration in "$ROOT_DIR"/database/migrations/*.sql; do
    case "$(basename "$migration")" in
      000189_*|000190_*|000193_*) cp "$migration" "$PHASE_TWO/" ;;
      *) cp "$migration" "$PHASE_ONE/" ;;
    esac
  done
fi

"$DOCKER_BIN" compose -f "$ROOT_DIR/infra/docker/docker-compose.yml" exec -T postgres \
  createdb -U "${POSTGRES_USER:-jinhu}" "$GATE_DB"
GATE_DB_CREATED=yes

if [ "$GATE_TEST_MODE" = 0 ]; then
  POSTGRES_DB="$GATE_DB" MIGRATIONS_DIR="$PHASE_ONE" MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
    sh "$ROOT_DIR/scripts/db-migrate.sh"
  ALLOW_PRODUCTION_SEED=yes POSTGRES_DB="$GATE_DB" \
    sh "$ROOT_DIR/scripts/db-seed-prod.sh"
  "$DOCKER_BIN" compose -f "$ROOT_DIR/infra/docker/docker-compose.yml" exec -T postgres \
    psql -X -q -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-jinhu}" -d "$GATE_DB" \
    -c "INSERT INTO asset_park(tenant_id,park_id,park_code,park_name,status,remark)
        VALUES('10000001','20000001','PG-GATE','Property runtime PG gate','enabled',
               'Ephemeral migration preflight fixture')
        ON CONFLICT (tenant_id,park_id,park_code) WHERE is_deleted=false DO NOTHING"
  POSTGRES_DB="$GATE_DB" MIGRATIONS_DIR="$PHASE_TWO" MIGRATION_BASELINE_ON_NONEMPTY_DB=no \
    sh "$ROOT_DIR/scripts/db-migrate.sh"
fi

export PROPERTY_RUNTIME_PG_URL="${PROPERTY_RUNTIME_PG_URL:-postgresql://${POSTGRES_USER:-jinhu}:${POSTGRES_PASSWORD:-change_me}@127.0.0.1:${POSTGRES_PORT:-5432}/$GATE_DB}"
export TS_NODE_PROJECT="$ROOT_DIR/apps/api/tsconfig.json"
set +e
"$NODE_BIN" --test --test-concurrency=1 --test-reporter=spec --require \
  "$ROOT_DIR/apps/api/node_modules/ts-node/register" \
  "$ROOT_DIR/apps/api/src/modules/property-approvals/outbox/property-event-runtime.pg.spec.ts" \
  "$ROOT_DIR/apps/api/src/modules/property-approvals/property-approval.runtime.pg.spec.ts"
TEST_STATUS=$?
set -e
exit "$TEST_STATUS"
