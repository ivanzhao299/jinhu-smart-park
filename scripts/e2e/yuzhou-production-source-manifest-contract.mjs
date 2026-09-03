import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prepareProductionSourceManifest,
  ProductionSourceManifestError,
} from "../prepare-yuzhou-production-source-manifest.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-source-manifest-"));
const privateFile = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const privateDirectory = path => { mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700); };
const domains = {
  T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"],
  T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"],
  T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"],
  T3: ["attendance", "insurance", "policies"],
};

try {
  const backupPath = join(root, "source.dbk");
  privateFile(backupPath, "fixture-backup");
  const backupSha = sha(readFileSync(backupPath));
  const receipt = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: backupSha,
    backup: { sha256: backupSha, bytes: 14, containerCopySha256: backupSha, containerCopyBytes: 14 },
    identities: { containerSha256: sha("container"), imageSha256: sha("image"), databaseSha256: sha("database"), restoreSha256: sha("restore"), catalogSha256: sha("catalog") },
    state: { online: true, readOnly: true },
    etlAuthority: { loginSucceeded: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false },
    productionImport: "HOLD",
  });
  const receiptPath = join(root, "receipt.json");
  privateFile(receiptPath, `${JSON.stringify(receipt)}\n`);
  const mapping = sha("mapping-contract");
  const stages = {};
  for (const [phase, names] of Object.entries(domains)) {
    const stage = join(root, phase.toLowerCase());
    privateDirectory(stage);
    const manifestDomains = {};
    for (const name of names) {
      const file = `${name.replaceAll(".", "-")}.jsonl`;
      privateFile(join(stage, file), `sensitive-probe-value:${phase}:${name}\n`);
      manifestDomains[name] = { rows: 1, file, fileSha256: sha(readFileSync(join(stage, file))) };
    }
    const manifest = {
      formatVersion: 1,
      productionImport: "HOLD",
      sourceSnapshotSha256: backupSha,
      sourceRestoreReceiptSha256: sha(readFileSync(receiptPath)),
      sourceCatalogSha256: receipt.identities.catalogSha256,
      mappingContractSha256: mapping,
      domains: manifestDomains,
    };
    privateFile(join(stage, "manifest.json"), JSON.stringify(manifest));
    stages[phase] = stage;
  }
  const outputRoot = join(root, "out");
  const result = prepareProductionSourceManifest({ backupPath, receiptPath, mappingContractSha256: mapping, stages, outputRoot, runId: "yzsrc-20260903-a" });
  assert.equal(result.phaseCount, 4);
  assert.equal(result.productionImport, "HOLD");
  const output = join(outputRoot, "source-manifest-yzsrc-20260903-a.json");
  const outputText = readFileSync(output, "utf8");
  const outputJson = JSON.parse(outputText);
  assert.equal(outputJson.artifactKind, "yuzhou_hr_production_source_manifest");
  assert.equal(outputJson.productionImport, "HOLD");
  assert.deepEqual(Object.keys(outputJson.phases), ["T0", "T1", "T2", "T3"]);
  assert.doesNotMatch(outputText, /sensitive-probe-value/);
  assert.throws(
    () => prepareProductionSourceManifest({ backupPath, receiptPath, mappingContractSha256: mapping, stages, outputRoot, runId: "yzsrc-20260903-a" }),
    error => error instanceof ProductionSourceManifestError && error.code === "PRODUCTION_SOURCE_MANIFEST_OUTPUT_EXISTS",
  );
  privateFile(join(stages.T2, "dbo-compact.jsonl"), "tampered\n");
  assert.throws(
    () => prepareProductionSourceManifest({ backupPath, receiptPath, mappingContractSha256: mapping, stages, outputRoot, runId: "yzsrc-20260903-b" }),
    error => error instanceof ProductionSourceManifestError && error.code === "PRODUCTION_SOURCE_MANIFEST_STAGE_CONTENT_DRIFT",
  );
  console.log("Yuzhou production source manifest contract passed: four phases, exact receipt binding, hash-only output, and source-content drift rejection.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
