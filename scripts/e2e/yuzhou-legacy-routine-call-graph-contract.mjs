import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyRoutineCallGraph,
  LegacyRoutineCallGraphError,
  validateLegacyRoutineCallGraph,
} from "../hr-cutover/legacy-routine-call-graph.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-routine-call-graph-v1.json");
const contract = JSON.parse(readFileSync(contractPath, "utf8"));
const ledgerPath = resolve(root, contract.sourceEvidence.routineLedger.path);
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const rejects = (code, action) => assert.throws(
  action,
  error => error instanceof LegacyRoutineCallGraphError && error.code === code,
);

test("contract binds the committed 212-routine ledger and freezes the complete structural denominator", () => {
  const actualLedgerHash = createHash("sha256").update(readFileSync(ledgerPath)).digest("hex");
  assert.equal(actualLedgerHash, contract.sourceEvidence.routineLedger.sha256);
  assert.equal(contract.expectedCounts.routineDenominator, 212);
  assert.equal(contract.graphPolicy.denominator, "all_212_routines_including_empty_called_routines");
  assert.equal(contract.graphPolicy.routineIdentity, "stable_routine_id_only");
  assert.equal(contract.graphPolicy.staticCallsDoNotProveRuntimeBehavior, true);
  assert.equal(contract.compatibilityCredit, 0);
  assert.equal(contract.productionImport, "HOLD");
});

test("deterministic graph includes every routine and every resolved static call using stable ids", () => {
  const first = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  const second = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  const routineByName = new Map(ledger.routines.map(routine => [routine.sourceName.toLowerCase(), routine]));
  const expectedEdges = ledger.routines.flatMap(caller => caller.calledRoutines.map(calledName => (
    `${caller.routineId}->${routineByName.get(calledName.toLowerCase()).routineId}`
  ))).sort((left, right) => left.localeCompare(right, "en"));
  const actualEdges = first.staticCallEdges.map(edge => `${edge.callerRoutineId}->${edge.calleeRoutineId}`);
  assert.deepEqual(second, first);
  assert.equal(first.nodes.length, 212);
  assert.equal(first.staticCallEdges.length, 32);
  assert.equal(new Set(first.nodes.map(node => node.routineId)).size, 212);
  assert.ok(first.nodes.every(node => /^RULE-[0-9A-F]{16}$/u.test(node.routineId)));
  assert.ok(first.staticCallEdges.every(edge => /^RULE-[0-9A-F]{16}$/u.test(edge.callerRoutineId) && /^RULE-[0-9A-F]{16}$/u.test(edge.calleeRoutineId)));
  assert.deepEqual(actualEdges, expectedEdges);
  assert.deepEqual(validateLegacyRoutineCallGraph(first, { contract, repositoryRoot: root }), first);
});

test("empty calledRoutines stay in the denominator and the zero-call path ledger", () => {
  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  const expectedZeroIds = ledger.routines
    .filter(routine => routine.calledRoutines.length === 0)
    .map(routine => routine.routineId)
    .sort((left, right) => left.localeCompare(right, "en"));
  assert.equal(expectedZeroIds.length, 186);
  assert.deepEqual(graph.zeroCallPathLedger.map(row => row.routineId), expectedZeroIds);
  assert.equal(graph.summary.zeroOutgoingRoutines, 186);
  assert.equal(graph.summary.zeroIncomingRoutines, 192);
  assert.equal(graph.summary.isolatedRoutines, 179);
  assert.ok(graph.zeroCallPathLedger.every(row => ["isolated_static", "terminal_static"].includes(row.pathStatus)));
  assert.ok(graph.gapCodes.includes("LEGACY_ROUTINE_EMPTY_CALLS_DO_NOT_PROVE_RUNTIME_ISOLATION"));
});

test("strongly connected components cover all nodes including singletons and self-call cycles", () => {
  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  const members = graph.stronglyConnectedComponents.flatMap(component => component.routineIds);
  assert.equal(graph.stronglyConnectedComponents.length, 212);
  assert.equal(new Set(members).size, 212);
  assert.deepEqual([...members].sort((left, right) => left.localeCompare(right, "en")), graph.nodes.map(node => node.routineId));
  assert.equal(graph.stronglyConnectedComponents.filter(component => component.cyclic).length, 7);
  assert.equal(Math.max(...graph.stronglyConnectedComponents.map(component => component.size)), 1);
  assert.equal(graph.staticCallEdges.filter(edge => edge.callerRoutineId === edge.calleeRoutineId).length, 7);
});

test("business-domain edges conserve all static edges without introducing named routine identities", () => {
  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  assert.equal(graph.businessDomainEdges.length, 9);
  assert.equal(graph.businessDomainEdges.reduce((sum, edge) => sum + edge.staticCallCount, 0), graph.staticCallEdges.length);
  assert.equal(new Set(graph.businessDomainEdges.map(edge => `${edge.sourceDomain}:${edge.targetDomain}`)).size, graph.businessDomainEdges.length);
  for (const edge of graph.businessDomainEdges) {
    assert.ok(edge.callerRoutineIds.every(routineId => /^RULE-[0-9A-F]{16}$/u.test(routineId)));
    assert.ok(edge.calleeRoutineIds.every(routineId => /^RULE-[0-9A-F]{16}$/u.test(routineId)));
  }
});

test("dynamic calls remain an explicit zero-credit gap and static graph is not behavior parity", () => {
  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  assert.equal(graph.dynamicCallGapRoutineIds.length, 57);
  assert.ok(graph.dynamicCallGapRoutineIds.every(routineId => /^RULE-[0-9A-F]{16}$/u.test(routineId)));
  assert.equal(graph.behaviorCompatibilityStatus, "pending");
  assert.equal(graph.dynamicCallResolutionStatus, "gap");
  assert.equal(graph.status, "STATIC_STRUCTURE_CLASSIFIED_BEHAVIOR_PENDING");
  assert.ok(graph.gapCodes.includes("LEGACY_ROUTINE_STATIC_CALLS_DO_NOT_PROVE_BEHAVIOR_PARITY"));
  assert.ok(graph.gapCodes.includes("LEGACY_ROUTINE_DYNAMIC_CALLS_NOT_OBSERVED"));
  assert.equal(graph.compatibilityCredit, 0);
  assert.equal(graph.productionImport, "HOLD");
});

test("graph output excludes routine names, bodies, parameters, values, business rows, personal data and credentials", () => {
  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  assert.equal(graph.containsRoutineBodies, false);
  assert.equal(graph.containsRoutineNames, false);
  assert.equal(graph.containsParameters, false);
  assert.equal(graph.containsParameterValues, false);
  assert.equal(graph.containsBusinessRows, false);
  assert.equal(graph.containsPersonalData, false);
  assert.equal(graph.containsCredentials, false);
  assert.doesNotMatch(JSON.stringify(graph), /"(?:sourceName|canonicalFamily|routineBody|parameters|parameterValue|sourceArtifact|businessRow|personId|credential)"\s*:/iu);
});

test("ledger binding, expected counts and graph hash fail closed on drift or tampering", () => {
  const driftedHash = structuredClone(contract);
  driftedHash.sourceEvidence.routineLedger.sha256 = "0".repeat(64);
  rejects("LEGACY_ROUTINE_CALL_GRAPH_LEDGER_DRIFT", () => buildLegacyRoutineCallGraph({ contract: driftedHash, repositoryRoot: root }));

  const driftedCount = structuredClone(contract);
  driftedCount.expectedCounts.staticCallEdges += 1;
  rejects("LEGACY_ROUTINE_CALL_GRAPH_CONTRACT_INVALID", () => buildLegacyRoutineCallGraph({ contract: driftedCount, repositoryRoot: root }));

  const graph = buildLegacyRoutineCallGraph({ contract, repositoryRoot: root });
  graph.compatibilityCredit = 1;
  rejects("LEGACY_ROUTINE_CALL_GRAPH_HASH_MISMATCH", () => validateLegacyRoutineCallGraph(graph, { contract, repositoryRoot: root }));
});
