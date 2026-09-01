#!/usr/bin/env node
/* global process */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCorePairIsolation, validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { runT5NonfileContinuous } from "./run-t5-nonfile-continuous-lab.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const safeCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T5_NONFILE_PAIR_CONTINUOUS_FAILED";
const privateFile = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isFile() && (statSync(path).mode & 0o777) === 0o600;
const privateDirectory = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory() && (statSync(path).mode & 0o777) === 0o700;

function privateJson(path, label) {
  const absolute = resolve(path);
  if (!privateFile(absolute)) fail("T5_NONFILE_PAIR_ARTIFACT_UNSAFE", label);
  try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { fail("T5_NONFILE_PAIR_ARTIFACT_INVALID", label); }
}

function validatePair(configA, configB) {
  validateCorePairIsolation(configA, configB);
  if (configA.profile !== "core_t0_t2" || configB.profile !== "core_t0_t2") fail("T5_NONFILE_PAIR_PROFILE_INVALID", "core_t0_t2 required");
}

function normalizedReceipt(result) {
  if (result?.status !== "CONTRACT_PASS" || result.cleanupState !== "cleaned" || result.residualCount !== 0 || result.productionImport !== "HOLD"
    || !Array.isArray(result.receipts) || result.receipts.length !== 2) fail("T5_NONFILE_PAIR_RECEIPT_INVALID", result?.rehearsal ?? "unknown");
  return {
    sourceSnapshotSha256: result.sourceSnapshotSha256,
    sourceRestoreReceiptSha256: result.sourceRestoreReceiptSha256,
    nonfileBusinessSha256: result.nonfileBusinessSha256,
    receipts: result.receipts.map(cycle => ({
      load: { status: cycle?.load?.status, source: cycle?.load?.source, loaded: cycle?.load?.loaded, quarantined: cycle?.load?.quarantined },
      rollback: cycle?.rollback
    })),
    productionImport: result.productionImport
  };
}

function compare(resultA, resultB) {
  const a = normalizedReceipt(resultA), b = normalizedReceipt(resultB);
  if (JSON.stringify(a) !== JSON.stringify(b)) fail("T5_NONFILE_PAIR_MISMATCH", "A/B conservation receipt differs");
  return { status: "PASS", ...a };
}

export function parseT5NonfilePairArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv;
  const args = {}, allowed = new Set(["--config-a", "--config-b", "--stage", "--summary"]);
  for (let index = 0; index < input.length; index += 1) {
    const key = input[index], value = input[index + 1];
    if (!allowed.has(key) || !value || allowed.has(value)) fail("T5_NONFILE_PAIR_ARGUMENT_INVALID", key);
    const name = key.slice(2).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
    if (Object.hasOwn(args, name)) fail("T5_NONFILE_PAIR_ARGUMENT_INVALID", key);
    args[name] = resolve(value); index += 1;
  }
  for (const key of ["configA", "configB", "stage", "summary"]) if (!args[key]) fail("T5_NONFILE_PAIR_ARGUMENT_INVALID", key);
  return args;
}

export async function runT5NonfilePairContinuous({ configAPath, configBPath, stagePath }, { runner = runT5NonfileContinuous } = {}) {
  const configA = validateCoreT0T3Config(privateJson(configAPath, "config A"));
  const configB = validateCoreT0T3Config(privateJson(configBPath, "config B"));
  validatePair(configA, configB);
  const cleanup = [];
  let resultA;
  try {
    resultA = await runner({ configPath: configAPath, stagePath, durationMinutes: 300, pollSeconds: 1 });
    const resultB = await runner({ configPath: configBPath, stagePath, durationMinutes: 300, pollSeconds: 1 });
    const comparison = compare(resultA, resultB);
    return { formatVersion: 1, profile: "core_t0_t2", status: "CONTRACT_PASS", triple: configA.triple, comparison, cleanup: [
      { rehearsal: "A", status: resultA.status, residualCount: resultA.residualCount },
      { rehearsal: "B", status: resultB.status, residualCount: resultB.residualCount }
    ], productionImport: "HOLD" };
  } catch (error) {
    if (resultA) cleanup.push({ rehearsal: "A", status: resultA.status, residualCount: resultA.residualCount });
    throw error;
  }
}

function ensureSummary(path) {
  const absolute = resolve(path), parent = dirname(absolute);
  if (!privateDirectory(parent) || existsSync(absolute)) fail("T5_NONFILE_PAIR_SUMMARY_UNSAFE", absolute);
  return absolute;
}

function currentHead() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
  if (result.status !== 0 || !/^[0-9a-f]{40}\n$/u.test(result.stdout ?? "")) fail("T5_NONFILE_PAIR_GIT_INVALID", "HEAD");
  return result.stdout.trim();
}

async function main() {
  const args = parseT5NonfilePairArgs(process.argv.slice(2));
  const configA = validateCoreT0T3Config(privateJson(args.configA, "config A"));
  const configB = validateCoreT0T3Config(privateJson(args.configB, "config B"));
  const head = currentHead();
  if (configA.triple.codeSha !== head || configB.triple.codeSha !== head) fail("T5_NONFILE_PAIR_TRIPLE_INVALID", "checkout code SHA differs from config");
  const summary = ensureSummary(args.summary);
  try {
    const result = await runT5NonfilePairContinuous({ configAPath: args.configA, configBPath: args.configB, stagePath: args.stage });
    writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600);
    if (!privateFile(summary)) fail("T5_NONFILE_PAIR_SUMMARY_UNSAFE", summary);
    process.stdout.write(`${JSON.stringify({ status: result.status, summary, productionImport: "HOLD" })}\n`);
  } catch (error) {
    const result = { formatVersion: 1, profile: "core_t0_t2", status: "HOLD", errorCode: safeCode(error), productionImport: "HOLD" };
    writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600);
    if (!privateFile(summary)) fail("T5_NONFILE_PAIR_SUMMARY_UNSAFE", summary);
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
