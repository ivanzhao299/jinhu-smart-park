#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildSyntheticLegacyAllDepNameSourceReceipt,
  LEGACY_ALL_DEP_NAME_CATALOG_SQL,
  LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL,
  LegacyAllDepNameSourceReceiptError,
  validateLegacyAllDepNameSourceReceipt,
} from "../hr-cutover/legacy-all-dep-name-source-receipt-probe.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-all-dep-name-source-receipt-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const fixedSha = character => character.repeat(64);
const sha = value => createHash("sha256").update(value).digest("hex");
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const authority = () => ({
  sysadmin: false,
  dbDatareader: true,
  viewDefinition: true,
  insert: false,
  update: false,
  delete: false,
  execute: false,
});
const evidence = (overrides = {}) => ({
  databaseReadOnly: true,
  authority: authority(),
  routineCatalog: {
    exists: true,
    objectType: "FN",
    definitionSha256: fixedSha("d"),
    parameterCount: 2,
    parameterSignatureSha256: fixedSha("e"),
    dynamicExecutionTokenObserved: false,
    mutationTokenObserved: false,
  },
  dependencyCatalog: {
    exists: true,
    columnCatalogSha256: fixedSha("f"),
    rowCount: 9,
  },
  ...overrides,
});
const build = sourceEvidence => buildSyntheticLegacyAllDepNameSourceReceipt({
  contract: contract(),
  repositoryRoot: root,
  sourceRestoreReceiptSha256: fixedSha("a"),
  databaseIdentitySha256: fixedSha("b"),
  evidence: sourceEvidence ?? evidence(),
});
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyAllDepNameSourceReceiptError && error.code === code,
);

test("AllDepName is bound to exactly one low-risk organization routine in the 212-row ledger", () => {
  const source = contract().sourceEvidence;
  const ledger = JSON.parse(readFileSync(resolve(root, source.routineLedger.path), "utf8"));
  assert.equal(ledger.summary.sourceRoutines, 212);
  assert.equal(sha(readFileSync(resolve(root, source.routineLedger.path))), source.routineLedger.sha256);
  const row = ledger.routines.find(item => item.routineId === source.routine.routineId);
  assert.equal(row.sourceName, "AllDepName");
  assert.equal(row.kind, "function");
  assert.equal(row.primaryDomain, "organization_position");
  assert.equal(row.businessCapability, "reference_label_or_search_helper");
  assert.deepEqual(row.readTables, ["departmentcode"]);
  assert.deepEqual(row.writeTables, []);
  assert.equal(row.dynamicMutationStatus, "none");
});

test("synthetic catalog evidence cannot become a live source receipt or earn compatibility credit", () => {
  const receipt = build();
  assert.equal(receipt.evidenceOrigin, "synthetic_contract_test");
  assert.equal(receipt.sourceCatalogStatus, "pending_live_read_only_capture");
  assert.equal(receipt.semanticParityStatus, "pending");
  assert.equal(receipt.status, "SOURCE_RECEIPT_PENDING_LIVE_PROBE");
  assert.deepEqual(receipt.gapCodes, ["ALL_DEP_NAME_LIVE_SOURCE_RECEIPT_MISSING", "ALL_DEP_NAME_SEMANTIC_PARITY_PENDING"]);
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.deepEqual(validateLegacyAllDepNameSourceReceipt(receipt, { contract: contract(), repositoryRoot: root }), receipt);
});

test("probe SQL emits catalog hashes and an anonymous count without body export or routine execution", () => {
  assert.match(LEGACY_ALL_DEP_NAME_CATALOG_SQL, /sys\.objects/u);
  assert.match(LEGACY_ALL_DEP_NAME_CATALOG_SQL, /sys\.sql_modules/u);
  assert.match(LEGACY_ALL_DEP_NAME_CATALOG_SQL, /sys\.parameters/u);
  assert.match(LEGACY_ALL_DEP_NAME_CATALOG_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.match(LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL, /COUNT_BIG\(\*\)/u);
  assert.doesNotMatch(LEGACY_ALL_DEP_NAME_CATALOG_SQL, /SELECT\s+routine_module\.definition/iu);
  assert.doesNotMatch(LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL, /SELECT\s+(?:TOP|\[|[a-z_]+\s*,)/iu);
  assert.doesNotMatch(
    `${LEGACY_ALL_DEP_NAME_CATALOG_SQL}\n${LEGACY_ALL_DEP_NAME_DEPENDENCY_AGGREGATE_SQL}`,
    /(?:INSERT\s+INTO|UPDATE\s+(?:dbo\.|\[)|DELETE\s+FROM|MERGE\s+INTO|EXEC(?:UTE)?\s+dbo\.|sp_executesql\s+N)/iu,
  );
  const receipt = build();
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.moduleBodyIncluded, false);
  assert.equal(receipt.containsPersonalData, false);
});

test("empty or absent source structures remain explicit pending paths", () => {
  const empty = build(evidence({ dependencyCatalog: { ...evidence().dependencyCatalog, rowCount: 0 } }));
  assert.equal(empty.dependencyCatalog.rowCount, 0);
  assert.equal(empty.status, "SOURCE_RECEIPT_PENDING_LIVE_PROBE");

  const absentRoutine = build(evidence({
    routineCatalog: {
      exists: false,
      objectType: null,
      definitionSha256: null,
      parameterCount: null,
      parameterSignatureSha256: null,
      dynamicExecutionTokenObserved: null,
      mutationTokenObserved: null,
    },
  }));
  assert.equal(absentRoutine.routineCatalog.exists, false);

  const absentDependency = build(evidence({
    dependencyCatalog: { exists: false, columnCatalogSha256: null, rowCount: null },
  }));
  assert.equal(absentDependency.dependencyCatalog.exists, false);
});

test("writable authority, unsafe routine signatures, ledger drift, and receipt promotion fail closed", () => {
  const writable = evidence();
  writable.authority.update = true;
  rejects("ALL_DEP_NAME_AUTHORITY_INVALID", () => build(writable));

  const dynamic = evidence();
  dynamic.routineCatalog.dynamicExecutionTokenObserved = true;
  rejects("ALL_DEP_NAME_EVIDENCE_INVALID", () => build(dynamic));

  const drifted = contract();
  drifted.sourceEvidence.routineLedger.sha256 = fixedSha("0");
  rejects("ALL_DEP_NAME_SOURCE_LEDGER_DRIFT", () => buildSyntheticLegacyAllDepNameSourceReceipt({
    contract: drifted,
    repositoryRoot: root,
    sourceRestoreReceiptSha256: fixedSha("a"),
    databaseIdentitySha256: fixedSha("b"),
    evidence: evidence(),
  }));

  const promoted = build();
  promoted.status = "VERIFIED";
  promoted.compatibilityCredit = 1;
  const { receiptSha256: ignored, ...body } = promoted;
  promoted.receiptSha256 = sha(canonical(body));
  assert.equal(typeof ignored, "string");
  rejects("ALL_DEP_NAME_RECEIPT_INVALID", () => validateLegacyAllDepNameSourceReceipt(
    promoted,
    { contract: contract(), repositoryRoot: root },
  ));
});

test("receipt contains only structural identity, hashes, booleans, and anonymous counts", () => {
  const serialized = JSON.stringify(build());
  assert.doesNotMatch(serialized, /"(?:password|credential|token|employeeName|employeeCode|personId|idcard|definitionText)"\s*:|\/Users\/|Downloads\//iu);
});
