import assert from "node:assert/strict";
import { test } from "node:test";
import { CENSUS_TABLES, censusTableHash } from "../hr-cutover/production-import-id-census.mjs";
import { DEFAULT_PRODUCTION_IMPORT_EXECUTION_CONTRACT as CONTRACT } from "../hr-cutover/production-import-sealed-plan-lib.mjs";
import { assignedScopeIdCensusSql, validateAssignedScopeIdCensus } from "../hr-cutover/production-import-assigned-scope-id-census.mjs";
const now = new Date("2026-10-01T15:00:00Z"), target = CONTRACT.activation.allowedTargets[0];
function fixture() {
  return { formatVersion: 1, kind: "yuzhou_global_id_census_v1", targetIdentitySha256: target.identitySha256,
    targetScopeSha256: target.targetScopeSha256, observedAt: now.toISOString(), expiresAt: new Date(+now + 3600000).toISOString(),
    tables: Object.fromEntries(CENSUS_TABLES.map(name => [name, { count: 0, hashes: [], sha256: censusTableHash(name, []) }])),
    scopeCounts: { assigned: 3, valid: 3 }, selection: { scopeSha256: target.targetScopeSha256, assigned: 1, valid: 1 },
    complete: true, productionImport: "HOLD" };
}
test("three global assignments remain three while exactly one authorized scope is selected", () => {
  const c = fixture(); assert.equal(validateAssignedScopeIdCensus(c, now), c);
  assert.deepEqual(c.scopeCounts, { assigned: 3, valid: 3 });
});
test("wrong scope, ambiguous selection, stale observations and incomplete global sets fail", () => {
  for (const change of [c => { c.selection.assigned = 2; }, c => { c.selection.valid = 0; },
    c => { c.selection.scopeSha256 = "0".repeat(64); }, c => { c.targetIdentitySha256 = "0".repeat(64); },
    c => { c.expiresAt = now.toISOString(); }, c => { delete c.tables[CENSUS_TABLES[0]]; },
    c => { c.tables[CENSUS_TABLES[0]].hashes.push("0".repeat(64)); }]) {
    const c = fixture(); change(c); assert.throws(() => validateAssignedScopeIdCensus(c, now));
  }
});
test("fixed read-only SQL selects the allowlisted scope and leaves every target ID scan global", () => {
  const sql = assignedScopeIdCensusSql();
  assert.match(sql, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/u);
  assert.match(sql, /relrowsecurity OR r\.relforcerowsecurity/u);
  assert.ok(sql.includes(target.targetScopeSha256));
  assert.ok(!sql.includes("FROM scopes WHERE (SELECT count(*) FROM scopes)=1;"));
  for (const name of CENSUS_TABLES) assert.ok(sql.includes(`h FROM public.${name}) ids`));
  assert.ok(!/\b(?:INSERT INTO|UPDATE public|DELETE FROM|ALTER TABLE)\b/u.test(sql));
  assert.match(sql, /'scopeCounts',jsonb_build_object\('assigned',\(SELECT count\(\*\) FROM scopes\)/u);
});
