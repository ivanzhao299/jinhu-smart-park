#!/usr/bin/env node
/* global process */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/u;
const SOURCE_TABLE_CATALOG_SHA256 = "11a52007536298bb59c655f1d70317a03f9394a63dbf9a286eaa0165d65553fe";
const SOURCE_DDL_SHA256 = "4bc267b5b6b5f15cf367ec38caaf4bc2559ebe0666fd2cb9fdecd406c2ec1f2e";
const TABLES = Object.freeze({
  bonuscode: Object.freeze([
    ["bonus", "varchar(2)", false, null, null],
    ["bonusname", "varchar(100)", false, null, null],
    ["addsub", "numeric(8,4)", true, null, null],
    ["bonuspay", "money", true, "(0)", null],
    ["bonustype", "varchar(4)", false, "('奖励')", "奖励，惩罚"],
  ]),
  bonusrecord: Object.freeze([
    ["id", "int", false, null, null],
    ["person", "varchar(10)", false, null, null],
    ["bonusdate", "smalldatetime", false, null, null],
    ["bonus", "varchar(2)", false, null, null],
    ["bonusunit", "varchar(50)", true, null, null],
    ["times", "int", true, null, null],
    ["postperson", "varchar(30)", true, null, null],
    ["eventdate", "smalldatetime", true, null, null],
    ["cause", "varchar(100)", true, null, null],
    ["addsub", "numeric(8,4)", true, "(0)", null],
    ["bonuspay", "money", true, null, null],
  ]),
});
const FIELD_RULES = Object.freeze([
  ["BONUSCODE_BONUS", "bonuscode.bonus", "verified_target", ["hr_reward_discipline_category.category_code"], "trim_then_prefix_YZ_RC_or_quarantine", null, 1],
  ["BONUSCODE_BONUSNAME", "bonuscode.bonusname", "verified_target", ["hr_reward_discipline_category_version.name"], "trim_to_required_name_or_quarantine", null, 1],
  ["BONUSCODE_ADDSUB", "bonuscode.addsub", "explicit_gap", ["hr_reward_discipline_category_version.kind"], "current_loader_derives_kind_from_sign_but_cannot_override_unread_bonustype", "REWARD_CATEGORY_KIND_SOURCE_PRECEDENCE_UNRESOLVED", 0],
  ["BONUSCODE_BONUSPAY", "bonuscode.bonuspay", "authorized_archive", [], "preserve_exact_source_value_in_restricted_legacy_payload", "REWARD_CATEGORY_DEFAULT_PAY_HAS_NO_PROVEN_MODERN_TARGET", 0],
  ["BONUSCODE_BONUSTYPE", "bonuscode.bonustype", "explicit_gap", ["hr_reward_discipline_category_version.kind"], "preserve_without_kind_conversion_until_dictionary_and_precedence_receipt", "REWARD_CATEGORY_KIND_SOURCE_PRECEDENCE_UNRESOLVED", 0],
  ["BONUSRECORD_ID", "bonusrecord.id", "authorized_archive", [], "preserve_as_stable_source_identity_only", "REWARD_CASE_WRITER_NOT_IMPLEMENTED", 0],
  ["BONUSRECORD_PERSON", "bonusrecord.person", "explicit_gap", ["hr_reward_discipline_case.employee_id"], "resolve_exact_active_T0_person_record_map_or_quarantine_after_case_writer_exists", "REWARD_CASE_WRITER_NOT_IMPLEMENTED", 0],
  ["BONUSRECORD_BONUSDATE", "bonusrecord.bonusdate", "explicit_gap", ["hr_reward_discipline_case.occurred_on"], "preserve_without_date_collapse_until_bonusdate_eventdate_precedence_is_reviewed", "REWARD_CASE_TWO_DATE_SEMANTICS_UNRESOLVED", 0],
  ["BONUSRECORD_BONUS", "bonusrecord.bonus", "explicit_gap", ["hr_reward_discipline_case.category_id", "hr_reward_discipline_case.category_version_id"], "resolve_exact_bonuscode_projection_and_freeze_version_after_case_writer_exists", "REWARD_CASE_WRITER_NOT_IMPLEMENTED", 0],
  ["BONUSRECORD_BONUSUNIT", "bonusrecord.bonusunit", "explicit_gap", [], "preserve_without_target_projection", "REWARD_CASE_BONUSUNIT_SEMANTICS_UNREVIEWED", 0],
  ["BONUSRECORD_TIMES", "bonusrecord.times", "explicit_gap", [], "preserve_integer_without_flattening_repeated_occurrence_count", "REWARD_CASE_OCCURRENCE_COUNT_TARGET_MISSING", 0],
  ["BONUSRECORD_POSTPERSON", "bonusrecord.postperson", "explicit_gap", [], "preserve_without_user_identity_guess", "REWARD_CASE_PROPOSER_IDENTITY_UNRESOLVED", 0],
  ["BONUSRECORD_EVENTDATE", "bonusrecord.eventdate", "explicit_gap", ["hr_reward_discipline_case.occurred_on"], "preserve_without_date_collapse_until_bonusdate_eventdate_precedence_is_reviewed", "REWARD_CASE_TWO_DATE_SEMANTICS_UNRESOLVED", 0],
  ["BONUSRECORD_CAUSE", "bonusrecord.cause", "explicit_gap", ["hr_reward_discipline_case.fact_summary", "hr_reward_discipline_case.detailed_reason"], "preserve_without_duplicating_one_legacy_reason_into_two_modern_fields", "REWARD_CASE_REASON_SPLIT_RULE_UNRESOLVED", 0],
  ["BONUSRECORD_ADDSUB", "bonusrecord.addsub", "explicit_gap", [], "preserve_numeric_score_adjustment_exactly", "REWARD_CASE_SCORE_ADJUSTMENT_TARGET_MISSING", 0],
  ["BONUSRECORD_BONUSPAY", "bonusrecord.bonuspay", "explicit_gap", ["hr_reward_discipline_case.amount_suggestion"], "preserve_exact_money_without_relabeling_actual_payroll_input_as_suggestion", "REWARD_CASE_PAYROLL_AMOUNT_SEMANTICS_UNRESOLVED", 0],
]);
const RELATIONS = Object.freeze([
  ["bonusrecord.person", "person.person", "declared_foreign_key_and_routine_join", "verified_source_relation"],
  ["bonusrecord.bonus", "bonuscode.bonus", "declared_foreign_key_and_routine_join", "verified_source_relation"],
]);

export class LegacyRewardDisciplineFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyRewardDisciplineFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyRewardDisciplineFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 11 || new Set(evidence.map(row => row?.role)).size !== 11) {
    fail("REWARD_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("REWARD_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("REWARD_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("REWARD_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || !SHA256.test(evidence.sha256 ?? "") || !Array.isArray(evidence.requiredRoutines)
    || evidence.requiredRoutines.length !== 6) fail("REWARD_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("REWARD_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  const expectedJoins = new Set([
    "bonusrecord.bonus=bonuscode.bonus",
    "bonusrecord.person=person.person",
  ]);
  for (const required of evidence.requiredRoutines) {
    if (!object(required) || !SHA256.test(required.sourceArtifactSha256 ?? "")) {
      fail("REWARD_FIELD_ROUTINE_EVIDENCE_INVALID", String(required?.routineId));
    }
    const routine = ledger.routines?.find(row => row.routineId === required.routineId);
    if (!routine || routine.sourceName !== required.sourceName
      || routine.sourceArtifactSha256 !== required.sourceArtifactSha256
      || routine.primaryDomain !== "reward_discipline" || routine.writeTables?.length !== 0
      || routine.statementProfile?.select !== 1
      || ["insert", "update", "delete", "merge", "alter"].some(operation => routine.statementProfile?.[operation] !== 0)) {
      fail("REWARD_FIELD_ROUTINE_DRIFT", required.routineId);
    }
  }
  const relationRoutines = ledger.routines.filter(row => ["u_bonusrecords", "web_bonusquery"].includes(row.sourceName));
  if (relationRoutines.length !== 2 || relationRoutines.some(routine => [...expectedJoins].some(join => !routine.joinPredicates?.includes(join)))) {
    fail("REWARD_FIELD_SOURCE_RELATION_DRIFT", "reward query joins");
  }
  const payrollInput = ledger.routines.find(row => row.sourceName === "u_inputfrombonus");
  if (!payrollInput || !same(payrollInput.readTables, ["bonusrecord"])) {
    fail("REWARD_FIELD_PAYROLL_INPUT_DRIFT", "u_inputfrombonus");
  }
  return { routineCount: 6, relationRoutineCount: relationRoutines.length, readOnlyRoutineCount: 6 };
}

function validateContract(contract) {
  if (!object(contract) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_reward_discipline_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256
    || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || contract.denominatorRule !== "all_sixteen_catalog_fields_count_even_when_bonusrecord_is_empty_or_a_source_column_is_all_null"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_aggregates_and_gap_codes_only"
    || !same(contract.compatibilityCredit, { numerator: 2, denominator: 16 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("REWARD_FIELD_MAP_CONTRACT_INVALID", "root identity or safety policy");
  }
  const expectedTables = Object.entries(TABLES).map(([sourceTable, columns]) => ({
    sourceObject: `dbo.${sourceTable}`,
    sourceTable,
    observedRows: sourceTable === "bonuscode" ? 8 : 0,
    stableKey: [sourceTable === "bonuscode" ? "bonus" : "id"],
    columns: columns.map(([name, type, nullable, defaultValue, description]) => ({ name, type, nullable, default: defaultValue, description })),
  }));
  if (!same(contract.sourceTables, expectedTables)) fail("REWARD_FIELD_SOURCE_CONTRACT_INVALID", "tables or metadata");
  if (!Array.isArray(contract.fields) || contract.fields.length !== FIELD_RULES.length
    || new Set(contract.fields.map(field => field.sourceField)).size !== FIELD_RULES.length
    || new Set(contract.fields.map(field => field.stableId)).size !== FIELD_RULES.length) {
    fail("REWARD_FIELD_SET_INVALID", "complete sixteen-field denominator");
  }
  contract.fields.forEach((field, index) => {
    const [stableId, sourceField, disposition, targetFields, transformRule, reasonCode, credit] = FIELD_RULES[index];
    if (!same([field.stableId, field.sourceField, field.disposition, field.targetFields, field.transformRule, field.reasonCode, field.compatibilityCredit],
      [stableId, sourceField, disposition, targetFields, transformRule, reasonCode, credit])
      || !same(field.preservationFields, [`hr_legacy_t5_record.record_payload.${sourceField.split(".")[1]}`])) {
      fail("REWARD_FIELD_MAPPING_INVALID", stableId);
    }
  });
  if (!same(contract.relations?.map(row => [row.source, row.target, row.kind, row.disposition]), RELATIONS)) {
    fail("REWARD_FIELD_RELATION_INVALID", "relations");
  }
  const expectedGapFields = contract.fields.filter(field => field.disposition === "explicit_gap").map(field => field.sourceField).sort();
  const declaredGapFields = (contract.explicitGaps ?? []).flatMap(gap => gap.sourceFields ?? []).sort();
  if (!same(expectedGapFields, declaredGapFields)
    || contract.explicitGaps?.length !== 9
    || contract.explicitGaps.some(gap => gap.decision !== "KEEP_GAP" || !gap.reasonCode
      || !Array.isArray(gap.missingEvidence) || gap.missingEvidence.length === 0)) {
    fail("REWARD_FIELD_GAP_INVALID", "explicit gaps");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("REWARD_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("REWARD_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => Object.hasOwn(TABLES, table.name));
  if (!same(selected.map(table => table.name), Object.keys(TABLES))) fail("REWARD_FIELD_SOURCE_TABLE_INVALID", "source set or order");
  for (const table of selected) {
    if (!Array.isArray(table.columns) || table.sourceArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256) fail("REWARD_FIELD_SOURCE_METADATA_INVALID", table.name);
    const actual = table.columns.map(column => [column.name, column.type, column.nullable, column.default ?? null, column.description ?? null]);
    if (!same(actual, TABLES[table.name])) fail("REWARD_FIELD_SOURCE_COLUMNS_INVALID", table.name);
  }
  return inventorySha256;
}

export function verifyLegacyRewardDisciplineFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const [sourceTable, sourceColumn] = field.sourceField.split(".");
    const metadata = TABLES[sourceTable].find(([name]) => name === sourceColumn);
    return {
      ...structuredClone(field),
      sourceType: metadata[1],
      sourceNullable: metadata[2],
      denominatorDisposition: "included",
    };
  });
  const count = disposition => fields.filter(field => field.disposition === disposition).length;
  const summary = {
    sourceTables: Object.keys(TABLES).length,
    sourceFields: fields.length,
    verifiedTargetFields: count("verified_target"),
    authorizedArchiveFields: count("authorized_archive"),
    explicitGapFields: count("explicit_gap"),
  };
  if (!same(summary, { sourceTables: 2, sourceFields: 16, verifiedTargetFields: 2, authorizedArchiveFields: 2, explicitGapFields: 12 })
    || fields.reduce((sum, field) => sum + field.compatibilityCredit, 0) !== contract.compatibilityCredit.numerator) {
    fail("REWARD_FIELD_CREDIT_INVALID", "summary");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_reward_discipline_field_map_receipt",
    mappingVersion: contract.mappingVersion,
    inventorySha256,
    sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256,
    sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    sourceAggregates: { bonuscode: 8, bonusrecord: 0 },
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
    else fail("REWARD_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) {
    fail("REWARD_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyRewardDisciplineFieldMap(
    JSON.parse(readFileSync(args.inventory, "utf8")),
    JSON.parse(readFileSync(args.contract, "utf8")),
    { root: resolve(import.meta.dirname, "../..") },
  );
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
