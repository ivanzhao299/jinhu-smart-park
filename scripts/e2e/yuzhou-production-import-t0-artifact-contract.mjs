#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  ProductionT0PhaseArtifactError,
  materializeProductionT0PhaseArtifact,
} from "../hr-cutover/materialize-production-t0-phase-artifact.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const codeSha = "a".repeat(40);
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t0-artifact-"));
chmodSync(root, 0o700);
const staging = join(root, "staging");
const output = join(root, "output");
for (const path of [staging, output]) {
  // mkdtemp already created the private root; explicit modes are part of the contract.
  mkdirSync(path, { mode: 0o700 });
  chmodSync(path, 0o700);
}

const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const domainRows = {
  departments: [{ key: "D001", source: { legacyCode: "D001", orgName: "Engineering" }, table: "dbo.departmentcode" }],
  positions: [{ key: "P001", source: { legacyCode: "P001", positionName: "Engineer" }, table: "dbo.job" }],
  employees: [{ key: "E001", source: { employeeCode: "E001", fullName: "Fixture" }, table: "dbo.person" }],
};
const files = { departments: "departments.jsonl", positions: "positions.jsonl", employees: "employees.jsonl" };
const manifest = { formatVersion: 1, domains: {} };
for (const [domain, rows] of Object.entries(domainRows)) {
  const bytes = `${rows.map(row => JSON.stringify({
    sourceTable: row.table,
    sourceKey: row.key,
    sourceIdentitySha256: sha(`${row.table}\0${row.key}`),
    sourceRowSha256: sha(canonical(row.source)),
    source: row.source,
  })).join("\n")}\n`;
  writeFileSync(join(staging, files[domain]), bytes, { mode: 0o600 });
  chmodSync(join(staging, files[domain]), 0o600);
  manifest.domains[domain] = { rows: rows.length, file: files[domain], fileSha256: sha(bytes) };
}
writeFileSync(join(staging, "manifest.json"), `${JSON.stringify(manifest)}\n`, { mode: 0o600 });
chmodSync(join(staging, "manifest.json"), 0o600);
const triplePath = join(root, "triple.json");
writeFileSync(triplePath, `${JSON.stringify({ codeSha, sourceSnapshotHash: "b".repeat(64), mappingContractHash: "c".repeat(64) })}\n`, { mode: 0o600 });
chmodSync(triplePath, 0o600);

const outputPath = join(output, "t0-phase.json");
const result = materializeProductionT0PhaseArtifact({ stagingDir: staging, triplePath, outputPath }, { head: () => codeSha });
assert.deepEqual(result, {
  status: "READY_FOR_REVIEW",
  phase: "T0",
  recordCount: 3,
  targetTableCounts: { sys_org: 1, hr_position: 1, hr_employee: 1 },
  artifactSha256: result.artifactSha256,
  productionImport: "HOLD",
});
assert.match(result.artifactSha256, /^[0-9a-f]{64}$/u);
const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
assert.equal(artifact.phase, "T0");
assert.equal(artifact.records.length, 3);
assert.deepEqual(artifact.records.map(row => Object.keys(row).sort()), Array.from({ length: 3 }, () => ["phase", "sourceIdentitySha256", "sourcePkCanonical", "sourceRowSha256", "sourceSystem", "sourceTable", "targetTable"]));
assert.doesNotMatch(JSON.stringify(result), /Fixture|E001|D001|P001/u);

assert.throws(
  () => materializeProductionT0PhaseArtifact({ stagingDir: staging, triplePath, outputPath: join(output, "again.json") }, { head: () => "d".repeat(40) }),
  error => error instanceof ProductionT0PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T0_ARTIFACT_TRIPLE_INVALID",
);
chmodSync(join(staging, files.employees), 0o644);
assert.throws(
  () => materializeProductionT0PhaseArtifact({ stagingDir: staging, triplePath, outputPath: join(output, "bad-mode.json") }, { head: () => codeSha }),
  error => error instanceof ProductionT0PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T0_ARTIFACT_PATH_INVALID",
);

console.log("Yuzhou production T0 phase artifact contract passed: private hash-only source receipt, C/S/M binding, no production write");
