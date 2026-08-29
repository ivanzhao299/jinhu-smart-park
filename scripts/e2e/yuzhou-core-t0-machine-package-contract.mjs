#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const script = readFileSync(resolve(import.meta.dirname, "../hr-cutover/build-core-t0-machine-package.mjs"), "utf8");
assert.match(script, /buildItemsDigestProbeSql/);
assert.match(script, /compileYuzhouJobStateMachineAttestation/);
assert.match(script, /employee-job-states\.raw\.json/);
assert.match(script, /sourceDistinctStateCount: 7/);
assert.match(script, /sourceRecordCount: 2949/);
assert.match(script, /employeeJobStatesSha256: t0Binding\.employeeJobStatesSha256/);
assert.doesNotMatch(script, /dictionaryEvidenceSha256 = canonicalHash\(\{ \.\.\.t0Binding/);
assert.match(script, /productionImport: "HOLD"/);
assert.doesNotMatch(script, /password|idcard|bank_account/i);
console.log("Yuzhou core T0 machine package contract passed.");
