#!/usr/bin/env sh
set -eu

mode="${1:-}"
root_dir="${2:-}"
mount_point="/srv/jinhu-production-data"

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

case "$mode" in
  mount-empty-disk) ;;
  *) fail "PRODUCTION_DATA_DISK_INVALID_ACTION" ;;
esac
test -n "$root_dir" && test -d "$root_dir" || fail "PRODUCTION_DATA_DISK_ROOT_INVALID"
for command in lsblk node wipefs mkfs.ext4 mountpoint findmnt blkid sudo; do
  command -v "$command" >/dev/null 2>&1 || fail "PRODUCTION_DATA_DISK_TOOL_MISSING"
done
sudo -n true >/dev/null 2>&1 || fail "PRODUCTION_DATA_DISK_PRIVILEGE_REQUIRED"

inventory="$(lsblk -J -b -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS 2>/dev/null)" \
  || fail "PRODUCTION_DATA_DISK_INVENTORY_UNAVAILABLE"
candidate="$(printf '%s' "$inventory" | node -e '
  let input = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { input += chunk; });
  process.stdin.on("end", () => {
    const hasMount = (node) => Array.isArray(node.mountpoints)
      ? node.mountpoints.some(Boolean)
      : Boolean(node.mountpoint || node.mountpoints);
    const candidates = (JSON.parse(input).blockdevices || []).filter((node) =>
      node.type === "disk" &&
      Number.isSafeInteger(Number(node.size)) && Number(node.size) > 0 &&
      !hasMount(node) &&
      !(typeof node.fstype === "string" && node.fstype.trim()) &&
      (!node.children || node.children.length === 0)
    );
    if (candidates.length !== 1 || !/^[A-Za-z0-9._-]+$/.test(candidates[0].name || "")) process.exit(1);
    process.stdout.write(`/dev/${candidates[0].name}|${candidates[0].size}`);
  });
')" || fail "PRODUCTION_DATA_DISK_CANDIDATE_UNRESOLVED"
IFS='|' read -r device disk_bytes <<EOF
$candidate
EOF
case "$device" in
  /dev/[A-Za-z0-9._-]*) ;;
  *) fail "PRODUCTION_DATA_DISK_CANDIDATE_UNSAFE" ;;
esac
case "$disk_bytes" in
  ''|*[!0-9]*) fail "PRODUCTION_DATA_DISK_SIZE_INVALID" ;;
esac

mountpoint -q "$mount_point" && fail "PRODUCTION_DATA_DISK_MOUNTPOINT_IN_USE"
findmnt -rn -S "$device" >/dev/null 2>&1 && fail "PRODUCTION_DATA_DISK_ALREADY_MOUNTED"
if sudo -n grep -Eq "[[:space:]]$mount_point[[:space:]]" /etc/fstab; then
  fail "PRODUCTION_DATA_DISK_FSTAB_ALREADY_MANAGED"
fi
if sudo -n wipefs -n "$device" 2>/dev/null | grep -q .; then
  fail "PRODUCTION_DATA_DISK_SIGNATURE_PRESENT"
fi

sudo -n mkfs.ext4 -F -m 0 -L jinhu_production_data "$device" >/dev/null
uuid="$(sudo -n blkid -s UUID -o value "$device" 2>/dev/null)" || fail "PRODUCTION_DATA_DISK_UUID_UNAVAILABLE"
case "$uuid" in
  [0-9A-Fa-f-]* ) ;;
  *) fail "PRODUCTION_DATA_DISK_UUID_INVALID" ;;
esac
sudo -n install -d -m 0750 "$mount_point"
sudo -n mount "$device" "$mount_point"
mountpoint -q "$mount_point" || fail "PRODUCTION_DATA_DISK_MOUNT_FAILED"
printf 'UUID=%s %s ext4 defaults,nofail 0 2\n' "$uuid" "$mount_point" | sudo -n tee -a /etc/fstab >/dev/null

printf '%s\n' 'PRODUCTION_DATA_DISK_MOUNTED'
printf 'filesystem=ext4\n'
printf 'disk_bytes=%s\n' "$disk_bytes"
printf 'persistent_mount=true\n'
