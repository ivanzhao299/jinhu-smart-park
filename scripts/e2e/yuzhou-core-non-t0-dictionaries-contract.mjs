#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = readFileSync(resolve(import.meta.dirname, "../hr-cutover/materialize-core-non-t0-dictionaries.mjs"), "utf8");
const eventTypes = JSON.parse(readFileSync(resolve(import.meta.dirname, "../hr-cutover/contracts/yuzhou-t1-employment-event-type-decision-v1.json"), "utf8"));
for (const code of ["employment_event_type", "employment_event_state", "contract_type", "contract_state"]) assert.match(script, new RegExp(code));
assert.match(script, /machine_attested/);
assert.match(script, /SOURCE_NON_EFFECTIVE_STATE/);
assert.match(script, /verifyT1EventTypeDecision/);
assert.match(script, /decision\.decisions/);
assert.deepEqual(eventTypes.decisions.map(({ sourceValue, targetValue }) => [sourceValue, targetValue]), [["就职", "start_probation"], ["调职", "transfer"], ["离职", "depart"], ["复职", "resume"]]);
assert.match(script, /current_database\(\) !~ '\^jinhu_hr_migration_lab_\(core\|full\)/);
assert.doesNotMatch(script, /password|idcard|bank_account/i);
console.log("Yuzhou core non-T0 dictionary contract passed.");
