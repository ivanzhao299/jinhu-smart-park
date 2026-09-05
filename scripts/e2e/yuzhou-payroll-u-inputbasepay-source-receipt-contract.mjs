#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  buildSyntheticPayrollUInputbasepaySourceReceipt,
  capturePayrollUInputbasepaySourceReceipt,
  assertPayrollUInputbasepaySourceContainerBinding,
  PAYROLL_U_INPUTBASEPAY_CATALOG_SQL,
  PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL,
  PayrollUInputbasepaySourceReceiptError,
  validatePayrollUInputbasepaySourceReceipt,
  verifyPayrollUInputbasepaySourceReceiptFile,
} from "../hr-cutover/payroll-u-inputbasepay-source-receipt.mjs";
import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const contractPath = resolve(
  repositoryRoot,
  "scripts/hr-cutover/contracts/legacy-u-inputbasepay-source-receipt-v1.json",
);
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const fixedSha = (character) => character.repeat(64);
const rejects = (code, action) => assert.throws(
  action,
  (error) => error instanceof PayrollUInputbasepaySourceReceiptError && error.code === code,
);
const readonlyAuthority = () => ({
  loginSucceeded: true,
  sysadmin: false,
  dbDatareader: true,
  viewDefinition: true,
  insert: false,
  update: false,
  delete: false,
  execute: false,
});
const column = (overrides = {}) => ({
  exists: true,
  sqlType: "money",
  maxLength: 8,
  precision: 19,
  scale: 4,
  nullable: true,
  computed: false,
  ...overrides,
});
const absentColumn = () => ({
  exists: false,
  sqlType: null,
  maxLength: null,
  precision: null,
  scale: null,
  nullable: null,
  computed: null,
});
const evidence = (overrides = {}) => ({
  databaseIdentity: "YuzhouHR_Lab_source1",
  databaseReadOnly: true,
  authority: readonlyAuthority(),
  sourceObject: {
    schema: "dbo",
    table: "person",
    exists: true,
    identityColumnName: "person",
    valueColumnName: "_base",
    identityColumn: column({ sqlType: "varchar", maxLength: 30, precision: 0, scale: 0, nullable: false }),
    valueColumn: column(),
  },
  routineCatalog: {
    exists: true,
    definitionSha256: fixedSha("d"),
    dynamicExecutionObserved: true,
    mutationVerbObserved: true,
    personTokenObserved: true,
    sourceFieldTokenObserved: true,
  },
  valueAggregate: { totalRows: 3, nonNullRows: 2, nullRows: 1 },
  ...overrides,
});
const build = (sourceEvidence = evidence()) => buildSyntheticPayrollUInputbasepaySourceReceipt({
  contract: contract(),
  repositoryRoot,
  sourceRestoreReceiptSha256: fixedSha("a"),
  sourceCatalogSha256: fixedSha("b"),
  databaseIdentitySha256: fixedSha("c"),
  evidence: sourceEvidence,
});

test("synthetic catalog evidence preserves exact type/nullability but can never verify source identity", () => {
  const receipt = build();
  assert.equal(receipt.evidenceOrigin, "synthetic_contract_test");
  assert.equal(receipt.catalogDisposition, "source_catalog_identity_observed");
  assert.equal(receipt.sourceIdentityStatus, "pending");
  assert.equal(receipt.sourceIdentityReason, "synthetic_evidence_not_authoritative");
  assert.deepEqual(receipt.sourceObject.valueColumn, column());
  assert.deepEqual(receipt.sourceObject.valueAggregate, { totalRows: 3, nonNullRows: 2, nullRows: 1 });
  assert.deepEqual(receipt.gapCodes, [
    "PAYROLL_U_INPUTBASEPAY_SOURCE_FIELD_IDENTITY_UNPROVEN",
    "PAYROLL_U_INPUTBASEPAY_DYNAMIC_WRITE_SIDE_EFFECT_UNRESOLVED",
    "PAYROLL_U_INPUTBASEPAY_MODERN_TARGET_EQUIVALENCE_UNPROVEN",
  ]);
  assert.equal(receipt.status, "SOURCE_IDENTITY_PENDING");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.deepEqual(validatePayrollUInputbasepaySourceReceipt(receipt, { contract: contract(), repositoryRoot }), receipt);
});

test("missing table and missing source field remain distinct pending catalog paths", () => {
  const missingTable = build(evidence({
    sourceObject: {
      schema: "dbo",
      table: "person",
      exists: false,
      identityColumnName: "person",
      valueColumnName: "_base",
      identityColumn: absentColumn(),
      valueColumn: absentColumn(),
    },
    valueAggregate: null,
  }));
  assert.equal(missingTable.catalogDisposition, "source_table_absent");
  assert.equal(missingTable.sourceIdentityStatus, "pending");

  const missingField = build(evidence({
    sourceObject: {
      ...evidence().sourceObject,
      valueColumn: absentColumn(),
    },
    valueAggregate: null,
  }));
  assert.equal(missingField.catalogDisposition, "source_value_column_absent");
  assert.equal(missingField.sourceIdentityStatus, "pending");
});

test("empty table, all-null source field, and nonnumeric type remain pending without guessing", () => {
  const empty = build(evidence({ valueAggregate: { totalRows: 0, nonNullRows: 0, nullRows: 0 } }));
  assert.equal(empty.catalogDisposition, "source_table_empty");

  const allNull = build(evidence({ valueAggregate: { totalRows: 3, nonNullRows: 0, nullRows: 3 } }));
  assert.equal(allNull.catalogDisposition, "source_value_column_all_null");

  const textCandidate = build(evidence({
    sourceObject: {
      ...evidence().sourceObject,
      valueColumn: column({ sqlType: "varchar", maxLength: 30, precision: 0, scale: 0 }),
    },
  }));
  assert.equal(textCandidate.catalogDisposition, "source_value_type_requires_review");
  for (const receipt of [empty, allNull, textCandidate]) {
    assert.equal(receipt.sourceIdentityStatus, "pending");
    assert.equal(receipt.decision, "KEEP_PENDING");
    assert.equal(receipt.compatibilityCredit, 0);
  }
});

test("routine absence and unobserved dynamic-write signature cannot be promoted", () => {
  const absentRoutine = build(evidence({
    routineCatalog: {
      exists: false,
      definitionSha256: null,
      dynamicExecutionObserved: null,
      mutationVerbObserved: null,
      personTokenObserved: null,
      sourceFieldTokenObserved: null,
    },
  }));
  assert.equal(absentRoutine.catalogDisposition, "source_routine_absent");

  const noMutationSignature = build(evidence({
    routineCatalog: { ...evidence().routineCatalog, mutationVerbObserved: false },
  }));
  assert.equal(noMutationSignature.catalogDisposition, "source_routine_dynamic_write_signature_unobserved");
  assert.equal(noMutationSignature.dynamicSqlReviewStatus, "unexecuted_pending_review");
  assert.equal(noMutationSignature.legacyRoutineExecuted, false);
  assert.equal(noMutationSignature.legacyDynamicSqlExecuted, false);
});

test("queries expose only catalog metadata and row/null aggregates while source mutation authority is denied", () => {
  assert.match(PAYROLL_U_INPUTBASEPAY_CATALOG_SQL, /sys\.columns/u);
  assert.match(PAYROLL_U_INPUTBASEPAY_CATALOG_SQL, /sys\.sql_modules/u);
  assert.match(PAYROLL_U_INPUTBASEPAY_CATALOG_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.match(PAYROLL_U_INPUTBASEPAY_CATALOG_SQL, /HAS_PERMS_BY_NAME\(DB_NAME\(\),'DATABASE','UPDATE'\)/u);
  assert.match(PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL, /COUNT_BIG\(\[_base\]\)/u);
  assert.doesNotMatch(PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL, /SELECT\s+\[_base\]|SUM\s*\(|MIN\s*\(|MAX\s*\(/iu);
  assert.doesNotMatch(
    `${PAYROLL_U_INPUTBASEPAY_CATALOG_SQL}\n${PAYROLL_U_INPUTBASEPAY_VALUE_AGGREGATE_SQL}`,
    /(?:INSERT\s+INTO|UPDATE\s+(?:dbo\.|\[)|DELETE\s+FROM|MERGE\s+INTO|EXEC(?:UTE)?\s+(?:dbo\.|\[))/iu,
  );
  const receipt = build();
  assert.equal(receipt.containsPayrollValues, false);
  assert.equal(receipt.containsPersonalData, false);
  assert.doesNotMatch(JSON.stringify(receipt), /"(?:payrollValue|sourceValue|employeeId|personKey)":/iu);
});

test("live source receipt use is bound to the exact restored SQL Server container", () => {
  assert.throws(
    () => assertPayrollUInputbasepaySourceContainerBinding({
      sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1",
      expectedContainerSha256: fixedSha("e"),
      inspectContainerIdentity: () => "other-restored-container",
    }),
    (error) => error instanceof PayrollUInputbasepaySourceReceiptError
      && error.code === "PAYROLL_U_INPUTBASEPAY_SOURCE_CONTAINER_BINDING_MISMATCH",
  );
  assert.doesNotThrow(() => assertPayrollUInputbasepaySourceContainerBinding({
    sourceContainer: "jinhu_yuzhou_migration_lab-sqlserver-1",
    expectedContainerSha256: sha("bound-restored-container"),
    inspectContainerIdentity: () => "bound-restored-container",
  }));
});

test("authority, aggregate conservation, metadata, contract hashes, and receipt hash fail closed", () => {
  const writable = evidence();
  writable.authority.update = true;
  rejects("PAYROLL_U_INPUTBASEPAY_SOURCE_AUTHORITY_INVALID", () => build(writable));

  rejects("PAYROLL_U_INPUTBASEPAY_SOURCE_AGGREGATE_INVALID", () => build(evidence({
    valueAggregate: { totalRows: 3, nonNullRows: 2, nullRows: 2 },
  })));

  rejects("PAYROLL_U_INPUTBASEPAY_SOURCE_CATALOG_INVALID", () => build(evidence({
    sourceObject: {
      ...evidence().sourceObject,
      valueColumn: { ...absentColumn(), sqlType: "money" },
    },
    valueAggregate: null,
  })));

  const driftedContract = contract();
  driftedContract.sourceEvidence.routineLedger.sha256 = fixedSha("0");
  rejects("PAYROLL_U_INPUTBASEPAY_EVIDENCE_DRIFT", () => buildSyntheticPayrollUInputbasepaySourceReceipt({
    contract: driftedContract,
    repositoryRoot,
    sourceRestoreReceiptSha256: fixedSha("a"),
    sourceCatalogSha256: fixedSha("b"),
    databaseIdentitySha256: fixedSha("c"),
    evidence: evidence(),
  }));

  const tampered = build();
  tampered.productionImport = "READY";
  rejects("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_HASH_MISMATCH", () => validatePayrollUInputbasepaySourceReceipt(
    tampered,
    { contract: contract(), repositoryRoot },
  ));

  const promoted = build();
  promoted.sourceIdentityStatus = "verified";
  promoted.sourceIdentityReason = "source_catalog_identity_observed";
  promoted.status = "SOURCE_IDENTITY_VERIFIED_EQUIVALENCE_PENDING";
  promoted.gapCodes = promoted.gapCodes.slice(1);
  const { receiptSha256: ignored, ...promotedBody } = promoted;
  promoted.receiptSha256 = sha(canonical(promotedBody));
  assert.equal(typeof ignored, "string");
  rejects("PAYROLL_U_INPUTBASEPAY_SOURCE_RECEIPT_INVALID", () => validatePayrollUInputbasepaySourceReceipt(
    promoted,
    { contract: contract(), repositoryRoot },
  ));
});

test("capture marks injected probes synthetic and verifier requires a real live recheck by default", () => {
  const privateRoot = mkdtempSync(join(tmpdir(), "yuzhou-u-inputbasepay-receipt-"));
  try {
    const databaseAlias = "YuzhouHR_Lab_source1";
    const restoreReceipt = sealSourceRestoreReceipt({
      formatVersion: 1,
      artifactKind: "yuzhou_hr_source_restore_receipt",
      sourceSnapshotSha256: fixedSha("2"),
      backup: {
        sha256: fixedSha("2"),
        bytes: 1,
        containerCopySha256: fixedSha("2"),
        containerCopyBytes: 1,
      },
      identities: {
        containerSha256: fixedSha("3"),
        imageSha256: fixedSha("4"),
        databaseSha256: sha(databaseAlias),
        restoreSha256: fixedSha("5"),
        catalogSha256: fixedSha("6"),
      },
      state: { online: true, readOnly: true },
      etlAuthority: readonlyAuthority(),
      productionImport: "HOLD",
    });
    const restorePath = join(privateRoot, "source-restore.json");
    const restoreRaw = canonical(restoreReceipt);
    writeFileSync(restorePath, restoreRaw, { mode: 0o600 });
    chmodSync(restorePath, 0o600);
    const receiptPath = join(privateRoot, "u-inputbasepay-source-receipt.json");
    const injectedProbe = { inspectEvidence: () => evidence({ databaseIdentity: databaseAlias }) };
    const captured = capturePayrollUInputbasepaySourceReceipt({
      sourceRestoreReceiptPath: restorePath,
      sourceRestoreReceiptSha256: sha(restoreRaw),
      contractPath,
      repositoryRoot,
      sourceContainer: "source-container",
      databaseAlias,
      receiptPath,
    }, { probe: injectedProbe });
    assert.equal(captured.receipt.evidenceOrigin, "synthetic_contract_test");
    assert.equal(captured.receipt.sourceIdentityStatus, "pending");
    assert.equal(captured.receipt.compatibilityCredit, 0);

    const verifyInput = {
      receiptPath,
      receiptSha256: captured.receiptSha256,
      sourceRestoreReceiptPath: restorePath,
      sourceRestoreReceiptSha256: sha(restoreRaw),
      contractPath,
      repositoryRoot,
      sourceContainer: "source-container",
      databaseAlias,
    };
    const offlineVerification = verifyPayrollUInputbasepaySourceReceiptFile(
      verifyInput,
      { probe: injectedProbe, recheckLive: false },
    );
    assert.equal(offlineVerification.liveRechecked, false);
    assert.equal(offlineVerification.productionImport, "HOLD");
    rejects(
      "PAYROLL_U_INPUTBASEPAY_SOURCE_LIVE_RECHECK_REQUIRED",
      () => verifyPayrollUInputbasepaySourceReceiptFile(verifyInput, { probe: injectedProbe }),
    );
  } finally {
    rmSync(privateRoot, { recursive: true, force: true });
  }
});
