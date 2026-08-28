#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const extract = readFileSync(resolve(root, "scripts/extract-yuzhou-t0.sh"), "utf8");
const transform = readFileSync(resolve(root, "scripts/transform-yuzhou-t0.mjs"), "utf8");
assert.match(extract, /ALLOW_YUZHOU_MIGRATION/);
assert.match(extract, /source database is not read-only/);
assert.match(extract, /sa is forbidden for extraction/);
assert.match(extract, /ORDER BY department FOR JSON PATH/);
assert.match(extract, /ORDER BY job FOR JSON PATH/);
assert.match(extract, /ORDER BY person FOR JSON PATH/);
assert.match(extract, /employee-job-states\.raw\.json[\s\S]*GROUP BY jobstate/);
assert.match(extract, /job-state-code-metadata\.raw\.json[\s\S]*INFORMATION_SCHEMA\.COLUMNS/);
assert.doesNotMatch(extract, /-h -1 -y 0/);
assert.doesNotMatch(extract, /idcard|account|password AS/i);
assert.match(extract, /extracted JSON is invalid/);
assert.doesNotMatch(extract, /managerEmployeeCode/);
assert.match(transform, /sourceIdentitySha256/);
assert.match(transform, /sourceRowSha256/);
assert.match(transform, /blank or duplicate source key/);
assert.match(transform, /extraction is not valid JSON/);
assert.match(transform, /employeeJobStates/);
console.log("Yuzhou T0 extract contract passed.");
