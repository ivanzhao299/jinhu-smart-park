#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE = Object.freeze({
  routineId: "RULE-D7708D3A5CB7696D",
  sourceName: "bs_AssCreateRecord",
  canonicalFamily: "bs_AssCreateRecord",
  sourceArtifact: "SQL_STORED_PROCEDURE_bs_AssCreateRecord_sql",
  sourceArtifactSha256: "2981b6a7dbabe949c03d25d17971146e9939344e0051ecd8d52aa90a984a8e9d",
  structuralHash: "97f878a43dabfdcca660851f78c62b896e94d6b6203799cab71a4453d66abb59",
});
const EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  assitemFieldMap: "scripts/hr-cutover/contracts/legacy-performance-assitem-field-map-v1.json",
  assessmentdetailFieldMap: "scripts/hr-cutover/contracts/legacy-performance-assessmentdetail-field-map-v1.json",
  modernSchema: "database/migrations/000258_hr_performance_template_planning.sql",
  modernReviewController: "apps/api/src/modules/hr/hr-performance-review.controller.ts",
  legacyReadController: "apps/api/src/modules/hr/hr-performance-legacy.controller.ts",
  legacyReadService: "apps/api/src/modules/hr/hr-performance-legacy.service.ts",
  modernPage: "apps/web/app/hr/performance/HrPerformanceClient.tsx",
  legacyPanel: "apps/web/app/hr/performance/HrPerformanceLegacyPanel.tsx",
  permissionContract: "packages/shared/src/hr.ts",
});
const PARAMETERS = Object.freeze([
  [1, "asssessionid", "int", "drift"],
  [2, "person", "varchar(20)", "drift"],
  [3, "lb", "int", "drift"],
]);
const READS = Object.freeze([
  ["person", ["person", "assessment"]],
  ["assessmentmaster", ["person", "asssessionid"]],
  ["assitem", ["id", "assid"]],
  ["assessmentdetail", ["person", "asssessionid", "assitemid"]],
  ["asssour", ["person", "asssessionid", "assitemid", "lb"]],
]);
const WRITES = Object.freeze([
  ["assessmentmaster", ["asssessionid", "person"], ["person", "asssessionid"]],
  ["assessmentdetail", ["asssessionid", "person", "assitemid"], ["person", "asssessionid", "assitemid"]],
  ["asssour", ["asssessionid", "person", "assitemid", "lb"], ["person", "asssessionid", "assitemid", "lb"]],
]);
const BRANCHES = Object.freeze([
  "B01_REQUIRED_INPUT_NULL",
  "B02_LB_NULL_DEFAULT",
  "B03_LB_NONNULL_PRESERVE",
  "B04_ASSESSMENT_UNRESOLVED",
  "B05_MASTER_MISSING",
  "B06_MASTER_EXISTS",
  "B07_ITEM_RESULT_SET",
  "B08_ITEM_SET_EMPTY",
  "B09_DETAIL_MISSING",
  "B10_DETAIL_EXISTS",
  "B11_SOURCE_MISSING",
  "B12_SOURCE_EXISTS",
  "B13_DETAIL_CURSOR_TERMINATES",
  "B14_SOURCE_CURSOR_TERMINATES",
]);
const GAPS = Object.freeze([
  "ASS_CREATE_RECORD_ID_GENERATION_DRIFT",
  "ASS_CREATE_RECORD_PERSON_IDENTITY_UNRESOLVED",
  "ASS_CREATE_RECORD_SESSION_IDENTITY_UNRESOLVED",
  "ASS_CREATE_RECORD_ITEM_RELATION_UNRESOLVED",
  "ASS_CREATE_RECORD_LB_SEMANTICS_CONFLICT",
  "ASS_CREATE_RECORD_TRANSACTION_AND_RACE_PARITY_MISSING",
  "ASS_CREATE_RECORD_EXACT_API_AND_PAGE_ACTION_MISSING",
]);

export class LegacyBsAssCreateRecordContractError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyBsAssCreateRecordContractError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyBsAssCreateRecordContractError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");

function rejectFalsePromotion(value, trail = "contract") {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectFalsePromotion(child, `${trail}[${index}]`));
    return;
  }
  if (!object(value)) {
    if (["verified", "equivalent", "approved", "complete"].includes(String(value).toLowerCase())) {
      fail("ASS_CREATE_RECORD_FALSE_PARITY_PROMOTION", trail);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) rejectFalsePromotion(child, `${trail}.${key}`);
}

function validateSafety(contract) {
  if (contract.status !== "pending"
    || !same(contract.compatibilityCredit, { numerator: 0, denominator: 1 })) {
    fail("ASS_CREATE_RECORD_FALSE_PARITY_PROMOTION", "status or compatibility credit");
  }
  if (contract.productionImport !== "HOLD"
    || contract.productionMutationAllowed !== false
    || contract.nonClaims?.productionWriteAuthorized !== false
    || contract.nonClaims?.productionReadiness !== "NOT_CLAIMED"
    || contract.nonClaims?.businessParity !== "NOT_CLAIMED") {
    fail("ASS_CREATE_RECORD_PRODUCTION_WRITE_FORBIDDEN", "production boundary");
  }
  for (const flag of ["sourceRowsRead", "sourceRowValuesStored", "personalDataStored", "salaryDataStored", "credentialsStored", "privatePathsStored"]) {
    if (contract.nonClaims?.[flag] !== false) fail("ASS_CREATE_RECORD_SAFETY_BOUNDARY_INVALID", flag);
  }
  const serialized = JSON.stringify(contract);
  if (/\/Users\/|\/private\/|Downloads|password|credentialValue|salaryAmount|employeeName/iu.test(serialized)) {
    fail("ASS_CREATE_RECORD_PRIVATE_CONTENT_FORBIDDEN", "contract content");
  }
  rejectFalsePromotion(contract);
}

function validateRoot(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_bs_ass_create_record_business_contract"
    || contract.contractVersion !== "1.0.0"
    || contract.sourceSystem !== "yuzhou-v10-client-database") {
    fail("ASS_CREATE_RECORD_CONTRACT_INVALID", "root identity");
  }
  if (!same(contract.sourceBinding, {
    ...ROUTINE,
    sourceDdlArtifactSha256: "4bc267b5b6b5f15cf367ec38caaf4bc2559ebe0666fd2cb9fdecd406c2ec1f2e",
  })) fail("ASS_CREATE_RECORD_SOURCE_BINDING_INVALID", "routine identity or hash");
  if (!same(contract.familyReview?.canonicalFamilyMembers, [ROUTINE.sourceName])
    || !same(contract.familyReview?.historicalVariants, [])
    || contract.familyReview?.variantSearchResult !== "exactly_one_member_in_controlled_212_routine_ledger"
    || !String(contract.familyReview?.variantRule ?? "").includes("bak_old_bak2_bak3_and_year_suffix")) {
    fail("ASS_CREATE_RECORD_FAMILY_COVERAGE_INVALID", "canonical family or variants");
  }
}

function readEvidence(repositoryRoot, contract) {
  if (!object(contract.repositoryEvidence)
    || !same(Object.keys(contract.repositoryEvidence).sort(), Object.keys(EVIDENCE).sort())) {
    fail("ASS_CREATE_RECORD_EVIDENCE_SET_INVALID", "coverage");
  }
  return Object.fromEntries(Object.entries(EVIDENCE).map(([role, path]) => {
    const binding = contract.repositoryEvidence[role];
    if (!object(binding) || binding.path !== path || !SHA256.test(binding.sha256 ?? "")) {
      fail("ASS_CREATE_RECORD_EVIDENCE_BINDING_INVALID", role);
    }
    const bytes = readFileSync(resolve(repositoryRoot, path));
    if (digest(bytes) !== binding.sha256) fail("ASS_CREATE_RECORD_EVIDENCE_DRIFT", role);
    return [role, bytes];
  }));
}

function validateLedger(bytes) {
  const ledger = JSON.parse(bytes.toString("utf8"));
  const family = ledger.routines?.filter(row => row.canonicalFamily === ROUTINE.canonicalFamily) ?? [];
  if (family.length !== 1) fail("ASS_CREATE_RECORD_FAMILY_COVERAGE_INVALID", String(family.length));
  const row = family[0];
  if (row.routineId !== ROUTINE.routineId
    || row.kind !== "procedure"
    || row.sourceName !== ROUTINE.sourceName
    || row.sourceArtifact !== ROUTINE.sourceArtifact
    || row.sourceArtifactSha256 !== ROUTINE.sourceArtifactSha256
    || row.structuralHash !== ROUTINE.structuralHash
    || row.primaryDomain !== "performance"
    || !same(row.parameters, PARAMETERS.map(([, name, sourceType]) => ({ name, sourceType })))
    || !same(row.readTables, ["assessmentdetail", "assessmentmaster", "assitem", "asssour", "cur", "person"])
    || !same(row.writeTables, ["assessmentdetail", "assessmentmaster", "asssour"])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.calledRoutines, [])
    || !same(row.logicSignals, ["conditional_branch", "cursor"])
    || !same(row.statementProfile, { select: 9, insert: 3, update: 0, delete: 0, merge: 0, alter: 0 })
    || row.parityStatus !== "partial_domain_surface_rule_parity_pending"
    || row.reviewStatus !== "atomic_logic_extracted_requires_business_parity_test") {
    fail("ASS_CREATE_RECORD_SOURCE_LEDGER_DRIFT", ROUTINE.sourceName);
  }
}

function validateParameters(contract) {
  const actual = contract.parameters?.map(row => [row.ordinal, row.sourceName, row.sourceType, row.classification]);
  if (!same(actual, PARAMETERS)
    || contract.parameters?.[0]?.nullSemantics !== "null_returns_scalar_zero_before_any_write"
    || contract.parameters?.[1]?.nullSemantics !== "null_returns_scalar_zero_before_any_write"
    || contract.parameters?.[1]?.typeRisk !== "parameter_width_20_exceeds_person_and_fact_column_width_10"
    || contract.parameters?.[2]?.nullSemantics !== "null_defaults_to_integer_1") {
    fail("ASS_CREATE_RECORD_PARAMETER_CONTRACT_INVALID", "parameters or null/default semantics");
  }
}

function validateReadWrite(contract) {
  const reads = contract.reads?.map(row => [row.sourceTable, row.fields]);
  if (!same(reads, READS)) fail("ASS_CREATE_RECORD_READ_CONTRACT_INVALID", "read tables or fields");
  const writes = contract.writes?.map(row => [
    row.sourceTable,
    row.insertedFields?.map(field => field.field),
    row.logicalExistenceKey,
  ]);
  if (!same(writes, WRITES)) fail("ASS_CREATE_RECORD_WRITE_TARGET_MISSING", "three exact write targets and field mappings are required");
  for (const write of contract.writes) {
    if (!write.operation.startsWith("insert_if_missing")
      || write.classification !== "drift"
      || !String(write.omittedFieldSemantics).startsWith("id_and")) {
      fail("ASS_CREATE_RECORD_WRITE_CONTRACT_INVALID", write.sourceTable);
    }
  }
}

function validateBranchesAndLoops(contract) {
  const ids = contract.branches?.map(row => row.id);
  if (!same(ids, BRANCHES)
    || contract.branches.some(row => typeof row.condition !== "string" || !row.condition || typeof row.effect !== "string" || !row.effect)) {
    fail("ASS_CREATE_RECORD_BRANCH_MISSING", "all conditions and effects are required");
  }
  if (!same(contract.loops?.map(row => row.id), ["L01_DETAIL_ITEMS", "L02_SCORE_SOURCE_ITEMS"])
    || contract.loops.some(row => row.ordering !== "none_guaranteed" || row.emptyPath !== "zero_iterations")) {
    fail("ASS_CREATE_RECORD_LOOP_CONTRACT_INVALID", "two unordered cursor passes are required");
  }
  if (!Array.isArray(contract.emptyAndNullPaths)
    || contract.emptyAndNullPaths.length !== 10
    || !contract.emptyAndNullPaths.includes("empty_assitem_set_can_leave_only_the_master_insert")
    || !contract.emptyAndNullPaths.includes("nonnull_lb_outside_documented_values_is_not_rejected")) {
    fail("ASS_CREATE_RECORD_EMPTY_PATH_MISSING", "empty and null paths");
  }
}

function validateDefaultsAndCalculations(contract) {
  const defaults = contract.defaultsAndOmittedFields;
  if (!same(defaults?.procedureDefaults, [{ field: "lb", defaultExpression: "integer_1_when_input_is_null" }])
    || defaults?.assessmentmaster?.id !== "not_null_without_controlled_ddl_default_but_omitted_by_routine"
    || defaults?.assessmentmaster?.omittedNullableFields?.length !== 18
    || !same(defaults?.assessmentmaster?.explicitDefaultsUsed, [])
    || defaults?.assessmentdetail?.id !== "not_null_without_controlled_ddl_default_but_omitted_by_routine"
    || !same(defaults?.assessmentdetail?.omittedNullableFields, ["selfvalue", "mitemvalue", "itemvalue", "xitemvalue", "citemvalue", "selfgrade", "assgrade", "appraisal"])
    || !same(defaults?.assessmentdetail?.explicitDefaultsUsed, ["itemvalue_defaults_to_numeric_zero"])
    || defaults?.asssour?.id !== "not_null_without_controlled_ddl_default_but_omitted_by_routine"
    || !same(defaults?.asssour?.omittedNullableFields, ["itemvalue", "assgrade", "appraisal"])
    || !same(defaults?.asssour?.explicitDefaultsUsed, [])) {
    fail("ASS_CREATE_RECORD_DEFAULT_CONTRACT_INVALID", "procedure or omitted-column defaults");
  }
  if (!same(contract.calculations?.map(row => [row.id, row.rounding]), [
    ["C01_EFFECTIVE_LB", "none"],
    ["C02_ASSESSMENT_RESOLUTION", "none"],
    ["C03_ITEM_SET", "none"],
    ["C04_SCORE_CALCULATION", "not_applicable"],
  ]) || contract.calculations.some(row => typeof row.expression !== "string" || !row.expression)) {
    fail("ASS_CREATE_RECORD_CALCULATION_CONTRACT_INVALID", "calculation or rounding semantics");
  }
}

function validateBehavior(contract) {
  if (contract.outputs?.earlyExit !== "single_row_single_unnamed_integer_zero_result_set"
    || contract.outputs?.resolvedPath !== "zero_or_more_assitem_id_rows_without_order_by_before_cursor_writes"
    || contract.outputs?.successScalar !== "none"
    || contract.transactionAndErrors?.explicitTransaction !== false
    || contract.transactionAndErrors?.tryCatch !== false
    || contract.transactionAndErrors?.lockingHints !== false
    || contract.transactionAndErrors?.errorTranslation !== false
    || !String(contract.transactionAndErrors?.failureSemantics).includes("partial_master_detail_or_source_state")
    || contract.repeatExecution?.databaseEnforcedLogicalUniqueness !== false
    || !String(contract.repeatExecution?.raceRisk).includes("duplicates")) {
    fail("ASS_CREATE_RECORD_ERROR_AND_REPEAT_CONTRACT_INVALID", "output, transaction, error or race semantics");
  }
  if (!same(contract.references?.calledFunctions, [])
    || !same(contract.references?.calledProcedures, [])
    || !same(contract.references?.controlledLedgerTriggersOnWriteTargets, [])
    || contract.references?.dynamicSql !== "none"
    || contract.references?.triggerConclusion !== "none_in_controlled_ledger_not_an_unbounded_server_claim"
    || !same(contract.references?.declaredRelations, ["assessmentdetail.assitemid_to_assitem.id"])
    || contract.references?.undeclaredRoutineRelations?.length !== 5
    || contract.references?.ledgerPseudoObject !== "cur_is_a_cursor_identifier_not_a_business_table") {
    fail("ASS_CREATE_RECORD_REFERENCE_CONTRACT_INVALID", "routine, trigger or relation references");
  }
  if (contract.sourceSemanticConflict?.classification !== "drift"
    || !String(contract.sourceSemanticConflict?.routineComment).includes("1_master_2_item_3_collection")
    || !String(contract.sourceSemanticConflict?.tableDdlComment).includes("0_self_1_superior_2_subordinate_3_customer")
    || !String(contract.sourceSemanticConflict?.decision).startsWith("do_not_resolve")) {
    fail("ASS_CREATE_RECORD_LB_SEMANTICS_CONFLICT_MISSING", "lb comments");
  }
}

function validateClassificationAndSurface(contract) {
  for (const key of ["compatible", "dormant", "drift"]) {
    if (!Array.isArray(contract.schemaAssessment?.[key]) || contract.schemaAssessment[key].length === 0) {
      fail("ASS_CREATE_RECORD_CLASSIFICATION_MISSING", key);
    }
  }
  if (!contract.schemaAssessment.dormant.includes("empty_source_tables_or_nullable_columns_do_not_remove_any_frozen_branch")
    || contract.schemaAssessment.drift.length < 9) {
    fail("ASS_CREATE_RECORD_CLASSIFICATION_MISSING", "empty-path preservation or schema drift");
  }
  const surface = contract.modernSurface;
  if (surface?.page !== "/hr/performance"
    || surface.pagePermission !== "hr:performance"
    || !same(surface.definitionReadPermissions, ["hr:performance_template:read", "hr:performance_template:manage"])
    || !same(surface.resultReadPermissions, ["hr:performance:read", "hr:performance:team_read", "hr:performance:self_read"])
    || surface.candidateWritePermission !== "hr:performance:manage"
    || surface.exactCreateRecordEndpoint !== "missing"
    || surface.exactCreateRecordAction !== "missing"
    || [surface.personIdentityBinding, surface.sessionIdentityBinding, surface.itemIdentityBinding, surface.lbRoleBinding].some(value => value !== "pending")) {
    fail("ASS_CREATE_RECORD_MODERN_SURFACE_INVALID", "page, API, permission or identity gap");
  }
  if (!same(contract.gapCodes, GAPS)) fail("ASS_CREATE_RECORD_GAP_SET_INVALID", "reason codes");
}

function validateModernEvidence(evidence) {
  const text = role => evidence[role].toString("utf8");
  const requirements = {
    modernSchema: ["CREATE TABLE hr_performance_cycle_employee", "UNIQUE(tenant_id,park_id,cycle_id,employee_id)", "REFERENCES hr_employee(tenant_id,park_id,id)"],
    modernReviewController: ["@Controller(\"hr/performance-v2\")", "HR_PERFORMANCE_MANAGE", "IdempotencyInterceptor", "@AuditLog"],
    legacyReadController: ["@Controller(\"hr/performance-legacy\")", "HR_PERFORMANCE_TEMPLATE_READ", "HR_PERFORMANCE_TEAM_READ", "HR_PERFORMANCE_SELF_READ"],
    legacyReadService: ["recordHrSensitiveRead", "/hr/performance-legacy/results", "/hr/performance-legacy/masters"],
    modernPage: ["HR_PERMISSIONS.HR_PERFORMANCE_PAGE", "HR_PERMISSIONS.HR_PERFORMANCE_MANAGE", "<HrPerformanceLegacyPanel"],
    legacyPanel: ["HR_PERFORMANCE_TEMPLATE_READ", "HR_PERFORMANCE_TEAM_READ", "HR_PERFORMANCE_SELF_READ"],
    permissionContract: ["HR_PERFORMANCE_PAGE: \"hr:performance\"", "HR_PERFORMANCE_MANAGE: \"hr:performance:manage\"", "HR_PERFORMANCE_TEMPLATE_READ", "HR_PERFORMANCE_RESULT_READ"],
  };
  for (const [role, tokens] of Object.entries(requirements)) {
    if (tokens.some(token => !text(role).includes(token))) fail("ASS_CREATE_RECORD_MODERN_EVIDENCE_DRIFT", role);
  }
}

export function verifyLegacyBsAssCreateRecordBusinessContract({ contract, repositoryRoot }) {
  validateRoot(contract);
  validateSafety(contract);
  validateParameters(contract);
  validateReadWrite(contract);
  validateDefaultsAndCalculations(contract);
  validateBranchesAndLoops(contract);
  validateBehavior(contract);
  validateClassificationAndSurface(contract);
  const evidence = readEvidence(repositoryRoot, contract);
  validateLedger(evidence.routineLedger);
  validateModernEvidence(evidence);
  return {
    ok: true,
    status: "pending",
    canonicalFamily: ROUTINE.canonicalFamily,
    familyMembersReviewed: 1,
    historicalVariantsReviewed: 0,
    parametersFrozen: contract.parameters.length,
    readTablesFrozen: contract.reads.length,
    writeTargetsFrozen: contract.writes.length,
    calculationsFrozen: contract.calculations.length,
    branchesFrozen: contract.branches.length,
    cursorLoopsFrozen: contract.loops.length,
    compatibleFindings: contract.schemaAssessment.compatible.length,
    dormantFindings: contract.schemaAssessment.dormant.length,
    driftFindings: contract.schemaAssessment.drift.length,
    compatibilityCredit: 0,
    containsSourceRows: false,
    containsPersonalData: false,
    productionMutationAllowed: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-bs-ass-create-record-business-contract-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyBsAssCreateRecordBusinessContract({ contract, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
