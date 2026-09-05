#!/usr/bin/env node
/* global process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const migrationPath = resolve(root, "database/migrations/000309_hr_yuzhou_performance_person_assessment_production.sql");
const dependencyPath = process.env.YUZHOU_PERFORMANCE_RELATIONS_PRODUCTION_MIGRATION
  ?? resolve(root, "database/migrations/000308_hr_yuzhou_performance_relations_production.sql");
const migration307Path = resolve(root, "database/migrations/000307_hr_performance_yuzhou_ass_compute_weight_relation.sql");
const adapterPath = resolve(root, "scripts/hr-cutover/performance-person-assessment-production-adapter.mjs");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-assessment-production-adapter-v1.json");
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const migration = readFileSync(migrationPath, "utf8");
const migration307 = readFileSync(migration307Path);
const adapter = readFileSync(adapterPath, "utf8");
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes);

test("000309 is stacked on the exact reviewed 000308 capability and immutable 000307 bytes", () => {
  assert.equal(existsSync(dependencyPath), true, `000308 dependency missing: ${dependencyPath}`);
  const dependencySha256 = sha256(readFileSync(dependencyPath));
  assert.match(migration, new RegExp(dependencySha256, "u"));
  assert.match(migration, /hr_yuzhou_performance_relations_production_capability_v1\(\)/u);
  assert.match(migration, /hr_yuzhou_performance_relations_production_context_allowed\(p_batch_id,'apply'\)/u);
  assert.match(migration, /hr_yuzhou_performance_relations_production_receipt/u);
  assert.match(migration, /sys_schema_migration_history[\s\S]*schema_migrations[\s\S]*000308_hr_yuzhou_performance_relations_production\.sql/u);
  assert.match(migration, /receipt\.t0_phase_receipt_sha256=phase\.after_canonical_sha256/u);
  assert.match(migration, new RegExp(sha256(migration307), "u"));
  assert.equal(sha256(migration307), contract.weightRelationMigration.sha256);
  assert.match(migration, new RegExp(sha256(contractBytes), "u"));
});

test("fixed interfaces bind C/S/M, T0, restore receipt, payload, both migrations, and one-time authority", () => {
  for (const token of [
    "code_sha", "source_snapshot_sha256", "mapping_contract_sha256", "t0_artifact_sha256",
    "source_restore_receipt_sha256", "source_payload_artifact_sha256", "safe_receipt_artifact_sha256",
    "contract_artifact_sha256", "migration_307_sha256", "migration_308_sha256", "payload_sha256",
    "sealed_artifact_sha256", "binding_sha256", "authorization_artifact_sha256",
    "authorization_nonce_sha256", "owner_state_sha256",
  ]) assert.match(migration, new RegExp(token, "u"));
  assert.match(migration, /CREATE TABLE hr_yuzhou_performance_person_assessment_authorization_use/u);
  assert.match(migration, /authorization_artifact_sha256 char\(64\) NOT NULL UNIQUE/u);
  assert.match(migration, /authorization_nonce_sha256 char\(64\) NOT NULL UNIQUE/u);
  assert.match(migration, /production_performance_person_assessment_import/u);
  assert.match(migration, /production_performance_person_assessment_rollback/u);
  assert.match(adapter, /consume_performance_person_assessment_authorization\(\$1,\$2,\$3,\$4,\$5,\$6,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15,\$16,\$17\)/u);
  assert.match(adapter, /artifact\.bindings\.sourceRestoreReceiptSha256[\s\S]*artifact\.payloadSha256/u);
});

test("production mutation stays append-only, hash-only, and leaves every owner table unchanged", () => {
  assert.match(migration, /materialize_yuzhou_performance_ass_compute_weight_relation_production/u);
  assert.match(migration, /hr_yuzhou_performance_person_assessment_payload_sha256\(p_payload\)<>p_payload_sha256/u);
  const materializeStart = migration.indexOf("CREATE OR REPLACE PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production");
  const payloadHashCheck = migration.indexOf("hr_yuzhou_performance_person_assessment_payload_sha256(p_payload)<>p_payload_sha256", materializeStart);
  const successfulReplay = migration.indexOf("IF v_operation.status='succeeded' THEN RETURN", materializeStart);
  assert.ok(materializeStart >= 0 && payloadHashCheck > materializeStart && successfulReplay > payloadHashCheck);
  assert.match(migration, /HR_PERFORMANCE_PERSON_ASSESSMENT_OWNER_DRIFT/u);
  assert.doesNotMatch(migration, /INSERT INTO public\.hr_performance_legacy_(?:template_profile|dimension_profile|dimension_result|master_result)/u);
  assert.doesNotMatch(migration, /(?:UPDATE|DELETE FROM) public\.hr_performance_legacy_(?:template_profile|dimension_profile|dimension_result|master_result)/u);
  assert.match(migration, /INSERT INTO public\.hr_performance_legacy_person_assessment_evidence/u);
  assert.match(migration, /INSERT INTO public\.hr_performance_legacy_ass_compute_weight_resolution/u);
  const rollbackStart = migration.indexOf("CREATE OR REPLACE PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production");
  const resolutionDelete = migration.indexOf("DELETE FROM public.hr_performance_legacy_ass_compute_weight_resolution", rollbackStart);
  const evidenceDelete = migration.indexOf("DELETE FROM public.hr_performance_legacy_person_assessment_evidence", rollbackStart);
  assert.ok(rollbackStart >= 0 && resolutionDelete > rollbackStart && evidenceDelete > resolutionDelete);
  assert.match(migration, /v_residual<>0/u);
  assert.match(migration, /operation_row\.operation_id=p_operation_id/u);
  assert.equal(contract.writer.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("least-privilege roles receive only fixed SECURITY DEFINER interfaces", () => {
  assert.match(migration, /CREATE ROLE jinhu_hr_yuzhou_perf_assessment_reader\s+NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/u);
  assert.match(migration, /CREATE ROLE jinhu_hr_yuzhou_perf_assessment_executor\s+NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS/u);
  assert.match(migration, /REVOKE ALL ON hr_yuzhou_performance_person_assessment_operation,[\s\S]*FROM PUBLIC/u);
  assert.doesNotMatch(migration, /GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[\s\S]* ON (?:TABLE )?hr_yuzhou_performance_person_assessment/u);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION hr_yuzhou_performance_person_assessment_production_capability/u);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION hr_yuzhou_performance_person_assessment_production_receipt/u);
  assert.match(migration, /GRANT EXECUTE ON PROCEDURE materialize_yuzhou_performance_ass_compute_weight_relation_production/u);
  assert.match(migration, /GRANT EXECUTE ON PROCEDURE rollback_yuzhou_performance_ass_compute_weight_relation_production/u);
});

test("000307 remains byte-for-byte lab-only while 000309 preserves its lab guard path", () => {
  assert.match(migration307.toString("utf8"), /execution_context<>'lab_rehearsal'/u);
  assert.doesNotMatch(migration307.toString("utf8"), /materialize_yuzhou_performance_ass_compute_weight_relation_production/u);
  assert.match(migration, /v_batch\.execution_context='lab_rehearsal' AND v_batch\.phase='load'/u);
  assert.match(migration, /yuzhou\.ass_compute_weight_rollback_batch_id/u);
});
