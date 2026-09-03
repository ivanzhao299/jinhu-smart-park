#!/usr/bin/env node
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  prepareProductionT0Triple,
  ProductionT0TripleError,
} from "../hr-cutover/prepare-production-t0-triple.mjs";

const sourceSnapshotSha256 = "b".repeat(64);
const mappingContractSha256 = "c".repeat(64);
const codeSha = "a".repeat(40);
const domains = {
  T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"],
  T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"],
  T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"],
  T3: ["attendance", "insurance", "policies"],
};
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t0-triple-"));
chmodSync(root, 0o700);
const output = join(root, "output");
mkdirSync(output, { mode: 0o700 });
chmodSync(output, 0o700);
const sourceManifestPath = join(root, "source-manifest.json");
const sourceManifest = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_production_source_manifest",
  sourceReadOnly: true,
  sourceSnapshotSha256,
  sourceRestoreReceiptSha256: "d".repeat(64),
  sourceCatalogSha256: "e".repeat(64),
  mappingContractSha256,
  phases: Object.fromEntries(Object.entries(domains).map(([phase, names]) => [phase, {
    stageManifestSha256: `${phase === "T0" ? "1" : phase === "T1" ? "2" : phase === "T2" ? "3" : "4"}`.repeat(64),
    domains: Object.fromEntries(names.map((name, index) => [name, { rows: 1, fileSha256: `${(index + 5).toString(16)}`.repeat(64) }])),
  }])),
  productionImport: "HOLD",
};
writeFileSync(sourceManifestPath, `${JSON.stringify(sourceManifest)}\n`, { mode: 0o600 });
chmodSync(sourceManifestPath, 0o600);

const outputPath = join(output, "t0-triple.json");
const result = prepareProductionT0Triple({ sourceManifestPath, outputPath }, { head: () => codeSha });
assert.deepEqual(result, { status: "READY_FOR_REVIEW", tripleSha256: result.tripleSha256, productionImport: "HOLD" });
assert.match(result.tripleSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), { codeSha, sourceSnapshotHash: sourceSnapshotSha256, mappingContractHash: mappingContractSha256 });
assert.doesNotMatch(JSON.stringify(result), /sourceManifest|departments|employees/u);

chmodSync(sourceManifestPath, 0o644);
assert.throws(
  () => prepareProductionT0Triple({ sourceManifestPath, outputPath: join(output, "unsafe.json") }, { head: () => codeSha }),
  error => error instanceof ProductionT0TripleError && error.code === "PRODUCTION_IMPORT_T0_TRIPLE_PATH_INVALID",
);
chmodSync(sourceManifestPath, 0o600);
assert.throws(
  () => prepareProductionT0Triple({ sourceManifestPath, outputPath: join(output, "bad-head.json") }, { head: () => "not-a-sha" }),
  error => error instanceof ProductionT0TripleError && error.code === "PRODUCTION_IMPORT_T0_TRIPLE_INPUT_INVALID",
);

console.log("Yuzhou production T0 C/S/M triple contract passed: private verified source binding, current code SHA, and no production write");
