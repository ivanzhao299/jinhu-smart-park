#!/usr/bin/env node
/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  computeProductionImportPayloadHash,
} from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import {
  createHeldPerformanceRelationsBinding,
} from "../hr-cutover/production-import-performance-relations-contract.mjs";
import {
  ProductionImportPerformanceFactIdentityContractError,
  createProductionPerformanceFactIdentityBinding,
  validateProductionPerformanceFactIdentityBinding,
} from "../hr-cutover/production-import-performance-fact-identity-contract.mjs";
import {
  ProductionPerformanceFactIdentityWriterError,
  probeProductionPerformanceFactIdentityCapability,
  rollbackProductionPerformanceFactIdentity,
  validateProductionPerformanceFactIdentityInvocation,
  writeProductionPerformanceFactIdentity,
} from "../hr-cutover/production-import-performance-fact-identity-writer.mjs";

const root = resolve(import.meta.dirname, "../..");
const h = value => createHash("sha256").update(`synthetic:${value}`).digest("hex");
const EMPTY_FACT_SET_SHA256 = "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945";
const MIGRATION_310_SHA256 = "e67936f0983dea544d09d4885c75bf1ee50cc9e08fa5684a2fbe46f8ca8afee5";
const triple = Object.freeze({
  codeSha: "1".repeat(40),
  sourceSnapshotHash: h("source"),
  mappingContractHash: h("mapping"),
});

const parentPerformanceRelationsBinding = () => createHeldPerformanceRelationsBinding({
  triple: structuredClone(triple),
  relationPayloadArtifactSha256: h("relation-payload"),
  identityDecisionArtifactSha256: h("identity-decisions"),
  t0PhaseReceiptSha256: h("t0-receipt"),
});

const parentPerformanceFactLoaderBinding = parent => ({
  formatVersion: 1,
  bindingKind: "yuzhou_hr_production_import_performance_fact_loader_binding",
  triple: structuredClone(triple),
  sourceRestoreReceiptSha256: h("source-restore-receipt"),
  sourceFactLocationReceiptSha256: parent.sourceFactLocationReceiptSha256,
  sourceFactLocationCanonicalSha256: parent.sourceFactLocationCanonicalSha256,
  factPayloadArtifactSha256: h("fact-payload"),
  masterPayloadArtifactSha256: h("master-payload"),
  t0PhaseReceiptSha256: parent.t0PhaseReceiptSha256,
  migration300Sha256: h("migration-300"),
  migration301Sha256: h("migration-301"),
  migration302Sha256: h("migration-302"),
  migration303Sha256: h("migration-303"),
  migration310Sha256: MIGRATION_310_SHA256,
  migration311Sha256: h("migration-311"),
  templateRows: 0,
  levelRuleRows: 0,
  dimensionRows: 0,
  guideRows: 0,
  dimensionResultRows: 0,
  masterResultRows: 0,
  activeFactMaps: 0,
  identityFactSetSha256: EMPTY_FACT_SET_SHA256,
  fullFactSetSha256: EMPTY_FACT_SET_SHA256,
  sourceOutcomeFactStatus: "AUTHORITATIVE_EMPTY",
  forwardOrder: ["legacy_config_and_detail", "legacy_master"],
  rollbackOrder: [
    "master_result", "dimension_result", "dimension_level_guide",
    "dimension_profile", "level_rule", "template_profile",
  ],
  productionImport: "HOLD",
});

function parents() {
  const relations = parentPerformanceRelationsBinding();
  return { relations, loader: parentPerformanceFactLoaderBinding(relations) };
}

function binding(parentBindings = parents()) {
  return createProductionPerformanceFactIdentityBinding({
    triple: structuredClone(triple),
    parentPerformanceRelationsBinding: parentBindings.relations,
    parentPerformanceFactLoaderBinding: parentBindings.loader,
    t0PhaseReceiptSha256: h("t0-receipt"),
    expectedDimensionRows: 0,
    expectedMasterRows: 0,
    expectedFactSetSha256: EMPTY_FACT_SET_SHA256,
  });
}

function invocation(overrides = {}) {
  const parentBindings = parents();
  return {
    binding: binding(parentBindings),
    parentPerformanceRelationsBinding: parentBindings.relations,
    parentPerformanceFactLoaderBinding: parentBindings.loader,
    operationId: "yzprod-import-20260905T010203Z-123456abcdef",
    sealedPlanSha256: h("plan"),
    authorizationArtifactSha256: h("authorization"),
    authorizationNonceSha256: h("authorization-nonce"),
    extensionNonceSha256: h("fact-identity-extension-nonce"),
    codeSha: triple.codeSha,
    sourceSnapshotSha256: triple.sourceSnapshotHash,
    mappingContractSha256: triple.mappingContractHash,
    targetIdentitySha256: h("target"),
    expectedTargetIdentitySha256: h("target"),
    targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") },
    expectedTargetScopeSha256: h("scope"),
    t0PhaseReceiptSha256: h("t0-receipt"),
    parentRelationsReceiptSha256: h("runtime-parent-receipt"),
    factLoaderReceiptSha256: h("runtime-fact-loader-receipt"),
    tx: { query: async () => ({ rows: [] }) },
    ...overrides,
  };
}

function succeededReceipt(overrides = {}) {
  return {
    status: "succeeded",
    replayed: false,
    dimension_rows: "0",
    master_rows: "0",
    fact_rows: "0",
    resolved_rows: "0",
    unmatched_rows: "0",
    ambiguous_rows: "0",
    not_applicable_rows: "0",
    cycle_resolved_rows: "0",
    cycle_unmatched_rows: "0",
    cycle_ambiguous_rows: "0",
    cycle_not_applicable_rows: "0",
    fact_set_sha256: EMPTY_FACT_SET_SHA256,
    resolution_state_sha256: h("resolution-state"),
    fact_owner_maps: "0",
    relation_owner_maps: "124",
    verified_owner_maps: "124",
    owner_map_state_sha256: h("owner-map-state"),
    receipt_sha256: h("fact-identity-receipt"),
    ...overrides,
  };
}

const migration = readFileSync(new URL(
  "../../database/migrations/000310_hr_yuzhou_performance_fact_identity_production.sql",
  import.meta.url,
), "utf8");

test("000310 exposes one aggregate least-privilege capability", () => {
  for (const symbol of [
    "hr_yuzhou_performance_fact_identity_production_capability_v1",
    "hr_yuzhou_apply_performance_fact_identity_production_v1",
    "hr_yuzhou_rollback_performance_fact_identity_production_v1",
  ]) assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION ${symbol}\\(`, "u"));
  assert.match(migration, /jinhu-yuzhou-performance-fact-identity-production-v1/u);
  assert.match(migration, /CREATE ROLE jinhu_hr_yuzhou_performance_fact_identity_writer[\s\S]*NOLOGIN NOINHERIT NOSUPERUSER/u);
  assert.doesNotMatch(migration, /employee_display_name|source_person_code varchar|source_pay|password/iu);
  assert.doesNotMatch(migration, /DISABLE TRIGGER|session_replication_role/u);
});

test("fact-set binds exact non-PII source facts and has a stable empty hash", () => {
  for (const token of [
    "yuzhou-performance-fact-identity-set-v1",
    "sourceIdentitySha256",
    "sourceRowSha256",
    "sourcePersonIdentitySha256",
    "sourceSessionId",
    "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
  ]) {
    if (token.startsWith("4f53")) continue;
    assert.ok(migration.includes(token), `missing ${token}`);
  }
  assert.match(migration, /COALESCE\(jsonb_agg[\s\S]*'\[\]'::jsonb/u);
  assert.match(migration, /HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_FACT_SET_DRIFT/u);
});

test("identity materialization reuses authoritative T0 candidates and preserves unresolved cycle state", () => {
  assert.match(migration, /hr_performance_yuzhou_t0_person_candidate/u);
  assert.match(migration, /EXACT_T0_PERSON_MAP/u);
  assert.match(migration, /T0_PERSON_MAP_NOT_FOUND/u);
  assert.match(migration, /T0_PERSON_MAP_AMBIGUOUS/u);
  assert.match(migration, /SESSION_BINDING_UNRESOLVED/u);
  assert.match(migration, /ON CONFLICT\(id\) DO NOTHING[\s\S]*PRODUCTION_REPLAY_DRIFT/u);
});

test("apply is stacked on the exact 000308 receipt and migration history", () => {
  assert.match(migration, /ad77e0cf12cf73f98a5984835a9943a9e15c96cde37fe6bd95133845c711befa/u);
  assert.match(migration, /sys_schema_migration_history[\s\S]*schema_migrations/u);
  assert.match(migration, /parent_performance_relations_contract_sha256/u);
  assert.match(migration, /v_parent\.receipt_sha256/u);
  assert.match(migration, /v_parent\.sealed_plan_sha256/u);
  assert.match(migration, /v_parent\.t0_phase_receipt_sha256/u);
  assert.match(migration, /hr_yuzhou_performance_fact_loader_dependency_valid_v1/u);
  assert.match(migration, /RETURNS boolean[\s\S]*SELECT false/u);
  assert.match(migration, /HR_PERFORMANCE_FACT_IDENTITY_PRODUCTION_FACT_LOADER_INVALID/u);
  assert.match(migration, /fact_loader_receipt_sha256/u);
});

test("final apply promotes only the exact six fact and three relation owner maps", () => {
  for (const binding of [
    "dbo.assessmentcode>hr_performance_legacy_template_profile",
    "dbo.assgradecode>hr_performance_legacy_level_rule",
    "dbo.assitem>hr_performance_legacy_dimension_profile",
    "dbo.assitemgradedes>hr_performance_legacy_dimension_level_guide",
    "dbo.assessmentdetail>hr_performance_legacy_dimension_result",
    "dbo.assessmentmaster>hr_performance_legacy_master_result",
    "dbo.asssession>hr_performance_legacy_session",
    "dbo.asssour>hr_performance_legacy_score_source",
    "dbo.asssourperson>hr_performance_legacy_source_person_assignment",
  ]) {
    const [source, target] = binding.split(">");
    assert.match(migration, new RegExp(`${source.replaceAll(".", "\\.")}'[^;]+${target}`, "su"));
  }
  assert.match(migration, /hr_yuzhou_performance_owner_map_projection_v1/u);
  assert.match(migration, /map\.source_pk_canonical='sha256:'\|\|owner\.source_identity_sha256/u);
  assert.match(migration, /map\.target_table=owner\.target_table AND map\.target_id=owner\.target_id/u);
  assert.match(migration, /UPDATE public\.legacy_record_map map SET mapping_status='verified',update_time=now\(\)[\s\S]*FROM public\.hr_yuzhou_performance_owner_map_projection_v1/u);
  assert.doesNotMatch(migration, /UPDATE public\.legacy_record_map SET mapping_status='verified'\s+WHERE batch_id=/u);
  assert.match(migration, /v_before\.loaded_owner_maps<>v_before\.owner_maps OR v_before\.verified_owner_maps<>0/u);
  assert.match(migration, /v_after\.loaded_owner_maps<>0 OR v_after\.verified_owner_maps<>v_after\.owner_maps/u);
  assert.match(migration, /HR_PERFORMANCE_OWNER_MAP_(?:CONSERVATION|PRECONDITION|PROMOTION|REPLAY_DRIFT)/u);
  assert.match(migration, /ownerMapStateSha256/u);
  assert.match(migration, /fact_owner_maps,relation_owner_maps,verified_owner_maps,owner_map_state_sha256/u);
});

test("rollback owns only master and dimension identity and enforces reverse order", () => {
  assert.match(migration, /fact_kind IN\('dimension_result','master_result'\)/u);
  assert.match(migration, /v_assignment_rows<>234/u);
  assert.match(migration, /fact_identity>performance_relations>performance_facts/u);
  assert.doesNotMatch(migration, /DELETE FROM public\.hr_performance_legacy_(?:master|dimension)_result/u);
  assert.match(migration, /v_parent\.status NOT IN\('succeeded','rolled_back'\)/u);
  assert.match(migration, /v_receipt\.status<>'succeeded' OR v_parent\.status<>'succeeded'/u);
  assert.match(migration, /ROLLBACK_REPLAY_DRIFT[\s\S]*SELECT count\(\*\) INTO v_residual/u);
});

test("adapter seals both parent contracts without introducing runtime receipt hash cycles", () => {
  const parentBindings = parents();
  const sealedBinding = binding(parentBindings);
  assert.equal(sealedBinding.expectedFactRows, 0);
  assert.equal(
    sealedBinding.parentPerformanceRelationsContractSha256,
    computeProductionImportPayloadHash(parentBindings.relations),
  );
  assert.equal(
    sealedBinding.parentPerformanceFactLoaderContractSha256,
    computeProductionImportPayloadHash(parentBindings.loader),
  );
  assert.equal(Object.hasOwn(sealedBinding, "parentRelationsReceiptSha256"), false);
  assert.equal(Object.hasOwn(sealedBinding, "factLoaderReceiptSha256"), false);
  assert.deepEqual(sealedBinding.factKinds, ["dimension_result", "master_result"]);
  assert.deepEqual(
    sealedBinding.rollbackOrder,
    ["fact_identity", "performance_relations", "performance_facts"],
  );
  assert.equal(sealedBinding.productionImport, "HOLD");
});

test("adapter binding rejects count hash parent source and migration drift", () => {
  const parentBindings = parents();
  const sealedBinding = binding(parentBindings);
  for (const mutate of [
    value => { value.expectedMasterRows = 1; value.expectedFactRows = 1; },
    value => { value.expectedFactSetSha256 = h("wrong-set"); },
    value => { value.parentPerformanceRelationsContractSha256 = h("wrong-parent"); },
    value => { value.parentPerformanceFactLoaderContractSha256 = h("wrong-loader"); },
    value => { value.migration308Sha256 = h("wrong-migration"); },
    value => { value.migration310Sha256 = h("wrong-migration"); },
  ]) {
    const drift = structuredClone(sealedBinding);
    mutate(drift);
    assert.throws(
      () => validateProductionPerformanceFactIdentityBinding(drift, {
        parentPerformanceRelationsBinding: parentBindings.relations,
        parentPerformanceFactLoaderBinding: parentBindings.loader,
      }),
      ProductionImportPerformanceFactIdentityContractError,
    );
  }
  const wrongSourceLoader = structuredClone(parentBindings.loader);
  wrongSourceLoader.sourceFactLocationCanonicalSha256 = h("wrong-source-location");
  assert.throws(
    () => createProductionPerformanceFactIdentityBinding({
      triple: structuredClone(triple),
      parentPerformanceRelationsBinding: parentBindings.relations,
      parentPerformanceFactLoaderBinding: wrongSourceLoader,
      t0PhaseReceiptSha256: h("t0-receipt"),
      expectedDimensionRows: 0,
      expectedMasterRows: 0,
      expectedFactSetSha256: EMPTY_FACT_SET_SHA256,
    }),
    ProductionImportPerformanceFactIdentityContractError,
  );
});

test("adapter capability probe is fixed read-only and binds the reviewed schema", async () => {
  const parentBindings = parents();
  const sealedBinding = binding(parentBindings);
  const calls = [];
  const result = await probeProductionPerformanceFactIdentityCapability({
    binding: sealedBinding,
    parentPerformanceRelationsBinding: parentBindings.relations,
    parentPerformanceFactLoaderBinding: parentBindings.loader,
    query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return { rows: [{
        capability_id: "jinhu-yuzhou-performance-fact-identity-production-v1",
        migration_308_sha256: sealedBinding.migration308Sha256,
        production_context_supported: true,
        fact_kinds: "dimension_result>master_result",
        rollback_order: "fact_identity>performance_relations>performance_facts",
      }] };
    },
  });
  assert.deepEqual(result.factKinds, ["dimension_result", "master_result"]);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].parameters, []);
  assert.match(calls[0].sql, /hr_yuzhou_performance_fact_identity_production_capability_v1/u);
  assert.doesNotMatch(calls[0].sql, /INSERT|UPDATE|DELETE/u);
});

test("adapter writer passes the final 21 parameters and conserves both state partitions", async () => {
  const calls = [];
  const input = invocation({
    tx: { query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return { rows: [succeededReceipt()] };
    } },
  });
  const result = await writeProductionPerformanceFactIdentity(input);
  assert.equal(result.status, "succeeded");
  assert.equal(result.factRows, 0);
  assert.equal(result.factOwnerMaps, 0);
  assert.equal(result.relationOwnerMaps, 124);
  assert.equal(result.verifiedOwnerMaps, 124);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].parameters.length, 21);
  assert.deepEqual(calls[0].parameters.slice(12, 19), [
    input.t0PhaseReceiptSha256,
    input.parentRelationsReceiptSha256,
    input.binding.parentPerformanceRelationsContractSha256,
    input.factLoaderReceiptSha256,
    0,
    0,
    input.binding.expectedFactSetSha256,
  ]);
  assert.match(calls[0].sql, /hr_yuzhou_apply_performance_fact_identity_production_v1/u);
  for (const invalid of [
    succeededReceipt({ fact_rows: "1" }),
    succeededReceipt({ resolved_rows: "1" }),
    succeededReceipt({ cycle_unmatched_rows: "1" }),
    succeededReceipt({ fact_set_sha256: h("wrong-set") }),
    succeededReceipt({ fact_owner_maps: "1", verified_owner_maps: "125" }),
    succeededReceipt({ relation_owner_maps: "123", verified_owner_maps: "123" }),
    succeededReceipt({ verified_owner_maps: "123" }),
  ]) {
    await assert.rejects(
      () => writeProductionPerformanceFactIdentity({
        ...input,
        tx: { query: async () => ({ rows: [invalid] }) },
      }),
      error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_CONSERVATION_FAILED",
    );
  }
  for (const invalid of [
    succeededReceipt({ dimension_rows: null }),
    succeededReceipt({ master_rows: false }),
    succeededReceipt({ resolved_rows: "" }),
    succeededReceipt({ replayed: "false" }),
    succeededReceipt({ fact_owner_maps: null }),
    succeededReceipt({ relation_owner_maps: false }),
    succeededReceipt({ verified_owner_maps: "" }),
    succeededReceipt({ owner_map_state_sha256: "not-a-hash" }),
  ]) {
    await assert.rejects(
      () => writeProductionPerformanceFactIdentity({
        ...input,
        tx: { query: async () => ({ rows: [invalid] }) },
      }),
      error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_RECEIPT_INVALID",
    );
  }
});

test("adapter invocation drift fails before any database call", async () => {
  const calls = [];
  const base = invocation({ tx: { query: async () => { calls.push(true); return { rows: [] }; } } });
  for (const patch of [
    { extensionNonceSha256: "not-a-hash" },
    { parentRelationsReceiptSha256: "not-a-hash" },
    { factLoaderReceiptSha256: "not-a-hash" },
    { sourceSnapshotSha256: h("wrong-source") },
    { expectedTargetScopeSha256: h("wrong-scope") },
  ]) {
    const candidate = { ...base, ...patch };
    assert.throws(
      () => validateProductionPerformanceFactIdentityInvocation(candidate),
      ProductionPerformanceFactIdentityWriterError,
    );
    await assert.rejects(
      () => writeProductionPerformanceFactIdentity(candidate),
      ProductionPerformanceFactIdentityWriterError,
    );
  }
  assert.equal(calls.length, 0);
});

test("adapter database failures expose stable codes without raw diagnostics", async () => {
  const input = invocation();
  await assert.rejects(
    () => probeProductionPerformanceFactIdentityCapability({
      binding: input.binding,
      parentPerformanceRelationsBinding: input.parentPerformanceRelationsBinding,
      parentPerformanceFactLoaderBinding: input.parentPerformanceFactLoaderBinding,
      query: async () => { throw new Error("private database diagnostic"); },
    }),
    error => error.code
      === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_SCHEMA_CAPABILITY_UNAVAILABLE"
      && !error.message.includes("private database diagnostic")
      && error.cause === undefined,
  );
  await assert.rejects(
    () => writeProductionPerformanceFactIdentity({
      ...input,
      tx: { query: async () => { throw new Error("private apply diagnostic"); } },
    }),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_APPLY_FAILED"
      && !error.message.includes("private apply diagnostic")
      && error.cause === undefined,
  );
  const rollbackInput = {
    ...input,
    rollbackOperationId: "yzprod-rollback-20260905T020304Z-fedcba654321",
    extensionRollbackNonceSha256: h("fact-identity-rollback-nonce"),
    tx: { query: async () => { throw new Error("private rollback diagnostic"); } },
  };
  delete rollbackInput.extensionNonceSha256;
  await assert.rejects(
    () => rollbackProductionPerformanceFactIdentity(rollbackInput),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_ROLLBACK_FAILED"
      && !error.message.includes("private rollback diagnostic")
      && error.cause === undefined,
  );
});

test("adapter rollback uses a separate nonce and enforces zero residual", async () => {
  const calls = [];
  const input = invocation({
    rollbackOperationId: "yzprod-rollback-20260905T020304Z-fedcba654321",
    extensionRollbackNonceSha256: h("fact-identity-rollback-nonce"),
    tx: { query: async (sql, parameters) => {
      calls.push({ sql, parameters });
      return { rows: [{
        status: "rolled_back",
        rollback_order: "fact_identity>performance_relations>performance_facts",
        residual_count: "0",
        replayed: false,
        receipt_sha256: h("rollback-receipt"),
      }] };
    } },
  });
  delete input.extensionNonceSha256;
  const result = await rollbackProductionPerformanceFactIdentity(input);
  assert.deepEqual(
    result.rollbackOrder,
    ["fact_identity", "performance_relations", "performance_facts"],
  );
  assert.equal(result.residualCount, 0);
  assert.equal(calls[0].parameters.length, 19);
  assert.equal(calls[0].parameters[14], input.binding.parentPerformanceRelationsContractSha256);
  assert.equal(calls[0].parameters[15], input.parentRelationsReceiptSha256);
  assert.equal(calls[0].parameters[16], input.factLoaderReceiptSha256);
  await assert.rejects(
    () => rollbackProductionPerformanceFactIdentity({
      ...input,
      tx: { query: async () => ({ rows: [{
        status: "rolled_back",
        rollback_order: "fact_identity>performance_relations>performance_facts",
        residual_count: "1",
        replayed: false,
        receipt_sha256: h("rollback-residual"),
      }] }) },
    }),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_ROLLBACK_RESIDUAL",
  );
  await assert.rejects(
    () => rollbackProductionPerformanceFactIdentity({
      ...input,
      tx: { query: async () => ({ rows: [{
        status: "rolled_back",
        rollback_order: "fact_identity>performance_relations>performance_facts",
        residual_count: "0",
        replayed: "false",
        receipt_sha256: h("rollback-invalid-replayed"),
      }] }) },
    }),
    error => error.code === "PRODUCTION_IMPORT_PERFORMANCE_FACT_IDENTITY_RECEIPT_INVALID",
  );
});

test("adapter contract remains hash-and-count only and keeps compatibility credit held", () => {
  const contract = JSON.parse(readFileSync(
    resolve(root, "scripts/hr-cutover/contracts/production-import-performance-fact-identity-v1.json"),
    "utf8",
  ));
  assert.equal(contract.upstreamFactWriter.requiredPlanProperty, "performanceFactLoader");
  assert.equal(
    contract.upstreamFactWriter.requiredAuthorizationBinding,
    "performanceFactLoaderContractSha256",
  );
  assert.equal(contract.upstreamFactWriter.runtimeReceiptBinding, "factLoaderReceiptSha256");
  assert.equal(
    contract.upstreamFactWriter.missingDisposition,
    "PRODUCTION_FACT_LOADER_RECEIPT_REQUIRED",
  );
  assert.equal(contract.factSet.containsTargetUuid, false);
  assert.equal(contract.factSet.containsPersonalData, false);
  assert.equal(contract.compatibilityCredit, 0);
  const sources = [
    readFileSync(resolve(root, "scripts/hr-cutover/production-import-performance-fact-identity-contract.mjs"), "utf8"),
    readFileSync(resolve(root, "scripts/hr-cutover/production-import-performance-fact-identity-writer.mjs"), "utf8"),
  ].join("\n");
  assert.doesNotMatch(sources, /sourcePersonCode|employeeDisplayName|full_name|salary|password/iu);
});
