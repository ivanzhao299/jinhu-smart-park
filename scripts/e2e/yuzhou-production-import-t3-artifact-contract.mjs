#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { materializeProductionT3PhaseArtifact, ProductionT3PhaseArtifactError } from "../hr-cutover/materialize-production-t3-phase-artifact.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t3-artifact-"));
const privateDirectory = path => { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); };
const privateFile = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };

function row(sourceTable, sourceKey, source, extra) {
  return { sourceTable, sourceKey, sourceIdentitySha256: sha(`${sourceTable}\0${sourceKey}`), sourceRowSha256: sha(`raw:${sourceTable}:${sourceKey}`), source, ...extra };
}

try {
  const staging = join(root, "staging"), output = join(root, "output");
  privateDirectory(staging); privateDirectory(output);
  const attendance = row("dbo.timekeeptable", "calendar-1", { id: 1, calendarName: "fixture-calendar", year: 2026, month: 1 }, { days: [{ day: 1, legacySymbol: "fixture-symbol" }, { day: 2, legacySymbol: null }] });
  const policy = row("dbo.insure_method", "policy-1", { id: 1, name: "fixture-policy", scope: "fixture-scope" }, { items: [{ kind: "fixture-kind", variant: 1, baseRate: "0.01", employerRate: "0.01", employeeRate: "0.01", supplementRate: null, baseFixedAmount: "1", employerFixedAmount: "1", employeeFixedAmount: "1", supplementFixedAmount: null }] });
  const insurance = row("dbo.person_insure", "insurance-1", { id: 1, year: 2026, month: 1, employeeCode: "fixture-employee" }, { items: [{ kind: "fixture-kind", contributionBase: "1", totalAmount: "1", employerAmount: "1", employeeAmount: "1", supplementAmount: null, legacyBaseNegative: false, legacyFlag: null }] });
  const fixtureFiles = {
    attendance: ["attendance.jsonl", `${JSON.stringify(attendance)}\n`],
    policies: ["policies.jsonl", `${JSON.stringify(policy)}\n`],
    insurance: ["insurance.jsonl", `${JSON.stringify(insurance)}\n`],
  };
  const stageDomains = {};
  for (const [domain, [file, bytes]] of Object.entries(fixtureFiles)) {
    privateFile(join(staging, file), bytes);
    stageDomains[domain] = { rows: 1, file, fileSha256: sha(bytes) };
  }
  const stageManifest = { formatVersion: 1, domains: stageDomains };
  privateFile(join(staging, "manifest.json"), `${JSON.stringify(stageManifest)}\n`);

  const codeSha = "a".repeat(40), snapshot = "b".repeat(64), mapping = "c".repeat(64);
  const triplePath = join(root, "triple.json");
  privateFile(triplePath, `${JSON.stringify({ codeSha, sourceSnapshotHash: snapshot, mappingContractHash: mapping })}\n`);
  const required = {
    T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"],
    T1: ["employmentEventStates", "employmentEventTypes", "employmentEvents"],
    T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"],
    T3: Object.keys(fixtureFiles),
  };
  const phases = {};
  for (const [phase, domains] of Object.entries(required)) {
    phases[phase] = { stageManifestSha256: phase === "T3" ? sha(readFileSync(join(staging, "manifest.json"))) : sha(`manifest:${phase}`), domains: {} };
    for (const domain of domains) phases[phase].domains[domain] = phase === "T3" ? { rows: stageDomains[domain].rows, fileSha256: stageDomains[domain].fileSha256 } : { rows: 0, fileSha256: sha(`${phase}:${domain}`) };
  }
  const sourceManifestPath = join(root, "source-manifest.json");
  privateFile(sourceManifestPath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: snapshot, sourceRestoreReceiptSha256: "d".repeat(64), sourceCatalogSha256: "e".repeat(64), mappingContractSha256: mapping, phases, productionImport: "HOLD" })}\n`);

  const outputPath = join(output, "t3-phase.json");
  const result = materializeProductionT3PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath }, { head: () => codeSha });
  assert.equal(result.status, "READY_FOR_REVIEW");
  assert.equal(result.recordCount, 9);
  assert.deepEqual(result.targetTableCounts, {
    hr_attendance_import_batch: 1,
    hr_attendance_symbol_rule: 1,
    hr_attendance_calendar_source: 1,
    hr_attendance_day: 2,
    hr_insurance_policy: 1,
    hr_insurance_policy_item: 1,
    hr_employee_insurance_period: 1,
    hr_employee_insurance_item: 1,
  });
  assert.equal(result.productionImport, "HOLD");
  const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(new Set(artifact.records.map(value => value.sourceIdentitySha256)).size, artifact.records.length);
  assert.deepEqual(artifact.targetTableCounts, result.targetTableCounts);
  assert.doesNotMatch(JSON.stringify(artifact), /fixture-calendar|fixture-symbol|fixture-policy|fixture-employee/u);

  assert.throws(
    () => materializeProductionT3PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "drift.json") }, { head: () => "f".repeat(40) }),
    error => error instanceof ProductionT3PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T3_ARTIFACT_TRIPLE_INVALID",
  );
  privateFile(join(staging, "insurance.jsonl"), "tampered\n");
  assert.throws(
    () => materializeProductionT3PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "tampered.json") }, { head: () => codeSha }),
    error => error instanceof ProductionT3PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T3_ARTIFACT_STAGE_DRIFT",
  );
  console.log("Yuzhou production T3 phase artifact contract passed: normalized coverage, unique projections, C/S/M binding, and no production write");
} finally {
  rmSync(root, { recursive: true, force: true });
}
