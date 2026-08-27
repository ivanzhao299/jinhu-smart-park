#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(
  resolve(root, "database/migrations/000264_hr_payroll_legacy_item_bulk_guard.sql"),
  "utf8",
);

assert.match(migration, /AFTER INSERT ON hr_payroll_legacy_snapshot_item/);
assert.match(migration, /REFERENCING NEW TABLE AS inserted_snapshot_items/);
assert.match(migration, /SELECT DISTINCT tenant_id,park_id,snapshot_id/);
assert.match(migration, /snapshot\.id IS NULL[\s\S]*batch\.id IS NULL[\s\S]*batch\.status='published'/);
assert.match(migration, /Published or unknown legacy payroll batch rejects new facts/);
assert.match(migration, /BEFORE UPDATE OR DELETE ON hr_payroll_legacy_snapshot_item/);
assert.match(migration, /CREATE TRIGGER trg_hr_payroll_legacy_snapshot_item_guard/);
assert.match(migration, /Legacy payroll facts are append-only/);
assert.match(migration, /Legacy payroll fact deletion requires the dedicated rollback procedure/);
assert.doesNotMatch(migration, /DISABLE TRIGGER|session_replication_role|ALTER TABLE[\s\S]*DROP CONSTRAINT/i);

console.log("Yuzhou T4 bulk immutable guard contract passed.");
