#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/database/migrations}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "Migration directory not found: $MIGRATIONS_DIR" >&2
  exit 1
fi

for file in "$MIGRATIONS_DIR"/*.sql; do
  [ -e "$file" ] || continue
  echo "Applying migration: $(basename "$file")"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$file"
done

echo "Migrations applied."
