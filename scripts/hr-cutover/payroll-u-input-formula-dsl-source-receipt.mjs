#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_LEDGER_PATH = "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json";
const EXPECTED_DSL_PATH = "apps/api/src/modules/hr/hr-payroll-formula-dsl.ts";
const EXPECTED_DSL_SYMBOLS = [
  "HR_PAYROLL_DSL_PARSER_VERSION",
  "HR_PAYROLL_DSL_ENGINE_VERSION",
  "parsePayrollFormula",
  "evaluatePayrollFormula",
  "projectLegacyPersonBasePayInput",
];
const EXPECTED_FAMILIES = new Map([
  ["u_inputbasepay", {
    routineId: "RULE-0883F6C1E60DB772",
    logicalReadField: "person._base",
    modernInputCode: "hr:基本工资",
    mappingPath: "scripts/hr-cutover/contracts/legacy-u-inputbasepay-modern-map-v1.json",
    parityPath: "scripts/hr-cutover/contracts/legacy-u-inputbasepay-parity-v1.json",
    adapterPath: EXPECTED_DSL_PATH,
    adapterSymbol: "projectLegacyPersonBasePayInput",
  }],
  ["u_inputjobpay", {
    routineId: "RULE-0F29EAC0B4E0DC44",
    logicalReadField: "person._base2",
    modernInputCode: "hr:岗位工资",
    mappingPath: "scripts/hr-cutover/contracts/legacy-u-inputjobpay-modern-map-v1.json",
    parityPath: "scripts/hr-cutover/contracts/legacy-u-inputjobpay-parity-v1.json",
    adapterPath: "apps/api/src/modules/hr/hr-payroll-person-job-routine-family.ts",
    adapterSymbol: "projectLegacyPersonJobPayInput",
  }],
]);
const EXPECTED_GAPS = new Map([
  ["u_inputbasepay", [
    "PAYROLL_U_INPUTBASEPAY_SOURCE_FIELD_IDENTITY_UNPROVEN",
    "PAYROLL_U_INPUTBASEPAY_MODERN_TARGET_EQUIVALENCE_UNPROVEN",
  ]],
  ["u_inputjobpay", [
    "PAYROLL_U_INPUTJOBPAY_SOURCE_AND_TARGET_IDENTITY_UNPROVEN",
    "PAYROLL_U_INPUTJOBPAY_DSL_REFERENCE_NOT_ALLOWLISTED",
  ]],
]);
const EXPECTED_DSL_STATUS = new Map([
  ["u_inputbasepay", "allowlisted_identity_pending"],
  ["u_inputjobpay", "not_allowlisted"],
]);

export class PayrollUInputFormulaDslSourceReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "PayrollUInputFormulaDslSourceReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new PayrollUInputFormulaDslSourceReceiptError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const sorted = values => [...values].sort((a, b) => a.localeCompare(b, "en"));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readBoundFile(repositoryRoot, evidence, label) {
  if (!object(evidence) || typeof evidence.path !== "string" || !evidence.path || !SHA256.test(evidence.sha256 ?? "")) {
    fail("PAYROLL_U_INPUT_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("PAYROLL_U_INPUT_EVIDENCE_DRIFT", label);
  return bytes;
}

function assertTokens(source, tokens, label) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
    fail("PAYROLL_U_INPUT_EVIDENCE_TOKEN_MISSING", label);
  }
}

function validateFamily({ family, ledger, dslSource, repositoryRoot }) {
  const expected = EXPECTED_FAMILIES.get(family?.canonicalFamily);
  if (!object(family) || !expected || expected.routineId !== family.routineId) {
    fail("PAYROLL_U_INPUT_FAMILY_IDENTITY_INVALID", String(family?.canonicalFamily));
  }
  if (family.sourceName !== family.canonicalFamily
    || family.logicalReadField !== expected.logicalReadField
    || family.modernInputCode !== expected.modernInputCode
    || family.mappingPath !== expected.mappingPath
    || family.parityPath !== expected.parityPath
    || family.adapterPath !== expected.adapterPath
    || family.adapterSymbol !== expected.adapterSymbol
    || family.sourceIdentityStatus !== "pending"
    || family.dslReferenceStatus !== EXPECTED_DSL_STATUS.get(family.canonicalFamily)
    || family.compatibilityCredit !== 0
    || !same(family.gapCodes, EXPECTED_GAPS.get(family.canonicalFamily))) {
    fail("PAYROLL_U_INPUT_GAP_CONTRACT_INVALID", family.canonicalFamily);
  }
  for (const key of ["sourceArtifactSha256", "mappingSha256", "paritySha256", "adapterSha256"]) {
    if (!SHA256.test(family[key] ?? "")) fail("PAYROLL_U_INPUT_EVIDENCE_INVALID", `${family.canonicalFamily}:${key}`);
  }

  const sourceRoutine = ledger.routines.find(row => row.routineId === family.routineId);
  if (!sourceRoutine
    || sourceRoutine.sourceName !== family.sourceName
    || sourceRoutine.canonicalFamily !== family.canonicalFamily
    || sourceRoutine.sourceArtifactSha256 !== family.sourceArtifactSha256
    || sourceRoutine.dynamicMutationStatus !== "unknown_requires_review") {
    fail("PAYROLL_U_INPUT_SOURCE_IDENTITY_DRIFT", family.canonicalFamily);
  }

  const mappingBytes = readBoundFile(repositoryRoot, { path: family.mappingPath, sha256: family.mappingSha256 }, `${family.canonicalFamily}:mapping`);
  const parityBytes = readBoundFile(repositoryRoot, { path: family.parityPath, sha256: family.paritySha256 }, `${family.canonicalFamily}:parity`);
  const adapterBytes = readBoundFile(repositoryRoot, { path: family.adapterPath, sha256: family.adapterSha256 }, `${family.canonicalFamily}:adapter`);
  const mapping = JSON.parse(mappingBytes.toString("utf8"));
  const parity = JSON.parse(parityBytes.toString("utf8"));
  const adapterSource = adapterBytes.toString("utf8");
  const parityRow = parity.routines?.[0];

  if (mapping.canonicalFamily !== family.canonicalFamily
    || mapping.sourceBinding?.sourceArtifactSha256 !== family.sourceArtifactSha256
    || mapping.sourceContract?.logicalReadField !== family.logicalReadField
    || mapping.review?.status !== "pending"
    || mapping.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUT_MAPPING_DRIFT", family.canonicalFamily);
  }
  if (parity.routines?.length !== 1
    || parityRow?.routineId !== family.routineId
    || parityRow?.canonicalFamily !== family.canonicalFamily
    || parityRow?.parityStatus !== "pending"
    || parityRow?.review?.status !== "pending"
    || parityRow?.semantics?.dynamicSql?.status !== "unresolved"
    || parity.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUT_PARITY_PROMOTION_UNPROVEN", family.canonicalFamily);
  }
  if (!adapterSource.includes(family.adapterSymbol)) fail("PAYROLL_U_INPUT_ADAPTER_SYMBOL_MISSING", family.canonicalFamily);
  const dslHasReference = dslSource.includes(JSON.stringify(family.modernInputCode.slice(3)));
  if ((family.dslReferenceStatus === "allowlisted_identity_pending") !== dslHasReference) fail("PAYROLL_U_INPUT_DSL_REFERENCE_STATUS_DRIFT", family.canonicalFamily);

  return {
    canonicalFamily: family.canonicalFamily,
    routineId: family.routineId,
    sourceArtifactSha256: family.sourceArtifactSha256,
    modernInputCode: family.modernInputCode,
    dslReferenceStatus: family.dslReferenceStatus,
    sourceIdentityStatus: "pending",
    gapCodes: [...family.gapCodes],
    compatibilityCredit: 0,
  };
}

export function buildPayrollUInputFormulaDslSourceReceipt({ contract, repositoryRoot }) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_payroll_u_input_formula_dsl_source_gap"
    || contract.scope !== "u_inputbasepay_and_u_inputjobpay_source_identity_to_modern_formula_dsl"
    || contract.sourceLedger?.path !== EXPECTED_LEDGER_PATH
    || contract.modernFormulaDsl?.path !== EXPECTED_DSL_PATH
    || !same(contract.modernFormulaDsl?.requiredSymbols, EXPECTED_DSL_SYMBOLS)
    || !same(contract.modernFormulaDsl?.requiredHrReferenceCodes, ["基本工资"])
    || !same(contract.modernFormulaDsl?.absentHrReferenceCodes, ["岗位工资"])
    || contract.receiptPolicy !== "aggregate_object_identities_hashes_statuses_and_gap_codes_only"
    || contract.requiredDecision !== "KEEP_PENDING"
    || contract.legacyDynamicSqlExecution !== "FORBIDDEN"
    || contract.containsPayrollValues !== false
    || contract.containsPersonalData !== false
    || contract.productionImport !== "HOLD") {
    fail("PAYROLL_U_INPUT_CONTRACT_INVALID", "identity or safety boundary");
  }
  if (!Array.isArray(contract.families)
    || contract.families.length !== EXPECTED_FAMILIES.size
    || !same(sorted(contract.families.map(row => row.canonicalFamily)), sorted(EXPECTED_FAMILIES.keys()))) {
    fail("PAYROLL_U_INPUT_FAMILY_COVERAGE_INVALID", "exact two-family scope required");
  }

  const ledgerBytes = readBoundFile(repositoryRoot, contract.sourceLedger, "routine ledger");
  const dslBytes = readBoundFile(repositoryRoot, contract.modernFormulaDsl, "modern formula DSL");
  const ledger = JSON.parse(ledgerBytes.toString("utf8"));
  const dslSource = dslBytes.toString("utf8");
  if (!Array.isArray(ledger.routines)) fail("PAYROLL_U_INPUT_SOURCE_LEDGER_INVALID", "routines");
  if (contract.modernFormulaDsl?.bindingStatus !== "verified_modern_capability_only") {
    fail("PAYROLL_U_INPUT_DSL_BINDING_INVALID", "binding status");
  }
  assertTokens(dslSource, contract.modernFormulaDsl.requiredSymbols, "modern formula DSL symbols");
  for (const code of contract.modernFormulaDsl.requiredHrReferenceCodes ?? []) {
    if (typeof code !== "string" || !dslSource.includes(JSON.stringify(code))) fail("PAYROLL_U_INPUT_DSL_REFERENCE_MISSING", String(code));
  }
  for (const code of contract.modernFormulaDsl.absentHrReferenceCodes ?? []) {
    if (typeof code !== "string" || dslSource.includes(JSON.stringify(code))) fail("PAYROLL_U_INPUT_DSL_ABSENCE_DRIFT", String(code));
  }

  const families = contract.families.map(family => validateFamily({ family, ledger, dslSource, repositoryRoot }));
  const allowlisted = families.filter(family => family.dslReferenceStatus === "allowlisted_identity_pending").length;
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_payroll_u_input_formula_dsl_source_receipt",
    scope: contract.scope,
    sourceLedgerSha256: contract.sourceLedger.sha256,
    modernFormulaDslSha256: contract.modernFormulaDsl.sha256,
    sourceRoutinesObserved: families.length,
    familiesBoundToDslSnapshot: families.length,
    dslReferencesAllowlisted: allowlisted,
    dslReferencesMissing: families.length - allowlisted,
    sourceIdentitiesVerified: 0,
    families,
    decision: "KEEP_PENDING",
    status: "SOURCE_AND_DSL_EVIDENCE_BOUND_IDENTITY_GAPS_REMAIN",
    compatibilityCredit: { numerator: 0, denominator: families.length },
    legacyDynamicSqlExecuted: false,
    containsPayrollValues: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-payroll-u-input-formula-dsl-source-gap-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(buildPayrollUInputFormulaDslSourceReceipt({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
