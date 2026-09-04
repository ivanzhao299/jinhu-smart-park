#!/bin/sh
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONTAINER="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_sourceetl_20260901}"
CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$ROOT_DIR/database/import-reports/yuzhou-hr/secure-control-current/yuzhou-readonly-etl.env}"
SOURCE_RECEIPT="${YUZHOU_SOURCE_RESTORE_RECEIPT_PATH:-$ROOT_DIR/database/import-reports/yuzhou-hr/secure-control-current/source-restore-receipt.json}"
OUTPUT="${YUZHOU_PERFORMANCE_MASTER_PRIVATE_OUTPUT:-}"

fail() { printf '%s\n' "$1" >&2; exit 1; }
mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null; }

[ -n "$OUTPUT" ] || fail PERFORMANCE_MASTER_EXTRACT_PRIVATE_OUTPUT_REQUIRED
case "$CONTAINER" in *[!A-Za-z0-9_.-]*|'') fail PERFORMANCE_MASTER_EXTRACT_CONTAINER_INVALID;; esac
[ -f "$CREDENTIAL_FILE" ] && [ "$(mode "$CREDENTIAL_FILE")" = 600 ] || fail PERFORMANCE_MASTER_EXTRACT_ETL_ENVELOPE_INVALID
[ -f "$SOURCE_RECEIPT" ] || fail PERFORMANCE_MASTER_EXTRACT_SOURCE_RECEIPT_MISSING
[ ! -e "$OUTPUT" ] || fail PERFORMANCE_MASTER_EXTRACT_PRIVATE_OUTPUT_EXISTS

set -a
. "$CREDENTIAL_FILE"
set +a
[ -n "${YUZHOU_SQLSERVER_ETL_LOGIN:-}" ] && [ -n "${YUZHOU_SQLSERVER_ETL_PASSWORD:-}" ] || fail PERFORMANCE_MASTER_EXTRACT_ETL_AUTHORITY_INCOMPLETE
[ "$(printf '%s' "$YUZHOU_SQLSERVER_ETL_LOGIN" | tr '[:upper:]' '[:lower:]')" != sa ] || fail PERFORMANCE_MASTER_EXTRACT_SA_FORBIDDEN
printf '%s' "${YUZHOU_SQLSERVER_DATABASE:-}" | grep -Eq '^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$' || fail PERFORMANCE_MASTER_EXTRACT_DATABASE_INVALID

OUTPUT_DIR="$(dirname -- "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
WORK_DIR="$(mktemp -d "$OUTPUT_DIR/.performance-master-extract.XXXXXX")"
chmod 700 "$WORK_DIR"
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT HUP INT TERM

sqlcmd_query() {
  destination="$1"
  query="$2"
  if ! printf '%s\n' "$YUZHOU_SQLSERVER_ETL_PASSWORD" | docker exec -i "$CONTAINER" bash -lc \
    'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d "$2" -y 0 -w 65535 -Q "$3"' \
    q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$query" \
    >"$WORK_DIR/sqlcmd.raw" 2>"$WORK_DIR/sqlcmd.stderr"; then
    fail PERFORMANCE_MASTER_EXTRACT_SQLSERVER_QUERY_FAILED
  fi
  tr -d '\r\n' <"$WORK_DIR/sqlcmd.raw" >"$destination"
  chmod 600 "$destination"
}

AUTHORITY="$WORK_DIR/authority.txt"
sqlcmd_query "$AUTHORITY" "SET NOCOUNT ON; SELECT CONCAT(CONVERT(int,is_read_only),'|',CONVERT(int,COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),'|',CONVERT(int,COALESCE(IS_ROLEMEMBER('db_datareader'),0))) FROM sys.databases WHERE name=DB_NAME();"
[ "$(tr -d '[:space:]' <"$AUTHORITY")" = '1|0|1' ] || fail PERFORMANCE_MASTER_EXTRACT_SOURCE_AUTHORITY_INVALID

sqlcmd_query "$WORK_DIR/assessmentmaster.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assessmentmaster',NCHAR(0),CONVERT(nvarchar(50),source.id))),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.id,source.asssessionid,source.person,source.selfgrade,source.assgrade,source.selfvalue,source.itemvalue,source.mitemvalue,source.xitemvalue,source.citemvalue,source.mastervalue,source.timekeepvalue,source.bonusvalue,source.totalvalue,source.selfappraisal,source.appraisal,source.pay,source.assessmentperson,source.recdate,source.operator,source.des FROM dbo.assessmentmaster source CROSS APPLY(SELECT source.id,source.asssessionid,source.person,source.selfgrade,source.assgrade,source.selfvalue,source.itemvalue,source.mitemvalue,source.xitemvalue,source.citemvalue,source.mastervalue,source.timekeepvalue,source.bonusvalue,source.totalvalue,source.selfappraisal,source.appraisal,source.pay,source.assessmentperson,source.recdate,source.operator,source.des FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.id FOR JSON PATH,INCLUDE_NULL_VALUES;"

SOURCE_RECEIPT_SHA256="$(shasum -a 256 "$SOURCE_RECEIPT" | awk '{print $1}')"
export WORK_DIR OUTPUT SOURCE_RECEIPT_SHA256
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { chmodSync, closeSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const rows = JSON.parse(readFileSync(resolve(process.env.WORK_DIR, "assessmentmaster.json"), "utf8") || "[]");
const payload = { assessmentmaster: rows };
const canonical = `${JSON.stringify(payload)}\n`;
const fd = openSync(process.env.OUTPUT, "wx", 0o600);
closeSync(fd);
writeFileSync(process.env.OUTPUT, canonical, { mode: 0o600 });
chmodSync(process.env.OUTPUT, 0o600);

const duplicateGroups = values => [...values.reduce((counts, value) => counts.set(value, (counts.get(value) ?? 0) + 1), new Map()).values()].filter(count => count > 1).length;
const nullableFields = ["asssessionid", "person", "selfgrade", "assgrade", "selfvalue", "itemvalue", "mitemvalue", "xitemvalue", "citemvalue", "mastervalue", "timekeepvalue", "bonusvalue", "totalvalue", "selfappraisal", "appraisal", "pay", "assessmentperson", "recdate", "operator", "des"];
const safeFacts = {
  rowCount: rows.length,
  duplicateIdGroups: duplicateGroups(rows.map(row => String(row.id))),
  duplicateSessionPersonGroups: duplicateGroups(rows.map(row => `${String(row.asssessionid)}\u0000${String(row.person)}`)),
  nullCounts: Object.fromEntries(nullableFields.map(field => [field, rows.filter(row => row[field] === null).length])),
};
process.stdout.write(`${JSON.stringify({
  formatVersion: 1,
  kind: "yuzhou_hr_performance_master_private_extract_receipt",
  sourceSystem: "yuzhou-v10",
  sourceTable: "dbo.assessmentmaster",
  sourceReadOnly: true,
  sourceSysadmin: false,
  sourceRestoreReceiptSha256: process.env.SOURCE_RECEIPT_SHA256,
  privatePayloadSha256: createHash("sha256").update(canonical).digest("hex"),
  privatePayloadMode: "0600",
  privatePayloadContainsPersonalData: true,
  receiptContainsSourceValues: false,
  safeFacts,
  postgresLoad: "NOT_EXECUTED",
  productionImport: "HOLD",
})}\n`);
NODE
