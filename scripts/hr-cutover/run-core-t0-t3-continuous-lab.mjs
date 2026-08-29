#!/usr/bin/env node
/* global process */
import { chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCoreT0MachinePackage } from "./build-core-t0-machine-package.mjs";
import { CoreT0T3Lifecycle, readCoreMachinePackage, validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { createCoreT0T3Adapters } from "./core-drivers/postgres-lab-v1.mjs";

const MIN_DURATION_MINUTES = 300;
const CHECKPOINT_STATES = new Set(["review_hold", "rollback_ready", "cleaned"]);
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const directoryMode = path => (statSync(path).mode & 0o777) === 0o700;
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const elapsed = startedAt => Date.now() - startedAt;
const delay = milliseconds => new Promise(resolveDelay => setTimeout(resolveDelay, milliseconds));
const safeErrorCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "CORE_CONTINUOUS_STAGE_FAILED";

export function normalizeCoreContinuousStopAfter(value) {
  if (value === undefined || value === null) return null;
  if (!CHECKPOINT_STATES.has(value)) fail("CORE_CONTINUOUS_STOP_AFTER_INVALID", String(value));
  return value;
}

function privateJson(path) {
  const requested = resolve(path);
  if (!existsSync(requested) || lstatSync(requested).isSymbolicLink() || !statSync(requested).isFile() || !privateMode(requested)) fail("CORE_CONTINUOUS_CONFIG_UNSAFE", requested);
  try { return JSON.parse(readFileSync(requested, "utf8")); } catch { fail("CORE_CONTINUOUS_CONFIG_INVALID", requested); }
}

function writePrivate(path, value, { append = false } = {}) {
  if (existsSync(path) && (lstatSync(path).isSymbolicLink() || !statSync(path).isFile() || !privateMode(path))) fail("CORE_CONTINUOUS_ARTIFACT_UNSAFE", path);
  const payload = typeof value === "string" ? value : `${JSON.stringify(value)}\n`;
  const descriptor = openSync(path, append ? "a" : "w", 0o600);
  try { writeFileSync(descriptor, payload); } finally { try { closeSync(descriptor); } catch {} }
  chmodSync(path, 0o600);
  if (!privateMode(path)) fail("CORE_CONTINUOUS_ARTIFACT_UNSAFE", path);
}

function coreAuditPaths(config) {
  const auditRoot = join(dirname(config.target.runtimeRoot), "audit");
  return {
    auditRoot,
    machineRoot: join(auditRoot, "machine-package"),
    lock: join(auditRoot, "continuous-runner.lock"),
    events: join(auditRoot, "continuous-runner-events.jsonl"),
    summary: join(auditRoot, "continuous-runner-summary.json")
  };
}

function ensurePrivateDirectory(path) {
  if (!existsSync(path)) mkdirSync(path, { mode: 0o700 });
  if (lstatSync(path).isSymbolicLink() || !statSync(path).isDirectory() || !directoryMode(path)) fail("CORE_CONTINUOUS_DIRECTORY_UNSAFE", path);
}

function acquireLock(path) {
  if (existsSync(path)) {
    const prior = privateJson(path);
    if (Number.isInteger(prior.pid) && prior.pid > 0) {
      try { process.kill(prior.pid, 0); fail("CORE_CONTINUOUS_ALREADY_RUNNING", String(prior.pid)); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    unlinkSync(path);
  }
  writeFileSync(path, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
  if (!privateMode(path)) fail("CORE_CONTINUOUS_LOCK_UNSAFE", path);
}

function machinePackage(config, machineRoot) {
  const paths = { decision: join(machineRoot, "decision.json"), privatePayload: join(machineRoot, "payload.json"), machineAttestation: join(machineRoot, "machine-attestation.json") };
  if (!Object.values(paths).every(existsSync)) buildCoreT0MachinePackage(config, machineRoot);
  return readCoreMachinePackage(paths, config);
}

export async function advanceCoreT0T3Lifecycle(lifecycle, { machineRoot, packageFactory = machinePackage } = {}) {
  if (lifecycle.state === "planned") return { action: "provision", result: lifecycle.provision() };
  if (["provisioned", "extracting"].includes(lifecycle.state)) return { action: "extract", result: lifecycle.extract() };
  if (["review_hold", "loading"].includes(lifecycle.state)) return { action: "resume", result: lifecycle.resume(packageFactory(lifecycle.config, machineRoot)) };
  if (["rollback_ready", "rolling_back"].includes(lifecycle.state)) return { action: "rollback", result: lifecycle.rollback() };
  if (["rolled_back", "recovery"].includes(lifecycle.state)) return { action: "cleanup", result: lifecycle.cleanup() };
  if (lifecycle.state === "cleaned") return { action: "complete", result: { state: "cleaned", productionImport: "HOLD" } };
  fail("CORE_CONTINUOUS_STATE_UNSUPPORTED", lifecycle.state);
}

export async function runCoreT0T3ContinuousLab({ configPath, durationMinutes = MIN_DURATION_MINUTES, pollMilliseconds = 15000, stopAfter = null, adapterFactory = createCoreT0T3Adapters, now = () => Date.now(), pause = delay } = {}) {
  if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION_MINUTES) fail("CORE_CONTINUOUS_DURATION_INVALID", `minimum ${MIN_DURATION_MINUTES} minutes`);
  if (!Number.isInteger(pollMilliseconds) || pollMilliseconds < 1000 || pollMilliseconds > 60000) fail("CORE_CONTINUOUS_POLL_INVALID", String(pollMilliseconds));
  stopAfter = normalizeCoreContinuousStopAfter(stopAfter);
  const config = validateCoreT0T3Config(privateJson(configPath));
  const paths = coreAuditPaths(config);
  ensurePrivateDirectory(paths.auditRoot); ensurePrivateDirectory(paths.machineRoot); acquireLock(paths.lock);
  const startedAt = now(), deadline = startedAt + durationMinutes * 60 * 1000;
  const event = body => {
    const record = { at: new Date().toISOString(), ...body, productionImport: "HOLD" };
    writePrivate(paths.events, record, { append: true });
    process.stdout.write(`${JSON.stringify(record)}\n`);
  };
  const finish = body => {
    const result = { ...body, elapsedMilliseconds: now() - startedAt, productionImport: "HOLD" };
    writePrivate(paths.summary, result);
    return result;
  };
  try {
    for (;;) {
      if (now() >= deadline) return finish({ status: "TIME_BUDGET_EXHAUSTED", state: "preserved_for_resume" });
      const lifecycle = new CoreT0T3Lifecycle(config, await adapterFactory(config));
      const before = lifecycle.state;
      try {
        const advanced = await advanceCoreT0T3Lifecycle(lifecycle, { machineRoot: paths.machineRoot });
        event({ stateBefore: before, action: advanced.action, stateAfter: advanced.result.state });
        if (stopAfter === advanced.result.state) return finish({ status: "CHECKPOINT_READY", state: stopAfter, residualCount: advanced.result.residualCount ?? null });
        if (advanced.result.state === "cleaned") return finish({ status: "CONTRACT_PASS", state: "cleaned", residualCount: advanced.result.residualCount ?? 0 });
      } catch (error) {
        const errorCode = safeErrorCode(error);
        event({ stateBefore: before, action: "failed", errorCode });
        try {
          const recovery = lifecycle.recover();
          event({ stateBefore: lifecycle.state, action: "recovery", stateAfter: recovery.state });
          return finish({ status: "RECOVERED_FAILURE", state: recovery.state, errorCode, residualCount: recovery.residualCount ?? null });
        } catch (recoveryError) {
          const recoveryErrorCode = safeErrorCode(recoveryError);
          event({ stateBefore: lifecycle.state, action: "recovery_failed", errorCode: recoveryErrorCode });
          return finish({ status: "RECOVERY_FAILED", state: lifecycle.state, errorCode, recoveryErrorCode });
        }
      }
      await pause(Math.min(pollMilliseconds, Math.max(0, deadline - now())));
    }
  } finally {
    if (existsSync(paths.lock)) unlinkSync(paths.lock);
  }
}

function parseArgs(argv) {
  const args = {}, allowed = new Set(["--config", "--duration-minutes", "--poll-seconds", "--stop-after"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!allowed.has(key) || !argv[index + 1] || allowed.has(argv[index + 1])) fail("CORE_CONTINUOUS_ARGUMENT_INVALID", key);
    const name = key.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    if (Object.hasOwn(args, name)) fail("CORE_CONTINUOUS_ARGUMENT_INVALID", key);
    args[name] = argv[++index];
  }
  if (!args.config) fail("CORE_CONTINUOUS_ARGUMENT_INVALID", "--config");
  return { configPath: args.config, durationMinutes: args.durationMinutes ? Number(args.durationMinutes) : MIN_DURATION_MINUTES, pollMilliseconds: args.pollSeconds ? Number(args.pollSeconds) * 1000 : 15000, stopAfter: normalizeCoreContinuousStopAfter(args.stopAfter) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCoreT0T3ContinuousLab(parseArgs(process.argv.slice(2))).then(result => process.stdout.write(`${JSON.stringify({ status: result.status, state: result.state, productionImport: result.productionImport })}\n`)).catch(error => {
    process.stderr.write(`${safeErrorCode(error)}\n`); process.exitCode = 1;
  });
}
