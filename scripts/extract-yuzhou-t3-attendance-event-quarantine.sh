#!/usr/bin/env sh
set -eu
umask 077

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }

[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
require YUZHOU_SQLSERVER_ETL_LOGIN
require YUZHOU_SQLSERVER_ETL_PASSWORD
require YUZHOU_SQLSERVER_DATABASE
require YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID
require YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT
require YUZHOU_BACKUP_SHA256
require YUZHOU_SOURCE_RESTORE_RECEIPT_PATH
require YUZHOU_MAPPING_CONTRACT_SHA256

case "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" in
  *[!A-Za-z0-9._-]*|""|?|??|???|????) fail "invalid YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" ;;
esac
printf %s "$YUZHOU_BACKUP_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid YUZHOU_BACKUP_SHA256"
printf %s "$YUZHOU_MAPPING_CONTRACT_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid YUZHOU_MAPPING_CONTRACT_SHA256"
source_binding="$(node --input-type=module - "$YUZHOU_SOURCE_RESTORE_RECEIPT_PATH" "$YUZHOU_BACKUP_SHA256" <<'NODE'
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { validateSourceRestoreReceipt } from "./scripts/hr-cutover/source-restore-receipt.mjs";
const [path, snapshot] = process.argv.slice(2);
if (!isAbsolute(path) || resolve(path) !== path) throw Error("source restore receipt is required");
const link = lstatSync(path), actual = realpathSync(path), info = statSync(actual);
if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) throw Error("source restore receipt is unsafe");
const bytes = readFileSync(actual), receipt = validateSourceRestoreReceipt(JSON.parse(bytes));
if (receipt.sourceSnapshotSha256 !== snapshot || receipt.productionImport !== "HOLD") throw Error("source restore receipt snapshot binding mismatch");
process.stdout.write(JSON.stringify({ sourceRestoreReceiptSha256: createHash("sha256").update(bytes).digest("hex"), sourceCatalogSha256: receipt.identities.catalogSha256 }));
NODE
)" || fail "source restore receipt binding is invalid"
case "$YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT" in
  database/import-reports/yuzhou-hr/t3-attendance-events-stage) ;;
  *) fail "attendance event staging must remain under database/import-reports/yuzhou-hr/t3-attendance-events-stage" ;;
esac

container="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
[ "$YUZHOU_SQLSERVER_ETL_LOGIN" != "sa" ] || fail "sa is forbidden for extraction"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container" 2>/dev/null || true)" = "jinhu_yuzhou_migration_lab" ] || fail "container is not the migration lab"

root="$YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT"
stage="$root/staging-$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
[ ! -e "$stage" ] || fail "attendance event staging already exists"
mkdir -p "$root"
chmod 700 "$root"
mkdir "$stage"
chmod 700 "$stage"

raw="$stage/source-hash-rows.json"
rows="$stage/attendance-punch-quarantine.jsonl"
manifest="$stage/manifest.json"
query="SET NOCOUNT ON; SELECT (SELECT CONVERT(int, is_read_only) FROM sys.databases WHERE name=DB_NAME()) AS sourceReadOnly, JSON_QUERY((SELECT LOWER(CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), CONCAT('dbo.attrecord', CHAR(0), CONVERT(varchar(20), a.id)))), 2)) AS sourceIdentitySha256, LOWER(CONVERT(varchar(64), HASHBYTES('SHA2_256', CONVERT(varbinary(max), CONCAT(CONVERT(varchar(20), a.id), '|', COALESCE(a.person, ''), '|', COALESCE(a.cardno, ''), '|', CONVERT(varchar(33), a.recordtime, 126), '|', COALESCE(a.inorout, '')))), 2)) AS sourceRowSha256, CONVERT(bit, CASE WHEN p.person IS NULL THEN 0 ELSE 1 END) AS sourcePersonLinked FROM dbo.attrecord a LEFT JOIN dbo.person p ON p.person=a.person ORDER BY a.id FOR JSON PATH, INCLUDE_NULL_VALUES)) AS rows FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;"
docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$container" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$query" >"$raw"
chmod 600 "$raw"

finalize_manifest(){
  [ -f "$manifest" ] || return 0
  node - "$manifest" "$YUZHOU_BACKUP_SHA256" "$source_binding" "$YUZHOU_MAPPING_CONTRACT_SHA256" <<'NODE'
const fs=require("fs");
const crypto=require("crypto");
const [manifestPath,sourceSnapshotSha256,binding,mappingContractSha256]=process.argv.slice(2);
if(!/^[0-9a-f]{64}$/.test(sourceSnapshotSha256))throw Error("invalid source backup hash");
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
if(manifest.sourceReadOnly!==true||manifest.productionImport!=="HOLD")throw Error("unsafe source attendance manifest");
const source=JSON.parse(binding),sha=v=>crypto.createHash("sha256").update(v).digest("hex"),canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);
manifest.sourceSnapshotSha256=sourceSnapshotSha256;
manifest.sourceRestoreReceiptSha256=source.sourceRestoreReceiptSha256;
manifest.sourceCatalogSha256=source.sourceCatalogSha256;
manifest.mappingContractSha256=mappingContractSha256;
manifest.sourceBusinessSha256=sha(canonical({sourceSnapshotSha256,sourceRestoreReceiptSha256:source.sourceRestoreReceiptSha256,sourceCatalogSha256:source.sourceCatalogSha256,sourceTable:manifest.sourceTable,sourceRows:manifest.sourceRows,quarantinedRows:manifest.quarantinedRows,quarantineFileSha256:manifest.quarantineFileSha256,quarantineCodes:manifest.quarantineCodes}));
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2).concat("\n"),{encoding:"utf8",mode:0o600});
fs.chmodSync(manifestPath,0o600);
NODE
}
trap finalize_manifest EXIT

node -e 'const fs=require("fs"),crypto=require("crypto");const [rawPath,rowsPath,manifestPath,runId]=process.argv.slice(1);const raw=JSON.parse(fs.readFileSync(rawPath,"utf8"));if(raw.sourceReadOnly!==1||!Array.isArray(raw.rows))throw Error("unsafe source attendance response");const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");const identity=/^[0-9a-f]{64}$/;const rows=raw.rows.map(row=>{if(!identity.test(row.sourceIdentitySha256??"")||!identity.test(row.sourceRowSha256??"")||typeof row.sourcePersonLinked!=="boolean")throw Error("unsafe source attendance row");return {domain:"attendance_punch_event",sourceTable:"dbo.attrecord",sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,status:"quarantined",quarantineCode:row.sourcePersonLinked?"ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED":"ATTENDANCE_PUNCH_PERSON_UNMAPPED"};});if(new Set(rows.map(row=>row.sourceIdentitySha256)).size!==rows.length)throw Error("duplicate source attendance identity");const jsonl=rows.map(row=>JSON.stringify(row)).join(rows.length?"\n":"")+(rows.length?"\n":"");fs.writeFileSync(rowsPath,jsonl,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(rowsPath,0o600);const quarantineCodes=Object.fromEntries([...new Set(rows.map(row=>row.quarantineCode))].sort().map(code=>[code,rows.filter(row=>row.quarantineCode===code).length]));const manifest={formatVersion:1,artifactKind:"yuzhou_t3_attendance_punch_quarantine_stage",runId,operationMode:"read_only_hash_only_quarantine",sourceReadOnly:true,sourceTable:"dbo.attrecord",sourceRows:rows.length,eligibleRows:0,quarantinedRows:rows.length,quarantineCodes,sourceHashRowsSha256:sha256(fs.readFileSync(rawPath)),quarantineFileSha256:sha256(fs.readFileSync(rowsPath)),businessWriteTarget:"none",productionImport:"HOLD"};fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(manifestPath,0o600);console.log(JSON.stringify({status:"PASS",runId,sourceRows:manifest.sourceRows,eligibleRows:0,quarantinedRows:manifest.quarantinedRows,quarantineCodes,productionImport:"HOLD"}));' "$raw" "$rows" "$manifest" "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
