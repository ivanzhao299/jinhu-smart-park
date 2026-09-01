#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { parseT5DocumentOwnerEvidenceLabArgs, runT5DocumentOwnerEvidenceLab } from "../hr-cutover/run-t5-document-owner-evidence-lab.mjs";

assert.deepEqual(parseT5DocumentOwnerEvidenceLabArgs(["--config", "/tmp/config", "--document-owner-stage", "/tmp/documents"]), { configPath: "/tmp/config", documentOwnerStage: "/tmp/documents", durationMinutes: 300, pollSeconds: 1 });
assert.throws(() => parseT5DocumentOwnerEvidenceLabArgs(["--config", "/tmp/config", "--duration-minutes", "1", "--document-owner-stage", "/tmp/documents"]), /T5_FILE_DURATION_INVALID/);

const root = mkdtempSync(join(tmpdir(), "yuzhou-document-owner-runner-")); chmodSync(root, 0o700);
const sha = value => createHash("sha256").update(value).digest("hex");
const writePrivate = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const database = "jinhu_hr_migration_lab_core_documentownertest", project = join(root, database), runtime = join(project, "runtime"), credentials = join(project, "credentials"), audit = join(project, "audit");
for (const path of [project, runtime, join(runtime, "staging"), join(runtime, "evidence"), credentials, audit]) { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); }
const backup = join(root, "source.dbk"), receipt = join(root, "receipt.json"), etl = join(credentials, "etl.env");
writePrivate(backup, "backup"); writePrivate(receipt, "{}"); writePrivate(etl, "redacted\n");
const snapshot = "a".repeat(64), receiptHash = sha("{}"), head = "1".repeat(40);
const config = { formatVersion: 1, profile: "core_t0_t2", runId: "yzcore-20260831T010101Z-12345678-rA", rehearsal: "A", triple: { codeSha: head, sourceSnapshotHash: snapshot, mappingContractHash: "2".repeat(64) }, source: { readOnly: true, sourceBackupSha256: snapshot, sourceBackupPath: backup, sourceRestoreReceiptPath: receipt, sourceRestoreReceiptSha256: receiptHash, databaseAlias: "YuzhouHR_Lab_documentownertest", etlEnvFile: etl, sourceContainer: "yuzhou-source-lab", dictionaryPackages: {}, dictionaryCaptureReceipt: "" }, machineAttestation: { checkpointVersion: 2, trustedRootSha256: "3".repeat(64) }, target: { database, composeProject: database, container: `${database}-postgres-1`, network: `${database}_default`, volume: `${database}_postgres_data`, role: `${database}_operator`, accountNamespace: `${database}_accounts`, ports: { postgres: 45351, api: 45352, web: 45353 }, runtimeRoot: runtime, stagingRoot: join(runtime, "staging"), evidenceRoot: join(runtime, "evidence"), credentialRoot: credentials }, productionImport: "HOLD" };
const configPath = join(root, "config.json"); writePrivate(configPath, JSON.stringify(config));
const stage = join(root, "stage"); mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700); writePrivate(join(stage, "document-owner-evidence.jsonl"), "hash-only\n"); writePrivate(join(stage, "manifest.json"), JSON.stringify({ artifactKind: "yuzhou_t5_document_owner_stage", productionImport: "HOLD", sourceRows: 1003, resolvedRows: 989, quarantinedRows: 14, sourceSnapshotSha256: snapshot, sourceRestoreReceiptSha256: receiptHash, stageSha256: "5".repeat(64), domains: { docs: { rows: 1003, file: "document-owner-evidence.jsonl", fileSha256: "4".repeat(64) } } }));
const commands = [];
const spawn = (_command, args, options) => { commands.push({ script: args[0].split("/").at(-1), env: options.env }); return { status: 0, stdout: args[0].endsWith("load-yuzhou-t5-document-owner-evidence.sh") ? "succeeded|1003|989|14\n" : "rolled_back\n" }; };
let coreCalls = 0;
const coreRunner = async options => { coreCalls += 1; return options.stopAfter === "rollback_ready" ? { status: "CHECKPOINT_READY", state: "rollback_ready" } : { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 }; };
const result = await runT5DocumentOwnerEvidenceLab({ configPath, documentOwnerStage: stage }, { coreRunner, spawn, head: () => head });
assert.equal(result.status, "CONTRACT_PASS"); assert.equal(result.t0RunId, `${config.runId}-t0`); assert.equal(result.documentStageSha256, "5".repeat(64)); assert.equal(result.receipts.length, 2); assert.equal(result.residualCount, 0); assert.equal(coreCalls, 2);
const persisted = JSON.parse(readFileSync(join(audit, "t5-document-owner-evidence-continuous-summary.json"), "utf8"));
assert.equal(persisted.status, "CONTRACT_PASS"); assert.equal(persisted.receipts[0].load.loaded, 989); assert.equal((statSync(join(audit, "t5-document-owner-evidence-continuous-summary.json")).mode & 0o777), 0o600);
assert.deepEqual(commands.map(row => row.script), ["load-yuzhou-t5-document-owner-evidence.sh", "rollback-yuzhou-t5-document-owner-evidence.sh", "load-yuzhou-t5-document-owner-evidence.sh", "rollback-yuzhou-t5-document-owner-evidence.sh"]);
assert.equal(commands.every(row => row.env.YUZHOU_T5_FILE_MODE === "isolated_rehearsal" && row.env.YUZHOU_T0_RUN_ID === `${config.runId}-t0`), true);
assert.equal(commands.some(row => Object.keys(row.env).some(key => /PASSWORD|TOKEN|SECRET/i.test(key))), false);
let rollbackFailsOnce = true;
const failureDatabase = "jinhu_hr_migration_lab_core_documentownerfail", failureProject = join(root, failureDatabase), failureRuntime = join(failureProject, "runtime"), failureAudit = join(failureProject, "audit"), failureCredentials = join(failureProject, "credentials");
for (const path of [failureProject, failureRuntime, join(failureRuntime, "staging"), join(failureRuntime, "evidence"), failureAudit, failureCredentials]) { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); }
const failureEtl = join(failureCredentials, "etl.env"); writePrivate(failureEtl, "redacted\n");
const failureConfig = { ...config, runId: "yzcore-20260831T010102Z-12345678-rB", rehearsal: "B", source: { ...config.source, etlEnvFile: failureEtl }, target: { ...config.target, database: failureDatabase, composeProject: failureDatabase, container: `${failureDatabase}-postgres-1`, network: `${failureDatabase}_default`, volume: `${failureDatabase}_postgres_data`, role: `${failureDatabase}_operator`, accountNamespace: `${failureDatabase}_accounts`, runtimeRoot: failureRuntime, stagingRoot: join(failureRuntime, "staging"), evidenceRoot: join(failureRuntime, "evidence"), credentialRoot: failureCredentials } };
const failureConfigPath = join(root, "failure-config.json"); writePrivate(failureConfigPath, JSON.stringify(failureConfig));
const recoveryCommands = [];
const recoverySpawn = (_command, args) => {
  recoveryCommands.push(args[0].split("/").at(-1));
  if (args[0].endsWith("rollback-yuzhou-t5-document-owner-evidence.sh") && rollbackFailsOnce) { rollbackFailsOnce = false; return { status: 1, stdout: "" }; }
  return { status: 0, stdout: args[0].endsWith("load-yuzhou-t5-document-owner-evidence.sh") ? "succeeded|1003|989|14\n" : "rolled_back\n" };
};
await assert.rejects(() => runT5DocumentOwnerEvidenceLab({ configPath: failureConfigPath, documentOwnerStage: stage }, { coreRunner, spawn: recoverySpawn, head: () => head }), /T5_FILE_CHILD_FAILED/);
assert.deepEqual(recoveryCommands, ["load-yuzhou-t5-document-owner-evidence.sh", "rollback-yuzhou-t5-document-owner-evidence.sh", "rollback-yuzhou-t5-document-owner-evidence.sh"]);
assert.equal(JSON.parse(readFileSync(join(failureAudit, "t5-document-owner-evidence-continuous-summary.json"), "utf8")).status, "HOLD");
console.log("Yuzhou T5_FILE document-owner continuous runner contract passed.");
