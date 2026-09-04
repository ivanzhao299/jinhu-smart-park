import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { resolve, sep } from "node:path";

import { verifyGroupWebTrainingQueryCapability } from "./group-web-training-query-capability.mjs";
import { validateGroupWebTrainingQueryModernRuntimeTask } from "./group-web-training-query-modern-runtime.mjs";

export class GroupWebTrainingQueryStaticAtomicError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "GroupWebTrainingQueryStaticAtomicError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new GroupWebTrainingQueryStaticAtomicError(code, detail); };
const sha256 = value => createHash("sha256").update(`${JSON.stringify(value)}\n`).digest("hex");
const SHA256 = /^[0-9a-f]{64}$/u;
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && same(Object.keys(value).sort(), [...keys].sort());
const COVERAGE = {
  groupWebNavigableEntries: { numerator: 0, denominator: 186 },
  legacyInteractionParity: { numerator: 0, denominator: 6 },
};
const ATOMS = [
  ["legacy_entry_128_resolved", "hash_bound_static_page_definition", "STATIC_CONFIRMED"],
  ["legacy_filter_form_shape", "hash_bound_static_page_structure", "STATIC_CONFIRMED"],
  ["legacy_web_trainquery_read_projection", "hash_bound_routine_structure", "STATIC_CONFIRMED_NOT_PAGE_LINKED"],
  ["legacy_hierarchy_scope_signal", "hash_bound_routine_logic_signal", "STATIC_CONFIRMED_NOT_BEHAVIOR_VERIFIED"],
  ["modern_training_plans_get_contract", "source_bound_modern_route_contract", "STATIC_CONFIRMED_RUNTIME_NOT_EXECUTED"],
  ["modern_training_page_contract", "source_bound_modern_page_contract", "STATIC_CONFIRMED_RUNTIME_NOT_EXECUTED"],
];
const MISSING_RUNTIME = [
  "legacy_entry_to_routine_invocation",
  "authenticated_legacy_filter_submission",
  "legacy_scoped_result_rendering",
  "modern_api_and_browser_observations",
  "legacy_to_modern_behavior_parity",
];

function validateManifest(manifest) {
  if (!exactKeys(manifest, [
    "formatVersion", "contractKind", "contractVersion", "candidateId", "sourceBindings",
    "legacyRoutine", "atomicInteractions", "staticEvidenceProgress", "runtimeEvidence",
    "coverageCredit", "compatibilityScoreContribution", "personalDataObserved", "credentialsUsed",
    "productionImport",
  ])
    || manifest.formatVersion !== 1
    || manifest.contractKind !== "yuzhou_hr_group_web_training_query_static_atomic_manifest"
    || manifest.contractVersion !== "training-query-static-atomic-1.0.0"
    || manifest.candidateId !== "GROUP-WEB-INTERACTION-128-TRAINING-QUERY"
    || !same(manifest.staticEvidenceProgress, { numerator: 6, denominator: 6 })
    || manifest.runtimeEvidence?.status !== "NOT_OBSERVED"
    || !same(manifest.runtimeEvidence.missing, MISSING_RUNTIME)
    || !same(manifest.coverageCredit, COVERAGE)
    || manifest.compatibilityScoreContribution !== 0
    || manifest.personalDataObserved !== false
    || manifest.credentialsUsed !== false
    || manifest.productionImport !== "HOLD") {
    fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_MANIFEST_INVALID", "root boundary");
  }
  const bindings = manifest.sourceBindings;
  if (!exactKeys(bindings, ["capabilityContract", "routineLedger", "modernRuntimeTask"])
    || !exactKeys(bindings.capabilityContract, ["path", "canonicalSha256"])
    || bindings.capabilityContract.path !== "scripts/hr-cutover/contracts/group-web-training-query-capability-v1.json"
    || !SHA256.test(bindings.capabilityContract.canonicalSha256 ?? "")
    || !exactKeys(bindings.routineLedger, ["path", "routineId", "routineCanonicalSha256"])
    || bindings.routineLedger.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || bindings.routineLedger.routineId !== "RULE-A2A639DDC9BC5AE9"
    || !SHA256.test(bindings.routineLedger.routineCanonicalSha256 ?? "")
    || !exactKeys(bindings.modernRuntimeTask, ["path", "canonicalSha256"])
    || bindings.modernRuntimeTask.path !== "scripts/hr-cutover/contracts/group-web-training-query-modern-runtime-task-v1.json"
    || !SHA256.test(bindings.modernRuntimeTask.canonicalSha256 ?? "")) {
    fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_MANIFEST_INVALID", "source bindings");
  }
  const routine = manifest.legacyRoutine;
  if (!exactKeys(routine, [
    "sourceName", "sourceArtifactSha256", "structuralHash", "businessCapability",
    "classificationEvidence", "parameters", "readTables", "joinPredicates", "logicSignals",
    "writeStatementCount", "personalDataTablesRead", "associationStatus",
  ])
    || routine.sourceName !== "web_trainquery"
    || !SHA256.test(routine.sourceArtifactSha256 ?? "")
    || !SHA256.test(routine.structuralHash ?? "")
    || routine.businessCapability !== "query_or_report_projection"
    || routine.classificationEvidence !== "table-dependency-and-name"
    || !same(routine.parameters, ["date1:datetime", "date2:datetime", "rightscope:varchar(31)"])
    || !same(routine.readTables, ["course", "departmentcode"])
    || !same(routine.joinPredicates, ["course.department=departmentcode.department"])
    || !same(routine.logicSignals, ["hierarchy_prefix_scope"])
    || routine.writeStatementCount !== 0
    || routine.personalDataTablesRead !== false
    || routine.associationStatus !== "capability_name_and_domain_candidate_only") {
    fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_MANIFEST_INVALID", "routine boundary");
  }
  if (!exactKeys(manifest.runtimeEvidence, ["status", "missing"])) {
    fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_MANIFEST_INVALID", "runtime evidence shape");
  }
  if (!Array.isArray(manifest.atomicInteractions)
    || manifest.atomicInteractions.length !== ATOMS.length
    || new Set(manifest.atomicInteractions.map(item => item.id)).size !== ATOMS.length) {
    fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_LIST_INVALID", "six unique atoms required");
  }
  for (let index = 0; index < ATOMS.length; index += 1) {
    const item = manifest.atomicInteractions[index];
    const [id, evidenceClass, status] = ATOMS[index];
    if (!exactKeys(item, ["id", "evidenceClass", "status", "runtimeObserved", "compatibilityScoreContribution"])
      || item.id !== id
      || item.evidenceClass !== evidenceClass
      || item.status !== status
      || item.runtimeObserved !== false
      || item.compatibilityScoreContribution !== 0) {
      fail("GROUP_WEB_TRAINING_STATIC_ATOMIC_LIST_INVALID", id);
    }
  }
}

function validateRoutine(manifest, routine) {
  const binding = manifest.sourceBindings?.routineLedger;
  const expected = manifest.legacyRoutine;
  const writeCount = ["insert", "update", "delete", "merge", "alter"]
    .reduce((sum, key) => sum + (routine?.statementProfile?.[key] ?? 0), 0);
  if (routine?.routineId !== binding?.routineId
    || sha256(routine) !== binding.routineCanonicalSha256
    || routine.sourceName !== expected?.sourceName
    || routine.sourceArtifactSha256 !== expected.sourceArtifactSha256
    || routine.structuralHash !== expected.structuralHash
    || routine.primaryDomain !== "training"
    || routine.businessCapability !== expected.businessCapability
    || routine.classificationEvidence !== expected.classificationEvidence
    || !same(routine.parameters.map(item => `${item.name}:${item.sourceType}`), expected.parameters)
    || !same(routine.readTables, expected.readTables)
    || !same(routine.joinPredicates, expected.joinPredicates)
    || !same(routine.logicSignals, expected.logicSignals)
    || writeCount !== expected.writeStatementCount
    || routine.writeTables.length !== 0
    || routine.dynamicWriteTables.length !== 0
    || routine.dynamicMutationStatus !== "none"
    || routine.readTables.includes("person")
    || expected.personalDataTablesRead !== false
    || expected.associationStatus !== "capability_name_and_domain_candidate_only"
    || routine.parityStatus !== "partial_domain_surface_rule_parity_pending"
    || routine.reviewStatus !== "atomic_logic_extracted_requires_business_parity_test") {
    fail("GROUP_WEB_TRAINING_STATIC_ROUTINE_INVALID", binding?.routineId ?? "missing routine");
  }
}

export function verifyGroupWebTrainingQueryStaticAtomicSources(manifest, { capability, capabilityReport, routine, modernTask, modernTaskReport }) {
  validateManifest(manifest);
  const bindings = manifest.sourceBindings;
  if (bindings?.capabilityContract?.canonicalSha256 !== sha256(capability)
    || capability?.candidate?.id !== manifest.candidateId
    || capability?.candidate?.legacyId !== 128
    || capability?.candidate?.staticSourceEvidence?.entryResolved !== true
    || capability?.candidate?.staticSourceEvidence?.forms !== 1
    || capability?.candidate?.staticSourceEvidence?.formActions !== 1
    || capability?.candidate?.staticSourceEvidence?.insertStatements !== 0
    || capability?.candidate?.staticSourceEvidence?.updateStatements !== 0
    || capability?.candidate?.staticSourceEvidence?.deleteStatements !== 0
    || capabilityReport?.status !== "PENDING_RUNTIME_PARITY"
    || capabilityReport?.compatibilityScoreContribution !== 0) {
    fail("GROUP_WEB_TRAINING_STATIC_CAPABILITY_INVALID", "legacyId=128");
  }
  validateRoutine(manifest, routine);
  if (bindings.modernRuntimeTask?.canonicalSha256 !== sha256(modernTask)
    || modernTaskReport?.status !== "MODERN_RUNTIME_TASK_READY_NOT_EXECUTED"
    || modernTaskReport?.apiTaskCount !== 5
    || modernTaskReport?.browserObservationCount !== 6
    || modernTaskReport?.legacyRuntime !== "PENDING"
    || modernTaskReport?.compatibilityScoreContribution !== 0) {
    fail("GROUP_WEB_TRAINING_STATIC_MODERN_CONTRACT_INVALID", "task readiness is not runtime evidence");
  }
  return {
    status: "STATIC_ATOMIC_CHAIN_CONFIRMED_RUNTIME_PENDING",
    candidateId: manifest.candidateId,
    staticAtomsConfirmed: manifest.staticEvidenceProgress.numerator,
    runtimeObservationsAccepted: 0,
    legacyRoutineAssociation: "CANDIDATE_ONLY",
    modernTaskStatus: "READY_NOT_EXECUTED",
    personalDataObserved: false,
    credentialsUsed: false,
    coverageCredit: manifest.coverageCredit,
    compatibilityScoreContribution: 0,
    gapCodes: [
      "GROUP_WEB_TRAINING_QUERY_PAGE_ROUTINE_LINK_NOT_OBSERVED",
      "GROUP_WEB_TRAINING_QUERY_RUNTIME_PARITY_NOT_OBSERVED",
    ],
    productionImport: "HOLD",
  };
}

function readJson(root, path) {
  const canonicalRoot = realpathSync(root);
  const candidate = resolve(canonicalRoot, path);
  const stat = lstatSync(candidate);
  const real = realpathSync(candidate);
  if (stat.isSymbolicLink() || !stat.isFile() || !real.startsWith(`${canonicalRoot}${sep}`)) {
    fail("GROUP_WEB_TRAINING_STATIC_SOURCE_PATH_INVALID", path);
  }
  return JSON.parse(readFileSync(real, "utf8"));
}

export function verifyGroupWebTrainingQueryStaticAtomic(root, manifest) {
  validateManifest(manifest);
  const capability = readJson(root, manifest.sourceBindings.capabilityContract.path);
  const routineLedger = readJson(root, manifest.sourceBindings.routineLedger.path);
  const modernTask = readJson(root, manifest.sourceBindings.modernRuntimeTask.path);
  const routine = routineLedger.routines?.find(item => item.routineId === manifest.sourceBindings.routineLedger.routineId);
  return verifyGroupWebTrainingQueryStaticAtomicSources(manifest, {
    capability,
    capabilityReport: verifyGroupWebTrainingQueryCapability(root, capability),
    routine,
    modernTask,
    modernTaskReport: validateGroupWebTrainingQueryModernRuntimeTask(root, modernTask),
  });
}
