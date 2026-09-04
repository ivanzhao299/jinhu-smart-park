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
  id: "TABLE-EC6B29966591245A",
  name: "assessmentcode",
  structuralHash: "ad67cc0085c0c4da2b1d23802fad8c8815caeb8d9af35e7982a3b9ee8370cd3f",
  sourceArtifactSha256: SOURCE_TABLE_CATALOG_SHA256,
});
const COLUMNS = Object.freeze([
  ["COLUMN-753076DC2796C230", "assessment", "int", false, null, null, "d746ecae9bff01aa539d743fb562c6353ab8d842573a92e0136ddcec35f40613"],
  ["COLUMN-0456A3303158C1F6", "assessmentname", "varchar(50)", true, null, null, "f09a36f07aad958dd2df0aac9d1ef58df93498c9812fee39935a0121d420e17e"],
  ["COLUMN-75504E9884B1E650", "department", "varchar(30)", true, "('000')", null, "70f60f21995070dbbcf972fb168deb2e49b540f402898886b904be32ad9ea297"],
  ["COLUMN-2CB15CE72C0A9770", "mpercent", "int", true, "(100)", null, "0b541b0fdf4c4d908ba8bbcf6e296544379dbd4711e3076931ecbbb83740afe1"],
  ["COLUMN-D1C4BE8335F1E42C", "tpercent", "int", true, null, null, "a562bbcca6685593be179eebc8bd54fc9dc5b71e2670f48930e116de5ad55510"],
  ["COLUMN-6F2C4878EF48A8DA", "xpercent", "int", true, null, null, "fc935fc38f8304b2308719e1b86391562595cbe26b9d16845d3de2e6fc4b8801"],
  ["COLUMN-51A4E18F9D12A6F8", "cpercent", "int", true, null, null, "2a6f05d1bb26762b96fad89c59bd3289488dd7b98ddd3719dd7ac0e0ae68ce29"],
  ["COLUMN-2E07321553C7CDDF", "spercent", "int", true, null, null, "edfc59591d655dab414575c1a081a0058600e03bc8764f0fd1c01055b35d7f88"],
  ["COLUMN-5263921B93440359", "timekeep", "bit", true, "(1)", null, "3f314321b6d174cd97c4a683c3a43604e780f514bbc0933f9e47826f04c44533"],
  ["COLUMN-545E0004A0B349D7", "bonus", "bit", true, "(1)", null, "742f52c87ebd78104bb5732aa57ab70bb10279231eb7c70c4e16b00c6441703b"],
  ["COLUMN-8C5EE2D7D7543BA0", "master", "bit", true, "(1)", null, "c619e4ce645a31219e733a8484156bfbc6a9cb5a7258a91d0e5b93003a2f70c6"],
]);
const ROUTINES = Object.freeze([
  ["RULE-0C991427090A219D", "bs_ass_compute", "33c9eb04c04c01a360e5d8987c10fa35c733fe566093803e340e7cd3971ae414"],
  ["RULE-62565DCE85F4A8D0", "u_count", "a49e3836b0846321c0fcb1e97b44666bf5d2a09b72474b6cd4d2e272ee0a7e36"],
]);
const GAP_CODES = Object.freeze({
  assessment: "PERFORMANCE_ASSESSMENTCODE_LEGACY_WRITER_NOT_IMPLEMENTED",
  assessmentname: "PERFORMANCE_ASSESSMENTCODE_LEGACY_WRITER_NOT_IMPLEMENTED",
  department: "PERFORMANCE_TEMPLATE_ORG_SCOPE_MAPPING_UNRESOLVED",
  mpercent: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
  tpercent: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
  xpercent: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
  cpercent: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
  spercent: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
  timekeep: "PERFORMANCE_EXTERNAL_COMPONENT_FLAG_MAPPING_UNRESOLVED",
  bonus: "PERFORMANCE_EXTERNAL_COMPONENT_FLAG_MAPPING_UNRESOLVED",
  master: "PERFORMANCE_EXTERNAL_COMPONENT_FLAG_MAPPING_UNRESOLVED",
});

export class LegacyPerformanceAssessmentcodeFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyPerformanceAssessmentcodeFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyPerformanceAssessmentcodeFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const columnObjects = () => COLUMNS.map(([id, name, type, nullable, defaultValue, description, structuralHash]) => ({
  id, name, type, nullable, default: defaultValue, description, structuralHash,
}));

function expectedFields() {
  const common = (stableId, name, targetFields, transformRule) => ({
    stableId,
    sourceField: `assessmentcode.${name}`,
    disposition: "explicit_gap",
    targetFields,
    preservationFields: [],
    transformRule,
    reasonCode: GAP_CODES[name],
    compatibilityCredit: 0,
  });
  return [
    common("ASSESSMENTCODE_ASSESSMENT", "assessment", ["hr_performance_template.template_code"], "prefix_YUZHOU_to_integer_source_identity_after_writer_exists"),
    common("ASSESSMENTCODE_ASSESSMENTNAME", "assessmentname", ["hr_performance_template.template_name", "hr_performance_template_version.version_name"], "preserve_nullable_name_after_template_version_precedence_is_defined"),
    common("ASSESSMENTCODE_DEPARTMENT", "department", ["hr_performance_review_cycle.applicable_org_ids"], "resolve_legacy_department_scope_to_modern_org_ids_only_after_scope_semantics_are_reviewed"),
    ...["mpercent", "tpercent", "xpercent", "cpercent", "spercent"].map(name => common(`ASSESSMENTCODE_${name.toUpperCase()}`, name, ["hr_performance_template_dimension.weight"], "divide_integer_percentage_points_by_100_after_dimension_identity_and_writer_are_reviewed")),
    ...["timekeep", "bonus", "master"].map(name => common(`ASSESSMENTCODE_${name.toUpperCase()}`, name, [], "preserve_boolean_component_gate_after_target_component_model_is_defined")),
  ];
}

function expectedGaps() {
  return [
    {
      sourceFields: ["assessmentcode.assessment", "assessmentcode.assessmentname"],
      reasonCode: "PERFORMANCE_ASSESSMENTCODE_LEGACY_WRITER_NOT_IMPLEMENTED",
      missingEvidence: ["assessmentcode_readonly_extract_and_safe_aggregate", "assessmentcode_dedicated_transform_and_writer", "assessmentcode_record_map_projection_and_rollback"],
      decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assessmentcode.department"],
      reasonCode: "PERFORMANCE_TEMPLATE_ORG_SCOPE_MAPPING_UNRESOLVED",
      missingEvidence: ["reviewed_department_scope_semantics", "legacy_department_to_modern_org_identity_mapping"],
      decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assessmentcode.mpercent", "assessmentcode.tpercent", "assessmentcode.xpercent", "assessmentcode.cpercent", "assessmentcode.spercent"],
      reasonCode: "PERFORMANCE_WEIGHT_DIMENSION_IDENTITY_AND_WRITER_UNRESOLVED",
      missingEvidence: ["reviewed_dimension_identity_for_each_legacy_percentage", "percentage_points_to_fractional_weight_transform", "weight_sum_and_legacy_formula_parity_contract"],
      decision: "KEEP_GAP",
    },
    {
      sourceFields: ["assessmentcode.timekeep", "assessmentcode.bonus", "assessmentcode.master"],
      reasonCode: "PERFORMANCE_EXTERNAL_COMPONENT_FLAG_MAPPING_UNRESOLVED",
      missingEvidence: ["modern_external_component_gate_model", "legacy_component_value_projection", "weighted_total_formula_parity_contract"],
      decision: "KEEP_GAP",
    },
  ];
}

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 5 || new Set(evidence.map(row => row?.role)).size !== 5) {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("PERFORMANCE_ASSESSMENTCODE_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || evidence.sha256 !== "30a387afe8b8682146e6af929b93ace4b768100b47b6eb1b4dcc64b61ec8385a"
    || !Array.isArray(evidence.requiredRoutines) || evidence.requiredRoutines.length !== ROUTINES.length) {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  }
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("PERFORMANCE_ASSESSMENTCODE_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    }
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256
      || !routine.readTables?.includes("assessmentcode")) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName === "bs_ass_compute" && (routine.primaryDomain !== "performance"
      || !same(routine.writeTables, ["assessmentmaster"])
      || !routine.joinPredicates?.includes("person.assessment=assessmentcode.assessment")
      || routine.statementProfile?.select !== 6 || routine.statementProfile?.update !== 3
      || !["conditional_branch", "aggregation_sum", "null_defaulting"].every(signal => routine.logicSignals?.includes(signal))
      || routine.dynamicMutationStatus !== "none")) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_ROUTINE_DRIFT", routineId);
    }
    if (sourceName === "u_count" && (routine.primaryDomain !== "employment_lifecycle"
      || !routine.secondaryDomains?.includes("performance") || routine.writeTables?.length !== 0
      || !routine.logicSignals?.includes("dynamic_sql") || routine.dynamicMutationStatus !== "unknown_requires_review")) {
      fail("PERFORMANCE_ASSESSMENTCODE_FIELD_ROUTINE_DRIFT", routineId);
    }
  });
  return { routineCount: 2, weightedCalculationRoutineCount: 1, dynamicSqlRoutineCount: 1, formulaParityPending: true };
}

function validateContract(contract) {
  const expectedBinding = {
    canonicalInventorySha256: CANONICAL_INVENTORY_SHA256,
    currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256,
    reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT",
    decision: "KEEP_GAP_NO_REBIND",
  };
  const expectedTable = {
    sourceObject: "dbo.assessmentcode",
    sourceTable: "assessmentcode",
    tableId: TABLE.id,
    structuralHash: TABLE.structuralHash,
    sourceArtifactSha256: TABLE.sourceArtifactSha256,
    observedRows: null,
    sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    stableKey: ["assessment"],
    columns: columnObjects(),
  };
  const expectedCalculation = {
    canonicalRoutine: "bs_ass_compute",
    weightedTotal: "selfvalue*spercent/100+mitemvalue*mpercent/100+itemvalue*tpercent/100+xitemvalue*xpercent/100+citemvalue*cpercent/100+mastervalue+timekeepvalue+bonusvalue",
    percentageUnitTransform: "legacy_integer_percentage_points_divided_by_100_before_modern_fractional_weight",
    gradeAssignment: "assgradecode_threshold_lookup_after_total",
    nullHandling: "legacy_routine_contains_null_defaulting",
    implementationStatus: "NOT_IMPLEMENTED_IN_LEGACY_PROJECTION_WRITER",
  };
  const expectedRelation = [{ source: "person.assessment", target: "assessmentcode.assessment", kind: "routine_join_without_declared_foreign_key", disposition: "verified_source_relation" }];
  const expectedAggregateGap = {
    sourceTable: "dbo.assessmentcode",
    observedRows: null,
    reasonCode: "PERFORMANCE_ASSESSMENTCODE_SAFE_AGGREGATE_NOT_CAPTURED",
    missingEvidence: ["readonly_row_count_receipt_without_source_values"],
    decision: "KEEP_GAP",
  };
  const expectedProjectionGap = {
    reasonCode: "PERFORMANCE_ASSESSMENTCODE_EXTRACT_TRANSFORM_WRITER_MISSING",
    missingEvidence: ["readonly_extract", "typed_transform", "tenant_park_scoped_writer", "record_map", "reverse_order_rollback"],
    decision: "KEEP_GAP",
  };
  if (!object(contract) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_performance_assessmentcode_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256
    || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding)
    || !same(contract.sourceTables, [expectedTable])
    || contract.denominatorRule !== "all_eleven_catalog_fields_count_even_when_the_source_table_or_a_nullable_column_has_no_rows_or_values"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_safe_aggregates_routine_structure_and_gap_codes_only"
    || !same(contract.calculationRuleEvidence, expectedCalculation)
    || !same(contract.relations, expectedRelation)
    || !same(contract.fields, expectedFields()) || !same(contract.explicitGaps, expectedGaps())
    || !same(contract.sourceAggregateGap, expectedAggregateGap)
    || !same(contract.legacyProjectionGap, expectedProjectionGap)
    || !same(contract.compatibilityCredit, { numerator: 0, denominator: 11 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_MAP_CONTRACT_INVALID", "root identity, mapping, gaps or safety policy");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("PERFORMANCE_ASSESSMENTCODE_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("PERFORMANCE_ASSESSMENTCODE_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === TABLE.name);
  if (selected.length !== 1) fail("PERFORMANCE_ASSESSMENTCODE_FIELD_SOURCE_TABLE_INVALID", TABLE.name);
  const table = selected[0];
  const actualColumns = table.columns?.map(column => ({
    id: column.id,
    name: column.name,
    type: column.type,
    nullable: column.nullable,
    default: column.default ?? null,
    description: column.description ?? null,
    structuralHash: column.structuralHash,
  }));
  if (table.id !== TABLE.id || table.structuralHash !== TABLE.structuralHash
    || table.sourceArtifactSha256 !== TABLE.sourceArtifactSha256 || !same(actualColumns, columnObjects())) {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_SOURCE_METADATA_INVALID", TABLE.name);
  }
  return inventorySha256;
}

export function verifyLegacyPerformanceAssessmentcodeFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const column = COLUMNS.find(([, name]) => field.sourceField === `assessmentcode.${name}`);
    return {
      ...structuredClone(field),
      sourceColumnId: column[0],
      sourceType: column[2],
      sourceNullable: column[3],
      sourceStructuralHash: column[6],
      denominatorDisposition: "included",
    };
  });
  const summary = {
    sourceTables: 1,
    sourceFields: fields.length,
    verifiedTargetFields: fields.filter(field => field.disposition === "verified_target").length,
    authorizedArchiveFields: fields.filter(field => field.disposition === "authorized_archive").length,
    safelyExcludedFields: fields.filter(field => field.disposition === "safely_excluded").length,
    explicitGapFields: fields.filter(field => field.disposition === "explicit_gap").length,
  };
  if (!same(summary, { sourceTables: 1, sourceFields: 11, verifiedTargetFields: 0, authorizedArchiveFields: 0, safelyExcludedFields: 0, explicitGapFields: 11 })
    || fields.some(field => field.compatibilityCredit !== 0)) {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_CREDIT_INVALID", "summary");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_performance_assessmentcode_field_map_receipt",
    mappingVersion: contract.mappingVersion,
    inventorySha256,
    sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256,
    sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap),
    sourceAggregates: { assessmentcode: null },
    sourceRowCountStatus: "NOT_CAPTURED_IN_CURRENT_STRUCTURAL_INVENTORY",
    calculationRuleEvidence: structuredClone(contract.calculationRuleEvidence),
    summary,
    fields,
    relations: structuredClone(contract.relations),
    explicitGaps: structuredClone(contract.explicitGaps),
    sourceAggregateGap: structuredClone(contract.sourceAggregateGap),
    legacyProjectionGap: structuredClone(contract.legacyProjectionGap),
    repositoryEvidenceCount: repositoryEvidence.length,
    routineEvidence,
    nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false,
    containsSourceValues: false,
    containsPersonalData: false,
    compatibilityCredit: structuredClone(contract.compatibilityCredit),
    status: "GAP_ONLY_NO_COMPATIBILITY_CREDIT",
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("PERFORMANCE_ASSESSMENTCODE_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) {
    fail("PERFORMANCE_ASSESSMENTCODE_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyPerformanceAssessmentcodeFieldMap(
    JSON.parse(readFileSync(args.inventory, "utf8")),
    JSON.parse(readFileSync(args.contract, "utf8")),
    { root: resolve(import.meta.dirname, "../..") },
  );
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
