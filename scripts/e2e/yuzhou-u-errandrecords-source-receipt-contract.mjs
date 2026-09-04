/* global structuredClone */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import {
  U_ERRANDRECORDS_SAFE_AGGREGATE_SQL,
  captureUErrandrecordsSourceReceipt,
  createDefaultUErrandrecordsSourceProbe,
  sealUErrandrecordsSourceReceipt,
  validateUErrandrecordsSourceReceipt,
  verifyUErrandrecordsSourceReceiptFile,
} from "../hr-cutover/u-errandrecords-source-receipt.mjs";

const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha = (character) => character.repeat(64);
const root = resolve(import.meta.dirname, "../..");
const offlineGate = JSON.parse(
  readFileSync(
    resolve(root, "scripts/hr-cutover/contracts/legacy-u-errandrecords-source-receipt-gate-v1.json"),
    "utf8",
  ),
);

function baseBody() {
  return {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_u_errandrecords_safe_source_receipt",
    sourceRestoreReceiptSha256: sha("1"),
    sourceCatalogSha256: sha("2"),
    mappingContractSha256: sha("3"),
    databaseIdentitySha256: sha("4"),
    queryIdentitySha256: sha("5"),
    operationMode: "read_only_aggregate",
    sourceObject: {
      schema: "dbo",
      table: "errand",
      totalRows: 10,
      matchedInnerJoinRows: 7,
      missingPersonRows: 2,
      missingDepartmentRows: 1,
      omittedInnerJoinRows: 3,
    },
    columns: {
      startdate: { sqlType: "smalldatetime", nullable: false },
      enddate: { sqlType: "smalldatetime", nullable: false },
      days: { sqlType: "int", nullable: true },
    },
    serverTimezone: {
      currentUtcOffsetMinutes: 480,
      metadataSource: "SYSDATETIMEOFFSET",
      interpretationStatus: "current_offset_only_requires_business_review",
    },
    sourceState: { readOnly: true },
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: false,
      dbDatareader: true,
      viewDefinition: true,
      insert: false,
      update: false,
      delete: false,
      execute: false,
    },
    productionImport: "HOLD",
  };
}

test("u_errandrecords safe receipt is canonical, aggregate-only, and fail-closed", () => {
  const receipt = sealUErrandrecordsSourceReceipt(baseBody());
  assert.deepEqual(validateUErrandrecordsSourceReceipt(receipt), receipt);
  assert.equal(receipt.canonicalSha256, sealUErrandrecordsSourceReceipt(baseBody()).canonicalSha256);

  const missingTimezone = structuredClone(receipt);
  delete missingTimezone.serverTimezone;
  assert.throws(() => validateUErrandrecordsSourceReceipt(missingTimezone));

  const countMismatch = baseBody();
  countMismatch.sourceObject.totalRows = 11;
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(countMismatch),
    /U_ERRANDRECORDS_SOURCE_COUNT_MISMATCH/u,
  );

  const typeDrift = baseBody();
  typeDrift.columns.startdate.sqlType = "datetime";
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(typeDrift),
    /U_ERRANDRECORDS_SOURCE_COLUMN_DRIFT/u,
  );
  const daysDrift = baseBody();
  daysDrift.columns.days.nullable = false;
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(daysDrift),
    /U_ERRANDRECORDS_SOURCE_COLUMN_DRIFT/u,
  );

  const unsafe = baseBody();
  unsafe.productionImport = "READY";
  assert.throws(() => sealUErrandrecordsSourceReceipt(unsafe));

  const elevated = baseBody();
  elevated.etlAuthority.update = true;
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(elevated),
    /U_ERRANDRECORDS_ETL_AUTHORITY_INVALID/u,
  );

  const emitted = JSON.stringify(receipt);
  for (const forbidden of [
    "employeeCode",
    "employeeName",
    "personValue",
    "startValue",
    "endValue",
    "credential",
    "password",
    "sourceSql",
  ]) {
    assert.doesNotMatch(emitted, new RegExp(forbidden, "iu"));
  }
});

test("offline gate cannot promote an unbound live SQL Server receipt", () => {
  assert.equal(offlineGate.contractKind, "yuzhou_hr_u_errandrecords_source_receipt_offline_gate");
  assert.equal(offlineGate.artifactKind, "yuzhou_hr_u_errandrecords_safe_source_receipt");
  assert.equal(offlineGate.operationMode, "read_only_aggregate");
  assert.equal(offlineGate.sourceObject, "dbo.errand");
  assert.equal(offlineGate.liveSqlServerReceiptRequired, true);
  assert.equal(offlineGate.liveVerificationStatus, "GAP_LIVE_SQLSERVER_RECEIPT_NOT_BOUND");
  assert.equal(offlineGate.compatibilityCredit, 0);
  assert.equal(offlineGate.containsSourceRows, false);
  assert.equal(offlineGate.containsPersonalData, false);
  assert.equal(offlineGate.productionImport, "HOLD");
  assert.deepEqual(offlineGate.requiredCounts, [
    "totalRows",
    "matchedInnerJoinRows",
    "missingPersonRows",
    "missingDepartmentRows",
    "omittedInnerJoinRows",
  ]);
  assert.deepEqual(offlineGate.requiredColumns, baseBody().columns);
});

test("read-only and least-privilege authority failures are rejected independently", () => {
  const writableSource = baseBody();
  writableSource.sourceState.readOnly = false;
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(writableSource),
    /U_ERRANDRECORDS_SOURCE_NOT_READ_ONLY/u,
  );

  const unsafeAuthorities = [
    ["loginSucceeded", false],
    ["sysadmin", true],
    ["dbDatareader", false],
    ["viewDefinition", false],
    ["insert", true],
    ["update", true],
    ["delete", true],
    ["execute", true],
  ];
  for (const [field, value] of unsafeAuthorities) {
    const body = baseBody();
    body.etlAuthority[field] = value;
    assert.throws(
      () => sealUErrandrecordsSourceReceipt(body),
      /U_ERRANDRECORDS_ETL_AUTHORITY_INVALID/u,
      field,
    );
  }
  assert.deepEqual(offlineGate.requiredAuthority, baseBody().etlAuthority);
  assert.deepEqual(offlineGate.requiredSourceState, baseBody().sourceState);
});

test("timezone evidence is bounded current-offset metadata and never historical inference", () => {
  for (const offset of [-840, 0, 840]) {
    const body = baseBody();
    body.serverTimezone.currentUtcOffsetMinutes = offset;
    assert.equal(sealUErrandrecordsSourceReceipt(body).serverTimezone.currentUtcOffsetMinutes, offset);
  }
  for (const offset of [-841, 841, 1.5]) {
    const body = baseBody();
    body.serverTimezone.currentUtcOffsetMinutes = offset;
    assert.throws(
      () => sealUErrandrecordsSourceReceipt(body),
      /U_ERRANDRECORDS_SOURCE_TIMEZONE_INVALID/u,
    );
  }
  for (const [field, value] of [
    ["metadataSource", "fixed_offset"],
    ["interpretationStatus", "historical_timezone_verified"],
  ]) {
    const body = baseBody();
    body.serverTimezone[field] = value;
    assert.throws(
      () => sealUErrandrecordsSourceReceipt(body),
      /U_ERRANDRECORDS_SOURCE_TIMEZONE_INVALID/u,
    );
  }
  assert.equal(offlineGate.timezoneEvidence.historicalTimezoneInferred, false);
});

test("join-null counts conserve all source rows without overlapping missing categories", () => {
  const cases = [
    { totalRows: 10, matchedInnerJoinRows: 10, missingPersonRows: 0, missingDepartmentRows: 0, omittedInnerJoinRows: 0 },
    { totalRows: 10, matchedInnerJoinRows: 0, missingPersonRows: 10, missingDepartmentRows: 0, omittedInnerJoinRows: 10 },
    { totalRows: 10, matchedInnerJoinRows: 0, missingPersonRows: 0, missingDepartmentRows: 10, omittedInnerJoinRows: 10 },
  ];
  for (const sourceObject of cases) {
    const body = baseBody();
    body.sourceObject = { schema: "dbo", table: "errand", ...sourceObject };
    assert.deepEqual(sealUErrandrecordsSourceReceipt(body).sourceObject, body.sourceObject);
  }

  const overlappingMissingCategories = baseBody();
  overlappingMissingCategories.sourceObject.missingDepartmentRows = 2;
  assert.throws(
    () => sealUErrandrecordsSourceReceipt(overlappingMissingCategories),
    /U_ERRANDRECORDS_SOURCE_COUNT_MISMATCH/u,
  );
  assert.deepEqual(offlineGate.conservationRules, [
    "omittedInnerJoinRows=missingPersonRows+missingDepartmentRows",
    "totalRows=matchedInnerJoinRows+omittedInnerJoinRows",
  ]);
});

test("u_errandrecords capture binds restore/catalog/mapping and calls one aggregate probe", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "u-errand-source-receipt-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const databaseAlias = "YuzhouHR_Lab_contract01";
  const sourceRestoreReceipt = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: sha("a"),
    backup: {
      sha256: sha("a"),
      bytes: 365,
      containerCopySha256: sha("a"),
      containerCopyBytes: 365,
    },
    identities: {
      containerSha256: sha("b"),
      imageSha256: sha("c"),
      databaseSha256: digest(databaseAlias),
      restoreSha256: sha("d"),
      catalogSha256: sha("e"),
    },
    state: { online: true, readOnly: true },
    etlAuthority: {
      loginSucceeded: true,
      sysadmin: false,
      dbDatareader: true,
      viewDefinition: true,
      insert: false,
      update: false,
      delete: false,
      execute: false,
    },
    productionImport: "HOLD",
  });
  const sourceReceiptPath = resolve(directory, "source-restore.json");
  const sourceReceiptRaw = canonical(sourceRestoreReceipt);
  writeFileSync(sourceReceiptPath, sourceReceiptRaw, { mode: 0o600 });
  chmodSync(sourceReceiptPath, 0o600);

  const mappingPath = resolve(directory, "mapping.json");
  const mappingRaw = canonical({
    mappingKind: "yuzhou_hr_u_errandrecords_modern_equivalence",
    canonicalFamily: "u_errandrecords",
    modernContract: { legacyStorageBinding: { sourceTable: "dbo.errand" } },
    productionImport: "HOLD",
  });
  writeFileSync(mappingPath, mappingRaw);
  const outputPath = resolve(directory, "u-errandrecords-source.json");

  let probeCalls = 0;
  const result = captureUErrandrecordsSourceReceipt(
    {
      sourceRestoreReceiptPath: sourceReceiptPath,
      sourceRestoreReceiptSha256: digest(sourceReceiptRaw),
      mappingContractPath: mappingPath,
      sourceContainer: "contract-source",
      databaseAlias,
      receiptPath: outputPath,
    },
    {
      probe: {
        inspectAggregate() {
          probeCalls += 1;
          return {
            totalRows: 10,
            matchedInnerJoinRows: 7,
            missingPersonRows: 2,
            missingDepartmentRows: 1,
            startSqlType: "smalldatetime",
            startNullable: false,
            endSqlType: "smalldatetime",
            endNullable: false,
            daysSqlType: "int",
            daysNullable: true,
            serverUtcOffsetMinutes: 480,
            databaseReadOnly: true,
            databaseIdentity: databaseAlias,
            etlAuthority: {
              loginSucceeded: true,
              sysadmin: false,
              dbDatareader: true,
              viewDefinition: true,
              insert: false,
              update: false,
              delete: false,
              execute: false,
            },
          };
        },
      },
    },
  );
  assert.equal(probeCalls, 1);
  assert.equal(result.receipt.sourceRestoreReceiptSha256, digest(sourceReceiptRaw));
  assert.equal(result.receipt.sourceCatalogSha256, sha("e"));
  assert.equal(result.receipt.mappingContractSha256, digest(mappingRaw));
  assert.equal(result.receipt.sourceObject.omittedInnerJoinRows, 3);
  assert.equal(result.receipt.productionImport, "HOLD");

  const verified = verifyUErrandrecordsSourceReceiptFile({
    receiptPath: outputPath,
    receiptSha256: digest(readFileSync(outputPath)),
    sourceRestoreReceiptSha256: digest(sourceReceiptRaw),
    mappingContractSha256: digest(mappingRaw),
  });
  assert.equal(verified.receiptSha256, result.receiptSha256);
});

test("u_errandrecords SQL uses one read-only aggregate projection without source values", () => {
  assert.equal((U_ERRANDRECORDS_SAFE_AGGREGATE_SQL.match(/\bSELECT\b/gu) ?? []).length, 2);
  for (const expected of [
    "COUNT_BIG(*)",
    "LEFT JOIN dbo.person p ON p.person=e.person",
    "LEFT JOIN dbo.departmentcode d ON d.department=p.department",
    "sys.columns",
    "TYPE_NAME(start_column.user_type_id)",
    "TYPE_NAME(days_column.user_type_id)",
    "SYSDATETIMEOFFSET()",
    "DATEPART(TZOFFSET,SYSDATETIMEOFFSET())",
    "is_read_only",
    "IS_SRVROLEMEMBER('sysadmin')",
    "IS_ROLEMEMBER('db_datareader')",
    "HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT')",
    "FROM dbo.errand e",
    "FROM sys.databases sd",
  ]) {
    assert.match(U_ERRANDRECORDS_SAFE_AGGREGATE_SQL, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const forbidden of [
    /(?:^|;)\s*INSERT\b/imu,
    /(?:^|;)\s*UPDATE\b/imu,
    /(?:^|;)\s*DELETE\b/imu,
    /(?:^|;)\s*EXEC(?:UTE)?\b/imu,
    /SELECT\s+e\.person/iu,
    /SELECT\s+p\.name/iu,
    /SELECT\s+e\.startdate/iu,
    /SELECT\s+e\.enddate/iu,
    /SELECT\s+\*/iu,
    /COUNT_BIG\(e\.person\)/iu,
    /\b(?:CREATE|ALTER|DROP|TRUNCATE|MERGE|GRANT|REVOKE|DENY)\b/iu,
  ]) {
    assert.doesNotMatch(U_ERRANDRECORDS_SAFE_AGGREGATE_SQL, forbidden);
  }
  assert.match(
    U_ERRANDRECORDS_SAFE_AGGREGATE_SQL,
    /p\.person IS NOT NULL AND d\.department IS NULL/iu,
  );
  assert.doesNotMatch(U_ERRANDRECORDS_SAFE_AGGREGATE_SQL, /\b480\b/u);
  assert.equal(offlineGate.outputPolicy, "aggregate_counts_types_authority_state_hashes_only");
});

test("verifier emits no verified status without a bound private receipt", () => {
  const verifier = resolve(root, "scripts/hr-cutover/verify-u-errandrecords-source-receipt.mjs");
  const result = spawnSync(process.execPath, [verifier], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /^U_ERRANDRECORDS_SOURCE_VERIFY_ARGUMENT_MISSING\n$/u);
});

test("missing private inputs fail with stable receipt errors before any probe", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "u-errand-source-missing-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const missing = resolve(directory, "missing.json");
  assert.throws(
    () => createDefaultUErrandrecordsSourceProbe({ etlEnvFile: missing }),
    (error) => error?.code === "U_ERRANDRECORDS_SOURCE_FILE_UNSAFE",
  );
  let probeCalls = 0;
  assert.throws(
    () =>
      captureUErrandrecordsSourceReceipt(
        {
          sourceRestoreReceiptPath: missing,
          sourceRestoreReceiptSha256: sha("1"),
          mappingContractPath: resolve(directory, "also-missing.json"),
          sourceContainer: "contract-source",
          databaseAlias: "YuzhouHR_Lab_contract01",
          receiptPath: resolve(directory, "receipt.json"),
        },
        { probe: { inspectAggregate() { probeCalls += 1; } } },
      ),
    (error) => error?.code === "U_ERRANDRECORDS_SOURCE_FILE_UNSAFE",
  );
  assert.equal(probeCalls, 0);
});

test("collector passes password only through SQLCMDPASSWORD stdin and never -P", () => {
  const collector = readFileSync(
    resolve(root, "scripts/hr-cutover/u-errandrecords-source-receipt.mjs"),
    "utf8",
  );
  const verifier = readFileSync(
    resolve(root, "scripts/hr-cutover/verify-u-errandrecords-source-receipt.mjs"),
    "utf8",
  );
  for (const expected of [
    "SQLCMDPASSWORD",
    "YUZHOU_SQLSERVER_ETL_LOGIN",
    "YUZHOU_SQLSERVER_ETL_PASSWORD",
    "read_only_aggregate",
    "productionImport: \"HOLD\"",
  ]) {
    assert.match(collector, new RegExp(expected));
  }
  assert.doesNotMatch(collector, /["']-P["']/u);
  assert.doesNotMatch(verifier, /console\.log\([^)]*receipt/iu);
});
