#!/usr/bin/env node
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";

const root=resolve(import.meta.dirname,"../.."),read=path=>readFileSync(resolve(root,path),"utf8");
const migration=read("database/migrations/000275_hr_legacy_dictionary_decision.sql");
const t0=read("scripts/load-yuzhou-t0.sh"),t1=read("scripts/load-yuzhou-t1-employment-events.sh"),t2=read("scripts/load-yuzhou-t2-contracts.sh");

assert.match(migration,/status = 'approved'/);
assert.match(migration,/source_snapshot_sha256/);
assert.match(migration,/decision_items_sha256/);
assert.match(migration,/HR_LEGACY_DICTIONARY_ITEMS_SHA_MISMATCH/);
assert.match(migration,/trg_hr_legacy_dictionary_item_touch_version/);
assert.match(migration,/matched_count <> 1/);
assert.match(migration,/HR_LEGACY_DICTIONARY_UNRESOLVED/);
assert.match(migration,/uq_hr_legacy_dictionary_item_source_(code|name|value)/);
assert.doesNotMatch(migration,/INSERT INTO (hr_employee|hr_employment_event|hr_contract)\b/);

assert.match(t0,/EMPLOYEE_JOB_STATE_UNRESOLVED/);
assert.match(t0,/approved employee job-state dictionary SHA-256 is required/);
assert.doesNotMatch(t0,/WHEN '1' THEN 'active'|ELSE 'departed'|legacyStatus'='A'.*contractor/);

assert.match(t1,/EMPLOYMENT_EVENT_TYPE_UNRESOLVED/);
assert.match(t1,/EMPLOYMENT_EVENT_STATE_UNRESOLVED/);
assert.doesNotMatch(t1,/legacy_unknown|normalizedEventType|legacyState'<>'1'/);

assert.match(t2,/hr_resolve_legacy_dictionary/);
assert.match(t2,/approved contract dictionary SHA-256 is required/);
assert.doesNotMatch(t2,/normalizedStatus|legacyState===|THEN\s*'active'[\s\S]*THEN\s*'terminated'/);

console.log("Yuzhou dictionary materialization contract passed.");
