import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyT5FullArchiveOwners, T5_CORE_OWNER_SQL, validateT5CoreOwnerRows } from "../hr-cutover/t5-followon-core-owners.mjs";
const owner = { employee_code: "001", employee_id: "10000000-0000-4000-8000-000000000001",
  record_map_id: "20000000-0000-4000-8000-000000000001", source_identity_sha256: "a".repeat(64),
  source_row_sha256: "b".repeat(64), source_pk_canonical: `sha256:${"a".repeat(64)}`, valid: true };
const row = (id, employeeCode) => ({ sourceTable: "dbo.family", sourceIdentitySha256: id.repeat(64),
  sourceRowSha256: "e".repeat(64), employeeCode, source: { untouched: true } });
test("ownership accepts SHA-keyed core map and preserves unresolved history without code coercion", () => {
  const map = validateT5CoreOwnerRows([owner], 1);
  const input = [row("1", "001"), row("2", " 001"), row("3", "retired"), row("4", null)];
  const result = classifyT5FullArchiveOwners(input, map);
  assert.deepEqual(result.counts, { source: 4, mapped: 1, unmapped: 2, notApplicable: 1 });
  assert.equal(result.classified[0].owner.employee_id, owner.employee_id);
  for (let i = 0; i < input.length; i += 1) assert.equal(result.classified[i].record, input[i]);
  assert.equal(result.classified[1].owner, null);
});
test("invalid and ambiguous persisted ownership fails before any projection", () => {
  for (const changed of [{ valid: false }, { source_pk_canonical: "person=001" }, { record_map_id: null },
    { source_identity_sha256: "invalid" }, { employee_id: null }])
    assert.throws(() => validateT5CoreOwnerRows([{ ...owner, ...changed }], 1), /T5_CORE_OWNER_MAP_DRIFT/u);
  assert.throws(() => validateT5CoreOwnerRows([owner], 2), /T5_CORE_OWNER_COUNT_DRIFT/u);
  assert.throws(() => validateT5CoreOwnerRows([owner, { ...owner }], 2), /T5_CORE_OWNER_MAP_DRIFT/u);
  assert.throws(() => classifyT5FullArchiveOwners([row("1", "001"), row("1", "001")], new Map()), /DUPLICATE/u);
});
test("database lookup binds receipt and active map to the succeeded parent's exact T0 identities", () => {
  for (const required of ["p.operation_id=r.operation_id", "p.phase=r.phase", "m.batch_id=p.migration_batch_id",
    "m.source_identity_sha256=r.source_identity_sha256", "m.source_row_sha256=r.source_row_sha256",
    "m.target_id=r.target_id", "m.is_active", "NOT e.is_deleted", "e.tenant_id=$2", "e.park_id=$3"])
    assert.ok(T5_CORE_OWNER_SQL.includes(required), required);
  assert.equal(T5_CORE_OWNER_SQL.includes("employment_status"), false);
  assert.equal(T5_CORE_OWNER_SQL.includes("full_name"), false);
});
