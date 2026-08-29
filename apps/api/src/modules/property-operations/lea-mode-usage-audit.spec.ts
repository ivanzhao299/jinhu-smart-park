import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const auditSql = readFileSync(
  path.resolve(process.cwd(), "../../scripts/audit-lea-mode-usage-matrix.sql"),
  "utf8"
);

test("LEA mode and usage inventory audit is read-only and freezes approved conflict classes", () => {
  assert.doesNotMatch(
    auditSql,
    /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE|ALTER|DROP|CREATE|CALL|DO)\b/iu
  );
  assert.match(auditSql, /operating_mode='short_stay' AND usage_type NOT IN \(70\)/u);
  assert.match(auditSql, /operating_mode='long_rent' AND usage_type NOT IN \(70,10\)/u);
  assert.doesNotMatch(auditSql, /WHERE operating_status='enabled'\s+AND \(\s+\(operating_mode='short_stay'/u);
  assert.match(auditSql, /rental_status IN \(20,50,60,70\)/u);
  assert.match(auditSql, /HOUSING_COMMERCIAL_CONTRACT_CROSS/u);
  assert.match(auditSql, /contract\.status NOT IN \('90','91'\)/u);
});
