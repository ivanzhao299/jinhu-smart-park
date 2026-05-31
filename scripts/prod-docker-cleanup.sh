#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

printf "Production Docker cleanup started.\n"
printf "Keeping images used by current production containers:\n"
compose ps --format "table {{.Name}}\t{{.Image}}\t{{.State}}" || true

printf "\nPruning stopped containers...\n"
docker container prune -f

printf "\nPruning unused images. Current container images are kept by Docker automatically.\n"
docker image prune -af

printf "\nPruning build cache. Production does not keep historical build cache by default.\n"
docker builder prune -af

printf "\nProduction Docker cleanup finished.\n"
