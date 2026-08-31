#!/usr/bin/env node
/* global process */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, lstatSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCorePairIsolation, validateCoreT0T3Config } from "./core-t0-t3-rehearsal.mjs";
import { runT5FileOwnerEvidenceLab } from "./run-t5-file-owner-evidence-lab.mjs";

const ROOT = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const TYPES = Object.freeze({ document: "documentStageSha256", photo: "photoStageSha256" });
const fail = (code, detail) => { const error = new Error(`${code}: ${detail}`); error.code = code; throw error; };
const safeCode = error => /^[A-Z][A-Z0-9_]+$/u.test(error?.code ?? "") ? error.code : "T5_FILE_PAIR_CONTINUOUS_FAILED";
const privateFile = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isFile() && (statSync(path).mode & 0o777) === 0o600;
const privateDirectory = path => existsSync(path) && !lstatSync(path).isSymbolicLink() && statSync(path).isDirectory() && (statSync(path).mode & 0o777) === 0o700;

function type(kind) { if (!Object.hasOwn(TYPES, kind)) fail("T5_FILE_PAIR_KIND_INVALID", String(kind)); return TYPES[kind]; }
function privateJson(path, code) { const absolute = resolve(path); if (!privateFile(absolute)) fail(code, absolute); try { return JSON.parse(readFileSync(absolute, "utf8")); } catch { fail(code, absolute); } }
function validatePair(configA, configB) { validateCorePairIsolation(configA, configB); if (configA.profile !== "core_t0_t2" || configB.profile !== "core_t0_t2") fail("T5_FILE_PAIR_PROFILE_INVALID", "core_t0_t2"); }

function normalize(result, kind) {
  const stageKey = type(kind), receipts = result?.receipts;
  if (result?.status !== "CONTRACT_PASS" || result.cleanupState !== "cleaned" || result.residualCount !== 0 || result.productionImport !== "HOLD" || typeof result[stageKey] !== "string" || !Array.isArray(receipts) || receipts.length !== 2) fail("T5_FILE_PAIR_RECEIPT_INVALID", result?.rehearsal ?? "unknown");
  return { sourceSnapshotSha256: result.sourceSnapshotSha256, sourceRestoreReceiptSha256: result.sourceRestoreReceiptSha256, [stageKey]: result[stageKey], receipts: receipts.map(cycle => ({ load: { status: cycle?.load?.status, source: cycle?.load?.source, loaded: cycle?.load?.loaded, quarantined: cycle?.load?.quarantined }, rollback: cycle?.rollback?.status })), productionImport: result.productionImport };
}

export async function runT5FileOwnerEvidencePair({ kind, configAPath, configBPath, stageAPath, stageBPath }, { runner = runT5FileOwnerEvidenceLab } = {}) {
  type(kind);
  const configA = validateCoreT0T3Config(privateJson(configAPath, "T5_FILE_PAIR_CONFIG_A_UNSAFE")), configB = validateCoreT0T3Config(privateJson(configBPath, "T5_FILE_PAIR_CONFIG_B_UNSAFE"));
  validatePair(configA, configB);
  const a = await runner({ kind, configPath: configAPath, stage: stageAPath, durationMinutes: 300, pollSeconds: 1 }), b = await runner({ kind, configPath: configBPath, stage: stageBPath, durationMinutes: 300, pollSeconds: 1 }), comparisonA = normalize(a, kind), comparisonB = normalize(b, kind);
  if (JSON.stringify(comparisonA) !== JSON.stringify(comparisonB)) fail("T5_FILE_PAIR_MISMATCH", "A/B conservation receipt differs");
  return { formatVersion: 1, kind, profile: "core_t0_t2", status: "CONTRACT_PASS", triple: configA.triple, comparison: { status: "PASS", ...comparisonA }, cleanup: [{ rehearsal: "A", status: a.status, residualCount: a.residualCount }, { rehearsal: "B", status: b.status, residualCount: b.residualCount }], productionImport: "HOLD" };
}

export function parseT5FileOwnerEvidencePairArgs(argv) {
  const input = argv[0] === "--" ? argv.slice(1) : argv, values = {}, allowed = new Set(["--kind", "--config-a", "--config-b", "--stage-a", "--stage-b", "--summary"]);
  for (let index = 0; index < input.length; index += 2) { const key = input[index], value = input[index + 1]; if (!allowed.has(key) || !value || values[key]) fail("T5_FILE_PAIR_ARGUMENT_INVALID", key); values[key] = key === "--kind" ? value : resolve(value); }
  if (Object.keys(values).length !== allowed.size) fail("T5_FILE_PAIR_ARGUMENT_INVALID", "required"); type(values["--kind"]);
  return { kind: values["--kind"], configAPath: values["--config-a"], configBPath: values["--config-b"], stageAPath: values["--stage-a"], stageBPath: values["--stage-b"], summaryPath: values["--summary"] };
}

function currentHead() { const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8", stdio: "pipe" }); if (result.status !== 0 || !/^[0-9a-f]{40}\n$/u.test(result.stdout ?? "")) fail("T5_FILE_PAIR_GIT_INVALID", "HEAD"); return result.stdout.trim(); }
function ensureSummary(path) { const absolute = resolve(path), parent = dirname(absolute); if (!privateDirectory(parent) || existsSync(absolute)) fail("T5_FILE_PAIR_SUMMARY_UNSAFE", absolute); return absolute; }

async function main() {
  const args = parseT5FileOwnerEvidencePairArgs(process.argv.slice(2)), configA = validateCoreT0T3Config(privateJson(args.configAPath, "T5_FILE_PAIR_CONFIG_A_UNSAFE")), configB = validateCoreT0T3Config(privateJson(args.configBPath, "T5_FILE_PAIR_CONFIG_B_UNSAFE"));
  if (configA.triple.codeSha !== currentHead() || configB.triple.codeSha !== currentHead()) fail("T5_FILE_PAIR_TRIPLE_INVALID", "checkout code SHA differs from config");
  const summary = ensureSummary(args.summaryPath);
  try { const result = await runT5FileOwnerEvidencePair(args); writeFileSync(summary, `${JSON.stringify(result, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600); process.stdout.write(`${JSON.stringify({ status: result.status, summary, productionImport: "HOLD" })}\n`); }
  catch (error) { writeFileSync(summary, `${JSON.stringify({ formatVersion: 1, kind: args.kind, status: "HOLD", errorCode: safeCode(error), productionImport: "HOLD" }, null, 2)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(summary, 0o600); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { process.stderr.write(`${safeCode(error)}\n`); process.exitCode = 1; });
