#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { chmodSync, lstatSync, mkdirSync, openSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const literal = value => `N'${String(value).replaceAll("'", "''")}'`;
const identifier = value => `[${value}]`;
const privateServer = value => /^(?:10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3})\.\d{1,3}(?:,\d{1,5})?$/.test(value);
const shellQuote = value => `'${String(value).replaceAll("'", `'"'"'`)}'`;

function runTsql({ server, user, password, database, sql }) {
  const result = spawnSync("tsql", ["-H", server.split(",")[0], "-p", server.includes(",") ? server.split(",")[1] : "1433", "-U", user], {
    input: `${password}\nuse ${identifier(database)}\ngo\n${sql}\ngo\nexit\n`,
    env: { ...process.env, TDSVER: "7.0" },
    stdio: ["pipe", "pipe", "pipe"]
  });
  const output = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString("latin1");
  if (result.status !== 0) fail("GROUP_WEB_ETL_SQL_FAILED", output.replaceAll(password, "[REDACTED]").replaceAll(user, "[REDACTED]").replace(/\s+/g, " ").slice(0, 300));
  return output;
}

function safeOutput(path) {
  if (!isAbsolute(path)) fail("GROUP_WEB_ETL_OUTPUT_INVALID", "output must be absolute");
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  if ((statSync(dirname(target)).mode & 0o077) !== 0) fail("GROUP_WEB_ETL_OUTPUT_INVALID", "parent must be mode 0700");
  try { if (lstatSync(target).isSymbolicLink()) fail("GROUP_WEB_ETL_OUTPUT_INVALID", "symlink output is forbidden"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return target;
}

let cleanupContext = null;
try {
  if (process.env.ALLOW_YUZHOU_LEGACY_ACCOUNT_PROVISION !== "yes") fail("GROUP_WEB_ETL_PROVISION_NOT_ALLOWED", "set explicit provision gate");
  const server = process.env.YUZHOU_GROUP_WEB_ADMIN_SERVER ?? "";
  const database = process.env.YUZHOU_GROUP_WEB_ADMIN_DATABASE ?? "";
  const adminUser = process.env.YUZHOU_GROUP_WEB_ADMIN_LOGIN ?? "";
  const adminPassword = process.env.YUZHOU_GROUP_WEB_ADMIN_PASSWORD ?? "";
  const output = safeOutput(process.env.YUZHOU_GROUP_WEB_ETL_OUTPUT ?? "");
  if (!privateServer(server) || !/^[A-Za-z0-9_.-]{1,128}$/.test(database) || !adminUser || !adminPassword) fail("GROUP_WEB_ETL_ADMIN_INPUT_INVALID", "private server and complete admin authority are required");
  const suffix = `${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${randomBytes(4).toString("hex")}`;
  const login = `jinhu_yzgw_etl_${suffix}`;
  const password = `${randomBytes(24).toString("base64url")}!aA7`;
  const loginId = identifier(login);
  const databaseId = identifier(database);
  const provisionSql = `
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)<>1 RAISERROR('ADMIN_NOT_SYSADMIN',16,1);
IF SUSER_ID(${literal(login)}) IS NOT NULL RAISERROR('ETL_LOGIN_ALREADY_EXISTS',16,1);
BEGIN TRANSACTION;
CREATE LOGIN ${loginId} WITH PASSWORD=${literal(password)}, CHECK_POLICY=OFF;
USE ${databaseId};
CREATE USER ${loginId} FOR LOGIN ${loginId};
EXEC sp_addrolemember N'db_datareader', ${literal(login)};
GRANT SELECT TO ${loginId};
GRANT VIEW DEFINITION TO ${loginId};
DENY INSERT, UPDATE, DELETE, EXECUTE TO ${loginId};
COMMIT TRANSACTION;`;
  runTsql({ server, user: adminUser, password: adminPassword, database, sql: provisionSql });
  cleanupContext = { server, database, adminUser, adminPassword, login, loginId };
  const verification = runTsql({
    server, user: login, password, database,
    sql: "set nocount on; select cast(coalesce(IS_SRVROLEMEMBER('sysadmin'),0) as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','SELECT') as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT') as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE') as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE') as varchar(1))+'|'+cast(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE') as varchar(1));"
  });
  const authority = verification.match(/([01](?:\|[01]){6})/)?.[1] ?? "missing";
  if (authority !== "0|1|1|0|0|0|0") {
    try {
      runTsql({
        server, user: adminUser, password: adminPassword, database,
        sql: `IF USER_ID(${literal(login)}) IS NOT NULL EXEC(N'DROP USER ${loginId}'); USE [master]; IF SUSER_ID(${literal(login)}) IS NOT NULL DROP LOGIN ${loginId};`
      });
      cleanupContext = null;
    } catch {}
    fail("GROUP_WEB_ETL_AUTHORITY_INVALID", `new login authority=${authority}; failed account cleanup attempted`);
  }
  const content = [
    `YUZHOU_GROUP_WEB_SQLSERVER=${shellQuote(server)}`,
    `YUZHOU_GROUP_WEB_DATABASE=${shellQuote(database)}`,
    `YUZHOU_GROUP_WEB_ETL_LOGIN=${shellQuote(login)}`,
    `YUZHOU_GROUP_WEB_ETL_PASSWORD=${shellQuote(password)}`,
    ""
  ].join("\n");
  const temp = resolve(dirname(output), `.${basename(output)}.${process.pid}.tmp`);
  try {
    const fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, content, "utf8");
    chmodSync(temp, 0o600);
    renameSync(temp, output);
    cleanupContext = null;
  } catch (error) {
    try { unlinkSync(temp); } catch {}
    throw error;
  }
  process.stdout.write(`${JSON.stringify({ ok: true, credentialFile: basename(output), authority: "select_view_definition_only", secretValuesPrinted: false })}\n`);
} catch (error) {
  if (cleanupContext) {
    const { server, database, adminUser, adminPassword, login, loginId } = cleanupContext;
    try {
      runTsql({ server, user: adminUser, password: adminPassword, database, sql: `IF USER_ID(${literal(login)}) IS NOT NULL EXEC(N'DROP USER ${loginId}'); USE [master]; IF SUSER_ID(${literal(login)}) IS NOT NULL DROP LOGIN ${loginId};` });
    } catch {}
  }
  process.stderr.write(`${String(error.message).replace(/(password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")}\n`);
  process.exitCode = 1;
}
