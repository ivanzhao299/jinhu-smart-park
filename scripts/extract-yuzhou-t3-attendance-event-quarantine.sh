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

case "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" in
  *[!A-Za-z0-9._-]*|""|?|??|???|????) fail "invalid YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID" ;;
esac
printf %s "$YUZHOU_BACKUP_SHA256" | grep -Eq '^[0-9a-f]{64}$' || fail "invalid YUZHOU_BACKUP_SHA256"
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
  node - "$manifest" "$YUZHOU_BACKUP_SHA256" <<'NODE'
const fs=require("fs");
const [manifestPath,sourceSnapshotSha256]=process.argv.slice(2);
if(!/^[0-9a-f]{64}$/.test(sourceSnapshotSha256))throw Error("invalid source backup hash");
const manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));
if(manifest.sourceReadOnly!==true||manifest.productionImport!=="HOLD")throw Error("unsafe source attendance manifest");
manifest.sourceSnapshotSha256=sourceSnapshotSha256;
fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2).concat("\n"),{encoding:"utf8",mode:0o600});
fs.chmodSync(manifestPath,0o600);
NODE
}
trap finalize_manifest EXIT

node -e 'const fs=require("fs"),crypto=require("crypto");const [rawPath,rowsPath,manifestPath,runId]=process.argv.slice(1);const raw=JSON.parse(fs.readFileSync(rawPath,"utf8"));if(raw.sourceReadOnly!==1||!Array.isArray(raw.rows))throw Error("unsafe source attendance response");const sha256=value=>crypto.createHash("sha256").update(value).digest("hex");const identity=/^[0-9a-f]{64}$/;const rows=raw.rows.map(row=>{if(!identity.test(row.sourceIdentitySha256??"")||!identity.test(row.sourceRowSha256??"")||typeof row.sourcePersonLinked!=="boolean")throw Error("unsafe source attendance row");return {domain:"attendance_punch_event",sourceTable:"dbo.attrecord",sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,status:"quarantined",quarantineCode:row.sourcePersonLinked?"ATTENDANCE_PUNCH_TARGET_EMPLOYEE_MAPPING_REQUIRED":"ATTENDANCE_PUNCH_PERSON_UNMAPPED"};});if(new Set(rows.map(row=>row.sourceIdentitySha256)).size!==rows.length)throw Error("duplicate source attendance identity");const jsonl=rows.map(row=>JSON.stringify(row)).join(rows.length?"\n":"")+(rows.length?"\n":"");fs.writeFileSync(rowsPath,jsonl,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(rowsPath,0o600);const quarantineCodes=Object.fromEntries([...new Set(rows.map(row=>row.quarantineCode))].sort().map(code=>[code,rows.filter(row=>row.quarantineCode===code).length]));const manifest={formatVersion:1,artifactKind:"yuzhou_t3_attendance_punch_quarantine_stage",runId,operationMode:"read_only_hash_only_quarantine",sourceReadOnly:true,sourceTable:"dbo.attrecord",sourceRows:rows.length,eligibleRows:0,quarantinedRows:rows.length,quarantineCodes,sourceHashRowsSha256:sha256(fs.readFileSync(rawPath)),quarantineFileSha256:sha256(fs.readFileSync(rowsPath)),businessWriteTarget:"none",productionImport:"HOLD"};fs.writeFileSync(manifestPath,`${JSON.stringify(manifest,null,2)}\n`,{encoding:"utf8",mode:0o600,flag:"wx"});fs.chmodSync(manifestPath,0o600);console.log(JSON.stringify({status:"PASS",runId,sourceRows:manifest.sourceRows,eligibleRows:0,quarantinedRows:manifest.quarantinedRows,quarantineCodes,productionImport:"HOLD"}));' "$raw" "$rows" "$manifest" "$YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID"
