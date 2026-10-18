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
  # The diagnostic arrives through sh -s; fixed queries must not consume its source stream.
  docker compose --env-file "$env_file" -f "$compose_file" "$@" </dev/null
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


# These observations supplement capacity evidence; they never change the existing gate status.
# Each traversal is on one device, does not follow symlinks, and may overlap another label.
directory_kib() {
  directory_label="$1"
  directory_path="$2"
  directory_value=UNAVAILABLE
  if [ ! -e "$directory_path" ] && [ ! -L "$directory_path" ]; then
    directory_value=NOT_PRESENT
  elif [ -d "$directory_path" ] && [ ! -L "$directory_path" ] && command -v timeout >/dev/null 2>&1 && command -v du >/dev/null 2>&1; then
    if directory_output="$(timeout -k 1s 8s du -P -x -s -k -- "$directory_path" 2>/dev/null)"; then
      if directory_size="$(printf '%s\n' "$directory_output" | awk 'NR == 1 && NF >= 2 && $1 ~ /^[0-9]+$/ { value=$1 } END { if (NR == 1 && value != "") print value; else exit 1 }')"; then
        directory_value="$directory_size"
      fi
    fi
  fi
  printf 'directory_%s_used_kib=%s\n' "$directory_label" "$directory_value"
}

printf 'directory_probe_timeout_seconds=8\n'
printf 'directory_sizes_overlap=true\n'
printf 'directory_sizes_same_filesystem_only=true\n'
directory_kib root /
directory_kib var /var
directory_kib var_lib /var/lib
directory_kib var_cache /var/cache
directory_kib var_backups /var/backups
directory_kib backups_jinhu_smart_park /var/backups/jinhu-smart-park
directory_kib backups_jinhu /var/backups/jinhu
directory_kib backups_park /var/backups/park
directory_kib backups_yuzhou_hr /var/backups/yuzhou-hr
directory_kib backups_kingturf_erp /var/backups/kingturf-erp
directory_kib var_www /var/www
directory_kib var_spool /var/spool
directory_kib var_snap /var/snap
directory_kib var_opt /var/opt
directory_kib var_crash /var/crash
directory_kib containerd /var/lib/containerd
directory_kib containerd_overlayfs /var/lib/containerd/io.containerd.snapshotter.v1.overlayfs
directory_kib containerd_content /var/lib/containerd/io.containerd.content.v1.content
directory_kib containerd_metadata /var/lib/containerd/io.containerd.metadata.v1.bolt
directory_kib srv /srv
directory_kib opt /opt
directory_kib usr /usr
directory_kib root_home /root
directory_kib home /home
directory_kib tmp /tmp
directory_kib var_tmp /var/tmp
directory_kib var_log /var/log
directory_kib docker "$docker_root"
directory_kib docker_overlay2 "$docker_root/overlay2"
directory_kib docker_buildkit "$docker_root/buildkit"
directory_kib docker_containers "$docker_root/containers"
directory_kib docker_volumes "$docker_root/volumes"
directory_kib docker_tmp "$docker_root/tmp"
directory_kib release "$root_dir"
directory_kib release_node_modules "$root_dir/node_modules"
directory_kib release_web_next "$root_dir/apps/web/.next"
directory_kib release_logs "$root_dir/logs"
directory_kib release_tmp "$root_dir/tmp"
directory_kib gate19_reports "$root_dir/tmp/production-gates"
directory_kib rollback "${root_dir}.runner-rollback"
directory_kib failed_rollback_39086313571 "${root_dir}.runner-rollback/39086313571"
directory_kib data_mount /srv/jinhu-production-data
directory_kib retained_gate19_backups /srv/jinhu-production-data/hr-preimport-backups

# The mount path is fixed by mount-production-data-disk.sh; expose no device/path names.
data_mount_total_kib=UNAVAILABLE
data_mount_used_kib=UNAVAILABLE
data_mount_free_kib=UNAVAILABLE
data_mount_same_filesystem_as_host=UNAVAILABLE
if [ ! -e /srv/jinhu-production-data ] && [ ! -L /srv/jinhu-production-data ]; then
  data_mount_total_kib=NOT_PRESENT
  data_mount_used_kib=NOT_PRESENT
  data_mount_free_kib=NOT_PRESENT
  data_mount_same_filesystem_as_host=NOT_PRESENT
elif [ -d /srv/jinhu-production-data ] && [ ! -L /srv/jinhu-production-data ] && command -v timeout >/dev/null 2>&1; then
  if data_mount_output="$(timeout -k 1s 8s df -Pk /srv/jinhu-production-data 2>/dev/null)"; then
    data_mount_row="$(printf '%s\n' "$data_mount_output" | awk 'NR == 2 { print $2 "|" $3 "|" $4; exit }')"
    case "$data_mount_row" in
      ''|*[!0-9\|]*|\|*|*\|) ;;
      *)
        IFS='|' read -r candidate_total candidate_used candidate_free <<EOF
$data_mount_row
EOF
        case "$candidate_total:$candidate_used:$candidate_free" in
          *[!0-9:]*|:*|*::*|*:) ;;
          *) data_mount_total_kib="$candidate_total"; data_mount_used_kib="$candidate_used"; data_mount_free_kib="$candidate_free" ;;
        esac
        ;;
    esac
  fi
  if command -v stat >/dev/null 2>&1 && host_device="$(timeout -k 1s 8s stat -c %d -- "$root_dir" 2>/dev/null)" && data_device="$(timeout -k 1s 8s stat -c %d -- /srv/jinhu-production-data 2>/dev/null)"; then
    case "$host_device:$data_device" in
      *[!0-9:]*|:*|*:) ;;
      *:*:*) ;;
      *)
        if [ "$host_device" = "$data_device" ]; then data_mount_same_filesystem_as_host=yes; else data_mount_same_filesystem_as_host=no; fi
        ;;
    esac
  fi
fi
printf 'data_mount_total_kib=%s\n' "$data_mount_total_kib"
printf 'data_mount_used_kib=%s\n' "$data_mount_used_kib"
printf 'data_mount_free_kib=%s\n' "$data_mount_free_kib"
printf 'data_mount_same_filesystem_as_host=%s\n' "$data_mount_same_filesystem_as_host"

# Fixed, immediate-entry ownership hints only; classification is not disposal authority.
observe_backup_ownership() {
  timeout -k 1s 8s node - 2>/dev/null <<'CAPACITY_BACKUP_OBSERVER'
const fs = require("node:fs");
const ENTRY_LIMIT = 4096, CRON_ENTRY_LIMIT = 64, CRON_BYTE_LIMIT = 65536;
const output = [];
const emit = (key, value) => output.push(`${key}=${value}`);
const problem = status => { throw Object.assign(new Error("OBSERVER_UNAVAILABLE"), { status }); };
const optionalStat = path => {
  try { return fs.lstatSync(path); }
  catch (error) { if (error.code === "ENOENT") return null; problem("UNAVAILABLE"); }
};
const backupKeys = ["entries", "directories", "regular_files", "symlinks", "special_entries", "regular_bytes", "oldest_regular_age_seconds", "newest_regular_age_seconds"];
for (const category of ["hr_jinhu", "kingturf", "other"]) backupKeys.push(`${category}_entries`, `${category}_regular_files`, `${category}_regular_bytes`);
const categoryFor = name => {
  const known = ["jinhu-smart-park", "jinhu_pg_", "jinhu_files", "yuzhou-hr"];
  if (known.some(prefix => prefix.endsWith("_") ? name.startsWith(prefix) : name === prefix || ["-", "_", "."].some(separator => name.startsWith(prefix + separator)))) return "hr_jinhu";
  return /^kingturf(?:[-_.]|$)/i.test(name) ? "kingturf" : "other";
};
let backupStatus = "AVAILABLE", backup = Object.fromEntries(backupKeys.map(key => [key, 0]));
let oldest = null, newest = null;
try {
  const root = optionalStat("/var/backups");
  if (!root) problem("NOT_PRESENT");
  if (!root.isDirectory() || root.isSymbolicLink()) problem("UNAVAILABLE");
  const directory = fs.opendirSync("/var/backups");
  try {
    let entry;
    while ((entry = directory.readSync()) !== null) {
      if (backup.entries >= ENTRY_LIMIT) problem("TRUNCATED");
      const stat = fs.lstatSync(`/var/backups/${entry.name}`), category = categoryFor(entry.name);
      backup.entries++; backup[`${category}_entries`]++;
      if (stat.isSymbolicLink()) backup.symlinks++;
      else if (stat.isDirectory()) backup.directories++;
      else if (stat.isFile()) {
        if (!Number.isSafeInteger(stat.size) || stat.size < 0 || !Number.isFinite(stat.mtimeMs)) problem("UNAVAILABLE");
        backup.regular_files++; backup.regular_bytes += stat.size;
        backup[`${category}_regular_files`]++; backup[`${category}_regular_bytes`] += stat.size;
        if (!Number.isSafeInteger(backup.regular_bytes)) problem("UNAVAILABLE");
        const age = Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
        oldest = oldest === null ? age : Math.max(oldest, age);
        newest = newest === null ? age : Math.min(newest, age);
      } else backup.special_entries++;
    }
  } finally { directory.closeSync(); }
  backup.oldest_regular_age_seconds = oldest === null ? "NOT_PRESENT" : oldest;
  backup.newest_regular_age_seconds = newest === null ? "NOT_PRESENT" : newest;
} catch (error) {
  backupStatus = ["NOT_PRESENT", "TRUNCATED"].includes(error.status) ? error.status : "UNAVAILABLE";
  backup = Object.fromEntries(backupKeys.map(key => [key, backupStatus === "NOT_PRESENT" ? "NOT_PRESENT" : "UNAVAILABLE"]));
}
emit("backup_inventory_status", backupStatus);
emit("backup_inventory_entry_limit", ENTRY_LIMIT);
emit("backup_inventory_truncated", backupStatus === "TRUNCATED" ? "true" : backupStatus === "AVAILABLE" ? "false" : "UNAVAILABLE");
for (const key of backupKeys) emit(`backup_inventory_${key}`, backup[key]);

const cronKeys = ["files_scanned", "lines_referencing_backups", "lines_referencing_hr", "references_backups", "references_hr"];
let cronStatus = "AVAILABLE", cron = { files_scanned: 0, lines_referencing_backups: 0, lines_referencing_hr: 0, references_backups: false, references_hr: false };
try {
  const files = ["/etc/crontab", "/var/spool/cron/root", "/var/spool/cron/crontabs/root"];
  const directoryStat = optionalStat("/etc/cron.d");
  if (directoryStat) {
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) problem("UNAVAILABLE");
    const directory = fs.opendirSync("/etc/cron.d");
    let count = 0;
    try {
      let entry;
      while ((entry = directory.readSync()) !== null) {
        if (++count > CRON_ENTRY_LIMIT) problem("TRUNCATED");
        const path = `/etc/cron.d/${entry.name}`, stat = fs.lstatSync(path);
        if (stat.isFile() && !stat.isSymbolicLink()) files.push(path);
      }
    } finally { directory.closeSync(); }
  }
  for (const path of files) {
    const stat = optionalStat(path);
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink()) problem("UNAVAILABLE");
    const fd = fs.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    try {
      const opened = fs.fstatSync(fd);
      if (!opened.isFile()) problem("UNAVAILABLE");
      if (opened.size > CRON_BYTE_LIMIT) problem("TRUNCATED");
      const bytes = Buffer.alloc(CRON_BYTE_LIMIT + 1), read = fs.readSync(fd, bytes, 0, bytes.length, 0);
      if (read > CRON_BYTE_LIMIT) problem("TRUNCATED");
      cron.files_scanned++;
      for (const line of bytes.toString("utf8", 0, read).split(/\r?\n/)) {
        if (!line.trim() || line.trimStart().startsWith("#")) continue;
        if (/\/var\/backups(?:\/|$|[\s"'\x60;])/.test(line)) cron.lines_referencing_backups++;
        if (/\/var\/backups\/(?:jinhu-smart-park|jinhu|park|yuzhou-hr)(?:\/|$|[\s"'\x60;])/.test(line)) cron.lines_referencing_hr++;
      }
    } finally { fs.closeSync(fd); }
  }
  if (!cron.files_scanned) problem("NOT_PRESENT");
  cron.references_backups = cron.lines_referencing_backups > 0;
  cron.references_hr = cron.lines_referencing_hr > 0;
} catch (error) {
  cronStatus = ["NOT_PRESENT", "TRUNCATED"].includes(error.status) ? error.status : "UNAVAILABLE";
  cron = Object.fromEntries(cronKeys.map(key => [key, cronStatus === "NOT_PRESENT" ? "NOT_PRESENT" : "UNAVAILABLE"]));
}
emit("cron_reference_status", cronStatus);
emit("cron_reference_entry_limit", CRON_ENTRY_LIMIT);
emit("cron_reference_file_limit_bytes", CRON_BYTE_LIMIT);
for (const key of cronKeys) emit(`cron_${key}`, cron[key]);
process.stdout.write(output.join("\n") + "\n");
CAPACITY_BACKUP_OBSERVER
}
if command -v timeout >/dev/null 2>&1 && command -v node >/dev/null 2>&1 && backup_observation="$(observe_backup_ownership)"; then
  printf 'backup_observer_status=AVAILABLE\n%s\n' "$backup_observation"
else
  printf 'backup_observer_status=UNAVAILABLE\nbackup_inventory_status=UNAVAILABLE\ncron_reference_status=UNAVAILABLE\n'
fi
