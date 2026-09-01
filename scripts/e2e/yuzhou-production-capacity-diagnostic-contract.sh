#!/usr/bin/env sh
set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
script="$root/scripts/diagnose-yuzhou-hr-production-capacity.sh"
workflow="$root/.github/workflows/deploy-production.yml"

grep -Fq 'host_base_min_kib=$((20 * 1024 * 1024))' "$script"
grep -Fq 'container_min_kib=$((15 * 1024 * 1024))' "$script"
grep -Fq 'recovery_working_set_multiplier=2' "$script"
grep -Fq 'host_recovery_required_kib=$((host_base_min_kib + recovery_working_set_multiplier * (postgres_data_used_kib + api_file_used_kib)))' "$script"
grep -Fq 'docker info --format' "$script"
grep -Fq 'instance_persistent_filesystem_count' "$script"
grep -Fq 'instance_block_disk_total_bytes' "$script"
grep -Fq 'instance_unmounted_block_disk_total_bytes' "$script"
grep -Fq 'instance_unmounted_with_filesystem_count' "$script"
grep -Fq 'instance_unmounted_without_filesystem_count' "$script"
grep -Fq 'lsblk -J -b -o NAME,TYPE,SIZE,FSTYPE,MOUNTPOINTS' "$script"
grep -Fq 'process.stdin.on("end"' "$script"
grep -Fq 'status="READY_FOR_GATE19"' "$script"
grep -Fq 'status="DISK_GUARD"' "$script"
grep -Fq 'YUZHOU_HR_CAPACITY_PROBE_FAILED' "$script"
grep -Fq 'diagnose-yuzhou-hr-capacity' "$workflow"
grep -Fq 'Diagnose Yuzhou HR production capacity (read-only)' "$workflow"
grep -Fq 'scripts/diagnose-yuzhou-hr-production-capacity.sh' "$workflow"
capacity_exclusions="$(grep -Fc "inputs.deploy_mode != 'diagnose-yuzhou-hr-capacity'" "$workflow")"
test "$capacity_exclusions" -eq 9

if grep -Eq '(^|[^[:alnum:]_])(rm|prune|pg_dump|pg_restore|psql|rsync|prod:deploy)([^[:alnum:]_]|$)' "$script"; then
  echo 'capacity diagnostic script must not mutate production or transfer files' >&2
  exit 1
fi
if grep -Fq '. "$env_file"' "$script"; then
  echo 'capacity diagnostic must not load production environment values into its shell' >&2
  exit 1
fi

echo 'Yuzhou production capacity diagnostic contract passed.'
