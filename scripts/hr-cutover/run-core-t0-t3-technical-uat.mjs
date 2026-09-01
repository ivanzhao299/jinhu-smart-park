#!/usr/bin/env node
/* global process */
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CoreT0T3Lifecycle, validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { createCoreT0T3Adapters } from "./core-drivers/postgres-lab-v1.mjs";
import { runTechnicalUat } from "./run-full-domain-technical-uat.mjs";
import { safeDiagnosticDetail } from "./safe-run-diagnostic.mjs";

const DEFAULT_TENANT = "10000001", DEFAULT_PARK = "20000001";
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const safeDatabaseDiagnostic = error => String(error?.message ?? "").match(/operation_[0-9]+_sqlstate_[0-9A-Z]+(?:_constraint_[A-Za-z0-9_]+)?(?:_callsite_[A-Za-z0-9_-]+)?/u)?.[0] ?? "";
const safeErrorCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "CORE_TECHNICAL_UAT_FAILED";
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const directoryMode = path => (statSync(path).mode & 0o777) === 0o700;

function privateWrite(path, value, { replace = false } = {}) {
  writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, { flag: replace ? "w" : "wx", mode: 0o600 });
  chmodSync(path, 0o600);
  if (!privateMode(path)) fail("CORE_TECHNICAL_UAT_ARTIFACT_UNSAFE", path);
}

function privateDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory() || !directoryMode(path)) fail("CORE_TECHNICAL_UAT_DIRECTORY_UNSAFE", path);
}

function privateJson(path) {
  const requested = resolve(path);
  if (!existsSync(requested) || lstatSync(requested).isSymbolicLink() || !statSync(requested).isFile() || !privateMode(requested)) fail("CORE_TECHNICAL_UAT_CONFIG_UNSAFE", requested);
  try { return JSON.parse(readFileSync(requested, "utf8")); } catch { fail("CORE_TECHNICAL_UAT_CONFIG_INVALID", requested); }
}

export function parseCoreTechnicalUatArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  if (input.length !== 2 || input[0] !== "--config" || !input[1]) fail("CORE_TECHNICAL_UAT_ARGUMENT_INVALID", input[0] ?? "missing config");
  return { configPath: resolve(input[1]) };
}

export function buildCoreTechnicalUatConfig(coreInput) {
  const core = validateCoreT0T3Config(coreInput);
  const projectRoot = dirname(core.target.runtimeRoot), auditRoot = join(projectRoot, "audit"), uatRoot = join(auditRoot, "technical-uat"), evidenceRoot = join(uatRoot, "evidence");
  privateDirectory(uatRoot); privateDirectory(evidenceRoot);
  const registryPath = join(evidenceRoot, "resource-registry.json");
  if (!existsSync(registryPath)) privateWrite(registryPath, [{ type: "process", planned: `${core.runId}:managed_children`, observed: [], removed: true, residualCount: 0 }]);
  const keyPath = join(uatRoot, "materialization.key");
  if (!existsSync(keyPath)) privateWrite(keyPath, randomBytes(32).toString("hex"));
  if (!privateMode(keyPath)) fail("CORE_TECHNICAL_UAT_ARTIFACT_UNSAFE", "materialization key");
  return {
    formatVersion: 1, backend: "lab", runId: core.runId, rehearsal: core.rehearsal, triple: core.triple,
    target: {
      database: core.target.database, composeProject: core.target.composeProject, volume: core.target.volume,
      postgresContainer: core.target.container, postgresPort: core.target.ports.postgres, apiPort: core.target.ports.api, webPort: core.target.ports.web,
      role: core.target.role, accountNamespace: core.target.accountNamespace, root: uatRoot, stagingRoot: core.target.stagingRoot,
      evidenceRoot, fileRoot: join(core.target.runtimeRoot, "files"), credentialArtifact: join(core.target.credentialRoot, "postgres.env"),
      materializationKeyArtifact: keyPath, auditBundle: join(uatRoot, "audit-bundle.json")
    },
    adapterEnv: { T0: { load: { YUZHOU_TARGET_TENANT_ID: DEFAULT_TENANT, YUZHOU_TARGET_PARK_ID: DEFAULT_PARK } } },
    productionImport: "HOLD"
  };
}

export function buildCoreTechnicalUatReceipt(core, { result = null, error = null } = {}) {
  if (result) return {
    formatVersion: 1,
    status: "PASS",
    runId: core.runId,
    observedChecks: result.legacyObservedChecks,
    browserViewportCells: result.browserViewportCells,
    productionImport: "HOLD"
  };
  const errorCode = safeErrorCode(error), errorDetail = safeDiagnosticDetail(error, errorCode);
  return {
    formatVersion: 1,
    status: "HOLD",
    runId: core.runId,
    errorCode,
    ...(errorDetail ? { errorDetail } : {}),
    productionImport: "HOLD"
  };
}

function writeCoreTechnicalUatReceipt(core, receipt) {
  const auditRoot = join(dirname(core.target.runtimeRoot), "audit");
  privateDirectory(auditRoot);
  privateWrite(join(auditRoot, "technical-uat-core-receipt.json"), receipt, { replace: true });
}

export async function runCoreTechnicalUat(configPath) {
  const core = validateCoreT0T3Config(privateJson(configPath));
  const adapters = await createCoreT0T3Adapters(core);
  const lifecycle = new CoreT0T3Lifecycle(core, adapters);
  if (lifecycle.state !== "rollback_ready") fail("CORE_TECHNICAL_UAT_STATE_INVALID", lifecycle.state);
  try {
    const config = buildCoreTechnicalUatConfig(core);
    const result = await runTechnicalUat(config, { configValidator: value => value, stateResolver: () => lifecycle.state, requiredState: "rollback_ready", finalizeManifest: false });
    writeCoreTechnicalUatReceipt(core, buildCoreTechnicalUatReceipt(core, { result }));
    return { status: result.technicalUat, runId: core.runId, observedChecks: result.legacyObservedChecks, browserViewportCells: result.browserViewportCells, productionImport: "HOLD" };
  } catch (error) {
    writeCoreTechnicalUatReceipt(core, buildCoreTechnicalUatReceipt(core, { error }));
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCoreTechnicalUat(parseCoreTechnicalUatArgs(process.argv.slice(2)).configPath)
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => { const diagnostic = safeDatabaseDiagnostic(error); process.stderr.write(`${error.code ?? "CORE_TECHNICAL_UAT_FAILED"}${diagnostic ? ` ${diagnostic}` : ""}\n`); process.exitCode = 1; });
}
