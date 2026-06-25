#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate7-finance-lifecycle-$(date -u +%Y%m%dT%H%M%SZ)}"

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
AR_PAY_CODE="G7ARP$STAMP"
AR_INV_CODE="G7ARI$STAMP"
AR_WAIVE_CODE="G7ARW$STAMP"
PAY_CODE="G7PAY$STAMP"
INVOICE_CODE="G7INV$STAMP"
WAIVER_CODE="G7WAV$STAMP"

eval "$(STAMP="$STAMP" node <<'NODE'
const seed = Number(process.env.STAMP.slice(-4)) || 0;
const year = 2030 + (seed % 50);
const day = String((seed % 20) + 1).padStart(2, "0");
console.log(`PAY_PERIOD_START=${year}-01-${day}`);
console.log(`PAY_PERIOD_END=${year}-01-${day}`);
console.log(`INV_PERIOD_START=${year}-02-${day}`);
console.log(`INV_PERIOD_END=${year}-02-${day}`);
console.log(`WAV_PERIOD_START=${year}-03-${day}`);
console.log(`WAV_PERIOD_END=${year}-03-${day}`);
NODE
)"

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
  printf "GATE7_FAIL: %s\n" "$message" >&2
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

extract_data_field() {
  file="$1"
  field="$2"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const data = body && body.data ? body.data : body;
const value = data && data["$field"];
if (value === undefined || value === null || value === "") process.exit(2);
process.stdout.write(String(value));
NODE
}

dict_value() {
  dict_code="$1"
  preferred="$2"
  value="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT i.item_value
FROM sys_dict_item i
JOIN sys_dict_type t ON t.id = i.dict_type_id
JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id
WHERE t.tenant_id = scope.tenant_id
  AND t.park_id = scope.park_id
  AND t.dict_code = '$(sql_escape "$dict_code")'
  AND t.status = 'enabled'
  AND i.status = 'enabled'
  AND t.is_deleted = false
  AND i.is_deleted = false
ORDER BY CASE WHEN i.item_value = '$(sql_escape "$preferred")' THEN 0 ELSE 1 END, i.sort_order ASC, i.create_time ASC
LIMIT 1;
SQL
)"
  if [ -z "$value" ]; then
    fail_gate "required dictionary $dict_code has no enabled value"
  fi
  printf "%s" "$value"
}

require_dict_value() {
  dict_code="$1"
  required="$2"
  count="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT count(*)
FROM sys_dict_item i
JOIN sys_dict_type t ON t.id = i.dict_type_id
JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id
WHERE t.tenant_id = scope.tenant_id
  AND t.park_id = scope.park_id
  AND t.dict_code = '$(sql_escape "$dict_code")'
  AND i.item_value = '$(sql_escape "$required")'
  AND t.status = 'enabled'
  AND i.status = 'enabled'
  AND t.is_deleted = false
  AND i.is_deleted = false;
SQL
)"
  [ "$count" -ge 1 ] || fail_gate "required dictionary $dict_code value $required is not enabled"
}

cat > "$REPORT_MD" <<MD
# Finance Lifecycle Production Gate-7

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

admin_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT u.id::text, u.username, COALESCE(u.display_name, u.username)
FROM sys_user u
JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id
WHERE u.is_deleted = false
  AND u.status = 'enabled'
  AND COALESCE(u.is_enabled, true) = true
ORDER BY CASE WHEN u.username ILIKE '%admin%' THEN 0 ELSE 1 END, u.create_time ASC
LIMIT 1;
SQL
)"

if [ -z "$admin_row" ]; then
  fail_gate "no enabled production admin candidate found"
fi

IFS='|' read -r ADMIN_ID ADMIN_USERNAME ADMIN_NAME <<EOF
$admin_row
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
  username: process.env.ADMIN_USERNAME || "gate7",
  realName: process.env.ADMIN_NAME || "Gate-7",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE7_FINANCE"],
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

contract_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT c.id::text, c.contract_code, c.park_tenant_id::text, t.company_name
FROM biz_leasing_contract c
JOIN biz_park_tenant t ON t.id = c.park_tenant_id
JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id
WHERE c.status = '75'
  AND c.is_deleted = false
  AND c.contract_name ILIKE 'Gate-6B%'
ORDER BY c.create_time DESC
LIMIT 1;
SQL
)"

if [ -z "$contract_row" ]; then
  fail_gate "no effective Gate-6B contract found; run Gate-6B before Gate-7"
fi

IFS='|' read -r CONTRACT_ID CONTRACT_CODE PARK_TENANT_ID BUYER_NAME <<EOF
$contract_row
EOF

FEE_TYPE_VALUE="$(dict_value "leasing_fee_type" "10")"
PAY_METHOD_VALUE="$(dict_value "leasing_payment_method" "10")"
INVOICE_TYPE_VALUE="$(dict_value "leasing_invoice_type" "10")"
INVOICE_STATUS_VALUE="$(dict_value "leasing_invoice_status" "30")"
require_dict_value "leasing_invoice_status" "10"
require_dict_value "leasing_invoice_status" "30"
require_dict_value "leasing_receivable_status" "20"
require_dict_value "leasing_receivable_status" "50"
require_dict_value "leasing_receivable_status" "80"
require_dict_value "leasing_payment_status" "10"
require_dict_value "leasing_payment_status" "30"
require_dict_value "leasing_waiver_status" "20"
require_dict_value "leasing_waiver_status" "30"

append_report "- PASS: selected effective contract \`$CONTRACT_CODE\`"
append_report "- PASS: selected dictionaries fee_type=\`$FEE_TYPE_VALUE\`, pay_method=\`$PAY_METHOD_VALUE\`, invoice_type=\`$INVOICE_TYPE_VALUE\`, invoice_status=\`$INVOICE_STATUS_VALUE\`"

append_report ""
append_report "## Receivable Setup"

create_receivable() {
  ar_code="$1"
  period_start="$2"
  period_end="$3"
  amount_due="$4"
  label="$5"
  body="$(cat <<JSON
{
  "ar_code": "$ar_code",
  "contract_id": "$CONTRACT_ID",
  "park_tenant_id": "$PARK_TENANT_ID",
  "fee_type": "$FEE_TYPE_VALUE",
  "period_start": "$period_start",
  "period_end": "$period_end",
  "due_date": "$period_end",
  "amount_due": $amount_due,
  "source_type": "contract",
  "source_id": "$CONTRACT_ID",
  "generate_batch_no": "$RUN_ID",
  "remark": "$RUN_ID $label"
}
JSON
)"
  result="$(curl_request POST "/leasing/receivables" "$body")"
  assert_http_ok "create $label receivable" "$result"
  extract_data_field "${result#*|}" "id"
}

PAY_RECEIVABLE_ID="$(create_receivable "$AR_PAY_CODE" "$PAY_PERIOD_START" "$PAY_PERIOD_END" 1000 "payment")"
INV_RECEIVABLE_ID="$(create_receivable "$AR_INV_CODE" "$INV_PERIOD_START" "$INV_PERIOD_END" 600 "invoice")"
WAV_RECEIVABLE_ID="$(create_receivable "$AR_WAIVE_CODE" "$WAV_PERIOD_START" "$WAV_PERIOD_END" 300 "waiver")"

append_report ""
append_report "## Payment Lifecycle"

payment_body="$(cat <<JSON
{
  "pay_code": "$PAY_CODE",
  "park_tenant_id": "$PARK_TENANT_ID",
  "pay_time": "2026-06-25T00:00:00.000Z",
  "pay_method": "$PAY_METHOD_VALUE",
  "pay_amount": 1000,
  "payer_name": "$BUYER_NAME",
  "bank_serial": "$PAY_CODE",
  "remark": "$RUN_ID"
}
JSON
)"
payment_result="$(curl_request POST "/leasing/payments" "$payment_body")"
assert_http_ok "create payment" "$payment_result"
PAYMENT_ID="$(extract_data_field "${payment_result#*|}" "id")"

apply_body="$(cat <<JSON
{
  "applications": [
    {
      "receivable_id": "$PAY_RECEIVABLE_ID",
      "applied_amount": 1000
    }
  ]
}
JSON
)"
assert_http_ok "apply payment to receivable" "$(curl_request POST "/leasing/payments/$PAYMENT_ID/apply" "$apply_body")"
assert_http_ok "read payment applications" "$(curl_request GET "/leasing/payments/$PAYMENT_ID/applications")"

append_report ""
append_report "## Invoice Lifecycle"

invoice_body="$(cat <<JSON
{
  "invoice_code": "$INVOICE_CODE",
  "park_tenant_id": "$PARK_TENANT_ID",
  "invoice_type": "$INVOICE_TYPE_VALUE",
  "buyer_name": "$BUYER_NAME",
  "buyer_tax_no": "$INVOICE_CODE",
  "amount": 600,
  "tax_rate": 0.06,
  "invoice_no": "$INVOICE_CODE",
  "invoice_date": "2026-06-25",
  "status": "$INVOICE_STATUS_VALUE",
  "receivables": [
    {
      "receivable_id": "$INV_RECEIVABLE_ID",
      "invoice_amount": 600
    }
  ],
  "remark": "$RUN_ID"
}
JSON
)"
invoice_result="$(curl_request POST "/leasing/invoices" "$invoice_body")"
assert_http_ok "create invoice" "$invoice_result"
INVOICE_ID="$(extract_data_field "${invoice_result#*|}" "id")"
assert_http_ok "read invoice receivables" "$(curl_request GET "/leasing/invoices/$INVOICE_ID/receivables")"

append_report ""
append_report "## Waiver Lifecycle"

waiver_body="$(cat <<JSON
{
  "waiver_code": "$WAIVER_CODE",
  "receivable_id": "$WAV_RECEIVABLE_ID",
  "waiver_amount": 300,
  "reason": "Gate-7 财务闭环豁免验证",
  "remark": "$RUN_ID"
}
JSON
)"
waiver_result="$(curl_request POST "/leasing/waivers" "$waiver_body")"
assert_http_ok "create waiver" "$waiver_result"
WAIVER_ID="$(extract_data_field "${waiver_result#*|}" "id")"
assert_http_ok "approve waiver" "$(curl_request POST "/leasing/waivers/$WAIVER_ID/approve" "{\"opinion\":\"Gate-7 豁免审批通过\"}")"

append_report ""
append_report "## Read Models"
assert_http_ok "read payment receivable detail" "$(curl_request GET "/leasing/receivables/$PAY_RECEIVABLE_ID")"
assert_http_ok "read invoice receivable detail" "$(curl_request GET "/leasing/receivables/$INV_RECEIVABLE_ID")"
assert_http_ok "read waiver receivable detail" "$(curl_request GET "/leasing/receivables/$WAV_RECEIVABLE_ID")"
assert_http_ok "read receivable status logs" "$(curl_request GET "/leasing/receivables/$PAY_RECEIVABLE_ID/status-logs?page=1&page_size=20")"
assert_http_ok "read overdue receivables" "$(curl_request GET "/leasing/receivables/overdue?page=1&page_size=5")"
assert_http_ok "read aging analysis" "$(curl_request GET "/leasing/receivables/aging")"
assert_http_ok "list payments" "$(curl_request GET "/leasing/payments?page=1&page_size=5")"
assert_http_ok "list invoices" "$(curl_request GET "/leasing/invoices?page=1&page_size=5")"
assert_http_ok "list waivers" "$(curl_request GET "/leasing/waivers?page=1&page_size=5")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM biz_leasing_receivable r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.ar_code IN ('$(sql_escape "$AR_PAY_CODE")', '$(sql_escape "$AR_INV_CODE")', '$(sql_escape "$AR_WAIVE_CODE")') AND r.is_deleted = false) AS receivable_count,
  (SELECT status FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$PAY_RECEIVABLE_ID")') AS pay_receivable_status,
  (SELECT status FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$INV_RECEIVABLE_ID")') AS invoice_receivable_status,
  (SELECT invoice_status FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$INV_RECEIVABLE_ID")') AS invoice_receivable_invoice_status,
  (SELECT status FROM biz_leasing_receivable r WHERE r.id = '$(sql_escape "$WAV_RECEIVABLE_ID")') AS waiver_receivable_status,
  (SELECT count(*) FROM biz_leasing_payment p JOIN scope ON scope.tenant_id = p.tenant_id AND scope.park_id = p.park_id WHERE p.id = '$(sql_escape "$PAYMENT_ID")' AND p.status = '30' AND p.is_deleted = false) AS payment_applied_count,
  (SELECT count(*) FROM rel_leasing_payment_receivable pr JOIN scope ON scope.tenant_id = pr.tenant_id AND scope.park_id = pr.park_id WHERE pr.payment_id = '$(sql_escape "$PAYMENT_ID")' AND pr.receivable_id = '$(sql_escape "$PAY_RECEIVABLE_ID")' AND pr.is_deleted = false) AS payment_application_count,
  (SELECT count(*) FROM biz_leasing_invoice i JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id WHERE i.id = '$(sql_escape "$INVOICE_ID")' AND i.is_deleted = false) AS invoice_count,
  (SELECT count(*) FROM rel_leasing_invoice_receivable ir JOIN scope ON scope.tenant_id = ir.tenant_id AND scope.park_id = ir.park_id WHERE ir.invoice_id = '$(sql_escape "$INVOICE_ID")' AND ir.receivable_id = '$(sql_escape "$INV_RECEIVABLE_ID")' AND ir.is_deleted = false) AS invoice_relation_count,
  (SELECT count(*) FROM biz_leasing_waiver w JOIN scope ON scope.tenant_id = w.tenant_id AND scope.park_id = w.park_id WHERE w.id = '$(sql_escape "$WAIVER_ID")' AND w.status = '30' AND w.is_deleted = false) AS waiver_approved_count,
  (SELECT count(*) FROM biz_leasing_receivable_status_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.receivable_id IN ('$(sql_escape "$PAY_RECEIVABLE_ID")', '$(sql_escape "$INV_RECEIVABLE_ID")', '$(sql_escape "$WAV_RECEIVABLE_ID")') AND l.is_deleted = false) AS receivable_status_log_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.idempotency_key ILIKE '$(sql_escape "$RUN_ID")%' AND l.success = true AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r RECEIVABLE_COUNT PAY_RECEIVABLE_STATUS INVOICE_RECEIVABLE_STATUS INVOICE_RECEIVABLE_INVOICE_STATUS WAIVER_RECEIVABLE_STATUS PAYMENT_APPLIED_COUNT PAYMENT_APPLICATION_COUNT INVOICE_COUNT INVOICE_RELATION_COUNT WAIVER_APPROVED_COUNT RECEIVABLE_STATUS_LOG_COUNT AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Controlled receivables: $RECEIVABLE_COUNT"
append_report "- Payment receivable status: $PAY_RECEIVABLE_STATUS"
append_report "- Invoice receivable status: $INVOICE_RECEIVABLE_STATUS"
append_report "- Invoice receivable invoice status: $INVOICE_RECEIVABLE_INVOICE_STATUS"
append_report "- Waiver receivable status: $WAIVER_RECEIVABLE_STATUS"
append_report "- Applied payment rows: $PAYMENT_APPLIED_COUNT"
append_report "- Payment applications: $PAYMENT_APPLICATION_COUNT"
append_report "- Invoices: $INVOICE_COUNT"
append_report "- Invoice allocations: $INVOICE_RELATION_COUNT"
append_report "- Approved waivers: $WAIVER_APPROVED_COUNT"
append_report "- Receivable status logs: $RECEIVABLE_STATUS_LOG_COUNT"
append_report "- Operation audit logs: $AUDIT_LOG_COUNT"

[ "$RECEIVABLE_COUNT" -eq 3 ] || fail_gate "controlled receivables were not fully created"
[ "$PAY_RECEIVABLE_STATUS" = "50" ] || fail_gate "payment receivable was not paid"
[ "$INVOICE_RECEIVABLE_INVOICE_STATUS" = "30" ] || fail_gate "invoice receivable was not marked invoiced"
[ "$WAIVER_RECEIVABLE_STATUS" = "80" ] || fail_gate "waiver receivable was not waived"
[ "$PAYMENT_APPLIED_COUNT" -ge 1 ] || fail_gate "payment was not applied"
[ "$PAYMENT_APPLICATION_COUNT" -ge 1 ] || fail_gate "payment application relation missing"
[ "$INVOICE_COUNT" -ge 1 ] || fail_gate "invoice missing"
[ "$INVOICE_RELATION_COUNT" -ge 1 ] || fail_gate "invoice allocation missing"
[ "$WAIVER_APPROVED_COUNT" -ge 1 ] || fail_gate "waiver was not approved"
[ "$RECEIVABLE_STATUS_LOG_COUNT" -ge 5 ] || fail_gate "receivable status logs incomplete"
[ "$AUDIT_LOG_COUNT" -ge 4 ] || fail_gate "operation audit logs incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: controlled receivables, payment application, invoice allocation, waiver approval, read models, status logs, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "contract_id": $(json_escape "$CONTRACT_ID"),
  "contract_code": $(json_escape "$CONTRACT_CODE"),
  "park_tenant_id": $(json_escape "$PARK_TENANT_ID"),
  "payment_receivable_id": $(json_escape "$PAY_RECEIVABLE_ID"),
  "invoice_receivable_id": $(json_escape "$INV_RECEIVABLE_ID"),
  "waiver_receivable_id": $(json_escape "$WAV_RECEIVABLE_ID"),
  "payment_id": $(json_escape "$PAYMENT_ID"),
  "invoice_id": $(json_escape "$INVOICE_ID"),
  "waiver_id": $(json_escape "$WAIVER_ID"),
  "receivable_count": $RECEIVABLE_COUNT,
  "pay_receivable_status": $(json_escape "$PAY_RECEIVABLE_STATUS"),
  "invoice_receivable_invoice_status": $(json_escape "$INVOICE_RECEIVABLE_INVOICE_STATUS"),
  "waiver_receivable_status": $(json_escape "$WAIVER_RECEIVABLE_STATUS"),
  "payment_application_count": $PAYMENT_APPLICATION_COUNT,
  "invoice_relation_count": $INVOICE_RELATION_COUNT,
  "waiver_approved_count": $WAIVER_APPROVED_COUNT,
  "receivable_status_log_count": $RECEIVABLE_STATUS_LOG_COUNT,
  "audit_log_count": $AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE7_PASS: finance lifecycle verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
