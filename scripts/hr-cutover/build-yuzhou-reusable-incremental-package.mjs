#!/usr/bin/env node
import { originalYuzhouRecordExclusion, YUZHOU_RECORD_ORIGINAL_EXCLUSIONS_SHA256 } from "./yuzhou-record-original-exclusions.mjs";
import { projectYuzhouExtendedRecord, YUZHOU_RECORD_FIELD_COVERAGE } from "./yuzhou-record-incremental-projection.mjs";
import { projectYuzhouTrainingHistory, YUZHOU_TRAINING_FIELD_COVERAGE } from "./yuzhou-training-incremental-projection.mjs";
import { projectYuzhouInsurancePolicy, YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE } from "./yuzhou-insurance-policy-incremental-projection.mjs";
import { projectYuzhouFamily, YUZHOU_FAMILY_FIELD_COVERAGE } from "./yuzhou-family-incremental-projection.mjs";
import { projectYuzhouOrganizationRecords, orderHierarchyItems } from "./yuzhou-organization-incremental-projection.mjs";
/* global process, URL, structuredClone */
/**
 * Offline bridge from verified employee extracts and T2 contract staging to the bounded
 * Yuzhou incremental-import API package.  It deliberately has no database or
 * network adapter: the API owns preview/commit and its transactional ledger.
 */
import { verifyProfileSource, projectYuzhouProfile, YUZHOU_PROFILE_FIELD_COVERAGE, YUZHOU_PROFILE_ALIAS_EVIDENCE } from "./yuzhou-profile-incremental-projection.mjs";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { projectProductionT2Fields, verifyProductionT2StagedRecord } from "./production-t2-field-projection.mjs";
import { projectLegacyEmployeeState } from "./materialize-production-t0-decision-candidates.mjs";
import { verifyYuzhouJobStateDecisionArtifact } from "./yuzhou-job-state-decision-artifact-lib.mjs";

import { splitYuzhouIncrementalPackage, serializeIncrementalPackage, incrementalPackageBytes } from "./yuzhou-incremental-package-limits.mjs";

const RECIPE_VERSION = "yuzhou-reusable-incremental-v2";
const SOURCE_SYSTEM = "yuzhou-v10";
const SHA256 = /^[a-f0-9]{64}$/u;

const DOMAIN_ORDER = Object.freeze({ organization: 0, position: 1, employee: 2, profile: 3, contract: 4, family: 5, skill: 6, credential: 7, training_history: 8, insurance_policy: 9 });
const sha256 = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const fail = code => { throw new Error(code); };
const privateMode = path => (statSync(path).mode & 0o777) === 0o600;
const privateDirectory = path => (statSync(path).mode & 0o777) === 0o700;

export const YUZHOU_REUSABLE_INCREMENTAL_COVERAGE = Object.freeze({
  originalRecordExclusionsSha256: YUZHOU_RECORD_ORIGINAL_EXCLUSIONS_SHA256,
  trainingFieldCoverage: YUZHOU_TRAINING_FIELD_COVERAGE,
  insurancePolicyFieldCoverage: YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE,
  recordFieldCoverage: YUZHOU_RECORD_FIELD_COVERAGE,
  familyFieldCoverage: YUZHOU_FAMILY_FIELD_COVERAGE,
  profileFieldCoverage: YUZHOU_PROFILE_FIELD_COVERAGE,
  profileAliasEvidence: YUZHOU_PROFILE_ALIAS_EVIDENCE,
  supported: [
    {domain:"insurance_policy",sourceTable:"dbo.insure_method",adapter:"raw-policy-51-fields",dependency:"original T3 witness for existing source; stable source identity for new source",eligibility:"API authenticates original baseline or creates scoped policy and six factors; no activation, personnel eligibility, periods or financial posting"},
    {domain:"training_history",sourceTable:"dbo.trainhis",adapter:"raw-training-history-facts-memo-score",dependency:"verified dbo.person identity",eligibility:"API certifies original provenance or creates new source; published snapshot revisions require normal business workflow; reviewed score 0..100; no guessed test/provider/cost"},
    { domain:"skill",sourceTable:"dbo.knowhow",adapter:"raw-skill-three-fields",dependency:"verified dbo.person identity",eligibility:"API authenticates original baseline or creates new source; no inferred proficiency/date" },
    { domain:"credential",sourceTable:"dbo.ticket",adapter:"raw-credential-seven-fields",dependency:"verified dbo.person identity",eligibility:"API authenticates original baseline or creates new source; invalid dates and masked numbers omitted pending; attachment association pending" },
    { domain:"family",sourceTable:"dbo.family",adapter:"raw-family-seven-fields",dependency:"verified dbo.person identity",eligibility:"original baseline certified by API; invalid dates retained pending without clearing modern dates" },
    { domain:"organization", sourceTable:"dbo.departmentcode", adapter:"verified-t0-department", dependency:"source parent identity" },
    { domain:"position", sourceTable:"dbo.job", adapter:"verified-t0-job", dependency:"exact source organization and parent position identities" },
    { domain: "profile", sourceTable: "dbo.person.core_residue", adapter: "raw-person-core-profile", dependency: "verified dbo.person employee source identity", eligibility: "eight reviewed raw fields (six required, two optional aliases); T5 original baseline witness still certifies six fields with fields:{}" },
    { domain: "employee", sourceTable: "dbo.person", adapter: "raw-person-employee", dependency: "verified job-state decision artifact", eligibility: "bounded employee code/name, valid nullable hire date and mapped v2 job state" },
    { domain: "contract", sourceTable: "dbo.compact", adapter: "production-t2-field-projection", dependency: "existing dbo.person source identity and immutable contract-type binding", eligibility: "explicitly mapped draft, active, expired, terminated or cancelled source status" },
  ],
  pending: [
    { domain:"company_root_secondary_assignment_station", reason:"Unproven source semantics remain pending; no inferred root or name association" },
    { domain: "profile_extended_fields", reason: "Eight reviewed raw fields supported; remaining modern profile fields have explicit pending reasons in profileFieldCoverage; original baselines remain six-field-only" },
    { domain: "contract_type", reason: "API incremental contract DTO has no contract-type creation adapter" },
    { domain: "contract_change", reason: "API incremental contract DTO has no change-history adapter" },
    { domain: "contract_legacy_evidence", reason: "protected attachment/content binding remains a normal file-adapter follow-up" },
    { domain: "attendance_insurance_period_payroll_training_plan_reward_performance", reason: "outside the currently admitted reusable adapters; no record is discarded by this tool" },
  ],
});

function readJson(path, code) {
  if (!existsSync(path) || lstatSync(path).isSymbolicLink() || !statSync(path).isFile()) fail(code);
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { fail(code); }
}
function requireIso(value, code) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(value) || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}
function recipeSha256() {
  // Bind the actual verified projector bytes, not merely a local field list.
  // An unchanged source can therefore reuse the recipe, while mapper drift is
  // visible before package construction rather than silently changing output.
  const ruleFiles = ["../../packages/shared/src/hr-yuzhou-training-score-policy.json","yuzhou-insurance-policy-incremental-projection.mjs","legacy-insurance-policy-normalization.mjs","yuzhou-training-incremental-projection.mjs","yuzhou-record-original-exclusions.mjs","contracts/yuzhou-original-credential-exclusions-v1.json","yuzhou-record-incremental-projection.mjs","../../packages/shared/src/hr-yuzhou-record-incremental.ts","yuzhou-family-incremental-projection.mjs","t5-nonfile-field-projection.mjs","../../packages/shared/src/hr-yuzhou-family-incremental.ts","yuzhou-organization-incremental-projection.mjs","yuzhou-profile-incremental-projection.mjs", "t5-retained-source-reader.mjs", "production-t2-field-projection.mjs", "t2-contract-semantics.mjs", "production-import-target-model.mjs", "production-import-payload-generator.mjs", "contracts/production-import-target-model-v1.json", "yuzhou-job-state-decision-artifact-lib.mjs", "materialize-production-t0-decision-candidates.mjs", "../../packages/shared/src/hr-yuzhou-incremental.ts", "../../packages/shared/src/hr.ts", "../../packages/shared/src/hr-yuzhou-incremental-limits.json", "yuzhou-incremental-package-limits.mjs", "prepare-yuzhou-initial-baseline-witness.mjs", "production-import-sealed-plan-lib.mjs", "../../packages/shared/src/hr-yuzhou-initial-baseline.ts", "../../packages/shared/src/hr-yuzhou-profile-baseline.ts"];
  const ruleHashes = Object.fromEntries(ruleFiles.map(path => [path, sha256(readFileSync(fileURLToPath(new URL(path, import.meta.url))))]));
  return sha256(canonical({ recipeVersion: RECIPE_VERSION, sourceSystem: SOURCE_SYSTEM, adapterSha256: sha256(readFileSync(fileURLToPath(import.meta.url))), ruleHashes, fields: ["employeeCode", "fullName", "employmentStatus", "employmentType", "hireDate", "employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle", "contractStatus"] }));
}
export const YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 = recipeSha256();
function verifyInput(input) {
  if (!plain(input) || input.recipeVersion !== RECIPE_VERSION || input.recipeSha256 !== YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256 || input.sourceSystem !== SOURCE_SYSTEM || !Array.isArray(input.records) || !Array.isArray(input.employeeIndex) || !Array.isArray(input.employeeRecords)) fail("YUZHOU_REUSABLE_INCREMENTAL_INPUT_INVALID");
  requireIso(input.extractedAt, "YUZHOU_REUSABLE_INCREMENTAL_EXTRACTED_AT_INVALID");
  const employees = new Map();
  for (const entry of input.employeeIndex) {
    if (!plain(entry) || typeof entry.employeeCode !== "string" || !entry.employeeCode.trim() || entry.sourceTable !== "dbo.person" || typeof entry.sourceKey !== "string" || entry.sourceKey !== entry.employeeCode.trim()) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_INDEX_INVALID");
    const code = entry.employeeCode.trim(), identity = sha256(`${entry.sourceTable}\0${entry.sourceKey}`);
    if (employees.has(code)) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_AMBIGUOUS");
    employees.set(code, { sourceTable: entry.sourceTable, sourceKey: `sha256:${identity}` });
  }
  const states = new Map();
  if (input.records.length && !plain(input.contractStateResolutions)) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_RESOLUTION_REQUIRED");
  for (const [legacyState, declaration] of Object.entries(input.contractStateResolutions ?? {})) {
    if (typeof legacyState !== "string" || !legacyState.trim() || !plain(declaration) || !["draft", "active", "expired", "terminated", "cancelled"].includes(declaration.normalizedStatus) || typeof declaration.mappingEvidence !== "string" || !declaration.mappingEvidence.trim()) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_RESOLUTION_INVALID");
    if (states.has(legacyState.trim())) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_AMBIGUOUS");
    states.set(legacyState.trim(), Object.freeze({ normalizedStatus: declaration.normalizedStatus, mappingEvidence: declaration.mappingEvidence }));
  }
  const artifact = input.contractTypeMappingArtifact ?? null, types = new Map();
  if (input.records.length && !plain(artifact)) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_REQUIRED");
  if (artifact && (artifact.formatVersion !== 1 || artifact.sourceSystem !== SOURCE_SYSTEM || !plain(artifact.targetScope) || typeof artifact.targetScope.tenantId !== "string" || typeof artifact.targetScope.parkId !== "string" || !Array.isArray(artifact.bindings) || !SHA256.test(artifact.artifactSha256 ?? ""))) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_INVALID");
  if (artifact) {
  const expectedArtifact = sha256(canonical({ formatVersion: artifact.formatVersion, sourceSystem: artifact.sourceSystem, targetScope: artifact.targetScope, bindings: artifact.bindings }));
  if (artifact.artifactSha256 !== expectedArtifact) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_ARTIFACT_DRIFT");
  for (const binding of artifact.bindings) {
    if (!plain(binding) || binding.sourceTable !== "dbo.compacttypecode" || typeof binding.sourceKey !== "string" || !binding.sourceKey.trim() || binding.sourceIdentitySha256 !== sha256(`${binding.sourceTable}\0${binding.sourceKey}`) || binding.sourcePkCanonical !== `sha256:${binding.sourceIdentitySha256}` || typeof binding.sourceTypeName !== "string" || !binding.sourceTypeName.trim() || typeof binding.sourceTypeCode !== "string" || !binding.sourceTypeCode.trim() || binding.targetTable !== "hr_contract_type" || typeof binding.targetContractTypeId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(binding.targetContractTypeId) || !["loaded", "verified"].includes(binding.mappingStatus) || !SHA256.test(binding.mappingEvidenceSha256 ?? "")) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_BINDING_INVALID");
    const key = binding.sourceTypeName.trim(); if (types.has(key)) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_AMBIGUOUS");
    types.set(key, Object.freeze({ ...binding }));
  }}
  let jobStateDecisions = null, jobStateArtifactSha256 = null;
  if (input.employeeRecords.length) {
    if (!plain(input.jobStateDecisionArtifact)) fail("YUZHOU_REUSABLE_INCREMENTAL_JOB_STATE_ARTIFACT_REQUIRED");
    const verification = verifyYuzhouJobStateDecisionArtifact(input.jobStateDecisionArtifact);
    if (verification.materializationEligibility !== "MACHINE_CANDIDATE") fail("YUZHOU_REUSABLE_INCREMENTAL_JOB_STATE_ARTIFACT_NOT_MATERIALIZABLE");
    jobStateArtifactSha256 = sha256(canonical(input.jobStateDecisionArtifact));
    jobStateDecisions = new Map(input.jobStateDecisionArtifact.decisions.map(decision => [decision.sourceIdentitySha256, decision]));
  }
  return { employees, states, types, typeArtifact: artifact, jobStateDecisions, jobStateArtifactSha256 };
}
function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/u.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
function nullableDate(value, code) {
  if (value === null || value === undefined || value === "") return null;
  if (!validDate(value)) fail(code);
  return value;
}
function itemForEmployee(row, jobStateDecisions, hierarchy) {
  if (!plain(row) || row.sourceTable !== "dbo.person" || typeof row.sourceKey !== "string" || !row.sourceKey.trim() || !SHA256.test(row.sourceIdentitySha256 ?? "") || !SHA256.test(row.sourceRowSha256 ?? "") || !plain(row.source)) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_SOURCE_INVALID");
  if (row.sourceIdentitySha256 !== sha256(`${row.sourceTable}\0${row.sourceKey}`) || row.sourceRowSha256 !== sha256(canonical(row.source))) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_SOURCE_HASH_MISMATCH");
  const fullName = typeof row.source.fullName === "string" ? row.source.fullName.trim() : "";
  if (!fullName || fullName.length > 100) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_NAME_INVALID");
  if (row.sourceKey.trim().length > 64) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_CODE_INVALID");
  const stateCode = typeof row.source.legacyStatus === "string" ? row.source.legacyStatus.trim().toLowerCase() : "";
  const decision = jobStateDecisions?.get(sha256(`dbo.person.jobstate\0${stateCode}`));
  if (!decision || decision.decision !== "map") fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_STATE_UNRESOLVED");
  const hireDate = nullableDate(row.source.hireDate, "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_HIRE_DATE_INVALID");
  nullableDate(row.source.formalDate, "YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_FORMAL_DATE_INVALID");
  const fields = { employeeCode: row.sourceKey.trim(), fullName, employmentStatus: decision.targetEmploymentStatus, employmentType: projectLegacyEmployeeState(row.source.legacyStatus).fields.employment_type, hireDate };
  if (hierarchy) { if (!String(row.source.departmentCode ?? "").trim()) fail("YUZHOU_EMPLOYEE_ORG_REQUIRED"); fields.orgSourceKey=hierarchy.orgKey(String(row.source.departmentCode).trim()); fields.positionSourceKey=String(row.source.positionCode??"").trim()?hierarchy.positionKey(String(row.source.positionCode).trim()):null; }
  const item = { domain: "employee", sourceTable: row.sourceTable, sourceKey: `sha256:${row.sourceIdentitySha256}`, rowDigest: "", fields };
  item.rowDigest = sha256(canonical({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: null, fields: item.fields }));
  const carried = new Map([...(hierarchy ? [["departmentCode","orgSourceKey"],["positionCode","positionSourceKey"]] : []),["fullName", "fullName"], ["legacyStatus", "employmentStatus"], ["hireDate", "hireDate"]]);
  const fieldCoverage = Object.keys(row.source).sort().map(field => ({
    field,
    valuePresent: row.source[field] !== null && row.source[field] !== undefined && row.source[field] !== "",
    disposition: field === "formalDate" ? "pending_semantic_binding"
      : field === "departureDate" ? "pending_lifecycle_adapter"
        : carried.has(field) ? "carried"
          : "pending_api_adapter",
    ...(carried.has(field) ? { targetField: carried.get(field) } : {}),
  }));
  return { item, declaration: { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, sourceLegacyState: row.source.legacyStatus ?? null, normalizedStatus: decision.targetEmploymentStatus, stateDecisionSha256: sha256(canonical(decision)), disposition: "api_eligible" }, sourceEvidence: { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, rawSource: structuredClone(row.source), fieldCoverage } };
}
function contractFieldCoverage(projectedFields) {
  const apiFields = new Set(["employeeSourceKey", "employeeSourceTable", "contractTypeId", "contractNo", "startDate", "endDate", "probationEndDate", "workType", "positionTitle", "contractStatus", "contract_no", "start_date", "end_date", "probation_end_date", "work_type", "position_title", "status"]);
  return Object.entries(projectedFields).map(([field, value]) => ({ field, valuePresent: value !== null, disposition: apiFields.has(field) ? "carried" : "pending_api_adapter" }));
}
function itemForContract(row, employees, states, types) {
  verifyProductionT2StagedRecord(row);
  if (row.sourceTable !== "dbo.compact") fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_UNSUPPORTED");
  const status = states.get(String(row.source.legacyState ?? "").trim());
  if (!status) fail("YUZHOU_REUSABLE_INCREMENTAL_STATE_UNRESOLVED");
  const employee = employees.get(String(row.source.employeeCode ?? "").trim());
  if (!employee) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_MISSING");
  const type = types.get(String(row.source.typeName ?? "").trim());
  if (!type) fail("YUZHOU_REUSABLE_INCREMENTAL_TYPE_MISSING");
  const projected = projectProductionT2Fields(row, { status: status.normalizedStatus }).find(value => value.targetTable === "hr_contract");
  if (!projected) fail("YUZHOU_REUSABLE_INCREMENTAL_CONTRACT_PROJECTION_MISSING");
  const f = projected.targetFields;
  const declaration = { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, sourceLegacyState: row.source.legacyState, normalizedStatus: status.normalizedStatus, stateMappingEvidence: status.mappingEvidence, contractType: { sourcePkCanonical: type.sourcePkCanonical, sourceIdentitySha256: type.sourceIdentitySha256, sourceTypeCode: type.sourceTypeCode, sourceTypeName: type.sourceTypeName, targetContractTypeId: type.targetContractTypeId, mappingEvidenceSha256: type.mappingEvidenceSha256 } };
  const sourceEvidence = { sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, projectedFields: f, fieldCoverage: contractFieldCoverage({ employeeSourceKey: employee.sourceKey, employeeSourceTable: employee.sourceTable, contractTypeId: type.targetContractTypeId, contractNo: f.contract_no, startDate: f.start_date, endDate: f.end_date, probationEndDate: f.probation_end_date, workType: f.work_type, positionTitle: f.position_title, contractStatus: status.normalizedStatus, ...f }) };
  const fields = {
    employeeSourceKey: employee.sourceKey,
    employeeSourceTable: employee.sourceTable,
    contractTypeId: type.targetContractTypeId,
    contractNo: f.contract_no,
    startDate: f.start_date,
    endDate: f.end_date,
    probationEndDate: f.probation_end_date,
    workType: f.work_type,
    positionTitle: f.position_title,
    contractStatus: status.normalizedStatus,
  };
  const item = { domain: "contract", sourceTable: row.sourceTable, sourceKey: `sha256:${row.sourceIdentitySha256}`, rowDigest: "", fields };
  item.rowDigest = sha256(canonical({ domain: item.domain, sourceTable: item.sourceTable, sourceKey: item.sourceKey, sourceUpdatedAt: null, fields: item.fields }));
  return { item, declaration: { ...declaration, disposition: "api_eligible" }, sourceEvidence };
}
function profileAdmissionFields(input) {
  const reject = () => fail("YUZHOU_PROFILE_ADMISSION_INVALID");
  const exact = (value, keys) => plain(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
  const scope = value => exact(value, ["tenantId", "parkId"]) && Object.values(value).every(v => typeof v === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u.test(v));
  const operation = value => /^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(value ?? "");
  const w = input.profileBaselineWitness;
  if (w !== undefined && (!exact(w, ["version", "proof", "operationId", "bindingSha256"]) || w.version !== 1 || w.proof !== "original_t5_whole_set_v1" || !operation(w.operationId) || !SHA256.test(w.bindingSha256 ?? ""))) fail("YUZHOU_PROFILE_WITNESS_INVALID");
  // Raw omission maps are not evidence. Derive omissions only from an explicit,
  // digest-bound original-field custody declaration and an exact unchanged row.
  if (input.profileOmittedFields !== undefined) reject();
  if (input.profileAdmissionEvidence === undefined) return {};
  const e = input.profileAdmissionEvidence, a = e?.artifact;
  if (!exact(e, ["declaration", "targetScope", "artifactCanonicalSha256", "artifact"]) || e.declaration !== "caller_attests_original_unchanged_invalid_fields" || !scope(e.targetScope)
    || !exact(a, ["formatVersion", "artifactKind", "originalOperationId", "originalBindingSha256", "targetScope", "entries"]) || a.formatVersion !== 1 || a.artifactKind !== "yuzhou_original_profile_field_admissions"
    || !operation(a.originalOperationId) || !SHA256.test(a.originalBindingSha256 ?? "") || !scope(a.targetScope) || canonical(a.targetScope) !== canonical(e.targetScope)
    || !Array.isArray(a.entries) || e.artifactCanonicalSha256 !== sha256(canonical(a)) || (w && (w.operationId !== a.originalOperationId || w.bindingSha256 !== a.originalBindingSha256))) reject();
  const declarations = new Map(), fields = {};
  for (const entry of a.entries) {
    if (!exact(entry, ["sourceIdentitySha256", "sourceRowSha256", "decisionReceiptSha256", "reasonCode", "fields"]) || ![entry.sourceIdentitySha256, entry.sourceRowSha256, entry.decisionReceiptSha256].every(v => typeof v === "string" && SHA256.test(v))
      || typeof entry.reasonCode !== "string" || !/^[A-Z][A-Z0-9_]{0,127}$/u.test(entry.reasonCode) || !Array.isArray(entry.fields) || !entry.fields.length || new Set(entry.fields).size !== entry.fields.length
      || entry.fields.some(f => !["gender", "dateOfBirth", "personalMobile", "personalEmail", "address", "idNumber"].includes(f)) || declarations.has(entry.sourceIdentitySha256)) reject();
    declarations.set(entry.sourceIdentitySha256, entry);
  }
  for (const row of input.profileRecords ?? []) {
    const verified = verifyProfileSource(row), entry = declarations.get(row.sourceIdentitySha256);
    if (entry && entry.sourceRowSha256 === verified.sourceRowSha256) fields[row.sourceIdentitySha256] = entry.fields;
  }
  return fields;
}
function writePrivate(path, value) {
  if (existsSync(path)) fail("YUZHOU_REUSABLE_INCREMENTAL_OUTPUT_EXISTS");
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
  chmodSync(path, 0o600);
}

/** Builds an API DTO package and receipts only; never opens a database/socket. */
export function buildYuzhouReusableIncrementalPackage(input) {
  const { employees, states, types, typeArtifact, jobStateDecisions, jobStateArtifactSha256 } = verifyInput(input);
  const seen = new Set();
  const hierarchy=projectYuzhouOrganizationRecords(input.organizationRecords??[],input.positionRecords??[]);
  const employeeAdapted = input.employeeRecords.map(row => itemForEmployee(row, jobStateDecisions, (input.includeAssignments || Object.hasOwn(row.source,"departmentCode") || Object.hasOwn(row.source,"positionCode")) ? hierarchy : null));
  for (const adapted of employeeAdapted) {
    const code = adapted.item.fields.employeeCode;
    if (employees.has(code)) fail("YUZHOU_REUSABLE_INCREMENTAL_EMPLOYEE_AMBIGUOUS");
    employees.set(code, { sourceTable: adapted.item.sourceTable, sourceKey: adapted.item.sourceKey });
  }
  if (input.profileRecords !== undefined && !Array.isArray(input.profileRecords)) fail("YUZHOU_PROFILE_SOURCE_INVALID");
  const omittedFields = profileAdmissionFields(input);
  const profileAdapted = (input.profileRecords ?? []).map(row => projectYuzhouProfile(row, employees, {baselineWitness:input.profileBaselineWitness,aliasAcceptance:input.profileAliasAcceptance,omittedFields:omittedFields[row.sourceIdentitySha256] ?? []}));
  if(input.familyRecords!==undefined&&!Array.isArray(input.familyRecords))fail("YUZHOU_FAMILY_SOURCE_INVALID");
  const familyAdapted=(input.familyRecords??[]).map(row=>projectYuzhouFamily(row,employees));
  if(input.recordRecords!==undefined&&!Array.isArray(input.recordRecords))fail("YUZHOU_RECORD_SOURCE_INVALID");
  const recordSourceIdentities=new Set();
  const recordAdapted=(input.recordRecords??[]).map(row=>{
    const key=`${row?.sourceTable}\0${row?.sourceIdentitySha256}`;
    if(recordSourceIdentities.has(key))fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE");
    recordSourceIdentities.add(key);
    const originalExclusion=originalYuzhouRecordExclusion(row);
    if(originalExclusion)return originalExclusion;
    const projected=projectYuzhouExtendedRecord(row,employees);
    // Offline eligibility never grants database admission: preview/commit authenticate
    // the original receipts and current field baseline under the normal permissions.
    return {item:projected.candidate,declaration:{...projected.declaration,disposition:"api_eligible",admission:"server_original_or_new_source_proof_required"},sourceEvidence:{...projected.sourceEvidence,fieldCoverage:projected.sourceEvidence.fieldCoverage.map(entry=>({...entry,...(entry.disposition==="fixed_mapping_candidate"?{disposition:"supported"}:{})}))}};
  });
  if(input.trainingRecords!==undefined&&!Array.isArray(input.trainingRecords))fail("YUZHOU_TRAINING_SOURCE_INVALID");
  const trainingAdapted=(input.trainingRecords??[]).map(row=>{
    const projected=projectYuzhouTrainingHistory(row,employees);
    return {item:projected.candidate,declaration:{...projected.declaration,disposition:"api_eligible",admission:"server_original_or_new_source_proof_required"},sourceEvidence:{...projected.sourceEvidence,fieldCoverage:projected.sourceEvidence.fieldCoverage.map(entry=>({...entry,...(entry.disposition==="fixed_mapping_candidate"?{disposition:"supported"}:{})}))}};
  });
  if(input.insurancePolicyRecords!==undefined&&!Array.isArray(input.insurancePolicyRecords))fail("YUZHOU_INSURANCE_POLICY_SOURCE_INVALID");
  const witnesses=input.insurancePolicyBaselineWitnesses??{};
  if(!plain(witnesses))fail("YUZHOU_INSURANCE_POLICY_WITNESS_INVALID");
  const remaining=new Set(Object.keys(witnesses));
  const insuranceAdapted=(input.insurancePolicyRecords??[]).map(row=>{
    const projected=projectYuzhouInsurancePolicy(row),item=projected.candidate;
    for(const factor of item.fields.items)for(const [key,value] of Object.entries(factor)){
      if(["kind","variant"].includes(key)||value===null)continue;
      const [whole,fraction=""]=value.replace(/^[+-]/u,"").split(".");
      const scale=key.endsWith("Rate")?6:3;
      if((whole.replace(/^0+/u,"")||"0").length>18-scale||fraction.replace(/0+$/u,"").length>scale)fail("YUZHOU_INSURANCE_POLICY_TARGET_PRECISION_INVALID");
    }
    const witness=witnesses[item.sourceKey];
    if(witness!==undefined){
      if(!plain(witness)||Object.keys(witness).sort().join(",")!=="items,operationId,policy,source"||!/^yzprod-import-\d{8}T\d{6}Z-[a-f0-9]{12}$/u.test(witness.operationId??"")||!plain(witness.source)||!Number.isInteger(witness.source.id)||sha256(`dbo.insure_method\0${witness.source.id}`)!==item.sourceKey.slice(7)||!plain(witness.policy)||!Array.isArray(witness.items)||witness.items.length!==6)fail("YUZHOU_INSURANCE_POLICY_WITNESS_INVALID");
      for(const target of [witness.policy,...witness.items])if(!plain(target)||Object.keys(target).sort().join(",")!=="projection,targetId"||typeof target.targetId!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu.test(target.targetId)||!plain(target.projection))fail("YUZHOU_INSURANCE_POLICY_WITNESS_INVALID");
      item.insurancePolicyBaselineWitness=structuredClone(witness);remaining.delete(item.sourceKey);
    }
    return {item,declaration:{...projected.declaration,disposition:"api_eligible",admission:"server_original_or_new_source_proof_required"},sourceEvidence:{sourceIdentitySha256:row.sourceIdentitySha256,sourceRowSha256:row.sourceRowSha256,fieldCoverage:YUZHOU_INSURANCE_POLICY_FIELD_COVERAGE.map(field=>({...field,disposition:"supported"})),...(witness?{originalWitnessSha256:sha256(canonical(witness))}:{})}};
  });
  if(remaining.size)fail("YUZHOU_INSURANCE_POLICY_WITNESS_UNMATCHED");
  const adapted = [...insuranceAdapted, ...trainingAdapted, ...recordAdapted, ...familyAdapted, ...hierarchy.adapted, ...employeeAdapted, ...profileAdapted, ...input.records.map(row => itemForContract(row, employees, states, types))];
  const items = orderHierarchyItems(adapted.flatMap(value => value.item ? [value.item] : []).sort((left, right) => DOMAIN_ORDER[left.domain] - DOMAIN_ORDER[right.domain] || `${left.sourceTable}\0${left.sourceKey}`.localeCompare(`${right.sourceTable}\0${right.sourceKey}`)));
  const declarations = adapted.map(value => value.declaration).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  const sourceEvidence = adapted.map(value => value.sourceEvidence).sort((left, right) => left.sourceIdentitySha256.localeCompare(right.sourceIdentitySha256));
  for (const item of items) { const key = `${item.domain}\0${item.sourceTable}\0${item.sourceKey}`; if (seen.has(key)) fail("YUZHOU_REUSABLE_INCREMENTAL_SOURCE_DUPLICATE"); seen.add(key); }
  const manifestBinding = { ...(input.profileAliasAcceptance ? {profileAliasAcceptance:input.profileAliasAcceptance} : {}), ...(input.profileBaselineWitness ? { profileBaselineWitness: input.profileBaselineWitness } : {}), ...(input.profileAdmissionEvidence ? { profileAdmissionEvidence: input.profileAdmissionEvidence } : {}), recipeVersion: RECIPE_VERSION, recipeSha256: YUZHOU_REUSABLE_INCREMENTAL_RECIPE_SHA256, sourceSystem: SOURCE_SYSTEM, extractedAt: input.extractedAt, typeMappingArtifactSha256: typeArtifact?.artifactSha256 ?? null, typeMappingTargetScope: typeArtifact?.targetScope ?? null, jobStateArtifactSha256, itemSourceIdentities: items.map(item => item.sourceKey), itemRowDigests: items.map(item => item.rowDigest), declarations, sourceEvidence };
  const manifestId = `yuzhou-reusable-${sha256(canonical(manifestBinding))}`;
  const packageDtos = splitYuzhouIncrementalPackage({ version: 1, sourceSystem: SOURCE_SYSTEM, manifestId, extractedAt: input.extractedAt, items }, { alwaysSuffix:true });
  const packageDto = packageDtos.length === 1 ? packageDtos[0] : null;
  const coverage = { ...YUZHOU_REUSABLE_INCREMENTAL_COVERAGE, sourceFieldCoverage: sourceEvidence.map(value => ({ sourceIdentitySha256: value.sourceIdentitySha256, fieldCoverage: value.fieldCoverage })), pendingSourceRecords: declarations.filter(value => value.disposition !== "api_eligible").map(value => ({ sourceIdentitySha256: value.sourceIdentitySha256, disposition: value.disposition, reasonCode: value.reasonCode })) };
  return { packageDto, packageDtos, manifest: { formatVersion: 2, artifactKind: "yuzhou_reusable_incremental_package", productionImport: "HOLD", ...manifestBinding, manifestId, packages: packageDtos.map(value => ({ manifestId: value.manifestId, itemCount: value.items.length, packageBytes: incrementalPackageBytes(value), packageSha256: sha256(canonical(value)) })), supportedDomains: [...new Set(items.map(item => item.domain))], itemCount: items.length, disposition: items.length ? "api_package_ready" : "no_source_records" }, coverage };
}

export function materializeYuzhouReusableIncrementalPackage({ inputPath, outputDir }) {
  const source = resolve(inputPath), destination = resolve(outputDir);
  if (!privateMode(source)) fail("YUZHOU_REUSABLE_INCREMENTAL_INPUT_UNSAFE");
  if (existsSync(destination)) {
    if (lstatSync(destination).isSymbolicLink() || !statSync(destination).isDirectory() || !privateDirectory(destination)) fail("YUZHOU_REUSABLE_INCREMENTAL_OUTPUT_UNSAFE");
  } else { mkdirSync(destination, { recursive: true, mode: 0o700 }); chmodSync(destination, 0o700); }
  const result = buildYuzhouReusableIncrementalPackage(readJson(source, "YUZHOU_REUSABLE_INCREMENTAL_INPUT_INVALID"));
  const packagePaths = result.packageDtos.map((value, index) => `${destination}/${result.packageDtos.length === 1 ? "package.json" : `package-${String(index + 1).padStart(4, "0")}.json`}`), manifestPath = `${destination}/manifest.json`, coveragePath = `${destination}/coverage.json`;
  for (const [index, path] of packagePaths.entries()) writeFileSync(path, serializeIncrementalPackage(result.packageDtos[index]), {encoding:"utf8",flag:"wx",mode:0o600});
  writePrivate(manifestPath, result.manifest); writePrivate(coveragePath, result.coverage);
  return { packagePath: packagePaths.length === 1 ? packagePaths[0] : null, packagePaths, manifestPath, coveragePath, manifestId: result.manifest.manifestId, itemCount: result.manifest.itemCount, productionImport: "HOLD" };
}

function parseArgs(argv) {
  const result = {}; for (let index = 0; index < argv.length; index += 2) { const key = argv[index], value = argv[index + 1]; if (!key?.startsWith("--") || !value || Object.hasOwn(result, key)) fail("YUZHOU_REUSABLE_INCREMENTAL_ARGUMENT_INVALID"); result[key.slice(2)] = value; }
  if (Object.keys(result).sort().join(",") !== "input,output") fail("YUZHOU_REUSABLE_INCREMENTAL_ARGUMENT_INVALID"); return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const args = parseArgs(process.argv.slice(2)); process.stdout.write(`${JSON.stringify(materializeYuzhouReusableIncrementalPackage({ inputPath: args.input, outputDir: args.output }))}\n`); }
  catch (error) { process.stderr.write(`YUZHOU_REUSABLE_INCREMENTAL_FAILED: ${error.message}\n`); process.exitCode = 1; }
}
