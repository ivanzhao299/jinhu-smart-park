#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
SEEDS_DIR="${SEEDS_DIR:-$ROOT_DIR/database/seeds}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"

if [ "${ALLOW_PRODUCTION_SEED:-}" != "yes" ]; then
  echo "Refusing to run production seeds without ALLOW_PRODUCTION_SEED=yes." >&2
  echo "This script intentionally excludes development accounts." >&2
  exit 1
fi

core_seed="$SEEDS_DIR/000001_s1_production_core.sql"
if [ ! -f "$core_seed" ]; then
  echo "Seed file not found: $core_seed" >&2
  exit 1
fi

run_seed() {
  seed_file="$1"
  echo "Applying production seed: $(basename "$seed_file")"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$seed_file"
}

run_seed "$core_seed"

for seed_file in "$SEEDS_DIR"/production/*.sql; do
  [ -f "$seed_file" ] || continue
  run_seed "$seed_file"
done

echo "Production seeds applied."
