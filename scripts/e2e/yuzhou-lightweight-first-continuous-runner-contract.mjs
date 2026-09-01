#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, chmodSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { parseLightweightFirstArgs, runLightweightFirstContinuous } from "../hr-cutover/run-lightweight-first-continuous-lab.mjs";
import { canonicalT5Baseline } from "../hr-cutover/t5-canonical-baseline.mjs";

assert.deepEqual(parseLightweightFirstArgs(["--config", "/tmp/config", "--t5-stage", "/tmp/t5", "--t3-stage", "/tmp/t3", "--t4-stage", "/tmp/t4"]), { configPath: "/tmp/config", t5Stage: "/tmp/t5", t3Stage: "/tmp/t3", t4Stage: "/tmp/t4" });
assert.equal(parseLightweightFirstArgs(["--config", "/tmp/config", "--t5-stage", "/tmp/t5", "--t3-stage", "/tmp/t3", "--t4-stage", "/tmp/t4", "--t5-baseline", "/tmp/t5-baseline"]).t5Baseline, "/tmp/t5-baseline");
assert.throws(() => parseLightweightFirstArgs(["--config", "/tmp/config", "--t5-stage", "/tmp/t5"]), /LIGHTWEIGHT_ARGUMENT_INVALID/);

const root = mkdtempSync(join(tmpdir(), "yuzhou-lightweight-runner-"));
chmodSync(root, 0o700);
const sha = value => createHash("sha256").update(value).digest("hex");
const writePrivate = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const database = "jinhu_hr_migration_lab_core_lwtest01", project = join(root, database), runtime = join(project, "runtime"), credentials = join(project, "credentials");
for (const path of [project, runtime, join(runtime, "staging"), join(runtime, "evidence"), credentials]) { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); }
const backup = join(root, "source.dbk"), receipt = join(root, "receipt.json"), etl = join(credentials, "etl.env");
writePrivate(backup, "backup"); writePrivate(receipt, "{}"); writePrivate(etl, "redacted\n");
const legacyBaseline = canonicalT5Baseline();
const snapshot = legacyBaseline.sourceSnapshotSha256, business = "b".repeat(64);
const config = {
  formatVersion: 1, profile: "core_t0_t2", runId: "yzcore-20260831T010101Z-12345678-rA", rehearsal: "A",
  triple: { codeSha: "1".repeat(40), sourceSnapshotHash: snapshot, mappingContractHash: "2".repeat(64) },
  source: { readOnly: true, sourceBackupSha256: snapshot, sourceBackupPath: backup, sourceRestoreReceiptPath: receipt, sourceRestoreReceiptSha256: sha("{}"), databaseAlias: "YuzhouHR_Lab_lwtest01", etlEnvFile: etl, sourceContainer: "yuzhou-source-lab", dictionaryPackages: {}, dictionaryCaptureReceipt: "" },
  machineAttestation: { checkpointVersion: 2, trustedRootSha256: "3".repeat(64) },
  target: { database, composeProject: database, container: `${database}-postgres-1`, network: `${database}_default`, volume: `${database}_postgres_data`, role: `${database}_operator`, accountNamespace: `${database}_accounts`, ports: { postgres: 45331, api: 45332, web: 45333 }, runtimeRoot: runtime, stagingRoot: join(runtime, "staging"), evidenceRoot: join(runtime, "evidence"), credentialRoot: credentials },
  productionImport: "HOLD"
};
const configPath = join(root, "config.json"); writePrivate(configPath, JSON.stringify(config));
const makeStage = (name, manifest) => { const path = join(root, name); mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); if (manifest) writePrivate(join(path, "manifest.json"), JSON.stringify(manifest)); return path; };
const domains = { person_core: { sourceObject: "dbo.person.core_residue", rows: 2949, fileSha256: "a".repeat(64) }, family: { sourceObject: "dbo.family", rows: 4560, fileSha256: "a".repeat(64) }, knowhow: { sourceObject: "dbo.knowhow", rows: 6, fileSha256: "a".repeat(64) }, ticket: { sourceObject: "dbo.ticket", rows: 237, fileSha256: "a".repeat(64) } };
const t5Manifest = baseline => ({ artifactKind: "yuzhou_t5_nonfile_materialization_stage", productionImport: "HOLD", sourceRows: baseline.nonfileMaterializationRows, sourceSnapshotSha256: baseline.sourceSnapshotSha256, sourceRestoreReceiptSha256: baseline.sourceRestoreReceiptSha256, sourceBusinessSha256: baseline.businessSha256, sourceCatalogSha256: baseline.catalogSha256, mappingContractSha256: baseline.mappingContractSha256, nonfileBusinessSha256: "a".repeat(64), filesExcluded: ["photo", "docs"], domains });
const t5 = makeStage("t5", t5Manifest(legacyBaseline));
const candidateBaseline = { ...legacyBaseline, sourceRestoreReceiptSha256: "9".repeat(64) };
const candidateBaselinePath = join(root, "candidate-baseline.json"); writePrivate(candidateBaselinePath, JSON.stringify(candidateBaseline));
const candidateT5 = makeStage("candidate-t5", t5Manifest(candidateBaseline));
const unsafeCandidateBaselinePath = join(root, "unsafe-candidate-baseline.json"); writeFileSync(unsafeCandidateBaselinePath, JSON.stringify(candidateBaseline), { mode: 0o644 }); chmodSync(unsafeCandidateBaselinePath, 0o644);
const t3 = makeStage("t3", { artifactKind: "yuzhou_t3_attendance_insurance_stage", sourceReadOnly: true, sourceSnapshotSha256: snapshot, sourceRestoreReceiptSha256: "c".repeat(64), sourceCatalogSha256: "d".repeat(64), sourceBusinessSha256: "e".repeat(64), mappingContractSha256: "f".repeat(64), productionImport: "HOLD" });
const t4 = makeStage("t4", { sourceBackupSha256: snapshot, businessContentSha256: business });
await assert.rejects(() => runLightweightFirstContinuous({ configPath, t5Stage: candidateT5, t3Stage: t3, t4Stage: t4, t5Baseline: unsafeCandidateBaselinePath }), /LIGHTWEIGHT_T5_BASELINE_UNSAFE/);
const commands = [];
const successfulSpawn = commands => (_command, args, options) => {
  const script = args[0].split("/").at(-1); commands.push({ script, env: options.env });
  const stdout = script === "load-yuzhou-t5-nonfile-history.sh" ? "succeeded|12|10|2\n"
    : script === "load-yuzhou-t3-attendance-insurance.sh" ? "succeeded|30|28|2\n"
      : script === "load-yuzhou-t4-payroll-history.sh" ? "succeeded|40|40|0\n"
        : script === "rollback-yuzhou-t4-payroll-history.sh" || script === "rollback-yuzhou-t3-attendance-insurance.sh" ? "rolled_back|0\n"
          : script === "rollback-yuzhou-t5-nonfile-history.sh" ? "rolled_back\n" : "";
  return { status: 0, stdout };
};
const spawn = successfulSpawn(commands);
let coreCalls = 0;
const coreRunner = async options => {
  coreCalls += 1;
  if (options.stopAfter === "rollback_ready") return { status: "CHECKPOINT_READY", state: "rollback_ready" };
  return { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 };
};
const result = await runLightweightFirstContinuous({ configPath, t5Stage: t5, t3Stage: t3, t4Stage: t4 }, { coreRunner, technicalUat: async () => ({ status: "PASS", productionImport: "HOLD" }), spawn, uuid: () => "00000000-0000-4000-8000-000000000001" });
assert.equal(result.status, "CONTRACT_PASS");
assert.deepEqual(result.order, ["T0", "T1", "T2", "T5_NONFILE", "T3", "T4"]);
assert.deepEqual(result.receipts, {
  T5_NONFILE: { load: { runId: "yzlw-20260831t010101z-12345678-t5", status: "succeeded", source: 12, loaded: 10, quarantined: 2 }, rollback: { runId: "yzlw-20260831t010101z-12345678-t5", status: "rolled_back" } },
  T3: { load: { runId: "yzlw-20260831t010101z-12345678-t3", status: "succeeded", source: 30, loaded: 28, quarantined: 2 }, rollback: { runId: "yzlw-20260831t010101z-12345678-t3", status: "rolled_back", activeMaps: 0 } },
  T4: { load: { runId: "yzlw-20260831t010101z-12345678-t4", status: "succeeded", source: 40, loaded: 40, quarantined: 0 }, rollback: { runId: "yzlw-20260831t010101z-12345678-t4", status: "rolled_back", activeMaps: 0 } }
});
assert.equal(result.uat, "PASS");
assert.equal(result.productionImport, "HOLD");
assert.deepEqual(result.cleanup, { state: "cleaned", residualCount: 0 });
assert.equal(coreCalls, 2);
assert.deepEqual(commands.map(row => row.script), ["provision-yuzhou-t5-nonfile-actor.sh", "load-yuzhou-t5-nonfile-history.sh", "load-yuzhou-t3-attendance-insurance.sh", "load-yuzhou-t4-payroll-history.sh", "rollback-yuzhou-t4-payroll-history.sh", "rollback-yuzhou-t3-attendance-insurance.sh", "rollback-yuzhou-t5-nonfile-history.sh", "rollback-yuzhou-t5-nonfile-actor.sh"]);
assert.equal(commands.at(3).env.YUZHOU_T4_LOAD_MODE, "full_archive");
assert.equal(Object.hasOwn(commands.at(1).env, "YUZHOU_T5_BASELINE_FILE"), false);
assert.equal(commands.at(2).env.YUZHOU_SOURCE_RESTORE_RECEIPT_SHA256, "c".repeat(64));
assert.equal(commands.at(2).env.YUZHOU_SOURCE_CATALOG_SHA256, "d".repeat(64));
assert.equal(commands.at(2).env.YUZHOU_SOURCE_BUSINESS_SHA256, "e".repeat(64));
assert.equal(commands.at(2).env.YUZHOU_MAPPING_CONTRACT_SHA256, "f".repeat(64));
assert.equal(commands.at(-1).env.ALLOW_YUZHOU_ROLLBACK, "yes");
assert.equal(commands.every(row => /^[A-Za-z0-9][A-Za-z0-9._-]{5,36}$/u.test(row.env.YUZHOU_T5_NONFILE_RUN_ID ?? row.env.YUZHOU_MIGRATION_RUN_ID)), true);
assert.equal(commands.some(row => Object.keys(row.env).some(key => /PASSWORD|TOKEN|SECRET/i.test(key))), false);
assert.equal(result.cleanup.state, "cleaned");
assert.equal(result.cleanup.residualCount, 0);
const rollbackFailure = (_command, args, options) => args[0].endsWith("rollback-yuzhou-t4-payroll-history.sh") ? { status: 1, stdout: "" } : spawn(_command, args, options);
await assert.rejects(() => runLightweightFirstContinuous({ configPath, t5Stage: t5, t3Stage: t3, t4Stage: t4 }, { coreRunner, technicalUat: async () => ({ status: "PASS", productionImport: "HOLD" }), spawn: rollbackFailure, uuid: () => "00000000-0000-4000-8000-000000000002" }), /LIGHTWEIGHT_T4_ROLLBACK_FAILED/);
assert.deepEqual(commands.slice(-3).map(row => row.script), ["rollback-yuzhou-t3-attendance-insurance.sh", "rollback-yuzhou-t5-nonfile-history.sh", "rollback-yuzhou-t5-nonfile-actor.sh"]);

const t4ReceiptFailure = (_command, args, options) => args[0].endsWith("load-yuzhou-t4-payroll-history.sh") ? { status: 0, stdout: "succeeded|40|39|0\n" } : spawn(_command, args, options);
await assert.rejects(() => runLightweightFirstContinuous({ configPath, t5Stage: t5, t3Stage: t3, t4Stage: t4 }, { coreRunner, technicalUat: async () => ({ status: "PASS", productionImport: "HOLD" }), spawn: t4ReceiptFailure, uuid: () => "00000000-0000-4000-8000-000000000004" }), /LIGHTWEIGHT_T4_LOAD_RECEIPT_INVALID/);

const t5Failure = (_command, args, options) => args[0].endsWith("load-yuzhou-t5-nonfile-history.sh") ? { status: 1, stdout: "", stderr: "ERROR: T5_NONFILE_TRANSACTION_STATEMENT_TIMEOUT\n" } : spawn(_command, args, options);
await assert.rejects(() => runLightweightFirstContinuous({ configPath, t5Stage: t5, t3Stage: t3, t4Stage: t4 }, { coreRunner, technicalUat: async () => ({ status: "PASS", productionImport: "HOLD" }), spawn: t5Failure, uuid: () => "00000000-0000-4000-8000-000000000003" }), /LIGHTWEIGHT_T5_NONFILE_TRANSACTION_STATEMENT_TIMEOUT/);

const candidateCommands = [];
let candidateCoreCalls = 0;
const candidateCoreRunner = async options => {
  candidateCoreCalls += 1;
  if (options.stopAfter === "rollback_ready") return { status: "CHECKPOINT_READY", state: "rollback_ready" };
  return { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 };
};
const candidateResult = await runLightweightFirstContinuous({ configPath, t5Stage: candidateT5, t3Stage: t3, t4Stage: t4, t5Baseline: candidateBaselinePath }, { coreRunner: candidateCoreRunner, technicalUat: async () => ({ status: "PASS", productionImport: "HOLD" }), spawn: successfulSpawn(candidateCommands), uuid: () => "00000000-0000-4000-8000-000000000005" });
assert.equal(candidateResult.status, "CONTRACT_PASS");
assert.equal(candidateCoreCalls, 2);
assert.equal(candidateCommands.find(row => row.script === "load-yuzhou-t5-nonfile-history.sh").env.YUZHOU_T5_BASELINE_FILE, candidateBaselinePath);
assert.equal(candidateCommands.filter(row => row.script === "load-yuzhou-t5-nonfile-history.sh").length, 1);

const cliWiring = spawnSync(process.execPath, ["scripts/hr-cutover/run-lightweight-first-continuous-lab.mjs", "--config", configPath, "--t5-stage", join(root, "missing-t5"), "--t3-stage", t3, "--t4-stage", t4], { cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8" });
assert.equal(cliWiring.status, 1);
assert.equal(cliWiring.stderr.trim(), "LIGHTWEIGHT_STAGE_UNSAFE");
assert.equal(cliWiring.stdout, "");
const cli = spawnSync(process.execPath, ["scripts/hr-cutover/run-lightweight-first-continuous-lab.mjs"], { cwd: resolve(import.meta.dirname, "../.."), encoding: "utf8" });
assert.equal(cli.status, 1);
assert.equal(cli.stderr.trim(), "LIGHTWEIGHT_ARGUMENT_INVALID");
assert.equal(cli.stdout, "");
console.log("Yuzhou lightweight-first continuous runner argument contract passed.");
