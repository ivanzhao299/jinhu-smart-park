#!/usr/bin/env sh
set -eu

fail(){ printf '%s\n' "$1" >&2; exit 1; }
require(){ eval "value=\${$1-}"; [ -n "$value" ] || fail "missing $1"; }
require YUZHOU_SQLSERVER_ETL_LOGIN
require YUZHOU_SQLSERVER_ETL_PASSWORD
require YUZHOU_SQLSERVER_DATABASE
require YUZHOU_TRAINING_REWARD_EVENTS_RUN_ID
require YUZHOU_TRAINING_REWARD_EVENTS_OUTPUT_ROOT

case "$YUZHOU_TRAINING_REWARD_EVENTS_RUN_ID" in *[!A-Za-z0-9._-]*|""|?|??|???|????) fail "invalid YUZHOU_TRAINING_REWARD_EVENTS_RUN_ID" ;; esac
container="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
[ "$YUZHOU_SQLSERVER_ETL_LOGIN" != "sa" ] || fail "sa is forbidden for extraction"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$container" 2>/dev/null || true)" = "jinhu_yuzhou_migration_lab" ] || fail "container is not the migration lab"
root="$YUZHOU_TRAINING_REWARD_EVENTS_OUTPUT_ROOT"; run_dir="$root/$YUZHOU_TRAINING_REWARD_EVENTS_RUN_ID"
[ ! -e "$run_dir" ] || fail "training reward receipt already exists"
mkdir -p "$root"; chmod 700 "$root"; mkdir "$run_dir"; chmod 700 "$run_dir"
raw="$run_dir/source-aggregate.json"; report="$run_dir/receipt.json"
query="SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) sourceReadOnly, (SELECT COUNT_BIG(*) FROM dbo.course) courseRows, (SELECT COUNT_BIG(*) FROM dbo.train) trainRows, (SELECT COUNT_BIG(*) FROM dbo.train t JOIN dbo.person p ON p.person=t.person) trainLinkedPersonRows, (SELECT CONVERT(varchar(10),MIN(startdate),23) FROM dbo.train) trainFirstDate, (SELECT CONVERT(varchar(10),MAX(enddate),23) FROM dbo.train) trainLastDate, (SELECT COUNT_BIG(*) FROM dbo.trainhis) trainhisRows, (SELECT COUNT_BIG(*) FROM dbo.trainhis t JOIN dbo.person p ON p.person=t.person) trainhisLinkedPersonRows, (SELECT CONVERT(varchar(10),MIN(startdate),23) FROM dbo.trainhis) trainhisFirstDate, (SELECT CONVERT(varchar(10),MAX(enddate),23) FROM dbo.trainhis) trainhisLastDate, (SELECT COUNT_BIG(*) FROM dbo.jobtrain) jobtrainRows, (SELECT COUNT_BIG(*) FROM dbo.bonuscode) bonuscodeRows, (SELECT COUNT_BIG(*) FROM dbo.bonusrecord) bonusrecordRows, (SELECT COUNT_BIG(*) FROM dbo.bonusrecord b JOIN dbo.person p ON p.person=b.person) bonusrecordLinkedPersonRows, (SELECT CONVERT(varchar(10),MIN(bonusdate),23) FROM dbo.bonusrecord) bonusrecordFirstDate, (SELECT CONVERT(varchar(10),MAX(bonusdate),23) FROM dbo.bonusrecord) bonusrecordLastDate FROM sys.databases WHERE name=DB_NAME() FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;"
docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$container" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$YUZHOU_SQLSERVER_DATABASE" "$query" >"$raw"
chmod 600 "$raw"
node -e 'const fs=require("fs"),crypto=require("crypto");const [rawPath,reportPath,runId]=process.argv.slice(1);const raw=JSON.parse(fs.readFileSync(rawPath,"utf8"));const specs=[["dbo.course","course",false,false],["dbo.train","train",true,true],["dbo.trainhis","trainhis",true,true],["dbo.jobtrain","jobtrain",false,false],["dbo.bonuscode","bonuscode",false,false],["dbo.bonusrecord","bonusrecord",true,true]];const rows=specs.map(([sourceTable,key,hasPerson,hasDates])=>({sourceTable,sourceRows:raw[`${key}Rows`],linkedPersonRows:hasPerson?raw[`${key}LinkedPersonRows`]:null,firstDate:hasDates?raw[`${key}FirstDate`]??null:null,lastDate:hasDates?raw[`${key}LastDate`]??null:null}));const validDate=value=>value===null||/^\d{4}-\d{2}-\d{2}$/.test(value);if(raw.sourceReadOnly!==1||rows.some(row=>!Number.isSafeInteger(row.sourceRows)||row.sourceRows<0||(row.linkedPersonRows!==null&&(!Number.isSafeInteger(row.linkedPersonRows)||row.linkedPersonRows<0||row.linkedPersonRows>row.sourceRows))||!validDate(row.firstDate)||!validDate(row.lastDate)))throw Error("invalid read-only training reward aggregate");const receipt={formatVersion:1,artifactKind:"yuzhou_training_reward_events_source_receipt",runId,operationMode:"read_only_aggregate",sourceReadOnly:true,sourceTables:rows,sourceAggregateSha256:crypto.createHash("sha256").update(JSON.stringify(raw)).digest("hex"),productionImport:"HOLD"};fs.writeFileSync(reportPath,`${JSON.stringify(receipt,null,2)}\n`,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(reportPath,0o600);console.log(JSON.stringify({status:"PASS",runId,sourceTables:rows.map(row=>({sourceTable:row.sourceTable,sourceRows:row.sourceRows,linkedPersonRows:row.linkedPersonRows})),productionImport:"HOLD"}));' "$raw" "$report" "$YUZHOU_TRAINING_REWARD_EVENTS_RUN_ID"
