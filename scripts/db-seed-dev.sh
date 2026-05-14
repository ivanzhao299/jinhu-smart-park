#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
SEEDS_DIR="${SEEDS_DIR:-$ROOT_DIR/database/seeds}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"

for file in "$SEEDS_DIR"/000001_s1_permissions.sql "$SEEDS_DIR"/000002_s1_dev_accounts.sql; do
  if [ ! -f "$file" ]; then
    echo "Seed file not found: $file" >&2
    exit 1
  fi
  echo "Applying development seed: $(basename "$file")"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$file"
done

echo "Development seeds applied."
