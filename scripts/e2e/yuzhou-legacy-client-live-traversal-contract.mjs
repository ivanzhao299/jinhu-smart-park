import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { LegacyClientTraversalError, verifyLegacyClientLiveTraversal } from "../hr-cutover/legacy-client-live-traversal-lib.mjs";

const root = resolve(import.meta.dirname, "../..");
const manifest = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-client-live-traversal-v1.json"), "utf8"));
const atomicInventory = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-client-live-traversal-atomic-v1.json"), "utf8"));
const clone = value => JSON.parse(JSON.stringify(value));
const expectCode = (expected, callback) => assert.throws(callback, error => error instanceof LegacyClientTraversalError && error.code === expected);
const verify = (candidate = manifest, candidateAtomic = atomicInventory) => verifyLegacyClientLiveTraversal(candidate, candidateAtomic);
const isObject = value => value && typeof value === "object" && !Array.isArray(value);
const canonicalize = value => Array.isArray(value)
  ? `[${value.map(canonicalize).join(",")}]`
  : isObject(value)
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`
    : JSON.stringify(value);
const canonicalHash = value => createHash("sha256").update(canonicalize(value)).digest("hex");

test("live traversal reports exact progress without claiming L4 completion", () => {
  const report = verify();
  assert.equal(report.families, 13);
  assert.equal(report.observedFamilies, 0);
  assert.equal(report.partialFamilies, 13);
  assert.equal(report.missingFamilies, 0);
  assert.equal(report.entryPoints, 83);
  assert.equal(report.pageChecks, 18);
  assert.equal(report.atomicEntries, 83);
  assert.equal(report.atomicObserved, 0);
  assert.equal(report.atomicPartial, 0);
  assert.equal(report.atomicPending, 83);
  assert.equal(report.desktopClientEntries, 68);
  assert.equal(report.groupWebEntries, 15);
  assert.equal(report.status, "in_progress");
  assert.equal(report.evidenceLevel, "L3_RUNTIME_PARTIAL");
  assert.equal(report.productionImport, "HOLD");
});

test("complete status fails closed while any traversal requirement is missing", () => {
  const falseComplete = clone(manifest);
  falseComplete.status = "complete";
  falseComplete.evidenceLevel = "L4";
  expectCode("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", () => verify(falseComplete));
  const toggled = clone(manifest);
  Object.keys(toggled.completionRequirements).forEach(key => { toggled.completionRequirements[key] = true; });
  expectCode("TRAVERSAL_FALSE_COMPLETION", () => verify(toggled));
  const finalizedDecision = clone(manifest);
  finalizedDecision.decisionMaturity = "final";
  expectCode("TRAVERSAL_PARTIAL_EVIDENCE_OVERRATED", () => verify(finalizedDecision));
});

test("family substitution, duplicate entries and observed reason drift fail closed", () => {
  const substituted = clone(manifest);
  substituted.menuFamilies[0].id = "invented_family";
  expectCode("TRAVERSAL_FAMILY_INVALID", () => verify(substituted));
  const duplicate = clone(manifest);
  duplicate.menuFamilies[0].entryPoints.push(duplicate.menuFamilies[0].entryPoints[0]);
  expectCode("TRAVERSAL_LIST_DUPLICATE", () => verify(duplicate));
  const observedWithGap = clone(manifest);
  observedWithGap.menuFamilies[0].runtimeStatus = "observed";
  observedWithGap.menuFamilies[0].reasonCode = "FREE_TEXT_GAP";
  expectCode("TRAVERSAL_OBSERVED_FAMILY_INVALID", () => verify(observedWithGap));

  const familyUpgradeWithoutAtomicEvidence = clone(manifest);
  familyUpgradeWithoutAtomicEvidence.menuFamilies[0].runtimeStatus = "observed";
  familyUpgradeWithoutAtomicEvidence.menuFamilies[0].reasonCode = null;
  expectCode("TRAVERSAL_FAMILY_ATOMIC_STATUS_DRIFT", () => verify(familyUpgradeWithoutAtomicEvidence));

  const uncontrolledFamilyGap = clone(manifest);
  uncontrolledFamilyGap.menuFamilies[0].reasonCode = "FREE_TEXT_GAP";
  expectCode("TRAVERSAL_PARTIAL_FAMILY_INVALID", () => verify(uncontrolledFamilyGap));
});

test("atomic inventory boundary and required read-only prohibitions are immutable", () => {
  for (const [key, value] of [["tables", 161], ["fields", 2363], ["rules", 211], ["helpTopics", 45]]) {
    const drifted = clone(manifest);
    drifted.inventoryContract[key] = value;
    expectCode("TRAVERSAL_INVENTORY_CONTRACT_INVALID", () => verify(drifted));
  }
  const screenshot = clone(manifest);
  screenshot.security.screenshotsCommitted = true;
  expectCode("TRAVERSAL_SECURITY_CONTRACT_INVALID", () => verify(screenshot));
  const missingWriteProhibition = clone(manifest);
  missingWriteProhibition.security.forbiddenActions = missingWriteProhibition.security.forbiddenActions.filter(action => action !== "close_period");
  expectCode("TRAVERSAL_FORBIDDEN_ACTION_MISSING", () => verify(missingWriteProhibition));
});

test("manifest rejects credentials, workstation paths, private addresses and write claims", () => {
  const secret = clone(manifest);
  secret.traversalVersion = ["pass", "word=example"].join("");
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verify(secret));
  const privateAddress = clone(manifest);
  privateAddress.traversalVersion = ["192", "168", "1", "2"].join(".");
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verify(privateAddress));
  const writeClaim = clone(manifest);
  writeClaim.security.writeActionsExecuted = true;
  expectCode("TRAVERSAL_SECURITY_CONTRACT_INVALID", () => verify(writeClaim));
  const hiddenWriteClaim = clone(manifest);
  hiddenWriteClaim.writeResult = "saved";
  expectCode("TRAVERSAL_SHAPE_INVALID", () => verify(hiddenWriteClaim));
  const phone = clone(manifest);
  phone.traversalVersion = ["138", "1234", "5678"].join("");
  expectCode("TRAVERSAL_PERSONAL_VALUE_FORBIDDEN", () => verify(phone));
  const encodedSecret = clone(manifest);
  encodedSecret.traversalVersion = Buffer.from(["pass", "word=example"].join("")).toString("hex");
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verify(encodedSecret));

  const cli = spawnSync(process.execPath, [resolve(root, "scripts/hr-cutover/verify-legacy-client-live-traversal.mjs"), "/Users/example/Downloads/credential.json"], { encoding: "utf8" });
  assert.equal(cli.status, 1);
  assert.equal(cli.stderr, "TRAVERSAL_INPUT_READ_FAILED: manifest or atomic inventory could not be read as JSON\n");
  assert.doesNotMatch(cli.stderr, /Users|Downloads|credential/);
});

test("production import cannot be released by traversal evidence", () => {
  const released = clone(manifest);
  released.productionImport = "GO";
  expectCode("TRAVERSAL_PRODUCTION_IMPORT_NOT_HELD", () => verify(released));
});

test("atomic inventory is complete, unique and hash bound", () => {
  expectCode("TRAVERSAL_ATOMIC_INVENTORY_REQUIRED", () => verifyLegacyClientLiveTraversal(manifest));
  const missing = clone(atomicInventory);
  missing.entries.pop();
  const missingManifest = clone(manifest);
  missingManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(missing);
  expectCode("TRAVERSAL_ATOMIC_INVENTORY_INCOMPLETE", () => verify(missingManifest, missing));
  const duplicate = clone(atomicInventory);
  duplicate.entries[1] = clone(duplicate.entries[0]);
  const duplicateManifest = clone(manifest);
  duplicateManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(duplicate);
  expectCode("TRAVERSAL_ATOMIC_ID_DUPLICATE_OR_INVALID", () => verify(duplicateManifest, duplicate));

  const selfConsistentSubstitution = clone(atomicInventory);
  selfConsistentSubstitution.entries[0].entryPoint = "invented-entry";
  const selfConsistentManifest = clone(manifest);
  selfConsistentManifest.menuFamilies[0].entryPoints[0] = "invented-entry";
  selfConsistentManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(selfConsistentSubstitution);
  expectCode("TRAVERSAL_ATOMIC_IDENTITY_DRIFT", () => verify(selfConsistentManifest, selfConsistentSubstitution));

  const selfConsistentRemoval = clone(atomicInventory);
  selfConsistentRemoval.entries.pop();
  const selfConsistentRemovalManifest = clone(manifest);
  const removed = selfConsistentRemovalManifest.menuFamilies.at(-1).entryPoints.pop();
  assert.equal(removed, "操作日志");
  selfConsistentRemovalManifest.atomicInventoryContract.entries -= 1;
  selfConsistentRemovalManifest.atomicInventoryContract.desktopClientEntries -= 1;
  selfConsistentRemovalManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(selfConsistentRemoval);
  expectCode("TRAVERSAL_ATOMIC_IDENTITY_DRIFT", () => verify(selfConsistentRemovalManifest, selfConsistentRemoval));
});

test("Group Web evidence cannot substitute for a desktop client entry", () => {
  const substituted = clone(atomicInventory);
  substituted.entries[0].surface = "group_web";
  substituted.entries[0].atomicId = substituted.entries[0].atomicId.replace("client.", "web.");
  const substitutedManifest = clone(manifest);
  substitutedManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(substituted);
  expectCode("TRAVERSAL_CROSS_SURFACE_SUBSTITUTION", () => verify(substitutedManifest, substituted));

  const evidenceReuse = clone(atomicInventory);
  const desktopEntry = evidenceReuse.entries.find(entry => entry.surface === "desktop_client");
  const webEntry = evidenceReuse.entries.find(entry => entry.surface === "group_web");
  for (const entry of [desktopEntry, webEntry]) {
    entry.observationStatus = "partial";
    entry.coverage.page = true;
    entry.pageIds = ["page.runtime-observation"];
    entry.evidence.sha256 = ["a".repeat(64)];
    entry.gapReasonCode = "ATOMIC_RUNTIME_OBSERVATION_PARTIAL";
  }
  const evidenceReuseManifest = clone(manifest);
  evidenceReuseManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(evidenceReuse);
  expectCode("TRAVERSAL_CROSS_SURFACE_EVIDENCE_REUSE", () => verify(evidenceReuseManifest, evidenceReuse));
});

test("atomic observations require category coverage and hash-only evidence", () => {
  const partialWithoutHash = clone(atomicInventory);
  partialWithoutHash.entries[0].observationStatus = "partial";
  partialWithoutHash.entries[0].coverage.page = true;
  partialWithoutHash.entries[0].pageIds = ["page.runtime-observation"];
  partialWithoutHash.entries[0].gapReasonCode = "ATOMIC_RUNTIME_OBSERVATION_PARTIAL";
  const partialManifest = clone(manifest);
  partialManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(partialWithoutHash);
  expectCode("TRAVERSAL_ATOMIC_PARTIAL_INVALID", () => verify(partialManifest, partialWithoutHash));

  const booleanOnlyObserved = clone(atomicInventory);
  booleanOnlyObserved.entries[0].observationStatus = "observed";
  Object.keys(booleanOnlyObserved.entries[0].coverage).forEach(key => { booleanOnlyObserved.entries[0].coverage[key] = true; });
  booleanOnlyObserved.entries[0].evidence.sha256 = ["b".repeat(64)];
  booleanOnlyObserved.entries[0].gapReasonCode = null;
  const booleanOnlyManifest = clone(manifest);
  booleanOnlyManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(booleanOnlyObserved);
  expectCode("TRAVERSAL_ATOMIC_COVERAGE_DETAIL_DRIFT", () => verify(booleanOnlyManifest, booleanOnlyObserved));

  const uncontrolledGap = clone(atomicInventory);
  uncontrolledGap.entries[0].observationStatus = "partial";
  uncontrolledGap.entries[0].coverage.page = true;
  uncontrolledGap.entries[0].pageIds = ["page.employee-list"];
  uncontrolledGap.entries[0].evidence.sha256 = ["c".repeat(64)];
  uncontrolledGap.entries[0].gapReasonCode = "FREE_TEXT_GAP";
  const uncontrolledGapManifest = clone(manifest);
  uncontrolledGapManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(uncontrolledGap);
  expectCode("TRAVERSAL_ATOMIC_PARTIAL_INVALID", () => verify(uncontrolledGapManifest, uncontrolledGap));

  const personalLabel = clone(atomicInventory);
  personalLabel.entries[0].fieldIds = ["person-name-value"];
  const personalLabelManifest = clone(manifest);
  personalLabelManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(personalLabel);
  expectCode("TRAVERSAL_ATOMIC_IDENTIFIER_INVALID", () => verify(personalLabelManifest, personalLabel));

  const duplicateDetail = clone(atomicInventory);
  duplicateDetail.entries[0].fieldIds = ["field-a", "field-a"];
  const duplicateDetailManifest = clone(manifest);
  duplicateDetailManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(duplicateDetail);
  expectCode("TRAVERSAL_LIST_DUPLICATE", () => verify(duplicateDetailManifest, duplicateDetail));

  const rawSensitiveValue = clone(atomicInventory);
  rawSensitiveValue.entries[0].fieldIds.push(["pass", "word=example"].join(""));
  const sensitiveManifest = clone(manifest);
  sensitiveManifest.atomicInventoryContract.canonicalSha256 = canonicalHash(rawSensitiveValue);
  expectCode("TRAVERSAL_SENSITIVE_CONTENT_FORBIDDEN", () => verify(sensitiveManifest, rawSensitiveValue));
});
