#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { prepareYuzhouPhotoOwnerStage } from "../prepare-yuzhou-photo-owner-stage.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-photo-owner-stage-"));
chmodSync(root, 0o700);
const baseline = {
  sourceSnapshotSha256: sha("source-snapshot"), sourceRestoreReceiptSha256: null,
  businessSha256: sha("business"), catalogSha256: sha("catalog"), mappingContractSha256: sha("mapping")
};
const receipt = sealSourceRestoreReceipt({
  formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: baseline.sourceSnapshotSha256,
  backup: { sha256: baseline.sourceSnapshotSha256, bytes: 1, containerCopySha256: baseline.sourceSnapshotSha256, containerCopyBytes: 1 },
  identities: { containerSha256: sha("container"), imageSha256: sha("image"), databaseSha256: sha("database"), restoreSha256: sha("restore"), catalogSha256: sha("catalog-identity") },
  state: { online: true, readOnly: true }, etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false }, productionImport: "HOLD"
});
const receiptPath = join(root, "receipt.json");
writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 }); chmodSync(receiptPath, 0o600);
baseline.sourceRestoreReceiptSha256 = sha(readFileSync(receiptPath));

function createSourceStage(name, { mutate = null } = {}) {
  const stage = join(root, name); mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700);
  const rows = Array.from({ length: 2949 }, (_, index) => {
    const readable = index < 2155;
    return {
      sourceTable: "dbo.person.photo", sourceKey: `synthetic-${index}`, sourceIdentitySha256: sha(`photo:${index}`), sourceRowSha256: sha(`row:${index}`),
      employeeCode: `synthetic-owner-${index}`, source: { photofile: `synthetic-path-${index}` }, fileRole: "employee_photo",
      contentSha256: readable ? sha(`content:${index}`) : null, actualSize: readable ? index + 1 : 0,
      detectedMime: readable ? "image/bmp" : null, readabilityStatus: readable ? "readable" : "empty"
    };
  });
  mutate?.(rows);
  const photoBytes = `${rows.map(row => JSON.stringify(row)).join("\n")}\n`;
  writeFileSync(join(stage, "photo.jsonl"), photoBytes, { mode: 0o600 }); chmodSync(join(stage, "photo.jsonl"), 0o600);
  const manifest = {
    productionImport: "HOLD", sensitive: true, businessSha256: baseline.businessSha256, catalogSha256: baseline.catalogSha256,
    mappingContractSha256: baseline.mappingContractSha256, domains: { photo: { sourceObject: "dbo.person.photo", rows: 2949, file: "photo.jsonl", fileSha256: sha(photoBytes) } }
  };
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 }); chmodSync(join(stage, "manifest.json"), 0o600);
  return stage;
}

test("photo owner stage emits only hashes and A/B-equal aggregate evidence", () => {
  const sourceA = createSourceStage("source-a"), sourceB = createSourceStage("source-b"), outputRoot = join(root, "output");
  mkdirSync(outputRoot, { mode: 0o700 }); chmodSync(outputRoot, 0o700);
  const result = prepareYuzhouPhotoOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot, runId: "photo-owner-synthetic-a", baseline });
  assert.deepEqual({ sourceRows: result.sourceRows, excludedEmptyRows: result.excludedEmptyRows, productionImport: result.productionImport }, { sourceRows: 2155, excludedEmptyRows: 794, productionImport: "HOLD" });
  const stage = join(outputRoot, "staging-photo-owner-synthetic-a"), output = readFileSync(join(stage, "photo-owner-evidence.jsonl"), "utf8");
  assert.equal((output.match(/\n/g) ?? []).length, 2155);
  assert.doesNotMatch(output, /employeeCode|sourceKey|photofile|synthetic-owner|synthetic-path/u);
  const row = output.split("\n").filter(Boolean).map(line => JSON.parse(line)).find(item => item.sourceIdentitySha256 === sha("photo:0"));
  assert.deepEqual(Object.keys(row).sort(), ["actualSize", "contentSha256", "detectedMime", "fileRole", "ownerSourceIdentitySha256", "ownerSourceTable", "readabilityStatus", "sourceIdentitySha256", "sourceRowSha256", "sourceTable"]);
  assert.equal(row.ownerSourceIdentitySha256, sha("dbo.person\0synthetic-owner-0"));
  assert.equal((readFileSync(join(stage, "manifest.json")).includes("synthetic-owner")), false);
});

test("photo owner stage fails closed for A/B drift and unsafe input authority", () => {
  const sourceA = createSourceStage("drift-a"), sourceB = createSourceStage("drift-b", { mutate: rows => { rows[0].employeeCode = "synthetic-other-owner"; } });
  const driftOutput = join(root, "drift-output"); mkdirSync(driftOutput, { mode: 0o700 }); chmodSync(driftOutput, 0o700);
  assert.throws(() => prepareYuzhouPhotoOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot: driftOutput, runId: "photo-owner-synthetic-b", baseline }), /A\/B photo source file mismatch/u);
  chmodSync(join(sourceA, "photo.jsonl"), 0o644);
  const modeOutput = join(root, "mode-output"); mkdirSync(modeOutput, { mode: 0o700 }); chmodSync(modeOutput, 0o700);
  assert.throws(() => prepareYuzhouPhotoOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot: modeOutput, runId: "photo-owner-synthetic-c", baseline }), /private regular file/u);
});

test("CLI reports no source paths or personal values", () => {
  const sourceA = createSourceStage("cli-a"), sourceB = createSourceStage("cli-b"), outputRoot = join(root, "cli-output");
  mkdirSync(outputRoot, { mode: 0o700 }); chmodSync(outputRoot, 0o700);
  const result = spawnSync(process.execPath, ["scripts/prepare-yuzhou-photo-owner-stage.mjs", "--", "--source-a", sourceA, "--source-b", sourceB, "--source-restore-receipt", receiptPath, "--output-root", outputRoot, "--run-id", "photo-owner-synthetic-d"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env } });
  // The CLI uses the checked-in baseline, so its synthetic source is intentionally rejected before any data output.
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /synthetic-owner|synthetic-path|\/Users\//u);
});
