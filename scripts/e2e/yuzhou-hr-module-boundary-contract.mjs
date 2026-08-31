import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HrModuleBoundaryError, verifyHrModuleBoundary } from "../hr-cutover/verify-hr-module-boundary.mjs";

const root = resolve(import.meta.dirname, "../..");
const path = resolve(root, "scripts/hr-cutover/contracts/hr-module-boundary-v1.json");
const contract = JSON.parse(readFileSync(path, "utf8"));
const clone = () => structuredClone(contract);
const rejects = (mutate, code) => assert.throws(() => {
  const candidate = clone();
  mutate(candidate);
  verifyHrModuleBoundary(candidate);
}, error => error instanceof HrModuleBoundaryError && error.code === code);

const result = verifyHrModuleBoundary(contract);
assert.equal(result.ok, true);
assert.equal(result.storageModel, "hr_table_namespace");
assert.equal(result.sharedLedgerSelection, "source_system_and_batch_owned_only");
assert.equal(result.productionImport, "HOLD");
assert.match(result.sha256, /^[0-9a-f]{64}$/u);

rejects(value => { value.storageModel.physical = "dedicated_database"; }, "HR_MODULE_BOUNDARY_STORAGE_MODEL_INVALID");
rejects(value => { value.sharedMigrationLedger.selection = "all_rows"; }, "HR_MODULE_BOUNDARY_SHARED_LEDGER_INVALID");
rejects(value => { value.portabilityRules.copyPlatformTables = true; }, "HR_MODULE_BOUNDARY_PORTABILITY_RULES_INVALID");
rejects(value => { value.portabilityRules.attachmentPayloadsRequireSeparateT5FileSlice = false; }, "HR_MODULE_BOUNDARY_PORTABILITY_RULES_INVALID");
rejects(value => { value.productionImport = "GO"; }, "HR_MODULE_BOUNDARY_PRODUCTION_IMPORT_REACHABLE");

console.log("Yuzhou HR module portability boundary contract passed.");
