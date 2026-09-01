#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import { prepareYuzhouDocumentOwnerStage } from "../prepare-yuzhou-document-owner-stage.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-document-owner-stage-"));
chmodSync(root, 0o700);
const baseline = { sourceSnapshotSha256: sha("source-snapshot"), sourceRestoreReceiptSha256: null, businessSha256: sha("business"), catalogSha256: sha("catalog"), mappingContractSha256: sha("mapping") };
const receipt = sealSourceRestoreReceipt({
  formatVersion: 1, artifactKind: "yuzhou_hr_source_restore_receipt", sourceSnapshotSha256: baseline.sourceSnapshotSha256,
  backup: { sha256: baseline.sourceSnapshotSha256, bytes: 1, containerCopySha256: baseline.sourceSnapshotSha256, containerCopyBytes: 1 },
  identities: { containerSha256: sha("container"), imageSha256: sha("image"), databaseSha256: sha("database"), restoreSha256: sha("restore"), catalogSha256: sha("catalog-identity") },
  state: { online: true, readOnly: true }, etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false }, productionImport: "HOLD"
});
const receiptPath = join(root, "receipt.json"); writeFileSync(receiptPath, `${JSON.stringify(receipt)}\n`, { mode: 0o600 }); chmodSync(receiptPath, 0o600); baseline.sourceRestoreReceiptSha256 = sha(readFileSync(receiptPath));

function writePrivate(path, contents) { writeFileSync(path, contents, { mode: 0o600 }); chmodSync(path, 0o600); return sha(contents); }
function createSourceStage(name, { mutate = null } = {}) {
  const stage = join(root, name); mkdirSync(stage, { mode: 0o700 }); chmodSync(stage, 0o700);
  const people = Array.from({ length: 2949 }, (_, index) => ({ sourceTable: "dbo.person.core_residue", source: { id: `person-id-${index}`, person: `private-person-${index}` } }));
  const docs = Array.from({ length: 1003 }, (_, index) => ({
    sourceTable: "dbo.docs", sourceIdentitySha256: sha(`doc:${index}`), sourceRowSha256: sha(`row:${index}`), fileRole: "employee_document",
    source: { pkid: index < 989 ? `person-id-${index}` : `unmapped-${index}`, fName: `private-file-${index}` }, contentSha256: null, actualSize: null, readabilityStatus: "empty"
  }));
  mutate?.({ people, docs });
  const peopleBytes = `${people.map(row => JSON.stringify(row)).join("\n")}\n`, docsBytes = `${docs.map(row => JSON.stringify(row)).join("\n")}\n`;
  const peopleSha = writePrivate(join(stage, "person_core.jsonl"), peopleBytes), docsSha = writePrivate(join(stage, "docs.jsonl"), docsBytes);
  const manifest = { productionImport: "HOLD", sensitive: true, businessSha256: baseline.businessSha256, catalogSha256: baseline.catalogSha256, mappingContractSha256: baseline.mappingContractSha256, domains: {
    person_core: { sourceObject: "dbo.person.core_residue", rows: 2949, file: "person_core.jsonl", fileSha256: peopleSha },
    docs: { sourceObject: "dbo.docs", rows: 1003, file: "docs.jsonl", fileSha256: docsSha }
  } };
  writePrivate(join(stage, "manifest.json"), `${JSON.stringify(manifest)}\n`); return stage;
}

test("document owner stage emits hash-only mapped and quarantined evidence", () => {
  const sourceA = createSourceStage("source-a"), sourceB = createSourceStage("source-b"), outputRoot = join(root, "output"); mkdirSync(outputRoot, { mode: 0o700 }); chmodSync(outputRoot, 0o700);
  const result = prepareYuzhouDocumentOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot, runId: "document-owner-synthetic-a", baseline });
  assert.deepEqual({ sourceRows: result.sourceRows, resolvedRows: result.resolvedRows, quarantinedRows: result.quarantinedRows, productionImport: result.productionImport }, { sourceRows: 1003, resolvedRows: 989, quarantinedRows: 14, productionImport: "HOLD" });
  const output = readFileSync(join(outputRoot, "staging-document-owner-synthetic-a", "document-owner-evidence.jsonl"), "utf8");
  assert.equal((output.match(/\n/g) ?? []).length, 1003);
  assert.doesNotMatch(output, /private-person|private-file|person-id-|unmapped-/u);
  const rows = output.split("\n").filter(Boolean).map(JSON.parse), mapped = rows.find(row => row.sourceIdentitySha256 === sha("doc:0")), quarantined = rows.find(row => row.ownershipStatus === "quarantined");
  assert.deepEqual(Object.keys(mapped).sort(), ["actualSize", "contentSha256", "fileRole", "ownerSourceIdentitySha256", "ownerSourceTable", "ownershipStatus", "quarantineReason", "readabilityStatus", "sourceIdentitySha256", "sourceRowSha256", "sourceTable"]);
  assert.equal(mapped.ownerSourceIdentitySha256, sha("dbo.person\0private-person-0"));
  assert.equal(quarantined.ownerSourceIdentitySha256, null); assert.equal(quarantined.quarantineReason, "DOCUMENT_OWNER_UNMAPPED");
});

test("document owner stage fails closed for A/B drift and unsafe input mode", () => {
  const sourceA = createSourceStage("drift-a"), sourceB = createSourceStage("drift-b", { mutate: ({ docs }) => { docs[0].source.pkid = "different-owner"; } });
  const outputRoot = join(root, "drift-output"); mkdirSync(outputRoot, { mode: 0o700 }); chmodSync(outputRoot, 0o700);
  assert.throws(() => prepareYuzhouDocumentOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot, runId: "document-owner-synthetic-b", baseline }), /A\/B document source file mismatch/u);
  chmodSync(join(sourceA, "docs.jsonl"), 0o644);
  assert.throws(() => prepareYuzhouDocumentOwnerStage({ sourceA, sourceB, sourceRestoreReceipt: receiptPath, outputRoot, runId: "document-owner-synthetic-c", baseline }), /private regular file/u);
});
