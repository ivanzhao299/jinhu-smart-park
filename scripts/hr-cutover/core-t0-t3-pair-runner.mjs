#!/usr/bin/env node
/* global URL, process */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  CoreT0T3Error,
  CoreT0T3Lifecycle,
  readCoreMachinePackage,
  runCoreT0T3Pair,
  validateCoreMachinePairIsolation,
  validateCorePairIsolation
} from "./core-t0-t3-rehearsal.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const DRIVER_ROOT = resolve(ROOT, "scripts/hr-cutover/core-drivers");
const fail = (code, detail) => { throw new CoreT0T3Error(code, detail); };
const inside = (parent, child) => {
  const rel = relative(parent, child);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== ".." && !rel.startsWith(sep);
};
const privateJson = path => {
  const requested = resolve(path), requestedInfo = lstatSync(requested), candidate = realpathSync(requested), info = statSync(candidate);
  if (requestedInfo.isSymbolicLink() || !info.isFile() || info.nlink !== 1 || (info.mode & 0o777) !== 0o600) fail("CORE_PRIVATE_FILE_UNSAFE", path);
  try { return JSON.parse(readFileSync(candidate, "utf8")); } catch { fail("CORE_PRIVATE_FILE_INVALID", path); }
};

function parse(argv) {
  const args = {};
  const valueArgs = new Set(["--config-a", "--config-b", "--driver", "--summary", "--decision-a", "--payload-a", "--machine-attestation-a", "--decision-b", "--payload-b", "--machine-attestation-b"]);
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!valueArgs.has(key)) fail("CORE_RUNNER_ARGUMENT_INVALID", key);
    const name = key.slice(2).replace(/-([a-z])/gu, (_match, value) => value.toUpperCase());
    if (Object.hasOwn(args, name) || index + 1 >= argv.length || valueArgs.has(argv[index + 1])) fail("CORE_RUNNER_ARGUMENT_INVALID", key);
    args[name] = argv[++index];
  }
  for (const key of ["configA", "configB", "driver", "summary", "decisionA", "payloadA", "machineAttestationA", "decisionB", "payloadB", "machineAttestationB"]) if (!args[key]) fail("CORE_RUNNER_ARGUMENT_INVALID", key);
  return args;
}

async function loadDriver(path) {
  const candidate = realpathSync(resolve(path));
  if (!inside(DRIVER_ROOT, candidate) || !candidate.endsWith(".mjs")) fail("CORE_DRIVER_UNTRUSTED", "driver must be a committed module below scripts/hr-cutover/core-drivers");
  const module = await import(pathToFileURL(candidate).href);
  if (typeof module.createCoreT0T3Adapters !== "function") fail("CORE_DRIVER_INVALID", "createCoreT0T3Adapters export required");
  return module.createCoreT0T3Adapters;
}

export async function executeCoreT0T3PairFromFiles(options, { adapterFactory } = {}) {
  const configA = privateJson(options.configA), configB = privateJson(options.configB);
  validateCorePairIsolation(configA, configB);
  const factory = adapterFactory ?? await loadDriver(options.driver);
  const packageA = readCoreMachinePackage({ decision: options.decisionA, privatePayload: options.payloadA, machineAttestation: options.machineAttestationA }, configA);
  const packageB = readCoreMachinePackage({ decision: options.decisionB, privatePayload: options.payloadB, machineAttestation: options.machineAttestationB }, configB);
  validateCoreMachinePairIsolation(packageA, packageB);
  const lifecycleA = new CoreT0T3Lifecycle(configA, await factory(configA));
  const lifecycleB = new CoreT0T3Lifecycle(configB, await factory(configB));
  return runCoreT0T3Pair({ lifecycleA, lifecycleB, machinePackageA: packageA, machinePackageB: packageB });
}

async function main() {
  const args = parse(process.argv.slice(2));
  const git = spawnSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: ROOT, encoding: "utf8" });
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
  if (git.status !== 0 || git.stdout.trim() || head.status !== 0) fail("CORE_WORKTREE_NOT_SEALED", "clean committed checkout required");
  const configA = privateJson(args.configA), configB = privateJson(args.configB);
  if (configA.triple?.codeSha !== head.stdout.trim() || configB.triple?.codeSha !== head.stdout.trim()) fail("CORE_TRIPLE_INVALID", "config code SHA differs from checkout");
  const summary = resolve(args.summary), parent = realpathSync(dirname(summary));
  if (!inside(parent, summary) || existsSync(summary) || (statSync(parent).mode & 0o777) !== 0o700) fail("CORE_SUMMARY_UNSAFE", "new summary below a 0700 directory required");
  const result = await executeCoreT0T3PairFromFiles(args);
  writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  chmodSync(summary, 0o600);
  process.stdout.write(`${JSON.stringify({ status: result.status, summary, productionImport: "HOLD" })}\n`);
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { process.stderr.write(`${error.code ?? "CORE_RUNNER_FAILED"}: ${error.message.replace(/^.*?: /u, "")}\n`); process.exitCode = 1; });
}
