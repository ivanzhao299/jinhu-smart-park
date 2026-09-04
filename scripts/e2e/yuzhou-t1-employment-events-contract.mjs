#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = resolve(import.meta.dirname, "../..");
const migration = readFileSync(resolve(root, "database/migrations/000237_hr_employment_event_legacy_compatibility.sql"), "utf8");
const extract = readFileSync(resolve(root, "scripts/extract-yuzhou-t1-employment-events.sh"), "utf8");
const transform = readFileSync(resolve(root, "scripts/transform-yuzhou-t1-employment-events.mjs"), "utf8");
const load = readFileSync(resolve(root, "scripts/load-yuzhou-t1-employment-events.sh"), "utf8");
const rollback = readFileSync(resolve(root, "scripts/rollback-yuzhou-t1-employment-events.sh"), "utf8");
assert.match(migration, /is_historical_import/);
assert.match(migration, /uq_hr_employment_event_legacy_no/);
assert.match(extract, /source database is not read-only/);
assert.match(extract, /ORDER BY id FOR JSON PATH/);
assert.doesNotMatch(extract, /oldpay|gradepay|baseepay|jobpay|operator AS|username AS|approve AS/i);
assert.match(extract, /SELECT CONVERT\(varchar\(255\),readjusttype\) AS sourceValue,COUNT_BIG\(\*\) AS usageCount FROM dbo\.readjust GROUP BY CONVERT\(varchar\(255\),readjusttype\)/);
assert.doesNotMatch(extract, /FROM dbo\.readjustitem/);
assert.doesNotMatch(transform, /legacy_unknown|typeMap|normalizedEventType/);
assert.match(transform, /sourceValue, usageCount/);
assert.match(transform, /employment event type usage evidence is invalid/);
assert.match(extract, /employment-event-states\.raw\.json[\s\S]*GROUP BY CONVERT\(varchar\(255\),state\)/);
assert.match(transform, /copySafeJson/);
assert.match(transform, /payloadSanitization: "nul_to_literal_escape_v1"/);
assert.match(transform, /replaceAll\("\\0", "\\\\u0000"\)/);
assert.match(transform, /JSON\.stringify\(value\)\.replaceAll\("\\\\", "\\\\\\\\"\)/);
assert.match(load, /T1_EMPLOYEE_STATE_UNCHANGED/);
assert.match(load, /legacy_record_map/);
assert.match(load, /target_id,mapping_status,is_active\)\nSELECT[\s\S]*'loaded',true/);
assert.match(load, /staging SHA-256 mismatch/);
assert.match(load, /YUZHOU_T1_EVENT_TYPE_DICTIONARY_SHA256/);
assert.match(load, /YUZHOU_T1_EVENT_STATE_DICTIONARY_SHA256/);
assert.match(load, /employment event types staging SHA-256 is required/);
assert.match(load, /YUZHOU_T1_EVENT_TYPE_DECISION_FILE/);
assert.match(load, /verify-yuzhou-t1-event-type-decision\.mjs/);
assert.match(load, /employment event type decision contract or staging binding is invalid/);
assert.match(load, /employment event type decision source snapshot drift/);
assert.match(load, /type_item\.source_value/);
assert.doesNotMatch(load, /type_item\.source_name/);
assert.match(load, /EMPLOYMENT_EVENT_TYPE_UNRESOLVED/);
assert.match(load, /EMPLOYMENT_EVENT_STATE_UNRESOLVED/);
assert.doesNotMatch(load, /legacyState'<>|normalizedEventType/);
assert.match(extract, /GROUP BY CONVERT\(varchar\(255\),readjusttype\)/);
assert.doesNotMatch(extract, /SELECT readjustitem AS legacyType/);
assert.match(load, /BEGIN;[\s\S]*COMMIT;/);
assert.doesNotMatch(load, /password|bank_account|idcard/i);
assert.match(rollback, /target_table='hr_employment_event'/);
assert.match(rollback, /status='quarantined' AND loaded_count=0/);
assert.doesNotMatch(rollback, /DELETE FROM hr_employee\b/);

const stage = mkdtempSync(resolve(tmpdir(), "staging-yuzhou-t1-jsonl-"));
try {
  writeFileSync(resolve(stage, "employment-events.raw.json"), JSON.stringify([{
    legacyId: 1, legacyEventNo: "T1-1", legacyEventType: "transfer", legacyState: "accepted",
    employeeCode: "E-1", reason: "legacy\0marker",
  }]));
  writeFileSync(resolve(stage, "employment-event-types.raw.json"), JSON.stringify([{ sourceValue: "transfer", usageCount: 1 }]));
  writeFileSync(resolve(stage, "employment-event-states.raw.json"), JSON.stringify([{ sourceValue: "accepted", usageCount: 1 }]));
  const result = spawnSync(process.execPath, [resolve(root, "scripts/transform-yuzhou-t1-employment-events.mjs"), stage], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const transport = readFileSync(resolve(stage, "employment-events.jsonl"), "utf8").trim();
  const payload = JSON.parse(transport.replaceAll("\\\\", "\\"));
  assert.equal(payload.source.reason, "legacy\\u0000marker");
  assert.equal(payload.source.reason.includes("\0"), false);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log("Yuzhou T1 employment event contract passed.");
