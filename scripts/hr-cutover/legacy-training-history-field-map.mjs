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
const TABLES = Object.freeze({
  train: Object.freeze([
    ["id", "int", false, null, null],
    ["course", "varchar(50)", false, null, null],
    ["personid", "int", true, "(1)", null],
    ["person", "varchar(10)", false, null, null],
    ["hours", "int", true, null, null],
    ["startdate", "smalldatetime", true, null, null],
    ["enddate", "smalldatetime", true, null, null],
    ["attainment", "numeric(18,2)", true, null, null],
    ["test", "varchar(6)", true, null, null],
    ["trainmoney", "money", true, null, null],
    ["memo", "varchar(255)", true, null, null],
    ["coursename", "varchar(50)", true, null, null],
  ]),
  trainhis: Object.freeze([
    ["id", "int", false, null, null],
    ["person", "varchar(10)", false, null, null],
    ["organ", "varchar(30)", true, null, null],
    ["coursename", "varchar(50)", true, null, null],
    ["startdate", "smalldatetime", true, null, null],
    ["enddate", "smalldatetime", true, null, null],
    ["hours", "int", true, null, null],
    ["attainment", "numeric(18,2)", true, null, null],
    ["test", "varchar(6)", true, null, null],
    ["trainmoney", "money", true, null, null],
    ["memo", "varchar(255)", true, null, null],
  ]),
});
const FIELD_RULES = Object.freeze([
  ["TRAIN_ID", "train.id", "authorized_archive", [], "preserve_as_stable_source_identity_only", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_COURSE", "train.course", "explicit_gap", ["hr_training_course.course_code", "hr_training_plan.course_id", "hr_training_plan.course_version_id"], "resolve_declared_course_relation_and_freeze_course_version_after_active_record_writer_exists", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_PERSONID", "train.personid", "explicit_gap", [], "preserve_integer_without_assuming_equivalence_to_person_code_or_modern_employee_uuid", "TRAIN_PERSONID_RELATION_UNRESOLVED", 0],
  ["TRAIN_PERSON", "train.person", "explicit_gap", ["hr_training_participant.employee_id"], "resolve_exact_active_T0_person_record_map_or_quarantine_after_active_record_writer_exists", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_HOURS", "train.hours", "explicit_gap", ["hr_training_course_version.hours", "hr_training_participant.completed_hours"], "validate_positive_numeric_hours_without_silently_defaulting_null", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_STARTDATE", "train.startdate", "explicit_gap", ["hr_training_plan.start_date"], "convert_to_date_only_after_required_date_and_timezone_policy_is_frozen", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_ENDDATE", "train.enddate", "explicit_gap", ["hr_training_plan.end_date", "hr_training_participant.completed_at"], "convert_to_plan_end_and_completion_timestamp_only_after_required_date_and_timezone_policy_is_frozen", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_ATTAINMENT", "train.attainment", "explicit_gap", ["hr_training_participant.score"], "preserve_numeric_score_until_range_and_out_of_range_quarantine_policy_is reviewed", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_TEST", "train.test", "explicit_gap", [], "preserve_result_label_without_guessing_evaluation_or_status_conversion", "TRAIN_TEST_RESULT_MAPPING_UNRESOLVED", 0],
  ["TRAIN_TRAINMONEY", "train.trainmoney", "explicit_gap", ["hr_training_participant.actual_cost"], "preserve_money_until_currency_nonnegative_and_cost_permission_policy_is frozen", "TRAIN_ACTIVE_RECORD_WRITER_NOT_IMPLEMENTED", 0],
  ["TRAIN_MEMO", "train.memo", "explicit_gap", [], "preserve_note_without relabeling it as participant evaluation", "TRAIN_MEMO_TARGET_UNRESOLVED", 0],
  ["TRAIN_COURSENAME", "train.coursename", "explicit_gap", ["hr_training_course_version.title", "hr_training_plan.plan_name"], "preserve_denormalized_name_until precedence against course.coursename is reviewed", "TRAIN_COURSE_NAME_PRECEDENCE_UNRESOLVED", 0],
  ["TRAINHIS_ID", "trainhis.id", "authorized_archive", [], "preserve_as_stable_source_identity_and_projection_lineage", "TRAINING_HISTORY_SOURCE_IDENTITY_ONLY", 0],
  ["TRAINHIS_PERSON", "trainhis.person", "verified_target", ["hr_training_participant.employee_id"], "resolve_exact_active_T0_person_record_map_or quarantine", null, 1],
  ["TRAINHIS_ORGAN", "trainhis.organ", "explicit_gap", ["hr_training_course_version.provider"], "preserve_without assuming training provider semantics", "TRAINING_HISTORY_ORGAN_PROVIDER_SEMANTICS_UNRESOLVED", 0],
  ["TRAINHIS_COURSENAME", "trainhis.coursename", "verified_target", ["hr_training_course_version.title", "hr_training_plan.plan_name"], "trim_to_required_course_and_plan_name_or_quarantine", null, 1],
  ["TRAINHIS_STARTDATE", "trainhis.startdate", "verified_target", ["hr_training_plan.start_date"], "parse_iso_source_timestamp_then_project_date_or_quarantine", null, 1],
  ["TRAINHIS_ENDDATE", "trainhis.enddate", "verified_target", ["hr_training_plan.end_date", "hr_training_participant.completed_at"], "parse_iso_source_timestamp_project_end_date_and_Asia_Shanghai_completion_or_quarantine", null, 1],
  ["TRAINHIS_HOURS", "trainhis.hours", "verified_target", ["hr_training_course_version.hours", "hr_training_participant.completed_hours"], "require_integer_between_one_and_999999_then_project_course_and_completion_hours", null, 1],
  ["TRAINHIS_ATTAINMENT", "trainhis.attainment", "explicit_gap", ["hr_training_participant.score"], "current_transform_preserves_value_but_writer_does_not_project_score", "TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE", 0],
  ["TRAINHIS_TEST", "trainhis.test", "explicit_gap", [], "current_transform_preserves label but no reviewed result dictionary or target field exists", "TRAINING_HISTORY_TEST_RESULT_MAPPING_UNRESOLVED", 0],
  ["TRAINHIS_TRAINMONEY", "trainhis.trainmoney", "explicit_gap", ["hr_training_participant.actual_cost"], "full archive preserves money but dedicated extract and writer omit actual cost", "TRAINING_HISTORY_RESULT_WRITER_INCOMPLETE", 0],
  ["TRAINHIS_MEMO", "trainhis.memo", "explicit_gap", [], "full archive preserves note without relabeling it as participant evaluation", "TRAINING_HISTORY_MEMO_TARGET_UNRESOLVED", 0],
]);
const RELATIONS = Object.freeze([
  ["train.person", "person.person", "declared_foreign_key_and_routine_join", "verified_source_relation"],
  ["train.course", "course.course", "declared_foreign_key_and_routine_join", "verified_source_relation"],
  ["trainhis.person", "person.person", "declared_foreign_key_and_projection_record_map", "verified_source_relation"],
]);
const ROUTINES = Object.freeze([
  ["RULE-522C4683EEE76C1B", "u_trainmoney", "94d4da5561ec735fd85e06fd4936781ccc223c1694437d4d751aabad0159cc34", 5],
  ["RULE-17C65A9F55141B37", "u_trainmoneys", "150daea145e2f4048a28f2bb60bc70e8a80a305046df7d2f9ac979a3c1837f25", 5],
  ["RULE-2D4C9B3E294C376B", "u_trainrecords", "62e4231664bf9acc6205592332213b96f8663c51cc2d32b2faae730826c75432", 1],
  ["RULE-5BC3DE9B6D975A1B", "web_traincount", "a98bd419754260c51afe2bd46100680b9118e14b89e0b8c2d2a0febbeb90b695", 5],
  ["RULE-78BBAD337FC9C3BF", "web_trainrecords", "5a3b7621e058dd8c1acf9cec682ff06f489c4992a3ce81637bef8f400aa35dc4", 1],
]);

export class LegacyTrainingHistoryFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyTrainingHistoryFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyTrainingHistoryFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 11 || new Set(evidence.map(row => row?.role)).size !== 11) {
    fail("TRAINING_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("TRAINING_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("TRAINING_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("TRAINING_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || !SHA256.test(evidence.sha256 ?? "") || !Array.isArray(evidence.requiredRoutines)
    || evidence.requiredRoutines.length !== ROUTINES.length) fail("TRAINING_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("TRAINING_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256, selectCount], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) {
      fail("TRAINING_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    }
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256
      || routine.primaryDomain !== "training" || !routine.readTables?.includes("train") || routine.writeTables?.length !== 0
      || routine.statementProfile?.select !== selectCount
      || ["insert", "update", "delete", "merge", "alter"].some(operation => routine.statementProfile?.[operation] !== 0)) {
      fail("TRAINING_FIELD_ROUTINE_DRIFT", routineId);
    }
  });
  const recordRoutines = ledger.routines.filter(row => ["u_trainrecords", "web_trainrecords"].includes(row.sourceName));
  const expectedJoins = ["train.course=course.course", "train.person=person.person"];
  if (recordRoutines.length !== 2 || recordRoutines.some(row => expectedJoins.some(join => !row.joinPredicates?.includes(join)))) {
    fail("TRAINING_FIELD_SOURCE_RELATION_DRIFT", "record joins");
  }
  const aggregateRoutines = ledger.routines.filter(row => ["u_trainmoney", "u_trainmoneys", "web_traincount"].includes(row.sourceName));
  if (aggregateRoutines.length !== 3 || aggregateRoutines.some(row => !row.joinPredicates?.includes("train.person=p.person"))) {
    fail("TRAINING_FIELD_AGGREGATE_LOGIC_DRIFT", "training aggregates");
  }
  return { routineCount: 5, recordRoutineCount: 2, aggregateRoutineCount: 3, readOnlyRoutineCount: 5 };
}

function validateContract(contract) {
  const binding = contract?.inventoryBindingGap;
  if (!object(contract) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_training_history_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256
    || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(binding, { canonicalInventorySha256: CANONICAL_INVENTORY_SHA256, currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256, reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT", decision: "KEEP_GAP_NO_REBIND" })
    || contract.denominatorRule !== "all_twenty_three_catalog_fields_count_even_when_train_is_empty_or_a_source_column_is_all_null"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_aggregates_and_gap_codes_only"
    || !same(contract.compatibilityCredit, { numerator: 5, denominator: 23 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("TRAINING_FIELD_MAP_CONTRACT_INVALID", "root identity or safety policy");
  }
  const expectedTables = Object.entries(TABLES).map(([sourceTable, columns]) => ({
    sourceObject: `dbo.${sourceTable}`,
    sourceTable,
    observedRows: sourceTable === "train" ? 0 : 2,
    stableKey: ["id"],
    columns: columns.map(([name, type, nullable, defaultValue, description]) => ({ name, type, nullable, default: defaultValue, description })),
  }));
  if (!same(contract.sourceTables, expectedTables)) fail("TRAINING_FIELD_SOURCE_CONTRACT_INVALID", "tables or metadata");
  if (!Array.isArray(contract.fields) || contract.fields.length !== FIELD_RULES.length
    || new Set(contract.fields.map(field => field.sourceField)).size !== FIELD_RULES.length
    || new Set(contract.fields.map(field => field.stableId)).size !== FIELD_RULES.length) {
    fail("TRAINING_FIELD_SET_INVALID", "complete twenty-three-field denominator");
  }
  contract.fields.forEach((field, index) => {
    const [stableId, sourceField, disposition, targetFields, transformRule, reasonCode, credit] = FIELD_RULES[index];
    if (!same([field.stableId, field.sourceField, field.disposition, field.targetFields, field.transformRule, field.reasonCode, field.compatibilityCredit],
      [stableId, sourceField, disposition, targetFields, transformRule, reasonCode, credit])
      || !same(field.preservationFields, [`hr_legacy_t5_record.record_payload.${sourceField.split(".")[1]}`])) {
      fail("TRAINING_FIELD_MAPPING_INVALID", stableId);
    }
  });
  if (!same(contract.relations?.map(row => [row.source, row.target, row.kind, row.disposition]), RELATIONS)) {
    fail("TRAINING_FIELD_RELATION_INVALID", "relations");
  }
  const expectedGapFields = contract.fields.filter(field => field.disposition === "explicit_gap").map(field => field.sourceField).sort();
  const declaredGapFields = (contract.explicitGaps ?? []).flatMap(gap => gap.sourceFields ?? []).sort();
  if (!same(expectedGapFields, declaredGapFields) || contract.explicitGaps?.length !== 9
    || contract.explicitGaps.some(gap => gap.decision !== "KEEP_GAP" || !gap.reasonCode
      || !Array.isArray(gap.missingEvidence) || gap.missingEvidence.length === 0)) {
    fail("TRAINING_FIELD_GAP_INVALID", "explicit gaps");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("TRAINING_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("TRAINING_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => Object.hasOwn(TABLES, table.name));
  if (!same(selected.map(table => table.name), Object.keys(TABLES))) fail("TRAINING_FIELD_SOURCE_TABLE_INVALID", "source set or order");
  for (const table of selected) {
    if (!Array.isArray(table.columns) || table.sourceArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256) fail("TRAINING_FIELD_SOURCE_METADATA_INVALID", table.name);
    const actual = table.columns.map(column => [column.name, column.type, column.nullable, column.default ?? null, column.description ?? null]);
    if (!same(actual, TABLES[table.name])) fail("TRAINING_FIELD_SOURCE_COLUMNS_INVALID", table.name);
  }
  return inventorySha256;
}

export function verifyLegacyTrainingHistoryFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const [sourceTable, sourceColumn] = field.sourceField.split(".");
    const metadata = TABLES[sourceTable].find(([name]) => name === sourceColumn);
    return { ...structuredClone(field), sourceType: metadata[1], sourceNullable: metadata[2], denominatorDisposition: "included" };
  });
  const count = disposition => fields.filter(field => field.disposition === disposition).length;
  const summary = { sourceTables: 2, sourceFields: 23, verifiedTargetFields: count("verified_target"), authorizedArchiveFields: count("authorized_archive"), explicitGapFields: count("explicit_gap") };
  if (!same(summary, { sourceTables: 2, sourceFields: 23, verifiedTargetFields: 5, authorizedArchiveFields: 2, explicitGapFields: 16 })
    || fields.reduce((sum, field) => sum + field.compatibilityCredit, 0) !== contract.compatibilityCredit.numerator) {
    fail("TRAINING_FIELD_CREDIT_INVALID", "summary");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_training_history_field_map_receipt",
    mappingVersion: contract.mappingVersion,
    inventorySha256,
    sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256,
    sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap),
    sourceAggregates: { train: 0, trainhis: 2 },
    summary,
    fields,
    relations: structuredClone(contract.relations),
    explicitGaps: structuredClone(contract.explicitGaps),
    repositoryEvidenceCount: repositoryEvidence.length,
    routineEvidence,
    nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false,
    containsSourceValues: false,
    containsPersonalData: false,
    compatibilityCredit: structuredClone(contract.compatibilityCredit),
    status: "PARTIAL_WITH_EXPLICIT_GAPS",
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("TRAINING_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) {
    fail("TRAINING_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyTrainingHistoryFieldMap(
    JSON.parse(readFileSync(args.inventory, "utf8")),
    JSON.parse(readFileSync(args.contract, "utf8")),
    { root: resolve(import.meta.dirname, "../..") },
  );
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
