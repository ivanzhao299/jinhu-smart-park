#!/usr/bin/env sh
set -eu
umask 077

repo_root="$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)"
fixture="$(mktemp -d)"
trap 'rm -rf "$fixture"' EXIT HUP INT TERM
fixture="$(cd "$fixture" && pwd -P)"
release="$fixture/release"
bin="$fixture/bin"
mkdir -p "$bin" "$release/infra/docker" "$release/apps/web/.next" "$fixture/docker/overlay2" "$fixture/private-target"
touch "$release/.env.production" "$release/infra/docker/docker-compose.prod.yml"
ln -s "$fixture/private-target" "$release/node_modules"
# Isolate command discovery so unavailable-tool cases cannot fall back to host utilities.
for utility in sh awk node; do ln -s "$(command -v "$utility")" "$bin/$utility"; done

cat > "$bin/df" <<'SH'
#!/bin/sh
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf '/synthetic-root 100000000 99900000 100000 99%% /synthetic\n'
SH
cat > "$bin/lsblk" <<'SH'
#!/bin/sh
printf '%s\n' '{"blockdevices":[{"name":"synthetic","type":"disk","size":102400000000,"fstype":"ext4","mountpoints":["/"]}]}'
SH
cat > "$bin/docker" <<'SH'
#!/bin/sh
case "$*" in
 'info --format {{.DockerRootDir}}') printf '%s\n' "$CAPACITY_DOCKER" ;;
 *'file_root='*) printf '101\n' ;;
 *'data_dir='*) printf '50000000|202\n' ;;
 *'exec -T '*'/tmp'*) printf '50000000\n' ;;
 *) exit 83 ;;
esac
SH
cat > "$fixture/timeout-command" <<'SH'
#!/bin/sh
test "$1" = -k && test "$2" = 1s && test "$3" = 8s || exit 84
shift 3
if [ "$CAPACITY_CASE" = timeout ] && [ "$1" = du ]; then
  printf 'PRIVATE_TIMEOUT_PATH\n' >&2
  exit 124
fi
exec "$@"
SH
cat > "$fixture/du-command" <<'SH'
#!/bin/sh
test "$1" = -P && test "$2" = -x && test "$3" = -s && test "$4" = -k && test "$5" = -- || exit 85
printf '%s\n' "$6" >> "$CAPACITY_CALLS"
case "$CAPACITY_CASE" in
 failure) printf 'PRIVATE_STDERR_PATH\n' >&2; printf '99\tPRIVATE_PARTIAL_PATH\n'; exit 1 ;;
 numeric_only) printf '456\n' ;;
 malformed) printf 'not-a-number\tPRIVATE_BAD_PATH\n' ;;
 multiline) printf '99\tPRIVATE_FIRST_PATH\n88\tPRIVATE_SECOND_PATH\n' ;;
 zero) printf '0\tPRIVATE_ZERO_PATH\n' ;;
 *) printf '456\tPRIVATE_SUCCESS_PATH\n' ;;
esac
SH
chmod +x "$bin/df" "$bin/lsblk" "$bin/docker" "$fixture/timeout-command" "$fixture/du-command"

run_case() {
 case_name="$1"
 expected="$2"
 output="$fixture/$case_name.output"
 errors="$fixture/$case_name.errors"
 calls="$fixture/$case_name.calls"
 : > "$calls"
 ln -sf "$fixture/timeout-command" "$bin/timeout"
 ln -sf "$fixture/du-command" "$bin/du"
 if [ "$case_name" = no_timeout ]; then rm "$bin/timeout"; fi
 if [ "$case_name" = no_du ]; then rm "$bin/du"; fi
 PATH="$bin" CAPACITY_CASE="$case_name" CAPACITY_DOCKER="$fixture/docker" CAPACITY_CALLS="$calls" \
   /bin/sh "$repo_root/scripts/diagnose-yuzhou-hr-production-capacity.sh" report "$release" > "$output" 2> "$errors"
 grep -Fxq 'status=DISK_GUARD' "$output"
 grep -Fxq 'host_free_kib=100000' "$output"
 grep -Fxq 'host_recovery_required_kib=20972126' "$output"
 grep -Fxq "directory_release_used_kib=$expected" "$output"
 grep -Fxq "directory_docker_used_kib=$expected" "$output"
 grep -Fxq 'directory_release_logs_used_kib=NOT_PRESENT' "$output"
 grep -Fxq 'directory_docker_buildkit_used_kib=NOT_PRESENT' "$output"
 grep -Fxq 'directory_release_node_modules_used_kib=UNAVAILABLE' "$output"
 grep -Fxq 'directory_sizes_overlap=true' "$output"
 grep -Fxq 'directory_sizes_same_filesystem_only=true' "$output"
 test ! -s "$errors"
 if grep -Eq 'PRIVATE|synthetic-root|/synthetic|/release|/docker|private-target' "$output" "$errors"; then
   printf 'Observer leaked an unlabelled path or command output.\n' >&2; exit 86
 fi
 if grep -Fq "$release/node_modules" "$calls"; then
   printf 'Observer followed a symlink target.\n' >&2; exit 87
 fi
 # Every supplemental output is a fixed label plus a numeric or explicit unavailable receipt.
 if grep '^directory_.*_used_kib=' "$output" | grep -Ev '^[a-z0-9_]+=(NOT_PRESENT|UNAVAILABLE|[0-9]+)$'; then exit 88; fi
 printf 'CASE %s: PASS\n' "$case_name"
 cat "$output"
}

run_case success 456
run_case zero 0
run_case failure UNAVAILABLE
run_case malformed UNAVAILABLE
run_case numeric_only UNAVAILABLE
run_case multiline UNAVAILABLE
run_case timeout UNAVAILABLE
run_case no_timeout UNAVAILABLE
run_case no_du UNAVAILABLE
printf 'Yuzhou capacity directory observer: PASS (9 cases)\n'
