#!/usr/bin/env sh
set -eu

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
TEST_ROOT="$(mktemp -d)"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$TEST_ROOT/scripts" "$TEST_ROOT/infra/docker" "$TEST_ROOT/bin"
cp "$ROOT_DIR/scripts/prod-deploy.sh" "$TEST_ROOT/scripts/prod-deploy.sh"
touch "$TEST_ROOT/infra/docker/docker-compose.prod.yml"

for helper in db-migrate.sh db-seed-prod.sh prod-healthcheck.sh prod-docker-cleanup.sh; do
  helper_name="${helper%.sh}"
  sed "s/HELPER_NAME/$helper_name/g" > "$TEST_ROOT/scripts/$helper" <<'SH'
#!/usr/bin/env sh
set -eu
printf '%s\n' 'HELPER_NAME' >> "$PROD_DEPLOY_TEST_LOG"
if [ "HELPER_NAME" = "db-migrate" ] && [ "${PROD_DEPLOY_TEST_MIGRATE_FAIL:-no}" = "yes" ]; then
  exit 23
fi
SH
  chmod +x "$TEST_ROOT/scripts/$helper"
done

sed 's/HELPER_NAME/docker/g' > "$TEST_ROOT/bin/docker" <<'SH'
#!/usr/bin/env sh
set -eu
printf 'HELPER_NAME %s\n' "$*" >> "$PROD_DEPLOY_TEST_LOG"
exit 0
SH
chmod +x "$TEST_ROOT/bin/docker"

run_case() {
  case_name="$1"
  env_seed="$2"
  requested_seed="$3"
  expected_seed_count="$4"
  env_file="$TEST_ROOT/$case_name.env"
  log_file="$TEST_ROOT/$case_name.log"

  printf 'RUN_PRODUCTION_SEED=%s\n' "$env_seed" > "$env_file"
  : > "$log_file"

  if [ "$requested_seed" = "unset" ]; then
    env -u RUN_PRODUCTION_SEED \
      PATH="$TEST_ROOT/bin:$PATH" \
      PROD_DEPLOY_TEST_LOG="$log_file" \
      ENV_FILE="$env_file" \
      COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
      PROD_DEPLOY_MODE=full \
      PRUNE_DOCKER_AFTER_DEPLOY=no \
      sh "$TEST_ROOT/scripts/prod-deploy.sh" >/dev/null
  else
    PATH="$TEST_ROOT/bin:$PATH" \
      PROD_DEPLOY_TEST_LOG="$log_file" \
      ENV_FILE="$env_file" \
      COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
      PROD_DEPLOY_MODE=full \
      RUN_PRODUCTION_SEED="$requested_seed" \
      PRUNE_DOCKER_AFTER_DEPLOY=no \
      sh "$TEST_ROOT/scripts/prod-deploy.sh" >/dev/null
  fi

  migrate_count="$(grep -c '^db-migrate$' "$log_file" || true)"
  seed_count="$(grep -c '^db-seed-prod$' "$log_file" || true)"
  test "$migrate_count" -eq 1
  test "$seed_count" -eq "$expected_seed_count"

  stop_line="$(grep -n ' stop api$' "$log_file" | head -1 | cut -d: -f1)"
  migrate_line="$(grep -n '^db-migrate$' "$log_file" | head -1 | cut -d: -f1)"
  start_line="$(grep -n ' up -d api web$' "$log_file" | head -1 | cut -d: -f1)"
  test -n "$stop_line"
  test -n "$migrate_line"
  test -n "$start_line"
  test "$stop_line" -lt "$migrate_line"
  test "$migrate_line" -lt "$start_line"
}

run_case workflow_yes_env_no no yes 1
run_case workflow_no_env_yes yes no 0
run_case no_workflow_override yes unset 1

migration_failure_log="$TEST_ROOT/migration-failure.log"
: > "$migration_failure_log"
if PATH="$TEST_ROOT/bin:$PATH" \
  PROD_DEPLOY_TEST_LOG="$migration_failure_log" \
  PROD_DEPLOY_TEST_MIGRATE_FAIL=yes \
  ENV_FILE="$TEST_ROOT/workflow_yes_env_no.env" \
  COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
  PROD_DEPLOY_MODE=full \
  RUN_PRODUCTION_SEED=no \
  PRUNE_DOCKER_AFTER_DEPLOY=no \
  sh "$TEST_ROOT/scripts/prod-deploy.sh" >/dev/null 2>&1; then
  printf 'Expected migration failure to stop the deployment.\n' >&2
  exit 1
fi
grep -q ' stop api$' "$migration_failure_log"
grep -q '^db-migrate$' "$migration_failure_log"
if grep -q ' up -d api web$' "$migration_failure_log"; then
  printf 'API/Web must not start after a migration failure.\n' >&2
  exit 1
fi

for invalid_value in invalid ""; do
  invalid_log="$TEST_ROOT/invalid-${invalid_value:-empty}.log"
  invalid_out="$TEST_ROOT/invalid-${invalid_value:-empty}.out"
  : > "$invalid_log"
  if PATH="$TEST_ROOT/bin:$PATH" \
    PROD_DEPLOY_TEST_LOG="$invalid_log" \
    ENV_FILE="$TEST_ROOT/workflow_yes_env_no.env" \
    COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
    PROD_DEPLOY_MODE=full \
    RUN_PRODUCTION_SEED="$invalid_value" \
    sh "$TEST_ROOT/scripts/prod-deploy.sh" >"$invalid_out" 2>&1; then
    printf 'Expected invalid RUN_PRODUCTION_SEED to fail closed.\n' >&2
    exit 1
  fi
  grep -Fq 'RUN_PRODUCTION_SEED must be yes or no' "$invalid_out"
  test ! -s "$invalid_log"
done

empty_env_file="$TEST_ROOT/empty.env"
empty_env_log="$TEST_ROOT/empty-env.log"
printf 'RUN_PRODUCTION_SEED=\n' > "$empty_env_file"
: > "$empty_env_log"
if env -u RUN_PRODUCTION_SEED \
  PATH="$TEST_ROOT/bin:$PATH" \
  PROD_DEPLOY_TEST_LOG="$empty_env_log" \
  ENV_FILE="$empty_env_file" \
  COMPOSE_FILE="$TEST_ROOT/infra/docker/docker-compose.prod.yml" \
  PROD_DEPLOY_MODE=full \
  sh "$TEST_ROOT/scripts/prod-deploy.sh" >"$TEST_ROOT/empty-env.out" 2>&1; then
  printf 'Expected empty environment-file RUN_PRODUCTION_SEED to fail closed.\n' >&2
  exit 1
fi
grep -Fq 'RUN_PRODUCTION_SEED must be yes or no' "$TEST_ROOT/empty-env.out"
test ! -s "$empty_env_log"

printf 'Production deploy seed precedence regression: PASS\n'
