#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = readFileSync(resolve(import.meta.dirname, "../hr-cutover/materialize-core-non-t0-dictionaries.mjs"), "utf8");
for (const code of ["employment_event_type", "employment_event_state", "contract_type", "contract_state"]) assert.match(script, new RegExp(code));
assert.match(script, /machine_attested/);
assert.match(script, /SOURCE_NON_EFFECTIVE_STATE/);
for (const mapping of ["调职", "复职", "就职", "离职"]) assert.match(script, new RegExp(mapping));
assert.match(script, /\["就职", \{ decision: "raw_only", target: null, reason: "EMPLOYMENT_START_SEMANTICS_UNRESOLVED" \}\]/);
assert.doesNotMatch(script, /\["就职", "start_probation"\]/);
assert.match(script, /current_database\(\) !~ '\^jinhu_hr_migration_lab_core_/);
assert.doesNotMatch(script, /password|idcard|bank_account/i);
console.log("Yuzhou core non-T0 dictionary contract passed.");
