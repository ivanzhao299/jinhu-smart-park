#!/usr/bin/env sh
set -eu

root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
script="$root/scripts/diagnose-yuzhou-hr-production-capacity.sh"
workflow="$root/.github/workflows/production-yuzhou-hr-capacity-diagnostic.yml"

grep -Fq 'host_min_kib=$((100 * 1024 * 1024))' "$script"
grep -Fq 'container_min_kib=$((15 * 1024 * 1024))' "$script"
grep -Fq 'docker info --format' "$script"
grep -Fq 'docker system df --format' "$script"
grep -Fq 'status="READY_FOR_GATE19"' "$script"
grep -Fq 'status="DISK_GUARD"' "$script"
grep -Fq 'YUZHOU_HR_CAPACITY_PROBE_FAILED' "$script"
grep -Fq 'sh -s -- report' "$workflow"
grep -Fq 'environment: production' "$workflow"

if grep -Eq '(^|[^[:alnum:]_])(rm|prune|pg_dump|pg_restore|psql|rsync|prod:deploy)([^[:alnum:]_]|$)' "$script" "$workflow"; then
  echo 'capacity diagnostic must not mutate production or transfer files' >&2
  exit 1
fi
if grep -Fq '. "$env_file"' "$script"; then
  echo 'capacity diagnostic must not load production environment values into its shell' >&2
  exit 1
fi

echo 'Yuzhou production capacity diagnostic contract passed.'
