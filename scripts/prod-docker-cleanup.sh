#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
PRUNE_DOCKER_BUILD_CACHE="${PRUNE_DOCKER_BUILD_CACHE:-no}"
DOCKER_BUILD_CACHE_KEEP_STORAGE="${DOCKER_BUILD_CACHE_KEEP_STORAGE:-5gb}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

printf "Production Docker cleanup started.\n"
printf "\nDocker disk usage before cleanup:\n"
docker system df || true

printf "Keeping images used by current production containers:\n"
compose ps --format "table {{.Name}}\t{{.Image}}\t{{.State}}" || true

printf "\nPruning stopped containers...\n"
docker container prune -f

printf "\nPruning unused images. Current container images are kept by Docker automatically.\n"
docker image prune -af

case "$PRUNE_DOCKER_BUILD_CACHE" in
  yes|true|1)
    printf "\nPruning Docker build cache with keep-storage=%s.\n" "$DOCKER_BUILD_CACHE_KEEP_STORAGE"
    docker builder prune -af --keep-storage "$DOCKER_BUILD_CACHE_KEEP_STORAGE"
    ;;
  *)
    printf "\nKeeping Docker build cache for faster rebuilds. Set PRUNE_DOCKER_BUILD_CACHE=yes to prune it.\n"
    ;;
esac

printf "\nDocker disk usage after cleanup:\n"
docker system df || true

printf "\nRunning containers after cleanup:\n"
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}" || true

printf "\nProduction Docker cleanup finished.\n"
