import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const sql = readFileSync(
  resolve(root, "database/migrations/000304_hr_performance_yuzhou_legacy_master_parity.sql"),
  "utf8",
);

assert.match(sql, /CREATE OR REPLACE FUNCTION hr_performance_yuzhou_legacy_grade_parity/);
assert.match(sql, /level\.source_min_value<=master\.replayed_total/);
assert.match(sql, /max\(level\.source_min_value\) OVER \(\)/);
assert.doesNotMatch(sql, /source_assessment_id\s*=/);
assert.doesNotMatch(sql, /source_max_value\s*[<>=]/);
assert.match(sql, /AMBIGUOUS_TOP_THRESHOLD/);
assert.match(sql, /TOTAL_UNAVAILABLE/);
assert.match(sql, /NO_ELIGIBLE_GRADE/);
assert.match(sql, /WHEN choice\.sole_grade IS NOT DISTINCT FROM master\.source_ass_grade/);
assert.match(sql, /master\.replayed_total IS NOT DISTINCT FROM master\.source_total_value THEN 'MATCH'/);
assert.match(sql, /REVOKE ALL ON FUNCTION hr_performance_yuzhou_legacy_grade_parity\(uuid\) FROM PUBLIC/);

console.log("Yuzhou performance master parity contract passed (legacy threshold semantics and ambiguity are explicit).");
