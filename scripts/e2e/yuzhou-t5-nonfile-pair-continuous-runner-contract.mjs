import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runT5NonfilePairContinuous } from "../hr-cutover/run-t5-nonfile-pair-continuous-lab.mjs";

const root = mkdtempSync(join(tmpdir(), "jinhu-core-pair-"));
const privateWrite = (path, value) => { writeFileSync(path, `${JSON.stringify(value)}\n`, { mode: 0o600 }); chmodSync(path, 0o600); };
const digest = path => createHash("sha256").update(readFileSync(path)).digest("hex");
const configFor = (rehearsal, suffix, port) => {
  const project = `jinhu_hr_migration_lab_core_${suffix}`, projectRoot = join(root, project), credentials = join(projectRoot, "credentials");
  mkdirSync(credentials, { recursive: true, mode: 0o700 }); chmodSync(credentials, 0o700);
  const receipt = join(credentials, "source-receipt.json"), etl = join(credentials, "etl.env"), backup = join(credentials, "source.dbk");
  privateWrite(receipt, {}); privateWrite(etl, {}); privateWrite(backup, {});
  const sourceRestoreReceiptSha256 = digest(receipt);
  return { formatVersion: 1, profile: "core_t0_t2", runId: `yzcore-20260831T000000Z-12345678-r${rehearsal}`, rehearsal,
    triple: { codeSha: "1".repeat(40), sourceSnapshotHash: "2".repeat(64), mappingContractHash: "3".repeat(64) },
    source: { readOnly: true, sourceBackupSha256: "2".repeat(64), sourceBackupPath: backup, sourceRestoreReceiptPath: receipt, sourceRestoreReceiptSha256, databaseAlias: "YuzhouHR_Lab_fixture01", etlEnvFile: etl, sourceContainer: "yuzhou-source-lab", dictionaryPackages: {}, dictionaryCaptureReceipt: "" },
    machineAttestation: { checkpointVersion: 2, trustedRootSha256: rehearsal === "A" ? "5".repeat(64) : "6".repeat(64) },
    target: { database: project, composeProject: project, container: `${project}-postgres-1`, network: `${project}_default`, volume: `${project}_postgres_data`, role: `${project}_operator`, accountNamespace: `${project}_accounts`, ports: { postgres: port, api: port + 1, web: port + 2 }, runtimeRoot: join(projectRoot, "runtime"), stagingRoot: join(projectRoot, "runtime", "staging"), evidenceRoot: join(projectRoot, "runtime", "evidence"), credentialRoot: credentials }, productionImport: "HOLD" };
};
const configPath = (config, name) => { const path = join(root, name); privateWrite(path, config); return path; };
const configA = configFor("A", "pairalpha", 45601), configB = configFor("B", "pairbravo", 45701);
const a = configPath(configA, "config-a.json"), b = configPath(configB, "config-b.json");
const result = rehearsal => ({ status: "CONTRACT_PASS", rehearsal, sourceSnapshotSha256: "2".repeat(64), sourceRestoreReceiptSha256: configA.source.sourceRestoreReceiptSha256, nonfileBusinessSha256: "7".repeat(64), receipts: ["load", "reload"].map(runId => ({ load: { runId, status: "succeeded", source: 7752, loaded: 7648, quarantined: 104 }, rollback: "rolled_back" })), cleanupState: "cleaned", residualCount: 0, productionImport: "HOLD" });

test("T5 nonfile pair runs A then B and requires identical source conservation receipts", async () => {
  const calls = [];
  const output = await runT5NonfilePairContinuous({ configAPath: a, configBPath: b, stagePath: join(root, "stage") }, { runner: async ({ configPath }) => { const rehearsal = configPath === a ? "A" : "B"; calls.push(rehearsal); return result(rehearsal); } });
  assert.deepEqual(calls, ["A", "B"]);
  assert.equal(output.status, "CONTRACT_PASS");
  assert.equal(output.comparison.status, "PASS");
  assert.equal(output.comparison.receipts[0].load.source, 7752);
  assert.equal(output.productionImport, "HOLD");
});

test("T5 nonfile pair rejects an A/B conservation difference", async () => {
  await assert.rejects(() => runT5NonfilePairContinuous({ configAPath: a, configBPath: b, stagePath: join(root, "stage") }, { runner: async ({ configPath }) => { const row = result(configPath === a ? "A" : "B"); if (configPath === b) row.receipts[1].load.quarantined = 103; return row; } }), /T5_NONFILE_PAIR_MISMATCH/u);
});
