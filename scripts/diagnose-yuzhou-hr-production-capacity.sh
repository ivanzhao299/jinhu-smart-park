#!/usr/bin/env sh
set -eu

mode="${1:-}"
root_dir="${2:-}"
host_base_min_kib=$((20 * 1024 * 1024))
container_min_kib=$((15 * 1024 * 1024))
recovery_working_set_multiplier=2

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

instance_filesystem_row="$(df -Pk | awk 'NR > 1 && $1 !~ /^(tmpfs|devtmpfs|overlay|shm)$/ { if (!seen[$1]++) { count += 1; total += $2; used += $3; free += $4 } } END { printf "%d|%.0f|%.0f|%.0f", count, total, used, free }')" || fail
IFS='|' read -r instance_persistent_filesystem_count instance_persistent_total_kib instance_persistent_used_kib instance_persistent_free_kib <<EOF
$instance_filesystem_row
EOF
for value in "$instance_persistent_filesystem_count" "$instance_persistent_total_kib" "$instance_persistent_used_kib" "$instance_persistent_free_kib"; do
  numeric "$value"
done

instance_block_disk_row="$(lsblk -J -b -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS 2>/dev/null | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    const disks = [];
    const hasMount = (node) => Array.isArray(node.mountpoints)
      ? node.mountpoints.some(Boolean)
      : Boolean(node.mountpoint || node.mountpoints);
    const visit = (node, disk) => {
      let current = disk;
      if (node.type === "disk") {
        current = { size: Number(node.size), mounted: false, hasFilesystem: false };
        disks.push(current);
      }
      if (!current || !Number.isSafeInteger(current.size) || current.size <= 0) return;
      if (hasMount(node)) current.mounted = true;
      if (typeof node.fstype === "string" && node.fstype.trim() !== "") current.hasFilesystem = true;
      for (const child of node.children || []) visit(child, current);
    };
    for (const node of JSON.parse(input).blockdevices || []) visit(node, null);
    if (disks.length === 0) process.exit(1);
    const summarize = (predicate) => disks.filter(predicate).reduce((sum, disk) => sum + disk.size, 0);
    const mounted = (disk) => disk.mounted;
    const unmounted = (disk) => !disk.mounted;
    const unmountedWithFilesystem = (disk) => unmounted(disk) && disk.hasFilesystem;
    const unmountedWithoutFilesystem = (disk) => unmounted(disk) && !disk.hasFilesystem;
    const result = [
      disks.length, summarize(() => true),
      disks.filter(mounted).length, summarize(mounted),
      disks.filter(unmounted).length, summarize(unmounted),
      disks.filter(unmountedWithFilesystem).length, summarize(unmountedWithFilesystem),
      disks.filter(unmountedWithoutFilesystem).length, summarize(unmountedWithoutFilesystem)
    ];
    process.stdout.write(result.join("|"));
  });
')" || fail
IFS='|' read -r instance_block_disk_count instance_block_disk_total_bytes instance_mounted_block_disk_count instance_mounted_block_disk_total_bytes instance_unmounted_block_disk_count instance_unmounted_block_disk_total_bytes instance_unmounted_with_filesystem_count instance_unmounted_with_filesystem_total_bytes instance_unmounted_without_filesystem_count instance_unmounted_without_filesystem_total_bytes <<EOF
$instance_block_disk_row
EOF
for value in "$instance_block_disk_count" "$instance_block_disk_total_bytes" "$instance_mounted_block_disk_count" "$instance_mounted_block_disk_total_bytes" "$instance_unmounted_block_disk_count" "$instance_unmounted_block_disk_total_bytes" "$instance_unmounted_with_filesystem_count" "$instance_unmounted_with_filesystem_total_bytes" "$instance_unmounted_without_filesystem_count" "$instance_unmounted_without_filesystem_total_bytes"; do
  numeric "$value"
done

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

host_recovery_required_kib=$((host_base_min_kib + recovery_working_set_multiplier * (postgres_data_used_kib + api_file_used_kib)))

status="READY_FOR_GATE19"
if [ "$host_free_kib" -lt "$host_recovery_required_kib" ] || [ "$docker_free_kib" -lt "$container_min_kib" ] || [ "$postgres_tmp_free_kib" -lt "$container_min_kib" ] || [ "$postgres_data_free_kib" -lt "$container_min_kib" ] || [ "$api_tmp_free_kib" -lt "$container_min_kib" ]; then
  status="DISK_GUARD"
fi

printf '%s\n' 'YUZHOU_HR_CAPACITY_DIAGNOSTIC'
printf 'status=%s\n' "$status"
printf 'host_total_kib=%s\n' "$host_total_kib"
printf 'host_used_kib=%s\n' "$host_used_kib"
printf 'host_free_kib=%s\n' "$host_free_kib"
printf 'host_base_minimum_kib=%s\n' "$host_base_min_kib"
printf 'host_recovery_working_set_multiplier=%s\n' "$recovery_working_set_multiplier"
printf 'host_recovery_required_kib=%s\n' "$host_recovery_required_kib"
printf 'instance_persistent_filesystem_count=%s\n' "$instance_persistent_filesystem_count"
printf 'instance_persistent_total_kib=%s\n' "$instance_persistent_total_kib"
printf 'instance_persistent_used_kib=%s\n' "$instance_persistent_used_kib"
printf 'instance_persistent_free_kib=%s\n' "$instance_persistent_free_kib"
printf 'instance_block_disk_count=%s\n' "$instance_block_disk_count"
printf 'instance_block_disk_total_bytes=%s\n' "$instance_block_disk_total_bytes"
printf 'instance_mounted_block_disk_count=%s\n' "$instance_mounted_block_disk_count"
printf 'instance_mounted_block_disk_total_bytes=%s\n' "$instance_mounted_block_disk_total_bytes"
printf 'instance_unmounted_block_disk_count=%s\n' "$instance_unmounted_block_disk_count"
printf 'instance_unmounted_block_disk_total_bytes=%s\n' "$instance_unmounted_block_disk_total_bytes"
printf 'instance_unmounted_with_filesystem_count=%s\n' "$instance_unmounted_with_filesystem_count"
printf 'instance_unmounted_with_filesystem_total_bytes=%s\n' "$instance_unmounted_with_filesystem_total_bytes"
printf 'instance_unmounted_without_filesystem_count=%s\n' "$instance_unmounted_without_filesystem_count"
printf 'instance_unmounted_without_filesystem_total_bytes=%s\n' "$instance_unmounted_without_filesystem_total_bytes"
printf 'docker_data_total_kib=%s\n' "$docker_total_kib"
printf 'docker_data_used_kib=%s\n' "$docker_used_kib"
printf 'docker_data_free_kib=%s\n' "$docker_free_kib"
printf 'container_minimum_kib=%s\n' "$container_min_kib"
