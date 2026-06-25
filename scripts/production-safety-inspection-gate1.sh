#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate1-safety-inspection-$(date -u +%Y%m%dT%H%M%SZ)}"
WAIT_SECONDS="${WAIT_SECONDS:-150}"
POLL_SECONDS="${POLL_SECONDS:-5}"

if [ ! -f "$ENV_FILE" ]; then
  printf "Missing production env file: %s\n" "$ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

mkdir -p "$REPORT_DIR"
REPORT_MD="$REPORT_DIR/$RUN_ID.md"
REPORT_JSON="$REPORT_DIR/$RUN_ID.json"
API_HOST="${API_PUBLISHED_HOST:-127.0.0.1}"
case "$API_HOST" in
  "0.0.0.0") API_HOST="127.0.0.1" ;;
esac
API_PORT="${API_PUBLISHED_PORT:-${APP_PORT:-3001}}"
API_PREFIX_VALUE="${API_PREFIX:-api/v1}"
API_PREFIX_VALUE="${API_PREFIX_VALUE#/}"
API_BASE="http://$API_HOST:$API_PORT/$API_PREFIX_VALUE"
TENANT_ID_VALUE="${DEFAULT_TENANT_ID:-${TENANT_ID:-10000001}}"
PARK_ID_VALUE="${DEFAULT_PARK_ID:-${PARK_ID:-20000001}}"
POSTGRES_USER_VALUE="${POSTGRES_USER:-jinhu}"
POSTGRES_DB_VALUE="${POSTGRES_DB:-jinhu_smart_park}"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

psql_query() {
  compose exec -T postgres psql -X -qAt -F '|' -v ON_ERROR_STOP=1 -U "$POSTGRES_USER_VALUE" -d "$POSTGRES_DB_VALUE" "$@"
}

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

json_escape() {
  node -e "process.stdout.write(JSON.stringify(process.argv[1]))" "$1"
}

append_report() {
  printf "%s\n" "$*" >> "$REPORT_MD"
}

fail_gate() {
  message="$1"
  append_report ""
  append_report "## Final Verdict"
  append_report ""
  append_report "FAIL: $message"
  cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "FAIL",
  "message": $(json_escape "$message"),
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON
  printf "GATE1_FAIL: %s\n" "$message" >&2
  printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
  exit 1
}

curl_request() {
  method="$1"
  path="$2"
  body="${3:-}"
  out_file="$REPORT_DIR/$RUN_ID-$(printf "%s-%s" "$method" "$path" | tr '/:' '--' | tr -cd '[:alnum:]_.-').json"
  if [ -n "$body" ]; then
    status="$(curl -sS -o "$out_file" -w "%{http_code}" \
      -X "$method" "$API_BASE$path" \
      -H "content-type: application/json" \
      -H "authorization: Bearer $TOKEN" \
      -H "x-idempotency-key: $RUN_ID-$(date +%s%N)" \
      --data "$body")"
  else
    status="$(curl -sS -o "$out_file" -w "%{http_code}" \
      -X "$method" "$API_BASE$path" \
      -H "authorization: Bearer $TOKEN" \
      -H "x-idempotency-key: $RUN_ID-$(date +%s%N)")"
  fi
  printf "%s|%s\n" "$status" "$out_file"
}

assert_http_created_or_ok() {
  label="$1"
  result="$2"
  status="${result%%|*}"
  file="${result#*|}"
  case "$status" in
    200|201)
      append_report "- PASS: $label HTTP $status"
      ;;
    *)
      append_report "- FAIL: $label HTTP $status, response: \`$file\`"
      fail_gate "$label returned HTTP $status"
      ;;
  esac
}

wait_for_api() {
  deadline=$(( $(date +%s) + 90 ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if curl -fsS "$API_BASE/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

cat > "$REPORT_MD" <<MD
# Safety Inspection Production Gate-1

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`

## Checks
MD

append_report "- Checking API health"
wait_for_api || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

setup_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
handler AS (
  SELECT u.id, u.username, u.display_name
  FROM sys_user u
  JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
  WHERE u.is_deleted = false
    AND u.status = 'enabled'
    AND u.is_enabled = true
  ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
  LIMIT 1
),
point AS (
  INSERT INTO biz_safety_inspect_point (
    tenant_id, park_id, code, point_code, point_name, point_type, risk_level,
    location, required_photo_count, required_scan, required_gps, status, sort_no,
    create_by, update_by, remark
  )
  SELECT
    scope.tenant_id,
    scope.park_id,
    'GATE1-POINT-$RUN_ID',
    'GATE1-POINT-$RUN_ID',
    'Gate-1 巡检试运行点位',
    'fire',
    '10',
    'Gate-1 controlled production validation',
    0,
    false,
    false,
    'enabled',
    9999,
    handler.id,
    handler.id,
    'Gate-1 production safety inspection validation'
  FROM scope, handler
  RETURNING id, point_code
),
template AS (
  INSERT INTO biz_safety_inspect_template (
    tenant_id, park_id, code, template_code, template_name, template_type,
    status, create_by, update_by, remark
  )
  SELECT
    scope.tenant_id,
    scope.park_id,
    'GATE1-TPL-$RUN_ID',
    'GATE1-TPL-$RUN_ID',
    'Gate-1 巡检试运行模板',
    'fire',
    'enabled',
    handler.id,
    handler.id,
    'Gate-1 production safety inspection validation'
  FROM scope, handler
  RETURNING id, template_code
),
item AS (
  INSERT INTO biz_safety_inspect_item (
    tenant_id, park_id, template_id, item_code, item_name, item_type,
    hazard_type, default_risk_level, required, sort_no, standard_desc,
    status, create_by, update_by, remark
  )
  SELECT
    scope.tenant_id,
    scope.park_id,
    template.id,
    'GATE1-ITEM-$RUN_ID',
    'Gate-1 异常闭环检查项',
    'normal_abnormal',
    'fire',
    '10',
    true,
    10,
    'Gate-1 requires abnormal result to create hazard.',
    'enabled',
    handler.id,
    handler.id,
    'Gate-1 production safety inspection validation'
  FROM scope, handler, template
  RETURNING id, item_code
),
plan AS (
  INSERT INTO biz_safety_inspect_plan (
    tenant_id, park_id, code, plan_code, plan_name, template_id, point_ids,
    frequency_type, cron_expr, start_date, end_date, handler_user_ids,
    handler_role_codes, next_generate_time, last_generate_time, status,
    create_by, update_by, remark
  )
  SELECT
    scope.tenant_id,
    scope.park_id,
    'GATE1-PLAN-$RUN_ID',
    'GATE1-PLAN-$RUN_ID',
    'Gate-1 巡检生产试运行计划',
    template.id,
    jsonb_build_array(point.id::text),
    'daily',
    NULL,
    CURRENT_DATE,
    CURRENT_DATE + 1,
    jsonb_build_array(handler.id::text),
    '[]'::jsonb,
    now() - INTERVAL '10 seconds',
    NULL,
    'enabled',
    handler.id,
    handler.id,
    'Gate-1 production safety inspection validation'
  FROM scope, handler, template, point
  RETURNING id, plan_code
)
SELECT handler.id::text,
       handler.username,
       handler.display_name,
       point.id::text,
       template.id::text,
       item.id::text,
       plan.id::text,
       plan.plan_code
FROM handler, point, template, item, plan;
SQL
)"

if [ -z "$setup_row" ]; then
  fail_gate "failed to create Gate-1 inspection seed data"
fi

IFS='|' read -r HANDLER_ID HANDLER_USERNAME HANDLER_NAME POINT_ID TEMPLATE_ID ITEM_ID PLAN_ID PLAN_CODE <<EOF
$setup_row
EOF

append_report "- PASS: created controlled Gate-1 plan \`$PLAN_CODE\`"
append_report "- Handler: \`$HANDLER_USERNAME\` / \`$HANDLER_NAME\`"

TOKEN="$(cd "$ROOT_DIR/apps/api" && JWT_SECRET="${JWT_SECRET:-}" HANDLER_ID="$HANDLER_ID" HANDLER_USERNAME="$HANDLER_USERNAME" HANDLER_NAME="$HANDLER_NAME" TENANT_ID_VALUE="$TENANT_ID_VALUE" PARK_ID_VALUE="$PARK_ID_VALUE" node <<'NODE'
const jwt = require("jsonwebtoken");
const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error("JWT_SECRET is required");
}
const payload = {
  sub: process.env.HANDLER_ID,
  username: process.env.HANDLER_USERNAME || "gate1",
  realName: process.env.HANDLER_NAME || "Gate-1",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE1"],
  permissions: ["*"],
  dataScope: "all",
  isSuper: true
};
process.stdout.write(jwt.sign(payload, secret, { expiresIn: "20m" }));
NODE
)"

append_report "- Waiting for scheduler-generated task from Runtime"
task_row=""
elapsed=0
while [ "$elapsed" -le "$WAIT_SECONDS" ]; do
  task_row="$(psql_query <<SQL
SELECT id::text, task_code, status
FROM biz_safety_inspect_task
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND plan_id = '$PLAN_ID'::uuid
  AND point_id = '$POINT_ID'::uuid
  AND is_deleted = false
ORDER BY create_time DESC
LIMIT 1;
SQL
)"
  if [ -n "$task_row" ]; then
    break
  fi
  sleep "$POLL_SECONDS"
  elapsed=$((elapsed + POLL_SECONDS))
done

if [ -z "$task_row" ]; then
  fail_gate "Runtime did not generate inspection task within ${WAIT_SECONDS}s"
fi

IFS='|' read -r TASK_ID TASK_CODE TASK_STATUS <<EOF
$task_row
EOF
append_report "- PASS: Runtime generated task \`$TASK_CODE\` with status \`$TASK_STATUS\`"

start_result="$(curl_request POST "/safety/inspect-tasks/$TASK_ID/start")"
assert_http_created_or_ok "start generated inspection task" "$start_result"

checkin_result="$(curl_request POST "/safety/inspect-tasks/$TASK_ID/check-in" '{"photo_file_ids":[]}' )"
assert_http_created_or_ok "check in generated inspection task" "$checkin_result"

submit_body="$(cat <<JSON
{
  "results": [
    {
      "item_id": "$ITEM_ID",
      "result": "abnormal",
      "value_text": "Gate-1 production validation abnormal item creates hazard.",
      "photo_file_ids": [],
      "create_hazard": true
    }
  ],
  "finish_task": true
}
JSON
)"
submit_result="$(curl_request POST "/safety/inspect-tasks/$TASK_ID/submit-results" "$submit_body")"
assert_http_created_or_ok "submit abnormal result and finish task" "$submit_result"

hazard_row="$(psql_query <<SQL
SELECT id::text, hazard_code, status
FROM biz_safety_hazard
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND source_type = 'inspection'
  AND source_id = '$TASK_ID'::uuid
  AND inspect_task_id = '$TASK_ID'::uuid
  AND is_deleted = false
ORDER BY create_time DESC
LIMIT 1;
SQL
)"
if [ -z "$hazard_row" ]; then
  fail_gate "abnormal inspection result did not create hazard"
fi
IFS='|' read -r HAZARD_ID HAZARD_CODE HAZARD_STATUS <<EOF
$hazard_row
EOF
append_report "- PASS: abnormal result created hazard \`$HAZARD_CODE\` with status \`$HAZARD_STATUS\`"

stats_result="$(curl_request GET "/safety/statistics")"
assert_http_created_or_ok "read safety dashboard statistics" "$stats_result"
stats_file="${stats_result#*|}"
if ! stats_check="$(node <<NODE
const fs = require("fs");
const body = JSON.parse(fs.readFileSync("$stats_file", "utf8"));
const summary = body && body.data && body.data.summary;
if (!summary) process.exit(2);
if (Number(summary.inspect_task_total || 0) <= 0) process.exit(3);
if (Number(summary.hazard_total || 0) <= 0) process.exit(4);
process.stdout.write(JSON.stringify({
  inspect_task_total: summary.inspect_task_total,
  inspect_task_done: summary.inspect_task_done,
  inspect_task_overdue: summary.inspect_task_overdue,
  hazard_total: summary.hazard_total
}));
NODE
)"; then
  fail_gate "safety dashboard statistics did not include Gate-1 visible inspection/hazard data"
fi
append_report "- PASS: dashboard statistics visible: \`$stats_check\`"

runtime_logs="$(psql_query <<SQL
SELECT COUNT(*)
FROM biz_safety_action_log
WHERE tenant_id = '$(sql_escape "$TENANT_ID_VALUE")'
  AND park_id = '$(sql_escape "$PARK_ID_VALUE")'
  AND biz_type = 'safety_inspect_runtime'
  AND create_time >= now() - INTERVAL '30 minutes'
  AND is_deleted = false;
SQL
)"
append_report "- Runtime action logs in last 30 minutes: \`$runtime_logs\`"

append_report ""
append_report "## Evidence"
append_report ""
append_report "- Plan ID: \`$PLAN_ID\`"
append_report "- Task ID: \`$TASK_ID\`"
append_report "- Hazard ID: \`$HAZARD_ID\`"
append_report "- Report JSON: \`$REPORT_JSON\`"
append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS"

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "api_base": $(json_escape "$API_BASE"),
  "tenant_id": $(json_escape "$TENANT_ID_VALUE"),
  "park_id": $(json_escape "$PARK_ID_VALUE"),
  "handler_id": $(json_escape "$HANDLER_ID"),
  "plan_id": $(json_escape "$PLAN_ID"),
  "plan_code": $(json_escape "$PLAN_CODE"),
  "task_id": $(json_escape "$TASK_ID"),
  "task_code": $(json_escape "$TASK_CODE"),
  "hazard_id": $(json_escape "$HAZARD_ID"),
  "hazard_code": $(json_escape "$HAZARD_CODE"),
  "dashboard_summary": $stats_check,
  "runtime_action_log_count_30m": $runtime_logs,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE1_PASS\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
