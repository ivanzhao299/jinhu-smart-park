#!/usr/bin/env node
/* global process */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_TABLE_CATALOG_SHA256 = "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe";
const SOURCE_DDL_SHA256 = "4bc267b5b6b5f15cf367ec38caaf4bc2559ebe0666fd2cb9fdecd406c2ec1f2e";
const CANONICAL_INVENTORY_SHA256 = "182e49369910e0b251459b91fe79c5f465f9f78c1f35ee46c388f45a947ca19c";
const OBSERVED_GENERATOR_SHA256 = "8d79af70275219d35bbaca313d9869ba16fdc2f4af35fecd71c7d4482945a617";
const TABLE = Object.freeze({ id: "TABLE-E7C19611B44BEBBB", name: "assessmentdetail", structuralHash: "bb027ae37045c1d871df3b2e2846fba0e3d514663509031fc1b63f23acee0b38", sourceArtifactSha256: SOURCE_TABLE_CATALOG_SHA256 });
const COLUMNS = Object.freeze([
  ["COLUMN-D14942C772FDD604", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-8899EDFAD8DC19CC", "asssessionid", "int", true, null, null, "02d4089778d7eb5763b424f93d342fb54fe0f776029deb73985a7d8ef3d9f00e"],
  ["COLUMN-E5AAD33E86895F7E", "person", "varchar(10)", true, null, null, "b3529de1c7bd7582afea78082915e9ad4c050ca99808a1f8fb3ebc59bc6ccacb"],
  ["COLUMN-84A52F73862808E3", "assitemid", "int", true, null, null, "02ecc8e5da035a328b72dba8edf739d1e67c505679b9364568b7aec65d0edad0"],
  ["COLUMN-F0D1DCBAB25C5C79", "selfvalue", "numeric(18,2)", true, null, null, "3dcbd824fa5ad12dbcf632b22e0aa56d950c4e60ca5287910edc5619e2f5b9d4"],
  ["COLUMN-5F285D9C5A5147BA", "mitemvalue", "numeric(18,2)", true, null, null, "316d571d58b52b78a58d4279da8b1808b7e0ef774d0afb9e2c226ee32ec9ed2a"],
  ["COLUMN-D35643C54A468885", "itemvalue", "numeric(18,2)", true, "(0)", null, "41f4264dde3e1e5ff71afc0d71eebf744762b05fbbc3fe8ac21675ffb0831926"],
  ["COLUMN-6CC522513D05912B", "xitemvalue", "numeric(18,2)", true, null, null, "c158c0a102110cf42ece4eaaf15771ff3804112c7d8742ec38113dfcf43ebbe1"],
  ["COLUMN-7387B48190FD4EDA", "citemvalue", "numeric(18,2)", true, null, null, "95471b2f8fda7b816b455a7877d103e9d3239327b425ac0d99774e722c66ac6a"],
  ["COLUMN-CF738FC7EFDE0E8F", "selfgrade", "varchar(12)", true, null, null, "955f0a6799324a4401a3202dc7f27a343f6313c4eda75617e08f00596f226f06"],
  ["COLUMN-FA4A908A72CD56D4", "assgrade", "varchar(12)", true, null, null, "6166ed650fade31bd856da7b193f0f9ba3f7326d21ec3c32d6ba998b5f8149a1"],
  ["COLUMN-80BAECE96404BDAC", "appraisal", "varchar(200)", true, null, "评定", "ef3c9933ebdb0f5df0a6701d00ee8751a3e3b72777625a4666db7280e7faa4f2"],
]);
const ROUTINES = Object.freeze([
  ["RULE-0C991427090A219D", "bs_ass_compute", "33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414"],
  ["RULE-D7708D3A5CB7696D", "bs_AssCreateRecord", "2981b6a7dbabe949c03d25d17971146e9939344e0051ecd8d52aa90a984a8e9d"],
]);
const REASONS = Object.freeze({
  id: "PERFORMANCE_ASSESSMENTDETAIL_LEGACY_WRITER_NOT_IMPLEMENTED", asssessionid: "PERFORMANCE_DETAIL_SESSION_RELATION_NOT_DECLARED",
  person: "PERFORMANCE_DETAIL_PERSON_RELATION_WRITER_UNRESOLVED", assitemid: "PERFORMANCE_DETAIL_ITEM_RELATION_WRITER_UNRESOLVED",
  selfvalue: "PERFORMANCE_DETAIL_SCORE_WRITER_AND_PARITY_UNRESOLVED", mitemvalue: "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED",
  itemvalue: "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED", xitemvalue: "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED",
  citemvalue: "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED", selfgrade: "PERFORMANCE_DETAIL_PER_ITEM_GRADE_TARGET_UNRESOLVED",
  assgrade: "PERFORMANCE_DETAIL_PER_ITEM_GRADE_TARGET_UNRESOLVED", appraisal: "PERFORMANCE_DETAIL_APPRAISAL_ROLE_AND_WRITER_UNRESOLVED",
});
const TARGETS = Object.freeze({
  id: ["legacy_record_map.source_pk_canonical"], asssessionid: ["hr_performance_cycle_employee.cycle_id"], person: ["hr_performance_cycle_employee.employee_id"],
  assitemid: ["hr_performance_review_submission.dimension_scores.key"], selfvalue: ["hr_performance_review_submission[submission_type=self].dimension_scores"],
  mitemvalue: ["hr_performance_review_submission.dimension_scores"], itemvalue: ["hr_performance_review_submission.dimension_scores"],
  xitemvalue: ["hr_performance_review_submission.dimension_scores"], citemvalue: ["hr_performance_review_submission.dimension_scores"],
  selfgrade: [], assgrade: [], appraisal: ["hr_performance_review_submission.dimension_comments"],
});

export class LegacyPerformanceAssessmentdetailFieldMapError extends Error {
  constructor(code, detail) { super(`${code}: ${detail}`); this.name = "LegacyPerformanceAssessmentdetailFieldMapError"; this.code = code; }
}
const fail = (code, detail) => { throw new LegacyPerformanceAssessmentdetailFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const columnObjects = () => COLUMNS.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({ id, name, type, nullable, default: defaultValue, description, structuralHash }));

function validateFields(contract) {
  const names = COLUMNS.map(([, name]) => name);
  if (!Array.isArray(contract.fields) || contract.fields.length !== names.length) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_MAPPING_INVALID", "field count");
  contract.fields.forEach((field, index) => {
    const name = names[index];
    if (!object(field) || field.stableId !== `ASSESSMENTDETAIL_${name.toUpperCase()}` || field.sourceField !== `assessmentdetail.${name}`
      || field.disposition !== "explicit_gap" || !same(field.targetFields, TARGETS[name]) || !same(field.preservationFields, [])
      || typeof field.transformRule !== "string" || !field.transformRule || field.reasonCode !== REASONS[name] || field.compatibilityCredit !== 0) {
      fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_MAPPING_INVALID", name);
    }
  });
  if (!Array.isArray(contract.explicitGaps) || contract.explicitGaps.length !== 8
    || contract.explicitGaps.some(gap => !object(gap) || !Array.isArray(gap.sourceFields) || gap.sourceFields.length === 0 || gap.decision !== "KEEP_GAP"
      || !Array.isArray(gap.missingEvidence) || gap.missingEvidence.length === 0
      || gap.sourceFields.some(sourceField => REASONS[sourceField.split(".")[1]] !== gap.reasonCode))) {
    fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_GAPS_INVALID", "gap groups");
  }
  const gapFields = contract.explicitGaps.flatMap(gap => gap.sourceFields);
  if (!same(gapFields, names.map(name => `assessmentdetail.${name}`)) || new Set(gapFields).size !== names.length) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_GAPS_INVALID", "complete denominator");
}

function validateRepositoryEvidence(root, evidence) {
  const roles = ["domain_table_map", "modern_template_score_schema", "modern_submission_schema", "modern_review_runtime", "modern_submission_writer", "modern_runtime_page"];
  if (!Array.isArray(evidence) || !same(evidence.map(row => row?.role), roles)) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  return evidence.map(row => {
    if (!object(row) || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "") || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_EVIDENCE_INVALID", String(row?.role));
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json" || evidence.sha256 !== "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a"
    || !Array.isArray(evidence.requiredRoutines) || evidence.requiredRoutines.length !== ROUTINES.length) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256 || routine.primaryDomain !== "performance"
      || !routine.readTables?.includes("assessmentdetail") || routine.dynamicMutationStatus !== "none") fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_ROUTINE_DRIFT", routineId);
    if (sourceName === "bs_ass_compute" && (!same(routine.writeTables, ["assessmentmaster"]) || routine.statementProfile?.select !== 6 || routine.statementProfile?.update !== 3
      || !routine.joinPredicates?.includes("assessmentmaster.asssessionid=assessmentdetail.asssessionid") || !routine.joinPredicates?.includes("assessmentmaster.person=assessmentdetail.person")
      || !routine.logicSignals?.includes("aggregation_sum") || !routine.logicSignals?.includes("null_defaulting"))) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_ROUTINE_DRIFT", routineId);
    if (sourceName === "bs_AssCreateRecord" && (!same(routine.writeTables, ["assessmentdetail", "assessmentmaster", "asssour"]) || routine.statementProfile?.select !== 9
      || routine.statementProfile?.insert !== 3 || !routine.logicSignals?.includes("conditional_branch") || !routine.logicSignals?.includes("cursor"))) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_ROUTINE_DRIFT", routineId);
  });
  return { routineCount: 2, recordCreationRoutineCount: 1, aggregationRoutineCount: 1, fiveComponentParityPending: true };
}

function validateContract(contract) {
  const expectedBinding = { canonicalInventorySha256: CANONICAL_INVENTORY_SHA256, currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256, reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT", decision: "KEEP_GAP_NO_REBIND" };
  const expectedTable = { sourceObject: "dbo.assessmentdetail", sourceTable: "assessmentdetail", tableId: TABLE.id, structuralHash: TABLE.structuralHash, sourceArtifactSha256: TABLE.sourceArtifactSha256, observedRows: null, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY", stableKey: ["id"], columns: columnObjects() };
  const expectedRelations = [
    { source: "assessmentdetail.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assessmentdetail.asssessionid+assessmentdetail.person", target: "assessmentmaster.asssessionid+assessmentmaster.person", kind: "routine_composite_join_without_declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assessmentdetail.person", target: "person.person", kind: "record_creation_identity_without_declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assessmentdetail.asssessionid", target: "asssession.id", kind: "parameter_identity_candidate_without_declared_foreign_key", disposition: "explicit_gap_relation", reasonCode: "PERFORMANCE_DETAIL_SESSION_RELATION_NOT_DECLARED" },
    { source: "assessmentdetail.selfgrade", target: "assgradecode.assgrade", kind: "name_match_candidate_without_declared_foreign_key_or_bound_routine", disposition: "explicit_gap_relation", reasonCode: "PERFORMANCE_DETAIL_GRADE_RELATION_UNPROVEN" },
    { source: "assessmentdetail.assgrade", target: "assgradecode.assgrade", kind: "name_match_candidate_without_declared_foreign_key_or_bound_routine", disposition: "explicit_gap_relation", reasonCode: "PERFORMANCE_DETAIL_GRADE_RELATION_UNPROVEN" },
  ];
  const expectedBehavior = {
    recordCreation: "bs_AssCreateRecord_inserts_one_detail_identity_row_per_session_person_and_matching_assitem_when_not_exists",
    aggregatedFields: ["assessmentdetail.selfvalue", "assessmentdetail.mitemvalue", "assessmentdetail.itemvalue", "assessmentdetail.xitemvalue", "assessmentdetail.citemvalue"],
    aggregation: "bs_ass_compute_sums_each_value_field_with_null_as_zero_by_asssessionid_and_person_into_assessmentmaster",
    notConsumedByBoundCompute: ["assessmentdetail.id", "assessmentdetail.assitemid", "assessmentdetail.selfgrade", "assessmentdetail.assgrade", "assessmentdetail.appraisal"],
    implementationStatus: "REQUIRES_ROLE_MODEL_AND_SCORING_PARITY_DECISION_BEFORE_WRITER",
  };
  const expectedScoreGap = { legacyModel: "five_per_item_value_components_are_summed_then_weighted_by_five_assessmentcode_percentages", modernModel: "self_and_manager_dimension_score_submissions_plus_optional_calibration_are_weighted_by_template_dimension_weights", reasonCode: "PERFORMANCE_DETAIL_FIVE_COMPONENT_TO_MODERN_ROLE_MODEL_UNRESOLVED", decision: "KEEP_GAP" };
  const expectedAggregateGap = { sourceTable: "dbo.assessmentdetail", observedRows: null, reasonCode: "PERFORMANCE_ASSESSMENTDETAIL_SAFE_AGGREGATES_NOT_CAPTURED", missingEvidence: ["readonly_row_count", "nullable_field_counts", "session_person_item_duplicate_count", "session_person_item_orphan_counts", "five_score_component_population_and_range_counts", "grade_orphan_counts", "appraisal_population_count"], decision: "KEEP_GAP" };
  const expectedProjectionGap = { reasonCode: "PERFORMANCE_ASSESSMENTDETAIL_EXTRACT_TRANSFORM_WRITER_MISSING", missingEvidence: ["readonly_extract", "typed_transform", "tenant_park_scoped_writer", "record_map", "reverse_order_rollback"], decision: "KEEP_GAP" };
  if (!object(contract) || contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_performance_assessmentdetail_field_map" || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "") || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256 || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding) || !same(contract.sourceTables, [expectedTable]) || !same(contract.routineBehaviorFindings, expectedBehavior)
    || !same(contract.scoringModelGap, expectedScoreGap) || !same(contract.relations, expectedRelations)
    || contract.denominatorRule !== "all_twelve_catalog_fields_count_even_when_the_source_table_or_a_nullable_defaulted_or_routine_unreferenced_column_has_no_rows_or_values"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_safe_aggregates_declared_and_routine_relations_routine_structure_and_gap_codes_only"
    || !same(contract.sourceAggregateGap, expectedAggregateGap) || !same(contract.legacyProjectionGap, expectedProjectionGap) || !same(contract.compatibilityCredit, { numerator: 0, denominator: 12 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"]) || contract.productionImport !== "HOLD") fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_MAP_CONTRACT_INVALID", "root identity, mapping, gaps or safety policy");
  validateFields(contract);
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === TABLE.name);
  if (selected.length !== 1) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_SOURCE_TABLE_INVALID", TABLE.name);
  const table = selected[0];
  const actualColumns = table.columns?.map(column => ({ id: column.id, name: column.name, type: column.type, nullable: column.nullable, default: column.default ?? null, description: column.description ?? null, structuralHash: column.structuralHash }));
  if (table.id !== TABLE.id || table.structuralHash !== TABLE.structuralHash || table.sourceArtifactSha256 !== TABLE.sourceArtifactSha256 || !same(actualColumns, columnObjects())) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_SOURCE_METADATA_INVALID", TABLE.name);
  return inventorySha256;
}

export function verifyLegacyPerformanceAssessmentdetailFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const column = COLUMNS.find(([, name]) => field.sourceField === `assessmentdetail.${name}`);
    return { ...structuredClone(field), sourceColumnId: column[0], sourceType: column[2], sourceNullable: column[3], sourceStructuralHash: column[6], denominatorDisposition: "included" };
  });
  const summary = { sourceTables: 1, sourceFields: fields.length, verifiedTargetFields: fields.filter(field => field.disposition === "verified_target").length, authorizedArchiveFields: fields.filter(field => field.disposition === "authorized_archive").length, safelyExcludedFields: fields.filter(field => field.disposition === "safely_excluded").length, explicitGapFields: fields.filter(field => field.disposition === "explicit_gap").length };
  if (!same(summary, { sourceTables: 1, sourceFields: 12, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 12 }) || fields.some(field => field.compatibilityCredit !== 0)) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_CREDIT_INVALID", "summary");
  const body = { formatVersion: 1, artifactKind: "yuzhou_hr_legacy_performance_assessmentdetail_field_map_receipt", mappingVersion: contract.mappingVersion, inventorySha256, sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256, sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256, inventoryBindingGap: structuredClone(contract.inventoryBindingGap), sourceAggregates: { assessmentdetail: null }, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY", routineBehaviorFindings: structuredClone(contract.routineBehaviorFindings), scoringModelGap: structuredClone(contract.scoringModelGap), summary, fields, relations: structuredClone(contract.relations), explicitGaps: structuredClone(contract.explicitGaps), sourceAggregateGap: structuredClone(contract.sourceAggregateGap), legacyProjectionGap: structuredClone(contract.legacyProjectionGap), repositoryEvidenceCount: repositoryEvidence.length, routineEvidence, nullAndEmptyFieldsRemainInDenominator: true, sourceRowValuesEmitted: false, containsSourceValues: false, containsPersonalData: false, compatibilityCredit: structuredClone(contract.compatibilityCredit), status: "GAP_ONLY_NO_COMPATIBILITY_CREDIT", productionImport: "HOLD" };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) fail("PERFORMANCE_ASSESSMENTDETAIL_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyPerformanceAssessmentdetailFieldMap(JSON.parse(readFileSync(args.inventory, "utf8")), JSON.parse(readFileSync(args.contract, "utf8")), { root: resolve(import.meta.dirname, "../..") });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
