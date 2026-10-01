/* global URL */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

test("forward position-parent fix preserves every existing dependency and quarantine guard", () => {
  const old = readFileSync(new URL("../../database/migrations/000312_hr_yuzhou_orphan_quarantine_dependencies.sql", import.meta.url), "utf8");
  assert.equal(createHash("sha256").update(old).digest("hex"), "36539ca6f992bdbb09ffba77c4f7547d8b66fcd23725e2039b17475a56a745df");
  const next = readFileSync(new URL("../../database/migrations/000318_hr_yuzhou_position_parent_dependency.sql", import.meta.url), "utf8");
  const body = sql => sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION"));
  assert.equal(body(next), body(old).replace("WHEN 'hr_position' THEN v_required := ARRAY['org:sys_org'];", "WHEN 'hr_position' THEN v_required := ARRAY['org:sys_org']; v_optional := ARRAY['parent_position:hr_position'];"));
  const contract = JSON.parse(readFileSync(new URL("../hr-cutover/contracts/production-import-execution-v2.json", import.meta.url)));
  assert.deepEqual(contract.targetTableRules.hr_position.optionalDependencies, [{ role: "parent_position", phases: ["T0"], targetTables: ["hr_position"] }]);
});
