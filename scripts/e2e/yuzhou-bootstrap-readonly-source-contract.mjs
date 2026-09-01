#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const source = readFileSync(resolve(root, "scripts/bootstrap-yuzhou-readonly-source.sh"), "utf8");
for (const value of [
  "set -eu", "umask 077", "RESTORE VERIFYONLY", "CREATE LOGIN", "CREATE USER", "db_datareader", "GRANT VIEW DEFINITION",
  "DENY INSERT", "DENY UPDATE", "DENY DELETE", "DENY EXECUTE", "SET READ_ONLY", "SOURCE_BOOTSTRAP_RESTORE_READY",
  "source-restore-receipt.mjs", "chmod 600", "chmod 700", "stty -echo", "ADMIN_LOGIN=sa", "validate_sql_password", "SOURCE_BOOTSTRAP_ADMIN_PASSWORD_WEAK", "SOURCE_BOOTSTRAP_ETL_PASSWORD_WEAK", "safe_bootstrap_status", "safe_sql_error_number", "SOURCE_BOOTSTRAP_RESTORE_SQL_ERROR_", "SOURCE_BOOTSTRAP_ADMIN_AUTH_READY", "SOURCE_BOOTSTRAP_BACKUP_VERIFIED", "SOURCE_BOOTSTRAP_DATABASE_RESTORED", "SOURCE_BOOTSTRAP_DATABASE_EXISTS", "SOURCE_BOOTSTRAP_LOGIN_EXISTS", "SOURCE_BOOTSTRAP_ETL_PROVISIONED", "SOURCE_BOOTSTRAP_ETL_LOGIN_CREATED", "SOURCE_BOOTSTRAP_FILELIST_EMPTY", "EXEC sys.sp_executesql @restore", "printf '%s\\nGO\\n'", "-d master", "YUZHOU_SQLSERVER_RESUME", "SOURCE_BOOTSTRAP_RESUME_CONTAINER_UNHEALTHY", "输入当前隔离 SQL Server 管理员密码（不会重设）", "--env-file", "docker volume create", "docker run -d", "--health-cmd", "--health-start-period=30s", "SOURCE_BOOTSTRAP_COMPLETE productionImport=HOLD"
]) assert.match(source, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
assert.doesNotMatch(source, /SET READ_WRITE/);
assert.doesNotMatch(source, /MSSQL_SA_PASSWORD=\$ADMIN_PASSWORD/);
assert.doesNotMatch(source, /echo \"\$ADMIN_PASSWORD\"|echo \"\$ETL_PASSWORD\"/);
assert.match(source, /INSERT INTO #files EXEC\(N'RESTORE FILELISTONLY FROM DISK=N''\$CONTAINER_BACKUP'' WITH FILE=1'\)/);
assert.doesNotMatch(source, /INSERT INTO #files EXEC\(N'RESTORE FILELISTONLY FROM DISK=N''''\$CONTAINER_BACKUP''''/);
assert.match(source, /printf '%s' "\$label" >&2/);
assert.match(source, /--etl-env "\$ETL_ENV"[\s\S]*--receipt "\$RECEIPT"/);
console.log("Yuzhou readonly source bootstrap contract passed.");
