import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseT3AttendanceQuarantinePairArgs, runT3AttendanceQuarantineContinuous, runT3AttendanceQuarantinePair } from "../hr-cutover/run-t3-attendance-event-quarantine-pair-lab.mjs";

const root = mkdtempSync(join(tmpdir(), "jinhu-t3-quarantine-pair-"));
const write = (path, value) => { writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const config = (rehearsal, suffix, port) => { const project = `jinhu_hr_migration_lab_core_${suffix}`, base = join(root, project), credentials = join(base, "credentials"); mkdirSync(credentials, { recursive: true, mode: 0o700 }); chmodSync(credentials, 0o700); const receipt = join(credentials, "receipt.json"), backup = join(credentials, "backup.dbk"), etl = join(credentials, "etl.env"); write(receipt, {}); write(backup, "x"); write(etl, "x"); return { formatVersion: 1, profile: "core_t0_t3", runId: `yzcore-20260831T000000Z-12345678-r${rehearsal}`, rehearsal, triple: { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) }, source: { readOnly: true, sourceBackupSha256: "2".repeat(64), sourceBackupPath: backup, sourceRestoreReceiptPath: receipt, sourceRestoreReceiptSha256: digest(receipt), databaseAlias: "YuzhouHR_Lab_fixture01", etlEnvFile: etl, sourceContainer: "source", dictionaryPackages: {}, dictionaryCaptureReceipt: {} }, machineAttestation: { checkpointVersion: 2, trustedRootSha256: rehearsal === "A" ? "5".repeat(64) : "6".repeat(64) }, target: { database: project, composeProject: project, container: `${project}-postgres-1`, network: `${project}_default`, volume: `${project}_postgres_data`, role: `${project}_operator`, accountNamespace: `${project}_accounts`, ports: { postgres: port, api: port + 1, web: port + 2 }, runtimeRoot: join(base, "runtime"), stagingRoot: join(base, "runtime", "staging"), evidenceRoot: join(base, "runtime", "evidence"), credentialRoot: credentials }, productionImport: "HOLD" }; };
const configPath = (value, name) => { const path = join(root, name); write(path, value); return path; };
const a = config("A", "t3pairalpha", 45651), b = config("B", "t3pairbravo", 45661), aPath = configPath(a, "a.json"), bPath = configPath(b, "b.json");
const result = rehearsal => ({ status: "CONTRACT_PASS", rehearsal, sourceSnapshotSha256: "2".repeat(64), sourceRestoreReceiptSha256: a.source.sourceRestoreReceiptSha256, sourceBusinessSha256: "7".repeat(64), cycles: ["load", "reload"].map(() => ({ load: { status: "succeeded", source: 1, loaded: 0, quarantined: 1 }, rollback: "rolled_back" })), cleanupState: "cleaned", residualCount: 0, productionImport: "HOLD" });
const stage = (() => { const path = join(root, "stage-direct"), rows = join(path, "attendance-punch-quarantine.jsonl"); mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); write(rows, `${JSON.stringify({ domain: "attendance_punch_event", sourceTable: "dbo.attrecord", status: "quarantined", sourceIdentitySha256: "a".repeat(64), sourceRowSha256: "b".repeat(64), quarantineCode: "ATTENDANCE_PUNCH_PERSON_UNMAPPED" })}\n`); const manifest = { artifactKind: "yuzhou_t3_attendance_punch_quarantine_stage", sourceReadOnly: true, sourceRows: 1, eligibleRows: 0, quarantinedRows: 1, businessWriteTarget: "none", productionImport: "HOLD", sourceSnapshotSha256: a.triple.sourceSnapshotHash, sourceRestoreReceiptSha256: a.source.sourceRestoreReceiptSha256, sourceCatalogSha256: "c".repeat(64), sourceBusinessSha256: "7".repeat(64), mappingContractSha256: a.triple.mappingContractHash, quarantineFileSha256: digest(rows) }; write(join(path, "manifest.json"), manifest); return path; })();

test("T3 attendance quarantine pair is serial and requires identical audit-only conservation", async () => {
  const calls = [];
  const output = await runT3AttendanceQuarantinePair({ configAPath: aPath, configBPath: bPath, stageAPath: join(root, "stage-a"), stageBPath: join(root, "stage-b") }, { runner: async ({ configPath }) => { const rehearsal = configPath === aPath ? "A" : "B"; calls.push(rehearsal); return result(rehearsal); } });
  assert.deepEqual(calls, ["A", "B"]); assert.equal(output.status, "CONTRACT_PASS"); assert.equal(output.comparison.cycles[0].load.loaded, 0); assert.equal(output.comparison.cycles[1].load.quarantined, 1); assert.equal(output.productionImport, "HOLD");
});

test("T3 attendance quarantine pair rejects an A/B conservation difference and malformed CLI input", async () => {
  await assert.rejects(() => runT3AttendanceQuarantinePair({ configAPath: aPath, configBPath: bPath, stageAPath: join(root, "stage-a"), stageBPath: join(root, "stage-b") }, { runner: async ({ configPath }) => { const row = result(configPath === aPath ? "A" : "B"); if (configPath === bPath) row.cycles[1].load.quarantined = 0; return row; } }), /T3_ATTENDANCE_QUARANTINE_PAIR_MISMATCH/u);
  const parsed = parseT3AttendanceQuarantinePairArgs(["--config-a", "/private/a", "--config-b", "/private/b", "--stage-a", "/private/sa", "--stage-b", "/private/sb", "--summary", "/private/summary"]);
  assert.equal(parsed.stageBPath, "/private/sb"); assert.throws(() => parseT3AttendanceQuarantinePairArgs(["--config-a", "/private/a"]), /T3_ATTENDANCE_QUARANTINE_PAIR_ARGUMENT_INVALID/u);
});

test("T3 attendance quarantine runner repeats audit-only load and exact rollback before core cleanup", async () => {
  const calls = [], coreStates = [{ status: "CHECKPOINT_READY", state: "rollback_ready" }, { status: "CONTRACT_PASS", state: "cleaned", residualCount: 0 }];
  const output = await runT3AttendanceQuarantineContinuous({ configPath: aPath, stagePath: stage, durationMinutes: 300, pollSeconds: 1 }, {
    coreRunner: async () => coreStates.shift(),
    executeChild: (script, env) => { calls.push({ script, env }); return script.includes("rollback") ? JSON.stringify({ status: "PASS", auditResidual: 0, attendanceBusinessRows: 0, productionImport: "HOLD" }) : JSON.stringify({ status: "PASS", sourceRows: 1, loadedRows: 0, quarantinedRows: 1, businessWriteTarget: "none", productionImport: "HOLD" }); }
  });
  assert.equal(output.status, "CONTRACT_PASS"); assert.equal(output.cycles.length, 2); assert.deepEqual(calls.map(call => call.script), ["scripts/load-yuzhou-t3-attendance-event-quarantine.sh", "scripts/rollback-yuzhou-t3-attendance-event-quarantine.sh", "scripts/load-yuzhou-t3-attendance-event-quarantine.sh", "scripts/rollback-yuzhou-t3-attendance-event-quarantine.sh"]); assert(calls.every(call => call.env.YUZHOU_TARGET_DATABASE === a.target.database)); assert(calls.filter(call => call.script.includes("rollback")).every(call => call.env.ALLOW_YUZHOU_ROLLBACK === "yes"));
});
