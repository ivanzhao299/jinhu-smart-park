#!/usr/bin/env node
/* global Buffer, process */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync
} from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[0-9a-f]{64}$/u;
const DATABASE = /^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u;
const CONTAINER = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u;
const CONTAINER_COPY = /^\/var\/opt\/mssql\/backup\/[A-Za-z0-9][A-Za-z0-9._-]{5,96}\.bak$/u;
const PROJECT = "jinhu_yuzhou_migration_lab";
const BODY_KEYS = ["formatVersion", "artifactKind", "sourceSnapshotSha256", "backup", "identities", "state", "etlAuthority", "productionImport"];

export class SourceRestoreReceiptError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "SourceRestoreReceiptError"; this.code = code; }
}
const fail = (code, detail) => { throw new SourceRestoreReceiptError(code, detail); };
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code, label);
};
const requireSha = (value, code, label) => { if (!SHA256.test(value ?? "")) fail(code, label); };
const fileMode = path => statSync(path).mode & 0o777;

function privateFile(path, label) {
  if (typeof path !== "string" || !isAbsolute(path) || resolve(path) !== path) fail("SOURCE_RECEIPT_FILE_UNSAFE", label);
  let link, actual, info;
  try { link = lstatSync(path); actual = realpathSync(path); info = statSync(actual); }
  catch { fail("SOURCE_RECEIPT_FILE_UNSAFE", `${label}:missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || fileMode(actual) !== 0o600) fail("SOURCE_RECEIPT_FILE_UNSAFE", label);
  return actual;
}

export function hashFile(path) {
  const hash = createHash("sha256"), descriptor = openSync(path, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  let bytes = 0;
  try {
    for (let count = readSync(descriptor, buffer, 0, buffer.length, null); count > 0; count = readSync(descriptor, buffer, 0, buffer.length, null)) {
      hash.update(buffer.subarray(0, count)); bytes += count;
    }
  } finally { closeSync(descriptor); }
  return { sha256: hash.digest("hex"), bytes };
}

export function sourceRestoreReceiptFileHash(path) {
  const receiptPath = privateFile(realpathSync(path), "source restore receipt");
  return hashFile(receiptPath).sha256;
}

export function sourceBackupFileHash(path) {
  const backupPath = privateFile(realpathSync(path), "source backup");
  return hashFile(backupPath).sha256;
}

function validateAuthority(authority) {
  exactKeys(authority, ["loginSucceeded", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"], "SOURCE_ETL_AUTHORITY_INVALID", "authority shape");
  if (authority.loginSucceeded !== true) fail("SOURCE_ETL_LOGIN_FAILED", "minimum ETL login did not authenticate");
  if (authority.sysadmin !== false || authority.dbDatareader !== true || authority.viewDefinition !== true
    || authority.insert !== false || authority.update !== false || authority.delete !== false || authority.execute !== false) fail("SOURCE_ETL_AUTHORITY_INVALID", "minimum read-only ETL authority required");
}

function validateLive(live) {
  exactKeys(live, ["containerIdentity", "imageIdentity", "databaseIdentity", "restoreIdentity", "catalogIdentity", "project", "healthy", "online", "readOnly", "etlAuthority"], "SOURCE_RUNTIME_IDENTITY_INVALID", "live probe shape");
  for (const field of ["containerIdentity", "imageIdentity", "databaseIdentity", "restoreIdentity", "catalogIdentity"]) if (typeof live[field] !== "string" || !live[field]) fail("SOURCE_RUNTIME_IDENTITY_INVALID", field);
  if (live.project !== PROJECT || live.healthy !== true) fail("SOURCE_RUNTIME_IDENTITY_INVALID", "isolated source container boundary");
  if (live.online !== true) fail("SOURCE_DATABASE_NOT_ONLINE", "source database must be ONLINE");
  if (live.readOnly !== true) fail("SOURCE_DATABASE_NOT_READ_ONLY", "source database must be READ_ONLY");
  validateAuthority(live.etlAuthority);
  return {
    identities: {
      containerSha256: digest(live.containerIdentity), imageSha256: digest(live.imageIdentity), databaseSha256: digest(live.databaseIdentity),
      restoreSha256: digest(live.restoreIdentity), catalogSha256: digest(live.catalogIdentity)
    },
    state: { online: true, readOnly: true }, etlAuthority: structuredClone(live.etlAuthority)
  };
}

export function sealSourceRestoreReceipt(input) {
  const body = structuredClone(input);
  exactKeys(body, BODY_KEYS, "SOURCE_RECEIPT_INVALID", "receipt body shape");
  if (body.formatVersion !== 1 || body.artifactKind !== "yuzhou_hr_source_restore_receipt" || body.productionImport !== "HOLD") fail("SOURCE_RECEIPT_INVALID", "receipt identity or HOLD boundary");
  requireSha(body.sourceSnapshotSha256, "SOURCE_RECEIPT_INVALID", "source snapshot");
  exactKeys(body.backup, ["sha256", "bytes", "containerCopySha256", "containerCopyBytes"], "SOURCE_RECEIPT_INVALID", "backup shape");
  requireSha(body.backup.sha256, "SOURCE_RECEIPT_INVALID", "backup hash"); requireSha(body.backup.containerCopySha256, "SOURCE_RECEIPT_INVALID", "container copy hash");
  if (!Number.isSafeInteger(body.backup.bytes) || body.backup.bytes < 1 || !Number.isSafeInteger(body.backup.containerCopyBytes) || body.backup.containerCopyBytes < 1) fail("SOURCE_RECEIPT_INVALID", "backup byte counts");
  if (body.backup.sha256 !== body.sourceSnapshotSha256 || body.backup.containerCopySha256 !== body.backup.sha256 || body.backup.containerCopyBytes !== body.backup.bytes) fail("SOURCE_CONTAINER_COPY_DRIFT", "backup and container copy differ");
  exactKeys(body.identities, ["containerSha256", "imageSha256", "databaseSha256", "restoreSha256", "catalogSha256"], "SOURCE_RECEIPT_INVALID", "identity shape");
  for (const [field, value] of Object.entries(body.identities)) requireSha(value, "SOURCE_RECEIPT_INVALID", field);
  exactKeys(body.state, ["online", "readOnly"], "SOURCE_RECEIPT_INVALID", "state shape");
  if (body.state.online !== true) fail("SOURCE_DATABASE_NOT_ONLINE", "receipt state");
  if (body.state.readOnly !== true) fail("SOURCE_DATABASE_NOT_READ_ONLY", "receipt state");
  validateAuthority(body.etlAuthority);
  return { ...body, canonicalSha256: digest(canonical(body)) };
}

export function validateSourceRestoreReceipt(receipt) {
  exactKeys(receipt, [...BODY_KEYS, "canonicalSha256"], "SOURCE_RECEIPT_INVALID", "sealed receipt shape");
  const { canonicalSha256, ...body } = receipt, sealed = sealSourceRestoreReceipt(body);
  if (canonicalSha256 !== sealed.canonicalSha256) fail("SOURCE_RECEIPT_HASH_MISMATCH", "canonical receipt hash");
  return receipt;
}

function parseEnv(path) {
  const result = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("SOURCE_ETL_LOGIN_FAILED", "ETL credential file is invalid");
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  if (!result.YUZHOU_SQLSERVER_ETL_LOGIN || !result.YUZHOU_SQLSERVER_ETL_PASSWORD || !DATABASE.test(result.YUZHOU_SQLSERVER_DATABASE ?? "")
    || String(result.YUZHOU_SQLSERVER_ETL_LOGIN).toLowerCase() === "sa") fail("SOURCE_ETL_LOGIN_FAILED", "minimum ETL credential is unavailable");
  return result;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"], input: options.input, maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) fail(options.code ?? "SOURCE_RUNTIME_PROBE_FAILED", options.detail ?? "isolated source probe failed");
  return String(result.stdout ?? "").replaceAll("\r", "").trim();
}

export function createDefaultSourceRestoreProbe({ etlEnvFile }) {
  const credentialPath = privateFile(realpathSync(etlEnvFile), "ETL credential"), env = parseEnv(credentialPath);
  const sql = (container, database, query) => run("docker", ["exec", "-i", container, "bash", "-lc",
    'IFS= read -r SQLCMDPASSWORD; export SQLCMDPASSWORD; exec /opt/mssql-tools18/bin/sqlcmd -b -V 16 -C -S localhost -U "$1" -d "$2" -h -1 -W -s "|" -Q "$3"', "q", env.YUZHOU_SQLSERVER_ETL_LOGIN, database, query],
  { input: `${env.YUZHOU_SQLSERVER_ETL_PASSWORD}\n`, code: "SOURCE_ETL_LOGIN_FAILED", detail: "minimum ETL login did not authenticate" });
  return {
    inspectContainerCopy({ sourceContainer, containerCopyPath }) {
      if (!CONTAINER_COPY.test(containerCopyPath ?? "")) fail("SOURCE_CONTAINER_COPY_INVALID", "bounded SQL Server backup copy path required");
      const output = run("docker", ["exec", sourceContainer, "sh", "-c", 'set -eu; test -f "$1"; sha256sum "$1"; wc -c < "$1"', "q", containerCopyPath], { code: "SOURCE_CONTAINER_COPY_INVALID", detail: "container backup copy is unavailable" });
      const lines = output.split("\n"), sha = lines[0]?.trim().split(/\s+/u)[0], bytes = Number(lines[1]?.trim());
      if (!SHA256.test(sha ?? "") || !Number.isSafeInteger(bytes) || bytes < 1) fail("SOURCE_CONTAINER_COPY_INVALID", "container backup copy probe output");
      return { sha256: sha, bytes };
    },
    inspectLive({ sourceContainer, databaseAlias }) {
      if (!CONTAINER.test(sourceContainer ?? "") || !DATABASE.test(databaseAlias ?? "") || env.YUZHOU_SQLSERVER_DATABASE !== databaseAlias) fail("SOURCE_RUNTIME_IDENTITY_INVALID", "source identity or ETL database binding");
      let inspected;
      try { inspected = JSON.parse(run("docker", ["inspect", sourceContainer], { code: "SOURCE_RUNTIME_IDENTITY_INVALID", detail: "source container unavailable" }))[0]; }
      catch (error) { if (error instanceof SourceRestoreReceiptError) throw error; fail("SOURCE_RUNTIME_IDENTITY_INVALID", "source container inspect output"); }
      const authoritySql = "SET NOCOUNT ON; SELECT state_desc,CONVERT(int,is_read_only),CONVERT(int,COALESCE(IS_SRVROLEMEMBER('sysadmin'),0)),CONVERT(int,COALESCE(IS_ROLEMEMBER('db_datareader'),0)),CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION')),CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')),CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE')),CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE')),CONVERT(int,HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE')) FROM sys.databases WHERE name=DB_NAME();";
      const authority = sql(sourceContainer, databaseAlias, authoritySql).split("|").map(value => value.trim());
      if (authority.length !== 9) fail("SOURCE_ETL_AUTHORITY_INVALID", "authority probe shape");
      const restoreIdentity = sql(sourceContainer, databaseAlias, "SET NOCOUNT ON; SELECT DB_NAME(),CONVERT(varchar(30),create_date,126),compatibility_level,collation_name FROM sys.databases WHERE name=DB_NAME(); SELECT file_id,name,type_desc,size,max_size,growth,is_percent_growth,physical_name FROM sys.database_files ORDER BY file_id;");
      const catalogIdentity = sql(sourceContainer, databaseAlias, "SET NOCOUNT ON; SELECT s.name,o.name,o.type FROM sys.objects o JOIN sys.schemas s ON s.schema_id=o.schema_id WHERE o.is_ms_shipped=0 ORDER BY s.name,o.name,o.type; SELECT s.name,t.name,c.column_id,c.name,TYPE_NAME(c.user_type_id),c.max_length,c.precision,c.scale,c.is_nullable FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id JOIN sys.columns c ON c.object_id=t.object_id ORDER BY s.name,t.name,c.column_id;");
      const minimumRead = sql(sourceContainer, databaseAlias, "SET NOCOUNT ON; DECLARE @target nvarchar(517)=(SELECT TOP (1) QUOTENAME(s.name)+N'.'+QUOTENAME(t.name) FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id WHERE t.is_ms_shipped=0 ORDER BY s.name,t.name); IF @target IS NULL THROW 51000,'no user table available for ETL read proof',1; EXEC(N'SELECT TOP (1) 1 AS readable FROM '+@target+N';');");
      if (minimumRead !== "" && minimumRead !== "1") fail("SOURCE_ETL_READ_FAILED", "minimum user-table SELECT returned an invalid proof");
      const imageIdentity = inspected?.Image, containerIdentity = inspected?.Id, project = inspected?.Config?.Labels?.["com.docker.compose.project"], healthy = inspected?.State?.Health?.Status === "healthy";
      return {
        containerIdentity, imageIdentity, databaseIdentity: databaseAlias, restoreIdentity, catalogIdentity, project, healthy,
        online: authority[0] === "ONLINE", readOnly: authority[1] === "1",
        etlAuthority: { loginSucceeded: true, sysadmin: authority[2] === "1", dbDatareader: authority[3] === "1", viewDefinition: authority[4] === "1", insert: authority[5] === "1", update: authority[6] === "1", delete: authority[7] === "1", execute: authority[8] === "1" }
      };
    }
  };
}

export function captureSourceRestoreReceipt(input, { probe }) {
  exactKeys(input, ["sourceSnapshotSha256", "sourceBackupPath", "sourceContainer", "containerCopyPath", "databaseAlias", "receiptPath"], "SOURCE_RECEIPT_CAPTURE_INVALID", "capture input");
  requireSha(input.sourceSnapshotSha256, "SOURCE_RECEIPT_CAPTURE_INVALID", "source snapshot");
  const backupPath = privateFile(realpathSync(input.sourceBackupPath), "source backup"), backup = hashFile(backupPath);
  if (backup.sha256 !== input.sourceSnapshotSha256) fail("SOURCE_BACKUP_DRIFT", "fixed source backup hash mismatch");
  const containerCopy = probe.inspectContainerCopy(input), live = validateLive(probe.inspectLive(input));
  const receipt = sealSourceRestoreReceipt({
    formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: input.sourceSnapshotSha256,
    backup: { sha256: backup.sha256, bytes: backup.bytes, containerCopySha256: containerCopy.sha256, containerCopyBytes: containerCopy.bytes },
    identities: live.identities, state: live.state, etlAuthority: live.etlAuthority, productionImport: "HOLD"
  });
  writeFileSync(input.receiptPath, canonical(receipt), { flag: "wx", mode: 0o600 }); chmodSync(input.receiptPath, 0o600);
  return { receipt, receiptSha256: digest(canonical(receipt)), productionImport: "HOLD" };
}

export function verifySourceRestoreReceiptFile(input, { probe, recheckLive = true } = {}) {
  exactKeys(input, ["receiptPath", "receiptSha256", "sourceSnapshotSha256", "sourceBackupPath", "sourceContainer", "databaseAlias"], "SOURCE_RECEIPT_VERIFY_INVALID", "verify input");
  requireSha(input.receiptSha256, "SOURCE_RECEIPT_VERIFY_INVALID", "receipt file hash");
  const receiptPath = privateFile(realpathSync(input.receiptPath), "source restore receipt"), raw = readFileSync(receiptPath);
  if (digest(raw) !== input.receiptSha256) fail("SOURCE_RECEIPT_HASH_MISMATCH", "receipt file bytes");
  let receipt;
  try { receipt = validateSourceRestoreReceipt(JSON.parse(raw)); } catch (error) { if (error instanceof SourceRestoreReceiptError) throw error; fail("SOURCE_RECEIPT_INVALID", "receipt JSON"); }
  const backupPath = privateFile(realpathSync(input.sourceBackupPath), "source backup"), backup = hashFile(backupPath);
  if (receipt.sourceSnapshotSha256 !== input.sourceSnapshotSha256 || backup.sha256 !== input.sourceSnapshotSha256 || receipt.backup.sha256 !== backup.sha256 || receipt.backup.bytes !== backup.bytes) fail("SOURCE_BACKUP_DRIFT", "receipt source backup binding");
  if (recheckLive) {
    const live = validateLive(probe.inspectLive(input));
    if (JSON.stringify(live.identities) !== JSON.stringify(receipt.identities) || JSON.stringify(live.state) !== JSON.stringify(receipt.state)
      || JSON.stringify(live.etlAuthority) !== JSON.stringify(receipt.etlAuthority)) fail("SOURCE_RUNTIME_IDENTITY_DRIFT", "live source differs from restore receipt");
  }
  return { receipt, receiptSha256: input.receiptSha256, productionImport: "HOLD" };
}

function args(argv) {
  const result = {}, allowed = new Set(["--source-snapshot", "--source-backup", "--source-container", "--container-copy", "--database", "--etl-env", "--receipt"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index]; if (!allowed.has(key) || index + 1 >= argv.length) fail("SOURCE_RECEIPT_ARGUMENT_INVALID", key);
    if (Object.hasOwn(result, key)) fail("SOURCE_RECEIPT_ARGUMENT_INVALID", key); result[key] = argv[++index];
  }
  for (const key of allowed) if (!result[key]) fail("SOURCE_RECEIPT_ARGUMENT_MISSING", key);
  return result;
}

async function main() {
  const input = args(process.argv.slice(2)), probe = createDefaultSourceRestoreProbe({ etlEnvFile: resolve(input["--etl-env"]) });
  const result = captureSourceRestoreReceipt({
    sourceSnapshotSha256: input["--source-snapshot"], sourceBackupPath: resolve(input["--source-backup"]), sourceContainer: input["--source-container"],
    containerCopyPath: input["--container-copy"], databaseAlias: input["--database"], receiptPath: resolve(input["--receipt"])
  }, { probe });
  process.stdout.write(`${JSON.stringify({ status: "SOURCE_RESTORE_RECEIPT_CAPTURED", receiptSha256: result.receiptSha256, productionImport: "HOLD" })}\n`);
}

// This module is also imported by lifecycle runners. stdin/eval callers may
// expose a non-file argv[1] (for example "-"); only resolve it for a real CLI
// entrypoint so importing the receipt validator remains side-effect free.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.code ?? "SOURCE_RECEIPT_FAILED"}: ${String(error.message).replace(/^.*?: /u, "")}\n`); process.exitCode = 1; });
