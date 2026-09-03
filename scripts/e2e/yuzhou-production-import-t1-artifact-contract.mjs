#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { materializeProductionT1PhaseArtifact, ProductionT1PhaseArtifactError } from "../hr-cutover/materialize-production-t1-phase-artifact.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t1-artifact-"));
const privateDirectory = path => { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); };
const privateFile = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const hash = value => sha(value);
const domains = ["employmentEventStates", "employmentEventTypes", "employmentEvents"];

try {
  const staging = join(root, "staging"), output = join(root, "output");
  privateDirectory(staging); privateDirectory(output);
  const source = { legacyId: 1, legacyEventNo: "L001", employeeCode: "E001", legacyEventType: "transfer", sourceEffectiveAt: "2026-01-01T00:00:00.000Z" };
  const event = { sourceTable: "dbo.readjust", sourceKey: "1", sourceIdentitySha256: sha("dbo.readjust\0" + "1"), sourceRowSha256: sha(canonical(source)), source };
  const fixtureFiles = {
    employmentEventStates: ["employment-event-states.json", "[]\n"],
    employmentEventTypes: ["employment-event-types.json", "[]\n"],
    employmentEvents: ["employment-events.jsonl", `${JSON.stringify(event)}\n`],
  };
  const stageDomains = {};
  for (const [name, [file, bytes]] of Object.entries(fixtureFiles)) {
    privateFile(join(staging, file), bytes);
    stageDomains[name] = { rows: name === "employmentEvents" ? 1 : 0, file, fileSha256: sha(bytes) };
  }
  const stageManifest = { formatVersion: 1, domains: stageDomains };
  privateFile(join(staging, "manifest.json"), `${JSON.stringify(stageManifest)}\n`);
  const codeSha = "a".repeat(40), snapshot = "b".repeat(64), mapping = "c".repeat(64);
  const triplePath = join(root, "triple.json"); privateFile(triplePath, `${JSON.stringify({ codeSha, sourceSnapshotHash: snapshot, mappingContractHash: mapping })}\n`);
  const phases = Object.fromEntries(["T0", "T1", "T2", "T3"].map(phase => [phase, { stageManifestSha256: hash(phase === "T1" ? readFileSync(join(staging, "manifest.json")) : phase), domains: {} }]));
  const required = { T0: ["departments", "employeeJobStates", "employees", "jobStateCodeMetadata", "jobStateCodes", "positions"], T1: domains, T2: ["dbo.compact", "dbo.compact.state", "dbo.compact_c", "dbo.compacttypecode"], T3: ["attendance", "insurance", "policies"] };
  for (const [phase, names] of Object.entries(required)) for (const name of names) phases[phase].domains[name] = phase === "T1" ? { rows: stageDomains[name].rows, fileSha256: stageDomains[name].fileSha256 } : { rows: 0, fileSha256: hash(`${phase}:${name}`) };
  const sourceManifestPath = join(root, "source-manifest.json");
  privateFile(sourceManifestPath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_source_manifest", sourceReadOnly: true, sourceSnapshotSha256: snapshot, sourceRestoreReceiptSha256: "d".repeat(64), sourceCatalogSha256: "e".repeat(64), mappingContractSha256: mapping, phases, productionImport: "HOLD" })}\n`);
  const outputPath = join(output, "t1-phase.json");
  const result = materializeProductionT1PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath }, { head: () => codeSha });
  assert.deepEqual(result, { status: "READY_FOR_REVIEW", phase: "T1", recordCount: 1, targetTableCounts: { hr_employment_event: 1 }, artifactSha256: result.artifactSha256, productionImport: "HOLD" });
  const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.deepEqual(artifact.records, [{ phase: "T1", targetTable: "hr_employment_event", sourceSystem: "yuzhou-v10", sourceTable: "dbo.readjust", sourcePkCanonical: `sha256:${event.sourceIdentitySha256}`, sourceIdentitySha256: event.sourceIdentitySha256, sourceRowSha256: event.sourceRowSha256 }]);
  assert.doesNotMatch(JSON.stringify(artifact), /L001|E001|transfer/u);
  assert.throws(() => materializeProductionT1PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "drift.json") }, { head: () => "f".repeat(40) }), error => error instanceof ProductionT1PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T1_ARTIFACT_TRIPLE_INVALID");
  privateFile(join(staging, "employment-events.jsonl"), "tampered\n");
  assert.throws(() => materializeProductionT1PhaseArtifact({ stagingDir: staging, triplePath, sourceManifestPath, outputPath: join(output, "tampered.json") }, { head: () => codeSha }), error => error instanceof ProductionT1PhaseArtifactError && error.code === "PRODUCTION_IMPORT_T1_ARTIFACT_STAGE_DRIFT");
  console.log("Yuzhou production T1 phase artifact contract passed: hash-only event provenance, current C/S/M, and no production write");
} finally {
  rmSync(root, { recursive: true, force: true });
}
