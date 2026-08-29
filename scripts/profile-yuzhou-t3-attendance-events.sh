#!/usr/bin/env sh
set -eu

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }

require YUZHOU_SQLSERVER_ETL_LOGIN
require YUZHOU_SQLSERVER_ETL_PASSWORD
require YUZHOU_SQLSERVER_DATABASE
require YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID
require YUZHOU_T3_ATTENDANCE_EVENTS_OUTPUT_ROOT

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
query="SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) AS sourceReadOnly, (SELECT COUNT_BIG(*) FROM dbo.[leave]) AS leaveRows, (SELECT CONVERT(varchar(10),MIN(starttime),23) FROM dbo.[leave]) AS leaveFirstDate, (SELECT CONVERT(varchar(10),MAX(endtime),23) FROM dbo.[leave]) AS leaveLastDate, (SELECT COUNT_BIG(*) FROM dbo.overtime) AS overtimeRows, (SELECT CONVERT(varchar(10),MIN(starttime),23) FROM dbo.overtime) AS overtimeFirstDate, (SELECT CONVERT(varchar(10),MAX(endtime),23) FROM dbo.overtime) AS overtimeLastDate, (SELECT COUNT_BIG(*) FROM dbo.attrecord) AS attrecordRows, (SELECT CONVERT(varchar(10),MIN(recordtime),23) FROM dbo.attrecord) AS attrecordFirstDate, (SELECT CONVERT(varchar(10),MAX(recordtime),23) FROM dbo.attrecord) AS attrecordLastDate, (SELECT COUNT_BIG(*) FROM dbo.timekeeprecord) AS timekeeprecordRows, (SELECT CONVERT(varchar(10),MIN(timekeepdate),23) FROM dbo.timekeeprecord) AS timekeeprecordFirstDate, (SELECT CONVERT(varchar(10),MAX(timekeepdate),23) FROM dbo.timekeeprecord) AS timekeeprecordLastDate FROM sys.databases WHERE name=DB_NAME() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;"
docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$container" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$query" >"$raw"
chmod 600 "$raw"
node -e 'const fs=require("fs"),crypto=require("crypto");const [rawPath,reportPath,runId]=process.argv.slice(1);const raw=JSON.parse(fs.readFileSync(rawPath,"utf8"));const sourceTables=[["dbo.leave","leave"],["dbo.overtime","overtime"],["dbo.attrecord","attrecord"],["dbo.timekeeprecord","timekeeprecord"]].map(([sourceTable,key])=>({sourceTable,sourceRows:raw[`${key}Rows`],firstDate:raw[`${key}FirstDate`]??null,lastDate:raw[`${key}LastDate`]??null}));if(raw.sourceReadOnly!==1||sourceTables.some(row=>!Number.isSafeInteger(row.sourceRows)||row.sourceRows<0||!/^\d{4}-\d{2}-\d{2}$/.test(row.firstDate??"")&&row.firstDate!==null||!/^\d{4}-\d{2}-\d{2}$/.test(row.lastDate??"")&&row.lastDate!==null))throw Error("invalid read-only attendance event aggregate");const sourceAggregateSha256=crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex");const receipt={formatVersion:1,artifactKind:"yuzhou_t3_attendance_events_source_receipt",runId,operationMode:"read_only_aggregate",sourceReadOnly:true,sourceTables,sourceAggregateSha256,productionImport:"HOLD"};fs.writeFileSync(reportPath,`${JSON.stringify(receipt,null,2)}\n`,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(reportPath,0o600);console.log(JSON.stringify({status:"PASS",runId,sourceTables:receipt.sourceTables.map(row=>({sourceTable:row.sourceTable,sourceRows:row.sourceRows})),productionImport:"HOLD"}));' "$raw" "$report" "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
