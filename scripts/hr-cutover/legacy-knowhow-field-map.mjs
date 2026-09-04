#!/usr/bin/env node
/* global process */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_COLUMNS = Object.freeze(["id", "person", "knowhow", "grade", "memo"]);
const EXPECTED_STABLE_IDS = Object.freeze([
  "KNOWHOW_ID",
  "KNOWHOW_PERSON",
  "KNOWHOW_NAME",
  "KNOWHOW_GRADE",
  "KNOWHOW_MEMO",
]);
const EXPECTED_STAGES = Object.freeze(["reviewed_mapping", "read_only_extract", "transform", "private_stage", "writer", "rollback"]);
const EXPECTED_TARGET_SURFACES = Object.freeze(["base_migration", "legacy_migration", "runtime_service"]);

export class LegacyKnowhowFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyKnowhowFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyKnowhowFieldMapError(code, detail); };
const digest = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function readEvidence(repositoryRoot, evidence, label) {
  if (!object(evidence)
    || typeof evidence.path !== "string"
    || !evidence.path
    || !SHA256.test(evidence.sha256 ?? "")
    || !Array.isArray(evidence.requiredTokens)
    || evidence.requiredTokens.length === 0) {
    fail("KNOWHOW_FIELD_EVIDENCE_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("KNOWHOW_FIELD_EVIDENCE_DRIFT", label);
  const source = bytes.toString("utf8");
  if (evidence.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
    fail("KNOWHOW_FIELD_EVIDENCE_TOKEN_MISSING", label);
  }
  return { path: evidence.path, sha256: evidence.sha256 };
}

function validateEvidenceSet(entries, expectedIdentities, identityKey, repositoryRoot, label) {
  if (!Array.isArray(entries) || !same(entries.map(row => row?.[identityKey]), expectedIdentities)) {
    fail("KNOWHOW_FIELD_EVIDENCE_SET_INVALID", label);
  }
  return entries.map(entry => ({
    [identityKey]: entry[identityKey],
    ...readEvidence(repositoryRoot, entry, `${label}:${entry[identityKey]}`),
  }));
}

function validateSourceRelation(contract, repositoryRoot) {
  const evidence = contract.sourceRelationEvidence;
  if (!object(evidence)
    || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || !SHA256.test(evidence.sha256 ?? "")
    || evidence.routineId !== "RULE-8BE9321B3FBD7842"
    || evidence.sourceName !== "u_knowhowquery2003"
    || evidence.sourceArtifactSha256 !== "fe5add3c4e502e357402c79be1af74f0e8e279edc2752b52bce963807de1118f"
    || !same(evidence.requiredReadTables, ["knowhow", "knowhowcode", "person"])
    || !same(evidence.requiredJoinPredicates, ["knowhow.knowhow=knowhowcode.knowhow", "knowhow.person=person.person"])) {
    fail("KNOWHOW_FIELD_SOURCE_RELATION_INVALID", "contract");
  }
  const bytes = readFileSync(resolve(repositoryRoot, evidence.path));
  if (digest(bytes) !== evidence.sha256) fail("KNOWHOW_FIELD_EVIDENCE_DRIFT", "source relation ledger");
  const ledger = JSON.parse(bytes);
  const routine = ledger.routines?.find(row => row.routineId === evidence.routineId);
  if (!routine
    || routine.sourceName !== evidence.sourceName
    || routine.sourceArtifactSha256 !== evidence.sourceArtifactSha256
    || !evidence.requiredReadTables.every(table => routine.readTables?.includes(table))
    || !evidence.requiredJoinPredicates.every(join => routine.joinPredicates?.includes(join))
    || routine.writeTables?.length !== 0
    || routine.statementProfile?.select !== 1
    || ["insert", "update", "delete", "merge", "alter"].some(operation => routine.statementProfile?.[operation] !== 0)) {
    fail("KNOWHOW_FIELD_SOURCE_RELATION_DRIFT", evidence.routineId);
  }
  return {
    routineId: routine.routineId,
    sourceArtifactSha256: routine.sourceArtifactSha256,
    relationCount: evidence.requiredJoinPredicates.length,
    readOnly: true,
  };
}

function validateContract(contract) {
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_knowhow_field_map"
    || contract.mappingVersion !== "1.0.0"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.sourceTable !== "knowhow"
    || contract.sourceObject !== "dbo.knowhow"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceAggregate?.observedRows !== 6
    || contract.sourceAggregate?.fieldDenominator !== EXPECTED_COLUMNS.length
    || contract.denominatorRule !== "all_five_catalog_fields_count_even_when_the_table_is_empty_or_every_source_value_is_null"
    || contract.rowHashRule !== "all_five_fields_feed_sorted_key_canonical_source_row_sha256_with_explicit_nulls"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_and_aggregates_only"
    || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false
    || !same(contract.filesExcluded, ["photo", "docs"])
    || !same(contract.compatibilityCredit, { numerator: 4, denominator: 5 })
    || contract.productionImport !== "HOLD") {
    fail("KNOWHOW_FIELD_MAP_CONTRACT_INVALID", "root identity or safety policy");
  }
  if (!Array.isArray(contract.fields)
    || !same(contract.fields.map(row => row.sourceColumn), EXPECTED_COLUMNS)
    || !same(contract.fields.map(row => row.stableId), EXPECTED_STABLE_IDS)
    || new Set(contract.fields.map(row => row.stableId)).size !== EXPECTED_STABLE_IDS.length) {
    fail("KNOWHOW_FIELD_SET_INVALID", "complete five-field denominator");
  }
  const expected = [
    ["verified", ["hr_employee_skill.legacy_source_identity_sha256"], "sha256_utf8_dbo_knowhow_nul_string_id", "reject_missing_stable_key", null, 1],
    ["verified", ["hr_employee_skill.employee_id"], "trim_then_resolve_active_t0_dbo_person_legacy_record_map_or_quarantine", "quarantine_employee_not_mapped", null, 1],
    ["verified", ["hr_employee_skill.skill_name"], "trim_to_required_string_or_quarantine_invalid_structured_value", "quarantine_invalid_structured_value", null, 1],
    ["explicit_gap", ["hr_employee_skill.proficiency"], "trim_to_legacy_grade_and_force_proficiency_null_pending_reviewed_dictionary", "preserve_null_without_gap", "SKILL_GRADE_DICTIONARY_UNREVIEWED", 0],
    ["verified", ["hr_employee_skill.note"], "trim_to_nullable_string", "write_null", null, 1],
  ];
  contract.fields.forEach((field, index) => {
    const actual = [field.disposition, field.targetFields, field.transformRule, field.emptyRule, field.reasonCode, field.compatibilityCredit];
    if (!same(actual, expected[index])) fail("KNOWHOW_FIELD_MAPPING_INVALID", field.stableId);
    if (field.sourceColumn === "grade" && !same(field.preservationFields, ["hr_employee_skill.legacy_grade"])) {
      fail("KNOWHOW_FIELD_MAPPING_INVALID", "KNOWHOW_GRADE preservation");
    }
    if (field.sourceColumn !== "grade" && Object.hasOwn(field, "preservationFields")) {
      fail("KNOWHOW_FIELD_MAPPING_INVALID", `${field.stableId} unexpected preservation target`);
    }
  });
  const gap = contract.explicitGaps;
  if (!Array.isArray(gap) || gap.length !== 1
    || !same(gap[0], {
      stableId: "KNOWHOW_GRADE_TO_PROFICIENCY",
      sourceField: "knowhow.grade",
      intendedTargetField: "hr_employee_skill.proficiency",
      preservationField: "hr_employee_skill.legacy_grade",
      reasonCode: "SKILL_GRADE_DICTIONARY_UNREVIEWED",
      missingEvidence: ["reviewed_knowhowcode_grade_dictionary", "reviewed_grade_to_proficiency_crosswalk"],
      decision: "KEEP_GAP",
      compatibilityCredit: 0,
    })) {
    fail("KNOWHOW_FIELD_GAP_INVALID", "grade semantic gap");
  }
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("KNOWHOW_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = digest(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("KNOWHOW_FIELD_INVENTORY_DRIFT", inventorySha256);
  const tables = inventory.tables.filter(row => row.name === contract.sourceTable);
  if (tables.length !== 1 || !Array.isArray(tables[0].columns)) fail("KNOWHOW_FIELD_SOURCE_TABLE_INVALID", contract.sourceTable);
  const columns = tables[0].columns;
  if (!same(columns.map(row => row.name), EXPECTED_COLUMNS)) fail("KNOWHOW_FIELD_SOURCE_COLUMNS_INVALID", columns.map(row => row.name).join(","));
  if (columns.some((column, index) => !object(column)
    || typeof column.type !== "string"
    || !column.type
    || typeof column.nullable !== "boolean"
    || column.name !== EXPECTED_COLUMNS[index])) {
    fail("KNOWHOW_FIELD_SOURCE_METADATA_INVALID", "type or nullability");
  }
  return { inventorySha256, columns };
}

export function buildLegacyKnowhowFieldMapReceipt({ inventory, contract, repositoryRoot }) {
  const profile = verifyLegacyKnowhowFieldMapProfile({ contract, repositoryRoot });
  const { inventorySha256, columns } = validateInventory(inventory, contract);
  const fields = contract.fields.map((mapping, index) => ({
    stableId: mapping.stableId,
    sourceField: `${contract.sourceTable}.${mapping.sourceColumn}`,
    sourceOrdinal: index + 1,
    sourceType: columns[index].type,
    sourceNullable: columns[index].nullable,
    denominatorDisposition: "included",
    mappingDisposition: mapping.disposition,
    targetFields: [...mapping.targetFields],
    ...(mapping.preservationFields ? { preservationFields: [...mapping.preservationFields] } : {}),
    transformRule: mapping.transformRule,
    emptyRule: mapping.emptyRule,
    reasonCode: mapping.reasonCode,
    compatibilityCredit: mapping.compatibilityCredit,
  }));
  const verified = fields.filter(row => row.mappingDisposition === "verified").length;
  const gaps = fields.filter(row => row.mappingDisposition === "explicit_gap").length;
  if (verified !== contract.compatibilityCredit.numerator
    || fields.length !== contract.compatibilityCredit.denominator
    || gaps !== contract.explicitGaps.length
    || fields.reduce((sum, row) => sum + row.compatibilityCredit, 0) !== verified) {
    fail("KNOWHOW_FIELD_CREDIT_INVALID", "field denominator or numerator");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_knowhow_field_map_receipt",
    mappingVersion: contract.mappingVersion,
    sourceObject: contract.sourceObject,
    sourceAggregate: {
      observedRows: contract.sourceAggregate.observedRows,
      fieldDenominator: fields.length,
      evidenceSha256: profile.aggregateEvidenceSha256,
    },
    inventorySha256,
    sourceRelation: profile.sourceRelation,
    fields,
    explicitGaps: structuredClone(contract.explicitGaps),
    pipelineEvidenceCount: profile.pipelineEvidenceCount,
    modernTargetEvidenceCount: profile.modernTargetEvidenceCount,
    nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false,
    compatibilityCredit: { numerator: verified, denominator: fields.length },
    status: gaps === 0 ? "VERIFIED" : "PARTIAL_WITH_EXPLICIT_GAPS",
    containsSourceValues: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: digest(`${JSON.stringify(body)}\n`) };
}

export function verifyLegacyKnowhowFieldMapProfile({ contract, repositoryRoot }) {
  validateContract(contract);
  const aggregateEvidence = readEvidence(repositoryRoot, contract.sourceAggregate.evidence, "source aggregate");
  const sourceRelation = validateSourceRelation(contract, repositoryRoot);
  const pipelineEvidence = validateEvidenceSet(contract.pipelineEvidence, EXPECTED_STAGES, "stage", repositoryRoot, "pipeline");
  const modernTargetEvidence = validateEvidenceSet(contract.modernTargetEvidence, EXPECTED_TARGET_SURFACES, "surface", repositoryRoot, "modern target");
  const verifiedSourceLocators = contract.fields
    .filter(field => field.disposition === "verified" && field.compatibilityCredit === 1)
    .map(field => `${contract.sourceTable}.${field.sourceColumn}`);
  if (verifiedSourceLocators.length !== contract.compatibilityCredit.numerator
    || contract.fields.length !== contract.compatibilityCredit.denominator) {
    fail("KNOWHOW_FIELD_CREDIT_INVALID", "profile numerator or denominator");
  }
  return {
    contractSha256: digest(`${JSON.stringify(contract)}\n`),
    sourceTable: contract.sourceTable,
    sourceFieldDenominator: contract.fields.length,
    verifiedSourceLocators,
    explicitGapCount: contract.explicitGaps.length,
    aggregateEvidenceSha256: aggregateEvidence.sha256,
    sourceRelation,
    pipelineEvidenceCount: pipelineEvidence.length,
    modernTargetEvidenceCount: modernTargetEvidence.length,
    compatibilityCredit: structuredClone(contract.compatibilityCredit),
    productionImport: "HOLD",
  };
}

function parseArgs(argv) {
  const result = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) result.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) result.contract = argv[++index];
    else fail("KNOWHOW_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(result.inventory ?? "") || !isAbsolute(result.contract ?? "")) {
    fail("KNOWHOW_FIELD_CLI_ARGUMENT_INVALID", "--inventory and --contract must be absolute paths");
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const repositoryRoot = resolve(import.meta.dirname, "../..");
    const receipt = buildLegacyKnowhowFieldMapReceipt({
      inventory: JSON.parse(readFileSync(args.inventory, "utf8")),
      contract: JSON.parse(readFileSync(args.contract, "utf8")),
      repositoryRoot,
    });
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  } catch (error) {
    const code = error instanceof LegacyKnowhowFieldMapError ? error.code : "KNOWHOW_FIELD_MAP_FAILED";
    process.stderr.write(`${code}: ${error.message}\n`);
    process.exitCode = 1;
  }
}
