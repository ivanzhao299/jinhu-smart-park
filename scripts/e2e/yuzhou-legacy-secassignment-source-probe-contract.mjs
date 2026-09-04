/* global process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  buildLegacySecassignmentSourceProbeReceipt,
  LegacySecassignmentSourceProbeError,
  SECASSIGNMENT_SOURCE_PROBE_SQL,
} from "../hr-cutover/legacy-secassignment-source-probe.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const scriptPath = resolve(repositoryRoot, "scripts/hr-cutover/legacy-secassignment-source-probe.mjs");
const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-secassignment-source-probe-v1.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceRestoreReceiptSha256 = hash("synthetic source restore receipt");
const databaseIdentitySha256 = hash("synthetic database identity");
const catalog = [
  { schema: "dbo", table: "person", column: "secassignment", type: "varchar", maxLength: 50, nullable: true },
  { schema: "dbo", table: "secassignmentcode", column: "secassignment", type: "varchar", maxLength: 30, nullable: true },
];
const authority = {
  databaseReadOnly: true,
  loginSucceeded: true,
  sysadmin: false,
  dbDatareader: true,
  viewDefinition: true,
  insert: false,
  update: false,
  delete: false,
  execute: false,
};
const oneToOneFacts = {
  dictionaryRows: 2,
  dictionaryNullRows: 0,
  dictionaryBlankRows: 0,
  dictionaryNonBlankRows: 2,
  dictionaryDistinctNonBlankKeys: 2,
  dictionaryDuplicateKeyGroups: 0,
  dictionaryDuplicateRows: 0,
  dictionaryMaxObservedLength: 8,
  personRows: 4,
  personNullRows: 1,
  personBlankRows: 1,
  personNonBlankRows: 2,
  personDistinctNonBlankKeys: 2,
  personDuplicateValueGroups: 0,
  personRepeatedValueRows: 0,
  personZeroMatchRows: 0,
  personOneMatchRows: 2,
  personMultipleMatchRows: 0,
  personOrphanDistinctKeys: 0,
  personOverDictionaryWidthRows: 0,
  personMaxObservedLength: 8,
};

function build(aggregate = oneToOneFacts, selectedContract = contract, overrides = {}) {
  return buildLegacySecassignmentSourceProbeReceipt({
    contract: selectedContract,
    repositoryRoot,
    catalog,
    aggregate,
    authority,
    databaseReadOnly: true,
    sourceRestoreReceiptSha256,
    databaseIdentitySha256,
    ...overrides,
  });
}

test("confirms one-to-one source business-key integrity without granting field compatibility credit", () => {
  const receipt = build();
  assert.equal(receipt.decision, "SOURCE_RELATION_ONE_TO_ONE_READY");
  assert.equal(receipt.relationshipCardinality, "one_to_one");
  assert.equal(receipt.relationReady, true);
  assert.deepEqual(receipt.catalogFacts, catalog);
  assert.deepEqual(receipt.safeFacts, oneToOneFacts);
  assert.equal(receipt.safeFacts.personNullRows, 1);
  assert.equal(receipt.safeFacts.personBlankRows, 1);
  assert.equal(receipt.readinessBoundary.modernOrganizationOrPositionTargetBinding, "UNBOUND");
  assert.equal(receipt.readinessBoundary.integrationStatus, "REBIND_REQUIRED");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.materialization, "BLOCKED");
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.containsFieldValues, false);
  assert.equal(receipt.containsPersonData, false);
  assert.equal(receipt.sourceBinding.probeQuerySha256, hash(SECASSIGNMENT_SOURCE_PROBE_SQL));
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u);
});

test("confirms many-to-one only when repeated person keys still resolve exactly once", () => {
  const receipt = build({
    ...oneToOneFacts,
    personRows: 3,
    personNullRows: 0,
    personBlankRows: 0,
    personNonBlankRows: 3,
    personDistinctNonBlankKeys: 2,
    personDuplicateValueGroups: 1,
    personRepeatedValueRows: 2,
    personOneMatchRows: 3,
  });
  assert.equal(receipt.decision, "SOURCE_RELATION_MANY_TO_ONE_READY");
  assert.equal(receipt.relationshipCardinality, "many_to_one");
  assert.equal(receipt.relationReady, true);
  assert.equal(receipt.compatibilityCredit, 0);
});

test("duplicate dictionary keys expose multiple matches and HOLD", () => {
  const receipt = build({
    ...oneToOneFacts,
    dictionaryRows: 3,
    dictionaryNonBlankRows: 3,
    dictionaryDistinctNonBlankKeys: 2,
    dictionaryDuplicateKeyGroups: 1,
    dictionaryDuplicateRows: 2,
    personRows: 2,
    personNullRows: 0,
    personBlankRows: 0,
    personNonBlankRows: 2,
    personOneMatchRows: 1,
    personMultipleMatchRows: 1,
  });
  assert.equal(receipt.decision, "HOLD_DICTIONARY_KEY_NOT_UNIQUE");
  assert.equal(receipt.relationReady, false);
  assert.equal(receipt.relationshipCardinality, null);
});

test("orphan rows and distinct orphan keys are conserved and HOLD", () => {
  const receipt = build({
    ...oneToOneFacts,
    personZeroMatchRows: 1,
    personOneMatchRows: 1,
    personOrphanDistinctKeys: 1,
  });
  assert.equal(receipt.decision, "HOLD_ORPHAN_OR_AMBIGUOUS_MATCH");
  assert.equal(receipt.reasonCode, "PERSON_RELATION_NOT_EXACTLY_ONE");
  assert.equal(receipt.safeFacts.personZeroMatchRows, 1);
  assert.equal(receipt.safeFacts.personOrphanDistinctKeys, 1);
});

test("observed person values wider than the dictionary HOLD even when source varchar allows them", () => {
  const receipt = build({
    ...oneToOneFacts,
    dictionaryRows: 1,
    dictionaryNonBlankRows: 1,
    dictionaryDistinctNonBlankKeys: 1,
    dictionaryMaxObservedLength: 12,
    personRows: 1,
    personNullRows: 0,
    personBlankRows: 0,
    personNonBlankRows: 1,
    personDistinctNonBlankKeys: 1,
    personZeroMatchRows: 1,
    personOneMatchRows: 0,
    personOrphanDistinctKeys: 1,
    personOverDictionaryWidthRows: 1,
    personMaxObservedLength: 31,
  });
  assert.equal(receipt.decision, "HOLD_LENGTH_UNSAFE");
  assert.equal(receipt.relationReady, false);
});

test("empty tables and all-empty fields remain explicit rather than disappearing", () => {
  const empty = Object.fromEntries(contract.aggregateFields.map(field => [field, 0]));
  const emptyReceipt = build(empty);
  assert.equal(emptyReceipt.decision, "HOLD_EMPTY_TABLE");
  assert.deepEqual(emptyReceipt.safeFacts, empty);

  const allPersonEmpty = {
    ...oneToOneFacts,
    personRows: 2,
    personNullRows: 1,
    personBlankRows: 1,
    personNonBlankRows: 0,
    personDistinctNonBlankKeys: 0,
    personOneMatchRows: 0,
    personMaxObservedLength: 0,
  };
  const allEmptyReceipt = build(allPersonEmpty);
  assert.equal(allEmptyReceipt.decision, "HOLD_PERSON_FIELD_ALL_EMPTY");
  assert.equal(allEmptyReceipt.safeFacts.personRows, 2);
  assert.equal(allEmptyReceipt.safeFacts.personNullRows + allEmptyReceipt.safeFacts.personBlankRows, 2);
});

test("catalog drift, non-minimum authority, inconsistent counts, and compatibility promotion fail closed", () => {
  const assertCode = (callback, code) => assert.throws(callback, error => error instanceof LegacySecassignmentSourceProbeError && error.code === code);
  assertCode(() => build(oneToOneFacts, contract, { catalog: [{ ...catalog[0], maxLength: 49 }, catalog[1]] }), "SECASSIGNMENT_SOURCE_PROBE_CATALOG_INVALID");
  assertCode(() => build(oneToOneFacts, contract, { authority: { ...authority, insert: true } }), "SECASSIGNMENT_SOURCE_PROBE_AUTHORITY_INVALID");
  assertCode(() => build({ ...oneToOneFacts, personOneMatchRows: 3 }), "SECASSIGNMENT_SOURCE_PROBE_AGGREGATE_INVALID");
  assertCode(() => build(oneToOneFacts, { ...contract, compatibilityCredit: 1 }), "SECASSIGNMENT_SOURCE_PROBE_CONTRACT_INVALID");
  assertCode(() => build(oneToOneFacts, contract, { databaseReadOnly: false }), "SECASSIGNMENT_SOURCE_PROBE_AUTHORITY_INVALID");
});

test("probe SQL and receipt expose only schema identity and anonymous aggregates", () => {
  assert.doesNotMatch(SECASSIGNMENT_SOURCE_PROBE_SQL, /SELECT\s+(?:p|d)?\.?secassignment\s+AS/iu);
  assert.doesNotMatch(SECASSIGNMENT_SOURCE_PROBE_SQL, /\b(?:INSERT\s+INTO|UPDATE\s+dbo\.|DELETE\s+FROM|MERGE\s+INTO|EXEC(?:UTE)?\s+)\b/iu);
  assert.doesNotMatch(SECASSIGNMENT_SOURCE_PROBE_SQL, /password|credential|idcard|person\.name/iu);
  const serialized = JSON.stringify(build());
  assert.doesNotMatch(serialized, /"(?:sourceValue|employeeName|personName|personCode|absolutePath|credential|password)"\s*:/iu);
  assert.equal(JSON.parse(serialized).containsCredentials, false);

  const result = spawnSync(process.execPath, [scriptPath, "--print-read-only-sql"], { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), SECASSIGNMENT_SOURCE_PROBE_SQL);
});
