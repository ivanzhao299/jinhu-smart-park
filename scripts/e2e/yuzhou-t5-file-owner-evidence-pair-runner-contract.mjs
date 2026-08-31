import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseT5FileOwnerEvidencePairArgs, runT5FileOwnerEvidencePair } from "../hr-cutover/run-t5-file-owner-evidence-pair-lab.mjs";

const root = mkdtempSync(join(tmpdir(), "jinhu-t5-file-pair-"));
const write = (path, value) => { writeFileSync(path, typeof value === "string" ? value : `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
function config(rehearsal, suffix, port) { const project = `jinhu_hr_migration_lab_core_${suffix}`, base = join(root, project), credentials = join(base, "credentials"); mkdirSync(credentials, { recursive: true, mode: 0o700 }); chmodSync(credentials, 0o700); const receipt = join(credentials, "receipt.json"), backup = join(credentials, "backup.dbk"), etl = join(credentials, "etl.env"); write(receipt, {}); write(backup, "x"); write(etl, "x"); return { formatVersion: 1, profile: "core_t0_t2", runId: `yzcore-20260901T000000Z-12345678-r${rehearsal}`, rehearsal, triple: { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) }, source: { readOnly: true, sourceBackupSha256: "2".repeat(64), sourceBackupPath: backup, sourceRestoreReceiptPath: receipt, sourceRestoreReceiptSha256: digest(receipt), databaseAlias: "YuzhouHR_Lab_fixture01", etlEnvFile: etl, sourceContainer: "source", dictionaryPackages: {}, dictionaryCaptureReceipt: {} }, machineAttestation: { checkpointVersion: 2, trustedRootSha256: rehearsal === "A" ? "5".repeat(64) : "6".repeat(64) }, target: { database: project, composeProject: project, container: `${project}-postgres-1`, network: `${project}_default`, volume: `${project}_postgres_data`, role: `${project}_operator`, accountNamespace: `${project}_accounts`, ports: { postgres: port, api: port + 1, web: port + 2 }, runtimeRoot: join(base, "runtime"), stagingRoot: join(base, "runtime", "staging"), evidenceRoot: join(base, "runtime", "evidence"), credentialRoot: credentials }, productionImport: "HOLD" }; }
const a = config("A", "filepairalpha", 45701), b = config("B", "filepairbravo", 45711), pathFor = (value, name) => { const path = join(root, name); write(path, value); return path; }, aPath = pathFor(a, "a.json"), bPath = pathFor(b, "b.json");
const result = rehearsal => ({ status: "CONTRACT_PASS", rehearsal, sourceSnapshotSha256: a.triple.sourceSnapshotHash, sourceRestoreReceiptSha256: a.source.sourceRestoreReceiptSha256, documentStageSha256: "7".repeat(64), receipts: ["load", "reload"].map(() => ({ load: { status: "succeeded", source: 1003, loaded: 989, quarantined: 14 }, rollback: { status: "rolled_back" } })), cleanupState: "cleaned", residualCount: 0, productionImport: "HOLD" });

test("T5 document owner pair is serial and requires matching hash-only conservation", async () => {
  const calls = [];
  const output = await runT5FileOwnerEvidencePair({ kind: "document", configAPath: aPath, configBPath: bPath, stageAPath: join(root, "stage-a"), stageBPath: join(root, "stage-b") }, { runner: async ({ configPath }) => { const rehearsal = configPath === aPath ? "A" : "B"; calls.push(rehearsal); return result(rehearsal); } });
  assert.deepEqual(calls, ["A", "B"]); assert.equal(output.status, "CONTRACT_PASS"); assert.equal(output.comparison.receipts[0].load.loaded, 989); assert.equal(output.comparison.receipts[1].load.quarantined, 14); assert.equal(output.productionImport, "HOLD");
});

test("T5 file owner pair rejects receipt drift and malformed kind", async () => {
  await assert.rejects(() => runT5FileOwnerEvidencePair({ kind: "document", configAPath: aPath, configBPath: bPath, stageAPath: join(root, "stage-a"), stageBPath: join(root, "stage-b") }, { runner: async ({ configPath }) => { const row = result(configPath === aPath ? "A" : "B"); if (configPath === bPath) row.receipts[1].load.quarantined = 13; return row; } }), /T5_FILE_PAIR_MISMATCH/u);
  assert.equal(parseT5FileOwnerEvidencePairArgs(["--kind", "document", "--config-a", "/private/a", "--config-b", "/private/b", "--stage-a", "/private/sa", "--stage-b", "/private/sb", "--summary", "/private/s"]).kind, "document");
  assert.throws(() => parseT5FileOwnerEvidencePairArgs(["--kind", "unsafe"]), /T5_FILE_PAIR_ARGUMENT_INVALID|T5_FILE_PAIR_KIND_INVALID/u);
});
