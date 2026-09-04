/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyClientPermissionCapabilityMapping,
  LegacyClientPermissionCapabilityMappingError,
  verifyLegacyClientPermissionCapabilityMapping
} from "../hr-cutover/legacy-client-permission-capability-mapping.mjs";

const root = resolve(import.meta.dirname, "../..");
const readJson = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const sourceInventory = readJson("scripts/hr-cutover/contracts/legacy-client-atomic-inventory-v1.json");
const currentContract = readJson("scripts/hr-cutover/contracts/legacy-client-permission-capability-mapping-v1.json");
const currentSourceReceipt = readJson("scripts/hr-cutover/contracts/legacy-client-permission-source-receipt-evidence-v1.json");
const permissionRegistrySource = readFileSync(resolve(root, "packages/shared/src/hr.ts"), "utf8");
const currentModernPermissions = new Set([...permissionRegistrySource.matchAll(/\bHR_[A-Z0-9_]+:\s*"(hr(?::[a-z0-9_]+)+)"/gu)].map(match => match[1]));
const evidenceSha256 = "a".repeat(64);
const modernPermissions = new Set(["hr:employee:read", "hr:employee:team_read"]);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const sourceReceiptBody = {
  formatVersion: 1,
  artifactKind: "yuzhou_hr_legacy_client_permission_source_receipt",
  sourceRestoreReceiptSha256: "c".repeat(64),
  databaseIdentitySha256: "d".repeat(64),
  queryIdentitySha256: "e".repeat(64),
  operationMode: "read_only_aggregate_and_private_capability_export",
  expectedAuthorizationGrantEdges: 915,
  safeFacts: {
    rightsRows: 915, templateRows: 91, usersRows: 10,
    rightsDistinctUnitcodes: 91, templateDistinctUnitcodes: 91, sharedUnitcodes: 91,
    capabilityUnionUnitcodes: 91, rightsOrphanUnitcodes: 0, templateUnusedUnitcodes: 0,
    duplicateGrantPrimaryKeys: 0, structuralConflictUnitcodes: 0, blankTemplateSemantics: 0,
    grantEdgeSetSha256: "f".repeat(64),
    capabilitySetSha256: sha256(Array.from({ length: 91 }, (_, index) => `${index + 1};`).join("")),
  },
  status: "SOURCE_PERMISSION_CAPABILITIES_CAPTURED_REVIEW_PENDING",
  containsUserBoundRows: false,
  compatibilityCredit: 0,
  productionImport: "HOLD",
};
const sourceReceipt = { ...sourceReceiptBody, receiptSha256: sha256(`${JSON.stringify(sourceReceiptBody)}\n`) };
const makeRows = () => Array.from({ length: 91 }, (_, index) => ({
  legacyUnitCode: index + 1,
  legacyDomain: `domain_${String(index % 13).padStart(2, "0")}`,
  legacyResource: `resource_${String(index).padStart(3, "0")}`,
  legacyAction: index % 2 === 0 ? "read" : "manage",
  legacyScope: index % 3 === 0 ? "park" : "self",
  targetDomain: "employee_profile",
  targetPermissions: ["hr:employee:read"],
  disposition: "exact_mapped",
  reasonCode: null,
  evidenceSha256
}));
const expectCode = (action, code) => assert.throws(action, error => error instanceof LegacyClientPermissionCapabilityMappingError && error.code === code);

test("current client permission contract binds all source capabilities without copying user grants or fake credit", () => {
  const result = verifyLegacyClientPermissionCapabilityMapping(sourceInventory, currentContract, { modernPermissions: currentModernPermissions, sourceReceipt: currentSourceReceipt });
  assert.equal(result.status, "ATOMIC_PERMISSION_MAPPING_PENDING_REVIEW");
  assert.deepEqual(result.authorizationGrantEdges, { observedRows: 915, expectedRows: 915, compatibilityCredit: 0, status: "SOURCE_GRANT_EDGE_CONSERVATION_VERIFIED" });
  assert.deepEqual(result.summary, { observedRows: 93, uniqueRows: 93, mappedRows: 64, retiredRows: 12, pendingRows: 17, missingRows: 0 });
  assert.deepEqual(result.compatibilityCredit, { numerator: 76, denominator: 93 });
  assert.equal(result.items.length, 93);
  assert.equal(result.gaps[0].code, "LEGACY_CLIENT_PERMISSION_TARGET_REVIEW_PENDING");
  assert.equal(JSON.stringify(result).includes("username"), true);
  assert.equal(result.items.some(item => Object.hasOwn(item, "username") || Object.hasOwn(item, "userId")), false);
  assert.equal(result.productionImport, "HOLD");
});

test("source-derived capability rows produce stable modern mappings without grant-edge credit", () => {
  const first = buildLegacyClientPermissionCapabilityMapping(sourceInventory, makeRows(), { modernPermissions, sourceReceipt });
  const second = buildLegacyClientPermissionCapabilityMapping(sourceInventory, makeRows(), { modernPermissions, sourceReceipt });
  assert.equal(first.status, "ATOMIC_PERMISSION_MAPPING_COMPLETE");
  assert.deepEqual(first.summary, { observedRows: 91, uniqueRows: 91, mappedRows: 91, retiredRows: 0, pendingRows: 0, missingRows: 0 });
  assert.deepEqual(first.compatibilityCredit, { numerator: 91, denominator: 91 });
  assert.deepEqual(first.authorizationGrantEdges, { observedRows: 915, expectedRows: 915, compatibilityCredit: 0, status: "SOURCE_GRANT_EDGE_CONSERVATION_VERIFIED" });
  assert.deepEqual(first.items, second.items);
  assert.match(first.items[0].id, /^PERMISSION-[A-F0-9]{16}$/u);
  assert.equal(first.items.every(item => item.targetDomain === "employee_profile" && item.targetPermissions[0] === "hr:employee:read"), true);
  assert.deepEqual(verifyLegacyClientPermissionCapabilityMapping(sourceInventory, first, { modernPermissions, sourceReceipt }), first);
});

test("duplicate capability codes fail closed even though grant-edge conservation remains 915", () => {
  const rows = makeRows();
  rows[90] = structuredClone(rows[0]);
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, rows, { modernPermissions, sourceReceipt }), "PERMISSION_DUPLICATE_UNIT_CODE");
});

test("partial row sets and source denominator drift fail closed", () => {
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, makeRows().slice(0, 90), { modernPermissions, sourceReceipt }), "PERMISSION_SOURCE_ROW_COUNT_MISMATCH");
  const driftedSource = structuredClone(sourceInventory);
  driftedSource.expectedCounts.authorizationGrantEdges = 916;
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(driftedSource, []), "PERMISSION_GRANT_EDGE_DENOMINATOR_DRIFT");
});

test("user-bound grants, unknown target permissions, and invalid split mappings are rejected", () => {
  const userBound = makeRows();
  userBound[0].username = "forbidden";
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, userBound, { modernPermissions, sourceReceipt }), "PERMISSION_USER_BOUND_FIELD_FORBIDDEN");
  const unknownTarget = makeRows();
  unknownTarget[0].targetPermissions = ["hr:invented:read"];
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, unknownTarget, { modernPermissions, sourceReceipt }), "PERMISSION_TARGET_UNKNOWN");
  const invalidSplit = makeRows();
  invalidSplit[0].disposition = "split_mapped";
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, invalidSplit, { modernPermissions, sourceReceipt }), "PERMISSION_TARGET_INVALID");
});

test("capability rows cannot be supplied without the source receipt and the denominator is never hardcoded to 91", () => {
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, makeRows(), { modernPermissions }), "PERMISSION_SOURCE_RECEIPT_REQUIRED");
  const expandedReceipt = structuredClone(sourceReceipt);
  expandedReceipt.safeFacts.capabilityUnionUnitcodes = 92;
  const { receiptSha256: ignored, ...expandedBody } = expandedReceipt;
  expandedReceipt.receiptSha256 = sha256(`${JSON.stringify(expandedBody)}\n`);
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, makeRows(), { modernPermissions, sourceReceipt: expandedReceipt }), "PERMISSION_SOURCE_ROW_COUNT_MISMATCH");
});

test("a same-sized but different capability code set cannot impersonate the SQL Server receipt", () => {
  const rows = makeRows();
  rows[90].legacyUnitCode = 999;
  expectCode(() => buildLegacyClientPermissionCapabilityMapping(sourceInventory, rows, { modernPermissions, sourceReceipt }), "PERMISSION_CAPABILITY_SET_HASH_MISMATCH");
});
