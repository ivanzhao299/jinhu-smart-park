#!/bin/sh
set -eu
umask 077

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
CONTAINER="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_sourceetl_20260901}"
CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$ROOT_DIR/database/import-reports/yuzhou-hr/secure-control-current/yuzhou-readonly-etl.env}"
SOURCE_RECEIPT="${YUZHOU_SOURCE_RESTORE_RECEIPT_PATH:-$ROOT_DIR/database/import-reports/yuzhou-hr/secure-control-current/source-restore-receipt.json}"
OUTPUT="${YUZHOU_PERFORMANCE_PRIVATE_OUTPUT:-}"

fail() { printf '%s\n' "$1" >&2; exit 1; }
mode() { stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null; }

[ -n "$OUTPUT" ] || fail PERFORMANCE_EXTRACT_PRIVATE_OUTPUT_REQUIRED
case "$CONTAINER" in *[!A-Za-z0-9_.-]*|'') fail PERFORMANCE_EXTRACT_CONTAINER_INVALID;; esac
[ -f "$CREDENTIAL_FILE" ] && [ "$(mode "$CREDENTIAL_FILE")" = 600 ] || fail PERFORMANCE_EXTRACT_ETL_ENVELOPE_INVALID
[ -f "$SOURCE_RECEIPT" ] || fail PERFORMANCE_EXTRACT_SOURCE_RECEIPT_MISSING
[ ! -e "$OUTPUT" ] || fail PERFORMANCE_EXTRACT_PRIVATE_OUTPUT_EXISTS

# The private envelope is sourced without echoing it.  The password is passed
# to sqlcmd over stdin and never appears in argv, stdout, or the safe receipt.
set -a
. "$CREDENTIAL_FILE"
set +a
[ -n "${YUZHOU_SQLSERVER_ETL_LOGIN:-}" ] && [ -n "${YUZHOU_SQLSERVER_ETL_PASSWORD:-}" ] || fail PERFORMANCE_EXTRACT_ETL_AUTHORITY_INCOMPLETE
[ "$(printf '%s' "$YUZHOU_SQLSERVER_ETL_LOGIN" | tr '[:upper:]' '[:lower:]')" != sa ] || fail PERFORMANCE_EXTRACT_SA_FORBIDDEN
printf '%s' "${YUZHOU_SQLSERVER_DATABASE:-}" | grep -Eq '^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$' || fail PERFORMANCE_EXTRACT_DATABASE_INVALID

OUTPUT_DIR="$(dirname -- "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"
chmod 700 "$OUTPUT_DIR"
WORK_DIR="$(mktemp -d "$OUTPUT_DIR/.performance-extract.XXXXXX")"
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
    fail PERFORMANCE_EXTRACT_SQLSERVER_QUERY_FAILED
  fi
  tr -d '\r\n' <"$WORK_DIR/sqlcmd.raw" >"$destination"
  chmod 600 "$destination"
}

AUTHORITY="$WORK_DIR/authority.txt"
sqlcmd_query "$AUTHORITY" "SET NOCOUNT ON; SELECT CONCAT(CONVERT(int,is_read_only),'|',CONVERT(int,COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),'|',CONVERT(int,COALESCE(IS_ROLEMEMBER('db_datareader'),0))) FROM sys.databases WHERE name=DB_NAME();"
[ "$(tr -d '[:space:]' <"$AUTHORITY")" = '1|0|1' ] || fail PERFORMANCE_EXTRACT_SOURCE_AUTHORITY_INVALID

sqlcmd_query "$WORK_DIR/assessmentcode.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assessmentcode',NCHAR(0),CONVERT(nvarchar(50),source.assessment))),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.assessment,source.assessmentname,source.department,source.mpercent,source.tpercent,source.xpercent,source.cpercent,source.spercent,source.timekeep,source.bonus,source.master FROM dbo.assessmentcode source CROSS APPLY(SELECT source.assessment,source.assessmentname,source.department,source.mpercent,source.tpercent,source.xpercent,source.cpercent,source.spercent,source.timekeep,source.bonus,source.master FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.assessment FOR JSON PATH,INCLUDE_NULL_VALUES;"
sqlcmd_query "$WORK_DIR/assgradecode.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assgradecode',NCHAR(0),source.assgrade)),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.assgrade,source.description,source.myorder,source.assessmentid,source.minvalue,source.maxvalue FROM dbo.assgradecode source CROSS APPLY(SELECT source.assgrade,source.description,source.myorder,source.assessmentid,source.minvalue,source.maxvalue FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.assgrade FOR JSON PATH,INCLUDE_NULL_VALUES;"
sqlcmd_query "$WORK_DIR/assitem.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assitem',NCHAR(0),CONVERT(nvarchar(50),source.id))),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.id,source.assid,source.assitem,source.fullvalue,source.myorder FROM dbo.assitem source CROSS APPLY(SELECT source.id,source.assid,source.assitem,source.fullvalue,source.myorder FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.id FOR JSON PATH,INCLUDE_NULL_VALUES;"
sqlcmd_query "$WORK_DIR/assitemgradedes.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assitemgradedes',NCHAR(0),CONVERT(nvarchar(50),source.id))),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.id,source.assitemid,source.grade,source.description,source.minvalue,source.maxvalue,source.myorder FROM dbo.assitemgradedes source CROSS APPLY(SELECT source.id,source.assitemid,source.grade,source.description,source.minvalue,source.maxvalue,source.myorder FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.id FOR JSON PATH,INCLUDE_NULL_VALUES;"
sqlcmd_query "$WORK_DIR/assessmentdetail.json" "SET NOCOUNT ON; SELECT LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(N'dbo.assessmentdetail',NCHAR(0),CONVERT(nvarchar(50),source.id))),2)) sourceIdentitySha256,LOWER(CONVERT(varchar(64),HASHBYTES('SHA2_256',canonical.row_json),2)) sourceRowSha256,source.id,source.asssessionid,source.person,source.assitemid,source.selfvalue,source.mitemvalue,source.itemvalue,source.xitemvalue,source.citemvalue,source.selfgrade,source.assgrade,source.appraisal FROM dbo.assessmentdetail source CROSS APPLY(SELECT source.id,source.asssessionid,source.person,source.assitemid,source.selfvalue,source.mitemvalue,source.itemvalue,source.xitemvalue,source.citemvalue,source.selfgrade,source.assgrade,source.appraisal FOR JSON PATH,WITHOUT_ARRAY_WRAPPER,INCLUDE_NULL_VALUES)canonical(row_json) ORDER BY source.id FOR JSON PATH,INCLUDE_NULL_VALUES;"

SOURCE_RECEIPT_SHA256="$(shasum -a 256 "$SOURCE_RECEIPT" | awk '{print $1}')"
export WORK_DIR OUTPUT SOURCE_RECEIPT_SHA256
node --input-type=module <<'NODE'
import { createHash } from "node:crypto";
import { openSync, closeSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { resolve } from "node:path";

const names = ["assessmentcode", "assgradecode", "assitem", "assitemgradedes", "assessmentdetail"];
const payload = Object.fromEntries(names.map(name => [name, JSON.parse(readFileSync(resolve(process.env.WORK_DIR, `${name}.json`), "utf8") || "[]")]));
const canonical = `${JSON.stringify(payload)}\n`;
const fd = openSync(process.env.OUTPUT, "wx", 0o600);
closeSync(fd);
writeFileSync(process.env.OUTPUT, canonical, { mode: 0o600 });
chmodSync(process.env.OUTPUT, 0o600);
const duplicateGroups = (rows, key) => [...rows.reduce((m, row) => m.set(String(row[key]), (m.get(String(row[key])) ?? 0) + 1), new Map()).values()].filter(count => count > 1).length;
const assessmentIds = new Set(payload.assessmentcode.map(row => row.assessment));
const gradeCodes = new Set(payload.assgradecode.map(row => row.assgrade));
const itemIds = new Set(payload.assitem.map(row => row.id));
const safeFacts = {
  rowCounts: Object.fromEntries(names.map(name => [name, payload[name].length])),
  duplicateKeyGroups: {
    assessmentcode: duplicateGroups(payload.assessmentcode, "assessment"),
    assgradecode: duplicateGroups(payload.assgradecode, "assgrade"),
    assitem: duplicateGroups(payload.assitem, "id"),
    assitemgradedes: duplicateGroups(payload.assitemgradedes, "id"),
    assessmentdetail: duplicateGroups(payload.assessmentdetail, "id"),
  },
  unresolvedRelations: {
    assitemAssessment: payload.assitem.filter(row => row.assid !== null && !assessmentIds.has(row.assid)).length,
    guideItem: payload.assitemgradedes.filter(row => row.assitemid !== null && !itemIds.has(row.assitemid)).length,
    guideGrade: payload.assitemgradedes.filter(row => row.grade !== null && !gradeCodes.has(row.grade)).length,
    detailItem: payload.assessmentdetail.filter(row => row.assitemid !== null && !itemIds.has(row.assitemid)).length,
  },
};
process.stdout.write(`${JSON.stringify({
  formatVersion: 1,
  kind: "yuzhou_hr_performance_legacy_private_extract_receipt",
  sourceSystem: "yuzhou-v10",
  sourceReadOnly: true,
  sourceSysadmin: false,
  sourceRestoreReceiptSha256: process.env.SOURCE_RECEIPT_SHA256,
  privatePayloadSha256: createHash("sha256").update(canonical).digest("hex"),
  privatePayloadMode: "0600",
  safeFacts,
  containsSourceValues: false,
  containsPersonalData: false,
  postgresLoad: "NOT_EXECUTED",
  productionImport: "HOLD",
})}\n`);
NODE
