import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHA256 = /^[0-9a-f]{64}$/u;
const ROUTINE_ID = /^RULE-[0-9A-F]{16}$/u;
const LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const BODY_KEYS = [
  "formatVersion",
  "artifactKind",
  "scope",
  "contractSha256",
  "sourceLedgerSha256",
  "nodes",
  "staticCallEdges",
  "businessDomainEdges",
  "stronglyConnectedComponents",
  "zeroCallPathLedger",
  "dynamicCallGapRoutineIds",
  "summary",
  "behaviorCompatibilityStatus",
  "dynamicCallResolutionStatus",
  "decision",
  "status",
  "gapCodes",
  "containsRoutineBodies",
  "containsRoutineNames",
  "containsParameters",
  "containsParameterValues",
  "containsBusinessRows",
  "containsPersonalData",
  "containsCredentials",
  "compatibilityCredit",
  "productionImport",
];

export class LegacyRoutineCallGraphError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRoutineCallGraphError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRoutineCallGraphError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const canonical = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = value => createHash("sha256").update(value).digest("hex");
const exactKeys = (value, keys, code, detail) => {
  if (!object(value) || !same(Object.keys(value).sort(), [...keys].sort())) fail(code, detail);
};
const sortedUnique = values => [...new Set(values)].sort((left, right) => left.localeCompare(right, "en"));

function validateContract(contract) {
  const expectedCounts = {
    routineDenominator: 212,
    staticCallEdges: 32,
    selfCallEdges: 7,
    stronglyConnectedComponents: 212,
    cyclicComponents: 7,
    largestComponentSize: 1,
    zeroOutgoingRoutines: 186,
    zeroIncomingRoutines: 192,
    isolatedRoutines: 179,
    businessDomainEdges: 9,
    dynamicCallGapRoutines: 57,
  };
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_call_graph"
    || contract.scope !== "all_legacy_routine_static_call_relationships"
    || contract.sourceEvidence?.routineLedger?.path !== LEDGER_PATH
    || !SHA256.test(contract.sourceEvidence?.routineLedger?.sha256 ?? "")
    || contract.sourceEvidence?.routineLedger?.ledgerKind !== "yuzhou_hr_legacy_modern_routine_logic_ledger"
    || contract.sourceEvidence?.routineLedger?.formatVersion !== 1
    || !same(contract.expectedCounts, expectedCounts)
    || contract.graphPolicy?.routineIdentity !== "stable_routine_id_only"
    || contract.graphPolicy?.routineIdPattern !== "^RULE-[0-9A-F]{16}$"
    || contract.graphPolicy?.sourceNameResolution !== "internal_case_insensitive_unique_lookup_never_emitted"
    || contract.graphPolicy?.denominator !== "all_212_routines_including_empty_called_routines"
    || contract.graphPolicy?.staticEdge !== "one_direct_ledger_call_per_caller_and_callee_routine_id"
    || contract.graphPolicy?.businessDomainEdge !== "aggregate_static_edges_by_primary_domain_pair_with_routine_ids_only"
    || contract.graphPolicy?.stronglyConnectedComponents !== "tarjan_over_sorted_routine_ids_and_sorted_adjacency_including_singletons"
    || contract.graphPolicy?.zeroCallLedger !== "every_routine_with_empty_called_routines_is_retained_with_incoming_count_and_dynamic_gap"
    || contract.graphPolicy?.dynamicCallGap !== "logic_signal_dynamic_sql_or_non_none_dynamic_mutation_status"
    || contract.graphPolicy?.staticCallsDoNotProveRuntimeBehavior !== true
    || contract.graphPolicy?.emptyCallsDoNotProveRuntimeIsolation !== true
    || Object.values(contract.outputPolicy ?? {}).some(value => value !== false)
    || !same(Object.keys(contract.outputPolicy ?? {}).sort(), [
      "containsBusinessRows", "containsCredentials", "containsParameterValues", "containsParameters",
      "containsPersonalData", "containsRoutineBodies", "containsRoutineNames",
    ].sort())
    || contract.evidencePolicy?.staticStructureCompatibilityCredit !== 0
    || contract.evidencePolicy?.behaviorCompatibilityStatus !== "pending"
    || contract.evidencePolicy?.dynamicCallResolutionStatus !== "gap"
    || contract.evidencePolicy?.requiredDecision !== "KEEP_PENDING"
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") {
    fail("LEGACY_ROUTINE_CALL_GRAPH_CONTRACT_INVALID", "identity, denominator, or safety boundary");
  }
  return { contractSha256: digest(canonical(contract)), expectedCounts };
}

function loadLedger(contract, repositoryRoot) {
  const path = contract.sourceEvidence.routineLedger.path;
  const bytes = readFileSync(resolve(repositoryRoot, path));
  if (digest(bytes) !== contract.sourceEvidence.routineLedger.sha256) {
    fail("LEGACY_ROUTINE_CALL_GRAPH_LEDGER_DRIFT", "bound ledger sha256");
  }
  try {
    return { ledger: JSON.parse(bytes), sourceLedgerSha256: digest(bytes) };
  } catch {
    fail("LEGACY_ROUTINE_CALL_GRAPH_LEDGER_INVALID", "ledger JSON");
  }
}

function validateLedger(ledger, contract) {
  if (!object(ledger)
    || ledger.formatVersion !== contract.sourceEvidence.routineLedger.formatVersion
    || ledger.ledgerKind !== contract.sourceEvidence.routineLedger.ledgerKind
    || ledger.productionImport !== "HOLD"
    || !Array.isArray(ledger.routines)
    || ledger.routines.length !== contract.expectedCounts.routineDenominator) {
    fail("LEGACY_ROUTINE_CALL_GRAPH_LEDGER_INVALID", "identity or routine denominator");
  }
  const routineIds = new Set();
  const nameToRoutine = new Map();
  for (const routine of ledger.routines) {
    if (!object(routine)
      || !ROUTINE_ID.test(routine.routineId ?? "")
      || typeof routine.sourceName !== "string" || !routine.sourceName
      || typeof routine.primaryDomain !== "string" || !routine.primaryDomain
      || !Array.isArray(routine.calledRoutines)
      || routine.calledRoutines.some(name => typeof name !== "string" || !name)
      || new Set(routine.calledRoutines.map(name => name.toLowerCase())).size !== routine.calledRoutines.length
      || !Array.isArray(routine.logicSignals)
      || routine.logicSignals.some(signal => typeof signal !== "string")
      || typeof routine.dynamicMutationStatus !== "string" || !routine.dynamicMutationStatus) {
      fail("LEGACY_ROUTINE_CALL_GRAPH_LEDGER_INVALID", "routine structural fields");
    }
    if (routineIds.has(routine.routineId)) fail("LEGACY_ROUTINE_CALL_GRAPH_DUPLICATE_ROUTINE_ID", routine.routineId);
    routineIds.add(routine.routineId);
    const normalizedName = routine.sourceName.toLowerCase();
    if (nameToRoutine.has(normalizedName)) fail("LEGACY_ROUTINE_CALL_GRAPH_AMBIGUOUS_NAME", routine.routineId);
    nameToRoutine.set(normalizedName, routine);
  }
  return { routines: ledger.routines, routineIds, nameToRoutine };
}

function stronglyConnectedComponents(routineIds, adjacency) {
  let nextIndex = 0;
  const stack = [];
  const onStack = new Set();
  const indexById = new Map();
  const lowLinkById = new Map();
  const components = [];

  const visit = routineId => {
    indexById.set(routineId, nextIndex);
    lowLinkById.set(routineId, nextIndex);
    nextIndex += 1;
    stack.push(routineId);
    onStack.add(routineId);

    for (const calleeId of adjacency.get(routineId)) {
      if (!indexById.has(calleeId)) {
        visit(calleeId);
        lowLinkById.set(routineId, Math.min(lowLinkById.get(routineId), lowLinkById.get(calleeId)));
      } else if (onStack.has(calleeId)) {
        lowLinkById.set(routineId, Math.min(lowLinkById.get(routineId), indexById.get(calleeId)));
      }
    }

    if (lowLinkById.get(routineId) === indexById.get(routineId)) {
      const component = [];
      let member;
      do {
        member = stack.pop();
        onStack.delete(member);
        component.push(member);
      } while (member !== routineId);
      components.push(component.sort((left, right) => left.localeCompare(right, "en")));
    }
  };

  for (const routineId of routineIds) if (!indexById.has(routineId)) visit(routineId);
  return components
    .sort((left, right) => left.join(":").localeCompare(right.join(":"), "en"))
    .map(routineIdsInComponent => ({
      componentId: `SCC-${digest(routineIdsInComponent.join("\n")).slice(0, 16).toUpperCase()}`,
      routineIds: routineIdsInComponent,
      size: routineIdsInComponent.length,
      cyclic: routineIdsInComponent.length > 1
        || adjacency.get(routineIdsInComponent[0]).includes(routineIdsInComponent[0]),
    }));
}

function deriveGraph(ledger, contract, contractSha256, sourceLedgerSha256) {
  const { routines, nameToRoutine } = validateLedger(ledger, contract);
  const routinesById = new Map(routines.map(routine => [routine.routineId, routine]));
  const routineIds = [...routinesById.keys()].sort((left, right) => left.localeCompare(right, "en"));
  const adjacency = new Map(routineIds.map(routineId => [routineId, []]));
  const incoming = new Map(routineIds.map(routineId => [routineId, 0]));
  const staticCallEdges = [];

  for (const caller of routines) {
    const resolvedCallees = [];
    for (const calledName of caller.calledRoutines) {
      const callee = nameToRoutine.get(calledName.toLowerCase());
      if (!callee) fail("LEGACY_ROUTINE_CALL_GRAPH_UNRESOLVED_CALL", caller.routineId);
      resolvedCallees.push(callee.routineId);
    }
    if (new Set(resolvedCallees).size !== resolvedCallees.length) {
      fail("LEGACY_ROUTINE_CALL_GRAPH_DUPLICATE_EDGE", caller.routineId);
    }
    adjacency.set(caller.routineId, resolvedCallees.sort((left, right) => left.localeCompare(right, "en")));
    for (const calleeRoutineId of resolvedCallees) {
      incoming.set(calleeRoutineId, incoming.get(calleeRoutineId) + 1);
      const callee = routinesById.get(calleeRoutineId);
      staticCallEdges.push({
        callerRoutineId: caller.routineId,
        calleeRoutineId,
        sourceDomain: caller.primaryDomain,
        targetDomain: callee.primaryDomain,
        edgeClass: caller.primaryDomain === callee.primaryDomain ? "same_domain" : "cross_domain",
      });
    }
  }
  staticCallEdges.sort((left, right) => `${left.callerRoutineId}:${left.calleeRoutineId}`.localeCompare(`${right.callerRoutineId}:${right.calleeRoutineId}`, "en"));

  const dynamicCallGap = routine => routine.logicSignals.includes("dynamic_sql") || routine.dynamicMutationStatus !== "none";
  const nodes = routineIds.map(routineId => {
    const routine = routinesById.get(routineId);
    const outgoingStaticCalls = adjacency.get(routineId).length;
    const incomingStaticCalls = incoming.get(routineId);
    const staticCallClass = outgoingStaticCalls === 0 && incomingStaticCalls === 0
      ? "isolated_static"
      : outgoingStaticCalls === 0
        ? "terminal_static"
        : incomingStaticCalls === 0
          ? "root_static"
          : "transit_static";
    return { routineId, primaryDomain: routine.primaryDomain, outgoingStaticCalls, incomingStaticCalls, staticCallClass, dynamicCallGap: dynamicCallGap(routine) };
  });

  const domainGroups = new Map();
  for (const edge of staticCallEdges) {
    const key = `${edge.sourceDomain}\u0000${edge.targetDomain}`;
    const group = domainGroups.get(key) ?? { sourceDomain: edge.sourceDomain, targetDomain: edge.targetDomain, staticCallCount: 0, callerRoutineIds: [], calleeRoutineIds: [] };
    group.staticCallCount += 1;
    group.callerRoutineIds.push(edge.callerRoutineId);
    group.calleeRoutineIds.push(edge.calleeRoutineId);
    domainGroups.set(key, group);
  }
  const businessDomainEdges = [...domainGroups.values()]
    .map(group => ({ ...group, callerRoutineIds: sortedUnique(group.callerRoutineIds), calleeRoutineIds: sortedUnique(group.calleeRoutineIds) }))
    .sort((left, right) => `${left.sourceDomain}:${left.targetDomain}`.localeCompare(`${right.sourceDomain}:${right.targetDomain}`, "en"));

  const components = stronglyConnectedComponents(routineIds, adjacency);
  const zeroCallPathLedger = nodes
    .filter(node => node.outgoingStaticCalls === 0)
    .map(node => ({
      routineId: node.routineId,
      incomingStaticCalls: node.incomingStaticCalls,
      pathStatus: node.incomingStaticCalls === 0 ? "isolated_static" : "terminal_static",
      dynamicCallGap: node.dynamicCallGap,
    }));
  const dynamicCallGapRoutineIds = nodes.filter(node => node.dynamicCallGap).map(node => node.routineId);
  const summary = {
    routineDenominator: nodes.length,
    graphNodes: nodes.length,
    staticCallEdges: staticCallEdges.length,
    selfCallEdges: staticCallEdges.filter(edge => edge.callerRoutineId === edge.calleeRoutineId).length,
    stronglyConnectedComponents: components.length,
    cyclicComponents: components.filter(component => component.cyclic).length,
    largestComponentSize: Math.max(...components.map(component => component.size)),
    zeroOutgoingRoutines: zeroCallPathLedger.length,
    zeroIncomingRoutines: nodes.filter(node => node.incomingStaticCalls === 0).length,
    isolatedRoutines: nodes.filter(node => node.staticCallClass === "isolated_static").length,
    businessDomainEdges: businessDomainEdges.length,
    dynamicCallGapRoutines: dynamicCallGapRoutineIds.length,
  };
  const expectedSummary = {
    routineDenominator: contract.expectedCounts.routineDenominator,
    graphNodes: contract.expectedCounts.routineDenominator,
    staticCallEdges: contract.expectedCounts.staticCallEdges,
    selfCallEdges: contract.expectedCounts.selfCallEdges,
    stronglyConnectedComponents: contract.expectedCounts.stronglyConnectedComponents,
    cyclicComponents: contract.expectedCounts.cyclicComponents,
    largestComponentSize: contract.expectedCounts.largestComponentSize,
    zeroOutgoingRoutines: contract.expectedCounts.zeroOutgoingRoutines,
    zeroIncomingRoutines: contract.expectedCounts.zeroIncomingRoutines,
    isolatedRoutines: contract.expectedCounts.isolatedRoutines,
    businessDomainEdges: contract.expectedCounts.businessDomainEdges,
    dynamicCallGapRoutines: contract.expectedCounts.dynamicCallGapRoutines,
  };
  if (!same(summary, expectedSummary)) {
    fail("LEGACY_ROUTINE_CALL_GRAPH_COUNT_DRIFT", "derived graph summary");
  }

  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_routine_call_graph",
    scope: contract.scope,
    contractSha256,
    sourceLedgerSha256,
    nodes,
    staticCallEdges,
    businessDomainEdges,
    stronglyConnectedComponents: components,
    zeroCallPathLedger,
    dynamicCallGapRoutineIds,
    summary,
    behaviorCompatibilityStatus: "pending",
    dynamicCallResolutionStatus: "gap",
    decision: "KEEP_PENDING",
    status: "STATIC_STRUCTURE_CLASSIFIED_BEHAVIOR_PENDING",
    gapCodes: [
      "LEGACY_ROUTINE_STATIC_CALLS_DO_NOT_PROVE_BEHAVIOR_PARITY",
      "LEGACY_ROUTINE_DYNAMIC_CALLS_NOT_OBSERVED",
      "LEGACY_ROUTINE_EMPTY_CALLS_DO_NOT_PROVE_RUNTIME_ISOLATION",
    ],
    ...contract.outputPolicy,
    compatibilityCredit: 0,
    productionImport: "HOLD",
  };
  return { ...body, graphSha256: digest(canonical(body)) };
}

export function buildLegacyRoutineCallGraph({ contract, repositoryRoot }) {
  const { contractSha256 } = validateContract(contract);
  const { ledger, sourceLedgerSha256 } = loadLedger(contract, repositoryRoot);
  return deriveGraph(ledger, contract, contractSha256, sourceLedgerSha256);
}

export function validateLegacyRoutineCallGraph(graph, { contract, repositoryRoot }) {
  exactKeys(graph, [...BODY_KEYS, "graphSha256"], "LEGACY_ROUTINE_CALL_GRAPH_INVALID", "graph shape");
  const { graphSha256, ...body } = graph;
  if (graphSha256 !== digest(canonical(body))) fail("LEGACY_ROUTINE_CALL_GRAPH_HASH_MISMATCH", "canonical graph hash");
  const expected = buildLegacyRoutineCallGraph({ contract, repositoryRoot });
  if (!same(graph, expected)) fail("LEGACY_ROUTINE_CALL_GRAPH_INVALID", "derived nodes, edges, components, gaps, or safety boundary");
  return graph;
}
