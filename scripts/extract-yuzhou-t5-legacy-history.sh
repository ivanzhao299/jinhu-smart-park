#!/usr/bin/env sh
set -eu
umask 077
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
RUN_ID="${YUZHOU_MIGRATION_RUN_ID:-}"
DATABASE="${YUZHOU_SQLSERVER_DATABASE:-YuzhouHR_Lab_20260820_intake01}"
CONTAINER="${YUZHOU_SQLSERVER_CONTAINER:-jinhu_yuzhou_migration_lab-sqlserver-1}"
CREDENTIAL_FILE="${YUZHOU_ETL_CREDENTIAL_FILE:-$ROOT_DIR/database/import-reports/yuzhou-hr/20260820_intake01-etl.env}"
BACKUP_FILE="${YUZHOU_SOURCE_BACKUP_FILE:-$ROOT_DIR/database/backups/yuzhou-hr/hr2026081914.dbk}"
SOURCE_RESTORE_RECEIPT_PATH="${YUZHOU_SOURCE_RESTORE_RECEIPT_PATH:-}"
MATERIALIZATION_KEY_FILE="${YUZHOU_PARTY_DATA_KEY_FILE:-}"
OUTPUT_ROOT="${YUZHOU_STAGING_ROOT:-$ROOT_DIR/database/import-reports/yuzhou-hr}"
fail(){ printf 'ERROR: %s\n' "$1" >&2; exit 1; }
[ "${ALLOW_YUZHOU_MIGRATION:-no}" = yes ] || fail "set ALLOW_YUZHOU_MIGRATION=yes"
printf %s "$RUN_ID" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$' || fail "invalid run id"
[ -f "$CREDENTIAL_FILE" ] || fail "read-only ETL credential file is missing"
[ "$(stat -f '%Lp' "$CREDENTIAL_FILE" 2>/dev/null || stat -c '%a' "$CREDENTIAL_FILE")" = 600 ] || fail "credential file must be mode 0600"
[ -f "$BACKUP_FILE" ] || fail "pinned SQL Server source backup is missing"
[ -n "$SOURCE_RESTORE_RECEIPT_PATH" ] && [ -f "$SOURCE_RESTORE_RECEIPT_PATH" ] || fail "YUZHOU_SOURCE_RESTORE_RECEIPT_PATH is required"
if [ -n "$MATERIALIZATION_KEY_FILE" ]; then
  [ "${MATERIALIZATION_KEY_FILE#/}" != "$MATERIALIZATION_KEY_FILE" ] || fail "materialization key file must be an absolute path"
  node "$ROOT_DIR/scripts/hr-cutover/materialization-key-contract.mjs" verify "$MATERIALIZATION_KEY_FILE" || fail "materialization key contract rejected the file"
fi
[ -n "$MATERIALIZATION_KEY_FILE" ] || fail "protected materialization key file is required"
node "$ROOT_DIR/scripts/hr-cutover/verify-source-restore-binding.mjs" --receipt "$SOURCE_RESTORE_RECEIPT_PATH" --backup "$BACKUP_FILE" --container "$CONTAINER" --database "$DATABASE" --etl-env "$CREDENTIAL_FILE" >/dev/null
. "$CREDENTIAL_FILE"
[ "$(printf %s "$YUZHOU_SQLSERVER_ETL_LOGIN" | tr '[:upper:]' '[:lower:]')" != sa ] || fail "sa is forbidden for extraction"
[ "$YUZHOU_SQLSERVER_DATABASE" = "$DATABASE" ] || fail "credential database mismatch"
[ "$(docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$CONTAINER" 2>/dev/null || true)" = jinhu_yuzhou_migration_lab ] || fail "container is not the migration lab"
ro="$(docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -h -1 -W -Q "SET NOCOUNT ON; SELECT CONVERT(int,is_read_only) FROM sys.databases WHERE name=DB_NAME();"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" | tr -d '[:space:]')"
[ "$ro" = 1 ] || fail "source database is not read-only"
sysadmin="$(docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -h -1 -W -Q "SET NOCOUNT ON; SELECT COALESCE(IS_SRVROLEMEMBER('"'"'sysadmin'"'"'),0);"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" | tr -d '[:space:]')"
[ "$sysadmin" = 0 ] || fail "sysadmin login is forbidden for extraction"
OUT="$OUTPUT_ROOT/staging-$RUN_ID"
[ ! -e "$OUT" ] || fail "staging run already exists"
mkdir -p "$OUT"; chmod 700 "$OUT"
query(){
  name="$1"; sql="$2"; raw="$OUT/.$name.sqlcmd"; err="$OUT/.$name.stderr"
  if ! docker exec -e ETL_PASSWORD="$YUZHOU_SQLSERVER_ETL_PASSWORD" "$CONTAINER" bash -lc '/opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -P "$ETL_PASSWORD" -d "$2" -y 0 -w 65535 -Q "$3"' q "$YUZHOU_SQLSERVER_ETL_LOGIN" "$DATABASE" "$sql" >"$raw" 2>"$err"; then
    rm -f "$raw" "$err"
    fail "SQL query failed for $name"
  fi
  rm -f "$err"
  tr -d '\r\n' <"$raw" >"$OUT/$name"; rm -f "$raw"
  [ -s "$OUT/$name" ] || printf '[]' >"$OUT/$name"
  if ! node -e 'try{const value=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!Array.isArray(value))process.exit(1)}catch{process.exit(1)}' "$OUT/$name"; then
    rm -f "$OUT/$name"
    fail "invalid JSON array for $name"
  fi
  chmod 600 "$OUT/$name"
}
query catalog.raw.json "SET NOCOUNT ON; SELECT s.name [schema],t.name [table],p.rows [rows],JSON_QUERY((SELECT c.column_id,c.name,ty.name [type],c.max_length,c.is_nullable FROM sys.columns c JOIN sys.types ty ON ty.user_type_id=c.user_type_id WHERE c.object_id=t.object_id ORDER BY c.column_id FOR JSON PATH,INCLUDE_NULL_VALUES)) columns FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN(0,1) WHERE t.name IN ('accept','family','his','knowhow','ticket','person','person_user','person_user_item','readjust','readjustitem','jobstatecode','compact','compact_c','compacttypecode','docs','course','train','trainhis','jobtrain','bonuscode','bonusrecord','jch_1') ORDER BY t.name FOR JSON PATH,INCLUDE_NULL_VALUES;"
query accept.raw.json "SET NOCOUNT ON; SELECT id,person,name,sex,CONVERT(varchar(33),birthday,126) birthday,age,edu,speciality,graduatescholl,CONVERT(varchar(33),graduatedate,126) graduatedate,marital,race,idcard,oldaddr,addr,tel,handtel,email,department,job,heathy,CONVERT(varchar(40),nowpay) nowpay,CONVERT(varchar(40),needpay) needpay,english,comethough,family,relation,trainrecord,foraccept,bonusrecord,aboutperson,memo,releaseid,isbackupperson,CONVERT(varchar(40),hearttest) hearttest,heartmemo,CONVERT(varchar(40),knowledgetest) knowledgetest,knowledgememo,CONVERT(varchar(40),jobtest) jobtest,jobmemo,CONVERT(varchar(40),assignmenttest) assignmenttest,assignmentmemo,CONVERT(varchar(40),knowhowtest) knowhowtest,knowhowmemo,CONVERT(varchar(40),facetest) facetest,facememo,CONVERT(varchar(40),totaltest) totaltest,totaltestmemo,release,isemploy,height,weight FROM dbo.accept ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query family.raw.json "SET NOCOUNT ON; SELECT id,person,member,rela,CONVERT(varchar(33),birthday,126) birthday,jobunit,jobname,political,tel FROM dbo.family ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query his.raw.json "SET NOCOUNT ON; SELECT id,tableid,rowid,colid,vv FROM dbo.his ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query knowhow.raw.json "SET NOCOUNT ON; SELECT id,person,knowhow,grade,memo FROM dbo.knowhow ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query ticket.raw.json "SET NOCOUNT ON; SELECT id,person,ticket,ticketno,tickettype,CONVERT(varchar(33),getdate,126) getdate,CONVERT(varchar(33),validdate,126) validdate,ticketfilename,memo,org FROM dbo.ticket ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query person_core.raw.json "SET QUOTED_IDENTIFIER ON; SET NOCOUNT ON; DECLARE @cols nvarchar(max),@sql nvarchar(max); SELECT @cols=STUFF((SELECT ','+QUOTENAME(c.name) FROM sys.columns c WHERE c.object_id=OBJECT_ID('dbo.person') AND c.name NOT IN('password','photo') ORDER BY c.column_id FOR XML PATH(''),TYPE).value('.','nvarchar(max)'),1,1,''); SET @sql=N'SELECT '+@cols+N' FROM dbo.person ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES'; EXEC sys.sp_executesql @sql;"
query person_user.raw.json "SET NOCOUNT ON; SELECT person,A00007,A00008,A00014,A00015,A00016,A00017,A00018,A00019 FROM dbo.person_user ORDER BY person FOR JSON PATH,INCLUDE_NULL_VALUES;"
query person_user_item.raw.json "SET NOCOUNT ON; SELECT id,itemname,description,type,width,declen,myorder FROM dbo.person_user_item ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query readjust.raw.json "SET NOCOUNT ON; SELECT id,no,readjusttype,CONVERT(varchar(33),readjustdate,126) readjustdate,person,name,department,job,olddepartment,oldjob,oldpay,pay,CONVERT(varchar(40),oldgradepay) oldgradepay,CONVERT(varchar(40),gradepay) gradepay,CONVERT(varchar(40),oldbaseepay) oldbaseepay,CONVERT(varchar(40),baseepay) baseepay,CONVERT(varchar(40),oldjobpay) oldjobpay,CONVERT(varchar(40),jobpay) jobpay,CONVERT(varchar(33),pausetodate,126) pausetodate,awaytype,readjustitem,cause,CONVERT(varchar(33),recdate,126) recdate,operator,jobstate,state,username,approve,departmentflag,jobflag,payflag,otherflag FROM dbo.readjust ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query readjustitem.raw.json "SET NOCOUNT ON; SELECT readjustitem,id FROM dbo.readjustitem ORDER BY id,readjustitem FOR JSON PATH,INCLUDE_NULL_VALUES;"
query jobstatecode.raw.json "SET NOCOUNT ON; SELECT jobstate,jobstatename,myorder,isuse,defcount FROM dbo.jobstatecode ORDER BY jobstate FOR JSON PATH,INCLUDE_NULL_VALUES;"
query compact.raw.json "SET NOCOUNT ON; SELECT compact,compacttype,person,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,CONVERT(varchar(33),lastenddate,126) lastenddate,compacttime,totalcompacttime,testtime,CONVERT(varchar(40),testpay) testpay,CONVERT(varchar(40),basepay) basepay,state,memo,compactfile,compacttext,continuetimes,continueyears,CONVERT(varchar(40),zyfxj) zyfxj,CONVERT(varchar(33),jddate,126) jddate,CONVERT(varchar(33),testenddate,126) testenddate,jyxzxy,bmxy,pxfwxy FROM dbo.compact ORDER BY compact FOR JSON PATH,INCLUDE_NULL_VALUES;"
query compact_c.raw.json "SET NOCOUNT ON; SELECT compact,person,compacttime,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,CONVERT(varchar(33),cjddate,126) cjddate FROM dbo.compact_c ORDER BY compact,startdate,enddate,cjddate,person FOR JSON PATH,INCLUDE_NULL_VALUES;"
query compacttypecode.raw.json "SET NOCOUNT ON; SELECT compacttype,myorder FROM dbo.compacttypecode ORDER BY compacttype FOR JSON PATH,INCLUDE_NULL_VALUES;"
query photo.raw.json "SET NOCOUNT ON; SELECT id,person,photofile,photosize,CONVERT(varchar(130),HASHBYTES('SHA2_256',CONVERT(varbinary(max),photo)),2) contentSha256,DATALENGTH(photo) actualSize,CONVERT(varchar(64),SUBSTRING(CONVERT(varbinary(max),photo),1,16),2) magicPrefix FROM dbo.person ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query docs.raw.json "SET NOCOUNT ON; SELECT id,fName,fSize,FType,FPath,CONVERT(varchar(33),Cdate,126) Cdate,DocType,DelFlag,lb,pkid,CONVERT(varchar(130),HASHBYTES('SHA2_256',CONVERT(varbinary(max),Cont)),2) contentSha256,DATALENGTH(Cont) actualSize,CONVERT(varchar(64),SUBSTRING(CONVERT(varbinary(max),Cont),1,16),2) magicPrefix FROM dbo.docs ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query course.raw.json "SET NOCOUNT ON; SELECT course,courseid,coursename,department,inorout,persons,personcount,realpersoncount,classtype,author,terchar,tercharunit,hours,CONVERT(varchar(40),money) money,CONVERT(varchar(40),realmoney) realmoney,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,CONVERT(varchar(33),realstartdate,126) realstartdate,CONVERT(varchar(33),realenddate,126) realenddate,operator,CONVERT(varchar(33),recdate,126) recdate,memo,state FROM dbo.course ORDER BY course FOR JSON PATH,INCLUDE_NULL_VALUES;"
query train.raw.json "SET NOCOUNT ON; SELECT id,course,personid,person,hours,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,CONVERT(varchar(40),attainment) attainment,test,CONVERT(varchar(40),trainmoney) trainmoney,memo,coursename FROM dbo.train ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query trainhis.raw.json "SET NOCOUNT ON; SELECT id,person,organ,coursename,CONVERT(varchar(33),startdate,126) startdate,CONVERT(varchar(33),enddate,126) enddate,hours,CONVERT(varchar(40),attainment) attainment,test,CONVERT(varchar(40),trainmoney) trainmoney,memo FROM dbo.trainhis ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query jobtrain.raw.json "SET NOCOUNT ON; SELECT id,job,coursename FROM dbo.jobtrain ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query bonuscode.raw.json "SET NOCOUNT ON; SELECT bonus,bonusname,CONVERT(varchar(40),addsub) addsub,CONVERT(varchar(40),bonuspay) bonuspay,bonustype FROM dbo.bonuscode ORDER BY bonus FOR JSON PATH,INCLUDE_NULL_VALUES;"
query bonusrecord.raw.json "SET NOCOUNT ON; SELECT id,person,CONVERT(varchar(33),bonusdate,126) bonusdate,bonus,bonusunit,times,postperson,CONVERT(varchar(33),eventdate,126) eventdate,cause,CONVERT(varchar(40),addsub) addsub,CONVERT(varchar(40),bonuspay) bonuspay FROM dbo.bonusrecord ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
query jch_1.raw.json "SET NOCOUNT ON; SELECT CAST(NULL AS int) id WHERE 1=0 ORDER BY id FOR JSON PATH,INCLUDE_NULL_VALUES;"
node "$ROOT_DIR/scripts/transform-yuzhou-t5-legacy-history.mjs" "$OUT"
for raw_file in "$OUT"/*.raw.json; do
  [ -e "$raw_file" ] || continue
  # The catalog contains schema-only metadata that the loader recomputes as
  # part of the T5 manifest contract. All row-value extracts are discarded;
  # retaining this one non-sensitive source definition is required to verify
  # the staged business hash before any target write.
  [ "$raw_file" = "$OUT/catalog.raw.json" ] && continue
  rm -f "$raw_file"
done
if find "$OUT" -maxdepth 1 -type f -name '*.raw.json' ! -name 'catalog.raw.json' | grep -q .; then
  fail "raw T5 source artifacts were not removed"
fi
printf 'YUZHOU_T5_EXTRACT_OK run_id=%s output=%s\n' "$RUN_ID" "$OUT"
