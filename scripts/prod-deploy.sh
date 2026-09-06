#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
PROD_DEPLOY_MODE="${PROD_DEPLOY_MODE:-${DEPLOY_MODE:-full}}"
WEB_CONTAINER_NAME="${WEB_CONTAINER_NAME:-jinhu-smart-park-prod-web}"
RUNTIME_DESIGN_SYSTEM_CSS="$ROOT_DIR/apps/web/public/runtime-design-system.css"
REQUESTED_RUN_PRODUCTION_SEED_IS_SET="${RUN_PRODUCTION_SEED+x}"
REQUESTED_RUN_PRODUCTION_SEED="${RUN_PRODUCTION_SEED-}"
REQUESTED_RELEASE_COMMIT="${RELEASE_COMMIT-}"
readonly REQUESTED_RELEASE_COMMIT
case "$REQUESTED_RELEASE_COMMIT" in
  *[!0-9a-f]*) printf 'PRODUCTION_RELEASE_COMMIT_INVALID\n' >&2; exit 1 ;;
esac
if [ -n "$REQUESTED_RELEASE_COMMIT" ] && [ "${#REQUESTED_RELEASE_COMMIT}" -ne 40 ]; then
  printf 'PRODUCTION_RELEASE_COMMIT_INVALID\n' >&2; exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\nCopy .env.production.example to .env.production and fill production values first.\n" "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

# The workflow decides whether this release contains production-seed changes.
# Preserve that one-shot decision over the long-lived .env.production default.
if [ "$REQUESTED_RUN_PRODUCTION_SEED_IS_SET" = "x" ]; then
  RUN_PRODUCTION_SEED="$REQUESTED_RUN_PRODUCTION_SEED"
elif [ "${RUN_PRODUCTION_SEED+x}" != "x" ]; then
  RUN_PRODUCTION_SEED=no
fi

case "$RUN_PRODUCTION_SEED" in
  yes|no)
    ;;
  *)
    printf "RUN_PRODUCTION_SEED must be yes or no, got: %s\n" "$RUN_PRODUCTION_SEED" >&2
    exit 1
    ;;
esac

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

run_migrations_and_optional_seed() {
  COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/db-migrate.sh"

  COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$ROOT_DIR/scripts/diagnose-000189-asset-scope.sh" enforce "$ROOT_DIR"
  COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$ROOT_DIR/scripts/repair-000194-retired-runtime-owner.sh" repair "$ROOT_DIR"
  COMPOSE_FILE="$COMPOSE_FILE" ENV_FILE="$ENV_FILE" \
    "$ROOT_DIR/scripts/diagnose-000194-runtime-control.sh" \
      enforce "$ROOT_DIR" "" "$RUN_PRODUCTION_SEED"

  if [ "${RUN_PRODUCTION_SEED:-no}" = "yes" ]; then
    ALLOW_PRODUCTION_SEED=yes COMPOSE_FILE="$COMPOSE_FILE" "$ROOT_DIR/scripts/db-seed-prod.sh"
  fi
}

quiesce_api_for_migrations() {
  printf "Stopping the existing API before database migrations. It will remain stopped until the new API starts.\n"
  compose stop api
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

deploy_fast_css() {
  if [ ! -f "$RUNTIME_DESIGN_SYSTEM_CSS" ]; then
    printf "Missing runtime design system CSS: %s\n" "$RUNTIME_DESIGN_SYSTEM_CSS" >&2
    exit 1
  fi
  if ! docker ps --format '{{.Names}}' | grep -Fx "$WEB_CONTAINER_NAME" >/dev/null 2>&1; then
    printf "Web container is not running: %s\n" "$WEB_CONTAINER_NAME" >&2
    exit 1
  fi
  docker cp "$RUNTIME_DESIGN_SYSTEM_CSS" "$WEB_CONTAINER_NAME:/app/apps/web/public/runtime-design-system.css"
  MODE=full sh "$ROOT_DIR/scripts/prod-healthcheck.sh"
}

deploy_web() {
  compose build web --build-arg "RELEASE_COMMIT=$REQUESTED_RELEASE_COMMIT"
  compose up -d postgres
  wait_for_postgres
  compose up -d web
  MODE=full sh "$ROOT_DIR/scripts/prod-healthcheck.sh"
}

deploy_api() {
  compose build api --build-arg "RELEASE_COMMIT=$REQUESTED_RELEASE_COMMIT"
  compose up -d api
  MODE=full sh "$ROOT_DIR/scripts/prod-healthcheck.sh"
}

deploy_database() {
  compose up -d postgres
  wait_for_postgres
  quiesce_api_for_migrations
  run_migrations_and_optional_seed
  compose up -d api
  MODE=full sh "$ROOT_DIR/scripts/prod-healthcheck.sh"
}

deploy_full() {
  compose build api web --build-arg "RELEASE_COMMIT=$REQUESTED_RELEASE_COMMIT"
  compose up -d postgres
  wait_for_postgres
  quiesce_api_for_migrations
  run_migrations_and_optional_seed
  compose up -d api web
  MODE=full sh "$ROOT_DIR/scripts/prod-healthcheck.sh"
}

printf "Production deployment started with PROD_DEPLOY_MODE=%s\n" "$PROD_DEPLOY_MODE"

case "$PROD_DEPLOY_MODE" in
  fast-css)
    deploy_fast_css
    ;;
  web)
    deploy_web
    ;;
  api)
    deploy_api
    ;;
  database)
    deploy_database
    ;;
  full)
    deploy_full
    ;;
  auto)
    printf "PROD_DEPLOY_MODE=auto is resolved by CI; falling back to full deploy locally.\n"
    deploy_full
    ;;
  *)
    printf "Unknown PROD_DEPLOY_MODE: %s\n" "$PROD_DEPLOY_MODE" >&2
    printf "Supported values: auto, fast-css, web, api, database, full\n" >&2
    exit 1
    ;;
esac

case "${PRUNE_DOCKER_AFTER_DEPLOY:-yes}" in
  yes|true|1)
    "$ROOT_DIR/scripts/prod-docker-cleanup.sh"
    ;;
  *)
    printf "Skipping production Docker cleanup because PRUNE_DOCKER_AFTER_DEPLOY=%s\n" "${PRUNE_DOCKER_AFTER_DEPLOY:-yes}"
    ;;
esac

printf "Production deployment finished.\n"
