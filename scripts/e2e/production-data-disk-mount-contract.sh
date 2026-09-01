#!/usr/bin/env sh
set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
script="$root/scripts/mount-production-data-disk.sh"
workflow="$root/.github/workflows/deploy-production.yml"

grep -Fq 'mount-empty-disk' "$script"
grep -Fq 'PRODUCTION_DATA_DISK_CANDIDATE_UNRESOLVED' "$script"
grep -Fq 'PRODUCTION_DATA_DISK_SIGNATURE_PRESENT' "$script"
grep -Fq 'wipefs -n' "$script"
grep -Fq 'mkfs.ext4 -F -m 0' "$script"
grep -Fq 'mountpoint -q' "$script"
grep -Fq 'persistent_mount=true' "$script"
grep -Fq 'YUZHOU_PRODUCTION_DATA_VOLUME_ACTION=mount-empty-disk' "$workflow"
grep -Fq 'Prepare Yuzhou HR production data volume' "$workflow"
grep -Fq "inputs.deploy_mode == 'prepare-yuzhou-hr-production-data-volume'" "$workflow"
mount_exclusions="$(grep -Fc "inputs.deploy_mode != 'prepare-yuzhou-hr-production-data-volume'" "$workflow")"
test "$mount_exclusions" -eq 9

if grep -Eq '(^|[^[:alnum:]_])(rm|dd|wipefs -a|docker|pg_dump|pg_restore|psql|rsync|prod:deploy)([^[:alnum:]_]|$)' "$script"; then
  echo 'data-disk mount script contains an out-of-scope destructive operation' >&2
  exit 1
fi

echo 'Production data-disk mount contract passed.'
