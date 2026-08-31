#!/usr/bin/env node
/* global process */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { runCoreT0T3ContinuousLab } from "./run-core-t0-t3-continuous-lab.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const MIN_DURATION_MINUTES = 300;
const SHA256 = /^[0-9a-f]{64}$/u;
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const directoryMode = path => (statSync(path).mode & 0o777) === 0o700;
const safeCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T5_FILE_CONTINUOUS_FAILED";

function privateJson(path, code) {
  const absolute = resolve(path);
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isFile() || !privateMode(absolute)) fail(code, absolute);
  try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { fail(code, absolute); }
}

function stage(path) {
  const absolute = resolve(path), manifestPath = resolve(absolute, "manifest.json"), evidencePath = resolve(absolute, "photo-owner-evidence.jsonl");
  if (!existsSync(absolute) || lstatSync(absolute).isSymbolicLink() || !statSync(absolute).isDirectory() || !directoryMode(absolute)
    || !existsSync(manifestPath) || lstatSync(manifestPath).isSymbolicLink() || !statSync(manifestPath).isFile() || !privateMode(manifestPath)
    || !existsSync(evidencePath) || lstatSync(evidencePath).isSymbolicLink() || !statSync(evidencePath).isFile() || !privateMode(evidencePath)) fail("T5_FILE_STAGE_UNSAFE", absolute);
  const manifest = privateJson(manifestPath, "T5_FILE_STAGE_INVALID"), domain = manifest?.domains?.photo;
  if (manifest.artifactKind !== "yuzhou_t5_photo_owner_stage" || manifest.productionImport !== "HOLD"
    || manifest.sourceRows !== 2155 || manifest.excludedEmptyRows !== 794 || domain?.rows !== 2155
    || domain?.file !== "photo-owner-evidence.jsonl" || ![manifest.sourceSnapshotSha256, manifest.sourceRestoreReceiptSha256, manifest.stageSha256, domain.fileSha256].every(value => SHA256.test(value ?? ""))) fail("T5_FILE_STAGE_INVALID", "photo owner manifest boundary");
  return { path: absolute, manifest };
}

function currentHead(spawn = spawnSync) {
  const result = spawn("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  if (result.error || result.status !== 0 || !/^[0-9a-f]{40}\n$/u.test(result.stdout ?? "")) fail("T5_FILE_GIT_INVALID", "HEAD");
  return result.stdout.trim();
}

function summaryPath(config) {
  const auditRoot = join(dirname(config.target.runtimeRoot), "audit"), path = join(auditRoot, "t5-photo-owner-evidence-continuous-summary.json");
  if (!existsSync(auditRoot) || lstatSync(auditRoot).isSymbolicLink() || !statSync(auditRoot).isDirectory() || !directoryMode(auditRoot) || existsSync(path)) fail("T5_FILE_AUDIT_UNSAFE", path);
  return path;
}

function writeSummary(path, value) {
  writeFileSync(path, `${JSON.stringify(value)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" }); chmodSync(path, 0o600);
  if (!privateMode(path)) fail("T5_FILE_AUDIT_UNSAFE", path);
}

function childEnvironment(config, additions = {}) {
  const inherited = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "DOCKER_HOST", "COLIMA_HOME"].flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  return {
    ...inherited,
    ALLOW_YUZHOU_MIGRATION: "yes",
    YUZHOU_T5_FILE_MODE: "isolated_rehearsal",
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
  if (result.error || result.status !== 0) fail("T5_FILE_CHILD_FAILED", script);
  return String(result.stdout ?? "").trim();
}

function assertLoadReceipt(output, runId) {
  const match = /^(succeeded)\|(2155)\|(\d+)\|(\d+)$/.exec(output);
  if (!match || Number(match[3]) + Number(match[4]) !== 2155) fail("T5_FILE_LOAD_RECEIPT_INVALID", runId);
  return { runId, status: match[1], source: Number(match[2]), loaded: Number(match[3]), quarantined: Number(match[4]) };
}

function assertRollbackReceipt(output, runId) {
  if (output !== "rolled_back") fail("T5_FILE_ROLLBACK_RECEIPT_INVALID", runId);
  return { runId, status: output };
}

function assertCheckpoint(result) {
  if (result?.status !== "CHECKPOINT_READY" || result?.state !== "rollback_ready") fail("T5_FILE_CORE_CHECKPOINT_FAILED", "core_t0_t2");
}

function assertCleanup(result) {
  if (result?.status !== "CONTRACT_PASS" || result?.state !== "cleaned" || result?.residualCount !== 0) fail("T5_FILE_CORE_CLEANUP_FAILED", "core_t0_t2");
}

export function parseT5PhotoOwnerEvidenceLabArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv, args = {}, allowed = new Set(["--config", "--photo-owner-stage", "--duration-minutes", "--poll-seconds"]);
  for (let index = 0; index < input.length; index += 1) {
    const key = input[index];
    if (!allowed.has(key) || !input[index + 1] || allowed.has(input[index + 1])) fail("T5_FILE_ARGUMENT_INVALID", key);
    const parsedName = key.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    const name = parsedName === "config" ? "configPath" : parsedName;
    if (Object.hasOwn(args, name)) fail("T5_FILE_ARGUMENT_INVALID", key);
    args[name] = name.endsWith("Path") || name === "photoOwnerStage" ? resolve(input[++index]) : input[++index];
  }
  if (!args.configPath || !args.photoOwnerStage) fail("T5_FILE_ARGUMENT_INVALID", "config and photo-owner-stage are required");
  args.durationMinutes = Number(args.durationMinutes ?? MIN_DURATION_MINUTES); args.pollSeconds = Number(args.pollSeconds ?? 1);
  if (!Number.isInteger(args.durationMinutes) || args.durationMinutes < MIN_DURATION_MINUTES) fail("T5_FILE_DURATION_INVALID", String(args.durationMinutes));
  if (!Number.isInteger(args.pollSeconds) || args.pollSeconds < 1 || args.pollSeconds > 60) fail("T5_FILE_POLL_INVALID", String(args.pollSeconds));
  return args;
}

export async function runT5PhotoOwnerEvidenceLab({ configPath, photoOwnerStage, durationMinutes = MIN_DURATION_MINUTES, pollSeconds = 1 }, { coreRunner = runCoreT0T3ContinuousLab, spawn = spawnSync, head = currentHead } = {}) {
  const config = validateCoreT0T3Config(privateJson(configPath, "T5_FILE_CONFIG_UNSAFE"));
  if (config.profile !== "core_t0_t2" || config.productionImport !== "HOLD" || config.triple.codeSha !== head(spawn)) fail("T5_FILE_CONFIG_INVALID", "sealed core_t0_t2 HOLD config required");
  const input = stage(photoOwnerStage);
  if (input.manifest.sourceSnapshotSha256 !== config.triple.sourceSnapshotHash || input.manifest.sourceRestoreReceiptSha256 !== config.source.sourceRestoreReceiptSha256) fail("T5_FILE_SOURCE_BINDING_DRIFT", "photo owner stage differs from core config");
  const audit = summaryPath(config);
  const runStem = config.runId.toLowerCase().replace(/^yzcore-/, "").replace(/-r[ab]$/u, "").slice(0, 35);
  const runs = ["load", "reload"].map(suffix => `yzphoto-${runStem}-${suffix}`.slice(0, 64));
  if (new Set(runs).size !== 2 || runs.some(runId => !/^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/u.test(runId))) fail("T5_FILE_RUN_ID_INVALID", config.runId);
  const t0RunId = `${config.runId}-t0`;
  let checkpoint = false, primary = null;
  const receipts = [];
  try {
    assertCheckpoint(await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000, stopAfter: "rollback_ready" }));
    checkpoint = true;
    for (const runId of runs) {
      const environment = childEnvironment(config, { YUZHOU_T5_FILE_STAGING_DIR: input.path, YUZHOU_T5_FILE_RUN_ID: runId, YUZHOU_T0_RUN_ID: t0RunId });
      const cycle = { load: assertLoadReceipt(execute("scripts/load-yuzhou-t5-photo-owner-evidence.sh", environment, spawn), runId), rollback: null };
      receipts.push(cycle);
      cycle.rollback = assertRollbackReceipt(execute("scripts/rollback-yuzhou-t5-photo-owner-evidence.sh", { ...environment, ALLOW_YUZHOU_ROLLBACK: "yes" }, spawn), runId);
    }
    const cleanup = await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000 });
    assertCleanup(cleanup); checkpoint = false;
    const result = { formatVersion: 1, status: "CONTRACT_PASS", profile: config.profile, rehearsal: config.rehearsal, t0RunId, sourceSnapshotSha256: config.triple.sourceSnapshotHash, sourceRestoreReceiptSha256: config.source.sourceRestoreReceiptSha256, photoStageSha256: input.manifest.stageSha256, receipts, cleanupState: cleanup.state, residualCount: cleanup.residualCount, productionImport: "HOLD" };
    writeSummary(audit, result);
    return result;
  } catch (error) { primary = error; writeSummary(audit, { formatVersion: 1, status: "HOLD", profile: config.profile, rehearsal: config.rehearsal, errorCode: safeCode(error), productionImport: "HOLD" }); throw error; }
  finally {
    if (checkpoint) {
      for (const item of receipts.toReversed()) {
        if (item.rollback?.status === "rolled_back") continue;
        try { assertRollbackReceipt(execute("scripts/rollback-yuzhou-t5-photo-owner-evidence.sh", childEnvironment(config, { ALLOW_YUZHOU_ROLLBACK: "yes", YUZHOU_T5_FILE_STAGING_DIR: input.path, YUZHOU_T5_FILE_RUN_ID: item.load.runId, YUZHOU_T0_RUN_ID: t0RunId }), spawn), item.load.runId); } catch (rollbackError) { if (!primary) primary = rollbackError; }
      }
      try { assertCleanup(await coreRunner({ configPath, durationMinutes, pollMilliseconds: pollSeconds * 1000 })); } catch (cleanupError) { if (!primary) primary = cleanupError; }
    }
    if (primary) throw primary;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runT5PhotoOwnerEvidenceLab(parseT5PhotoOwnerEvidenceLabArgs(process.argv.slice(2))).then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
}
