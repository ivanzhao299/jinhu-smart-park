#!/usr/bin/env node
/* global process */
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCorePairIsolation, validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { runCoreT0T3ContinuousLab } from "./run-core-t0-t3-continuous-lab.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const SHA256 = /^[0-9a-f]{64}$/u;
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const safeCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T3_ATTENDANCE_QUARANTINE_PAIR_FAILED";
const privateFile = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isFile() && (statSync(path).mode & 0o777) === 0o600;
const privateDirectory = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory() && (statSync(path).mode & 0o777) === 0o700;
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");

function privateJson(path, code) {
  const absolute = resolve(path);
  if (!privateFile(absolute)) fail(code, absolute);
  try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { fail(code, absolute); }
}

function stage(path, config) {
  const root = resolve(path), manifestPath = join(root, "manifest.json"), rowsPath = join(root, "attendance-punch-quarantine.jsonl");
  if (!privateDirectory(root) || !privateFile(manifestPath) || !privateFile(rowsPath)) fail("T3_ATTENDANCE_QUARANTINE_STAGE_UNSAFE", root);
  const manifest = privateJson(manifestPath, "T3_ATTENDANCE_QUARANTINE_STAGE_INVALID");
  for (const key of ["sourceSnapshotSha256", "sourceRestoreReceiptSha256", "sourceCatalogSha256", "sourceBusinessSha256", "mappingContractSha256", "quarantineFileSha256"]) if (!SHA256.test(manifest[key] ?? "")) fail("T3_ATTENDANCE_QUARANTINE_STAGE_INVALID", key);
  if (manifest.artifactKind !== "yuzhou_t3_attendance_punch_quarantine_stage" || manifest.sourceReadOnly !== true || manifest.sourceRows !== 1 || manifest.eligibleRows !== 0 || manifest.quarantinedRows !== 1 || manifest.businessWriteTarget !== "none" || manifest.productionImport !== "HOLD" || manifest.quarantineFileSha256 !== digest(rowsPath)) fail("T3_ATTENDANCE_QUARANTINE_STAGE_INVALID", "manifest");
  if (manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || manifest.sourceRestoreReceiptSha256 !== config.source.sourceRestoreReceiptSha256 || manifest.mappingContractSha256 !== config.triple.mappingContractHash) fail("T3_ATTENDANCE_QUARANTINE_SOURCE_BINDING_DRIFT", config.rehearsal);
  return { root, manifest };
}

function childEnvironment(config, manifest, runId) {
  const inherited = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "COLIMA_HOME"].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  return { ...inherited, ALLOW_YUZHOU_MIGRATION: "yes", YUZHOU_T3_ATTENDANCE_EVENTS_RUN_ID: runId, YUZHOU_TARGET_DATABASE: config.target.database, YUZHOU_T3_ATTENDANCE_EVENTS_STAGING_DIR: manifest.root, YUZHOU_POSTGRES_CONTAINER: config.target.container, YUZHOU_EXPECTED_POSTGRES_COMPOSE_PROJECT: config.target.composeProject, YUZHOU_BACKUP_SHA256: config.triple.sourceSnapshotHash, YUZHOU_SOURCE_RESTORE_RECEIPT_SHA256: manifest.manifest.sourceRestoreReceiptSha256, YUZHOU_SOURCE_CATALOG_SHA256: manifest.manifest.sourceCatalogSha256, YUZHOU_SOURCE_BUSINESS_SHA256: manifest.manifest.sourceBusinessSha256, YUZHOU_MAPPING_CONTRACT_SHA256: manifest.manifest.mappingContractSha256 };
}

function execute(script, env, spawn = spawnSync) {
  const result = spawn("sh", [resolve(ROOT, script)], { cwd: ROOT, env, encoding: "utf8", stdio: "pipe" });
  if (result.error || result.status !== 0) fail("T3_ATTENDANCE_QUARANTINE_CHILD_FAILED", script);
  return String(result.stdout ?? "").trim().split("\n").at(-1);
}

function parseReceipt(value, kind) {
  let receipt;
  try { receipt = JSON.parse(value); } catch { fail("T3_ATTENDANCE_QUARANTINE_RECEIPT_INVALID", kind); }
  if (receipt.status !== "PASS" || receipt.productionImport !== "HOLD") fail("T3_ATTENDANCE_QUARANTINE_RECEIPT_INVALID", kind);
  return receipt;
}

function assertCore(result, expected, rehearsal) {
  if (result?.status !== expected.status || result.state !== expected.state || (expected.residualCount !== undefined && result.residualCount !== expected.residualCount)) fail("T3_ATTENDANCE_QUARANTINE_CORE_INVALID", rehearsal);
}

export async function runT3AttendanceQuarantineContinuous({ configPath, stagePath, durationMinutes = 300, pollSeconds = 1 }, { coreRunner = runCoreT0T3ContinuousLab, executeChild = execute, uuid = randomUUID } = {}) {
  const config = validateCoreT0T3Config(privateJson(configPath, "T3_ATTENDANCE_QUARANTINE_CONFIG_UNSAFE"));
  if (config.profile !== "core_t0_t3" || config.productionImport !== "HOLD") fail("T3_ATTENDANCE_QUARANTINE_CONFIG_INVALID", config.rehearsal);
  const input = stage(stagePath, config), base = config.runId.toLowerCase().replace(/^yzcore-/, "").replace(/-r[ab]$/u, "").slice(0, 35), runs = ["load", "reload"].map(suffix => `yzt3q-${base}-${suffix}`), cycles = [];
  let checkpoint = false, primary = null;
  try {
    assertCore(await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000, stopAfter: "rollback_ready" }), { status: "CHECKPOINT_READY", state: "rollback_ready" }, config.rehearsal);
    checkpoint = true;
    for (const runId of runs) {
      const env = childEnvironment(config, input, runId);
      const load = parseReceipt(executeChild("scripts/load-yuzhou-t3-attendance-event-quarantine.sh", env), "load");
      if (load.sourceRows !== 1 || load.loadedRows !== 0 || load.quarantinedRows !== 1 || load.businessWriteTarget !== "none") fail("T3_ATTENDANCE_QUARANTINE_CONSERVATION_INVALID", runId);
      const rollback = parseReceipt(executeChild("scripts/rollback-yuzhou-t3-attendance-event-quarantine.sh", { ...env, ALLOW_YUZHOU_ROLLBACK: "yes" }), "rollback");
      if (rollback.auditResidual !== 0 || rollback.attendanceBusinessRows !== 0) fail("T3_ATTENDANCE_QUARANTINE_ROLLBACK_INVALID", runId);
      cycles.push({ load: { status: "succeeded", source: load.sourceRows, loaded: load.loadedRows, quarantined: load.quarantinedRows }, rollback: "rolled_back" });
    }
    assertCore(await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000 }), { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 }, config.rehearsal);
    checkpoint = false;
    return { formatVersion: 1, status: "CONTRACT_PASS", profile: config.profile, rehearsal: config.rehearsal, sourceSnapshotSha256: input.manifest.sourceSnapshotSha256, sourceRestoreReceiptSha256: input.manifest.sourceRestoreReceiptSha256, sourceBusinessSha256: input.manifest.sourceBusinessSha256, cycles, cleanupState: "cleaned", residualCount: 0, productionImport: "HOLD" };
  } catch (error) { primary = error; throw error; }
  finally { if (checkpoint) { try { assertCore(await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000 }), { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 }, config.rehearsal); } catch (cleanupError) { if (!primary) throw cleanupError; } } }
}

function normalize(result) {
  if (result?.status !== "CONTRACT_PASS" || result.cleanupState !== "cleaned" || result.residualCount !== 0 || result.productionImport !== "HOLD" || !Array.isArray(result.cycles) || result.cycles.length !== 2) fail("T3_ATTENDANCE_QUARANTINE_PAIR_RECEIPT_INVALID", result?.rehearsal ?? "unknown");
  return { sourceSnapshotSha256: result.sourceSnapshotSha256, sourceRestoreReceiptSha256: result.sourceRestoreReceiptSha256, sourceBusinessSha256: result.sourceBusinessSha256, cycles: result.cycles, productionImport: result.productionImport };
}

export async function runT3AttendanceQuarantinePair({ configAPath, configBPath, stageAPath, stageBPath }, { runner = runT3AttendanceQuarantineContinuous } = {}) {
  const configA = validateCoreT0T3Config(privateJson(configAPath, "T3_ATTENDANCE_QUARANTINE_CONFIG_A_UNSAFE")), configB = validateCoreT0T3Config(privateJson(configBPath, "T3_ATTENDANCE_QUARANTINE_CONFIG_B_UNSAFE"));
  validateCorePairIsolation(configA, configB);
  if (configA.profile !== "core_t0_t3" || configB.profile !== "core_t0_t3") fail("T3_ATTENDANCE_QUARANTINE_PAIR_PROFILE_INVALID", "core_t0_t3");
  const a = await runner({ configPath: configAPath, stagePath: stageAPath, durationMinutes: 300, pollSeconds: 1 }), b = await runner({ configPath: configBPath, stagePath: stageBPath, durationMinutes: 300, pollSeconds: 1 }), comparisonA = normalize(a), comparisonB = normalize(b);
  if (JSON.stringify(comparisonA) !== JSON.stringify(comparisonB)) fail("T3_ATTENDANCE_QUARANTINE_PAIR_MISMATCH", "A/B conservation receipt differs");
  return { formatVersion: 1, profile: "core_t0_t3", status: "CONTRACT_PASS", triple: configA.triple, comparison: { status: "PASS", ...comparisonA }, cleanup: [{ rehearsal: "A", status: a.status, residualCount: a.residualCount }, { rehearsal: "B", status: b.status, residualCount: b.residualCount }], productionImport: "HOLD" };
}

export function parseT3AttendanceQuarantinePairArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv, args = {}, allowed = new Set(["--config-a", "--config-b", "--stage-a", "--stage-b", "--summary"]);
  for (let index = 0; index < input.length; index += 2) { const key = input[index], value = input[index + 1]; if (!allowed.has(key) || !value || args[key]) fail("T3_ATTENDANCE_QUARANTINE_PAIR_ARGUMENT_INVALID", key); args[key] = resolve(value); }
  if (Object.keys(args).length !== 5) fail("T3_ATTENDANCE_QUARANTINE_PAIR_ARGUMENT_INVALID", "required");
  return { configAPath: args["--config-a"], configBPath: args["--config-b"], stageAPath: args["--stage-a"], stageBPath: args["--stage-b"], summaryPath: args["--summary"] };
}

function ensureSummary(path) { const absolute = resolve(path), parent = dirname(absolute); if (!privateDirectory(parent) || existsSync(absolute)) fail("T3_ATTENDANCE_QUARANTINE_PAIR_SUMMARY_UNSAFE", absolute); return absolute; }
function currentHead() { const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" }); if (result.status !== 0 || !/^[0-9a-f]{40}\n$/u.test(result.stdout ?? "")) fail("T3_ATTENDANCE_QUARANTINE_PAIR_GIT_INVALID", "HEAD"); return result.stdout.trim(); }

async function main() {
  const args = parseT3AttendanceQuarantinePairArgs(process.argv.slice(2)), configA = validateCoreT0T3Config(privateJson(args.configAPath, "T3_ATTENDANCE_QUARANTINE_CONFIG_A_UNSAFE")), configB = validateCoreT0T3Config(privateJson(args.configBPath, "T3_ATTENDANCE_QUARANTINE_CONFIG_B_UNSAFE"));
  if (configA.triple.codeSha !== currentHead() || configB.triple.codeSha !== currentHead()) fail("T3_ATTENDANCE_QUARANTINE_PAIR_TRIPLE_INVALID", "checkout code SHA differs from config");
  const summary = ensureSummary(args.summary);
  try { const result = await runT3AttendanceQuarantinePair(args); writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600); process.stdout.write(`${JSON.stringify({ status: result.status, summary, productionImport: "HOLD" })}\n`); }
  catch (error) { writeFileSync(summary, `${JSON.stringify({ formatVersion: 1, profile: "core_t0_t3", status: "HOLD", errorCode: safeCode(error), productionImport: "HOLD" }, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
