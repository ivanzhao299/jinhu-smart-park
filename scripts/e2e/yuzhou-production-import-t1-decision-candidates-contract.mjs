#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { materializeProductionT1DecisionCandidates, ProductionT1DecisionCandidatesError } from "../hr-cutover/materialize-production-t1-decision-candidates.mjs";
import { computeProductionImportTargetScopeHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value, Object.keys(value).sort());
const root = mkdtempSync(join(tmpdir(), "yuzhou-production-t1-decisions-"));
const privateDirectory = path => { mkdirSync(path, { mode: 0o700 }); chmodSync(path, 0o700); };
const privateFile = (path, value) => { writeFileSync(path, value, { mode: 0o600 }); chmodSync(path, 0o600); };

try {
  const staging = join(root, "staging"), output = join(root, "output");
  privateDirectory(staging); privateDirectory(output);
  const codeSha = "a".repeat(40), snapshot = "b".repeat(64), mapping = "c".repeat(64);
  const triple = { codeSha, sourceSnapshotHash: snapshot, mappingContractHash: mapping };
  const eventFor = (legacyId, employeeCode) => {
    const source = { legacyId, legacyEventNo: `EV-${legacyId}`, employeeCode, legacyEventType: "就职", sourceEffectiveAt: "2026-01-01 08:30:00", beforeOrgCode: null, afterOrgCode: "ORG", beforePositionCode: null, afterPositionCode: "P", legacyEmployeeState: null, legacyState: "1", departmentflag: null, jobflag: null, payflag: null, otherflag: null, reason: null };
    return { sourceTable: "dbo.readjust", sourceKey: String(legacyId), sourceIdentitySha256: sha(`dbo.readjust\0${legacyId}`), sourceRowSha256: sha(canonical(source)), source };
  };
  const events = Array.from({ length: 6887 }, (_, index) => eventFor(index + 1, index === 6886 ? "E-MISSING" : "E-001"));
  const types = [{ sourceValue: "就职", usageCount: 2890 }, { sourceValue: "调职", usageCount: 1746 }, { sourceValue: "离职", usageCount: 1962 }, { sourceValue: "复职", usageCount: 289 }];
  const states = [{ sourceValue: "1", usageCount: 6887 }];
  const files = { employmentEvents: ["employment-events.jsonl", `${events.map(JSON.stringify).join("\n")}\n`], employmentEventTypes: ["employment-event-types.json", `${JSON.stringify(types)}\n`], employmentEventStates: ["employment-event-states.json", `${JSON.stringify(states)}\n`] };
  const domains = {};
  for (const [name, [file, bytes]] of Object.entries(files)) { privateFile(join(staging, file), bytes); domains[name] = { rows: name === "employmentEvents" ? events.length : JSON.parse(bytes).length, file, fileSha256: sha(bytes) }; }
  privateFile(join(staging, "manifest.json"), `${JSON.stringify({ formatVersion: 1, domains })}\n`);
  const triplePath = join(root, "triple.json"); privateFile(triplePath, `${JSON.stringify(triple)}\n`);
  const phasePath = join(root, "phase.json");
  privateFile(phasePath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_phase_staging", triple, phase: "T1", records: events.map(row => ({ phase: "T1", targetTable: "hr_employment_event", sourceSystem: "yuzhou-v10", sourceTable: "dbo.readjust", sourcePkCanonical: `sha256:${row.sourceIdentitySha256}`, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 })) })}\n`);
  const targetScope = { tenantId: "10000001", parkId: "20000001" }; targetScope.scopeSha256 = computeProductionImportTargetScopeHash(targetScope);
  const targetIdentitySha256 = "d".repeat(64), employeeIdentity = sha("dbo.person\0E-001"), employeeId = "11111111-1111-4111-8111-111111111111";
  const t0Path = join(root, "t0.json");
  privateFile(t0Path, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_hr_production_import_real_t0_decision_candidates", triple, phaseArtifactSha256: "e".repeat(64), targetInventoryArtifactSha256: "f".repeat(64), targetIdentitySha256, targetScope, jobStateDecisionArtifactSha256: "1".repeat(64), status: "READY_FOR_FREEZE", countByDisposition: { insert: 1, skip_exact: 0, review_target_collision: 0, quarantine: 0 }, records: [{ phase: "T0", targetTable: "hr_employee", sourceSystem: "yuzhou-v10", sourceTable: "dbo.person", sourcePkCanonical: `sha256:${employeeIdentity}`, sourceIdentitySha256: employeeIdentity, sourceRowSha256: "2".repeat(64), candidateDisposition: "insert", reasonCode: null, targetFields: {}, dependencyRefs: [], businessIdentitySha256: "3".repeat(64), expectedTargetId: employeeId, expectedTargetVersion: null, expectedTargetCanonicalSha256: null }], productionImport: "HOLD" })}\n`);
  const typePath = join(root, "types.json");
  privateFile(typePath, `${JSON.stringify({ formatVersion: 1, artifactKind: "yuzhou_t1_employment_event_type_machine_decision", sourceSystem: "yuzhou-v10", sourceSnapshotSha256: snapshot, dictionaryCode: "employment_event_type", sourceTable: "dbo.readjust.readjusttype", sourceRecordCount: 6887, decisions: [{ sourceValue: "就职", usageCount: 2890, decision: "map", targetDomain: "employment_event_type", targetValue: "start_probation", reasonCode: "ONLINE_LIFECYCLE_EQUIVALENT" }, { sourceValue: "调职", usageCount: 1746, decision: "map", targetDomain: "employment_event_type", targetValue: "transfer", reasonCode: "ONLINE_LIFECYCLE_EQUIVALENT" }, { sourceValue: "离职", usageCount: 1962, decision: "map", targetDomain: "employment_event_type", targetValue: "depart", reasonCode: "ONLINE_LIFECYCLE_EQUIVALENT" }, { sourceValue: "复职", usageCount: 289, decision: "map", targetDomain: "employment_event_type", targetValue: "resume", reasonCode: "ONLINE_LIFECYCLE_EQUIVALENT" }], productionImport: "HOLD" })}\n`);
  const statePath = join(root, "states.json"), stateValue = "1";
  const stateItem = { id: randomUUID(), sourceCode: null, sourceName: null, sourceValue: stateValue, sourceIdentitySha256: sha(`dbo.readjust.state\0${stateValue}`), sourceRowSha256: sha("fixture-state"), decision: "map", targetDomain: "migration_decision", targetValue: "accepted", reasonCode: "EFFECTIVE_SOURCE_STATE" };
  privateFile(statePath, `${JSON.stringify({ formatVersion: 1, kind: "yuzhou_core_non_t0_machine_dictionary_package", triple, trustedRootSha256: "4".repeat(64), machineActor: { id: randomUUID(), kind: "machine_policy_engine", verifiedAt: "2026-01-01T00:00:00Z" }, evidence: {}, dictionaries: [{ dictionaryCode: "employment_event_state", sourceTable: "dbo.readjust", sourceSnapshotSha256: "5".repeat(64), items: [stateItem] }], productionImport: "HOLD" })}\n`);
  const snapshotPath = join(root, "snapshot.json");
  privateFile(snapshotPath, `${JSON.stringify({ formatVersion: 1, kind: "yuzhou_hr_production_preimport_snapshot_readonly", status: "HOLD", productionImport: "HOLD", executionReachable: false, targetIdentitySha256, targetScopeSha256: targetScope.scopeSha256, sourceIdentityBinding: "PENDING_SOURCE_MANIFEST", phases: { T1: { beforeImageCandidate: { rowCount: 0 }, activeRecordMapCandidate: { rowCount: 0 } } }, reasonCodes: [] })}\n`);
  const outputPath = join(output, "candidates.json");
  const result = materializeProductionT1DecisionCandidates({ stagingDir: staging, triplePath, phaseArtifactPath: phasePath, t0CandidatesPath: t0Path, typeDecisionPath: typePath, stateDecisionPath: statePath, targetSnapshotPath: snapshotPath, outputPath }, { head: () => codeSha });
  assert.equal(result.status, "REVIEW_HOLD"); assert.equal(result.recordCount, 6887); assert.deepEqual(result.countByDisposition, { insert: 6886, skip_exact: 0, review_target_collision: 0, quarantine: 1 });
  const artifact = JSON.parse(readFileSync(outputPath, "utf8"));
  assert.equal(artifact.records.filter(row => row.candidateDisposition === "insert").length, 6886);
  assert.equal(artifact.records.filter(row => row.reasonCode === "EMPLOYMENT_EVENT_EMPLOYEE_NOT_MAPPED").length, 1);
  assert.doesNotMatch(JSON.stringify(result), /E-001|EV-1|ORG/u);
  const populated = artifact.records.find(row => row.candidateDisposition === "insert");
  assert.equal(populated.targetFields.source_effective_at, "2026-01-01T08:30:00+08:00");
  const nonEmptySnapshot = JSON.parse(readFileSync(snapshotPath, "utf8")); nonEmptySnapshot.phases.T1.beforeImageCandidate.rowCount = 1; privateFile(join(root, "snapshot-nonempty.json"), `${JSON.stringify(nonEmptySnapshot)}\n`);
  assert.throws(() => materializeProductionT1DecisionCandidates({ stagingDir: staging, triplePath, phaseArtifactPath: phasePath, t0CandidatesPath: t0Path, typeDecisionPath: typePath, stateDecisionPath: statePath, targetSnapshotPath: join(root, "snapshot-nonempty.json"), outputPath: join(output, "blocked.json") }, { head: () => codeSha }), error => error instanceof ProductionT1DecisionCandidatesError && error.code === "PRODUCTION_IMPORT_T1_DECISION_TARGET_INVENTORY_REQUIRED");
  console.log("Yuzhou production T1 decision candidates contract passed: source, dictionary, T0 dependency, empty-target proof, and row accounting are sealed.");
} finally {
  rmSync(root, { recursive: true, force: true });
}
