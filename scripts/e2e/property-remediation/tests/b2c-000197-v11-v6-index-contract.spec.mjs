import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  APPROVAL_ACTIVE_INDEX_MIGRATION_V11,
  assertEquivalentCreateIndexV11,
  parseActivePredicateV11,
  parseCreateIndexSqlV11,
  parseFormalApprovalActiveIndexContractV11,
} from "../track-b2c-000197-index-contract-v11.mjs";
import {
  FAILURE_INDEX_CONTRACT_V11,
  FAILURE_INJECTION_CASES_V11,
  renderFailureBoundarySqlV11,
} from "../track-b2c-000197-failure-cases-v11.mjs";

const migration = readFileSync(APPROVAL_ACTIVE_INDEX_MIGRATION_V11, "utf8");
const formal = parseFormalApprovalActiveIndexContractV11(migration);
const fixture = assertEquivalentCreateIndexV11(formal, FAILURE_INDEX_CONTRACT_V11.createSql);
const columns = ["tenant_id", "park_id", "action_id", "source_type", "source_id", "source_expected_version"];

test("failure fixture CREATE is structurally equivalent to the formal 000197 index DDL", () => {
  assert.deepEqual(fixture.columns, columns);
  assert.equal(fixture.target, formal.target);
  assert.equal(fixture.buildIndexName, formal.buildIndexName);
  assert.equal(fixture.normalizedPredicate, formal.normalizedPredicate);
  assert.equal(fixture.newIndexdefSha, formal.newIndexdefSha);
  assert.equal(fixture.newPredicateSha, formal.newPredicateSha);
  assert.equal(formal.newIndexdefSha, "dd004f0c2e5f40e86ec1953effa91b8604614e276c9fedabe7f2464f13d70d9c");
  assert.equal(formal.newPredicateSha, "24ef911486d5274d6c439d63de6aa253b289241ac2b75317b1f98bc93a5a8fda");
});

test("formal and fixture contracts retain exact six keys, active states and index names", () => {
  assert.deepEqual(formal.columns, columns);
  assert.deepEqual(formal.decisionStates, ["draft", "submitted", "pending_approval", "approved"]);
  assert.deepEqual(formal.executionStates, ["not_started", "executing", "retry_wait", "infra_exhausted"]);
  assert.equal(formal.target, "public.biz_property_approval_request");
  assert.equal(formal.buildIndexName, "uq_biz_property_approval_request_active_source_v2_build");
  assert.equal(formal.droppedIndexName, "uq_biz_property_approval_request_active_source");
  assert.equal(formal.finalIndexName, formal.droppedIndexName);
  assert.doesNotMatch(FAILURE_INDEX_CONTRACT_V11.createSql, /\bsource_domain\b|\baction\b/u);
});

test("predicate parser is statement-bounded and rejects trailing or contaminating states", () => {
  const parsed = parseActivePredicateV11(formal.predicate);
  assert.deepEqual(parsed.decisionStates, formal.decisionStates);
  assert.deepEqual(parsed.executionStates, formal.executionStates);
  assert.throws(() => parseActivePredicateV11(`${formal.predicate} OR execution_status IN ('executed')`),
    /predicate-(?:grammar|trailing-token)/u);
  const contaminated = migration.replace("'infra_exhausted'\n      )\n    )\n  );\n\nDROP INDEX",
    "'infra_exhausted', 'executed'\n      )\n    )\n  );\n\nDROP INDEX");
  assert.throws(() => parseFormalApprovalActiveIndexContractV11(contaminated), /index-structure-drift/u);
});

test("all four boundary markers remain reachable through the canonical rendered SQL", () => {
  assert.deepEqual(FAILURE_INJECTION_CASES_V11.map(({ boundary }) => boundary),
    ["before-create", "after-create", "after-drop", "before-rename"]);
  for (const [index, entry] of FAILURE_INJECTION_CASES_V11.entries()) {
    const sql = renderFailureBoundarySqlV11(entry);
    assert.match(sql, new RegExp(`RAISE EXCEPTION '${entry.marker}' USING ERRCODE='P0001'`));
    assert.equal((sql.match(new RegExp(entry.marker, "gu")) ?? []).length, 1);
    assert.doesNotMatch(sql, /\bsource_domain\b|\baction\b/u);
    if (index === 0) assert.doesNotMatch(sql, /CREATE\s+UNIQUE\s+INDEX/iu);
    else assert.deepEqual(parseCreateIndexSqlV11(sql).columns, columns);
  }
});

test("structural equivalence rejects column order, predicate and index target drift", () => {
  for (const drift of [
    formal.createSql.replace("action_id, source_type", "source_type, action_id"),
    formal.createSql.replace("'infra_exhausted'", "'executed'"),
    formal.createSql.replace("public.biz_property_approval_request", "public.other_request"),
    formal.createSql.replace(formal.buildIndexName, `${formal.buildIndexName}_wrong`),
  ]) assert.throws(() => assertEquivalentCreateIndexV11(formal, drift), /fixture-.+-drift/u);
});
