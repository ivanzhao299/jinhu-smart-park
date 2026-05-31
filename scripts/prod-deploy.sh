#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\nCopy .env.production.example to .env.production and fill production values first.\n" "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

wait_for_postgres() {
  i=0
  while [ "$i" -lt 60 ]; do
    if compose exec -T postgres pg_isready -U "${POSTGRES_USER:-jinhu}" -d "${POSTGRES_DB:-jinhu_smart_park}" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 2
  done
  printf "PostgreSQL did not become healthy in time.\n" >&2
  return 1
}

compose build api web
compose up -d postgres
wait_for_postgres

COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/db-migrate.sh"

if [ "${RUN_PRODUCTION_SEED:-no}" = "yes" ]; then
  ALLOW_PRODUCTION_SEED=yes COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/db-seed-prod.sh"
fi

compose up -d api web
"$ROOT_DIR/scripts/prod-healthcheck.sh"

if [ "${PRUNE_DOCKER_AFTER_DEPLOY:-yes}" = "yes" ]; then
  "$ROOT_DIR/scripts/prod-docker-cleanup.sh"
fi

printf "Production deployment finished.\n"
