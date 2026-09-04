import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ProductionImportT5NonfileWriterError, writeT5NonfilePrivateStage } from "../hr-cutover/production-import-t5-nonfile-writer.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const canonicalJson = value => {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
};
const logicClassifications = Object.freeze({
  description_d: "presentation_expression", sqltext: "legacy_sql_expression", flag: "legacy_behavior_flag",
  crosssql: "legacy_cross_lookup_sql", crosscolselectsql: "legacy_cross_column_sql", crossrowselectsql: "legacy_cross_row_sql",
  crosswhere: "legacy_cross_filter", querywhere: "legacy_query_filter", ascount: "legacy_aggregate_flag", ascount2: "legacy_secondary_aggregate_flag",
});
const employee = h("employee");
const source = h("skill-source");
const privateStage = {
  formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_payload_stage", phase: "T5",
  triple: { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") },
  sourceSnapshotHash: h("source"), sourceRestoreReceiptSha256: h("restore"), sourceBusinessSha256: h("business"), mappingContractSha256: h("mapping"), t0DecisionArtifactSha256: h("t0-decisions"), t0TargetIdentitySha256: h("target"), t0TargetScopeSha256: h("scope"), productionImport: "HOLD",
  records: [{ sourceSystem: "yuzhou-v10", sourceTable: "dbo.knowhow", sourcePkCanonical: `sha256:${source}`, sourceIdentitySha256: source, sourceRowSha256: h("row"), targetTable: "hr_employee_skill", dependencyMode: "employee", dependencyRefs: [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employee }], disposition: "insert", payload: { skill_name: "synthetic", proficiency: null, legacy_grade: null, note: null, legacy_source_identity_sha256: source, legacy_source_row_sha256: h("row") } }],
};
const input = tx => ({ tx, operationId: "yzprod-import-20260902T120000Z-abcdef123456", targetIdentitySha256: h("target"), targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") }, actorId: "11111111-1111-4111-8111-111111111111", privateStage });

test("T5 writer uses the existing T0 source map, audited inserts, and record maps inside its injected transaction", async () => {
  const queries = [];
  const tx = { async query(sql, parameters) {
    queries.push({ sql, parameters });
    if (sql.includes("assert-writer-context")) return { rows: [{ authorized: true }] };
    if (sql.includes("resolve-employees")) return { rows: [{ source_identity_sha256: employee, employee_id: "22222222-2222-4222-8222-222222222222" }] };
    if (sql.includes("create-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    if (sql.includes("insert:hr_employee_skill")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444", legacy_source_identity_sha256: source }] };
    if (sql.includes("insert-maps")) return { rows: [{ source_identity_sha256: source }] };
    if (sql.includes("readback-projection")) return { rows: [{ source_identity_sha256: source, source_row_sha256: h("row"), target_table: "hr_employee_skill", target_id: "44444444-4444-4444-8444-444444444444", mapping_status: "loaded", target_tenant_id: "tenant-a", target_park_id: "park-a", target_source_identity_sha256: source, target_source_row_sha256: h("row") }] };
    if (sql.includes("finish-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    throw new Error("unexpected SQL");
  } };
  const result = await writeT5NonfilePrivateStage(input(tx));
  assert.deepEqual(result.counts, { source: 1, loaded: 1, quarantined: 0 });
  assert.equal(result.records[0].targetTable, "hr_employee_skill");
  assert.ok(queries.some(query => query.sql.includes("production_import_phase='T0'")));
  assert.ok(queries.some(query => query.sql.includes("current_phase='T5'")));
  assert.ok(queries.some(query => query.sql.includes("'prod-import-v2@'||code_sha")));
  assert.ok(queries.some(query => query.sql.includes("production_import_actor_id")));
  assert.ok(queries.some(query => query.sql.includes("create_by,update_by")));
  assert.ok(queries.some(query => query.sql.includes("legacy_record_map")));
  assert.ok(queries.some(query => query.sql.includes("hr_yuzhou_production_import_projection_receipt")));
  assert.match(result.afterCanonicalSha256, /^[0-9a-f]{64}$/u);
  assert.equal(result.records[0].targetVersionAfter, 1);
  assert.match(result.readbackSha256, /^[0-9a-f]{64}$/u);
  const context = queries.find(query => query.sql.includes("assert-writer-context"));
  assert.deepEqual(context.parameters.slice(0, 6), [input(tx).operationId, h("target"), "tenant-a", "park-a", h("scope"), input(tx).actorId]);
  const readback = queries.find(query => query.sql.includes("readback-projection"));
  assert.doesNotMatch(readback.sql, /full_name|personal_mobile|text_value|numeric_value|payroll|salary/iu);
});

test("T5 writer rejects a payload that does not exactly match the table allowlist before issuing SQL", async () => {
  const tx = { async query() { throw new Error("query must not run"); } };
  const malformed = structuredClone(privateStage);
  malformed.records[0].payload.unreviewed = "no";
  await assert.rejects(() => writeT5NonfilePrivateStage({ ...input(tx), privateStage: malformed }), ProductionImportT5NonfileWriterError);
});

test("T5 writer inserts custom definitions before typed employee values and maps every expanded record", async () => {
  const definitionSource = h("definition-source");
  const valueSource = h("value-source");
  const stage = structuredClone(privateStage);
  const definitionPayload = { field_code: "def1", display_label: "synthetic", value_type: "text", field_group: "profile", sort_order: 0, sensitivity: "restricted", origin: "legacy", source_system: "yuzhou-v10", source_table: "dbo.defs", source_column: "def1", source_identity_sha256: definitionSource, source_row_sha256: h("definition-row"), status: "enabled", legacy_definition_id: "legacy-def-1", legacy_datatype: "varchar", legacy_group_id: null, legacy_sort_order: 0, legacy_nullable: null, legacy_description_d_present: false, legacy_description_d_sha256: null, legacy_sqltext_present: true, legacy_sqltext_sha256: h("sqltext"), legacy_crosssql_present: false, legacy_crosssql_sha256: null, base_classification: "text", legacy_rule_classification: "review_required" };
  const logicRecords = Object.entries(logicClassifications).map(([legacyColumn, classification]) => {
    const payload = { legacy_column: legacyColumn, classification, execution: "forbidden", source_present: legacyColumn === "sqltext", is_source_null: legacyColumn !== "sqltext", source_value_sha256: legacyColumn === "sqltext" ? h("sqltext") : null };
    const sourceIdentitySha256 = h(`yuzhou-hr-production-t5-custom-definition-logic-v1\0${definitionSource}\0${legacyColumn}`);
    return { sourceSystem: "yuzhou-v10", sourceTable: "dbo.defs", sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceIdentitySha256, sourceRowSha256: h(canonicalJson({ definitionSourceRowSha256: h("definition-row"), ...payload })), targetTable: "hr_custom_field_legacy_logic_fingerprint", dependencyMode: "custom_field_definition", dependencyRefs: [{ role: "custom_field_definition", phase: "T5", expectedTargetTable: "hr_custom_field_definition", sourceIdentitySha256: definitionSource }], disposition: "insert", payload };
  });
  stage.records = [
    {
      sourceSystem: "yuzhou-v10", sourceTable: "dbo.defs", sourcePkCanonical: `sha256:${definitionSource}`, sourceIdentitySha256: definitionSource, sourceRowSha256: h("definition-row"), targetTable: "hr_custom_field_definition", dependencyMode: "none", dependencyRefs: [], disposition: "insert", payload: definitionPayload,
    },
    ...logicRecords,
    {
      sourceSystem: "yuzhou-v10", sourceTable: "dbo.person", sourcePkCanonical: `sha256:${valueSource}`, sourceIdentitySha256: valueSource, sourceRowSha256: h("value-row"), targetTable: "hr_employee_custom_value", dependencyMode: "employee_custom_field", dependencyRefs: [{ role: "custom_field_definition", phase: "T5", expectedTargetTable: "hr_custom_field_definition", sourceIdentitySha256: definitionSource }, { role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employee }], disposition: "insert",
      payload: { text_value: "synthetic", numeric_value: null, date_value: null, boolean_value: null, is_source_null: false, value_status: "valid", origin: "legacy", source_system: "yuzhou-v10", source_table: "dbo.person", source_column: "def1", source_identity_sha256: valueSource, source_row_sha256: h("value-row") },
    },
  ];
  const queries = [];
  const logicTargets = new Map();
  const tx = { async query(sql, parameters) {
    queries.push({ sql, parameters });
    if (sql.includes("assert-writer-context")) return { rows: [{ authorized: true }] };
    if (sql.includes("resolve-employees")) return { rows: [{ source_identity_sha256: employee, employee_id: "22222222-2222-4222-8222-222222222222" }] };
    if (sql.includes("create-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    if (sql.includes("insert:hr_custom_field_definition")) return { rows: [{ id: "55555555-5555-4555-8555-555555555555", source_identity_sha256: definitionSource }] };
    if (sql.includes("insert:hr_custom_field_legacy_logic_fingerprint")) {
      const prepared = JSON.parse(parameters[2]);
      for (const row of prepared) logicTargets.set(row.source_identity_sha256, row.id);
      return { rows: prepared.map(row => ({ id: row.id })) };
    }
    if (sql.includes("insert:hr_employee_custom_value")) return { rows: [{ id: "66666666-6666-4666-8666-666666666666", source_identity_sha256: valueSource }] };
    if (sql.includes("insert-maps")) return { rows: JSON.parse(parameters[1]).map(row => ({ source_identity_sha256: row.source_identity_sha256 })) };
    if (sql.includes("readback-projection")) return { rows: [
      { source_identity_sha256: definitionSource, source_row_sha256: h("definition-row"), target_table: "hr_custom_field_definition", target_id: "55555555-5555-4555-8555-555555555555", mapping_status: "loaded", target_tenant_id: "tenant-a", target_park_id: "park-a", target_source_identity_sha256: definitionSource, target_source_row_sha256: h("definition-row") },
      ...logicRecords.map(record => ({ source_identity_sha256: record.sourceIdentitySha256, source_row_sha256: record.sourceRowSha256, target_table: record.targetTable, target_id: logicTargets.get(record.sourceIdentitySha256), mapping_status: "loaded", target_tenant_id: "tenant-a", target_park_id: "park-a", target_source_identity_sha256: null, target_source_row_sha256: null, target_safe_payload: record.payload })),
      { source_identity_sha256: valueSource, source_row_sha256: h("value-row"), target_table: "hr_employee_custom_value", target_id: "66666666-6666-4666-8666-666666666666", mapping_status: "loaded", target_tenant_id: "tenant-a", target_park_id: "park-a", target_source_identity_sha256: valueSource, target_source_row_sha256: h("value-row") },
    ] };
    if (sql.includes("finish-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    throw new Error("unexpected SQL");
  } };
  const result = await writeT5NonfilePrivateStage({ ...input(tx), privateStage: stage });
  assert.deepEqual(result.counts, { source: 12, loaded: 12, quarantined: 0 });
  assert.equal(result.records.filter(value => value.targetTable === "hr_custom_field_legacy_logic_fingerprint").length, 10);
  const definitionQuery = queries.findIndex(query => query.sql.includes("insert:hr_custom_field_definition"));
  const logicQuery = queries.findIndex(query => query.sql.includes("insert:hr_custom_field_legacy_logic_fingerprint"));
  const valueQuery = queries.findIndex(query => query.sql.includes("insert:hr_employee_custom_value"));
  assert.ok(definitionQuery >= 0 && logicQuery > definitionQuery && valueQuery > logicQuery);
  assert.match(queries[definitionQuery].sql, /migration_batch_id/);
  assert.match(queries[definitionQuery].sql, /legacy_datatype/);
  assert.match(queries[definitionQuery].sql, /base_classification/);
  assert.doesNotMatch(queries[definitionQuery].sql, /payload->>'(?:description_d|sqltext|crosssql)'/u);
  assert.match(queries[logicQuery].sql, /definition_id/);
  assert.match(queries[valueQuery].sql, /definition_id/);
  assert.equal(queries.filter(query => query.sql.includes("insert-maps")).length, 1);

  const invalidValueStage = structuredClone(stage);
  const invalidValue = invalidValueStage.records.find(record => record.targetTable === "hr_employee_custom_value");
  invalidValue.payload.value_status = "invalid";
  invalidValue.payload.text_value = "must-never-enter-the-production-payload";
  const failClosedTx = { async query() { throw new Error("query must not run"); } };
  await assert.rejects(
    () => writeT5NonfilePrivateStage({ ...input(failClosedTx), privateStage: invalidValueStage }),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID",
  );
});

test("T5 writer refuses a custom value whose definition is absent from the same sealed stage", async () => {
  const valueSource = h("orphan-value-source");
  const stage = structuredClone(privateStage);
  stage.records = [{
    sourceSystem: "yuzhou-v10", sourceTable: "dbo.person", sourcePkCanonical: `sha256:${valueSource}`, sourceIdentitySha256: valueSource, sourceRowSha256: h("value-row"), targetTable: "hr_employee_custom_value", dependencyMode: "employee_custom_field", dependencyRefs: [{ role: "custom_field_definition", phase: "T5", expectedTargetTable: "hr_custom_field_definition", sourceIdentitySha256: h("missing-definition") }, { role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employee }], disposition: "insert",
    payload: { text_value: null, numeric_value: null, date_value: null, boolean_value: null, is_source_null: true, value_status: "null", origin: "legacy", source_system: "yuzhou-v10", source_table: "dbo.person", source_column: "def1", source_identity_sha256: valueSource, source_row_sha256: h("value-row") },
  }];
  const tx = { async query() { throw new Error("query must not run"); } };
  await assert.rejects(() => writeT5NonfilePrivateStage({ ...input(tx), privateStage: stage }), ProductionImportT5NonfileWriterError);
});

test("T5 writer rejects target identity drift before touching the database", async () => {
  const tx = { async query() { throw new Error("query must not run"); } };
  await assert.rejects(
    () => writeT5NonfilePrivateStage({ ...input(tx), targetIdentitySha256: h("other-target") }),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_WRITER_INPUT_INVALID",
  );
});

test("T5 writer fails closed when the database does not bind the exact target, scope, and actor", async () => {
  const calls = [];
  const tx = { async query(sql) {
    calls.push(sql);
    if (sql.includes("assert-writer-context")) return { rows: [] };
    throw new Error("write query must not run");
  } };
  await assert.rejects(
    () => writeT5NonfilePrivateStage(input(tx)),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_WRITER_CONTEXT_INVALID",
  );
  assert.equal(calls.length, 1);
});

test("T5 writer derives its after receipt from the transaction-local database readback", async () => {
  const tx = { async query(sql) {
    if (sql.includes("assert-writer-context")) return { rows: [{ authorized: true }] };
    if (sql.includes("resolve-employees")) return { rows: [{ source_identity_sha256: employee, employee_id: "22222222-2222-4222-8222-222222222222" }] };
    if (sql.includes("create-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    if (sql.includes("insert:hr_employee_skill")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444", legacy_source_identity_sha256: source }] };
    if (sql.includes("insert-maps")) return { rows: [{ source_identity_sha256: source }] };
    if (sql.includes("readback-projection")) return { rows: [] };
    throw new Error("finish must not run after a readback mismatch");
  } };
  await assert.rejects(
    () => writeT5NonfilePrivateStage(input(tx)),
    error => error.code === "PRODUCTION_IMPORT_T5_NONFILE_READBACK_MISMATCH",
  );
});
