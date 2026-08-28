#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ADAPTER_ENV_ALLOWLIST, LifecycleError, resolveVerifiedExtractBindings, validateConfig } from "./full-domain-lifecycle.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/full-domain-contract-v1.json"), "utf8"));
const PHASE_FIELD = { extract: "extract", load: "load", rollback: "rollback" };
const BASE_ENV = new Set(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "COLIMA_HOME"]);
const REQUIRED_FIXED = new Set([
  "ALLOW_YUZHOU_MIGRATION", "ALLOW_YUZHOU_ROLLBACK", "YUZHOU_MIGRATION_RUN_ID", "YUZHOU_TARGET_DATABASE",
  "YUZHOU_POSTGRES_CONTAINER", "YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT", "YUZHOU_SQLSERVER_DATABASE",
  "YUZHOU_ETL_CREDENTIAL_FILE", "YUZHOU_STAGING_ROOT", "YUZHOU_STAGING_DIR"
]);
const FORBIDDEN_ENV = /PASSWORD|PASSWD|TOKEN|SECRET|CONNECTION|PRIVATE|PRODUCTION/i;

function fail(code, detail) { throw new LifecycleError(code, detail); }

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--config") args.config = argv[++index];
    else if (argv[index] === "--domain") args.domain = argv[++index];
    else if (argv[index] === "--phase") args.phase = argv[++index];
    else fail("CLI_ARGUMENT_INVALID", argv[index]);
  }
  if (!args.config || !CONTRACT.domainOrder.includes(args.domain) || !Object.hasOwn(PHASE_FIELD, args.phase)) fail("CLI_ARGUMENT_INVALID", "adapter requires --config, --domain T0-T5 and --phase extract|load|rollback");
  return args;
}

function mode(path) { return (statSync(path).mode & 0o777).toString(8).padStart(4, "0"); }

function childEnvironment(config, domain, phase) {
  const childIndex = CONTRACT.domainOrder.indexOf(domain);
  const env = {};
  for (const key of BASE_ENV) if (process.env[key] !== undefined) env[key] = process.env[key];
  Object.assign(env, config.adapterEnv[domain][phase]);
  if (config.backend === "lab" && phase === "load" && ["T0", "T1", "T2", "T3"].includes(domain)) {
    const bindings = resolveVerifiedExtractBindings(config, domain);
    for (const [key, value] of Object.entries(bindings)) {
      if (Object.hasOwn(config.adapterEnv[domain][phase], key) && config.adapterEnv[domain][phase][key] !== value) {
        fail("EXTRACT_MANIFEST_BINDING_MISMATCH", `${domain}.${key} configured hash differs from this run's verified extract manifest`);
      }
    }
    Object.assign(env, bindings);
    if (domain === "T0") {
      const journal = readFileSync(resolve(config.target.evidenceRoot, "lifecycle-journal.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
      const records = journal.filter((row) => row.kind === "dictionary_materialization" && row.domain === "T0" && row.status === "verified");
      const extracts = journal.filter((row) => row.kind === "child" && row.domain === "T0" && row.phase === "extract" && row.status === "verified");
      if (records.length !== 1 || extracts.length !== 1 || records[0].triple.codeSha !== config.triple.codeSha
        || !/^[0-9a-f]{64}$/.test(records[0].dictionarySnapshotSha256 ?? "")
        || records[0].t0ManifestSha256 !== extracts[0].extractManifestSha256) fail("DICTIONARY_MATERIALIZATION_UNVERIFIED", "T0 reviewed dictionary materialization is not bound to this run");
      env.YUZHOU_T0_JOB_STATE_DICTIONARY_SHA256 = records[0].dictionarySnapshotSha256;
    }
  }
  Object.assign(env, {
    ALLOW_YUZHOU_MIGRATION: "yes",
    YUZHOU_MIGRATION_RUN_ID: `${config.runId}-t${childIndex}`,
    YUZHOU_TARGET_DATABASE: config.target.database,
    YUZHOU_POSTGRES_CONTAINER: config.target.postgresContainer,
    YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT: config.target.composeProject,
    YUZHOU_SQLSERVER_DATABASE: config.source.databaseAlias,
    YUZHOU_ETL_CREDENTIAL_FILE: config.source.etlEnvFile,
    YUZHOU_STAGING_ROOT: config.target.stagingRoot,
    YUZHOU_STAGING_DIR: domain === "T4" ? resolve(config.target.stagingRoot, `staging-t4-${config.runId}-t4`) : resolve(config.target.stagingRoot, `staging-${config.runId}-t${childIndex}`)
  });
  if (domain === "T5" && phase === "extract") env.YUZHOU_PARTY_DATA_KEY_FILE = config.target.materializationKeyArtifact;
  if (phase === "rollback") env.ALLOW_YUZHOU_ROLLBACK = "yes";
  const allowed = new Set([...BASE_ENV, ...REQUIRED_FIXED, ...CONTRACT.domains[domain].requiredEnv, ...ADAPTER_ENV_ALLOWLIST[domain][phase], "YUZHOU_FIXTURE_DELAY_MS", "YUZHOU_FIXTURE_FAIL"]);
  for (const key of Object.keys(env)) {
    if (!allowed.has(key) || FORBIDDEN_ENV.test(key)) fail("ADAPTER_ENV_DENIED", `${domain}.${phase}.${key}`);
  }
  return env;
}

function validateCredentialBoundary(config, domain, phase) {
  if (phase !== "extract") return;
  const path = config.source.etlEnvFile;
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || mode(path) !== "0600") fail("UNSAFE_FILE_PERMISSION", "ETL env file must be a non-symlink 0600 file");
  if (domain === "T5") {
    const keyPath = config.target.materializationKeyArtifact;
    if (!existsSync(keyPath) || lstatSync(keyPath).isSymbolicLink() || !statSync(keyPath).isFile() || mode(keyPath) !== "0600") fail("UNSAFE_FILE_PERMISSION", "materialization key must be a non-symlink 0600 file");
    if (!/^[0-9a-fA-F]{64}$/u.test(readFileSync(keyPath, "utf8").trim())) {
      fail("UNSAFE_FILE_PERMISSION", "materialization key must contain exactly one 32-byte hexadecimal key");
    }
  }
}

function fixture(domain, phase, env) {
  if (phase === "rollback" && env.ALLOW_YUZHOU_ROLLBACK !== "yes") fail("ROLLBACK_AUTH_MISSING", domain);
  if (env.YUZHOU_FIXTURE_DELAY_MS) {
    const delay = Number(env.YUZHOU_FIXTURE_DELAY_MS);
    if (!Number.isInteger(delay) || delay < 0 || delay > 10000) fail("ADAPTER_ENV_DENIED", "YUZHOU_FIXTURE_DELAY_MS");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
  }
  if (env.YUZHOU_FIXTURE_FAIL === `${domain}.${phase}`) fail("FIXTURE_CHILD_FAILURE", `${domain}.${phase}`);
  return { domain, phase, childRunId: env.YUZHOU_MIGRATION_RUN_ID, targetDatabase: env.YUZHOU_TARGET_DATABASE, composeProject: env.YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT, status: "verified", productionImport: "HOLD" };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = validateConfig(JSON.parse(readFileSync(realpathSync(resolve(args.config)), "utf8")));
  validateCredentialBoundary(config, args.domain, args.phase);
  const env = childEnvironment(config, args.domain, args.phase);
  if (config.backend === "fixture") {
    process.stdout.write(`${JSON.stringify(fixture(args.domain, args.phase, env))}\n`);
    return;
  }
  if (["load", "rollback"].includes(args.phase)) {
    const inspect = spawnSync("docker", ["inspect", "--format", '{{index .Config.Labels "com.docker.compose.project"}}', config.target.postgresContainer], { encoding: "utf8", stdio: "pipe" });
    if (inspect.status !== 0 || inspect.stdout.trim() !== config.target.composeProject) fail("UNSAFE_TARGET_IDENTITY", "PostgreSQL container Compose label differs from the pinned lab project");
  }
  const script = resolve(ROOT, CONTRACT.domains[args.domain][PHASE_FIELD[args.phase]]);
  const result = spawnSync("sh", [script], { env, stdio: "inherit" });
  if (result.error || result.status !== 0) fail("CHILD_FAILED", `${args.domain}.${args.phase}`);
}

try { main(); } catch (error) {
  const code = error instanceof LifecycleError ? error.code : "UNEXPECTED_FAILURE";
  process.stderr.write(`${code}: ${error.message.replace(/^.*?: /, "")}\n`);
  process.exitCode = 1;
}
