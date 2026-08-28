import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync("scripts/audit-access-only-users.sh", "utf8");
const sql = source.slice(source.indexOf("WITH explicit_access AS"), source.lastIndexOf("SQL"));

test("requires an explicit tenant and keeps the optional park parameterized", () => {
  assert.match(source, /if \[ -z "\$TENANT_ID" \]/);
  assert.match(source, /-v tenant_id="\$TENANT_ID"/);
  assert.match(source, /-v park_id="\$PARK_ID"/);
  assert.match(sql, /scope\.park_id = :'park_id'/);
});

test("the audit query is read-only and emits no personal contact or authorization details", () => {
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|TRUNCATE|CALL)\b/i);
  assert.doesNotMatch(sql, /\b(?:mobile|email|password|token|permission|data_scope)\b/i);
  assert.match(sql, /scope\.user_id/);
  assert.match(source, /No database writes were executed/);
});

test("matches runtime access and effective-role boundaries", () => {
  assert.match(sql, /access_link\.status = 'enabled'/);
  assert.match(sql, /role_link\.is_deleted = false/);
  assert.match(sql, /role\.is_enabled = true/);
  assert.match(sql, /role\.status = 'enabled'/);
  assert.match(sql, /role\.role_scope = 'tenant'/);
  assert.match(sql, /role\.code = 'SUPER_ADMIN'/);
  assert.match(sql, /role\.role_scope = 'platform'/);
  assert.match(sql, /role\.is_super = true/);
  assert.match(sql, /role\.is_system = true/);
  assert.match(sql, /role\.is_builtin = true/);
  assert.match(sql, /legacy_home_without_access_row/);
});
