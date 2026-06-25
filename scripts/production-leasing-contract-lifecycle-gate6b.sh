#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker/docker-compose.prod.yml}"
REPORT_DIR="${REPORT_DIR:-$ROOT_DIR/tmp/production-gates}"
RUN_ID="${RUN_ID:-gate6b-leasing-contract-lifecycle-$(date -u +%Y%m%dT%H%M%SZ)}"

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
BUILDING_CODE="G6BB$STAMP"
FLOOR_CODE="G6BF$STAMP"
UNIT_CODE="G6BU$STAMP"
LEAD_CODE="G6BL$STAMP"
CONTACT_MOBILE="138$(date -u +%H%M%S)06"
CONTACT_EMAIL="gate6b-$LEAD_CODE@example.com"
COMPANY_NAME="Gate-6B 生产验证租户 $STAMP"
START_DATE="${START_DATE:-2026-07-01}"
END_DATE="${END_DATE:-2027-06-30}"
SIGN_DATE="${SIGN_DATE:-2026-06-25}"
EFFECTIVE_DATE="${EFFECTIVE_DATE:-2026-07-01}"

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
  printf "GATE6B_FAIL: %s\n" "$message" >&2
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

curl_upload_pdf() {
  label="$1"
  file_path="$2"
  out_file="$REPORT_DIR/$RUN_ID-upload-$(printf "%s" "$label" | tr ' /:' '---' | tr -cd '[:alnum:]_.-').json"
  status="$(curl -sS -o "$out_file" -w "%{http_code}" \
    -X POST "$API_BASE/files" \
    -H "authorization: Bearer $TOKEN" \
    -H "x-idempotency-key: $RUN_ID-upload-$label-$(date +%s%N)" \
    -F "biz_type=leasing_contract" \
    -F "biz_id=$CONTRACT_ID" \
    -F "remark=$RUN_ID $label" \
    -F "file=@$file_path;type=application/pdf")"
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

create_minimal_pdf() {
  file_path="$1"
  title="$2"
  cat > "$file_path" <<PDF
%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 64 >>
stream
BT /F1 12 Tf 24 96 Td ($title) Tj 0 -18 Td ($RUN_ID) Tj ET
endstream
endobj
trailer
<< /Root 1 0 R >>
%%EOF
PDF
}

cat > "$REPORT_MD" <<MD
# Leasing To Contract Lifecycle Production Gate-6B

- Run ID: \`$RUN_ID\`
- Started UTC: \`$(date -u +%Y-%m-%dT%H:%M:%SZ)\`
- API Base: \`$API_BASE\`
- Tenant: \`$TENANT_ID_VALUE\`
- Park: \`$PARK_ID_VALUE\`
- Controlled building: \`$BUILDING_CODE\`
- Controlled floor: \`$FLOOR_CODE\`
- Controlled unit: \`$UNIT_CODE\`
- Controlled lead: \`$LEAD_CODE\`

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
  username: process.env.ADMIN_USERNAME || "gate6b",
  realName: process.env.ADMIN_NAME || "Gate-6B",
  tenantId: process.env.TENANT_ID_VALUE,
  parkId: process.env.PARK_ID_VALUE,
  roles: ["GATE6B_LEASING_CONTRACT"],
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

append_report ""
append_report "## Controlled Asset Setup"

building_body="$(cat <<JSON
{
  "buildingCode": "$BUILDING_CODE",
  "buildingName": "Gate-6B 租赁闭环验证楼栋",
  "floorCount": 1,
  "buildArea": 1666,
  "status": 1,
  "sortNo": 906,
  "remark": "$RUN_ID"
}
JSON
)"
building_result="$(curl_request POST "/buildings" "$building_body")"
assert_http_ok "create controlled building" "$building_result"
BUILDING_ID="$(extract_data_field "${building_result#*|}" "id")"

floor_body="$(cat <<JSON
{
  "buildingId": "$BUILDING_ID",
  "floorCode": "$FLOOR_CODE",
  "floorNo": 1,
  "floorName": "Gate-6B 租赁闭环验证楼层",
  "floorArea": 1666,
  "status": 1,
  "sortNo": 906,
  "remark": "$RUN_ID"
}
JSON
)"
floor_result="$(curl_request POST "/floors" "$floor_body")"
assert_http_ok "create controlled floor" "$floor_result"
FLOOR_ID="$(extract_data_field "${floor_result#*|}" "id")"

unit_body="$(cat <<JSON
{
  "unitCode": "$UNIT_CODE",
  "buildingId": "$BUILDING_ID",
  "floorId": "$FLOOR_ID",
  "unitName": "Gate-6B 租赁闭环验证房源",
  "usageType": 10,
  "unitArea": 120,
  "useArea": 100,
  "rentalStatus": 10,
  "fittingStatus": 20,
  "refPrice": 40,
  "availableDate": "$START_DATE",
  "status": 1,
  "remark": "$RUN_ID"
}
JSON
)"
unit_result="$(curl_request POST "/park-units" "$unit_body")"
assert_http_ok "create controlled unit" "$unit_result"
UNIT_ID="$(extract_data_field "${unit_result#*|}" "id")"

append_report ""
append_report "## Leasing Lifecycle"

lead_body="$(cat <<JSON
{
  "leadCode": "$LEAD_CODE",
  "customerName": "$COMPANY_NAME",
  "contactName": "Gate-6B 联系人",
  "contactMobile": "$CONTACT_MOBILE",
  "contactEmail": "$CONTACT_EMAIL",
  "demandArea": 120,
  "demandPrice": 40,
  "remark": "$RUN_ID"
}
JSON
)"
lead_result="$(curl_request POST "/leasing/leads" "$lead_body")"
assert_http_ok "create leasing lead" "$lead_result"
LEAD_ID="$(extract_data_field "${lead_result#*|}" "id")"

convert_body="$(cat <<JSON
{
  "company_name": "$COMPANY_NAME",
  "unified_credit_code": "$LEAD_CODE",
  "legal_person": "Gate-6B",
  "contact_name": "Gate-6B 联系人",
  "contact_mobile": "$CONTACT_MOBILE",
  "after_status": "78",
  "remark": "$RUN_ID"
}
JSON
)"
convert_result="$(curl_request POST "/leasing/leads/$LEAD_ID/convert-to-park-tenant" "$convert_body")"
assert_http_ok "convert lead to park tenant" "$convert_result"
PARK_TENANT_ID="$(extract_data_field "${convert_result#*|}" "park_tenant_id")"

quote_body="$(cat <<JSON
{
  "unitId": "$UNIT_ID",
  "quotePrice": 40,
  "quotePeriod": "$START_DATE to $END_DATE",
  "freeRentMonths": 0,
  "depositMonths": 2,
  "propertyFeePrice": 3,
  "remark": "$RUN_ID"
}
JSON
)"
quote_result="$(curl_request POST "/leasing/leads/$LEAD_ID/quotes" "$quote_body")"
assert_http_ok "create quote" "$quote_result"
QUOTE_ID="$(extract_data_field "${quote_result#*|}" "id")"

assert_http_ok "submit quote" "$(curl_request POST "/leasing/quotes/$QUOTE_ID/submit" "{\"opinion\":\"Gate-6B 提交报价审批\"}")"
assert_http_ok "approve quote" "$(curl_request POST "/leasing/quotes/$QUOTE_ID/approve" "{\"opinion\":\"Gate-6B 报价审批通过\"}")"

contract_draft_body="$(cat <<JSON
{
  "contract_name": "Gate-6B 租赁闭环验证合同 $STAMP",
  "start_date": "$START_DATE",
  "end_date": "$END_DATE",
  "payment_advance_days": 5,
  "late_fee_rule": "Gate-6B controlled validation"
}
JSON
)"
contract_result="$(curl_request POST "/leasing/quotes/$QUOTE_ID/create-contract-draft" "$contract_draft_body")"
assert_http_ok "create contract draft from approved quote" "$contract_result"
CONTRACT_ID="$(extract_data_field "${contract_result#*|}" "id")"
CONTRACT_CODE="$(extract_data_field "${contract_result#*|}" "contractCode")"

assert_http_ok "read contract units" "$(curl_request GET "/leasing/contracts/$CONTRACT_ID/units")"
assert_http_ok "submit contract" "$(curl_request POST "/leasing/contracts/$CONTRACT_ID/submit" "{\"opinion\":\"Gate-6B 提交合同审批\"}")"
assert_http_ok "approve contract" "$(curl_request POST "/leasing/contracts/$CONTRACT_ID/approve" "{\"opinion\":\"Gate-6B 合同审批通过\"}")"

CONTRACT_PDF="$REPORT_DIR/$RUN_ID-contract.pdf"
SCAN_PDF="$REPORT_DIR/$RUN_ID-scan.pdf"
create_minimal_pdf "$CONTRACT_PDF" "Gate-6B contract"
create_minimal_pdf "$SCAN_PDF" "Gate-6B scan"

contract_file_result="$(curl_upload_pdf "contract-pdf" "$CONTRACT_PDF")"
assert_http_ok "upload contract PDF" "$contract_file_result"
CONTRACT_FILE_ID="$(extract_data_field "${contract_file_result#*|}" "id")"

scan_file_result="$(curl_upload_pdf "scan-pdf" "$SCAN_PDF")"
assert_http_ok "upload signed scan PDF" "$scan_file_result"
SCAN_FILE_ID="$(extract_data_field "${scan_file_result#*|}" "id")"

archive_body="$(cat <<JSON
{
  "contract_pdf_file_id": "$CONTRACT_FILE_ID",
  "scan_pdf_file_id": "$SCAN_FILE_ID",
  "sign_date": "$SIGN_DATE",
  "effective_date": "$EFFECTIVE_DATE",
  "remark": "Gate-6B 合同签章归档"
}
JSON
)"
assert_http_ok "archive contract" "$(curl_request POST "/leasing/contracts/$CONTRACT_ID/archive" "$archive_body")"

effective_body="$(cat <<JSON
{
  "effective_date": "$EFFECTIVE_DATE",
  "opinion": "Gate-6B 合同生效"
}
JSON
)"
assert_http_ok "make contract effective" "$(curl_request POST "/leasing/contracts/$CONTRACT_ID/effective" "$effective_body")"

assert_http_ok "read contract detail" "$(curl_request GET "/leasing/contracts/$CONTRACT_ID")"
assert_http_ok "read contract status logs" "$(curl_request GET "/leasing/contracts/$CONTRACT_ID/status-logs?page=1&page_size=20")"
assert_http_ok "read contract action logs" "$(curl_request GET "/leasing/contracts/$CONTRACT_ID/action-logs?page=1&page_size=20")"
assert_http_ok "read contract files" "$(curl_request GET "/leasing/contracts/$CONTRACT_ID/files")"
assert_http_ok "read controlled unit detail after effective" "$(curl_request GET "/park-units/$UNIT_ID")"

summary_row="$(psql_query <<SQL
WITH scope AS (
  SELECT '$(sql_escape "$TENANT_ID_VALUE")'::varchar AS tenant_id,
         '$(sql_escape "$PARK_ID_VALUE")'::varchar AS park_id
)
SELECT
  (SELECT count(*) FROM biz_leasing_lead l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.id = '$(sql_escape "$LEAD_ID")' AND l.park_tenant_id IS NOT NULL AND l.status = '78' AND l.is_deleted = false) AS lead_moved_in_count,
  (SELECT count(*) FROM biz_park_tenant t JOIN scope ON scope.tenant_id = t.tenant_id AND scope.park_id = t.park_id WHERE t.id = '$(sql_escape "$PARK_TENANT_ID")' AND t.is_deleted = false) AS park_tenant_count,
  (SELECT count(*) FROM biz_leasing_quote q JOIN scope ON scope.tenant_id = q.tenant_id AND scope.park_id = q.park_id WHERE q.id = '$(sql_escape "$QUOTE_ID")' AND q.quote_status = '40' AND q.is_deleted = false) AS quote_approved_count,
  (SELECT count(*) FROM biz_leasing_contract c JOIN scope ON scope.tenant_id = c.tenant_id AND scope.park_id = c.park_id WHERE c.id = '$(sql_escape "$CONTRACT_ID")' AND c.status = '75' AND c.is_deleted = false) AS contract_effective_count,
  (SELECT count(*) FROM rel_leasing_contract_unit r JOIN scope ON scope.tenant_id = r.tenant_id AND scope.park_id = r.park_id WHERE r.contract_id = '$(sql_escape "$CONTRACT_ID")' AND r.unit_id = '$(sql_escape "$UNIT_ID")' AND r.status = 1 AND r.is_deleted = false) AS contract_unit_count,
  (SELECT count(*) FROM sys_file f JOIN scope ON scope.tenant_id = f.tenant_id AND scope.park_id = f.park_id WHERE f.biz_id = '$(sql_escape "$CONTRACT_ID")' AND f.biz_type = 'leasing_contract' AND f.status = 1 AND f.is_deleted = false) AS contract_file_count,
  (SELECT count(*) FROM biz_leasing_contract_status_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.contract_id = '$(sql_escape "$CONTRACT_ID")' AND l.is_deleted = false) AS contract_status_log_count,
  (SELECT count(*) FROM biz_leasing_contract_action_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.contract_id = '$(sql_escape "$CONTRACT_ID")' AND l.is_deleted = false) AS contract_action_log_count,
  (SELECT rental_status FROM biz_unit u JOIN scope ON scope.tenant_id = u.tenant_id AND scope.park_id = u.park_id WHERE u.id = '$(sql_escape "$UNIT_ID")' AND u.is_deleted = false LIMIT 1) AS unit_rental_status,
  (SELECT count(*) FROM biz_unit_status_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.unit_id = '$(sql_escape "$UNIT_ID")' AND l.is_deleted = false) AS unit_status_log_count,
  (SELECT count(*) FROM sys_op_log l JOIN scope ON scope.tenant_id = l.tenant_id AND scope.park_id = l.park_id WHERE l.biz_id IN ('$(sql_escape "$LEAD_ID")', '$(sql_escape "$QUOTE_ID")', '$(sql_escape "$CONTRACT_ID")') AND l.is_deleted = false) AS audit_log_count;
SQL
)"

IFS='|' read -r LEAD_MOVED_IN_COUNT PARK_TENANT_COUNT QUOTE_APPROVED_COUNT CONTRACT_EFFECTIVE_COUNT CONTRACT_UNIT_COUNT CONTRACT_FILE_COUNT CONTRACT_STATUS_LOG_COUNT CONTRACT_ACTION_LOG_COUNT UNIT_RENTAL_STATUS UNIT_STATUS_LOG_COUNT AUDIT_LOG_COUNT <<EOF
$summary_row
EOF

append_report ""
append_report "## Database Evidence"
append_report "- Lead moved-in and linked to tenant: $LEAD_MOVED_IN_COUNT"
append_report "- Converted park tenant: $PARK_TENANT_COUNT"
append_report "- Approved quote: $QUOTE_APPROVED_COUNT"
append_report "- Effective contract: $CONTRACT_EFFECTIVE_COUNT"
append_report "- Contract unit relations: $CONTRACT_UNIT_COUNT"
append_report "- Contract files: $CONTRACT_FILE_COUNT"
append_report "- Contract status logs: $CONTRACT_STATUS_LOG_COUNT"
append_report "- Contract action logs: $CONTRACT_ACTION_LOG_COUNT"
append_report "- Controlled unit rental status: $UNIT_RENTAL_STATUS"
append_report "- Unit status logs: $UNIT_STATUS_LOG_COUNT"
append_report "- Operation audit logs: $AUDIT_LOG_COUNT"

[ "$LEAD_MOVED_IN_COUNT" -ge 1 ] || fail_gate "lead was not converted and moved in"
[ "$PARK_TENANT_COUNT" -ge 1 ] || fail_gate "converted park tenant was not persisted"
[ "$QUOTE_APPROVED_COUNT" -ge 1 ] || fail_gate "quote was not approved"
[ "$CONTRACT_EFFECTIVE_COUNT" -ge 1 ] || fail_gate "contract was not effective"
[ "$CONTRACT_UNIT_COUNT" -ge 1 ] || fail_gate "contract unit relation missing"
[ "$CONTRACT_FILE_COUNT" -ge 2 ] || fail_gate "contract files missing"
[ "$CONTRACT_STATUS_LOG_COUNT" -ge 5 ] || fail_gate "contract status logs incomplete"
[ "$CONTRACT_ACTION_LOG_COUNT" -ge 5 ] || fail_gate "contract action logs incomplete"
[ "$UNIT_RENTAL_STATUS" = "30" ] || fail_gate "unit was not marked rented after contract effective"
[ "$UNIT_STATUS_LOG_COUNT" -ge 1 ] || fail_gate "unit status log missing"
[ "$AUDIT_LOG_COUNT" -ge 5 ] || fail_gate "operation audit logs incomplete"

append_report ""
append_report "## Final Verdict"
append_report ""
append_report "PASS: lead, tenant conversion, quote approval, contract draft, approval, PDF archive, effective contract, unit occupancy, status logs, action logs, and audit logs are production reachable."

cat > "$REPORT_JSON" <<JSON
{
  "run_id": $(json_escape "$RUN_ID"),
  "status": "PASS",
  "building_id": $(json_escape "$BUILDING_ID"),
  "floor_id": $(json_escape "$FLOOR_ID"),
  "unit_id": $(json_escape "$UNIT_ID"),
  "lead_id": $(json_escape "$LEAD_ID"),
  "park_tenant_id": $(json_escape "$PARK_TENANT_ID"),
  "quote_id": $(json_escape "$QUOTE_ID"),
  "contract_id": $(json_escape "$CONTRACT_ID"),
  "contract_code": $(json_escape "$CONTRACT_CODE"),
  "contract_pdf_file_id": $(json_escape "$CONTRACT_FILE_ID"),
  "scan_pdf_file_id": $(json_escape "$SCAN_FILE_ID"),
  "lead_moved_in_count": $LEAD_MOVED_IN_COUNT,
  "quote_approved_count": $QUOTE_APPROVED_COUNT,
  "contract_effective_count": $CONTRACT_EFFECTIVE_COUNT,
  "contract_unit_count": $CONTRACT_UNIT_COUNT,
  "contract_file_count": $CONTRACT_FILE_COUNT,
  "contract_status_log_count": $CONTRACT_STATUS_LOG_COUNT,
  "contract_action_log_count": $CONTRACT_ACTION_LOG_COUNT,
  "unit_rental_status": $UNIT_RENTAL_STATUS,
  "unit_status_log_count": $UNIT_STATUS_LOG_COUNT,
  "audit_log_count": $AUDIT_LOG_COUNT,
  "report_md": $(json_escape "$REPORT_MD"),
  "report_json": $(json_escape "$REPORT_JSON")
}
JSON

printf "GATE6B_PASS: leasing to effective contract lifecycle verified\n"
printf "REPORT_MD=%s\nREPORT_JSON=%s\n" "$REPORT_MD" "$REPORT_JSON"
