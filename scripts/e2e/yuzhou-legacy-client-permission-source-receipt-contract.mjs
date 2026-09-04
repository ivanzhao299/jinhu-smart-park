import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  assertLegacyClientPermissionReadonlyAuthority,
  buildLegacyClientPermissionSourceReceipt,
  LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL,
  LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL,
  LegacyClientPermissionSourceReceiptError,
} from "../hr-cutover/legacy-client-permission-source-receipt.mjs";

const REQUIRED_SQLSERVER_SESSION_OPTIONS = [
  "SET ANSI_NULLS ON;",
  "SET QUOTED_IDENTIFIER ON;",
  "SET ANSI_PADDING ON;",
  "SET ANSI_WARNINGS ON;",
  "SET ARITHABORT ON;",
  "SET CONCAT_NULL_YIELDS_NULL ON;",
  "SET NUMERIC_ROUNDABORT OFF;",
];

test("permission source queries declare SQL Server indexed-object session options", () => {
  for (const sql of [LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL]) {
    for (const option of REQUIRED_SQLSERVER_SESSION_OPTIONS) assert.match(sql, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
  }
  assert.match(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, /HASHBYTES\('SHA2_256',CONVERT\(varchar\(max\),COALESCE\(\(SELECT CONCAT\(unitcode,';'\)/u);
});

const root = resolve(import.meta.dirname, "../..");
const contract = JSON.parse(readFileSync(resolve(root, "scripts/hr-cutover/contracts/legacy-client-permission-source-receipt-v1.json"), "utf8"));
const sha = "a".repeat(64);
const queryIdentitySha256 = createHash("sha256").update(`${LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL}\n${LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL}\n`).digest("hex");
const aggregate = () => ({
  rightsRows: 915, templateRows: 91, usersRows: 10,
  rightsDistinctUnitcodes: 91, templateDistinctUnitcodes: 91, sharedUnitcodes: 91,
  capabilityUnionUnitcodes: 91, rightsOrphanUnitcodes: 0, templateUnusedUnitcodes: 0,
  duplicateGrantPrimaryKeys: 0, structuralConflictUnitcodes: 0, blankTemplateSemantics: 0,
  grantEdgeSetSha256: "b".repeat(64), capabilitySetSha256: "c".repeat(64),
});
const build = value => buildLegacyClientPermissionSourceReceipt({ contract, aggregate: value, sourceRestoreReceiptSha256: sha, databaseIdentitySha256: sha, queryIdentitySha256 });
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyClientPermissionSourceReceiptError && error.code === code);

test("safe receipt separates 915 private grant edges from the source-derived capability denominator", () => {
  const receipt = build(aggregate());
  assert.equal(receipt.expectedAuthorizationGrantEdges, 915);
  assert.equal(receipt.safeFacts.capabilityUnionUnitcodes, 91);
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.containsUserBoundRows, false);
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes("username"), false);
});

test("aggregate SQL emits no user identifier or credential column", () => {
  assert.match(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, /COUNT_BIG\(\*\) FROM dbo\.rights/u);
  assert.match(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.doesNotMatch(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, /AS\s+(?:username|password|credential|token)\b/iu);
  assert.doesNotMatch(LEGACY_CLIENT_PERMISSION_SAFE_AGGREGATE_SQL, /INSERT\s|UPDATE\s|DELETE\s|MERGE\s/iu);
});

test("private capability SQL exports source-derived semantics without user-bound grant rows", () => {
  assert.match(LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL, /SELECT unitcode FROM dbo\.rights\s+UNION\s+SELECT unitcode FROM dbo\.rightstemplet/u);
  assert.match(LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL, /ORDER BY codes\.unitcode/u);
  assert.doesNotMatch(LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL, /username|password|credential|token/iu);
  assert.doesNotMatch(LEGACY_CLIENT_PERMISSION_PRIVATE_CAPABILITY_SQL, /INSERT\s+INTO|UPDATE\s+dbo\.|DELETE\s+FROM|MERGE\s+INTO/iu);
});

test("least-privilege read-only authority is mandatory", () => {
  const valid = { databaseReadOnly: true, sysadmin: false, dbDatareader: true, viewDefinition: true, insert: false, update: false, delete: false, execute: false };
  assert.equal(assertLegacyClientPermissionReadonlyAuthority(valid), true);
  for (const key of ["databaseReadOnly", "sysadmin", "dbDatareader", "viewDefinition", "insert", "update", "delete", "execute"]) {
    const invalid = { ...valid, [key]: !valid[key] };
    rejects("PERMISSION_SOURCE_AUTHORITY_INVALID", () => assertLegacyClientPermissionReadonlyAuthority(invalid));
  }
});

test("count drift, duplicate grant keys and source gaps fail closed or remain review pending", () => {
  const drift = aggregate(); drift.rightsRows = 914;
  rejects("PERMISSION_SOURCE_RECEIPT_CONSERVATION_FAILED", () => build(drift));
  const duplicate = aggregate(); duplicate.duplicateGrantPrimaryKeys = 1;
  rejects("PERMISSION_SOURCE_RECEIPT_CONSERVATION_FAILED", () => build(duplicate));
  const orphan = aggregate(); orphan.rightsDistinctUnitcodes = 92; orphan.capabilityUnionUnitcodes = 92; orphan.rightsOrphanUnitcodes = 1;
  assert.equal(build(orphan).status, "SOURCE_PERMISSION_CAPABILITIES_CAPTURED_WITH_GAPS");
});

test("receipt identity is bound to the exact aggregate and private capability queries", () => {
  rejects("PERMISSION_SOURCE_QUERY_IDENTITY_MISMATCH", () => buildLegacyClientPermissionSourceReceipt({
    contract,
    aggregate: aggregate(),
    sourceRestoreReceiptSha256: sha,
    databaseIdentitySha256: sha,
    queryIdentitySha256: "0".repeat(64),
  }));
});
