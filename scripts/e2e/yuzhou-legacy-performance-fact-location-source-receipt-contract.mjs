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
  LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL,
  captureLegacyPerformanceFactLocationReceipt,
  parseLegacyPerformanceFactLocationAggregate,
  sealLegacyPerformanceFactLocationReceipt,
  validateLegacyPerformanceFactLocationReceipt,
} from "../hr-cutover/legacy-performance-fact-location-source-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(
  root,
  "scripts/hr-cutover/contracts/legacy-performance-fact-location-v1.json",
);
const evidencePath = resolve(
  root,
  "scripts/hr-cutover/contracts/legacy-performance-fact-location-evidence-v1.json",
);
const digest = (value) => createHash("sha256").update(value).digest("hex");
const sha = (character) => character.repeat(64);
const actualCounts = [
  0, 0, 0, 3, 33, 30, 0, 12, 7, 0, 117,
  0, 0, 117, 0, 108, 0, 1, 30, 0, 0, 5,
  4, 0, 0, 0, 0, 0, 0, 0, 13, 0, 3, 3, 0, 0,
];

function aggregateLine() {
  return [
    ...actualCounts.map(String),
    sha("a"),
    sha("b"),
    sha("c"),
    sha("d"),
    sha("e"),
    "1", "1", "0", "1", "1", "0", "0", "0", "0",
  ].join("|");
}

test("fact-location contract freezes candidates, source flow, and zero-credit policy", () => {
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  assert.equal(contract.contractKind, "yuzhou_hr_legacy_performance_fact_location");
  assert.equal(contract.candidateObjects.length, 12);
  assert.deepEqual(
    contract.candidateObjects
      .filter((row) => row.authority === "AUTHORITATIVE_HISTORY_FACT")
      .map((row) => row.sourceObject),
    ["dbo.assessmentmaster", "dbo.assessmentdetail", "dbo.asssour"],
  );
  const initializer = contract.routineDataFlow.find((row) => row.sourceRoutine === "bs_AssCreateRecord");
  assert.deepEqual(initializer.writes, [
    "dbo.assessmentmaster",
    "dbo.assessmentdetail",
    "dbo.asssour",
  ]);
  const aggregator = contract.routineDataFlow.find((row) => row.sourceRoutine === "bs_ass_compute");
  assert.deepEqual(aggregator.writes, ["dbo.assessmentmaster"]);
  assert.equal(contract.decisionPolicy.emptyAuthoritativeTablesReceiveCompatibilityCredit, false);
  assert.equal(contract.decisionPolicy.supportingRelationsCountAsOutcomeHistory, false);
  assert.equal(contract.decisionPolicy.configurationRowsCountAsOutcomeHistory, false);
  assert.equal(contract.decisionPolicy.unlocatedExternalBackupOrDatabaseIsAbsenceProof, false);
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("live receipt proves declared fact tables empty and keeps historical cause unknown", () => {
  const receipt = validateLegacyPerformanceFactLocationReceipt(
    JSON.parse(readFileSync(evidencePath, "utf8")),
  );
  assert.deepEqual(
    receipt.objectFindings
      .filter((row) => row.authority === "AUTHORITATIVE_HISTORY_FACT")
      .map((row) => [row.sourceObject, row.rowCount, row.runtimeDecision]),
    [
      ["dbo.assessmentmaster", 0, "AUTHORITATIVE_EMPTY"],
      ["dbo.assessmentdetail", 0, "AUTHORITATIVE_EMPTY"],
      ["dbo.asssour", 0, "AUTHORITATIVE_EMPTY"],
    ],
  );
  assert.equal(receipt.relationshipFacts.personAssessmentBindingRows, 0);
  assert.equal(receipt.rootCauseEvidence.currentCreationPath, "BLOCKED_BY_EMPTY_PERSON_ASSESSMENT_BINDING");
  assert.equal(receipt.rootCauseEvidence.historicalEmptyingCause, "UNKNOWN_NO_AUDIT_EVIDENCE");
  assert.equal(receipt.factLocationConclusion.alternativeStore, "NOT_LOCATED_IN_RESTORED_DATABASE");
  assert.equal(
    receipt.factLocationConclusion.promotionDecision,
    "HOLD_REQUIRE_NONEMPTY_AUTHORITATIVE_SOURCE_OR_EXPLICIT_NO_HISTORY_DECISION",
  );
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
});

test("receipt fails closed on authority, candidate identity, counts, and conclusions", () => {
  const receipt = JSON.parse(readFileSync(evidencePath, "utf8"));
  const { canonicalSha256: _canonicalSha256, ...body } = receipt;
  assert.match(sealLegacyPerformanceFactLocationReceipt(body).canonicalSha256, /^[0-9a-f]{64}$/u);

  const renamed = structuredClone(body);
  renamed.objectFindings[0].sourceObject = "dbo.assessment_archive";
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(renamed),
    /PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID/u,
  );

  const falseFact = structuredClone(body);
  falseFact.objectFindings[0].rowCount = 1;
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(falseFact),
    /PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID/u,
  );

  const impossibleRelation = structuredClone(body);
  impossibleRelation.relationshipFacts.asssourpersonMissingSubjectRows = 118;
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(impossibleRelation),
    /PERFORMANCE_FACT_LOCATION_RELATION_CONSERVATION_FAILED/u,
  );

  const falseCause = structuredClone(body);
  falseCause.rootCauseEvidence.historicalEmptyingCause = "PROVEN_PURGED";
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(falseCause),
    /PERFORMANCE_FACT_LOCATION_ROOT_CAUSE_INVALID/u,
  );

  const elevated = structuredClone(body);
  elevated.etlAuthority.update = true;
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(elevated),
    /PERFORMANCE_FACT_LOCATION_AUTHORITY_INVALID/u,
  );

  const promoted = structuredClone(body);
  promoted.compatibilityCredit = 1;
  promoted.productionImport = "READY";
  assert.throws(
    () => sealLegacyPerformanceFactLocationReceipt(promoted),
    /PERFORMANCE_FACT_LOCATION_RECEIPT_INVALID/u,
  );
});

test("aggregate parser accepts one count/hash row and rejects raw or malformed output", () => {
  const parsed = parseLegacyPerformanceFactLocationAggregate(aggregateLine());
  assert.equal(parsed.counts.assessmentmasterRows, 0);
  assert.equal(parsed.counts.asssourpersonRows, 117);
  assert.equal(parsed.counts.personAssessmentBindingRows, 0);
  assert.equal(parsed.counts.unexpectedSignatureTableCount, 0);
  assert.equal(parsed.counts.deployedModuleReferenceCount, 13);
  assert.equal(parsed.objectContractValid, true);
  assert.equal(parsed.sourceState.readOnly, true);
  assert.equal(parsed.etlAuthority.execute, false);
  assert.throws(
    () => parseLegacyPerformanceFactLocationAggregate(`${aggregateLine()}\nraw-source-row`),
    /PERFORMANCE_FACT_LOCATION_PROBE_INVALID/u,
  );
  assert.throws(
    () => parseLegacyPerformanceFactLocationAggregate(aggregateLine().replace(/^0/u, "-1")),
    /PERFORMANCE_FACT_LOCATION_PROBE_INVALID/u,
  );
});

test("capture binds private restore/ETL inputs plus schema and routine ledger hashes", (t) => {
  const directory = mkdtempSync(resolve(tmpdir(), "performance-fact-location-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const database = "YuzhouHR_Lab_contract01";
  const sourceRestore = sealSourceRestoreReceipt({
    formatVersion: 1,
    artifactKind: "yuzhou_hr_source_restore_receipt",
    sourceSnapshotSha256: sha("1"),
    backup: {
      sha256: sha("1"),
      bytes: 1,
      containerCopySha256: sha("1"),
      containerCopyBytes: 1,
    },
    identities: {
      containerSha256: sha("2"),
      imageSha256: sha("3"),
      databaseSha256: digest(database),
      restoreSha256: sha("4"),
      catalogSha256: sha("5"),
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
  const restorePath = resolve(directory, "restore.json");
  writeFileSync(restorePath, `${JSON.stringify(sourceRestore, null, 2)}\n`, { mode: 0o600 });
  chmodSync(restorePath, 0o600);
  const envPath = resolve(directory, "etl.env");
  writeFileSync(
    envPath,
    `YUZHOU_SQLSERVER_DATABASE=${database}\nYUZHOU_SQLSERVER_ETL_LOGIN=readonly_etl\nYUZHOU_SQLSERVER_ETL_PASSWORD=test-only-secret\n`,
    { mode: 0o600 },
  );
  chmodSync(envPath, 0o600);
  const schemaPath = resolve(directory, "schema.sql");
  const ledgerPath = resolve(directory, "ledger.json");
  writeFileSync(schemaPath, "fixture schema\n");
  writeFileSync(ledgerPath, "fixture ledger\n");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  contract.sourceBindings.schemaArtifactSha256 = digest(readFileSync(schemaPath));
  contract.sourceBindings.routineLedgerSha256 = digest(readFileSync(ledgerPath));
  const fixtureContractPath = resolve(directory, "contract.json");
  writeFileSync(fixtureContractPath, `${JSON.stringify(contract, null, 2)}\n`);
  const receiptPath = resolve(directory, "fact-location-receipt.json");
  let calls = 0;
  const result = captureLegacyPerformanceFactLocationReceipt(
    {
      sourceRestoreReceiptPath: restorePath,
      sourceRestoreReceiptSha256: digest(readFileSync(restorePath)),
      factLocationContractPath: fixtureContractPath,
      routineLedgerPath: ledgerPath,
      schemaArtifactPath: schemaPath,
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
});

test("probe is fixed, read-only, and emits only aggregate/hash metadata", () => {
  assert.match(LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL, /COUNT_BIG/u);
  assert.match(LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL, /HASHBYTES\('SHA2_256'/u);
  assert.match(LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL, /is_read_only/u);
  assert.match(LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL, /HAS_PERMS_BY_NAME/u);
  assert.doesNotMatch(
    LEGACY_PERFORMANCE_FACT_LOCATION_SAFE_SQL,
    /\b(?:INSERT|UPDATE|DELETE|MERGE|TRUNCATE)\s+(?:INTO|dbo\.|FROM|TABLE)/iu,
  );
});
