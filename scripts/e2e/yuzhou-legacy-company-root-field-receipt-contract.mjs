/* global structuredClone */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyCompanyRootFieldReceipt,
  COMPANY_ROOT_SAFE_AGGREGATE_SQL,
  LegacyCompanyRootFieldReceiptError,
} from "../hr-cutover/legacy-company-root-field-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-company-root-field-receipt-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const catalog = [
  { table: "company", column: "id", type: "int", maxLength: null, nullable: false },
  { table: "company", column: "company", type: "varchar", maxLength: 50, nullable: false },
  { table: "company", column: "phone", type: "varchar", maxLength: 30, nullable: true },
  { table: "company", column: "etype", type: "varchar", maxLength: 20, nullable: true },
  { table: "company", column: "addr", type: "varchar", maxLength: 100, nullable: true },
  { table: "company", column: "email", type: "varchar", maxLength: 100, nullable: true },
  { table: "company", column: "master", type: "varchar", maxLength: 50, nullable: true },
];
const aggregate = {
  companyRows: 1,
  distinctIdRows: 1,
  nullIdRows: 0,
  duplicateIdGroups: 0,
  distinctCompanyNames: 1,
  blankCompanyRows: 0,
  maxCompanyLength: 8,
  blankPhoneRows: 0,
  maxPhoneLength: 12,
  distinctEtypeRows: 1,
  blankEtypeRows: 0,
  maxEtypeLength: 4,
};
const sourceRestoreReceiptSha256 = "a".repeat(64);
const databaseIdentitySha256 = "b".repeat(64);
const build = ({ selectedContract = contract(), selectedCatalog = catalog, selectedAggregate = aggregate, ...overrides } = {}) => buildLegacyCompanyRootFieldReceipt({
  contract: selectedContract,
  repositoryRoot: root,
  catalog: selectedCatalog,
  aggregate: selectedAggregate,
  sourceRestoreReceiptSha256,
  databaseIdentitySha256,
  ...overrides,
});
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyCompanyRootFieldReceiptError && error.code === code);

test("captures four company root field facts while keeping semantic compatibility credit at zero", () => {
  const receipt = build();
  assert.equal(receipt.status, "SOURCE_FACTS_CAPTURED_SEMANTIC_AND_TARGET_REVIEW_PENDING");
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.deepEqual(receipt.compatibilityCredit, { numerator: 0, denominator: 4 });
  assert.deepEqual(receipt.fieldFacts.map(field => field.sourceLocator), ["company.id", "company.company", "company.phone", "company.etype"]);
  assert.ok(receipt.fieldFacts.every(field => field.targetStorageCompatible && field.compatibilityCredit === 0 && field.decision === "KEEP_PENDING"));
  assert.equal(receipt.fieldFacts.find(field => field.sourceLocator === "company.id")?.sourceCatalog.type, "int");
  assert.equal(receipt.fieldFacts.find(field => field.sourceLocator === "company.company")?.aggregateFacts.distinctRows, 1);
  assert.deepEqual(receipt.sourceEvidence, {
    routineReferenceCount: 0,
    unitSettingsPageObservationStatus: "pending",
    unitSettingsFieldObservationVerified: false,
  });
  assert.deepEqual(receipt.reasonCodes, [
    "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED",
    "COMPANY_ROOT_PAGE_FIELD_OBSERVATION_MISSING",
    "COMPANY_ETYPE_SEMANTICS_UNCONFIRMED",
  ]);
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsPersonData, false);
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u);
});

test("binds addr email and master to safe storage while keeping semantics and identity pending", () => {
  const receipt = build();
  assert.deepEqual(receipt.explicitGaps.map(gap => [gap.sourceLocator, gap.authoritativeModernTarget, gap.reasonCode]), [
    ["company.addr", "sys_org.contact_address", "COMPANY_ADDR_SOURCE_SEMANTICS_UNCONFIRMED"],
    ["company.email", "sys_org.contact_email", "COMPANY_EMAIL_SOURCE_SEMANTICS_UNCONFIRMED"],
    ["company.master", "sys_org.legacy_company_manager_reference", "COMPANY_MASTER_IDENTITY_BINDING_REQUIRED"],
  ]);
  assert.deepEqual(receipt.explicitGaps.find(gap => gap.sourceLocator === "company.addr")?.forbiddenTargets, ["sys_org.remark"]);
  assert.deepEqual(receipt.explicitGaps.find(gap => gap.sourceLocator === "company.email")?.forbiddenTargets, ["sys_org.remark"]);
  assert.deepEqual(receipt.explicitGaps.find(gap => gap.sourceLocator === "company.master")?.forbiddenTargets, ["sys_org.leader_user_id", "sys_org.remark"]);
  assert.ok(receipt.explicitGaps.every(gap => gap.compatibilityCredit === 0 && gap.decision === "KEEP_GAP"));
});

test("source shape or target width conflicts stay visible and cannot promote a candidate", () => {
  const conflicted = build({
    selectedCatalog: catalog.map(row => row.column === "phone" ? { ...row, maxLength: 80 } : row),
    selectedAggregate: { ...aggregate, companyRows: 2, distinctIdRows: 1, duplicateIdGroups: 1, distinctCompanyNames: 1, blankCompanyRows: 1 },
  });
  assert.deepEqual(conflicted.reasonCodes, [
    "COMPANY_ROOT_TARGET_STORAGE_INCOMPATIBLE",
    "COMPANY_ROOT_SOURCE_SHAPE_REVIEW_REQUIRED",
    "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED",
    "COMPANY_ROOT_PAGE_FIELD_OBSERVATION_MISSING",
    "COMPANY_ETYPE_SEMANTICS_UNCONFIRMED",
  ]);
  assert.equal(conflicted.fieldFacts.find(field => field.sourceLocator === "company.phone")?.targetStorageCompatible, false);
  assert.deepEqual(conflicted.compatibilityCredit, { numerator: 0, denominator: 4 });
});

test("catalog aggregates source binding and bound authority fail closed on drift", () => {
  rejects("COMPANY_ROOT_SOURCE_BINDING_INVALID", () => build({ sourceRestoreReceiptSha256: "not-a-sha" }));
  rejects("COMPANY_ROOT_CATALOG_INVALID", () => build({ selectedCatalog: catalog.map((row, index) => index === 0 ? { ...row, sourceValue: 1 } : row) }));
  rejects("COMPANY_ROOT_CATALOG_INVALID", () => build({ selectedCatalog: catalog.slice(1) }));
  rejects("COMPANY_ROOT_AGGREGATE_INVALID", () => build({ selectedAggregate: { ...aggregate, blankPhoneRows: 2 } }));
  rejects("COMPANY_ROOT_AGGREGATE_INVALID", () => build({ selectedAggregate: { ...aggregate, sourceValue: 1 } }));

  const mapDrift = contract();
  mapDrift.evidenceBindings.organizationPositionMap.selectedRowsSha256 = "0".repeat(64);
  rejects("COMPANY_ROOT_MAP_DRIFT", () => build({ selectedContract: mapDrift }));

  const targetDrift = contract();
  targetDrift.evidenceBindings.targetArtifacts[0].sha256 = "0".repeat(64);
  rejects("COMPANY_ROOT_EVIDENCE_DRIFT", () => build({ selectedContract: targetDrift }));

  const promoted = contract();
  promoted.candidateFields[0].compatibilityCredit = 1;
  rejects("COMPANY_ROOT_CANDIDATE_INVALID", () => build({ selectedContract: promoted }));

  const schemaDrift = contract();
  schemaDrift.sourceSchema.schemaArtifactSha256 = "0".repeat(64);
  rejects("COMPANY_ROOT_CONTRACT_INVALID", () => build({ selectedContract: schemaDrift }));
});

test("receipt evidence hashes are stable across catalog and aggregate JSON input order", () => {
  const baseline = build();
  const reversedAggregate = Object.fromEntries(Object.entries(aggregate).reverse());
  const reordered = build({ selectedCatalog: [...catalog].reverse(), selectedAggregate: reversedAggregate });
  assert.equal(reordered.sourceBinding.catalogSha256, baseline.sourceBinding.catalogSha256);
  assert.equal(reordered.sourceBinding.aggregateSha256, baseline.sourceBinding.aggregateSha256);
  assert.equal(reordered.receiptSha256, baseline.receiptSha256);
});

test("contract forbids assigning addr email or master to generic or identity targets", () => {
  const addressRemark = contract();
  addressRemark.explicitGaps[0].authoritativeModernTarget = "sys_org.remark";
  rejects("COMPANY_ROOT_GAP_INVALID", () => build({ selectedContract: addressRemark }));

  const emailRemark = contract();
  emailRemark.explicitGaps[1].forbiddenTargets = [];
  rejects("COMPANY_ROOT_GAP_INVALID", () => build({ selectedContract: emailRemark }));

  const masterLeader = contract();
  masterLeader.explicitGaps[2].authoritativeModernTarget = "sys_org.leader_user_id";
  rejects("COMPANY_ROOT_GAP_INVALID", () => build({ selectedContract: masterLeader }));
});

test("safe SQL returns aggregate metadata only and performs no source mutation", () => {
  for (const alias of contract().aggregateFields) assert.match(COMPANY_ROOT_SAFE_AGGREGATE_SQL, new RegExp(`AS ${alias}\\b`, "u"));
  assert.match(COMPANY_ROOT_SAFE_AGGREGATE_SQL, /FROM dbo\.company/u);
  assert.doesNotMatch(COMPANY_ROOT_SAFE_AGGREGATE_SQL, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?|ALTER|DROP|TRUNCATE)\b/iu);
  assert.doesNotMatch(COMPANY_ROOT_SAFE_AGGREGATE_SQL, /\b(?:addr|email|master|bank|account|taxcount)\b/iu);
  assert.doesNotMatch(COMPANY_ROOT_SAFE_AGGREGATE_SQL, /\bAS\s+(?:id|company|phone|etype|addr|email|master)\b/iu);
  const serialized = JSON.stringify(build());
  assert.doesNotMatch(serialized, /"(?:sourceValue|companyName|phoneValue|masterValue|leaderUserId)"\s*:/u);
});

test("CLI exposes the reviewed read-only aggregate query without credentials", () => {
  const script = resolve(root, "scripts/hr-cutover/legacy-company-root-field-receipt.mjs");
  const result = spawnSync(process.execPath, [script, "--print-safe-sql"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), COMPANY_ROOT_SAFE_AGGREGATE_SQL);
  assert.equal(result.stderr, "");
});
