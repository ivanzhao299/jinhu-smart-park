#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DOMAIN_ORDER, validateConfig } from "./full-domain-lifecycle.mjs";
import { readMaterializationKeyFile } from "./materialization-key-contract.mjs";
import { computeMappingContractHash } from "./verify-full-domain-contract.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
const T4_BUSINESS_SHA256 = "5849168cdb64fbae68bb9e4ae98ec2c90f1dcba216ae01a229878c7777535800";
const T5_BUSINESS_SHA256 = "5939691dfdddd5912992328dba58505f92bcfb7bb7de07ada571959a52d37005";
const DEFAULT_TENANT = "10000001";
const DEFAULT_PARK = "20000001";

const fail = (message) => { throw new Error(message); };
const mode = (path) => (statSync(path).mode & 0o777).toString(8).padStart(4, "0");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const fileSha256 = (path) => {
  const result = spawnSync("shasum", ["-a", "256", path], { encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0) fail("cannot hash source backup");
  return result.stdout.trim().split(/\s+/)[0];
};

function assertRegularFile(path, label, { privateFile = false } = {}) {
  const candidate = resolve(path);
  if (!existsSync(candidate) || lstatSync(candidate).isSymbolicLink() || !statSync(candidate).isFile()) {
    fail(`${label} must be a non-symlink regular file`);
  }
  if (privateFile && mode(candidate) !== "0600") fail(`${label} must be mode 0600`);
  return realpathSync(candidate);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--") continue;
    if (!["--rehearsal", "--suffix", "--postgres-port", "--api-port", "--web-port", "--control-root", "--etl-env", "--t4-evidence", "--source-container", "--source-backup", "--materialization-key"].includes(key)) fail(`unknown argument: ${key}`);
    args[key.slice(2).replace(/-([a-z])/g, (_, value) => value.toUpperCase())] = argv[++index];
  }
  for (const key of ["rehearsal", "suffix", "postgresPort", "apiPort", "webPort", "controlRoot", "etlEnv", "t4Evidence", "sourceContainer", "sourceBackup", "materializationKey"]) {
    if (!args[key]) fail(`missing --${key.replace(/[A-Z]/g, (value) => `-${value.toLowerCase()}`)}`);
  }
  if (!["A", "B"].includes(args.rehearsal)) fail("rehearsal must be A or B");
  if (!/^[a-z0-9_]{6,36}$/.test(args.suffix)) fail("suffix must contain 6-36 lowercase letters, digits, or underscores");
  for (const key of ["postgresPort", "apiPort", "webPort"]) {
    args[key] = Number(args[key]);
    if (!Number.isInteger(args[key]) || args[key] < 1024 || args[key] > 65535) fail(`${key} is invalid`);
  }
  if (new Set([args.postgresPort, args.apiPort, args.webPort]).size !== 3) fail("ports must be distinct");
  return args;
}

function parseEnv(path) {
  return Object.fromEntries(readFileSync(path, "utf8").split("\n").filter((line) => line && !line.startsWith("#")).map((line) => {
    const separator = line.indexOf("=");
    if (separator <= 0) fail(`${basename(path)} contains a malformed line`);
    return [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function privateCopy(source, destination) {
  copyFileSync(source, destination);
  chmodSync(destination, 0o600);
}

function writePrivate(path, contents) {
  writeFileSync(path, contents, { flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

function configFor(args, codeSha, mappingContractHash) {
  const project = `jinhu_hr_migration_lab_full_${args.suffix}`;
  const projectRoot = join(args.controlRoot, project);
  const credentialRoot = join(projectRoot, "credentials");
  const runtimeRoot = join(projectRoot, "runtime");
  const materializationKeySource = resolve(args.materializationKey);
  if (existsSync(projectRoot)) fail(`controlled project already exists: ${project}`);
  const materializationKeyValue = readMaterializationKeyFile(materializationKeySource);
  mkdirSync(credentialRoot, { recursive: true, mode: 0o700 });
  chmodSync(projectRoot, 0o700);
  chmodSync(credentialRoot, 0o700);

  const etlCopy = join(credentialRoot, "etl.env");
  const t4Copy = join(credentialRoot, "t4-evidence.json");
  const postgresEnv = join(credentialRoot, "postgres.env");
  const materializationKey = join(credentialRoot, "materialization.key");
  const jobStateDecision = join(credentialRoot, "employee-job-state.reviewed.json");
  const jobStateSourcePayload = join(credentialRoot, "employee-job-state.private.json");
  const jobStateApproval = join(credentialRoot, "employee-job-state.approval.json");
  const etlSource = assertRegularFile(args.etlEnv, "ETL source file", { privateFile: true });
  const t4Source = assertRegularFile(args.t4Evidence, "T4 evidence file");
  privateCopy(etlSource, etlCopy);
  privateCopy(t4Source, t4Copy);
  const source = parseEnv(etlCopy);
  if (!/^YuzhouHR_Lab_[A-Za-z0-9_]{6,40}$/.test(source.YUZHOU_SQLSERVER_DATABASE ?? "")) fail("ETL file does not bind a Yuzhou lab database");
  if ((source.YUZHOU_SQLSERVER_ETL_LOGIN ?? "").toLowerCase() === "sa") fail("ETL login must not be sa");

  const t4Record = JSON.parse(readFileSync(t4Copy, "utf8"));
  const sourceSnapshotHash = t4Record.sourceBackupSha256;
  if (!/^[0-9a-f]{64}$/.test(sourceSnapshotHash ?? "")) fail("T4 evidence does not bind the source snapshot");
  const sourceBackup = assertRegularFile(args.sourceBackup, "source backup", { privateFile: true });
  if (fileSha256(sourceBackup) !== sourceSnapshotHash) fail("source backup does not match the pinned snapshot");
  writePrivate(materializationKey, `${materializationKeyValue}\n`);
  writePrivate(postgresEnv, `POSTGRES_USER=jinhu\nPOSTGRES_PASSWORD=${randomBytes(32).toString("hex")}\nPOSTGRES_DB=${project}\n`);

  const timestamp = new Date().toISOString().replaceAll(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const runId = `yzfull-${timestamp}-${codeSha.slice(0, 8)}-r${args.rehearsal}`;
  const commonLoad = {
    YUZHOU_TARGET_TENANT_ID: DEFAULT_TENANT,
    YUZHOU_TARGET_PARK_ID: DEFAULT_PARK,
    YUZHOU_BACKUP_SHA256: sourceSnapshotHash
  };
  const adapterEnv = Object.fromEntries(DOMAIN_ORDER.map((domain) => [domain, {
    extract: { YUZHOU_SQLSERVER_CONTAINER: args.sourceContainer },
    load: { ...commonLoad },
    rollback: {}
  }]));
  adapterEnv.T4.extract.YUZHOU_SOURCE_BACKUP_FILE = sourceBackup;
  adapterEnv.T4.load = {
    YUZHOU_TARGET_TENANT_ID: DEFAULT_TENANT,
    YUZHOU_TARGET_PARK_ID: DEFAULT_PARK,
    YUZHOU_T4_BUSINESS_SHA256: T4_BUSINESS_SHA256
  };
  adapterEnv.T5.load.YUZHOU_T5_BUSINESS_SHA256 = T5_BUSINESS_SHA256;

  const factSuffix = `${args.rehearsal.toLowerCase()}_${args.suffix}`.slice(-30);
  const config = {
    formatVersion: 1,
    runId,
    rehearsal: args.rehearsal,
    backend: "lab",
    triple: { codeSha, sourceSnapshotHash, mappingContractHash },
    source: {
      databaseAlias: source.YUZHOU_SQLSERVER_DATABASE,
      readOnly: true,
      etlEnvFile: etlCopy,
      t4EvidenceFile: t4Copy
    },
    t4Evidence: { status: "COMPLETED", sha256: sha256(readFileSync(t4Copy)) },
    target: {
      database: project,
      composeProject: project,
      volume: `${project}_postgres_data`,
      postgresContainer: `${project}-postgres-1`,
      postgresPort: args.postgresPort,
      apiPort: args.apiPort,
      webPort: args.webPort,
      role: `${project}_operator`,
      accountNamespace: `yzfull_${args.rehearsal.toLowerCase()}_${project.slice(-12)}`,
      root: runtimeRoot,
      stagingRoot: join(runtimeRoot, "staging"),
      evidenceRoot: join(runtimeRoot, "evidence"),
      fileRoot: join(runtimeRoot, "files"),
      credentialArtifact: postgresEnv,
      materializationKeyArtifact: materializationKey,
      jobStateDecisionArtifact: jobStateDecision,
      jobStateSourcePayloadArtifact: jobStateSourcePayload,
      jobStateApprovalArtifact: jobStateApproval,
      auditBundle: join(credentialRoot, "cleanup-audit.json")
    },
    adapterEnv,
    verification: {
      manifestChainFile: join(runtimeRoot, "evidence", "manifest-chain.json"),
      factSchema: `hr_cutover_facts_${factSuffix}`
    }
  };
  validateConfig(config);
  const configPath = join(credentialRoot, "rehearsal-config.json");
  writePrivate(configPath, `${JSON.stringify(config, null, 2)}\n`);
  return { config, configPath, project };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  args.controlRoot = resolve(args.controlRoot);
  args.etlEnv = resolve(args.etlEnv);
  args.t4Evidence = resolve(args.t4Evidence);
  args.sourceBackup = resolve(args.sourceBackup);
  args.materializationKey = resolve(args.materializationKey);
  const git = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
  if (git.status !== 0 || git.stdout.trim()) fail("rehearsal preparation requires a clean worktree");
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (head.status !== 0) fail("cannot resolve candidate SHA");
  const codeSha = head.stdout.trim();
  const mappingContractHash = computeMappingContractHash(CONTRACT);
  const prepared = configFor(args, codeSha, mappingContractHash);
  process.stdout.write(`${JSON.stringify({ configPath: prepared.configPath, project: prepared.project, runId: prepared.config.runId, productionImport: "HOLD" })}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    process.stderr.write(`REHEARSAL_PREPARE_FAILED: ${error.message}\n`);
    process.exitCode = 1;
  }
}

export { assertRegularFile, configFor, parseArgs };
