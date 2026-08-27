import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyGroupWebSourceAuditContractError, LEGACY_GROUP_WEB_SOURCE_EXPECTED_SUMS, verifyLegacyGroupWebSourceAudit } from "../hr-cutover/legacy-group-web-source-audit-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const report = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-group-web-source-audit-v1.json"), "utf8"));
const clone = value => structuredClone(value);
const rejects = (code, callback) => assert.throws(callback, error => error instanceof LegacyGroupWebSourceAuditContractError && error.code === code);

test("all 186 navigable Group Web entries have deployed source-level field and action evidence", () => {
  const result = verifyLegacyGroupWebSourceAudit(report);
  assert.equal(result.items, 186);
  assert.deepEqual(result.sourceBoundary, { files: 6304, classicAspFiles: 4026 });
  assert.deepEqual(result.sums, LEGACY_GROUP_WEB_SOURCE_EXPECTED_SUMS);
  assert.equal(result.productionImport, "HOLD");
});

test("source audit counts and the immutable item hash fail closed on drift", () => {
  const metric = clone(report);
  metric.items[0].controls += 1;
  rejects("GROUP_WEB_SOURCE_CONTRACT_SUM_INVALID", () => verifyLegacyGroupWebSourceAudit(metric));
  const hash = clone(report);
  hash.items[0].fieldEvidenceHash = "0".repeat(64);
  rejects("GROUP_WEB_SOURCE_CONTRACT_HASH_INVALID", () => verifyLegacyGroupWebSourceAudit(hash));
  const unresolved = clone(report);
  unresolved.items[0].entryResolved = false;
  rejects("GROUP_WEB_SOURCE_CONTRACT_ITEM_INVALID", () => verifyLegacyGroupWebSourceAudit(unresolved));
});

test("source audit evidence rejects credentials, workstation paths and production import release", () => {
  const path = clone(report);
  path.items[0].domain = "/Users/example/evidence";
  rejects("GROUP_WEB_SOURCE_CONTRACT_SENSITIVE_CONTENT", () => verifyLegacyGroupWebSourceAudit(path));
  const unsafe = clone(report);
  unsafe.security.sourceFilesCommitted = true;
  rejects("GROUP_WEB_SOURCE_CONTRACT_SECURITY_INVALID", () => verifyLegacyGroupWebSourceAudit(unsafe));
  const released = clone(report);
  released.productionImport = "GO";
  rejects("GROUP_WEB_SOURCE_CONTRACT_IMPORT_NOT_HELD", () => verifyLegacyGroupWebSourceAudit(released));
});
