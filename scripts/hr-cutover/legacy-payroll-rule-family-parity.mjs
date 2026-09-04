import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export class LegacyPayrollRuleFamilyParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPayrollRuleFamilyParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyPayrollRuleFamilyParityError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const HASH = /^[0-9a-f]{64}$/u;
const EXPECTED_SOURCE_FIELDS = {
  salaryitems: [
    "scheme", "itemname", "description", "itemtype", "datatype", "printwidth", "expression", "addorsub",
    "istax", "notdec", "isuse", "myorder", "declen", "defvalue", "printreport", "itemtitle",
    "expression2", "expression3", "expression4", "expression5", "cit", "cit2", "cit3", "cit4", "cit5", "des",
  ],
  salaryequal: ["id", "scheme", "itemname", "expression", "cit", "myorder"],
};
const EXPECTED_DECLARED_INTEGER_FIELDS = {
  salaryitems: ["printwidth", "declen", "printreport"],
  salaryequal: [],
};
const EXPECTED_DYNAMIC_ROUTINES = {
  "RULE-0883F6C1E60DB772": "u_inputbasepay",
  "RULE-9C7540752ADD255D": "u_inputfromdeductpay",
  "RULE-53EDC7949DAE4E20": "u_inputfrompiece",
  "RULE-0F29EAC0B4E0DC44": "u_inputjobpay",
  "RULE-465D956E958EF4C3": "web_paycount",
  "RULE-15444560CB3C59BD": "web_payquery",
};

const isObject = value => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const assertString = (value, code, detail) => {
  if (typeof value !== "string" || !value.trim()) fail(code, detail);
};
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, "en"));

function validateEvidence(evidence, repositoryRoot, label) {
  if (!Array.isArray(evidence) || !evidence.length) fail("PAYROLL_RULE_EVIDENCE_MISSING", label);
  for (const [index, item] of evidence.entries()) {
    if (!isObject(item)) fail("PAYROLL_RULE_EVIDENCE_INVALID", `${label}:${index}`);
    assertString(item.path, "PAYROLL_RULE_EVIDENCE_INVALID", `${label}:${index}:path`);
    if (!Array.isArray(item.tokens) || !item.tokens.length) fail("PAYROLL_RULE_EVIDENCE_INVALID", `${label}:${index}:tokens`);
    const evidencePath = resolve(repositoryRoot, item.path);
    if (!existsSync(evidencePath)) fail("PAYROLL_RULE_EVIDENCE_FILE_MISSING", item.path);
    const content = readFileSync(evidencePath, "utf8");
    for (const token of item.tokens) {
      assertString(token, "PAYROLL_RULE_EVIDENCE_INVALID", `${label}:${index}:token`);
      if (!content.includes(token)) fail("PAYROLL_RULE_EVIDENCE_TOKEN_MISSING", `${item.path}:${token}`);
    }
  }
}

function validateSourceBinding(contract, routineLedgerBytes, repositoryRoot) {
  const binding = contract.sourceBinding;
  if (!isObject(binding) || !HASH.test(binding.routineLedgerSha256 ?? "")) fail("PAYROLL_RULE_SOURCE_BINDING_INVALID", "routineLedgerSha256");
  if (sha256(routineLedgerBytes) !== binding.routineLedgerSha256) fail("PAYROLL_RULE_SOURCE_LEDGER_HASH_MISMATCH", "routine ledger");
  if (!Array.isArray(binding.sourceObjects)) fail("PAYROLL_RULE_SOURCE_BINDING_INVALID", "sourceObjects");
  const objectNames = binding.sourceObjects.map(item => item?.name);
  if (JSON.stringify(sorted(objectNames)) !== JSON.stringify(sorted(Object.keys(EXPECTED_SOURCE_FIELDS)))) fail("PAYROLL_RULE_SOURCE_OBJECT_COVERAGE_INVALID", "sourceObjects");
  for (const source of binding.sourceObjects) {
    if (!isObject(source) || !Number.isSafeInteger(source.observedRows) || source.observedRows < 0 || !Array.isArray(source.expectedFields) || !Array.isArray(source.declaredIntegerFields)) fail("PAYROLL_RULE_SOURCE_BINDING_INVALID", String(source?.name));
    const expected = EXPECTED_SOURCE_FIELDS[source.name];
    if (!expected || JSON.stringify(sorted(source.expectedFields)) !== JSON.stringify(sorted(expected))) fail("PAYROLL_RULE_SOURCE_FIELD_DENOMINATOR_INVALID", String(source.name));
    if (JSON.stringify(sorted(source.declaredIntegerFields)) !== JSON.stringify(sorted(EXPECTED_DECLARED_INTEGER_FIELDS[source.name] ?? []))) fail("PAYROLL_RULE_SOURCE_INTEGER_DECLARATION_INVALID", String(source.name));
    validateEvidence(source.evidence, repositoryRoot, `source:${source.name}`);
  }
}

function validateFieldMappings(contract, repositoryRoot) {
  if (!Array.isArray(contract.fieldMappings)) fail("PAYROLL_RULE_FIELD_MAPPING_INVALID", "fieldMappings");
  const expectedKeys = Object.entries(EXPECTED_SOURCE_FIELDS).flatMap(([object, fields]) => fields.map(field => `${object}.${field}`));
  const seen = new Set();
  let verified = 0;
  const pendingGapCodes = [];
  for (const row of contract.fieldMappings) {
    if (!isObject(row)) fail("PAYROLL_RULE_FIELD_MAPPING_INVALID", "row");
    const key = `${row.sourceObject}.${row.sourceField}`;
    if (!expectedKeys.includes(key)) fail("PAYROLL_RULE_FIELD_MAPPING_UNKNOWN", key);
    if (seen.has(key)) fail("PAYROLL_RULE_FIELD_MAPPING_DUPLICATE", key);
    seen.add(key);
    if (!["verified", "pending"].includes(row.status)) fail("PAYROLL_RULE_FIELD_MAPPING_INVALID", `${key}:status`);
    assertString(row.transform, "PAYROLL_RULE_FIELD_MAPPING_INVALID", `${key}:transform`);
    assertString(row.nullContract, "PAYROLL_RULE_FIELD_MAPPING_INVALID", `${key}:nullContract`);
    if (!Array.isArray(row.targetFields) || !Array.isArray(row.evidence)) fail("PAYROLL_RULE_FIELD_MAPPING_INVALID", key);
    if (row.status === "verified") {
      if (!row.targetFields.length) fail("PAYROLL_RULE_VERIFIED_TARGET_MISSING", key);
      for (const target of row.targetFields) assertString(target, "PAYROLL_RULE_FIELD_MAPPING_INVALID", `${key}:target`);
      validateEvidence(row.evidence, repositoryRoot, `field:${key}`);
      if (row.gapCode !== undefined) fail("PAYROLL_RULE_VERIFIED_GAP_INVALID", key);
      verified += 1;
    } else {
      assertString(row.gapCode, "PAYROLL_RULE_PENDING_GAP_MISSING", key);
      if (row.evidence.length) fail("PAYROLL_RULE_PENDING_EVIDENCE_INVALID", key);
      pendingGapCodes.push(row.gapCode);
    }
  }
  const missing = expectedKeys.filter(key => !seen.has(key));
  if (missing.length) fail("PAYROLL_RULE_FIELD_MAPPING_MISSING", missing.join(","));
  return { total: expectedKeys.length, verified, pending: expectedKeys.length - verified, pendingGapCodes };
}

function validateDynamicRoutineGates(contract, routineLedger) {
  if (!Array.isArray(contract.dynamicRoutineGates) || !contract.dynamicRoutineGates.length) fail("PAYROLL_RULE_DYNAMIC_GATE_INVALID", "empty");
  const sourceById = new Map(routineLedger.routines.map(row => [row.routineId, row]));
  const gateIds = contract.dynamicRoutineGates.map(gate => gate?.routineId);
  if (new Set(gateIds).size !== gateIds.length || JSON.stringify(sorted(gateIds)) !== JSON.stringify(sorted(Object.keys(EXPECTED_DYNAMIC_ROUTINES)))) {
    fail("PAYROLL_RULE_DYNAMIC_GATE_COVERAGE_INVALID", "exact six-routine family required");
  }
  let verified = 0;
  for (const gate of contract.dynamicRoutineGates) {
    const source = sourceById.get(gate.routineId);
    if (!source || source.canonicalFamily !== gate.canonicalFamily || EXPECTED_DYNAMIC_ROUTINES[gate.routineId] !== gate.canonicalFamily) fail("PAYROLL_RULE_DYNAMIC_SOURCE_MISMATCH", String(gate.routineId));
    if (!source.logicSignals?.includes("dynamic_sql")) fail("PAYROLL_RULE_DYNAMIC_CLASSIFICATION_MISMATCH", gate.routineId);
    if (!["unresolved", "resolved"].includes(gate.status)) fail("PAYROLL_RULE_DYNAMIC_GATE_INVALID", gate.routineId);
    if (gate.status === "unresolved") {
      if (gate.compatibilityCredit !== 0) fail("PAYROLL_RULE_UNRESOLVED_DYNAMIC_CREDIT", gate.routineId);
    } else {
      if (gate.compatibilityCredit !== 1 || !HASH.test(gate.reviewEvidenceSha256 ?? "") || !Array.isArray(gate.resolvedTargets) || !gate.resolvedTargets.length) {
        fail("PAYROLL_RULE_DYNAMIC_RESOLUTION_INCOMPLETE", gate.routineId);
      }
      verified += 1;
    }
  }
  return { total: contract.dynamicRoutineGates.length, verified, pending: contract.dynamicRoutineGates.length - verified };
}

function validateModernContracts(contract, repositoryRoot) {
  if (!Array.isArray(contract.modernBehaviorContracts) || !contract.modernBehaviorContracts.length) fail("PAYROLL_RULE_MODERN_BEHAVIOR_INVALID", "empty");
  let verified = 0;
  for (const behavior of contract.modernBehaviorContracts) {
    assertString(behavior.id, "PAYROLL_RULE_MODERN_BEHAVIOR_INVALID", "id");
    if (!["verified", "pending"].includes(behavior.status)) fail("PAYROLL_RULE_MODERN_BEHAVIOR_INVALID", behavior.id);
    if (behavior.status === "verified") {
      validateEvidence(behavior.evidence, repositoryRoot, `behavior:${behavior.id}`);
      verified += 1;
    }
  }
  const surfaces = contract.modernSurfaces;
  if (!isObject(surfaces)) fail("PAYROLL_RULE_MODERN_SURFACE_INVALID", "root");
  for (const key of ["services", "apis", "pages", "tests"]) {
    if (!Array.isArray(surfaces[key]) || !surfaces[key].length) fail("PAYROLL_RULE_MODERN_SURFACE_INVALID", key);
    for (const value of surfaces[key]) assertString(value, "PAYROLL_RULE_MODERN_SURFACE_INVALID", key);
  }
  for (const path of [...surfaces.services, ...surfaces.pages, ...surfaces.tests]) {
    if (!existsSync(resolve(repositoryRoot, path))) fail("PAYROLL_RULE_MODERN_SURFACE_FILE_MISSING", path);
  }
  validateEvidence(surfaces.surfaceEvidence, repositoryRoot, "modernSurfaces");
  return { total: contract.modernBehaviorContracts.length, verified, pending: contract.modernBehaviorContracts.length - verified };
}

export function evaluateLegacyPayrollRuleFamilyParity({ contract, routineLedgerBytes, repositoryRoot }) {
  if (!isObject(contract) || contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_payroll_rule_family_parity") fail("PAYROLL_RULE_CONTRACT_IDENTITY_INVALID", "root");
  if (contract.family !== "payroll_item_definition_and_formula_dependency" || contract.productionImport !== "HOLD") fail("PAYROLL_RULE_CONTRACT_BOUNDARY_INVALID", "root");
  validateSourceBinding(contract, routineLedgerBytes, repositoryRoot);
  const routineLedger = JSON.parse(routineLedgerBytes.toString("utf8"));
  const fields = validateFieldMappings(contract, repositoryRoot);
  const routines = validateDynamicRoutineGates(contract, routineLedger);
  const modernBehaviors = validateModernContracts(contract, repositoryRoot);
  const complete = fields.pending === 0 && routines.pending === 0 && modernBehaviors.pending === 0;
  return {
    ok: true,
    status: complete ? "COMPLETE" : "STRUCTURAL_MAPPING_READY_SEMANTIC_PARITY_PENDING",
    sourceRowsObserved: contract.sourceBinding.sourceObjects.reduce((sum, item) => sum + item.observedRows, 0),
    fields: { ...fields, verifiedPercent: Number(((fields.verified / fields.total) * 100).toFixed(2)) },
    dynamicRoutines: { ...routines, verifiedPercent: Number(((routines.verified / routines.total) * 100).toFixed(2)) },
    modernBehaviors: { ...modernBehaviors, verifiedPercent: Number(((modernBehaviors.verified / modernBehaviors.total) * 100).toFixed(2)) },
    denominatorRule: "Every declared source field counts even when every source row or field value is empty; unresolved dynamic SQL receives zero compatibility credit.",
    productionImport: "HOLD",
  };
}
