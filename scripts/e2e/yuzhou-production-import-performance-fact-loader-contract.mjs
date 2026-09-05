#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  computeProductionPerformanceFactLoaderBindingSha256,
  createProductionPerformanceFactLoaderBinding,
  validateProductionPerformanceFactLoaderBinding,
} from "../hr-cutover/production-import-performance-fact-loader-contract.mjs";
import {
  probeProductionPerformanceFactLoaderCapability,
  validateProductionPerformanceFactLoaderInvocation,
  writeProductionPerformanceFacts,
} from "../hr-cutover/production-import-performance-fact-loader-writer.mjs";
import { computeProductionImportPayloadHash } from "../hr-cutover/production-import-sealed-plan-lib.mjs";

const migration = readFileSync(new URL(
  "../../database/migrations/000311_hr_yuzhou_performance_facts_production.sql",
  import.meta.url,
), "utf8");
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const emptyIdentitySet = createHash("sha256").update("[]").digest("hex");
const factPayload = Buffer.from("{\"synthetic\":\"facts\"}");
const masterPayload = Buffer.from("{\"synthetic\":\"master\"}");
const triple = { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") };

const binding = createProductionPerformanceFactLoaderBinding({
  triple,
  sourceRestoreReceiptSha256: h("restore"),
  sourceFactLocationReceiptSha256: h("fact-location-receipt"),
  sourceFactLocationCanonicalSha256: "1e37b27f0ac3975fd989d54341ff2c64b3e64955a38b80b03a00fe25cdf04182",
  factPayloadArtifactSha256: createHash("sha256").update(factPayload).digest("hex"),
  masterPayloadArtifactSha256: createHash("sha256").update(masterPayload).digest("hex"),
  t0PhaseReceiptSha256: h("t0"),
  migration310Sha256: "e67936f0983dea544d09d4885c75bf1ee50cc9e08fa5684a2fbe46f8ca8afee5",
  migration311Sha256: h("migration-311"),
  templateRows: 0,
  levelRuleRows: 3,
  dimensionRows: 33,
  guideRows: 30,
  dimensionResultRows: 0,
  masterResultRows: 0,
  activeFactMaps: 66,
  identityFactSetSha256: emptyIdentitySet,
  fullFactSetSha256: h("full-fact-set"),
  sourceOutcomeFactStatus: "AUTHORITATIVE_EMPTY",
  productionImport: "HOLD",
});

const invocation = {
  operationId: "yzprod-import-20260905T010203Z-123456abcdef",
  sealedPlanSha256: h("plan"),
  authorizationArtifactSha256: h("auth"),
  authorizationNonceSha256: h("nonce"),
  codeSha: triple.codeSha,
  sourceSnapshotSha256: triple.sourceSnapshotHash,
  mappingContractSha256: triple.mappingContractHash,
  targetIdentitySha256: h("target"),
  expectedTargetIdentitySha256: h("target"),
  targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") },
  expectedTargetScopeSha256: h("scope"),
  t0PhaseReceiptSha256: binding.t0PhaseReceiptSha256,
  factPayloadArtifact: factPayload,
  masterPayloadArtifact: masterPayload,
  binding,
};

test("binding delegates canonical hash and validation to the shared sealed-plan contract", () => {
  assert.deepEqual(validateProductionPerformanceFactLoaderBinding(binding), binding);
  assert.equal(computeProductionPerformanceFactLoaderBindingSha256(binding), computeProductionImportPayloadHash(binding));
  assert.deepEqual(validateProductionPerformanceFactLoaderInvocation(invocation), { binding });
  assert.throws(() => validateProductionPerformanceFactLoaderInvocation(invocation, { rollback: true }), error =>
    error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_INPUT_INVALID");
  assert.deepEqual(validateProductionPerformanceFactLoaderInvocation({ ...invocation,
    rollbackOperationId: "yzprod-rollback-20260905T020304Z-fedcba654321" }, { rollback: true }), { binding });
});

test("current authoritative empty source cannot be relabelled as nonempty", () => {
  const invalid = { ...binding, dimensionResultRows: 1, activeFactMaps: 67,
    identityFactSetSha256: h("nonempty-identity"), sourceOutcomeFactStatus: "AUTHORITATIVE_NONEMPTY" };
  assert.throws(() => validateProductionPerformanceFactLoaderBinding(invalid), error =>
    error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_CURRENT_SOURCE_NONEMPTY_FORBIDDEN");
});

test("writer validates private bytes before database mutation and hides database diagnostics", async () => {
  assert.throws(() => validateProductionPerformanceFactLoaderInvocation({ ...invocation,
    factPayloadArtifact: Buffer.from("drift") }), error =>
    error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_ARTIFACT_HASH_MISMATCH");
  await assert.rejects(() => writeProductionPerformanceFacts({ ...invocation,
    tx: { query: async () => { throw new Error("sensitive database diagnostic"); } } }), error =>
    error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_DATABASE_APPLY_FAILED"
      && !error.message.includes("sensitive"));
});

test("strict receipt parsing rejects null, false, and string-empty counts", async () => {
  const row = {
    status: "succeeded", replayed: false, template_rows: null, level_rule_rows: "3",
    dimension_rows: "33", guide_rows: "30", dimension_result_rows: "0",
    master_result_rows: "0", active_fact_maps: "66",
    identity_fact_set_sha256: binding.identityFactSetSha256,
    full_fact_set_sha256: binding.fullFactSetSha256, receipt_sha256: h("receipt"),
  };
  await assert.rejects(() => writeProductionPerformanceFacts({ ...invocation,
    tx: { query: async () => ({ rows: [row] }) } }), error =>
    error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_LOADER_RECEIPT_INVALID");
});

test("capability is aggregate-only and exact", async () => {
  const result = await probeProductionPerformanceFactLoaderCapability({ binding, query: async () => ({ rows: [{
    capability_id: "jinhu-yuzhou-performance-fact-loader-production-v1",
    migration_300_sha256: binding.migration300Sha256,
    migration_301_sha256: binding.migration301Sha256,
    migration_302_sha256: binding.migration302Sha256,
    migration_303_sha256: binding.migration303Sha256,
    fact_identity_dependency_supported: true,
    reverse_order: binding.rollbackOrder.join(">"),
  }] }) });
  assert.equal(result.factIdentityDependencySupported, true);
});

test("000311 reuses the two installed materializers and enforces exact reverse dependencies", () => {
  assert.match(migration, /pg_get_functiondef\('public\.materialize_yuzhou_performance_legacy_lab/u);
  assert.match(migration, /pg_get_functiondef\('public\.materialize_yuzhou_performance_legacy_master_lab/u);
  assert.match(migration, /hr_yuzhou_performance_fact_loader_dependency_valid_v1/u);
  assert.match(migration, /identity_receipt\.status<>'rolled_back'/u);
  assert.match(migration, /relation_receipt\.status<>'rolled_back'/u);
  assert.match(migration, /hr_yuzhou_performance_production_receipt_chain_v1/u);
  assert.equal((migration.match(/SET CONSTRAINTS ALL DEFERRED;/gu) ?? []).length, 2);
  assert.doesNotMatch(migration, /parent_performance_fact_loader_contract_sha256/u);
  assert.match(migration, /v_receipt\.status='rolled_back' AND v_receipt\.active_fact_maps=0/u);
  for (const number of [300, 301, 302, 303, 310, 311]) {
    assert.match(migration, new RegExp(`000${number}_hr_`, "u"));
  }
  assert.match(migration, /JOIN public\.schema_migrations b USING\(filename,checksum,status\)/u);
  assert.match(migration, /TO jinhu_hr_yuzhou_performance_facts_writer/u);
  assert.match(migration, /REVOKE ALL ON public\.hr_yuzhou_performance_facts_production_receipt FROM PUBLIC/u);
  assert.doesNotMatch(migration, /DISABLE TRIGGER|session_replication_role|source_person_code\s+varchar/iu);
});
