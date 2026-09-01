#!/usr/bin/env sh
set -eu
umask 077

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }

require YUZHOU_SQLSERVER_ETL_LOGIN
require YUZHOU_SQLSERVER_ETL_PASSWORD
require YUZHOU_SQLSERVER_DATABASE
require YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID
require YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT
require YUZHOU_BACKUP_SHA256
require YUZHOU_SOURCE_RESTORE_RECEIPT_PATH
require YUZHOU_MAPPING_CONTRACT_SHA256

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

case "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" in
  *[!A-Za-z0-9._-]*|""|?|??|???|????) fail "invalid YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" ;;
esac

container="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
[ "$YUZHOU_SQLSERVER_ETL_LOGIN" != "sa" ] || fail "sa is forbidden for extraction"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container" 2>/dev/null || true)" = "jinhu_yuzhou_migration_lab" ] || fail "container is not the migration lab"

root="$YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT"
run_dir="$root/$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
[ ! -e "$run_dir" ] || fail "attendance events receipt already exists"
mkdir -p "$root"
chmod 700 "$root"
mkdir "$run_dir"
chmod 700 "$run_dir"
raw="$run_dir/source-aggregate.json"
report="$run_dir/receipt.json"
query="SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) AS sourceReadOnly, (SELECT COUNT_BIG(*) FROM dbo.[leave]) AS leaveRows, (SELECT CONVERT(varchar(10),MIN(starttime),23) FROM dbo.[leave]) AS leaveFirstDate, (SELECT CONVERT(varchar(10),MAX(endtime),23) FROM dbo.[leave]) AS leaveLastDate, (SELECT COUNT_BIG(*) FROM dbo.overtime) AS overtimeRows, (SELECT CONVERT(varchar(10),MIN(starttime),23) FROM dbo.overtime) AS overtimeFirstDate, (SELECT CONVERT(varchar(10),MAX(endtime),23) FROM dbo.overtime) AS overtimeLastDate, (SELECT COUNT_BIG(*) FROM dbo.attrecord) AS attrecordRows, (SELECT COUNT_BIG(*) FROM dbo.attrecord a JOIN dbo.person p ON p.person=a.person) AS attrecordLinkedPersonRows, (SELECT CONVERT(varchar(10),MIN(recordtime),23) FROM dbo.attrecord) AS attrecordFirstDate, (SELECT CONVERT(varchar(10),MAX(recordtime),23) FROM dbo.attrecord) AS attrecordLastDate, (SELECT COUNT_BIG(*) FROM dbo.timekeeprecord) AS timekeeprecordRows, (SELECT COUNT_BIG(*) FROM dbo.timekeeprecord t JOIN dbo.person p ON p.person=t.person) AS timekeeprecordLinkedPersonRows, (SELECT CONVERT(varchar(10),MIN(timekeepdate),23) FROM dbo.timekeeprecord) AS timekeeprecordFirstDate, (SELECT CONVERT(varchar(10),MAX(timekeepdate),23) FROM dbo.timekeeprecord) AS timekeeprecordLastDate FROM sys.databases WHERE name=DB_NAME() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;"
docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$container" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$query" >"$raw"
chmod 600 "$raw"
node -e 'const fs=require("fs"),crypto=require("crypto");const [rawPath,reportPath,runId,snapshot,binding,mapping]=process.argv.slice(1);const raw=JSON.parse(fs.readFileSync(rawPath,"utf8")),source=JSON.parse(binding);const sha=v=>crypto.createHash("sha256").update(v).digest("hex"),canonical=v=>Array.isArray(v)?`[${v.map(canonical).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`:JSON.stringify(v);const sourceTables=[["dbo.leave","leave"],["dbo.overtime","overtime"],["dbo.attrecord","attrecord"],["dbo.timekeeprecord","timekeeprecord"]].map(([sourceTable,key])=>({sourceTable,sourceRows:raw[`${key}Rows`],linkedPersonRows:key==="attrecord"||key==="timekeeprecord"?raw[`${key}LinkedPersonRows`]:null,firstDate:raw[`${key}FirstDate`]??null,lastDate:raw[`${key}LastDate`]??null}));if(raw.sourceReadOnly!==1||sourceTables.some(row=>!Number.isSafeInteger(row.sourceRows)||row.sourceRows<0||(row.linkedPersonRows!==null&&(!Number.isSafeInteger(row.linkedPersonRows)||row.linkedPersonRows<0||row.linkedPersonRows>row.sourceRows))||!/^\d{4}-\d{2}-\d{2}$/.test(row.firstDate??"")&&row.firstDate!==null||!/^\d{4}-\d{2}-\d{2}$/.test(row.lastDate??"")&&row.lastDate!==null))throw Error("invalid read-only attendance event aggregate");const sourceAggregateSha256=sha(JSON.stringify(raw));const receipt={formatVersion:1,artifactKind:"yuzhou_t3_attendance_events_source_receipt",runId,operationMode:"read_only_aggregate",sourceReadOnly:true,sourceSnapshotSha256:snapshot,sourceRestoreReceiptSha256:source.sourceRestoreReceiptSha256,sourceCatalogSha256:source.sourceCatalogSha256,mappingContractSha256:mapping,sourceTables,sourceAggregateSha256,sourceBusinessSha256:sha(canonical({sourceSnapshotSha256:snapshot,sourceRestoreReceiptSha256:source.sourceRestoreReceiptSha256,sourceCatalogSha256:source.sourceCatalogSha256,sourceTables,sourceAggregateSha256})),productionImport:"HOLD"};fs.writeFileSync(reportPath,`${JSON.stringify(receipt,null,2)}\n`,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(reportPath,0o600);console.log(JSON.stringify({status:"PASS",runId,sourceTables:receipt.sourceTables.map(row=>({sourceTable:row.sourceTable,sourceRows:row.sourceRows,linkedPersonRows:row.linkedPersonRows})),sourceBusinessSha256:receipt.sourceBusinessSha256,productionImport:"HOLD"}));' "$raw" "$report" "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" "$YUZHOU_BACKUP_SHA256" "$source_binding" "$YUZHOU_MAPPING_CONTRACT_SHA256"
