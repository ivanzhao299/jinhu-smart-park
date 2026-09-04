#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  computeRoutineLedgerSha256,
  evaluateLegacyRoutineParityContract,
  LegacyRoutineParityContractError,
} from "../hr-cutover/legacy-routine-parity-contract.mjs";

const root = resolve(import.meta.dirname, "../..");
const readJson = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const fixture = readJson("scripts/hr-cutover/contracts/legacy-routine-parity-synthetic-fixture-v1.json");
const schema = readJson("scripts/hr-cutover/contracts/legacy-routine-parity-contract.schema.json");

function bind(contract, ledger) {
  contract.sourceBinding.routineLedgerSha256 = computeRoutineLedgerSha256(ledger);
  contract.sourceBinding.sourceRoutineCount = ledger.routines.length;
  contract.sourceBinding.requiredSourceSurfaces = [...new Set(ledger.routines.map(row => row.sourceSurface))];
}

test("synthetic dual-surface fixture exposes partial progress without claiming full parity", () => {
  assert.equal(fixture.fixtureOnly, true);
  const report = evaluateLegacyRoutineParityContract({ contract: fixture.parityContract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, fixture.expected.status);
  assert.equal(report.summary.sourceRoutines, fixture.expected.sourceRoutines);
  assert.equal(report.summary.verifiedRoutines, fixture.expected.verifiedRoutines);
  assert.equal(report.summary.pendingRoutines, fixture.expected.pendingRoutines);
  assert.equal(report.summary.verifiedSemanticParityPercent, fixture.expected.verifiedSemanticParityPercent);
  assert.deepEqual(report.reasonCodes, fixture.expected.reasonCodes);
  assert.deepEqual(report.summary.bySourceSurface, {
    yuzhou_v10_client_database: { sourceRoutines: 1, verifiedRoutines: 1, pendingRoutines: 0 },
    yuzhou_v10_group_web_database: { sourceRoutines: 1, verifiedRoutines: 0, pendingRoutines: 1 },
  });
  assert.equal(report.productionImport, "HOLD");
});

test("a fully evidenced routine receives completion credit", () => {
  const routineLedger = structuredClone(fixture.sourceRoutineLedger);
  routineLedger.routines = [routineLedger.routines[0]];
  const contract = structuredClone(fixture.parityContract);
  contract.routines = [contract.routines[0]];
  bind(contract, routineLedger);
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger });
  assert.equal(report.status, "COMPLETE");
  assert.equal(report.summary.verifiedRoutines, 1);
  assert.equal(report.summary.verifiedSemanticParityPercent, 100);
  assert.deepEqual(report.reasonCodes, []);
});

test("unresolved dynamic SQL cannot receive verified parity credit", () => {
  const routineLedger = structuredClone(fixture.sourceRoutineLedger);
  routineLedger.routines = [routineLedger.routines[1]];
  const contract = structuredClone(fixture.parityContract);
  contract.routines = [contract.routines[1]];
  contract.routines[0].parityStatus = "verified";
  bind(contract, routineLedger);
  assert.throws(
    () => evaluateLegacyRoutineParityContract({ contract, routineLedger }),
    error => error instanceof LegacyRoutineParityContractError && error.code === "DYNAMIC_SQL_SOURCE_LEDGER_UNRESOLVED",
  );
});

test("an empty source table and dormant trigger still require executable path evidence", () => {
  const routineLedger = structuredClone(fixture.sourceRoutineLedger);
  routineLedger.routines = [{ ...routineLedger.routines[1], dynamicMutationStatus: "none" }];
  const contract = structuredClone(fixture.parityContract);
  const row = structuredClone(contract.routines[0]);
  row.routineId = routineLedger.routines[0].routineId;
  row.canonicalFamily = routineLedger.routines[0].canonicalFamily;
  row.sourceSurface = routineLedger.routines[0].sourceSurface;
  row.sourceKind = "trigger";
  row.semantics.dynamicSql = {
    status: "none",
    resolvedWriteTargets: [],
    evidenceSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  };
  row.semantics.dormantPaths = {
    sourceDataState: "empty",
    emptyInputCase: { status: "covered", evidenceSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
    untriggeredBranchCase: { status: "covered", evidenceSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" },
    triggerFiringCase: { status: "pending", evidenceSha256: null },
  };
  contract.routines = [row];
  bind(contract, routineLedger);
  assert.throws(
    () => evaluateLegacyRoutineParityContract({ contract, routineLedger }),
    error => error instanceof LegacyRoutineParityContractError && error.code === "VERIFIED_ROUTINE_EVIDENCE_INCOMPLETE",
  );
});

test("positive, negative, permission and conservation evidence are all mandatory", () => {
  const routineLedger = structuredClone(fixture.sourceRoutineLedger);
  routineLedger.routines = [routineLedger.routines[0]];
  const contract = structuredClone(fixture.parityContract);
  contract.routines = [contract.routines[0]];
  contract.routines[0].testEvidence.permission = [];
  bind(contract, routineLedger);
  assert.throws(
    () => evaluateLegacyRoutineParityContract({ contract, routineLedger }),
    error => error instanceof LegacyRoutineParityContractError && error.code === "VERIFIED_ROUTINE_EVIDENCE_INCOMPLETE",
  );
});

test("missing routine rows remain visible as pending and cannot inflate the denominator", () => {
  const contract = structuredClone(fixture.parityContract);
  contract.routines = [contract.routines[0]];
  const report = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  assert.equal(report.status, "IN_PROGRESS");
  assert.equal(report.summary.sourceRoutines, 2);
  assert.equal(report.summary.contractRows, 1);
  assert.equal(report.summary.verifiedRoutines, 1);
  assert.equal(report.summary.pendingRoutines, 1);
  assert.deepEqual(report.missingRoutineKeys, ["yuzhou_v10_group_web_database:SYN-WEB-TRIGGER-001"]);
  assert.ok(report.reasonCodes.includes("ROUTINE_PARITY_ROWS_MISSING"));
});

test("source identity, surface and exact ledger hash are fail-closed bindings", () => {
  const wrongFamily = structuredClone(fixture.parityContract);
  wrongFamily.routines[0].canonicalFamily = "different_family";
  assert.throws(
    () => evaluateLegacyRoutineParityContract({ contract: wrongFamily, routineLedger: fixture.sourceRoutineLedger }),
    error => error instanceof LegacyRoutineParityContractError && error.code === "ROUTINE_SOURCE_IDENTITY_MISMATCH",
  );

  const wrongHash = structuredClone(fixture.parityContract);
  wrongHash.sourceBinding.routineLedgerSha256 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  assert.throws(
    () => evaluateLegacyRoutineParityContract({ contract: wrongHash, routineLedger: fixture.sourceRoutineLedger }),
    error => error instanceof LegacyRoutineParityContractError && error.code === "ROUTINE_SOURCE_BINDING_HASH_MISMATCH",
  );
});

test("JSON schema freezes every required semantic and evidence dimension", () => {
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  const semantics = schema.$defs.routine.properties.semantics.required;
  assert.deepEqual(new Set(semantics), new Set([
    "parameterMappings", "outputFieldMappings", "readMappings", "writeMappings", "transaction",
    "nullSemantics", "roundingSemantics", "stateSideEffects", "dynamicSql", "dormantPaths",
  ]));
  assert.deepEqual(new Set(schema.$defs.routine.properties.testEvidence.required), new Set([
    "positive", "negative", "permission", "conservation",
  ]));
  assert.deepEqual(schema.$defs.routine.properties.modernTargets.required, ["serviceSymbols", "apiSymbols", "pages"]);
});

console.log("Yuzhou legacy routine semantic parity contract passed.");
