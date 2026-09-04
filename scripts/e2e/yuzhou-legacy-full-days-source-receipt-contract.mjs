import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyFullDaysSourceReceipt,
  LEGACY_FULL_DAYS_CATALOG_SQL,
  LegacyFullDaysSourceReceiptError,
  validateLegacyFullDaysSourceReceipt,
} from "../hr-cutover/legacy-full-days-source-receipt-probe.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-full-days-source-receipt-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const fixedSha = (character) => character.repeat(64);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
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
    dynamicExecutionTokenObserved: false,
    mutationTokenObserved: false,
  },
  inputCatalog: { count: 3, signatureSha256: fixedSha("e") },
  outputCatalog: { exists: true, signatureSha256: fixedSha("f") },
  dependencyCatalog: {
    count: 2,
    identitySetSha256: fixedSha("a"),
    tableCount: 2,
    emptyTableCount: 0,
    totalRows: 14,
  },
  emptyPathCatalog: {
    calledRoutineCount: 0,
    calledRoutineSetSha256: fixedSha("b"),
    nullGuardTokenObserved: false,
    conditionalBranchTokenObserved: true,
  },
  ...overrides,
});
const build = ({ origin = "synthetic_contract_test", sourceEvidence = evidence() } = {}) =>
  buildLegacyFullDaysSourceReceipt({
    contract: contract(),
    repositoryRoot: root,
    sourceRestoreReceiptSha256: fixedSha("1"),
    databaseIdentitySha256: fixedSha("2"),
    evidenceOrigin: origin,
    evidence: sourceEvidence,
  });
const rejects = (code, action) =>
  assert.throws(
    action,
    (error) => error instanceof LegacyFullDaysSourceReceiptError && error.code === code,
  );

test("FullDays is the selected read-only attendance function in the 212-routine ledger", () => {
  const source = contract().sourceEvidence;
  const ledgerBytes = readFileSync(resolve(root, source.routineLedger.path));
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  assert.equal(ledger.summary.sourceRoutines, 212);
  assert.equal(sha(ledgerBytes), source.routineLedger.sha256);
  const row = ledger.routines.find((item) => item.routineId === source.routine.routineId);
  assert.equal(row.kind, "function");
  assert.equal(row.primaryDomain, "attendance_leave");
  assert.equal(row.parityRisk, "medium");
  assert.equal(row.parameters.length, 3);
  assert.equal(row.readTables.length, 2);
  assert.equal(row.writeTables.length, 0);
  assert.equal(row.dynamicWriteTables.length, 0);
  assert.equal(row.calledRoutines.length, 0);
  assert.equal(row.dynamicMutationStatus, "none");
  assert.deepEqual(row.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 });
});

test("synthetic and live catalog receipts remain zero-credit semantic parity gaps", () => {
  const synthetic = build();
  assert.equal(synthetic.status, "SOURCE_RECEIPT_PENDING_LIVE_PROBE");
  assert.equal(synthetic.sourceCatalogStatus, "pending_live_read_only_capture");
  assert.equal(synthetic.compatibilityCredit, 0);
  assert.equal(synthetic.productionImport, "HOLD");
  assert.deepEqual(validateLegacyFullDaysSourceReceipt(synthetic, { contract: contract(), repositoryRoot: root }), synthetic);

  const live = build({ origin: "live_read_only_catalog_probe" });
  assert.equal(live.status, "SOURCE_CATALOG_CAPTURED_SEMANTIC_PARITY_PENDING");
  assert.deepEqual(live.gapCodes, ["FULL_DAYS_SEMANTIC_PARITY_PENDING"]);
  assert.equal(live.compatibilityCredit, 0);
  assert.deepEqual(validateLegacyFullDaysSourceReceipt(live, { contract: contract(), repositoryRoot: root }), live);
});

test("catalog SQL hashes identities and never exports or executes legacy logic", () => {
  assert.match(LEGACY_FULL_DAYS_CATALOG_SQL, /sys\.objects/u);
  assert.match(LEGACY_FULL_DAYS_CATALOG_SQL, /sys\.parameters/u);
  assert.match(LEGACY_FULL_DAYS_CATALOG_SQL, /sys\.sql_expression_dependencies/u);
  assert.match(LEGACY_FULL_DAYS_CATALOG_SQL, /sys\.partitions/u);
  assert.match(LEGACY_FULL_DAYS_CATALOG_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.doesNotMatch(LEGACY_FULL_DAYS_CATALOG_SQL, /SELECT\s+routine_module\.definition/iu);
  assert.doesNotMatch(
    LEGACY_FULL_DAYS_CATALOG_SQL,
    /(?:INSERT\s+INTO|UPDATE\s+(?:dbo\.|\[)|DELETE\s+FROM|MERGE\s+INTO|EXEC(?:UTE)?\s+dbo\.|sp_executesql\s+N)/iu,
  );
  const receipt = build();
  assert.equal(receipt.legacyRoutineExecuted, false);
  assert.equal(receipt.legacyDynamicSqlExecuted, false);
  assert.equal(receipt.moduleBodyIncluded, false);
  assert.equal(receipt.parameterValuesIncluded, false);
  assert.equal(receipt.dependencyRowValuesIncluded, false);
});

test("zero and empty paths remain explicit without excluding the routine", () => {
  const empty = build({
    sourceEvidence: evidence({
      dependencyCatalog: {
        count: 2,
        identitySetSha256: fixedSha("a"),
        tableCount: 2,
        emptyTableCount: 2,
        totalRows: 0,
      },
      emptyPathCatalog: {
        calledRoutineCount: 0,
        calledRoutineSetSha256: fixedSha("b"),
        nullGuardTokenObserved: false,
        conditionalBranchTokenObserved: false,
      },
    }),
  });
  assert.equal(empty.dependencyCatalog.emptyTableCount, 2);
  assert.equal(empty.dependencyCatalog.totalRows, 0);
  assert.equal(empty.emptyPathCatalog.calledRoutineCount, 0);
  assert.equal(empty.ledgerMatch.calledRoutineCount, true);
  assert.equal(empty.compatibilityCredit, 0);
});

test("writable authority unsafe body flags ledger mismatch and self-promotion fail closed", () => {
  const writable = evidence();
  writable.authority.update = true;
  rejects("FULL_DAYS_AUTHORITY_INVALID", () => build({ sourceEvidence: writable }));

  const dynamic = evidence();
  dynamic.routineCatalog.dynamicExecutionTokenObserved = true;
  rejects("FULL_DAYS_EVIDENCE_INVALID", () => build({ sourceEvidence: dynamic }));

  const invalidEmptyCount = evidence();
  invalidEmptyCount.dependencyCatalog.emptyTableCount = 3;
  rejects("FULL_DAYS_EVIDENCE_INVALID", () => build({ sourceEvidence: invalidEmptyCount }));

  const promoted = build();
  promoted.status = "VERIFIED";
  promoted.compatibilityCredit = 1;
  const { receiptSha256: ignored, ...body } = promoted;
  promoted.receiptSha256 = sha(canonical(body));
  assert.equal(typeof ignored, "string");
  rejects("FULL_DAYS_RECEIPT_INVALID", () =>
    validateLegacyFullDaysSourceReceipt(promoted, { contract: contract(), repositoryRoot: root }),
  );
});

test("receipt contains no body parameter values dependency values credentials or personal data", () => {
  const serialized = JSON.stringify(build());
  assert.doesNotMatch(
    serialized,
    /"(?:password|credential|token|definitionText|parameterValue|employeeName|employeeCode|personId|idcard)"\s*:|\/Users\/|Downloads\//iu,
  );
  assert.equal(JSON.parse(serialized).containsPersonalData, false);
});
