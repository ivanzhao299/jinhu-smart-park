#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";
import { verifyObservedGroupWebProfile } from "./legacy-dual-source-reconciliation-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const privateServer = value => /^(?:10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3})\.\d{1,3}(?:,\d{1,5})?$/.test(value);

function exactOutput(path) {
  if (!isAbsolute(path)) fail("GROUP_WEB_PROFILE_OUTPUT_INVALID", "output must be absolute");
  const output = resolve(path);
  mkdirSync(dirname(output), { recursive: true, mode: 0o700 });
  if ((statSync(dirname(output)).mode & 0o077) !== 0) fail("GROUP_WEB_PROFILE_OUTPUT_INVALID", "parent must be mode 0700");
  try { if (lstatSync(output).isSymbolicLink()) fail("GROUP_WEB_PROFILE_OUTPUT_INVALID", "symlink output is forbidden"); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return output;
}

try {
  const [server, database, user, password] = [process.env.YUZHOU_GROUP_WEB_SQLSERVER, process.env.YUZHOU_GROUP_WEB_DATABASE, process.env.YUZHOU_GROUP_WEB_ETL_LOGIN, process.env.YUZHOU_GROUP_WEB_ETL_PASSWORD];
  if (!privateServer(server ?? "") || !/^[A-Za-z0-9_.-]{1,128}$/.test(database ?? "") || !user || !password || user.toLowerCase() === "sa") fail("GROUP_WEB_PROFILE_CREDENTIAL_INVALID", "complete private-server non-sa credentials are required");
  const output = exactOutput(process.env.YUZHOU_GROUP_WEB_PROFILE_OUTPUT ?? "");
  const sql = readFileSync(resolve(root, "scripts/hr-cutover/sql/profile-group-web-source.sql"), "utf8");
  const [host, port = "1433"] = server.split(",");
  const result = spawnSync("tsql", ["-H", host, "-p", port, "-U", user], { input: `${password}\nuse [${database}]\ngo\n${sql}\ngo\nexit\n`, env: { ...process.env, TDSVER: "7.0" }, stdio: ["pipe", "pipe", "pipe"] });
  const raw = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString("latin1");
  if (result.status !== 0) fail("GROUP_WEB_PROFILE_SQL_FAILED", raw.replaceAll(password, "[REDACTED]").replaceAll(user, "[REDACTED]").replace(/\s+/g, " ").slice(0, 300));
  const marker = name => [...raw.matchAll(new RegExp(`${name}\\|[^\\r\\n]+`, "g"))].map(match => match[0].trim());
  const auth = marker("AUTH");
  if (auth.length !== 1 || auth[0] !== "AUTH|0|1|1|0|0|0|0") fail("GROUP_WEB_PROFILE_AUTHORITY_INVALID", auth.length === 1 ? auth[0] : `markers=${auth.length}`);
  const catalogRows = marker("CATALOG");
  if (catalogRows.length !== 1) fail("GROUP_WEB_PROFILE_PARSE_FAILED", `catalog markers=${catalogRows.length}`);
  const catalogValues = catalogRows[0].split("|").slice(1).map(Number);
  if (catalogValues.length !== 8 || catalogValues.some(value => !Number.isSafeInteger(value) || value < 0)) fail("GROUP_WEB_PROFILE_PARSE_FAILED", "catalog values");
  const [tables, fields, nonemptyTables, rows, views, procedures, functions, triggers] = catalogValues;
  const rollup = marker("ROLLUP").map(line => { const [, prefix, tableCount, rowCount] = line.split("|"); return { prefix, tables: Number(tableCount), rows: Number(rowCount) }; });
  const keyTableCounts = marker("KEY").map(line => { const [, table, rowCount] = line.split("|"); return { table, rows: Number(rowCount) }; });
  const profile = { formatVersion: 1, profileKind: "yuzhou_hr_legacy_group_web_observed_profile", operationMode: "read_only", catalog: { tables, fields, nonemptyTables, rows, views, procedures, functions, triggers }, rollup, keyTableCounts };
  const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-dual-source-reconciliation-v1.json"), "utf8"));
  const report = verifyObservedGroupWebProfile(profile, contract);
  const temp = resolve(dirname(output), `.${basename(output)}.${process.pid}.tmp`);
  try {
    const fd = openSync(temp, "wx", 0o600);
    writeFileSync(fd, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    chmodSync(temp, 0o600);
    renameSync(temp, output);
  } catch (error) { try { unlinkSync(temp); } catch {} throw error; }
  process.stdout.write(`${JSON.stringify({ ...report, outputFile: basename(output), secretValuesPrinted: false })}\n`);
} catch (error) {
  process.stderr.write(`${String(error.message).replace(/(password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")}\n`);
  process.exitCode = 1;
}
