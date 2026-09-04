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
const TABLE = Object.freeze({
  id: "TABLE-8EB1FC8017DF1AEE", name: "assitemgradedes",
  structuralHash: "63f977e64b6f30eafb1fef249bd8f87b58373948496cc9f278387a6b8c3a500f",
  sourceArtifactSha256: SOURCE_TABLE_CATALOG_SHA256,
});
const COLUMNS = Object.freeze([
  ["COLUMN-CBE2DD1F0D43449B", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-D0376760168C1506", "assitemid", "int", true, null, null, "02ecc8e5da035a328b72dba8edf739d1e67c505679b9364568b7aec65d0edad0"],
  ["COLUMN-210FDA4A2DD9768D", "grade", "varchar(12)", true, null, null, "7834c06053fbc92cb741c1d35919bf268b65c757f041e674085ef51ce9840f4b"],
  ["COLUMN-10DC9065B1BE12B2", "description", "varchar(500)", true, null, null, "656727cfdd01924207cfd70f8a6b78acf041d9895ba1dc59381d0a7daf18384c"],
  ["COLUMN-8A869FF6BA5D5852", "minvalue", "int", true, null, null, "a7f2c1fef026146d59a56e68592c4a3b8cee63d116b0894add85c54aff10e6f7"],
  ["COLUMN-2AAF708D73E00EB3", "maxvalue", "int", true, null, null, "dc8fb8dc7a878908467b8d19dc7eb065ff78dacdca2ca3bf17d7325069726b8b"],
  ["COLUMN-1F995CD0D09FF2A5", "myorder", "int", true, null, null, "7e8d853ae59c191fe7997e3ea5aa1f8e1a005ca0a4985a8af33d0e2207047cca"],
]);
const ROUTINES = Object.freeze([
  ["RULE-0F16F0ADB333445C", "u_printassessment", "9d1339aed7a32e8cd6ad139c33706a03fcc675f28c681595cafbeb8cde214986"],
  ["RULE-6FDC0BE94D1719EA", "u_printassessment_bak2", "ef2e114f5b231e02f3fdfedfb7eb5259af785c8b7469e298b13fe83dac786084"],
]);

export class LegacyPerformanceAssitemgradedesFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceAssitemgradedesFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyPerformanceAssitemgradedesFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const columnObjects = () => COLUMNS.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({
  id, name, type, nullable, default: defaultValue, description, structuralHash,
}));

function expectedFields() {
  const gap = (stableId, name, targetFields, transformRule, reasonCode) => ({
    stableId, sourceField: `assitemgradedes.${name}`, disposition: "explicit_gap", targetFields, preservationFields: [],
    transformRule, reasonCode, compatibilityCredit: 0,
  });
  return [
    gap("ASSITEMGRADEDES_ID", "id", ["legacy_record_map.source_pk_canonical"], "preserve_integer_source_identity_after_writer_exists", "PERFORMANCE_ASSITEMGRADEDES_LEGACY_WRITER_NOT_IMPLEMENTED"),
    gap("ASSITEMGRADEDES_ASSITEMID", "assitemid", ["hr_performance_template_dimension.scoring_guide[].dimensionIdentity"], "resolve_nullable_item_identity_through_assitem_record_map_after_writer_exists", "PERFORMANCE_ASSITEMGRADEDES_ITEM_RELATION_WRITER_UNRESOLVED"),
    gap("ASSITEMGRADEDES_GRADE", "grade", ["hr_performance_template_dimension.scoring_guide[].levelCode"], "resolve_nullable_grade_through_assgradecode_record_map_after_scoring_guide_schema_exists", "PERFORMANCE_ITEM_GRADE_GUIDE_MODEL_UNRESOLVED"),
    gap("ASSITEMGRADEDES_DESCRIPTION", "description", ["hr_performance_template_dimension.scoring_guide[].description"], "preserve_nullable_500_character_grade_description_without_truncation_after_scoring_guide_schema_exists", "PERFORMANCE_ITEM_GRADE_GUIDE_MODEL_UNRESOLVED"),
    gap("ASSITEMGRADEDES_MINVALUE", "minvalue", ["hr_performance_template_dimension.scoring_guide[].scoreMin"], "preserve_nullable_lower_threshold_after_item_level_range_semantics_are_reviewed", "PERFORMANCE_ITEM_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED"),
    gap("ASSITEMGRADEDES_MAXVALUE", "maxvalue", ["hr_performance_template_dimension.scoring_guide[].scoreMax"], "preserve_nullable_upper_threshold_after_item_level_range_semantics_are_reviewed", "PERFORMANCE_ITEM_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED"),
    gap("ASSITEMGRADEDES_MYORDER", "myorder", ["hr_performance_template_dimension.scoring_guide[].sortOrder"], "preserve_nullable_integer_order_after_scoring_guide_schema_exists", "PERFORMANCE_ITEM_GRADE_GUIDE_MODEL_UNRESOLVED"),
  ];
}

function expectedGaps() {
  return [
    { sourceFields: ["assitemgradedes.id"], reasonCode: "PERFORMANCE_ASSITEMGRADEDES_LEGACY_WRITER_NOT_IMPLEMENTED", missingEvidence: ["assitemgradedes_readonly_extract_and_safe_aggregate", "assitemgradedes_dedicated_transform_and_writer", "assitemgradedes_record_map_projection_and_rollback"], decision: "KEEP_GAP" },
    { sourceFields: ["assitemgradedes.assitemid"], reasonCode: "PERFORMANCE_ASSITEMGRADEDES_ITEM_RELATION_WRITER_UNRESOLVED", missingEvidence: ["assitem_to_dimension_record_map", "nullable_orphan_relation_aggregate", "tenant_park_scoped_relation_writer"], decision: "KEEP_GAP" },
    { sourceFields: ["assitemgradedes.grade", "assitemgradedes.description", "assitemgradedes.myorder"], reasonCode: "PERFORMANCE_ITEM_GRADE_GUIDE_MODEL_UNRESOLVED", missingEvidence: ["normalized_dimension_level_guide_table_or_versioned_json_schema", "grade_record_map", "lossless_description_and_order_writer", "frontend_item_grade_guide_authoring_and_rendering"], decision: "KEEP_GAP" },
    { sourceFields: ["assitemgradedes.minvalue", "assitemgradedes.maxvalue"], reasonCode: "PERFORMANCE_ITEM_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED", missingEvidence: ["safe_item_grade_threshold_range_and_overlap_aggregates", "reviewed_item_level_threshold_semantics", "legacy_dynamic_print_and_scoring_parity_test"], decision: "KEEP_GAP" },
  ];
}

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 5 || new Set(evidence.map(row => row?.role)).size !== 5) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "") || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || evidence.sha256 !== "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a"
    || !Array.isArray(evidence.requiredRoutines) || evidence.requiredRoutines.length !== ROUTINES.length) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256 || routine.primaryDomain !== "performance"
      || !routine.readTables?.includes("assitemgradedes") || !routine.readTables?.includes("assgradecode") || !routine.readTables?.includes("assitem")
      || routine.writeTables?.length !== 0 || routine.statementProfile?.select !== 1 || !routine.logicSignals?.includes("dynamic_sql")
      || !routine.logicSignals?.includes("cursor") || routine.dynamicMutationStatus !== "unknown_requires_review") fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_ROUTINE_DRIFT", routineId);
  });
  return { routineCount: 2, dynamicPrintRoutineCount: 2, dynamicMutationReviewCount: 2, itemGradeGuideParityPending: true };
}

function validateContract(contract) {
  const expectedBinding = { canonicalInventorySha256: CANONICAL_INVENTORY_SHA256, currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256, reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT", decision: "KEEP_GAP_NO_REBIND" };
  const expectedTable = { sourceObject: "dbo.assitemgradedes", sourceTable: "assitemgradedes", tableId: TABLE.id, structuralHash: TABLE.structuralHash, sourceArtifactSha256: TABLE.sourceArtifactSha256, observedRows: null, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY", stableKey: ["id"], columns: columnObjects() };
  const expectedBehavior = {
    dynamicColumnSource: "print_routines_enumerate_assgradecode_assgrade_with_a_cursor",
    descriptionLookup: "each_dynamic_grade_column_selects_assitemgradedes_description_by_assitemid_and_grade",
    currentPrintGradeScope: "u_printassessment_filters_grade_cursor_by_assgradecode_assessmentid",
    backupPrintGradeScope: "u_printassessment_bak2_does_not_filter_grade_cursor_by_assessmentid",
    unusedByBoundRoutines: ["assitemgradedes.id", "assitemgradedes.minvalue", "assitemgradedes.maxvalue", "assitemgradedes.myorder"],
    implementationStatus: "REQUIRES_NORMALIZED_OR_CONTRACTED_JSON_MODEL_AND_PARITY_DECISION_BEFORE_WRITER",
  };
  const expectedRelations = [
    { source: "assitemgradedes.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assitemgradedes.grade", target: "assgradecode.assgrade", kind: "routine_cursor_correlation_without_declared_foreign_key", disposition: "verified_source_relation" },
  ];
  const expectedRuntimeGap = { reasonCode: "PERFORMANCE_ITEM_GRADE_GUIDE_RUNTIME_SURFACE_MISSING", currentTarget: "untyped_hr_performance_template_dimension_scoring_guide_jsonb", missingEvidence: ["versioned_scoring_guide_schema_or_normalized_table", "validated_API_writer_and_reader", "frontend_authoring_and_read_only_rendering", "dynamic_grade_column_parity_fixture"], decision: "KEEP_GAP" };
  const expectedAggregateGap = { sourceTable: "dbo.assitemgradedes", observedRows: null, reasonCode: "PERFORMANCE_ASSITEMGRADEDES_SAFE_AGGREGATES_NOT_CAPTURED", missingEvidence: ["readonly_row_count", "nullable_field_counts", "assitem_orphan_count", "grade_orphan_count", "item_grade_duplicate_count", "threshold_overlap_and_gap_counts"], decision: "KEEP_GAP" };
  const expectedProjectionGap = { reasonCode: "PERFORMANCE_ASSITEMGRADEDES_EXTRACT_TRANSFORM_WRITER_MISSING", missingEvidence: ["readonly_extract", "typed_transform", "tenant_park_scoped_writer", "record_map", "reverse_order_rollback"], decision: "KEEP_GAP" };
  if (!object(contract) || contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_performance_assitemgradedes_field_map" || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "") || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256 || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding) || !same(contract.sourceTables, [expectedTable])
    || contract.denominatorRule !== "all_seven_catalog_fields_count_even_when_the_source_table_or_a_nullable_or_routine_unreferenced_column_has_no_rows_or_values"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_safe_aggregates_declared_and_routine_relations_routine_structure_and_gap_codes_only"
    || !same(contract.routineBehaviorFindings, expectedBehavior) || !same(contract.relations, expectedRelations) || !same(contract.fields, expectedFields())
    || !same(contract.explicitGaps, expectedGaps()) || !same(contract.runtimeSurfaceGap, expectedRuntimeGap) || !same(contract.sourceAggregateGap, expectedAggregateGap)
    || !same(contract.legacyProjectionGap, expectedProjectionGap) || !same(contract.compatibilityCredit, { numerator: 0, denominator: 7 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false || contract.containsPersonalData !== false
    || !same(contract.filesExcluded, ["photo", "docs"]) || contract.productionImport !== "HOLD") fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_MAP_CONTRACT_INVALID", "root identity, mapping, gaps or safety policy");
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === TABLE.name);
  if (selected.length !== 1) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_SOURCE_TABLE_INVALID", TABLE.name);
  const table = selected[0];
  const actualColumns = table.columns?.map(column => ({ id: column.id, name: column.name, type: column.type, nullable: column.nullable, default: column.default ?? null, description: column.description ?? null, structuralHash: column.structuralHash }));
  if (table.id !== TABLE.id || table.structuralHash !== TABLE.structuralHash || table.sourceArtifactSha256 !== TABLE.sourceArtifactSha256 || !same(actualColumns, columnObjects())) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_SOURCE_METADATA_INVALID", TABLE.name);
  return inventorySha256;
}

export function verifyLegacyPerformanceAssitemgradedesFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const column = COLUMNS.find(([, name]) => field.sourceField === `assitemgradedes.${name}`);
    return { ...structuredClone(field), sourceColumnId: column[0], sourceType: column[2], sourceNullable: column[3], sourceStructuralHash: column[6], denominatorDisposition: "included" };
  });
  const summary = { sourceTables: 1, sourceFields: fields.length, verifiedTargetFields: fields.filter(field => field.disposition === "verified_target").length, authorizedArchiveFields: fields.filter(field => field.disposition === "authorized_archive").length, safelyExcludedFields: fields.filter(field => field.disposition === "safely_excluded").length, explicitGapFields: fields.filter(field => field.disposition === "explicit_gap").length };
  if (!same(summary, { sourceTables: 1, sourceFields: 7, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 7 }) || fields.some(field => field.compatibilityCredit !== 0)) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_CREDIT_INVALID", "summary");
  const body = {
    formatVersion: 1, artifactKind: "yuzhou_hr_legacy_performance_assitemgradedes_field_map_receipt", mappingVersion: contract.mappingVersion,
    inventorySha256, sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256, sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap), sourceAggregates: { assitemgradedes: null }, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    routineBehaviorFindings: structuredClone(contract.routineBehaviorFindings), summary, fields, relations: structuredClone(contract.relations), explicitGaps: structuredClone(contract.explicitGaps),
    runtimeSurfaceGap: structuredClone(contract.runtimeSurfaceGap), sourceAggregateGap: structuredClone(contract.sourceAggregateGap), legacyProjectionGap: structuredClone(contract.legacyProjectionGap),
    repositoryEvidenceCount: repositoryEvidence.length, routineEvidence, nullAndEmptyFieldsRemainInDenominator: true, sourceRowValuesEmitted: false, containsSourceValues: false,
    containsPersonalData: false, compatibilityCredit: structuredClone(contract.compatibilityCredit), status: "GAP_ONLY_NO_COMPATIBILITY_CREDIT", productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) fail("PERFORMANCE_ASSITEMGRADEDES_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyPerformanceAssitemgradedesFieldMap(JSON.parse(readFileSync(args.inventory, "utf8")), JSON.parse(readFileSync(args.contract, "utf8")), { root: resolve(import.meta.dirname, "../..") });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
