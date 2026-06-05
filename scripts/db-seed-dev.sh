#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.yml}"
SEEDS_DIR="${SEEDS_DIR:-$ROOT_DIR/database/seeds}"
POSTGRES_USER="${POSTGRES_USER:-jinhu}"
POSTGRES_DB="${POSTGRES_DB:-jinhu_smart_park}"
ALLOW_DEV_SEED="${ALLOW_DEV_SEED:-no}"
DISABLE_DEV_SEED="${DISABLE_DEV_SEED:-no}"
NODE_ENV_VALUE="${NODE_ENV:-}"
APP_ENV_VALUE="${APP_ENV:-}"

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

blocked_env=false
block_reason=""

if is_truthy "$DISABLE_DEV_SEED"; then
  blocked_env=true
  block_reason="DISABLE_DEV_SEED is enabled"
fi

if [ "$NODE_ENV_VALUE" = "production" ]; then
  blocked_env=true
  block_reason="NODE_ENV=production"
fi

case "$APP_ENV_VALUE" in
  production|staging|shared)
    blocked_env=true
    block_reason="APP_ENV=$APP_ENV_VALUE"
    ;;
esac

if [ "$blocked_env" = "true" ] && ! is_truthy "$ALLOW_DEV_SEED"; then
  cat >&2 <<EOF
Refusing to run development seed because $block_reason.
Development seed is for local environments only and must not be used in shared, staging, or production environments.
If you absolutely need to override this protection, set ALLOW_DEV_SEED=yes explicitly and rerun.
EOF
  exit 1
fi

for file in "$SEEDS_DIR"/000001_s1_production_core.sql "$SEEDS_DIR"/000002_dev_only_s1_accounts.sql; do
  if [ ! -f "$file" ]; then
    echo "Seed file not found: $file" >&2
    exit 1
  fi
  echo "Applying development seed: $(basename "$file")"
  docker compose -f "$COMPOSE_FILE" exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 < "$file"
done

echo "Development seeds applied."
