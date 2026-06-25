#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate11-energy-billing-$(date -u +%Y%m%dT%H%M%SZ)}"

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
STAMP="$(date -u +%m%d%H%M%S)"
METER_CODE="G11M$STAMP"
CYCLE_CODE="G11C$STAMP"

date_row="$(node <<'NODE'
const nowSeconds = Math.floor(Date.now() / 1000);
const offset = 5000 + (nowSeconds % 5000);
const base = Date.UTC(2036, 0, 1);
const day = new Date(base + offset * 24 * 60 * 60 * 1000);
const date = day.toISOString().slice(0, 10);
const readingTime = new Date(day.getTime() + 12 * 60 * 60 * 1000).toISOString();
process.stdout.write(`${date}|${date}|${readingTime}`);
NODE
)"
IFS='|' read -r BILLING_START_DATE BILLING_END_DATE READING_TIME <<EOF
$date_row
EOF

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
  printf "GATE11_FAIL: %s\n" "$message" >&2
  printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
  exit 1
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

assert_http_ok() {
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

extract_json_path() {
  file="$1"
  path="$2"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
let value = body && body.data ? body.data : body;
for (const part of "$path".split(".")) {
  value = value && value[part];
}
if (value === undefined || value === null || value === "") process.exit(2);
process.stdout.write(String(value));
NODE
}

extract_direct_item_field() {
  file="$1"
  field="$2"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && body.data ? body.data : body;
const items = data.items || data.rows || [];
const item = items.find((row) => row.billingMethod === "DIRECT_METER") || items[0];
if (!item || item["$field"] === undefined || item["$field"] === null || item["$field"] === "") process.exit(2);
process.stdout.write(String(item["$field"]));
NODE
}

assert_number_close() {
  label="$1"
  actual="$2"
  expected="$3"
  node -e "process.exit(Math.abs(Number(process.argv[1]) - Number(process.argv[2])) <= 0.001 ? 0 : 1)" "$actual" "$expected" || fail_gate "$label expected $expected but got $actual"
}

cat > "$REPORT_MD" <<MD
# Energy Meter To Billing Production Gate-11

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Billing period: \`$BILLING_START_DATE\` to \`$BILLING_END_DATE\`

## Checks
MD

append_report "- Checking API health"
wait_for_api || fail_gate "production API health endpoint is not reachable"
append_report "- PASS: production API health reachable"

context_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
),
admin_user AS (
  SELECT u.id, u.username, COALESCE(u.display_name, u.username) AS display_name
  FROM sys_user u
  JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
  WHERE u.is_deleted = false
    AND u.status = 'enabled'
    AND COALESCE(u.is_enabled, true) = true
  ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
  LIMIT 1
),
effective_contract AS (
  SELECT c.id, c.contract_code, c.park_tenant_id, pt.company_name
  FROM biz_leasing_contract c
  JOIN biz_park_tenant pt ON pt.id = c.park_tenant_id
  JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id
  WHERE c.status = '75'
    AND c.is_deleted = false
    AND pt.is_deleted = false
  ORDER BY CASE WHEN c.contract_name ILIKE 'Gate-6B%' THEN 0 ELSE 1 END, c.create_time DESC
  LIMIT 1
),
contract_unit AS (
  SELECT rel.unit_id, rel.unit_code, rel.unit_name
  FROM rel_leasing_contract_unit rel
  JOIN effective_contract c ON c.id = rel.contract_id
  JOIN scope ON scope.tenant_id = rel.tenant_id AND scope.park_id = rel.park_id
  WHERE rel.status = 1
    AND rel.is_deleted = false
  ORDER BY rel.create_time ASC
  LIMIT 1
)
SELECT
  admin_user.id::text,
  admin_user.username,
  admin_user.display_name,
  effective_contract.id::text,
  effective_contract.contract_code,
  effective_contract.park_tenant_id::text,
  effective_contract.company_name,
  contract_unit.unit_id::text,
  contract_unit.unit_code,
  contract_unit.unit_name
FROM admin_user, effective_contract, contract_unit;
SQL
)"

if [ -z "$context_row" ]; then
  fail_gate "no enabled admin, effective contract, or active contract unit found; run Gate-6B first"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME CONTRACT_ID CONTRACT_CODE PARK_TENANT_ID COMPANY_NAME UNIT_ID UNIT_CODE UNIT_NAME <<EOF
$context_row
EOF

TOKEN="$(JWT_SECRET="${JWT_SECRET:-}" ADMIN_ID="$ADMIN_ID" ADMIN_USERNAME="$ADMIN_USERNAME" ADMIN_NAME="$ADMIN_NAME" TENANT_ID_VALUE="$TENANT_ID_VALUE" PARK_ID_VALUE="$PARK_ID_VALUE" node <<'NODE'
const crypto = require("node:crypto");
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("JWT_SECRET is required");
const base64url = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const now = Math.floor(Date.now() / 1000);
const header = { alg: "HS256", typ: "JWT" };
const payload = {
  sub: process.env.ADMIN_ID,
  username: process.env.ADMIN_USERNAME || "gate11",
  realName: process.env.ADMIN_NAME || "Gate-11",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE11_ENERGY_BILLING"],
  permissions: ["*"],
  dataScope: "all",
  isSuper: true,
  iat: now,
  exp: now + 30 * 60
};
const signingInput = `${base64url(header)}.${base64url(payload)}`;
const signature = crypto.createHmac("sha256", secret)
  .update(signingInput)
  .digest("base64")
  .replace(/=/g, "")
  .replace(/\+/g, "-")
  .replace(/\//g, "_");
process.stdout.write(`${signingInput}.${signature}`);
NODE
)"

append_report "- PASS: selected admin \`$ADMIN_USERNAME\`"
append_report "- PASS: selected effective contract \`$CONTRACT_CODE\`"
append_report "- PASS: selected tenant \`$COMPANY_NAME\` / \`$PARK_TENANT_ID\`"
append_report "- PASS: selected unit \`$UNIT_CODE\` / \`$UNIT_NAME\`"

append_report ""
append_report "## Energy Billing Lifecycle"

meter_body="$(cat <<JSON
{
  "meter_code": "$METER_CODE",
  "meter_name": "Gate-11 租户电表生产验证",
  "meter_type": "ELECTRIC",
  "meter_purpose": "TENANT",
  "related_park_tenant_id": "$PARK_TENANT_ID",
  "room_id": "$UNIT_ID",
  "multiplier": 1,
  "unit": "kWh",
  "initial_reading": 0,
  "status": "ONLINE",
  "is_enabled": true,
  "remark": "$RUN_ID"
}
JSON
)"
meter_result="$(curl_request POST "/energy/meters" "$meter_body")"
assert_http_ok "create tenant energy meter" "$meter_result"
meter_file="${meter_result#*|}"
METER_ID="$(extract_json_path "$meter_file" "id")"

reading_body="$(cat <<JSON
{
  "reading_value": 100,
  "reading_time": "$READING_TIME",
  "reading_source": "MANUAL",
  "raw_payload": {
    "run_id": "$RUN_ID",
    "controlled_gate": true
  }
}
JSON
)"
reading_result="$(curl_request POST "/energy/meters/$METER_ID/readings" "$reading_body")"
assert_http_ok "create energy reading" "$reading_result"
reading_file="${reading_result#*|}"
READING_ID="$(extract_json_path "$reading_file" "id")"
assert_http_ok "confirm energy reading" "$(curl_request POST "/energy/readings/$READING_ID/confirm")"
assert_http_ok "list energy meter readings" "$(curl_request GET "/energy/meters/$METER_ID/readings?page=1&page_size=10")"

cycle_body="$(cat <<JSON
{
  "cycle_code": "$CYCLE_CODE",
  "cycle_name": "Gate-11 能源账期生产验证",
  "meter_type": "ELECTRIC",
  "start_date": "$BILLING_START_DATE",
  "end_date": "$BILLING_END_DATE",
  "remark": "$RUN_ID"
}
JSON
)"
cycle_result="$(curl_request POST "/energy/billing-cycles" "$cycle_body")"
assert_http_ok "create energy billing cycle" "$cycle_result"
cycle_file="${cycle_result#*|}"
CYCLE_ID="$(extract_json_path "$cycle_file" "id")"

calculate_result="$(curl_request POST "/energy/billing-cycles/$CYCLE_ID/calculate" "{\"unit_prices\":{\"ELECTRIC\":1.2}}")"
assert_http_ok "calculate energy billing cycle" "$calculate_result"
calculate_file="${calculate_result#*|}"
GENERATED_COUNT="$(extract_json_path "$calculate_file" "generated_count")"
[ "$GENERATED_COUNT" -ge 1 ] || fail_gate "energy billing calculation generated no items"

items_result="$(curl_request GET "/energy/billing-cycles/$CYCLE_ID/items?page=1&page_size=50")"
assert_http_ok "list energy billing cycle items" "$items_result"
items_file="${items_result#*|}"
BILLING_ITEM_ID="$(extract_direct_item_field "$items_file" "id")"
BILLING_FINAL_AMOUNT="$(extract_direct_item_field "$items_file" "finalAmount")"
BILLING_CONSUMPTION="$(extract_direct_item_field "$items_file" "consumptionValue")"
assert_number_close "direct meter consumption" "$BILLING_CONSUMPTION" "100"
assert_number_close "direct meter final amount" "$BILLING_FINAL_AMOUNT" "120"

assert_http_ok "confirm energy billing item" "$(curl_request POST "/energy/billing-items/$BILLING_ITEM_ID/confirm")"
assert_http_ok "list energy billing items" "$(curl_request GET "/energy/billing-items?cycle_id=$CYCLE_ID&page=1&page_size=50")"
assert_http_ok "confirm energy billing cycle" "$(curl_request POST "/energy/billing-cycles/$CYCLE_ID/confirm")"
post_result="$(curl_request POST "/energy/billing-cycles/$CYCLE_ID/post")"
assert_http_ok "post energy billing cycle to receivable" "$post_result"

posted_items_result="$(curl_request GET "/energy/billing-cycles/$CYCLE_ID/items?page=1&page_size=50")"
assert_http_ok "list posted energy billing items" "$posted_items_result"
posted_items_file="${posted_items_result#*|}"
RECEIVABLE_ID="$(extract_direct_item_field "$posted_items_file" "receivableId")"

assert_http_ok "read generated energy receivable" "$(curl_request GET "/leasing/receivables/$RECEIVABLE_ID")"
assert_http_ok "list generated energy receivables" "$(curl_request GET "/leasing/receivables?page=1&page_size=5&source_type=ENERGY_BILLING")"
assert_http_ok "read energy dashboard overview" "$(curl_request GET "/energy/dashboard/overview")"
assert_http_ok "read energy dashboard trends" "$(curl_request GET "/energy/dashboard/trends?start_date=$BILLING_START_DATE&end_date=$BILLING_END_DATE&meter_type=ELECTRIC")"
assert_http_ok "read energy dashboard by tenant" "$(curl_request GET "/energy/dashboard/by-tenant?start_date=$BILLING_START_DATE&end_date=$BILLING_END_DATE")"
assert_http_ok "read energy dashboard abnormal" "$(curl_request GET "/energy/dashboard/abnormal")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM energy_meter m JOIN scope ON scope.tenant_id = m.tenant_id AND scope.park_id = m.park_id WHERE m.id = '$(sql_escape "$METER_ID")' AND m.meter_code = '$(sql_escape "$METER_CODE")' AND m.is_deleted = false) AS meter_count,
  (SELECT current_reading FROM energy_meter m WHERE m.id = '$(sql_escape "$METER_ID")' AND m.is_deleted = false) AS meter_current_reading,
  (SELECT status FROM energy_meter m WHERE m.id = '$(sql_escape "$METER_ID")' AND m.is_deleted = false) AS meter_status,
  (SELECT count(*) FROM energy_reading r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.id = '$(sql_escape "$READING_ID")' AND r.meter_id = '$(sql_escape "$METER_ID")'::uuid AND r.confirmation_status = 'CONFIRMED') AS confirmed_reading_count,
  (SELECT consumption_value FROM energy_reading r WHERE r.id = '$(sql_escape "$READING_ID")') AS reading_consumption,
  (SELECT status FROM energy_billing_cycle c WHERE c.id = '$(sql_escape "$CYCLE_ID")' AND c.is_deleted = false) AS cycle_status,
  (SELECT count(*) FROM energy_billing_item i JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id WHERE i.id = '$(sql_escape "$BILLING_ITEM_ID")' AND i.cycle_id = '$(sql_escape "$CYCLE_ID")'::uuid AND i.billing_method = 'DIRECT_METER' AND i.is_deleted = false) AS item_count,
  (SELECT confirmation_status FROM energy_billing_item i WHERE i.id = '$(sql_escape "$BILLING_ITEM_ID")' AND i.is_deleted = false) AS item_status,
  (SELECT final_amount FROM energy_billing_item i WHERE i.id = '$(sql_escape "$BILLING_ITEM_ID")' AND i.is_deleted = false) AS item_final_amount,
  (SELECT COALESCE(receivable_id::text, '') FROM energy_billing_item i WHERE i.id = '$(sql_escape "$BILLING_ITEM_ID")' AND i.is_deleted = false) AS item_receivable_id,
  (SELECT count(*) FROM biz_leasing_receivable r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.id = '$(sql_escape "$RECEIVABLE_ID")' AND r.source_type = 'ENERGY_BILLING' AND r.source_id = '$(sql_escape "$BILLING_ITEM_ID")'::uuid AND r.is_deleted = false) AS receivable_count,
  (SELECT amount_due FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$RECEIVABLE_ID")' AND r.is_deleted = false) AS receivable_amount_due,
  (SELECT status FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$RECEIVABLE_ID")' AND r.is_deleted = false) AS receivable_status,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r DB_METER_COUNT DB_METER_CURRENT_READING DB_METER_STATUS DB_CONFIRMED_READING_COUNT DB_READING_CONSUMPTION DB_CYCLE_STATUS DB_ITEM_COUNT DB_ITEM_STATUS DB_ITEM_FINAL_AMOUNT DB_ITEM_RECEIVABLE_ID DB_RECEIVABLE_COUNT DB_RECEIVABLE_AMOUNT_DUE DB_RECEIVABLE_STATUS DB_AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Meter ID: $METER_ID"
append_report "- Meter code: $METER_CODE"
append_report "- Meter current reading: $DB_METER_CURRENT_READING"
append_report "- Meter status: $DB_METER_STATUS"
append_report "- Reading ID: $READING_ID"
append_report "- Reading consumption: $DB_READING_CONSUMPTION"
append_report "- Billing cycle ID: $CYCLE_ID"
append_report "- Billing cycle code: $CYCLE_CODE"
append_report "- Billing cycle status: $DB_CYCLE_STATUS"
append_report "- Billing item ID: $BILLING_ITEM_ID"
append_report "- Billing item status: $DB_ITEM_STATUS"
append_report "- Billing item final amount: $DB_ITEM_FINAL_AMOUNT"
append_report "- Receivable ID: $RECEIVABLE_ID"
append_report "- Receivable amount due: $DB_RECEIVABLE_AMOUNT_DUE"
append_report "- Receivable status: $DB_RECEIVABLE_STATUS"
append_report "- Operation audit logs: $DB_AUDIT_LOG_COUNT"

[ "$DB_METER_COUNT" -ge 1 ] || fail_gate "energy meter row missing"
assert_number_close "meter current reading" "$DB_METER_CURRENT_READING" "100"
[ "$DB_METER_STATUS" = "ONLINE" ] || fail_gate "energy meter was not online"
[ "$DB_CONFIRMED_READING_COUNT" -ge 1 ] || fail_gate "confirmed energy reading row missing"
assert_number_close "reading consumption" "$DB_READING_CONSUMPTION" "100"
[ "$DB_CYCLE_STATUS" = "POSTED" ] || fail_gate "energy billing cycle was not posted"
[ "$DB_ITEM_COUNT" -ge 1 ] || fail_gate "direct meter billing item row missing"
[ "$DB_ITEM_STATUS" = "CONFIRMED" ] || fail_gate "energy billing item was not confirmed"
assert_number_close "billing item final amount" "$DB_ITEM_FINAL_AMOUNT" "120"
[ "$DB_ITEM_RECEIVABLE_ID" = "$RECEIVABLE_ID" ] || fail_gate "billing item is not linked to generated receivable"
[ "$DB_RECEIVABLE_COUNT" -ge 1 ] || fail_gate "energy receivable row missing"
assert_number_close "receivable amount due" "$DB_RECEIVABLE_AMOUNT_DUE" "120"
[ "$DB_RECEIVABLE_STATUS" = "20" ] || fail_gate "energy receivable was not generated status"
[ "$DB_AUDIT_LOG_COUNT" -ge 8 ] || fail_gate "operation audit logs are incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: tenant energy meter, confirmed reading, billing cycle calculation, billing item confirmation, cycle posting, generated leasing receivable, energy dashboards, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "contract_id": $(json_escape "$CONTRACT_ID"),
  "contract_code": $(json_escape "$CONTRACT_CODE"),
  "park_tenant_id": $(json_escape "$PARK_TENANT_ID"),
  "unit_id": $(json_escape "$UNIT_ID"),
  "meter_id": $(json_escape "$METER_ID"),
  "meter_code": $(json_escape "$METER_CODE"),
  "reading_id": $(json_escape "$READING_ID"),
  "reading_consumption": $DB_READING_CONSUMPTION,
  "cycle_id": $(json_escape "$CYCLE_ID"),
  "cycle_code": $(json_escape "$CYCLE_CODE"),
  "cycle_status": $(json_escape "$DB_CYCLE_STATUS"),
  "billing_item_id": $(json_escape "$BILLING_ITEM_ID"),
  "billing_item_final_amount": $DB_ITEM_FINAL_AMOUNT,
  "receivable_id": $(json_escape "$RECEIVABLE_ID"),
  "receivable_amount_due": $DB_RECEIVABLE_AMOUNT_DUE,
  "audit_log_count": $DB_AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE11_PASS: energy meter to billing verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
