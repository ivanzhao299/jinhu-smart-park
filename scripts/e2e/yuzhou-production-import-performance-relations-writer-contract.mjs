#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createHeldPerformanceRelationsBinding } from "../hr-cutover/production-import-performance-relations-contract.mjs";
import {
  ProductionPerformanceRelationsWriterError,
  probeProductionPerformanceRelationsCapability,
  rollbackProductionPerformanceRelations,
  writeProductionPerformanceRelations,
} from "../hr-cutover/production-import-performance-relations-writer.mjs";

const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const binding = createHeldPerformanceRelationsBinding({
  triple: { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") },
  relationPayloadArtifactSha256: h("relations"), identityDecisionArtifactSha256: h("identity"),
  t0PhaseReceiptSha256: h("t0"),
});
const base = () => ({
  operationId: "yzprod-import-20260905T010203Z-123456abcdef", sealedPlanSha256: h("plan"),
  authorizationArtifactSha256: h("authorization"), authorizationNonceSha256: h("nonce"),
  codeSha: binding.triple.codeSha, sourceSnapshotSha256: binding.triple.sourceSnapshotHash,
  mappingContractSha256: binding.triple.mappingContractHash,
  targetIdentitySha256: h("target"), expectedTargetIdentitySha256: h("target"),
  targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") },
  expectedTargetScopeSha256: h("scope"), t0PhaseReceiptSha256: binding.t0PhaseReceiptSha256,
  relationPayloadArtifact: Buffer.from("synthetic:relations"), identityDecisionArtifact: Buffer.from("synthetic:identity"),
  binding,
});
const forwardRow = replayed => ({
  status: "succeeded", replayed, session_rows: 7, score_source_rows: 0, assignment_rows: 117,
  active_relation_maps: 124, identity_resolution_rows: 234, session_binding_rows: 7,
  subject_unmatched_rows: 108, blank_assessor_rows: 117, receipt_sha256: h("forward-receipt"),
});

test("read-only capability probe binds both migration bytes and the production execution context", async () => {
  const calls = [];
  const receipt = await probeProductionPerformanceRelationsCapability({ binding, query: async (sql, parameters) => {
    calls.push({ sql, parameters });
    return { rows: [{ capability_id: "jinhu-yuzhou-performance-relations-production-v1", migration_305_sha256: binding.migration305Sha256, migration_306_sha256: binding.migration306Sha256, production_context_supported: true, reverse_order: "identity_resolution>source_person_assignments" }] };
  } });
  assert.equal(receipt.productionContextSupported, true);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /capability/u);
  assert.deepEqual(calls[0].parameters, []);
});

test("missing production schema capability fails closed without exposing the database error", async () => {
  await assert.rejects(
    probeProductionPerformanceRelationsCapability({ binding, query: async () => { throw new Error("synthetic database detail"); } }),
    error => error instanceof ProductionPerformanceRelationsWriterError
      && error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_SCHEMA_CAPABILITY_UNAVAILABLE"
      && !error.message.includes("synthetic database detail"),
  );
});

test("writer binds authorization, C/S/M, target, T0, payload bytes and migration SHAs", async () => {
  const calls = [];
  const input = base();
  input.tx = { query: async (sql, parameters) => { calls.push({ sql, parameters }); return { rows: [forwardRow(false)] }; } };
  const receipt = await writeProductionPerformanceRelations(input);
  assert.equal(receipt.assignmentRows, 117);
  assert.equal(receipt.identityResolutionRows, 234);
  assert.equal(receipt.replayed, false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].parameters.slice(0, 13), [
    input.operationId, input.sealedPlanSha256, input.authorizationArtifactSha256, input.authorizationNonceSha256,
    input.codeSha, input.sourceSnapshotSha256, input.mappingContractSha256, input.targetIdentitySha256,
    input.targetScope.tenantId, input.targetScope.parkId, input.targetScope.scopeSha256,
    input.t0PhaseReceiptSha256, binding.relationPayloadArtifactSha256,
  ]);
  assert.equal(calls[0].parameters[13], binding.identityDecisionArtifactSha256);
  assert.equal(calls[0].parameters[16], binding.migration305Sha256);
  assert.equal(calls[0].parameters[17], binding.migration306Sha256);
});

test("pre-query drift never reaches the transaction handle", async () => {
  for (const mutate of [
    input => { input.codeSha = "2".repeat(40); },
    input => { input.t0PhaseReceiptSha256 = h("other-t0"); },
    input => { input.expectedTargetIdentitySha256 = h("other-target"); },
    input => { input.relationPayloadArtifact = Buffer.from("drift"); },
  ]) {
    let queries = 0;
    const input = base();
    mutate(input);
    input.tx = { query: async () => { queries += 1; return { rows: [forwardRow(false)] }; } };
    await assert.rejects(writeProductionPerformanceRelations(input), ProductionPerformanceRelationsWriterError);
    assert.equal(queries, 0);
  }
});

test("rollback adapter accepts only identity then relations with zero residual", async () => {
  const input = { ...base(), rollbackOperationId: "yzprod-rollback-20260905T020304Z-fedcba654321" };
  delete input.relationPayloadArtifact;
  delete input.identityDecisionArtifact;
  input.tx = { query: async () => ({ rows: [{ status: "rolled_back", rollback_order: "identity_resolution>source_person_assignments", residual_count: 0, replayed: false, receipt_sha256: h("rollback-receipt") }] }) };
  const receipt = await rollbackProductionPerformanceRelations(input);
  assert.deepEqual(receipt.rollbackOrder, ["identity_resolution", "source_person_assignments"]);
  assert.equal(receipt.residualCount, 0);
});

test("forward count drift and rollback residue are rejected", async () => {
  const input = base();
  input.tx = { query: async () => ({ rows: [{ ...forwardRow(false), assignment_rows: 116 }] }) };
  await assert.rejects(writeProductionPerformanceRelations(input), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_CONSERVATION_FAILED");
  const rollback = { ...base(), rollbackOperationId: "yzprod-rollback-20260905T020304Z-fedcba654321" };
  delete rollback.relationPayloadArtifact;
  delete rollback.identityDecisionArtifact;
  rollback.tx = { query: async () => ({ rows: [{ status: "rolled_back", rollback_order: "identity_resolution>source_person_assignments", residual_count: 1, replayed: false, receipt_sha256: h("rollback-receipt") }] }) };
  await assert.rejects(rollbackProductionPerformanceRelations(rollback), error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_RELATIONS_ROLLBACK_RESIDUAL");
});
