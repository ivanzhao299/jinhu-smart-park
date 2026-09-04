import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildLegacyDualSourceEmptyObjectDenominator,
  LegacyDualSourceEmptyObjectDenominatorError,
  verifyLegacyDualSourceEmptyObjectDenominator,
} from "../hr-cutover/legacy-dual-source-empty-object-denominator.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const contractPath = resolve(
  repositoryRoot,
  "scripts/hr-cutover/contracts/legacy-dual-source-empty-object-denominator-v1.json",
);
const readContract = () => JSON.parse(readFileSync(contractPath, "utf8"));

test("dual-source denominator keeps all 812 table and routine objects", () => {
  const { ledger, report } = buildLegacyDualSourceEmptyObjectDenominator({
    contract: readContract(),
    repositoryRoot,
  });
  assert.equal(report.status, "PASS");
  assert.equal(ledger.records.length, 812);
  assert.equal(new Set(ledger.records.map((record) => record.objectStableId)).size, 812);
  assert.deepEqual(
    Object.fromEntries(
      ["desktop_client", "group_web"].map((surface) => [
        surface,
        ledger.records.filter((record) => record.sourceSurface === surface).length,
      ]),
    ),
    { desktop_client: 374, group_web: 438 },
  );
  assert.equal(ledger.records.every((record) => record.denominatorDisposition === "included"), true);
  assert.equal(ledger.compatibilityScoreContribution, 0);
  assert.equal(ledger.productionImport, "HOLD");
});

test("unknown table evidence remains explicit and cannot be replaced by aggregate inference", () => {
  const { ledger } = buildLegacyDualSourceEmptyObjectDenominator({
    contract: readContract(),
    repositoryRoot,
  });
  const tables = ledger.records.filter((record) => record.objectType.includes("table"));
  const groupTables = tables.filter((record) => record.sourceSurface === "group_web");
  assert.equal(tables.length, 600);
  assert.equal(tables.every((record) => record.rowEvidenceStatus.startsWith("unknown_")), true);
  assert.equal(tables.every((record) => record.nonNullEvidenceStatus.startsWith("unknown_")), true);
  assert.equal(groupTables.length, 438);
  assert.equal(groupTables.every((record) => record.rowEvidenceStatus === "unknown_aggregate_only"), true);
  assert.deepEqual(ledger.summary.groupWebAggregate, {
    tables: 438,
    nonemptyTables: 215,
    emptyTables: 223,
    rows: 320406,
    perObjectAssignmentStatus: "unknown_not_inferred_from_aggregate",
  });
});

test("all 212 client routines remain included even when no static call reference is observed", () => {
  const { ledger } = buildLegacyDualSourceEmptyObjectDenominator({
    contract: readContract(),
    repositoryRoot,
  });
  const routines = ledger.records.filter((record) =>
    ["function", "procedure", "trigger"].includes(record.objectType),
  );
  assert.equal(routines.length, 212);
  assert.equal(ledger.summary.routinesWithStaticCallReferences, 26);
  assert.equal(ledger.summary.routinesWithNoStaticCallReferences, 186);
  assert.equal(ledger.summary.routinesWithRuntimeCallEvidenceUnknown, 212);
  assert.equal(
    routines.every(
      (record) =>
        record.rowEvidenceStatus === "not_applicable" &&
        record.nonNullEvidenceStatus === "not_applicable" &&
        record.callEvidenceStatus.endsWith("runtime_unknown"),
    ),
    true,
  );
});

test("ledger exposes only stable IDs types statuses counts and hashes", () => {
  const contract = readContract();
  const { ledger } = buildLegacyDualSourceEmptyObjectDenominator({ contract, repositoryRoot });
  const serialized = JSON.stringify(ledger);
  const tableMap = JSON.parse(
    readFileSync(resolve(repositoryRoot, contract.sourceBindings.clientTableMap.path), "utf8"),
  );
  const tableNames = tableMap.groups.flatMap((group) => group.sourceTables);
  const routineLedger = JSON.parse(
    readFileSync(resolve(repositoryRoot, contract.sourceBindings.clientRoutineLedger.path), "utf8"),
  );
  assert.equal(tableNames.some((name) => serialized.includes(`\"${name}\"`)), false);
  assert.equal(routineLedger.routines.some((routine) => serialized.includes(routine.sourceName)), false);
  assert.equal(serialized.includes("username"), false);
  assert.equal(serialized.includes("password"), false);
  assert.equal(ledger.containsBusinessValues, false);
});

test("source count policy and materialized records fail closed on drift", () => {
  const mutations = [
    (contract) => {
      contract.sourceBindings.clientTableMap.sha256 = "0".repeat(64);
    },
    (contract) => {
      contract.expectedDenominator.groupWebTables = 215;
    },
    (contract) => {
      contract.groupWebAggregateEvidence.emptyTables = 0;
    },
    (contract) => {
      contract.evidencePolicy.includeUnknownRowObjects = false;
    },
    (contract) => {
      contract.productionImport = "READY";
    },
  ];
  for (const mutate of mutations) {
    const contract = readContract();
    mutate(contract);
    assert.throws(
      () => buildLegacyDualSourceEmptyObjectDenominator({ contract, repositoryRoot }),
      (error) => error instanceof LegacyDualSourceEmptyObjectDenominatorError,
    );
  }

  const contract = readContract();
  const { ledger } = buildLegacyDualSourceEmptyObjectDenominator({ contract, repositoryRoot });
  const candidates = [
    (candidate) => candidate.records.pop(),
    (candidate) => {
      candidate.records.find((record) => record.sourceSurface === "group_web").rowEvidenceStatus =
        "verified_empty";
    },
    (candidate) => {
      candidate.compatibilityScoreContribution = 1;
    },
  ];
  for (const mutate of candidates) {
    const candidate = structuredClone(ledger);
    mutate(candidate);
    assert.throws(
      () =>
        verifyLegacyDualSourceEmptyObjectDenominator({
          contract,
          ledger: candidate,
          repositoryRoot,
        }),
      /EMPTY_OBJECT_DENOMINATOR_MATERIALIZATION_DRIFT/u,
    );
  }
});
