#!/bin/sh
set -eu

repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../../.." && pwd)
run_id="b05s0-$(date +%s)-$$"
container_name="pr192_${run_id}_db"
database_name="pr192_b05_s0"
database_user="pr192_b05_s0"
database_password="${run_id}_local_only"
evidence_path="${B05_S0_EVIDENCE_PATH:-/tmp/pr192-b05-s0-http-db-${run_id}.json}"
cleanup_evidence_path="${B05_S0_CLEANUP_EVIDENCE_PATH:-/tmp/pr192-b05-s0-cleanup-${run_id}.json}"
container_id=""
volume_name=""
cleaned="false"

cleanup() {
  if [ "$cleaned" = "true" ]; then
    return
  fi
  cleaned="true"
  container_absent="false"
  volume_absent="false"
  if [ -n "$container_id" ]; then
    actual_id=$(docker inspect --type container --format '{{.Id}}' "$container_name" 2>/dev/null || true)
    if [ "$actual_id" = "$container_id" ]; then
      docker rm --force "$container_id" >/dev/null
    fi
    if ! docker inspect --type container "$container_name" >/dev/null 2>&1; then
      container_absent="true"
    fi
  fi
  if [ -z "$volume_name" ] || ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
    volume_absent="true"
  else
    docker volume rm "$volume_name" >/dev/null
    if ! docker volume inspect "$volume_name" >/dev/null 2>&1; then
      volume_absent="true"
    fi
  fi
  printf '%s\n' \
    "{\"runId\":\"$run_id\",\"containerName\":\"$container_name\",\"containerAbsent\":$container_absent,\"volumeName\":\"$volume_name\",\"volumeAbsent\":$volume_absent}" \
    > "$cleanup_evidence_path"
}
trap cleanup EXIT HUP INT TERM

container_id=$(docker run \
  --detach \
  --rm \
  --name "$container_name" \
  --label "com.jinhu.fixture=pr192-b05-s0-http-db" \
  --label "com.jinhu.fixture.run-id=$run_id" \
  --env "POSTGRES_USER=$database_user" \
  --env "POSTGRES_PASSWORD=$database_password" \
  --env "POSTGRES_DB=$database_name" \
  --volume /var/lib/postgresql/data \
  postgres:16-alpine)

actual_image=$(docker inspect --type container --format '{{.Config.Image}}' "$container_id")
actual_fixture=$(docker inspect --type container --format '{{index .Config.Labels "com.jinhu.fixture"}}' "$container_id")
actual_run_id=$(docker inspect --type container --format '{{index .Config.Labels "com.jinhu.fixture.run-id"}}' "$container_id")
volume_name=$(docker inspect --type container --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$container_id")

if [ "$actual_image" != "postgres:16-alpine" ] \
  || [ "$actual_fixture" != "pr192-b05-s0-http-db" ] \
  || [ "$actual_run_id" != "$run_id" ] \
  || [ -z "$volume_name" ]; then
  echo "[FAIL] disposable PostgreSQL identity validation failed" >&2
  exit 1
fi

set +e
docker run \
  --rm \
  --network "container:$container_id" \
  --volume "$repo_dir:/workspace:ro" \
  --volume "$(dirname -- "$evidence_path"):/evidence" \
  --workdir /workspace \
  --env "B05_S0_RUN_ID=$run_id" \
  --env "B05_S0_CONTAINER_NAME=$container_name" \
  --env "B05_S0_DATABASE_NAME=$database_name" \
  --env "B05_S0_DATABASE_USER=$database_user" \
  --env "B05_S0_DATABASE_PASSWORD=$database_password" \
  --env "B05_S0_DATABASE_HOST=127.0.0.1" \
  --env "B05_S0_DATABASE_PORT=5432" \
  --env "B05_S0_DISPOSABLE_DATABASE=true" \
  --env "NODE_PATH=/workspace/apps/api/node_modules:/workspace/node_modules" \
  --env "B05_S0_EVIDENCE_PATH=/evidence/$(basename -- "$evidence_path")" \
  --env "B05_S0_CLEANUP_EVIDENCE_PATH=$cleanup_evidence_path" \
  node:22-bookworm-slim \
  node scripts/e2e/property-remediation/track-b-high-risk-stopship.mjs
gate_status=$?
set -e

cleanup
trap - EXIT HUP INT TERM

if [ "$gate_status" -ne 0 ]; then
  exit "$gate_status"
fi
echo "[PASS] cleanup evidence: $cleanup_evidence_path"
