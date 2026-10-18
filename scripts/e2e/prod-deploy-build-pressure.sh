#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_BASE="$(mktemp -d)"
trap 'rm -rf "$TEST_BASE"' EXIT HUP INT TERM
TEST_ROOT="$TEST_BASE/deploy"
mkdir -p "$TEST_ROOT/scripts/hr-cutover" "$TEST_ROOT/infra/docker" "$TEST_ROOT/bin"
for script in prod-deploy.sh prod-healthcheck.sh prod-docker-cleanup.sh; do
  cp "$ROOT_DIR/scripts/$script" "$TEST_ROOT/scripts/$script"
done
touch "$TEST_ROOT/infra/docker/docker-compose.prod.yml"
printf 'RUN_PRODUCTION_SEED=no\n' > "$TEST_ROOT/production.env"
for script in db-migrate.sh diagnose-000189-asset-scope.sh repair-000194-retired-runtime-owner.sh diagnose-000194-runtime-control.sh; do
  printf '#!/usr/bin/env sh\nset -eu\nprintf "helper %s\\n" >> "$PRESSURE_LOG"\n' "$script" > "$TEST_ROOT/scripts/$script"
  chmod +x "$TEST_ROOT/scripts/$script"
done

cat > "$TEST_ROOT/bin/docker" <<'SH'
#!/usr/bin/env sh
set -eu
printf 'docker %s\n' "$*" >> "$PRESSURE_LOG"
if [ "$1" = compose ]; then
  shift
  test "$1" = --env-file; shift 2
  test "$1" = -f; shift 2
  case "$*" in
    build\ *)
      touch "$PRESSURE_STATE/built"
      printf '%s\n' "$PRESSURE_AFTER_BUILD" > "$PRESSURE_STATE/free"
      ;;
    'up -d api'|'up -d web'|'up -d api web') touch "$PRESSURE_STATE/activated" ;;
    'up -d postgres'|'stop api'|'exec -T postgres pg_isready '*|ps\ *) ;;
    *) exit 91 ;;
  esac
  exit 0
fi
case "$*" in
  'info --format {{.DockerRootDir}}') printf '/synthetic/docker\n' ;;
  'system df'|ps\ *) ;;
  'container prune -f'|'image prune -af')
    # The real cleanup helper may run only before build or after activation.
    if [ -f "$PRESSURE_STATE/built" ] && [ ! -f "$PRESSURE_STATE/activated" ]; then exit 92; fi
    test "$PRESSURE_CLEANUP_FAIL" != yes
    ;;
  'builder prune -af --keep-storage 5gb') ;;
  'builder prune -af --keep-storage 0gb')
    test "$PRESSURE_BUILDER_FAIL" != yes
    printf '%s\n' "$PRESSURE_AFTER_PRUNE" > "$PRESSURE_STATE/free"
    ;;
  *) exit 93 ;;
esac
SH
cat > "$TEST_ROOT/bin/df" <<'SH'
#!/usr/bin/env sh
set -eu
test "$*" = '-Pk /synthetic/docker'
printf 'df free=%s\n' "$(cat "$PRESSURE_STATE/free")" >> "$PRESSURE_LOG"
test "$PRESSURE_DF_FAIL" != yes
printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
printf '/synthetic 100000000 10000000 %s 10%% /synthetic/docker\n' "$(cat "$PRESSURE_STATE/free")"
SH
cat > "$TEST_ROOT/bin/curl" <<'SH'
#!/usr/bin/env sh
set -eu
for argument do url="$argument"; done
printf 'health %s\n' "$url" >> "$PRESSURE_LOG"
case "$url" in
  http://synthetic/health) test "$PRESSURE_HEALTH_FAIL" != health ;;
  http://synthetic/ready) test "$PRESSURE_HEALTH_FAIL" != ready ;;
  http://synthetic/login) test "$PRESSURE_HEALTH_FAIL" != login ;;
  *) exit 94 ;;
esac
SH
cat > "$TEST_ROOT/bin/node" <<'SH'
#!/usr/bin/env sh
set -eu
test "$*" = "$PRESSURE_ROOT/scripts/hr-cutover/ensure-profile-private-root.mjs --deploy $PRESSURE_ROOT"
printf 'profile preflight\n' >> "$PRESSURE_LOG"
SH
chmod +x "$TEST_ROOT/bin/"* "$TEST_ROOT/scripts/prod-docker-cleanup.sh"

first_line() { grep -n "$1" "$case_log" | head -1 | cut -d: -f1; }
count() { grep -c "$1" "$case_log" || true; }
run_case() {
  case_name="$1"; mode="$2"; initial="$3"; after_build="$4"; after_prune="$5"; expected="$6"
  case_state="$TEST_BASE/$case_name"; mkdir "$case_state"
  case_log="$case_state/events.log"; case_output="$case_state/output.log"
  : > "$case_log"; printf '%s\n' "$initial" > "$case_state/free"
  status=0
  PATH="$TEST_ROOT/bin:$PATH" PRESSURE_ROOT="$TEST_ROOT" PRESSURE_STATE="$case_state" PRESSURE_LOG="$case_log" \
    PRESSURE_AFTER_BUILD="$after_build" PRESSURE_AFTER_PRUNE="$after_prune" \
    PRESSURE_HEALTH_FAIL="${7:-none}" PRESSURE_CLEANUP_FAIL="${8:-no}" PRESSURE_DF_FAIL="${9:-no}" \
    PRESSURE_BUILDER_FAIL="${TEST_BUILDER_FAIL:-no}" \
    ENV_FILE="$TEST_ROOT/production.env" COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
    PROD_DEPLOY_MODE="$mode" PRUNE_DOCKER_BUILD_CACHE=yes PRUNE_DOCKER_AFTER_DEPLOY=yes \
    API_HEALTH_URL=http://synthetic/health API_READY_URL=http://synthetic/ready WEB_HEALTH_URL=http://synthetic/login \
    HEALTHCHECK_ATTEMPTS=1 HEALTHCHECK_INTERVAL_SECONDS=0 \
    sh "$TEST_ROOT/scripts/prod-deploy.sh" > "$case_output" 2>&1 || status=$?
  printf '\nCASE %s exit=%s\n' "$case_name" "$status"
  cat "$case_output" "$case_log"
  if [ "$expected" = pass ]; then test "$status" -eq 0; else test "$status" -ne 0; fi
  # No volume pruning or direct container/image removal is allowed in any case.
  if grep -Eq '^docker (volume|system prune|rm|rmi|container rm|image rm)' "$case_log"; then exit 95; fi
}

for mode in web api full; do
  run_case "prebuild_$mode" "$mode" 80000 2000000 24000000 pass
  test "$(count '^docker image prune -af$')" -eq 2
  test "$(count '^health http://synthetic/login$')" -eq 2
  health_line="$(first_line '^health http://synthetic/login$')"
  cleanup_line="$(first_line '^docker container prune -f$')"
  observed_line="$(first_line '^df free=24000000$')"
  build_line="$(first_line ' build ')"
  test "$health_line" -lt "$cleanup_line"
  test "$cleanup_line" -lt "$observed_line"
  test "$observed_line" -lt "$build_line"
  # Exactly one builder-only prune between build and service replacement.
  after_builder="$(grep -n '^docker builder prune' "$case_log" | sed -n '2s/:.*//p')"
  activated_line="$(first_line ' up -d \(api\|web\)')"
  test "$build_line" -lt "$after_builder"
  test "$after_builder" -lt "$activated_line"
  last_health="$(grep -n '^health http://synthetic/login$' "$case_log" | tail -1 | cut -d: -f1)"
  last_cleanup="$(grep -n '^docker image prune -af$' "$case_log" | tail -1 | cut -d: -f1)"
  test "$last_health" -lt "$last_cleanup"
done

run_case sufficient web 32000000 25000000 25000000 pass
test "$(count '^docker image prune -af$')" -eq 1
test "$(first_line ' build ')" -lt "$(first_line '^health ')"

run_case afterbuild_only web 32000000 2000000 24000000 pass
test "$(count '^docker image prune -af$')" -eq 1
test "$(first_line ' build ')" -lt "$(first_line '^docker builder prune ')"
test "$(first_line '^docker builder prune ')" -lt "$(first_line ' up -d web$')"

for failure in health ready login; do
  run_case "unhealthy_$failure" web 80000 2000000 24000000 fail "$failure"
  test "$(count ' prune ')" -eq 0
  test "$(count ' build ')" -eq 0
done

run_case cleanup_failure web 80000 2000000 24000000 fail none yes
test "$(count ' build ')" -eq 0
run_case insufficient_after_cleanup web 80000 2000000 500000 fail
grep -q 'PRODUCTION_DOCKER_FREE_SPACE_INSUFFICIENT' "$case_output"
test "$(count ' build ')" -eq 0
run_case malformed_observation web invalid 2000000 24000000 fail
grep -q 'PRODUCTION_DOCKER_FREE_SPACE_UNAVAILABLE' "$case_output"
test "$(count ' prune ')" -eq 0
test "$(count ' build ')" -eq 0
run_case malformed_after_cleanup web 80000 2000000 invalid fail
grep -q 'PRODUCTION_DOCKER_FREE_SPACE_UNAVAILABLE' "$case_output"
test "$(count ' build ')" -eq 0
run_case failed_observation web 80000 2000000 24000000 fail none no yes
test "$(count ' prune ')" -eq 0
test "$(count ' build ')" -eq 0
run_case insufficient_after_build web 32000000 2000000 500000 fail
grep -q 'PRODUCTION_DOCKER_FREE_SPACE_INSUFFICIENT' "$case_output"
test "$(count '^docker image prune ')" -eq 0
test "$(count ' up -d ')" -eq 0
TEST_BUILDER_FAIL=yes run_case builder_failure_after_build web 32000000 2000000 24000000 fail
test "$(count '^docker image prune ')" -eq 0
test "$(count ' up -d ')" -eq 0

printf '\nProduction deploy build pressure regression: PASS (15 cases)\n'
