#!/usr/bin/env node
import { createHash, createHmac, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, resolve } from "node:path";

const fail = (code, detail) => { throw new Error(`${code}: ${detail}`); };
const privateServer = value => /^(?:(?:10\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}|172\.(?:1[6-9]|2[0-9]|3[01])\.\d{1,3})\.\d{1,3}|127\.0\.0\.1)(?:,\d{1,5})?$/.test(value);
const safePath = (path, label) => {
  if (!isAbsolute(path)) fail("DUAL_SOURCE_PATH_INVALID", `${label} must be absolute`);
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
  if ((statSync(dirname(target)).mode & 0o077) !== 0) fail("DUAL_SOURCE_PATH_INVALID", `${label} parent must be mode 0700`);
  try { if (lstatSync(target).isSymbolicLink()) fail("DUAL_SOURCE_PATH_INVALID", `${label} symlink is forbidden`); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  return target;
};
const atomicWrite = (path, content) => {
  const temp = resolve(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  try { const fd = openSync(temp, "wx", 0o600); writeFileSync(fd, content); chmodSync(temp, 0o600); renameSync(temp, path); }
  catch (error) { try { unlinkSync(temp); } catch {} throw error; }
};
const loadKey = path => {
  try {
    const stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) fail("DUAL_SOURCE_KEY_INVALID", "key must be a plain mode-0600 file");
    const key = readFileSync(path);
    if (key.length !== 32) fail("DUAL_SOURCE_KEY_INVALID", "key must contain exactly 32 bytes");
    return key;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const key = randomBytes(32);
    atomicWrite(path, key);
    return key;
  }
};
const runTsql = ({ server, database, user, password, version, sql }) => {
  if (!privateServer(server) || !/^[A-Za-z0-9_.-]{1,128}$/.test(database) || !user || !password || user.toLowerCase() === "sa") fail("DUAL_SOURCE_CREDENTIAL_INVALID", "private non-sa source credentials required");
  const [host, port = "1433"] = server.split(",");
  const result = spawnSync("tsql", ["-H", host, "-p", port, "-U", user], { input: `${password}\nuse [${database}]\ngo\n${sql}\ngo\nexit\n`, env: { ...process.env, TDSVER: version }, stdio: ["pipe", "pipe", "pipe"] });
  const raw = Buffer.concat([result.stdout ?? Buffer.alloc(0), result.stderr ?? Buffer.alloc(0)]).toString("latin1");
  if (result.status !== 0) fail("DUAL_SOURCE_SQL_FAILED", raw.replaceAll(password, "[REDACTED]").replaceAll(user, "[REDACTED]").replace(/\s+/g, " ").slice(0, 300));
  return raw;
};
const decodeHex = value => {
  if (value === "0x") return "";
  if (!/^0x(?:[a-fA-F0-9]{2})+$/.test(value)) fail("DUAL_SOURCE_ROW_PARSE_FAILED", "hex field");
  return Buffer.from(value.slice(2), "hex").toString("latin1");
};
const normalizeCode = value => value.trim().toUpperCase().replace(/[\s-]+/g, "");
const normalizeIdentity = value => value.trim().toUpperCase().replace(/[\s-]+/g, "");

try {
  if (process.env.ALLOW_YUZHOU_MIGRATION !== "yes") fail("DUAL_SOURCE_EXTRACT_NOT_ALLOWED", "set migration gate");
  const output = safePath(process.env.YUZHOU_RECONCILIATION_OUTPUT ?? "", "output");
  const keyPath = safePath(process.env.YUZHOU_RECONCILIATION_KEY_FILE ?? "", "key");
  const key = loadKey(keyPath);
  const hmac = (kind, value) => value ? createHmac("sha256", key).update(`${kind}\0${value}`).digest("hex") : null;
  const group = {
    server: process.env.YUZHOU_GROUP_WEB_SQLSERVER ?? "", database: process.env.YUZHOU_GROUP_WEB_DATABASE ?? "", user: process.env.YUZHOU_GROUP_WEB_ETL_LOGIN ?? "", password: process.env.YUZHOU_GROUP_WEB_ETL_PASSWORD ?? "", version: "7.0"
  };
  const client = {
    server: process.env.YUZHOU_CLIENT_SQLSERVER ?? "127.0.0.1,14333", database: process.env.YUZHOU_SQLSERVER_DATABASE ?? "", user: process.env.YUZHOU_SQLSERVER_ETL_LOGIN ?? "", password: process.env.YUZHOU_SQLSERVER_ETL_PASSWORD ?? "", version: "7.4"
  };
  const groupSql = "SET NOCOUNT ON; SELECT 'GEMP|'+CAST(nID AS varchar(30))+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),vEmployeeNumb)),'0x')+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),vNumber)),'0x')+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),vIDCard)),'0x')+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),DelFlag)),'0x')+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),isfire)),'0x') FROM Emp_tBasicInfo ORDER BY nID;";
  const clientSql = "SET NOCOUNT ON; SELECT 'CEMP|'+CAST(id AS varchar(30))+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),person)),'0x')+'|'+COALESCE(master.dbo.fn_varbintohexstr(CONVERT(varbinary(8000),idcard)),'0x') FROM dbo.person ORDER BY id;";
  const groupRaw = runTsql({ ...group, sql: groupSql });
  const clientRaw = runTsql({ ...client, sql: clientSql });
  const lines = (raw, prefix) => [...raw.matchAll(new RegExp(`${prefix}\\|[^\\r\\n]+`, "g"))].map(match => match[0].trim());
  const clientRows = lines(clientRaw, "CEMP").map(line => {
    const parts = line.split("|");
    if (parts.length !== 4 || !/^\d+$/.test(parts[1])) fail("DUAL_SOURCE_ROW_PARSE_FAILED", "client row");
    return { row: hmac("client-row", parts[1]), codes: [hmac("employee-code", normalizeCode(decodeHex(parts[2])))].filter(Boolean), identity: hmac("identity", normalizeIdentity(decodeHex(parts[3]))) };
  });
  const groupRows = lines(groupRaw, "GEMP").map(line => {
    const parts = line.split("|");
    if (parts.length !== 7 || !/^\d+$/.test(parts[1])) fail("DUAL_SOURCE_ROW_PARSE_FAILED", "group row");
    const codes = [parts[2], parts[3]].map(value => hmac("employee-code", normalizeCode(decodeHex(value)))).filter(Boolean);
    const flags = [decodeHex(parts[5]), decodeHex(parts[6])].map(value => value.trim());
    return { row: hmac("group-row", parts[1]), codes: [...new Set(codes)], identity: hmac("identity", normalizeIdentity(decodeHex(parts[4]))), active: flags.every(value => value === "" || value === "0") };
  });
  if (clientRows.length !== 2949 || groupRows.length !== 548) fail("DUAL_SOURCE_EMPLOYEE_COUNT_DRIFT", `${clientRows.length}/${groupRows.length}`);
  const codeMap = new Map();
  const identityMap = new Map();
  for (const row of clientRows) {
    for (const code of row.codes) { const set = codeMap.get(code) ?? new Set(); set.add(row.row); codeMap.set(code, set); }
    if (row.identity) { const set = identityMap.get(row.identity) ?? new Set(); set.add(row.row); identityMap.set(row.identity, set); }
  }
  let matchedByCode = 0, matchedByIdentity = 0, matchedByEither = 0, activeMatched = 0;
  const pending = [];
  for (const row of groupRows) {
    const codeTargets = new Set(row.codes.flatMap(code => [...(codeMap.get(code) ?? [])]));
    const identityTargets = new Set(row.identity ? [...(identityMap.get(row.identity) ?? [])] : []);
    if (codeTargets.size) matchedByCode += 1;
    if (identityTargets.size) matchedByIdentity += 1;
    const matched = codeTargets.size > 0 || identityTargets.size > 0;
    if (matched) matchedByEither += 1;
    if (row.active && matched) activeMatched += 1;
    if (row.active && !matched) pending.push({ sourceId: "yuzhou_group_web_enterprise_hr", sourceRowHmac: row.row, employeeCodePresent: row.codes.length > 0, identityPresent: Boolean(row.identity), reasonCode: "NO_CLIENT_IDENTITY_OR_CODE_MATCH", status: "pending_manual_review" });
  }
  const active = groupRows.filter(row => row.active).length;
  const summary = { clientEmployees: clientRows.length, groupWebEmployees: groupRows.length, groupWebActiveCandidates: active, matchedByEmployeeCode: matchedByCode, matchedByIdentityHash: matchedByIdentity, matchedByEither, unmatched: groupRows.length - matchedByEither, activeMatched, activePendingManualReview: pending.length };
  const expected = { clientEmployees: 2949, groupWebEmployees: 548, groupWebActiveCandidates: 134, matchedByEmployeeCode: 313, matchedByIdentityHash: 308, matchedByEither: 316, unmatched: 232, activeMatched: 19, activePendingManualReview: 115 };
  if (JSON.stringify(summary) !== JSON.stringify(expected)) fail("DUAL_SOURCE_RECONCILIATION_DRIFT", JSON.stringify(summary));
  const artifact = { formatVersion: 1, artifactKind: "yuzhou_hr_dual_source_employee_reconciliation", operationMode: "read_only_hmac", identityPolicy: ["identity_hash", "employee_code", "manual_review"], nameOnlyMatch: "forbidden", summary, pendingManualReview: pending.sort((a, b) => a.sourceRowHmac.localeCompare(b.sourceRowHmac, "en")), productionImport: "HOLD" };
  const content = `${JSON.stringify(artifact, null, 2)}\n`;
  atomicWrite(output, content);
  process.stdout.write(`${JSON.stringify({ ok: true, ...summary, artifactSha256: createHash("sha256").update(content).digest("hex"), secretValuesPrinted: false, productionImport: "HOLD" })}\n`);
} catch (error) {
  process.stderr.write(`${String(error.message).replace(/(password|secret|token)\s*[=:]\s*\S+/gi, "$1=[REDACTED]")}\n`);
  process.exitCode = 1;
}
