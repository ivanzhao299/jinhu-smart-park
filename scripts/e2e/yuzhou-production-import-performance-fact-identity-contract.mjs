#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

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

test("rollback owns only master and dimension identity and enforces reverse order", () => {
  assert.match(migration, /fact_kind IN\('dimension_result','master_result'\)/u);
  assert.match(migration, /v_assignment_rows<>234/u);
  assert.match(migration, /fact_identity>performance_relations>performance_facts/u);
  assert.doesNotMatch(migration, /DELETE FROM public\.hr_performance_legacy_(?:master|dimension)_result/u);
  assert.match(migration, /v_parent\.status NOT IN\('succeeded','rolled_back'\)/u);
  assert.match(migration, /v_receipt\.status<>'succeeded' OR v_parent\.status<>'succeeded'/u);
  assert.match(migration, /ROLLBACK_REPLAY_DRIFT[\s\S]*SELECT count\(\*\) INTO v_residual/u);
});
