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
  id: "TABLE-D0397CEBDE12426B",
  name: "assgradecode",
  structuralHash: "04b25bbedd9658b652978087198ea33d54c26aa958950a33e9c45bd1f0ca8a8b",
  sourceArtifactSha256: SOURCE_TABLE_CATALOG_SHA256,
});
const COLUMNS = Object.freeze([
  ["COLUMN-18932ED76900A366", "assgrade", "varchar(12)", false, null, null, "4f480d7f9343a6264ad4f6a4b308b0d3fd5c8c18d5928c897405a3c4ad000f4b"],
  ["COLUMN-992F7D99CE032F7D", "description", "varchar(500)", true, null, null, "656727cfdd01924207cfd70f8a6b78acf041d9895ba1dc59381d0a7daf18384c"],
  ["COLUMN-4F5A0BF9CEC461F6", "myorder", "varchar(2)", true, null, null, "bba966016eed3599f99811230f043653c3ae30fb91a9640d415d69a544abda79"],
  ["COLUMN-CAFA3D63B8BCDA5A", "assessmentid", "int", true, null, null, "92cedca3e338a38d72162d100dec1c97b20f24e34bb4232ef693151a825ba993"],
  ["COLUMN-4D99246DE54D6F07", "minvalue", "int", true, null, null, "a7f2c1fef026146d59a56e68592c4a3b8cee63d116b0894add85c54aff10e6f7"],
  ["COLUMN-32CDACDBE241A1D5", "maxvalue", "int", true, null, null, "dc8fb8dc7a878908467b8d19dc7eb065ff78dacdca2ca3bf17d7325069726b8b"],
]);
const ROUTINES = Object.freeze([
  ["RULE-0C991427090A219D", "bs_ass_compute", "33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414"],
  ["RULE-0F16F0ADB333445C", "u_printassessment", "9d1339aed7a32e8cd6ad139c33706a03fcc675f28c681595cafbeb8cde214986"],
  ["RULE-6FDC0BE94D1719EA", "u_printassessment_bak2", "ef2e114f5b231e02f3fdfedfb7eb5259af785c8b7469e298b13fe83dac786084"],
]);

export class LegacyPerformanceAssgradecodeFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceAssgradecodeFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyPerformanceAssgradecodeFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const columnObjects = () => COLUMNS.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({
  id, name, type, nullable, default: defaultValue, description, structuralHash,
}));

function expectedFields() {
  const gap = (stableId, name, targetFields, transformRule, reasonCode) => ({
    stableId,
    sourceField: `assgradecode.${name}`,
    disposition: "explicit_gap",
    targetFields,
    preservationFields: [],
    transformRule,
    reasonCode,
    compatibilityCredit: 0,
  });
  return [
    gap("ASSGRADECODE_ASSGRADE", "assgrade", ["hr_performance_template_level.level_code"], "preserve_non_null_grade_code_after_template_version_identity_and_writer_exist", "PERFORMANCE_ASSGRADECODE_LEGACY_WRITER_NOT_IMPLEMENTED"),
    gap("ASSGRADECODE_DESCRIPTION", "description", ["hr_performance_template_level.level_name"], "preserve_nullable_description_without_truncation_after_500_to_64_capacity_policy_is_defined", "PERFORMANCE_GRADE_DESCRIPTION_TARGET_CAPACITY_UNRESOLVED"),
    gap("ASSGRADECODE_MYORDER", "myorder", ["hr_performance_template_level.sort_order"], "parse_nullable_varchar_order_as_integer_or_quarantine_after_writer_exists", "PERFORMANCE_GRADE_ORDER_CONVERSION_AND_WRITER_UNRESOLVED"),
    gap("ASSGRADECODE_ASSESSMENTID", "assessmentid", ["hr_performance_template_level.template_version_id"], "resolve_through_assessmentcode_record_map_only_after_relation_and_compute_scope_are_reviewed", "PERFORMANCE_GRADE_ASSESSMENT_RELATION_NOT_DECLARED_OR_UNIFORMLY_ENFORCED"),
    gap("ASSGRADECODE_MINVALUE", "minvalue", ["hr_performance_template_level.score_min"], "preserve_nullable_lower_threshold_after_range_and_formula_parity_are_proven", "PERFORMANCE_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED"),
    gap("ASSGRADECODE_MAXVALUE", "maxvalue", ["hr_performance_template_level.score_max"], "preserve_nullable_upper_threshold_but_do_not_claim_compute_parity_until_legacy_non_usage_is_resolved", "PERFORMANCE_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED"),
  ];
}

function expectedGaps() {
  return [
    {
      sourceFields: ["assgradecode.assgrade"], reasonCode: "PERFORMANCE_ASSGRADECODE_LEGACY_WRITER_NOT_IMPLEMENTED",
      missingEvidence: ["assgradecode_readonly_extract_and_safe_aggregate", "assgradecode_dedicated_transform_and_writer", "assgradecode_record_map_projection_and_rollback"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assgradecode.description"], reasonCode: "PERFORMANCE_GRADE_DESCRIPTION_TARGET_CAPACITY_UNRESOLVED",
      missingEvidence: ["reviewed_legacy_description_semantics", "lossless_500_character_target_or_overflow_archive_policy"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assgradecode.myorder"], reasonCode: "PERFORMANCE_GRADE_ORDER_CONVERSION_AND_WRITER_UNRESOLVED",
      missingEvidence: ["safe_numeric_order_aggregate", "invalid_order_quarantine_contract", "typed_sort_order_writer"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assgradecode.assessmentid"], reasonCode: "PERFORMANCE_GRADE_ASSESSMENT_RELATION_NOT_DECLARED_OR_UNIFORMLY_ENFORCED",
      missingEvidence: ["reviewed_assessmentid_foreign_identity", "decision_for_bs_ass_compute_unscoped_grade_selection", "assessmentcode_to_template_version_record_map"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assgradecode.minvalue", "assgradecode.maxvalue"], reasonCode: "PERFORMANCE_GRADE_THRESHOLD_SEMANTICS_UNRESOLVED",
      missingEvidence: ["safe_threshold_range_and_overlap_aggregate", "decision_for_legacy_maxvalue_non_usage", "legacy_selection_to_modern_contiguous_range_parity_test"], decision: "KEEP_GAP",
    },
  ];
}

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 5 || new Set(evidence.map(row => row?.role)).size !== 5) {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("PERFORMANCE_ASSGRADECODE_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || evidence.sha256 !== "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a"
    || !Array.isArray(evidence.requiredRoutines) || evidence.requiredRoutines.length !== ROUTINES.length) {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  }
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("PERFORMANCE_ASSGRADECODE_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    }
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256
      || routine.primaryDomain !== "performance" || !routine.readTables?.includes("assgradecode")) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName === "bs_ass_compute" && (!same(routine.writeTables, ["assessmentmaster"])
      || routine.statementProfile?.select !== 6 || routine.statementProfile?.update !== 3
      || !routine.logicSignals?.includes("conditional_branch") || !routine.logicSignals?.includes("aggregation_sum")
      || routine.dynamicMutationStatus !== "none")) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName !== "bs_ass_compute" && (routine.writeTables?.length !== 0 || routine.statementProfile?.select !== 1
      || !routine.logicSignals?.includes("dynamic_sql") || !routine.logicSignals?.includes("cursor")
      || routine.dynamicMutationStatus !== "unknown_requires_review")) {
      fail("PERFORMANCE_ASSGRADECODE_FIELD_ROUTINE_DRIFT", routineId);
    }
  });
  return { routineCount: 3, gradeCalculationRoutineCount: 1, dynamicPrintRoutineCount: 2, parityDecisionPending: true };
}

function validateContract(contract) {
  const expectedBinding = {
    canonicalInventorySha256: CANONICAL_INVENTORY_SHA256,
    currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256,
    reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT",
    decision: "KEEP_GAP_NO_REBIND",
  };
  const expectedTable = {
    sourceObject: "dbo.assgradecode", sourceTable: "assgradecode", tableId: TABLE.id,
    structuralHash: TABLE.structuralHash, sourceArtifactSha256: TABLE.sourceArtifactSha256,
    observedRows: null, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    stableKey: ["assgrade"], columns: columnObjects(),
  };
  const expectedBehavior = {
    gradeSelection: "bs_ass_compute_selects_top_grade_where_minvalue_is_not_greater_than_total_ordered_by_minvalue_descending",
    gradeSelectionScope: "bs_ass_compute_does_not_filter_assgradecode_by_assessmentid",
    upperBoundUsage: "bs_ass_compute_does_not_use_maxvalue",
    printScope: "u_printassessment_filters_assessmentid_by_assessment_parameter_and_orders_by_myorder",
    backupPrintScope: "u_printassessment_bak2_omits_assessmentid_filter",
    implementationStatus: "REQUIRES_REVIEWED_PARITY_DECISION_BEFORE_WRITER",
  };
  const expectedRelations = [{
    source: "assgradecode.assessmentid", target: "assessmentcode.assessment",
    kind: "routine_parameter_scope_candidate_without_declared_foreign_key", disposition: "explicit_gap_relation",
    reasonCode: "PERFORMANCE_GRADE_ASSESSMENT_RELATION_NOT_DECLARED_OR_UNIFORMLY_ENFORCED",
  }];
  const expectedAggregateGap = {
    sourceTable: "dbo.assgradecode", observedRows: null, reasonCode: "PERFORMANCE_ASSGRADECODE_SAFE_AGGREGATES_NOT_CAPTURED",
    missingEvidence: ["readonly_row_count", "nullable_field_counts", "assessment_scope_orphan_count", "numeric_order_parse_failure_count", "threshold_overlap_and_gap_counts"],
    decision: "KEEP_GAP",
  };
  const expectedProjectionGap = {
    reasonCode: "PERFORMANCE_ASSGRADECODE_EXTRACT_TRANSFORM_WRITER_MISSING",
    missingEvidence: ["readonly_extract", "typed_transform", "tenant_park_scoped_writer", "record_map", "reverse_order_rollback"],
    decision: "KEEP_GAP",
  };
  if (!object(contract) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_performance_assgradecode_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256
    || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding) || !same(contract.sourceTables, [expectedTable])
    || contract.denominatorRule !== "all_six_catalog_fields_count_even_when_the_source_table_or_a_nullable_column_has_no_rows_or_values"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_safe_aggregates_routine_structure_and_gap_codes_only"
    || !same(contract.routineBehaviorFindings, expectedBehavior) || !same(contract.relations, expectedRelations)
    || !same(contract.fields, expectedFields()) || !same(contract.explicitGaps, expectedGaps())
    || !same(contract.sourceAggregateGap, expectedAggregateGap) || !same(contract.legacyProjectionGap, expectedProjectionGap)
    || !same(contract.compatibilityCredit, { numerator: 0, denominator: 6 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_MAP_CONTRACT_INVALID", "root identity, mapping, gaps or safety policy");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("PERFORMANCE_ASSGRADECODE_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("PERFORMANCE_ASSGRADECODE_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === TABLE.name);
  if (selected.length !== 1) fail("PERFORMANCE_ASSGRADECODE_FIELD_SOURCE_TABLE_INVALID", TABLE.name);
  const table = selected[0];
  const actualColumns = table.columns?.map(column => ({
    id: column.id, name: column.name, type: column.type, nullable: column.nullable,
    default: column.default ?? null, description: column.description ?? null, structuralHash: column.structuralHash,
  }));
  if (table.id !== TABLE.id || table.structuralHash !== TABLE.structuralHash
    || table.sourceArtifactSha256 !== TABLE.sourceArtifactSha256 || !same(actualColumns, columnObjects())) {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_SOURCE_METADATA_INVALID", TABLE.name);
  }
  return inventorySha256;
}

export function verifyLegacyPerformanceAssgradecodeFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const column = COLUMNS.find(([, name]) => field.sourceField === `assgradecode.${name}`);
    return {
      ...structuredClone(field), sourceColumnId: column[0], sourceType: column[2], sourceNullable: column[3],
      sourceStructuralHash: column[6], denominatorDisposition: "included",
    };
  });
  const summary = {
    sourceTables: 1, sourceFields: fields.length,
    verifiedTargetFields: fields.filter(field => field.disposition === "verified_target").length,
    authorizedArchiveFields: fields.filter(field => field.disposition === "authorized_archive").length,
    safelyExcludedFields: fields.filter(field => field.disposition === "safely_excluded").length,
    explicitGapFields: fields.filter(field => field.disposition === "explicit_gap").length,
  };
  if (!same(summary, { sourceTables: 1, sourceFields: 6, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 6 })
    || fields.some(field => field.compatibilityCredit !== 0)) {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_CREDIT_INVALID", "summary");
  }
  const body = {
    formatVersion: 1, artifactKind: "yuzhou_hr_legacy_performance_assgradecode_field_map_receipt",
    mappingVersion: contract.mappingVersion, inventorySha256,
    sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256,
    sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap),
    sourceAggregates: { assgradecode: null }, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    routineBehaviorFindings: structuredClone(contract.routineBehaviorFindings), summary, fields,
    relations: structuredClone(contract.relations), explicitGaps: structuredClone(contract.explicitGaps),
    sourceAggregateGap: structuredClone(contract.sourceAggregateGap), legacyProjectionGap: structuredClone(contract.legacyProjectionGap),
    repositoryEvidenceCount: repositoryEvidence.length, routineEvidence, nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false, containsSourceValues: false, containsPersonalData: false,
    compatibilityCredit: structuredClone(contract.compatibilityCredit), status: "GAP_ONLY_NO_COMPATIBILITY_CREDIT", productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("PERFORMANCE_ASSGRADECODE_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) {
    fail("PERFORMANCE_ASSGRADECODE_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyPerformanceAssgradecodeFieldMap(
    JSON.parse(readFileSync(args.inventory, "utf8")), JSON.parse(readFileSync(args.contract, "utf8")),
    { root: resolve(import.meta.dirname, "../..") },
  );
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
