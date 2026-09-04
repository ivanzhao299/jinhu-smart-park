#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { materializeProductionT2PhaseArtifact, ProductionT2PhaseArtifactError } from "../hr-cutover/materialize-production-t2-phase-artifact.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t2-artifact-"));
const privateDirectory = path => { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); };
const privateFile = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };

function row(sourceTable, sourceKey, source) {
  return { sourceTable, sourceKey, sourceIdentitySha256: sha(`${sourceTable}\0${sourceKey}`), sourceRowSha256: sha(canonical(source)), source };
}

try {
  const staging = join(root, "staging"), output = join(root, "output");
  privateDirectory(staging); privateDirectory(output);
  const type = row("dbo.compacttypecode", "type-fixture", { typeCode: "fixture-code", typeName: "fixture-type" });
  const contractWithoutEvidence = row("dbo.compact", "contract-1", { contractNo: "fixture-contract-1", legacyFilePresent: 0, legacyTextPresent: 0 });
  const contractWithEvidence = row("dbo.compact", "contract-2", { contractNo: "fixture-contract-2", legacyFilePresent: 0, legacyTextPresent: 1 });
  const change = row("dbo.compact_c", "change-1", { contractNo: "fixture-contract-2", sequenceNo: 1 });
  const fixtureFiles = {
    "dbo.compacttypecode": ["contract-types.jsonl", `${JSON.stringify(type)}\n`, 1],
    "dbo.compact": ["contracts.jsonl", `${JSON.stringify(contractWithoutEvidence)}\n${JSON.stringify(contractWithEvidence)}\n`, 2],
    "dbo.compact_c": ["contract-changes.jsonl", `${JSON.stringify(change)}\n`, 1],
    "dbo.compact.state": ["contract-states.raw.json", `${JSON.stringify(["fixture-active", "fixture-closed"])}\n`, 2],
  };
  const stageDomains = {};
  for (const [domain, [file, bytes, rows]] of Object.entries(fixtureFiles)) {
    privateFile(join(staging, file), bytes);
    stageDomains[domain] = { rows, file, fileSha256: sha(bytes) };
  }
  const stageManifest = { formatVersion: 1, domains: stageDomains };
  privateFile(join(staging, "manifest.json"), `${JSON.stringify(stageManifest)}\n`);

  const codeSha = "a".repeat(40), snapshot = "b".repeat(64), mapping = "c".repeat(64);
  const triplePath = join(root, "triple.json");
  privateFile(triplePath, `${JSON.stringify({ codeSha, sourceSnapshotHash: snapshot, mappingContractHash: mapping })}\n`);
  const required = {
    T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"],
    T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"],
    T2: Object.keys(fixtureFiles),
    T3: ["attendance", "insurance", "policies"],
  };
  const phases = {};
  for (const [phase, domains] of Object.entries(required)) {
    phases[phase] = { stageManifestSha256: phase === "T2" ? sha(readFileSync(join(staging, "manifest.json"))) : sha(`manifest:${phase}`), domains: {} };
    for (const domain of domains) phases[phase].domains[domain] = phase === "T2" ? { rows: stageDomains[domain].rows, fileSha256: stageDomains[domain].fileSha256 } : { rows: 0, fileSha256: sha(`${phase}:${domain}`) };
  }
  const sourceManifestPath = join(root, "source-manifest.json");
  privateFile(sourceManifestPath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: snapshot, sourceRestoreReceiptSha256: "d".repeat(64), sourceCatalogSha256: "e".repeat(64), mappingContractSha256: mapping, phases, productionImport: "HOLD" })}\n`);

  const outputPath = join(output, "t2-phase.json");
  const result = materializeProductionT2PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath }, { head: () => codeSha });
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.recordCount, 5);
  assert.deepEqual(result.targetTableCounts, { hr_contract_type: 1, hr_contract: 2, hr_contract_change: 1, hr_contract_legacy_evidence: 1 });
  assert.equal(result.productionImport, "HOLD");

  const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.deepEqual(artifact.targetTableCounts, result.targetTableCounts);
  assert.equal(artifact.records.filter(value => value.targetTable === "hr_contract_legacy_evidence").length, 1);
  const evidence = artifact.records.find(value => value.targetTable === "hr_contract_legacy_evidence");
  assert.equal(evidence.sourceIdentitySha256, sha(`yuzhou-hr-production-source-projection-v1\0${contractWithEvidence.sourceIdentitySha256}\0hr_contract_legacy_evidence`));
  assert.equal(evidence.sourceRowSha256, contractWithEvidence.sourceRowSha256);
  assert.equal(new Set(artifact.records.map(value => value.sourceIdentitySha256)).size, artifact.records.length);
  assert.doesNotMatch(JSON.stringify(artifact), /fixture-contract|fixture-type|fixture-active/u);

  assert.throws(
    () => materializeProductionT2PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "drift.json") }, { head: () => "f".repeat(40) }),
    error => error instanceof ProductionT2PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T2_ARTIFACT_TRIPLE_INVALID",
  );
  privateFile(join(staging, "contract-changes.jsonl"), "tampered\n");
  assert.throws(
    () => materializeProductionT2PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "tampered.json") }, { head: () => codeSha }),
    error => error instanceof ProductionT2PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T2_ARTIFACT_STAGE_DRIFT",
  );
  console.log("Yuzhou production T2 phase artifact contract passed: four-table coverage including zero-safe evidence, C/S/M binding, and no production write");
} finally {
  rmSync(root, { recursive: true, force: true });
}
