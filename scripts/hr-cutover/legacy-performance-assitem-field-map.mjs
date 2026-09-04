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
  id: "TABLE-84B24B89A4C73B76", name: "assitem",
  structuralHash: "6c1a8eea415f91e7852a72b9abda06e1d1c6c7bfc0ee32e4d98fc7bb388381e0",
  sourceArtifactSha256: SOURCE_TABLE_CATALOG_SHA256,
});
const COLUMNS = Object.freeze([
  ["COLUMN-73E1AC2BE1EF240A", "id", "int", false, null, null, "2f90d897303ec99475cf5b382f8b9a1063c058022a034137535dbebb9c066696"],
  ["COLUMN-557B4F8AFF5EA0F2", "assid", "int", true, null, null, "7b249537148ca2cf4ac633f2c6c1adef148c53c2dcacc388847f6925a68c66f5"],
  ["COLUMN-B5A427B683FC77DB", "assitem", "varchar(100)", true, null, null, "8948c5dccbfcc18f50f02b192b75d96fdfb0b8216dc7b2bf0782fd09279272b7"],
  ["COLUMN-C4C925D44AC5C198", "fullvalue", "numeric(18,2)", true, null, null, "5df5c53b4492391c7237de94a6db8d22474e2b1e321f658cc8418ba3aa7a4d83"],
  ["COLUMN-B3353A9A8D5EE5AE", "myorder", "int", true, null, null, "7e8d853ae59c191fe7997e3ea5aa1f8e1a005ca0a4985a8af33d0e2207047cca"],
]);
const ROUTINES = Object.freeze([
  ["RULE-D7708D3A5CB7696D", "bs_AssCreateRecord", "2981b6a7dbabe949c03d25d17971146e9939344e0051ecd8d52aa90a984a8e9d"],
  ["RULE-0F16F0ADB333445C", "u_printassessment", "9d1339aed7a32e8cd6ad139c33706a03fcc675f28c681595cafbeb8cde214986"],
  ["RULE-6FDC0BE94D1719EA", "u_printassessment_bak2", "ef2e114f5b231e02f3fdfedfb7eb5259af785c8b7469e298b13fe83dac786084"],
]);

export class LegacyPerformanceAssitemFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceAssitemFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyPerformanceAssitemFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const columnObjects = () => COLUMNS.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({
  id, name, type, nullable, default: defaultValue, description, structuralHash,
}));

function expectedFields() {
  const gap = (stableId, name, targetFields, transformRule, reasonCode) => ({
    stableId, sourceField: `assitem.${name}`, disposition: "explicit_gap", targetFields, preservationFields: [],
    transformRule, reasonCode, compatibilityCredit: 0,
  });
  return [
    gap("ASSITEM_ID", "id", ["hr_performance_template_dimension.dimension_code", "legacy_record_map.source_pk_canonical"], "derive_stable_YUZHOU_dimension_code_and_preserve_integer_source_identity_after_writer_exists", "PERFORMANCE_ASSITEM_LEGACY_WRITER_NOT_IMPLEMENTED"),
    gap("ASSITEM_ASSID", "assid", ["hr_performance_template_dimension.template_version_id"], "resolve_nullable_assessment_identity_through_assessmentcode_record_map_after_writer_exists", "PERFORMANCE_ASSITEM_ASSESSMENT_RELATION_WRITER_UNRESOLVED"),
    gap("ASSITEM_ASSITEM", "assitem", ["hr_performance_template_dimension.dimension_name"], "preserve_nullable_item_name_after_required_name_policy_and_writer_exist", "PERFORMANCE_ASSITEM_LEGACY_WRITER_NOT_IMPLEMENTED"),
    gap("ASSITEM_FULLVALUE", "fullvalue", ["hr_performance_template_dimension.score_max"], "preserve_nullable_full_score_but_do_not_derive_weight_or_score_range_until_semantics_are_proven", "PERFORMANCE_ASSITEM_FULLVALUE_SEMANTICS_AND_WEIGHT_MODEL_UNRESOLVED"),
    gap("ASSITEM_MYORDER", "myorder", ["hr_performance_template_dimension.sort_order"], "preserve_nullable_integer_order_after_writer_exists", "PERFORMANCE_ASSITEM_LEGACY_WRITER_NOT_IMPLEMENTED"),
  ];
}

function expectedGaps() {
  return [
    {
      sourceFields: ["assitem.id", "assitem.assitem", "assitem.myorder"], reasonCode: "PERFORMANCE_ASSITEM_LEGACY_WRITER_NOT_IMPLEMENTED",
      missingEvidence: ["assitem_readonly_extract_and_safe_aggregate", "assitem_dedicated_transform_and_writer", "assitem_record_map_projection_and_rollback"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assitem.assid"], reasonCode: "PERFORMANCE_ASSITEM_ASSESSMENT_RELATION_WRITER_UNRESOLVED",
      missingEvidence: ["assessmentcode_to_template_version_record_map", "nullable_orphan_relation_aggregate", "tenant_park_scoped_relation_writer"], decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assitem.fullvalue"], reasonCode: "PERFORMANCE_ASSITEM_FULLVALUE_SEMANTICS_AND_WEIGHT_MODEL_UNRESOLVED",
      missingEvidence: ["reviewed_fullvalue_business_semantics", "safe_fullvalue_range_aggregate", "decision_for_missing_modern_dimension_weight_source", "legacy_item_score_to_modern_snapshot_score_parity_test"], decision: "KEEP_GAP",
    },
  ];
}

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 5 || new Set(evidence.map(row => row?.role)).size !== 5) {
    fail("PERFORMANCE_ASSITEM_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("PERFORMANCE_ASSITEM_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("PERFORMANCE_ASSITEM_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("PERFORMANCE_ASSITEM_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || evidence.sha256 !== "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a"
    || !Array.isArray(evidence.requiredRoutines) || evidence.requiredRoutines.length !== ROUTINES.length) {
    fail("PERFORMANCE_ASSITEM_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  }
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("PERFORMANCE_ASSITEM_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) {
      fail("PERFORMANCE_ASSITEM_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    }
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256
      || routine.primaryDomain !== "performance" || !routine.readTables?.includes("assitem")) {
      fail("PERFORMANCE_ASSITEM_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName === "bs_AssCreateRecord" && (!same(routine.writeTables, ["assessmentdetail", "assessmentmaster", "asssour"])
      || routine.statementProfile?.select !== 9 || routine.statementProfile?.insert !== 3
      || !routine.logicSignals?.includes("conditional_branch") || !routine.logicSignals?.includes("cursor")
      || routine.dynamicMutationStatus !== "none")) {
      fail("PERFORMANCE_ASSITEM_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName !== "bs_AssCreateRecord" && (routine.writeTables?.length !== 0 || routine.statementProfile?.select !== 1
      || !routine.logicSignals?.includes("dynamic_sql") || !routine.logicSignals?.includes("cursor")
      || routine.dynamicMutationStatus !== "unknown_requires_review")) {
      fail("PERFORMANCE_ASSITEM_FIELD_ROUTINE_DRIFT", routineId);
    }
  });
  return { routineCount: 3, recordCreationRoutineCount: 1, dynamicPrintRoutineCount: 2, staleColumnReferencePending: true };
}

function validateContract(contract) {
  const expectedBinding = {
    canonicalInventorySha256: CANONICAL_INVENTORY_SHA256, currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256,
    reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT", decision: "KEEP_GAP_NO_REBIND",
  };
  const expectedTable = {
    sourceObject: "dbo.assitem", sourceTable: "assitem", tableId: TABLE.id, structuralHash: TABLE.structuralHash,
    sourceArtifactSha256: TABLE.sourceArtifactSha256, observedRows: null,
    sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY", stableKey: ["id"], columns: columnObjects(),
  };
  const expectedBehavior = {
    recordCreationScope: "bs_AssCreateRecord_resolves_person_assessment_then_creates_detail_and_source_rows_for_each_matching_assitem_assid",
    currentPrintScope: "u_printassessment_filters_assitem_assid_by_assessment_parameter_and_orders_by_myorder",
    backupPrintSchemaDrift: "u_printassessment_bak2_references_assitem_assitemgroupid_which_is_absent_from_current_structural_inventory_and_DDL",
    modernWeightRequirement: "modern_template_dimension_requires_positive_fractional_weight_but_assitem_has_no_explicit_weight_field",
    implementationStatus: "REQUIRES_REVIEWED_MAPPING_AND_PARITY_DECISION_BEFORE_WRITER",
  };
  const expectedRelations = [
    { source: "assessmentdetail.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assitemgradedes.assitemid", target: "assitem.id", kind: "declared_foreign_key", disposition: "verified_source_relation" },
    { source: "person.assessment", target: "assitem.assid", kind: "routine_variable_bridge_without_declared_foreign_key", disposition: "verified_source_relation" },
    { source: "assitem.assid", target: "assessmentcode.assessment", kind: "routine_identity_bridge_without_declared_foreign_key", disposition: "verified_source_relation" },
  ];
  const expectedAggregateGap = {
    sourceTable: "dbo.assitem", observedRows: null, reasonCode: "PERFORMANCE_ASSITEM_SAFE_AGGREGATES_NOT_CAPTURED",
    missingEvidence: ["readonly_row_count", "nullable_field_counts", "assessment_scope_orphan_count", "fullvalue_range_count", "duplicate_order_count"], decision: "KEEP_GAP",
  };
  const expectedProjectionGap = {
    reasonCode: "PERFORMANCE_ASSITEM_EXTRACT_TRANSFORM_WRITER_MISSING",
    missingEvidence: ["readonly_extract", "typed_transform", "tenant_park_scoped_writer", "record_map", "reverse_order_rollback"], decision: "KEEP_GAP",
  };
  if (!object(contract) || contract.formatVersion !== 1 || contract.contractKind !== "yuzhou_hr_legacy_performance_assitem_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10" || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256 || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding) || !same(contract.sourceTables, [expectedTable])
    || contract.denominatorRule !== "all_five_catalog_fields_count_even_when_the_source_table_or_a_nullable_column_has_no_rows_or_values"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_safe_aggregates_declared_relations_routine_structure_and_gap_codes_only"
    || !same(contract.routineBehaviorFindings, expectedBehavior) || !same(contract.relations, expectedRelations)
    || !same(contract.fields, expectedFields()) || !same(contract.explicitGaps, expectedGaps())
    || !same(contract.sourceAggregateGap, expectedAggregateGap) || !same(contract.legacyProjectionGap, expectedProjectionGap)
    || !same(contract.compatibilityCredit, { numerator: 0, denominator: 5 }) || contract.sourceRowValuesEmitted !== false
    || contract.containsSourceValues !== false || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("PERFORMANCE_ASSITEM_FIELD_MAP_CONTRACT_INVALID", "root identity, mapping, gaps or safety policy");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("PERFORMANCE_ASSITEM_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("PERFORMANCE_ASSITEM_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === TABLE.name);
  if (selected.length !== 1) fail("PERFORMANCE_ASSITEM_FIELD_SOURCE_TABLE_INVALID", TABLE.name);
  const table = selected[0];
  const actualColumns = table.columns?.map(column => ({
    id: column.id, name: column.name, type: column.type, nullable: column.nullable,
    default: column.default ?? null, description: column.description ?? null, structuralHash: column.structuralHash,
  }));
  if (table.id !== TABLE.id || table.structuralHash !== TABLE.structuralHash
    || table.sourceArtifactSha256 !== TABLE.sourceArtifactSha256 || !same(actualColumns, columnObjects())) {
    fail("PERFORMANCE_ASSITEM_FIELD_SOURCE_METADATA_INVALID", TABLE.name);
  }
  return inventorySha256;
}

export function verifyLegacyPerformanceAssitemFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const column = COLUMNS.find(([, name]) => field.sourceField === `assitem.${name}`);
    return { ...structuredClone(field), sourceColumnId: column[0], sourceType: column[2], sourceNullable: column[3], sourceStructuralHash: column[6], denominatorDisposition: "included" };
  });
  const summary = {
    sourceTables: 1, sourceFields: fields.length,
    verifiedTargetFields: fields.filter(field => field.disposition === "verified_target").length,
    authorizedArchiveFields: fields.filter(field => field.disposition === "authorized_archive").length,
    safelyExcludedFields: fields.filter(field => field.disposition === "safely_excluded").length,
    explicitGapFields: fields.filter(field => field.disposition === "explicit_gap").length,
  };
  if (!same(summary, { sourceTables: 1, sourceFields: 5, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 5 })
    || fields.some(field => field.compatibilityCredit !== 0)) fail("PERFORMANCE_ASSITEM_FIELD_CREDIT_INVALID", "summary");
  const body = {
    formatVersion: 1, artifactKind: "yuzhou_hr_legacy_performance_assitem_field_map_receipt", mappingVersion: contract.mappingVersion,
    inventorySha256, sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256, sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap), sourceAggregates: { assitem: null }, sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    routineBehaviorFindings: structuredClone(contract.routineBehaviorFindings), summary, fields, relations: structuredClone(contract.relations),
    explicitGaps: structuredClone(contract.explicitGaps), sourceAggregateGap: structuredClone(contract.sourceAggregateGap), legacyProjectionGap: structuredClone(contract.legacyProjectionGap),
    repositoryEvidenceCount: repositoryEvidence.length, routineEvidence, nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false, containsSourceValues: false, containsPersonalData: false, compatibilityCredit: structuredClone(contract.compatibilityCredit),
    status: "GAP_ONLY_NO_COMPATIBILITY_CREDIT", productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("PERFORMANCE_ASSITEM_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) fail("PERFORMANCE_ASSITEM_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyPerformanceAssitemFieldMap(JSON.parse(readFileSync(args.inventory, "utf8")), JSON.parse(readFileSync(args.contract, "utf8")), { root: resolve(import.meta.dirname, "../..") });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
