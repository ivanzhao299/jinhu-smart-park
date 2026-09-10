#!/usr/bin/env node
import process from "node:process";
import { Buffer } from "node:buffer";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { execFile } from "node:child_process";
import { parseYuzhouLabArgs, validateYuzhouLabConfig, readYuzhouLabFinalReceipt } from "./run-yuzhou-real-bundle-lab.mjs";
import { assertYuzhouLabResourcePair } from "./yuzhou-lab-resource-descriptor.mjs";
import { readProductionImportPrivateBytes as read, parseProductionImportPrivateJson as parse,
  productionImportPrivateDirectory as directory, measureProductionImportPrivateJson as measure,
  emitProductionImportPrivateArtifacts as emit } from "./materialize-production-import-frozen-decisions.mjs";
const LIMIT = 65536;
const fail = () => { throw new Error("LAB_PAIR_INVALID"); };
const exact = (v, keys) => { if (!v || typeof v !== "object" || Array.isArray(v) || Object.keys(v).sort().join() !== [...keys].sort().join()) fail(); };
const same = (a, b) => measure(a, LIMIT).sha256 === measure(b, LIMIT).sha256;
const CLI = fileURLToPath(new URL("./run-yuzhou-real-bundle-lab.mjs", import.meta.url));
function executeSide(file, args, options) {
  return new Promise((resolveResult, reject) => {
    let cancelled = false;
    const forward = signal => { cancelled = true; child.kill(signal); };
    const interrupt = () => forward("SIGINT"), terminate = () => forward("SIGTERM");
    const child = execFile(file, args, options, (error, stdout) => {
      process.off("SIGINT", interrupt); process.off("SIGTERM", terminate);
      if (error || cancelled) reject(new Error("LAB_PAIR_SIDE_PROCESS_FAILED")); else resolveResult({ stdout });
    });
    process.on("SIGINT", interrupt); process.on("SIGTERM", terminate);
  });
}
/** Fixed executable/argv; each call creates a fresh Node process. Never expose stderr. */
export async function runYuzhouPairSideProcess(input, { execute = executeSide } = {}) {
  try {
    exact(input, ["mode", "configPath", "configSha256"]); if (input.mode !== "execute-isolated") fail();
    const args = ["--execute-isolated", "--config", input.configPath, "--config-sha256", input.configSha256];
    parseYuzhouLabArgs(args);
    const { stdout } = await execute(process.execPath, [CLI, ...args], { encoding: "utf8", maxBuffer: 1024 * 1024, windowsHide: true });
    const value = JSON.parse(stdout);
    if (value.status !== "LAB_PASS" || value.finalReceiptPersisted !== true || !/^[a-f0-9]{64}$/u.test(value.finalReceiptSha256 ?? "")) fail();
    return { status: "LAB_PASS", finalReceiptPersisted: true, finalReceiptSha256: value.finalReceiptSha256 };
  } catch { return { status: "FAILED", failureCode: "LAB_PAIR_SIDE_PROCESS_FAILED" }; }
}
function load(path, expected) {
  const parts = [];
  try {
    const result = read(path, LIMIT, { bytes: 0, maximum: LIMIT }, p => parts.push(Buffer.from(p)));
    if (expected !== undefined && result.sha256 !== expected) fail();
    const bytes = Buffer.concat(parts); try { return parse(bytes); } finally { bytes.fill(0); }
  } finally { parts.forEach(p => p.fill(0)); }
}
/** Sequential execution only. The injected runner is for synthetic contracts, never CLI input. */
export async function runYuzhouRetainedBundlePair(input, { runSide = runYuzhouPairSideProcess } = {}) {
  let step = "CONFIG"; const verified = [];
  try {
    const existing = input && Object.hasOwn(input, "existingReceipts");
    exact(input, ["A", "B", "outputDirectory", ...(existing ? ["existingReceipts"] : [])]);
    input = JSON.parse(JSON.stringify(input));
    if (existing) {
      exact(input.existingReceipts, ["A", "B"]);
      for (const side of ["A", "B"]) {
        exact(input.existingReceipts[side], ["receiptSha256", "manifestSha256"]);
        if (!Object.values(input.existingReceipts[side]).every(v => /^[a-f0-9]{64}$/u.test(v ?? ""))) fail();
      }
    }
    const configs = {};
    for (const side of ["A", "B"]) {
      exact(input[side], ["path", "sha256"]); if (!/^[a-f0-9]{64}$/u.test(input[side].sha256 ?? "")) fail();
      configs[side] = validateYuzhouLabConfig(load(input[side].path, input[side].sha256));
      if (configs[side].pairMaterials?.side !== side) fail();
    }
    const a = configs.A, b = configs.B;
    assertYuzhouLabResourcePair(a.resourceDescriptor, b.resourceDescriptor);
    if (a.stateRoot !== b.stateRoot || a.artifacts.runId === b.artifacts.runId || a.artifacts.operationId === b.artifacts.operationId ||
        a.keyFiles.length !== 1 || b.keyFiles.length !== 1 || a.keyFiles[0].keyReferenceSha256 === b.keyFiles[0].keyReferenceSha256 ||
        a.pairMaterials.originalConfig.sha256 !== b.pairMaterials.originalConfig.sha256 || a.pairMaterials.receipt.sha256 !== b.pairMaterials.receipt.sha256 ||
        a.runtimeTreeSha256 !== b.runtimeTreeSha256 || !same(a.dependencies, b.dependencies)) fail();
    for (const key of ["expectedSummarySha256", "expectedTriple", "binding", "targetScope", "expectedCounts", "httpCounts"]) if (!same(a.artifacts[key], b.artifacts[key])) fail();
    const outStat = directory(input.outputDirectory); if (readdirSync(input.outputDirectory).length) fail();
    for (const side of ["A", "B"]) {
      step = side; const c = configs[side], pin = input[side];
      // Recheck immutable config immediately before invoking the one existing lifecycle.
      if (!same(load(pin.path, pin.sha256), c)) fail();
      const result = existing
        ? { status: "LAB_PASS", finalReceiptPersisted: true, finalReceiptSha256: input.existingReceipts[side].receiptSha256 }
        : await runSide({ mode: "execute-isolated", configPath: pin.path, configSha256: pin.sha256 });
      if (result?.status !== "LAB_PASS" || result.finalReceiptPersisted !== true || !/^[a-f0-9]{64}$/u.test(result.finalReceiptSha256 ?? "")) fail();
      const stored = load(join(c.stateRoot, `final-${c.artifacts.runId}.json`));
      const identity = { runId: c.artifacts.runId, configSha256: pin.sha256, binding: c.artifacts.binding,
        manifestSha256: existing ? input.existingReceipts[side].manifestSha256 : stored.value?.manifestSha256 };
      const back = await readYuzhouLabFinalReceipt({ stateRoot: c.stateRoot, identity });
      const r = back.result, provenance = r.sideExecutionProvenance;
      if (back.receiptSha256 !== result.finalReceiptSha256 || r.status !== "LAB_PASS" || r.productionImport !== "HOLD" || r.failureCodes.length ||
          ["httpVerified", "rollbackVerified", "residualVerified"].some(k => r[k] !== true) || !same(r.counts, c.artifacts.expectedCounts) ||
          !provenance || provenance.executorSha256 !== c.artifacts.binding.executorSha256 || provenance.runtimeTreeSha256 !== c.runtimeTreeSha256 ||
          provenance.sourceProvenance.side !== side || provenance.sourceProvenance.originalConfigSha256 !== c.pairMaterials.originalConfig.sha256 ||
          provenance.sourceProvenance.pairMaterialsReceiptSha256 !== c.pairMaterials.receipt.sha256 || !same(provenance.sourceProvenance.preparedTriple, c.artifacts.expectedTriple)) fail();
      if (verified.length && (verified[0].executionCodeSha !== provenance.executionCodeSha || verified[0].manifestSha256 === identity.manifestSha256 || verified[0].finalReceiptSha256 === back.receiptSha256)) fail();
      verified.push({ side, configSha256: pin.sha256, manifestSha256: identity.manifestSha256, finalReceiptSha256: back.receiptSha256, executionCodeSha: provenance.executionCodeSha });
    }
    step = "RECEIPT";
    for (const v of verified) {
      const c = configs[v.side];
      const back = await readYuzhouLabFinalReceipt({ stateRoot: c.stateRoot, identity: { runId: c.artifacts.runId, configSha256: v.configSha256, binding: c.artifacts.binding, manifestSha256: v.manifestSha256 } });
      if (back.receiptSha256 !== v.finalReceiptSha256) fail();
    }
    const receipt = { status: "RETAINED_PAIR_DATABASE_LIFECYCLES_PASS", evidenceMode: existing ? "verified_existing_receipts" : runSide === runYuzhouPairSideProcess ? "real_cli" : "synthetic_adapter", sides: verified, counts: a.artifacts.expectedCounts,
      preparedTriple: a.artifacts.expectedTriple, executorSha256: a.artifacts.binding.executorSha256, runtimeTreeSha256: a.runtimeTreeSha256,
      sourceConfigSha256: a.pairMaterials.originalConfig.sha256, pairMaterialsReceiptSha256: a.pairMaterials.receipt.sha256,
      databaseRollbackVerified: true, databaseResidualVerified: true, httpVerified: true,
      ...(existing ? { databaseStateObservedNow: false } : {}),
      dockerResourcesCleaned: false, independentTrustRootsVerified: false, formalFinalRehearsalPairProduced: false, productionImport: "HOLD" };
    directory(input.outputDirectory, outStat); emit(input.outputDirectory, {}, receipt, {}, LIMIT, "pair-lifecycle-receipt.json");
    return receipt;
  } catch { return { status: "FAILED", failureCode: `LAB_PAIR_${step}_FAILED`, completedSides: verified.length, formalFinalRehearsalPairProduced: false, productionImport: "HOLD" }; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try {
    const args = process.argv.slice(2);
    if (args.length !== 5 || !["--execute-isolated", "--verify-existing"].includes(args[0]) || args[1] !== "--request" || args[3] !== "--request-sha256" || !/^[a-f0-9]{64}$/u.test(args[4])) fail();
    const request = load(args[2], args[4]);
    if (Object.hasOwn(request, "existingReceipts") !== (args[0] === "--verify-existing")) fail();
    result = await runYuzhouRetainedBundlePair(request);
  } catch { result = { status: "FAILED", failureCode: "LAB_PAIR_REQUEST_FAILED", productionImport: "HOLD" }; }
  process.stdout.write(`${JSON.stringify(result)}\n`); if (result.status === "FAILED") process.exitCode = 1;
}
