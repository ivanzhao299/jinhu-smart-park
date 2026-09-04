/* global structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import { sealSourceRestoreReceipt } from "../hr-cutover/source-restore-receipt.mjs";
import {
  LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL,
  captureLegacyPerformancePersonSummarySourceReceipt,
  parseLegacyPerformancePersonSummaryAggregate,
  sealLegacyPerformancePersonSummarySourceReceipt,
  validateLegacyPerformancePersonSummarySourceReceipt,
} from "../hr-cutover/legacy-performance-person-summary-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const sha = (character) => character.repeat(64);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const gate = JSON.parse(
  readFileSync(
    resolve(root, "scripts/hr-cutover/contracts/legacy-performance-person-summary-source-receipt-gate-v1.json"),
    "utf8",
  ),
);
const countKeys = [
  "assessmentRows",
  "assessmentNonblankPersonRows",
  "assessmentBlankPersonRows",
  "personRows",
  "personNonblankRows",
  "matchedAssessmentRows",
  "orphanAssessmentRows",
  "orphanDistinctPersonCodes",
  "resolvedNameProjectionRows",
  "blankNameProjectionRows",
  "assessmentInvalidPersonCodeRows",
  "personInvalidPersonCodeRows",
  "assessmentLeadingSpaceRows",
  "assessmentTrailingSpaceRows",
  "personLeadingSpaceRows",
  "personTrailingSpaceRows",
  "maximumPersonCodeBytes",
  "caseFoldCollisionGroups",
  "caseFoldCollisionVariants",
  "trimCollisionGroups",
  "trimCollisionVariants",
  "normalizedCollisionGroups",
  "normalizedCollisionVariants",
  "queryablePersonCodes",
  "queryableRows",
  "queryableMatchedRows",
  "queryableOrphanRows",
  "maximumRowsPerPerson",
  "personCodesOverPage20",
  "page20TotalPages",
  "webAssProjectedRows",
  "webAssessmentQueryProjectedRows",
];
const hashKeys = [
  "sourceNameProjectionSetSha256",
  "webAssProjectionSetSha256",
  "webAssessmentQueryProjectionSetSha256",
  "paginationSetSha256",
];

function safeFacts({ equivalent = false } = {}) {
  return {
    assessmentRows: 10,
    assessmentNonblankPersonRows: 9,
    assessmentBlankPersonRows: 1,
    personRows: 8,
    personNonblankRows: 8,
    matchedAssessmentRows: 7,
    orphanAssessmentRows: 2,
    orphanDistinctPersonCodes: 1,
    resolvedNameProjectionRows: 6,
    blankNameProjectionRows: 1,
    assessmentInvalidPersonCodeRows: 1,
    personInvalidPersonCodeRows: 0,
    assessmentLeadingSpaceRows: 0,
    assessmentTrailingSpaceRows: 1,
    personLeadingSpaceRows: 0,
    personTrailingSpaceRows: 0,
    maximumPersonCodeBytes: 10,
    caseFoldCollisionGroups: 0,
    caseFoldCollisionVariants: 0,
    trimCollisionGroups: 1,
    trimCollisionVariants: 2,
    normalizedCollisionGroups: 1,
    normalizedCollisionVariants: 2,
    queryablePersonCodes: 3,
    queryableRows: 8,
    queryableMatchedRows: 6,
    queryableOrphanRows: 2,
    maximumRowsPerPerson: 4,
    personCodesOverPage20: 0,
    page20TotalPages: 3,
    webAssProjectedRows: equivalent ? 6 : 6,
    webAssessmentQueryProjectedRows: equivalent ? 6 : 8,
    sourceNameProjectionSetSha256: sha("c"),
    webAssProjectionSetSha256: equivalent ? sha("c") : sha("b"),
    webAssessmentQueryProjectionSetSha256: sha("c"),
    paginationSetSha256: sha("d"),
  };
}

function baseBody({ equivalent = false } = {}) {
  return {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_performance_person_summary_safe_source_receipt",
    sourceRestoreReceiptSha256: sha("1"),
    sourceCatalogSha256: sha("2"),
    routineContractSha256: sha("3"),
    databaseIdentitySha256: sha("4"),
    queryIdentitySha256: sha("5"),
    operationMode: "read_only_aggregate_hash_only",
    sourceObjects: {
      assessmentmaster: "dbo.assessmentmaster",
      person: "dbo.person",
    },
    safeFacts: safeFacts({ equivalent }),
    conservation: {
      assessmentPersonJoin: "PROVEN",
      nameProjection: "PROVEN",
      paginationPopulation: "PROVEN",
    },
    currentSnapshotEquivalence: {
      scope: "current_restored_source_snapshot_modern_admissible_person_codes",
      projectedRowCountEqual: equivalent,
      projectionSetHashEqual: equivalent,
      decision: equivalent
        ? "CURRENT_SOURCE_SNAPSHOT_EQUIVALENT"
        : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED",
    },
    promotionGate: {
      assessmentPopulation: "POPULATED",
      personCodeValidation: "GAPS_PRESENT",
      routineMergeDecision: equivalent
        ? "CURRENT_SNAPSHOT_ONLY_SHARED_ENDPOINT_CANDIDATE"
        : "DISTINCT_ORPHAN_SEMANTICS_REQUIRED",
      modernRuntimeComparison: "BLOCKED_SOURCE_GAPS_REQUIRE_POLICY",
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
    privacy: {
      containsSourceRows: false,
      containsPersonCodes: false,
      containsPersonNames: false,
      hashesMayDependOnPersonalValues: true,
    },
    status: "SOURCE_PERSON_SUMMARY_EVIDENCE_CAPTURED_WITH_GAPS",
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
}

function aggregateLine({ equivalent = false } = {}) {
  const facts = safeFacts({ equivalent });
  return [
    ...countKeys.map((key) => String(facts[key])),
    ...hashKeys.map((key) => facts[key]),
    "1",
    "1",
    "1",
    "0",
    "1",
    "1",
    "0",
    "0",
    "0",
    "0",
  ].join("|");
}

test("gate requires live aggregate and hash evidence without source values", () => {
  assert.equal(gate.contractKind, "yuzhou_hr_legacy_performance_person_summary_source_receipt_gate");
  assert.deepEqual(gate.sourceRoutines, ["web_ass", "web_assessmentquery"]);
  assert.equal(gate.receiptOutput, "counts_status_and_sha256_only");
  assert.equal(gate.liveSqlServerReceiptRequired, true);
  assert.equal(gate.emptyAssessmentRowsGiveBehaviorEquivalenceCredit, false);
  assert.equal(gate.containsSourceRows, false);
  assert.equal(gate.containsPersonCodes, false);
  assert.equal(gate.containsPersonNames, false);
  assert.equal(gate.compatibilityCredit, 0);
  assert.equal(gate.productionImport, "HOLD");
});

test("committed live receipt freezes the empty fact population without granting parity", () => {
  const evidencePath = resolve(
    root,
    "scripts/hr-cutover/contracts/legacy-performance-person-summary-source-receipt-evidence-v1.json",
  );
  const evidence = validateLegacyPerformancePersonSummarySourceReceipt(
    JSON.parse(readFileSync(evidencePath, "utf8")),
  );
  const routineContractBytes = readFileSync(
    resolve(root, "scripts/hr-cutover/contracts/legacy-performance-query-routine-parity-v1.json"),
  );
  assert.equal(evidence.routineContractSha256, digest(routineContractBytes));
  assert.equal(evidence.queryIdentitySha256, digest(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL));
  assert.equal(evidence.safeFacts.assessmentRows, 0);
  assert.equal(evidence.safeFacts.webAssProjectedRows, 0);
  assert.equal(evidence.safeFacts.webAssessmentQueryProjectedRows, 0);
  assert.equal(evidence.safeFacts.personInvalidPersonCodeRows, 2);
  assert.equal(evidence.currentSnapshotEquivalence.decision, "VACUOUS_EMPTY_SOURCE_POPULATION");
  assert.deepEqual(evidence.promotionGate, {
    assessmentPopulation: "EMPTY_NO_BEHAVIOR_CREDIT",
    personCodeValidation: "GAPS_PRESENT",
    routineMergeDecision: "NOT_PROVEN_EMPTY_SOURCE_POPULATION",
    modernRuntimeComparison: "BLOCKED_NO_SOURCE_FACT_ROWS",
  });
  assert.equal(evidence.compatibilityCredit, 0);
  assert.equal(evidence.productionImport, "HOLD");
});

test("receipt seals only aggregates and fails closed on shape, conservation, and authority", () => {
  const receipt = sealLegacyPerformancePersonSummarySourceReceipt(baseBody());
  assert.deepEqual(validateLegacyPerformancePersonSummarySourceReceipt(receipt), receipt);
  assert.match(receipt.canonicalSha256, /^[0-9a-f]{64}$/u);

  const missingFact = baseBody();
  delete missingFact.safeFacts.orphanAssessmentRows;
  assert.throws(
    () => sealLegacyPerformancePersonSummarySourceReceipt(missingFact),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_RECEIPT_INVALID/u,
  );

  const brokenJoin = baseBody();
  brokenJoin.safeFacts.matchedAssessmentRows = 8;
  assert.throws(
    () => sealLegacyPerformancePersonSummarySourceReceipt(brokenJoin),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_CONSERVATION_FAILED/u,
  );

  const elevated = baseBody();
  elevated.etlAuthority.execute = true;
  assert.throws(
    () => sealLegacyPerformancePersonSummarySourceReceipt(elevated),
    /PERFORMANCE_PERSON_SUMMARY_ETL_AUTHORITY_INVALID/u,
  );

  const writable = baseBody();
  writable.sourceState.readOnly = false;
  assert.throws(
    () => sealLegacyPerformancePersonSummarySourceReceipt(writable),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_NOT_READ_ONLY/u,
  );

  const serialized = JSON.stringify(receipt);
  for (const forbidden of [
    "employeeDisplayNameValue",
    "sourcePersonCodeValue",
    "credential",
    "password",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(forbidden, "iu"));
  }
});

test("parser accepts one exact aggregate row and rejects raw or malformed output", () => {
  const parsed = parseLegacyPerformancePersonSummaryAggregate(aggregateLine());
  assert.deepEqual(parsed.safeFacts, safeFacts());
  assert.equal(parsed.columnContractValid, true);
  assert.equal(parsed.primaryKeyContractValid, true);
  assert.deepEqual(parsed.sourceState, { readOnly: true });
  assert.equal(parsed.etlAuthority.sysadmin, false);
  assert.equal(parsed.etlAuthority.execute, false);
  assert.throws(
    () => parseLegacyPerformancePersonSummaryAggregate(`${aggregateLine()}\nraw-person-row`),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID/u,
  );
  assert.throws(
    () => parseLegacyPerformancePersonSummaryAggregate(aggregateLine().replace(/^10/u, "-1")),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_PROBE_INVALID/u,
  );
});

test("routine equality is snapshot-bounded and orphan semantics remain explicit", () => {
  const distinct = sealLegacyPerformancePersonSummarySourceReceipt(baseBody());
  assert.equal(distinct.currentSnapshotEquivalence.decision, "DISTINCT_ORPHAN_SEMANTICS_REQUIRED");

  const equivalentBody = baseBody({ equivalent: true });
  equivalentBody.safeFacts.orphanAssessmentRows = 0;
  equivalentBody.safeFacts.orphanDistinctPersonCodes = 0;
  equivalentBody.safeFacts.assessmentNonblankPersonRows = 7;
  equivalentBody.safeFacts.assessmentRows = 8;
  equivalentBody.safeFacts.queryableRows = 6;
  equivalentBody.safeFacts.queryableMatchedRows = 6;
  equivalentBody.safeFacts.queryableOrphanRows = 0;
  const equivalent = sealLegacyPerformancePersonSummarySourceReceipt(equivalentBody);
  assert.equal(equivalent.currentSnapshotEquivalence.decision, "CURRENT_SOURCE_SNAPSHOT_EQUIVALENT");
  assert.equal(
    equivalent.currentSnapshotEquivalence.scope,
    "current_restored_source_snapshot_modern_admissible_person_codes",
  );
  assert.equal(equivalent.compatibilityCredit, 0);

  const overclaim = structuredClone(equivalentBody);
  overclaim.currentSnapshotEquivalence.scope = "all_future_source_states";
  assert.throws(
    () => sealLegacyPerformancePersonSummarySourceReceipt(overclaim),
    /PERFORMANCE_PERSON_SUMMARY_SOURCE_EQUIVALENCE_INVALID/u,
  );
});

test("capture binds restore, routine contract, database identity, and one safe query", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "performance-person-summary-source-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = "YuzhouHR_Lab_contract01";
  const restoreReceipt = sealSourceRestoreReceipt({
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
      databaseSha256: digest(database),
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
  const restorePath = resolve(directory, "source-restore-receipt.json");
  writeFileSync(restorePath, `${JSON.stringify(restoreReceipt, null, 2)}\n`, { mode: 0o600 });
  chmodSync(restorePath, 0o600);
  const envPath = resolve(directory, "etl.env");
  writeFileSync(
    envPath,
    `YUZHOU_SQLSERVER_DATABASE=${database}\nYUZHOU_SQLSERVER_ETL_LOGIN=readonly_etl\nYUZHOU_SQLSERVER_ETL_PASSWORD=test-only-secret\n`,
    { mode: 0o600 },
  );
  chmodSync(envPath, 0o600);
  const restoreBytes = readFileSync(restorePath);
  const receiptPath = resolve(directory, "receipt.json");
  let calls = 0;
  const result = captureLegacyPerformancePersonSummarySourceReceipt(
    {
      sourceRestoreReceiptPath: restorePath,
      sourceRestoreReceiptSha256: digest(restoreBytes),
      routineContractPath: resolve(
        root,
        "scripts/hr-cutover/contracts/legacy-performance-query-routine-parity-v1.json",
      ),
      sourceContainer: "source-container-contract",
      etlEnvPath: envPath,
      receiptPath,
    },
    {
      queryRunner(input) {
        calls += 1;
        assert.equal(input.database, database);
        assert.equal(input.login, "readonly_etl");
        assert.equal(input.password, "test-only-secret");
        return aggregateLine();
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.compatibilityCredit, 0);
  assert.equal(result.productionImport, "HOLD");
  assert.equal(statSync(receiptPath).mode & 0o777, 0o600);
  const receiptText = readFileSync(receiptPath, "utf8");
  assert.doesNotMatch(receiptText, /readonly_etl|test-only-secret|source-container-contract/u);
  assert.equal(JSON.parse(receiptText).databaseIdentitySha256, digest(database));
});

test("SQL is fixed aggregate/hash-only and never carries a password argument", () => {
  assert.match(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL, /COUNT_BIG/u);
  assert.match(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.match(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL, /is_read_only/u);
  assert.match(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL, /HAS_PERMS_BY_NAME/u);
  assert.doesNotMatch(LEGACY_PERFORMANCE_PERSON_SUMMARY_SAFE_SQL, /\b(?:INSERT|UPDATE|DELETE|MERGE)\s+(?:INTO|dbo\.|FROM)/iu);
});
