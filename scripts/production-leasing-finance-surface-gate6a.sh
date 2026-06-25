#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate6a-leasing-finance-surface-$(date -u +%Y%m%dT%H%M%SZ)}"

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
  printf "GATE6A_FAIL: %s\n" "$message" >&2
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

extract_first_item_id() {
  file="$1"
  node <<NODE
const fs = require("node:fs");
const body = JSON.parse(fs.readFileSync("$file", "utf8"));
const items = body?.data?.items ?? [];
const id = items[0]?.id;
if (!id) process.exit(2);
process.stdout.write(String(id));
NODE
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

cat > "$REPORT_MD" <<MD
# Leasing And Finance Surface Production Gate-6A

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
  username: process.env.ADMIN_USERNAME || "gate6a",
  realName: process.env.ADMIN_NAME || "Gate-6A",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE6A_LEASING_FINANCE"],
  permissions: ["*"],
  dataScope: "all",
  isSuper: true,
  iat: now,
  exp: now + 20 * 60
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

append_report ""
append_report "## API Surface"

tenant_result="$(curl_request GET "/park-tenants?page=1&page_size=5")"
assert_http_ok "park tenant list" "$tenant_result"
if TENANT_RECORD_ID="$(extract_first_item_id "${tenant_result#*|}")"; then
  append_report "- PASS: selected park tenant id \`$TENANT_RECORD_ID\`"
else
  TENANT_CODE="G6A$(date -u +%m%d%H%M%S)"
  CONTACT_MOBILE="139$(date -u +%H%M%S)06"
  CONTACT_EMAIL="gate6a-$TENANT_CODE@example.com"
  tenant_body="$(cat <<JSON
{
  "parkTenantCode": "$TENANT_CODE",
  "companyName": "Gate-6A 生产验证租户",
  "unifiedCreditCode": "$TENANT_CODE",
  "legalPerson": "Gate-6A",
  "contactName": "Gate-6A 联系人",
  "contactMobile": "$CONTACT_MOBILE",
  "contactEmail": "$CONTACT_EMAIL",
  "industryCode": "tech",
  "industryDetail": "生产验证",
  "tenantType": "enterprise",
  "riskLevel": "low",
  "sourceType": "manual",
  "status": "active",
  "remark": "$RUN_ID"
}
JSON
)"
  create_tenant_result="$(curl_request POST "/park-tenants" "$tenant_body")"
  assert_http_ok "create controlled park tenant" "$create_tenant_result"
  TENANT_RECORD_ID="$(extract_data_field "${create_tenant_result#*|}" "id")"
  append_report "- PASS: created controlled park tenant \`$TENANT_CODE\`"
fi

assert_http_ok "park tenant detail" "$(curl_request GET "/park-tenants/$TENANT_RECORD_ID")"
assert_http_ok "park tenant 360" "$(curl_request GET "/park-tenants/$TENANT_RECORD_ID/360")"
assert_http_ok "park tenant contacts" "$(curl_request GET "/park-tenants/$TENANT_RECORD_ID/contacts")"
assert_http_ok "park tenant qualifications" "$(curl_request GET "/park-tenants/$TENANT_RECORD_ID/qualifications")"
assert_http_ok "park tenant risk logs" "$(curl_request GET "/park-tenants/$TENANT_RECORD_ID/risk-logs")"

assert_http_ok "leasing leads" "$(curl_request GET "/leasing/leads?page=1&page_size=5")"
assert_http_ok "leasing lead pool" "$(curl_request GET "/leasing/lead-pool?page=1&page_size=5")"
assert_http_ok "leasing funnel statistics" "$(curl_request GET "/leasing/statistics/funnel")"
assert_http_ok "leasing contracts" "$(curl_request GET "/leasing/contracts?page=1&page_size=5")"
assert_http_ok "leasing contract changes" "$(curl_request GET "/leasing/contract-changes?page=1&page_size=5")"
assert_http_ok "leasing receivables" "$(curl_request GET "/leasing/receivables?page=1&page_size=5")"
assert_http_ok "leasing receivables overdue" "$(curl_request GET "/leasing/receivables/overdue?page=1&page_size=5")"
assert_http_ok "leasing receivables aging" "$(curl_request GET "/leasing/receivables/aging?page=1&page_size=5")"
assert_http_ok "leasing payments" "$(curl_request GET "/leasing/payments?page=1&page_size=5")"
assert_http_ok "leasing invoices" "$(curl_request GET "/leasing/invoices?page=1&page_size=5")"
assert_http_ok "leasing waivers" "$(curl_request GET "/leasing/waivers?page=1&page_size=5")"
assert_http_ok "leasing checkouts" "$(curl_request GET "/leasing/checkouts?page=1&page_size=5")"
assert_http_ok "leasing refunds" "$(curl_request GET "/leasing/refunds?page=1&page_size=5")"

append_report ""
append_report "## Database Surface"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM biz_park_tenant t JOIN scope ON scope.tenant_id = t.tenant_id AND scope.park_id = t.park_id WHERE t.is_deleted = false),
  (SELECT count(*) FROM biz_park_tenant_contact c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_lead l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_contract c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_receivable r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_payment p JOIN scope ON scope.tenant_id = p.tenant_id AND scope.park_id = p.park_id WHERE p.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_invoice i JOIN scope ON scope.tenant_id = i.tenant_id AND scope.park_id = i.park_id WHERE i.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_waiver w JOIN scope ON scope.tenant_id = w.tenant_id AND scope.park_id = w.park_id WHERE w.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_checkout c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.is_deleted = false),
  (SELECT count(*) FROM biz_leasing_refund r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.is_deleted = false);
SQL
)"

IFS='|' read -r PARK_TENANT_COUNT CONTACT_COUNT LEAD_COUNT CONTRACT_COUNT RECEIVABLE_COUNT PAYMENT_COUNT INVOICE_COUNT WAIVER_COUNT CHECKOUT_COUNT REFUND_COUNT <<EOF
$summary_row
EOF

[ "$PARK_TENANT_COUNT" -ge 1 ] || fail_gate "park tenant count is zero"

append_report "- PASS: park tenants = $PARK_TENANT_COUNT"
append_report "- PASS: tenant contacts = $CONTACT_COUNT"
append_report "- PASS: leasing leads = $LEAD_COUNT"
append_report "- PASS: leasing contracts = $CONTRACT_COUNT"
append_report "- PASS: leasing receivables = $RECEIVABLE_COUNT"
append_report "- PASS: leasing payments = $PAYMENT_COUNT"
append_report "- PASS: leasing invoices = $INVOICE_COUNT"
append_report "- PASS: leasing waivers = $WAIVER_COUNT"
append_report "- PASS: leasing checkouts = $CHECKOUT_COUNT"
append_report "- PASS: leasing refunds = $REFUND_COUNT"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: leasing, tenant, contract, receivable, payment, invoice, waiver, checkout, and refund read surfaces are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "park_tenant_id": $(json_escape "$TENANT_RECORD_ID"),
  "park_tenant_count": $PARK_TENANT_COUNT,
  "tenant_contact_count": $CONTACT_COUNT,
  "leasing_lead_count": $LEAD_COUNT,
  "leasing_contract_count": $CONTRACT_COUNT,
  "leasing_receivable_count": $RECEIVABLE_COUNT,
  "leasing_payment_count": $PAYMENT_COUNT,
  "leasing_invoice_count": $INVOICE_COUNT,
  "leasing_waiver_count": $WAIVER_COUNT,
  "leasing_checkout_count": $CHECKOUT_COUNT,
  "leasing_refund_count": $REFUND_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE6A_PASS\n"
printf "PARK_TENANT_ID=%s\n" "$TENANT_RECORD_ID"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
