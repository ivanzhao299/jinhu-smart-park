#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL(
  "../../database/migrations/000308_hr_yuzhou_performance_relations_production.sql",
  import.meta.url,
), "utf8");

test("000308 exposes only the reviewed production capability, apply, and rollback surface", () => {
  for (const name of [
    "hr_yuzhou_performance_relations_production_capability_v1",
    "hr_yuzhou_apply_performance_relations_production_v1",
    "hr_yuzhou_rollback_performance_relations_production_v1",
  ]) assert.match(migration, new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(`, "u"));
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.hr_yuzhou_apply_performance_relations_production_v1/u);
  assert.match(migration, /TO jinhu_hr_yuzhou_performance_relations_writer/u);
  assert.doesNotMatch(migration, /DISABLE TRIGGER|session_replication_role/u);
  assert.doesNotMatch(migration, /CALL public\.materialize_yuzhou_performance_legacy_(?:relations|identity_resolution)_lab/u);
});

test("production context remains bound to one succeeded T0 batch and consumed authority", () => {
  for (const token of [
    "batch.execution_context='production_import'",
    "batch.production_import_phase='T0'",
    "batch.status='succeeded'",
    "operation.status='running'",
    "operation.current_phase='T0'",
    "auth.intent='production_import'",
    "auth.intent='production_import_rollback'",
    "p_t0_phase_receipt_sha256",
  ]) assert.ok(migration.includes(token), `missing ${token}`);
  assert.match(migration, /v_t0_phase\.after_canonical_sha256<>p_t0_phase_receipt_sha256/u);
  assert.match(migration, /HR_PERFORMANCE_RELATIONS_PRODUCTION_T0_RECEIPT_INVALID/u);
  assert.match(migration, /FUNCTION hr_yuzhou_performance_relations_production_context_allowed\([\s\S]*SECURITY DEFINER/u);
  assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.hr_yuzhou_performance_relations_production_context_allowed/u);
});

test("fixed migration bytes, conservation, replay drift, and reverse rollback are database-enforced", () => {
  assert.ok(migration.includes("d3784218fc8272bd28b93e44b19a02d5c8124466b6b3c218294920603909dfc0"));
  assert.ok(migration.includes("cd49f294f4c9e4105b9f7fd4c678b7b2d29c5433d0348f6e6632d6e7c135a56d"));
  assert.match(migration, /ROW\(v_session_rows,v_score_rows,v_assignment_rows,v_map_rows,v_identity_rows,[\s\S]*ROW\(7,0,117,124,234,7,108,117\)/u);
  assert.match(migration, /HR_PERFORMANCE_RELATIONS_PRODUCTION_REPLAY_DRIFT/u);
  const identityDelete = migration.indexOf("DELETE FROM public.hr_performance_legacy_identity_resolution");
  const relationDelete = migration.indexOf("DELETE FROM public.hr_performance_legacy_source_person_assignment");
  assert.ok(identityDelete >= 0 && relationDelete > identityDelete);
  assert.match(migration, /identity_resolution>source_person_assignments/u);
  assert.match(migration, /v_residual<>0/u);
});

test("control receipt is aggregate and least-privilege roles cannot log in", () => {
  assert.match(migration, /CREATE TABLE hr_yuzhou_performance_relations_production_receipt/u);
  assert.match(migration, /session_rows integer NOT NULL/u);
  assert.match(migration, /identity_resolution_rows integer NOT NULL/u);
  assert.doesNotMatch(migration, /employee_display_name|source_person_code varchar|source_assessor_code varchar/iu);
  assert.match(migration, /CREATE ROLE jinhu_hr_yuzhou_performance_relations_writer NOLOGIN NOINHERIT NOSUPERUSER/u);
  assert.match(migration, /HR_PERFORMANCE_RELATIONS_PRODUCTION_ROLE_UNSAFE/u);
});
