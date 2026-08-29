#!/usr/bin/env node
/* global Buffer, process, URL */
import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { computeCoreT0T3MappingContractHash } from "./core-drivers/postgres-lab-v1.mjs";
import { verifySourceRestoreReceiptFile } from "./source-restore-receipt.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const mode = path => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const sha256File = path => {
  const hash = createHash("sha256"), descriptor = openSync(path, "r"), buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    for (let count = readSync(descriptor, buffer, 0, buffer.length, null); count > 0; count = readSync(descriptor, buffer, 0, buffer.length, null)) hash.update(buffer.subarray(0, count));
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
};

function regularFile(path, label, { privateFile = false } = {}) {
  const requested = resolve(path);
  let link, actual, info;
  try { link = lstatSync(requested); actual = realpathSync(requested); info = statSync(actual); } catch { fail("CORE_PREPARE_FILE_INVALID", `${label}:missing`); }
  if (link.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (privateFile && mode(actual) !== "0600")) fail("CORE_PREPARE_FILE_INVALID", label);
  return actual;
}

function privateWrite(path, value) {
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function parseEnv(path) {
  const result = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("CORE_PREPARE_ETL_ENV_INVALID", basename(path));
    result[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return result;
}

export function parseCorePrepareArgs(argv) {
  const args = {}, allowed = new Set(["--rehearsal", "--suffix", "--postgres-port", "--api-port", "--web-port", "--control-root", "--etl-env", "--source-container", "--source-backup", "--source-restore-receipt", "--machine-attestation-root"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || index + 1 >= argv.length || allowed.has(argv[index + 1])) fail("CORE_PREPARE_ARGUMENT_INVALID", key);
    const name = key.slice(2).replace(/-([a-z])/gu, (_match, value) => value.toUpperCase());
    if (Object.hasOwn(args, name)) fail("CORE_PREPARE_ARGUMENT_INVALID", key);
    args[name] = argv[++index];
  }
  for (const key of ["rehearsal", "suffix", "postgresPort", "apiPort", "webPort", "controlRoot", "etlEnv", "sourceContainer", "sourceBackup", "sourceRestoreReceipt", "machineAttestationRoot"]) if (!args[key]) fail("CORE_PREPARE_ARGUMENT_MISSING", key);
  if (!["A", "B"].includes(args.rehearsal)) fail("CORE_PREPARE_ARGUMENT_INVALID", "rehearsal");
  if (!/^[a-z0-9_]{6,36}$/u.test(args.suffix)) fail("CORE_PREPARE_ARGUMENT_INVALID", "suffix");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{1,127}$/u.test(args.sourceContainer)) fail("CORE_PREPARE_ARGUMENT_INVALID", "source container");
  if (!SHA256.test(args.machineAttestationRoot)) fail("CORE_PREPARE_ARGUMENT_INVALID", "trusted root");
  for (const field of ["postgresPort", "apiPort", "webPort"]) {
    args[field] = Number(args[field]);
    if (!Number.isInteger(args[field]) || args[field] < 1024 || args[field] > 65535) fail("CORE_PREPARE_ARGUMENT_INVALID", field);
  }
  if (new Set([args.postgresPort, args.apiPort, args.webPort]).size !== 3) fail("CORE_PREPARE_ARGUMENT_INVALID", "ports");
  return args;
}

export function prepareCoreConfig(argsInput, { codeSha, mappingContractHash = computeCoreT0T3MappingContractHash() }) {
  const args = { ...argsInput, controlRoot: resolve(argsInput.controlRoot) };
  let controlLink, controlInfo;
  try { controlLink = lstatSync(args.controlRoot); controlInfo = statSync(realpathSync(args.controlRoot)); }
  catch { fail("CORE_PREPARE_CONTROL_ROOT_INVALID", "0700 control root must already exist"); }
  if (controlLink.isSymbolicLink() || !controlInfo.isDirectory() || mode(args.controlRoot) !== "0700") fail("CORE_PREPARE_CONTROL_ROOT_INVALID", "0700 non-symlink control root required");
  const project = `jinhu_hr_migration_lab_core_${args.suffix}`, projectRoot = join(args.controlRoot, project);
  if (existsSync(projectRoot)) fail("CORE_PREPARE_TARGET_EXISTS", project);
  const sourceBackup = regularFile(args.sourceBackup, "source backup", { privateFile: true });
  const sourceSnapshotHash = sha256File(sourceBackup);
  const sourceRestoreReceipt = regularFile(args.sourceRestoreReceipt, "source restore receipt", { privateFile: true });
  const sourceRestoreReceiptSha256 = sha256File(sourceRestoreReceipt);
  verifySourceRestoreReceiptFile({ receiptPath: sourceRestoreReceipt, receiptSha256: sourceRestoreReceiptSha256, sourceSnapshotSha256: sourceSnapshotHash,
    sourceBackupPath: sourceBackup, sourceContainer: args.sourceContainer, databaseAlias: parseEnv(regularFile(args.etlEnv, "ETL env", { privateFile: true })).YUZHOU_SQLSERVER_DATABASE }, { recheckLive: false });
  const etlSource = regularFile(args.etlEnv, "ETL env", { privateFile: true }), etl = parseEnv(etlSource);
  if (!/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/u.test(etl.YUZHOU_SQLSERVER_DATABASE ?? "") || String(etl.YUZHOU_SQLSERVER_ETL_LOGIN ?? "").toLowerCase() === "sa" || !etl.YUZHOU_SQLSERVER_ETL_LOGIN || !etl.YUZHOU_SQLSERVER_ETL_PASSWORD) fail("CORE_PREPARE_ETL_ENV_INVALID", "read-only lab authority");
  const configRoot = join(projectRoot, "config"), credentialRoot = join(projectRoot, "credentials"), auditRoot = join(projectRoot, "audit"), runtimeRoot = join(projectRoot, "runtime");
  mkdirSync(configRoot, { recursive: true, mode: 0o700 });
  for (const directory of [projectRoot, configRoot, credentialRoot, auditRoot]) { if (!existsSync(directory)) mkdirSync(directory, { mode: 0o700 }); chmodSync(directory, 0o700); }
  const etlCopy = join(credentialRoot, "etl.env"); copyFileSync(etlSource, etlCopy); chmodSync(etlCopy, 0o600);
  privateWrite(join(credentialRoot, "postgres.env"), `POSTGRES_USER=jinhu\nPOSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\nPOSTGRES_DB=${project}\n`);
  const timestamp = new Date().toISOString().replaceAll(/[-:]/gu, "").replace(/\.\d{3}Z$/u, "Z");
  const config = {
    formatVersion: 1, profile: "core_t0_t3", runId: `yzcore-${timestamp}-${codeSha.slice(0, 8)}-r${args.rehearsal}`, rehearsal: args.rehearsal,
    triple: { codeSha, sourceSnapshotHash, mappingContractHash },
    source: { readOnly: true, sourceBackupSha256: sourceSnapshotHash, sourceBackupPath: sourceBackup, sourceRestoreReceiptPath: sourceRestoreReceipt, sourceRestoreReceiptSha256, databaseAlias: etl.YUZHOU_SQLSERVER_DATABASE, etlEnvFile: etlCopy, sourceContainer: args.sourceContainer, dictionaryPackages: null },
    machineAttestation: { checkpointVersion: 2, trustedRootSha256: args.machineAttestationRoot },
    target: {
      database: project, composeProject: project, container: `${project}-postgres-1`, network: `${project}_default`, volume: `${project}_postgres_data`,
      role: `${project}_operator`, accountNamespace: `${project}_accounts`, ports: { postgres: args.postgresPort, api: args.apiPort, web: args.webPort },
      runtimeRoot, stagingRoot: join(runtimeRoot, "staging"), evidenceRoot: join(runtimeRoot, "evidence"), credentialRoot
    },
    productionImport: "HOLD"
  };
  validateCoreT0T3Config(config);
  const configPath = join(configRoot, "rehearsal-config.json"); privateWrite(configPath, config);
  return { config, configPath, auditRoot, project, productionImport: "HOLD" };
}

async function main() {
  const args = parseCorePrepareArgs(process.argv.slice(2));
  const status = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  if (status.status !== 0 || status.stdout.trim() || head.status !== 0) fail("CORE_PREPARE_WORKTREE_NOT_SEALED", "clean committed checkout required");
  const prepared = prepareCoreConfig(args, { codeSha: head.stdout.trim() });
  process.stdout.write(`${JSON.stringify({ configPath: prepared.configPath, project: prepared.project, runId: prepared.config.runId, executionStatus: "SPEC_FROZEN", productionImport: "HOLD" })}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${error.code ?? "CORE_PREPARE_FAILED"}: ${String(error.message).replace(/^.*?: /u, "")}\n`); process.exitCode = 1; });
