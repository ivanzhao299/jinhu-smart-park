import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildLegacySecassignmentRelationshipReceipt, LegacySecassignmentRelationshipReceiptError, SECASSIGNMENT_SAFE_AGGREGATE_SQL } from "../hr-cutover/legacy-secassignment-relationship-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const readJson = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const contract = readJson("scripts/hr-cutover/contracts/legacy-secassignment-relationship-receipt-v1.json");
const organizationMap = readJson("scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json");
const routineLedger = readJson("scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json");
const catalog = [{ table: "person", column: "secassignment", type: "varchar", maxLength: 50 }, { table: "secassignmentcode", column: "secassignment", type: "varchar", maxLength: 30 }];
const aggregate = { dictionaryRows: 3, dictionaryDistinctKeys: 3, dictionaryBlankKeys: 0, dictionaryDuplicateKeys: 0, personNonBlankRows: 5, personMatchedRows: 5, personUnmatchedRows: 0, personOverDictionaryWidthRows: 0 };
const sourceRestoreReceiptSha256 = "a".repeat(64);
const databaseIdentitySha256 = "b".repeat(64);
const build = (value = aggregate, selectedContract = contract) => buildLegacySecassignmentRelationshipReceipt({
  contract: selectedContract,
  catalog,
  aggregate: value,
  sourceRestoreReceiptSha256,
  databaseIdentitySha256,
});

test("binds the gap receipt to reviewed schema and routine evidence without promoting a name-based candidate", () => {
  const gapRule = organizationMap.resolutionRules.find(rule => rule.ruleId === "SECASSIGNMENT_RELATION_GAP_V1");
  const inferredRelation = organizationMap.relations.find(relation => relation.source === "person.secassignment");
  const routine = routineLedger.routines.find(item => item.routineId === contract.structuralEvidence.profileProjectionRoutineId);
  assert.equal(contract.structuralEvidence.inventorySha256, organizationMap.inventorySha256);
  assert.equal(contract.structuralEvidence.inventorySha256, routineLedger.sourceBinding.inventorySha256);
  assert.equal(contract.structuralEvidence.schemaArtifactSha256, gapRule.evidence.schemaArtifactSha256);
  assert.equal(contract.structuralEvidence.profileProjectionRoutineSha256, gapRule.evidence.profileProjectionRoutineSha256);
  assert.equal(contract.structuralEvidence.profileProjectionRoutineSha256, routine.sourceArtifactSha256);
  assert.equal(inferredRelation.kind, "inferred_business_key");
  assert.match(inferredRelation.status, /^pending_/u);
  assert.equal(routine.readTables.includes("secassignmentcode"), false);
  assert.equal(routine.joinPredicates.some(predicate => /secassignment/iu.test(predicate)), false);

  const receipt = build();
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.equal(receipt.reasonCode, "RELATION_SEMANTICS_UNPROVEN");
  assert.equal(receipt.declaredForeignKey, false);
  assert.equal(receipt.deployedRoutineJoinEvidence, false);
  assert.equal(receipt.relationshipClassification, "business_key_name_candidate");
  assert.equal(receipt.profileProjectionReadsDictionary, false);
  assert.equal(receipt.directOrganizationOrPositionRelationEvidence, false);
  assert.equal(receipt.materialization, "BLOCKED");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.gap.code, "SECASSIGNMENT_ORGANIZATION_SEMANTICS_UNPROVEN");
  assert.deepEqual(receipt.gap.missingEvidence, contract.gap.missingEvidence);
  assert.equal(receipt.sourceBinding.sourceRestoreReceiptSha256, sourceRestoreReceiptSha256);
  assert.equal(receipt.sourceBinding.databaseIdentitySha256, databaseIdentitySha256);
  assert.equal(receipt.sourceBinding.aggregateQuerySha256, createHash("sha256").update(SECASSIGNMENT_SAFE_AGGREGATE_SQL).digest("hex"));
  assert.equal(receipt.productionImport, "HOLD");
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(Object.keys(receipt.safeFacts).sort(), [...contract.aggregateFields].sort());
  assert.equal(receipt.containsPersonValues, false);
  assert.equal(receipt.containsPersonIdentifiers, false);
  assert.doesNotMatch(JSON.stringify(receipt), /employeeId|positionId|sourceValue|personName|personCode/iu);
  assert.doesNotMatch(SECASSIGNMENT_SAFE_AGGREGATE_SQL, /SELECT\s+(?:p|d)?\.?secassignment\b/iu);
  assert.doesNotMatch(SECASSIGNMENT_SAFE_AGGREGATE_SQL, /\b(?:person|name|idcard|tel|email)\s+AS\b/iu);
  assert.doesNotMatch(SECASSIGNMENT_SAFE_AGGREGATE_SQL, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?)\b/iu);
});

test("reports aggregate conflicts but cannot promote the relation", () => {
  const receipt = build({ ...aggregate, personMatchedRows: 4, personUnmatchedRows: 1 });
  assert.equal(receipt.decision, "KEEP_PENDING");
  assert.equal(receipt.reasonCode, "AGGREGATE_RELATION_CONFLICT");
  assert.equal(receipt.compatibilityCredit, 0);
});

test("fails closed on evidence, source identity, catalog, payload, or count drift", () => {
  const call = overrides => buildLegacySecassignmentRelationshipReceipt({ contract, catalog, aggregate, sourceRestoreReceiptSha256, databaseIdentitySha256, ...overrides });
  assert.throws(() => build(aggregate, { ...contract, structuralEvidence: { ...contract.structuralEvidence, profileProjectionJoinsRelationship: true } }), error => error instanceof LegacySecassignmentRelationshipReceiptError && error.code === "SECASSIGNMENT_RECEIPT_CONTRACT_INVALID");
  assert.throws(() => call({ sourceRestoreReceiptSha256: "not-a-digest" }), error => error.code === "SECASSIGNMENT_RECEIPT_SOURCE_BINDING_INVALID");
  assert.throws(() => call({ catalog: [{ ...catalog[0], maxLength: 30 }, catalog[1]] }), error => error.code === "SECASSIGNMENT_RECEIPT_CATALOG_INVALID");
  assert.throws(() => call({ aggregate: { ...aggregate, sourceValue: "forbidden" } }), error => error.code === "SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID");
  assert.throws(() => call({ aggregate: { ...aggregate, personMatchedRows: 6 } }), error => error.code === "SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID");
  assert.throws(() => call({ aggregate: { ...aggregate, personMatchedRows: 4, personUnmatchedRows: 1, personOverDictionaryWidthRows: 2 } }), error => error.code === "SECASSIGNMENT_RECEIPT_AGGREGATE_INVALID");
});
