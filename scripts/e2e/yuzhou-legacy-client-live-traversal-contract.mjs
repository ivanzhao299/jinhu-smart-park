import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { LegacyClientTraversalError, verifyLegacyClientLiveTraversal } from "../hr-cutover/legacy-client-live-traversal-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json"), "utf8"));
const clone = value => structuredClone(value);
const expectCode = (expected, callback) => assert.throws(callback, error => error instanceof LegacyClientTraversalError && error.code === expected);

test("live traversal reports exact progress without claiming L4 completion", () => {
  const report = verifyLegacyClientLiveTraversal(manifest);
  assert.equal(report.families, 13);
  assert.equal(report.observedFamilies, 0);
  assert.equal(report.partialFamilies, 13);
  assert.equal(report.missingFamilies, 0);
  assert.equal(report.entryPoints, 67);
  assert.equal(report.pageChecks, 18);
  assert.equal(report.status, "in_progress");
  assert.equal(report.evidenceLevel, "L3_RUNTIME_PARTIAL");
  assert.equal(report.productionImport, "HOLD");
});

test("complete status fails closed while any traversal requirement is missing", () => {
  const falseComplete = clone(manifest);
  falseComplete.status = "complete";
  falseComplete.evidenceLevel = "L4";
  expectCode("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", () => verifyLegacyClientLiveTraversal(falseComplete));
  const toggled = clone(manifest);
  Object.keys(toggled.completionRequirements).forEach(key => { toggled.completionRequirements[key] = true; });
  expectCode("TRAVERSAL_FALSE_COMPLETION", () => verifyLegacyClientLiveTraversal(toggled));
  const finalizedDecision = clone(manifest);
  finalizedDecision.decisionMaturity = "final";
  expectCode("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", () => verifyLegacyClientLiveTraversal(finalizedDecision));
});

test("family substitution, duplicate entries and observed reason drift fail closed", () => {
  const substituted = clone(manifest);
  substituted.menuFamilies[0].id = "invented_family";
  expectCode("TRAVERSAL_FAMILY_INVALID", () => verifyLegacyClientLiveTraversal(substituted));
  const duplicate = clone(manifest);
  duplicate.menuFamilies[0].entryPoints.push(duplicate.menuFamilies[0].entryPoints[0]);
  expectCode("TRAVERSAL_LIST_DUPLICATE", () => verifyLegacyClientLiveTraversal(duplicate));
  const observedWithGap = clone(manifest);
  observedWithGap.menuFamilies[0].runtimeStatus = "observed";
  observedWithGap.menuFamilies[0].reasonCode = "FREE_TEXT_GAP";
  expectCode("TRAVERSAL_OBSERVED_FAMILY_INVALID", () => verifyLegacyClientLiveTraversal(observedWithGap));
});

test("atomic inventory boundary and required read-only prohibitions are immutable", () => {
  for (const [key, value] of [["tables", 161], ["fields", 2363], ["rules", 211], ["helpTopics", 45]]) {
    const drifted = clone(manifest);
    drifted.inventoryContract[key] = value;
    expectCode("TRAVERSAL_INVENTORY_CONTRACT_INVALID", () => verifyLegacyClientLiveTraversal(drifted));
  }
  const screenshot = clone(manifest);
  screenshot.security.screenshotsCommitted = true;
  expectCode("TRAVERSAL_SECURITY_CONTRACT_INVALID", () => verifyLegacyClientLiveTraversal(screenshot));
  const missingWriteProhibition = clone(manifest);
  missingWriteProhibition.security.forbiddenActions = missingWriteProhibition.security.forbiddenActions.filter(action => action !== "close_period");
  expectCode("TRAVERSAL_FORBIDDEN_ACTION_MISSING", () => verifyLegacyClientLiveTraversal(missingWriteProhibition));
});

test("manifest rejects credentials, workstation paths, private addresses and write claims", () => {
  const secret = clone(manifest);
  secret.traversalVersion = ["pass", "word=example"].join("");
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verifyLegacyClientLiveTraversal(secret));
  const privateAddress = clone(manifest);
  privateAddress.traversalVersion = ["192", "168", "1", "2"].join(".");
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verifyLegacyClientLiveTraversal(privateAddress));
  const writeClaim = clone(manifest);
  writeClaim.security.writeActionsExecuted = true;
  expectCode("TRAVERSAL_SECURITY_CONTRACT_INVALID", () => verifyLegacyClientLiveTraversal(writeClaim));
  const hiddenWriteClaim = clone(manifest);
  hiddenWriteClaim.writeResult = "saved";
  expectCode("TRAVERSAL_SHAPE_INVALID", () => verifyLegacyClientLiveTraversal(hiddenWriteClaim));
  const phone = clone(manifest);
  phone.traversalVersion = ["138", "1234", "5678"].join("");
  expectCode("TRAVERSAL_PERSONAL_VALUE_FORBIDDEN", () => verifyLegacyClientLiveTraversal(phone));
});

test("production import cannot be released by traversal evidence", () => {
  const released = clone(manifest);
  released.productionImport = "GO";
  expectCode("TRAVERSAL_PRODUCTION_IMPORT_NOT_HELD", () => verifyLegacyClientLiveTraversal(released));
});
