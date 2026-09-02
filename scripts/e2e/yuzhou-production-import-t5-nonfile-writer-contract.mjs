import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { ProductionImportT5NonfileWriterError, writeT5NonfilePrivateStage } from "../hr-cutover/production-import-t5-nonfile-writer.mjs";

const h = value => createHash("sha256").update(value).digest("hex");
const employee = h("employee");
const source = h("skill-source");
const privateStage = {
  formatVersion: 1, artifactKind: "yuzhou_hr_production_import_t5_nonfile_private_payload_stage", phase: "T5",
  triple: { codeSha: "1".repeat(40), sourceSnapshotHash: h("source"), mappingContractHash: h("mapping") },
  sourceSnapshotHash: h("source"), sourceRestoreReceiptSha256: h("restore"), sourceBusinessSha256: h("business"), productionImport: "HOLD",
  records: [{ sourceSystem: "yuzhou-v10", sourceTable: "dbo.knowhow", sourcePkCanonical: `sha256:${source}`, sourceIdentitySha256: source, sourceRowSha256: h("row"), targetTable: "hr_employee_skill", dependencyMode: "employee", dependencyRefs: [{ role: "employee", phase: "T0", expectedTargetTable: "hr_employee", sourceIdentitySha256: employee }], disposition: "insert", payload: { skill_name: "synthetic", proficiency: null, legacy_grade: null, note: null, legacy_source_identity_sha256: source, legacy_source_row_sha256: h("row") } }],
};
const input = tx => ({ tx, operationId: "yzprod-import-20260902T120000Z-abcdef123456", targetScope: { tenantId: "tenant-a", parkId: "park-a", scopeSha256: h("scope") }, actorId: "11111111-1111-4111-8111-111111111111", privateStage });

test("T5 writer uses the existing T0 source map, audited inserts, and record maps inside its injected transaction", async () => {
  const queries = [];
  const tx = { async query(sql, parameters) {
    queries.push({ sql, parameters });
    if (sql.includes("resolve-employees")) return { rows: [{ source_identity_sha256: employee, employee_id: "22222222-2222-4222-8222-222222222222" }] };
    if (sql.includes("create-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    if (sql.includes("insert:hr_employee_skill")) return { rows: [{ id: "44444444-4444-4444-8444-444444444444", legacy_source_identity_sha256: source }] };
    if (sql.includes("insert-maps")) return { rows: [{ source_identity_sha256: source }] };
    if (sql.includes("finish-batch")) return { rows: [{ id: "33333333-3333-4333-8333-333333333333" }] };
    throw new Error("unexpected SQL");
  } };
  const result = await writeT5NonfilePrivateStage(input(tx));
  assert.deepEqual(result.counts, { source: 1, loaded: 1, quarantined: 0 });
  assert.equal(result.records[0].targetTable, "hr_employee_skill");
  assert.ok(queries.some(query => query.sql.includes("production_import_phase='T0'")));
  assert.ok(queries.some(query => query.sql.includes("current_phase='T5'")));
  assert.ok(queries.some(query => query.sql.includes("'prod-import-v2@'||code_sha")));
  assert.ok(queries.some(query => query.sql.includes("create_by,update_by")));
  assert.ok(queries.some(query => query.sql.includes("legacy_record_map")));
});

test("T5 writer rejects a payload that does not exactly match the table allowlist before issuing SQL", async () => {
  const tx = { async query() { throw new Error("query must not run"); } };
  const malformed = structuredClone(privateStage);
  malformed.records[0].payload.unreviewed = "no";
  await assert.rejects(() => writeT5NonfilePrivateStage({ ...input(tx), privateStage: malformed }), ProductionImportT5NonfileWriterError);
});
