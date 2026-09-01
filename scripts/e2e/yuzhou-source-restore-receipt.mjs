import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  captureSourceRestoreReceipt, sealSourceRestoreReceipt, validateSourceRestoreReceipt, verifySourceRestoreReceiptFile
} from "../hr-cutover/source-restore-receipt.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const authority = { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false };
const live = overrides => ({
  containerIdentity: "container-id", imageIdentity: "image-id", databaseIdentity: "YuzhouHR_Lab_receipt01",
  restoreIdentity: "database-files-and-directory-fingerprint", catalogIdentity: "catalog-fingerprint",
  project: "jinhu_yuzhou_migration_lab", healthy: true, online: true, readOnly: true,
  etlAuthority: authority, ...overrides
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "yuzhou-source-receipt-"));
  const backup = join(root, "source.bak"), receipt = join(root, "receipt.json"), bytes = Buffer.from("synthetic-fixed-backup");
  writeFileSync(backup, bytes, { mode: 0o600 }); chmodSync(backup, 0o600);
  return { backup, receipt, bytes, sourceSnapshotSha256: sha(bytes) };
}

test("capture seals a private HOLD receipt bound to backup, container copy, live identity and read-only ETL", () => {
  const f = fixture(), probe = {
    inspectContainerCopy: () => ({ sha256: f.sourceSnapshotSha256, bytes: f.bytes.length }),
    inspectLive: () => live()
  };
  const captured = captureSourceRestoreReceipt({
    sourceSnapshotSha256: f.sourceSnapshotSha256, sourceBackupPath: f.backup,
    sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", containerCopyPath: "/var/opt/mssql/backup/receipt01.bak",
    databaseAlias: "YuzhouHR_Lab_receipt01", receiptPath: f.receipt
  }, { probe });
  assert.equal(captured.productionImport, "HOLD");
  assert.equal(captured.receipt.backup.containerCopySha256, f.sourceSnapshotSha256);
  assert.equal(captured.receipt.state.readOnly, true);
  assert.deepEqual(captured.receipt.etlAuthority, authority);
  assert.equal(validateSourceRestoreReceipt(JSON.parse(readFileSync(f.receipt, "utf8"))).canonicalSha256, captured.receipt.canonicalSha256);
  assert.equal(verifySourceRestoreReceiptFile({
    receiptPath: f.receipt, receiptSha256: sha(readFileSync(f.receipt)), sourceSnapshotSha256: f.sourceSnapshotSha256,
    sourceBackupPath: f.backup, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", databaseAlias: "YuzhouHR_Lab_receipt01"
  }, { probe, recheckLive: true }).productionImport, "HOLD");
});

test("receipt gates fail closed for copy drift, writable authority, identity drift and receipt tampering", () => {
  const f = fixture(), baseInput = {
    formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: f.sourceSnapshotSha256,
    backup: { sha256: f.sourceSnapshotSha256, bytes: f.bytes.length, containerCopySha256: f.sourceSnapshotSha256, containerCopyBytes: f.bytes.length },
    identities: { containerSha256: sha("c"), imageSha256: sha("i"), databaseSha256: sha("d"), restoreSha256: sha("r"), catalogSha256: sha("x") },
    state: { online: true, readOnly: true }, etlAuthority: authority, productionImport: "HOLD"
  };
  const copyDrift = structuredClone(baseInput); copyDrift.backup.containerCopySha256 = sha("other");
  assert.throws(() => sealSourceRestoreReceipt(copyDrift), /SOURCE_CONTAINER_COPY_DRIFT/u);
  const writable = structuredClone(baseInput); writable.etlAuthority.update = true;
  assert.throws(() => sealSourceRestoreReceipt(writable), /SOURCE_ETL_AUTHORITY_INVALID/u);
  const sealed = sealSourceRestoreReceipt(baseInput), receipt = join(f.receipt); writeFileSync(receipt, `${JSON.stringify(sealed, null, 2)}\n`, { mode: 0o600 }); chmodSync(receipt, 0o600);
  const probe = { inspectLive: () => live({ catalogIdentity: "changed-catalog" }) };
  assert.throws(() => verifySourceRestoreReceiptFile({
    receiptPath: receipt, receiptSha256: sha(readFileSync(receipt)), sourceSnapshotSha256: f.sourceSnapshotSha256,
    sourceBackupPath: f.backup, sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1", databaseAlias: "YuzhouHR_Lab_receipt01"
  }, { probe, recheckLive: true }), /SOURCE_RUNTIME_IDENTITY_DRIFT/u);
  const tampered = JSON.parse(readFileSync(receipt, "utf8")); tampered.productionImport = "ALLOW";
  writeFileSync(receipt, `${JSON.stringify(tampered, null, 2)}\n`); chmodSync(receipt, 0o600);
  assert.throws(() => validateSourceRestoreReceipt(JSON.parse(readFileSync(receipt, "utf8"))), /SOURCE_RECEIPT_INVALID/u);
});

test("live ETL password is piped and never placed in docker or sqlcmd process arguments", () => {
  const source = readFileSync(resolve(import.meta.dirname, "../hr-cutover/source-restore-receipt.mjs"), "utf8");
  assert.doesNotMatch(source, /docker[^\n]+"-e"/u);
  assert.doesNotMatch(source, /sqlcmd[^\n]+ -P /u);
  assert.match(source, /input: `\$\{env\.YUZHOU_SQLSERVER_ETL_PASSWORD\}\\n`/u);
});

test("receipt module imports safely when a non-file argv entry is supplied by a parent runner", () => {
  const modulePath = resolve(import.meta.dirname, "../hr-cutover/source-restore-receipt.mjs");
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `process.argv[1] = "-"; await import(${JSON.stringify(modulePath)});`], { encoding: "utf8" });
  assert.equal(child.status, 0, child.stderr);
});
