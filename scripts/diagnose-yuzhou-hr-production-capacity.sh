#!/usr/bin/env sh
set -eu

mode="${1:-}"
root_dir="${2:-}"
host_min_kib=$((100 * 1024 * 1024))
container_min_kib=$((15 * 1024 * 1024))

fail() {
  printf '%s\n' "YUZHOU_HR_CAPACITY_PROBE_FAILED" >&2
  exit 1
}

case "$mode" in
  report) ;;
  *) fail ;;
esac
test -n "$root_dir" && test -d "$root_dir" || fail

env_file="${ENV_FILE:-$root_dir/.env.production}"
compose_file="${COMPOSE_FILE:-$root_dir/infra/docker/docker-compose.prod.yml}"
test -f "$env_file" && test -f "$compose_file" || fail

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

numeric() {
  case "$1" in
    ''|*[!0-9]*) fail ;;
  esac
}

filesystem_kib() {
  df -Pk "$1" | awk 'NR == 2 { print $2 "|" $3 "|" $4; exit }'
}

read_filesystem() {
  row="$(filesystem_kib "$1")"
  IFS='|' read -r fs_total_kib fs_used_kib fs_free_kib <<EOF
$row
EOF
  numeric "$fs_total_kib"
  numeric "$fs_used_kib"
  numeric "$fs_free_kib"
  printf '%s|%s|%s\n' "$fs_total_kib" "$fs_used_kib" "$fs_free_kib"
}

host_row="$(read_filesystem "$root_dir")"
IFS='|' read -r host_total_kib host_used_kib host_free_kib <<EOF
$host_row
EOF

docker_root="$(docker info --format '{{.DockerRootDir}}' 2>/dev/null)" || fail
test -n "$docker_root" || fail
docker_row="$(read_filesystem "$docker_root")"
IFS='|' read -r docker_total_kib docker_used_kib docker_free_kib <<EOF
$docker_row
EOF

postgres_tmp_free_kib="$(compose exec -T postgres sh -c 'df -Pk /tmp | awk '\''NR == 2 { print $4; exit }'\''')" || fail
postgres_data_row="$(compose exec -T postgres sh -c 'data_dir="${PGDATA:-/var/lib/postgresql/data}"; free_kib=$(df -Pk "$data_dir" | awk '\''NR == 2 { print $4; exit}'\''); used_kib=$(du -sk "$data_dir" | awk '\''NR == 1 { print $1; exit}'\''); printf "%s|%s" "$free_kib" "$used_kib"')" || fail
api_tmp_free_kib="$(compose exec -T api sh -c 'df -Pk /tmp | awk '\''NR == 2 { print $4; exit }'\''')" || fail
api_file_used_kib="$(compose exec -T api sh -c 'file_root="${FILE_STORAGE_LOCAL_ROOT:-}"; test -n "$file_root" && test -d "$file_root" || exit 1; du -sk "$file_root" | awk '\''NR == 1 { print $1; exit}'\''')" || fail

IFS='|' read -r postgres_data_free_kib postgres_data_used_kib <<EOF
$postgres_data_row
EOF
for value in "$postgres_tmp_free_kib" "$postgres_data_free_kib" "$postgres_data_used_kib" "$api_tmp_free_kib" "$api_file_used_kib"; do
  numeric "$value"
done

status="READY_FOR_GATE19"
if [ "$host_free_kib" -lt "$host_min_kib" ] || [ "$docker_free_kib" -lt "$container_min_kib" ] || [ "$postgres_tmp_free_kib" -lt "$container_min_kib" ] || [ "$postgres_data_free_kib" -lt "$container_min_kib" ] || [ "$api_tmp_free_kib" -lt "$container_min_kib" ]; then
  status="DISK_GUARD"
fi

printf '%s\n' 'YUZHOU_HR_CAPACITY_DIAGNOSTIC'
printf 'status=%s\n' "$status"
printf 'host_total_kib=%s\n' "$host_total_kib"
printf 'host_used_kib=%s\n' "$host_used_kib"
printf 'host_free_kib=%s\n' "$host_free_kib"
printf 'host_minimum_kib=%s\n' "$host_min_kib"
printf 'docker_data_total_kib=%s\n' "$docker_total_kib"
printf 'docker_data_used_kib=%s\n' "$docker_used_kib"
printf 'docker_data_free_kib=%s\n' "$docker_free_kib"
printf 'container_minimum_kib=%s\n' "$container_min_kib"
printf 'postgres_tmp_free_kib=%s\n' "$postgres_tmp_free_kib"
printf 'postgres_data_free_kib=%s\n' "$postgres_data_free_kib"
printf 'postgres_data_used_kib=%s\n' "$postgres_data_used_kib"
printf 'api_tmp_free_kib=%s\n' "$api_tmp_free_kib"
printf 'api_file_used_kib=%s\n' "$api_file_used_kib"

docker system df --format 'docker_category={{.Type}} size={{.Size}} reclaimable={{.Reclaimable}}' 2>/dev/null || fail
