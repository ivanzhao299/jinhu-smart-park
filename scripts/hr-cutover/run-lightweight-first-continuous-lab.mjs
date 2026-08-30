#!/usr/bin/env node
/* global process */
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { runCoreT0T3ContinuousLab } from "./run-core-t0-t3-continuous-lab.mjs";
import { runCoreTechnicalUat } from "./run-core-t0-t3-technical-uat.mjs";
import { verifyLightweightFirstSliceOrder } from "./verify-lightweight-first-slice-order.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const CONTRACT = JSON.parse(readFileSync(resolve(ROOT, "scripts/hr-cutover/contracts/lightweight-first-slice-order-v1.json"), "utf8"));
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const directoryMode = path => (statSync(path).mode & 0o777) === 0o700;
const safeCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "LIGHTWEIGHT_CONTINUOUS_FAILED";

function privateJson(path, code) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile() || !privateMode(absolute)) fail(code, absolute);
  try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { fail(code, absolute); }
}

function stage(path, label, requiredManifest = true) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isDirectory() || !directoryMode(absolute)) fail("LIGHTWEIGHT_STAGE_UNSAFE", label);
  const manifest = resolve(absolute, "manifest.json");
  if (requiredManifest && (!existsSync(manifest) || lstatSync(manifest).isSymbolicLink() || !statSync(manifest).isFile() || !privateMode(manifest))) fail("LIGHTWEIGHT_STAGE_UNSAFE", `${label}.manifest`);
  return { path: absolute, manifest: requiredManifest ? privateJson(manifest, "LIGHTWEIGHT_STAGE_INVALID") : null };
}

function childEnvironment(config, additions = {}) {
  const inherited = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "COLIMA_HOME"].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  return {
    ...inherited,
    ALLOW_YUZHOU_MIGRATION: "yes",
    YUZHOU_TARGET_DATABASE: config.target.database,
    YUZHOU_POSTGRES_CONTAINER: config.target.container,
    YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT: config.target.composeProject,
    YUZHOU_TARGET_TENANT_ID: "10000001",
    YUZHOU_TARGET_PARK_ID: "20000001",
    YUZHOU_BACKUP_SHA256: config.triple.sourceSnapshotHash,
    ...additions
  };
}

function execute(script, env, spawn = spawnSync) {
  const result = spawn("sh", [resolve(ROOT, script)], { cwd: ROOT, env, encoding: "utf8", stdio: "pipe" });
  if (result.error || result.status !== 0) fail("LIGHTWEIGHT_CHILD_FAILED", script);
  return result.stdout;
}

function assertCheckpoint(result) {
  if (result?.status !== "CHECKPOINT_READY" || result?.state !== "rollback_ready") fail("LIGHTWEIGHT_CORE_CHECKPOINT_FAILED", "core_t0_t2");
}

function assertCleanup(result) {
  if (result?.status !== "CONTRACT_PASS" || result?.state !== "cleaned" || result?.residualCount !== 0) fail("LIGHTWEIGHT_CORE_CLEANUP_FAILED", "core_t0_t2");
}

export function parseLightweightFirstArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv, args = {}, allowed = new Set(["--config", "--t5-stage", "--t3-stage", "--t4-stage", "--t5-identity-resolution"]);
  for (let index = 0; index < input.length; index += 1) {
    const key = input[index];
    if (!allowed.has(key) || !input[index + 1] || allowed.has(input[index + 1])) fail("LIGHTWEIGHT_ARGUMENT_INVALID", key);
    const name = key.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    if (Object.hasOwn(args, name)) fail("LIGHTWEIGHT_ARGUMENT_INVALID", key);
    args[name] = resolve(input[++index]);
  }
  for (const key of ["config", "t5Stage", "t3Stage", "t4Stage"]) if (!args[key]) fail("LIGHTWEIGHT_ARGUMENT_INVALID", key);
  return args;
}

export async function runLightweightFirstContinuous({ configPath, t5Stage, t3Stage, t4Stage, t5IdentityResolution = null }, { coreRunner = runCoreT0T3ContinuousLab, technicalUat = runCoreTechnicalUat, spawn = spawnSync, uuid = randomUUID } = {}) {
  verifyLightweightFirstSliceOrder(CONTRACT);
  const config = validateCoreT0T3Config(privateJson(configPath, "LIGHTWEIGHT_CONFIG_UNSAFE"));
  if (config.profile !== "core_t0_t2") fail("LIGHTWEIGHT_CORE_PROFILE_INVALID", config.profile);
  const input = { T5_NONFILE: stage(t5Stage, "T5_NONFILE"), T3: stage(t3Stage, "T3", false), T4: stage(t4Stage, "T4") };
  if (input.T5_NONFILE.manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || input.T4.manifest.sourceBackupSha256 !== config.triple.sourceSnapshotHash) fail("LIGHTWEIGHT_SOURCE_BINDING_DRIFT", "staging source differs from core config");
  if (t5IdentityResolution) privateJson(t5IdentityResolution, "LIGHTWEIGHT_T5_RESOLUTION_UNSAFE");
  const run = suffix => `${config.runId.toLowerCase().replace(/^yzcore-/, "yzlw-").slice(0, 54)}-${suffix}`;
  const runs = { t5: run("t5"), t3: run("t3"), t4: run("t4") };
  const actor = uuid();
  const reached = [];
  let primary = null;
  try {
    const checkpoint = await coreRunner({ configPath, durationMinutes: 300, pollMilliseconds: 1000, stopAfter: "rollback_ready" });
    assertCheckpoint(checkpoint);
    execute("scripts/provision-yuzhou-t5-nonfile-actor.sh", childEnvironment(config, { YUZHOU_T5_NONFILE_RUN_ID: runs.t5, YUZHOU_MATERIALIZATION_ACTOR_USER_ID: actor }), spawn);
    execute("scripts/load-yuzhou-t5-nonfile-history.sh", childEnvironment(config, { YUZHOU_T5_NONFILE_RUN_ID: runs.t5, YUZHOU_T5_NONFILE_STAGING_DIR: input.T5_NONFILE.path, YUZHOU_MATERIALIZATION_ACTOR_USER_ID: actor, ...(t5IdentityResolution ? { YUZHOU_T5_IDENTITY_RESOLUTION_FILE: resolve(t5IdentityResolution) } : {}) }), spawn); reached.push("T5_NONFILE");
    execute("scripts/load-yuzhou-t3-attendance-insurance.sh", childEnvironment(config, { YUZHOU_MIGRATION_RUN_ID: runs.t3, YUZHOU_STAGING_DIR: input.T3.path }), spawn); reached.push("T3");
    const business = input.T4.manifest.businessContentSha256;
    if (!/^[0-9a-f]{64}$/u.test(business ?? "")) fail("LIGHTWEIGHT_T4_MANIFEST_INVALID", "business hash");
    execute("scripts/load-yuzhou-t4-payroll-history.sh", childEnvironment(config, { YUZHOU_MIGRATION_RUN_ID: runs.t4, YUZHOU_STAGING_DIR: input.T4.path, YUZHOU_T4_BUSINESS_SHA256: business, YUZHOU_T4_LOAD_MODE: "full_archive" }), spawn); reached.push("T4");
    const uat = await technicalUat(configPath);
    if (uat?.status !== "PASS" || uat.productionImport !== "HOLD") fail("LIGHTWEIGHT_TECHNICAL_UAT_FAILED", "core technical UAT");
    return { status: "CONTRACT_PASS", order: CONTRACT.orderedSlices.map(item => item.id), uat: "PASS", productionImport: "HOLD" };
  } catch (error) { primary = error; throw error; }
  finally {
    const rollback = (script, env) => { try { execute(script, childEnvironment(config, { ALLOW_YUZHOU_ROLLBACK: "yes", ...env }), spawn); } catch (error) { if (!primary) primary = error; } };
    if (reached.includes("T4")) rollback("scripts/rollback-yuzhou-t4-payroll-history.sh", { YUZHOU_MIGRATION_RUN_ID: runs.t4 });
    if (reached.includes("T3")) rollback("scripts/rollback-yuzhou-t3-attendance-insurance.sh", { YUZHOU_MIGRATION_RUN_ID: runs.t3 });
    if (reached.includes("T5_NONFILE")) rollback("scripts/rollback-yuzhou-t5-nonfile-history.sh", { YUZHOU_T5_NONFILE_RUN_ID: runs.t5 });
    if (reached.includes("T5_NONFILE")) rollback("scripts/rollback-yuzhou-t5-nonfile-actor.sh", { YUZHOU_T5_NONFILE_RUN_ID: runs.t5, YUZHOU_MATERIALIZATION_ACTOR_USER_ID: actor });
    try { assertCleanup(await coreRunner({ configPath, durationMinutes: 300, pollMilliseconds: 1000 })); } catch (error) { if (!primary) throw error; }
    if (primary) throw primary;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLightweightFirstContinuous(parseLightweightFirstArgs(process.argv.slice(2))).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
}
