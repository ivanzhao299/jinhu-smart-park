#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const script = readFileSync(resolve(import.meta.dirname, "../rollback-yuzhou-t0.sh"), "utf8");
assert.match(script, /ALLOW_YUZHOU_ROLLBACK/);
assert.match(script, /status='succeeded'.*FOR UPDATE/);
assert.match(script, /rollback source accounting drift/);
assert.match(script, /EMPLOYEE_DATE_ORDER/);
assert.match(script, /EMPLOYEE_JOB_STATE_UNRESOLVED/);
assert.match(script, /expected_employees \+ rejected_employees<>2949/);
assert.doesNotMatch(script, /expected_employees<>2938|deletedEmployees',2938/);
assert.match(script, /DELETE FROM hr_employee[\s\S]*DELETE FROM hr_position[\s\S]*DELETE FROM sys_org/);
assert.match(script, /mapping_status='rolled_back',is_active=false/);
assert.match(script, /status='rolled_back'/);
assert.doesNotMatch(script, /TRUNCATE|DROP DATABASE|DELETE FROM hr_employee;/i);
console.log("Yuzhou T0 rollback contract passed.");
