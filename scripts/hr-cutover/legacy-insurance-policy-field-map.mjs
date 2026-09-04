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
const KINDS = Object.freeze(["oldage", "remedy", "losework", "fund", "wound", "bear"]);
const COMPONENTS = Object.freeze([
  Object.freeze({ suffix: "", target: "base_rate", fixedTarget: "base_fixed_amount", component: "base" }),
  Object.freeze({ suffix: "_e", target: "employer_rate", fixedTarget: "employer_fixed_amount", component: "employer" }),
  Object.freeze({ suffix: "_p", target: "employee_rate", fixedTarget: "employee_fixed_amount", component: "employee" }),
  Object.freeze({ suffix: "_pc", target: "supplement_rate", fixedTarget: "supplement_fixed_amount", component: "supplement" }),
]);
const COLUMNS = Object.freeze([
  ["id", "int", false, null, null],
  ["des", "varchar(50)", true, "('自定义标准')", null],
  ["rightscope", "varchar(30)", true, "(0)", null],
  ...KINDS.flatMap(kind => COMPONENTS.map(({ suffix }) => [`${kind}${suffix}`, "numeric(18,3)", true, "(0)", null])),
  ...KINDS.flatMap(kind => COMPONENTS.map(({ suffix }) => [`${kind}${suffix}2`, "numeric(18,3)", true, "(0.00)", null])),
]);

const policyField = (stableId, sourceField, targetFields, preservationFields) => ({
  stableId,
  sourceField,
  disposition: "verified_target",
  targetFields,
  currentIncorrectTargetFields: [],
  preservationFields,
  transformRule: sourceField.endsWith(".id") ? "prefix_YUZHOU_to_integer_source_identity"
    : sourceField.endsWith(".des") ? "preserve_nullable_policy_description_as_name"
      : "preserve_nullable_hierarchy_prefix_scope_description",
  reasonCode: null,
  compatibilityCredit: 1,
});
const expectedFields = () => {
  const fields = [
    policyField("INSURE_METHOD_ID", "insure_method.id", ["hr_insurance_policy.policy_code"], ["legacy_record_map.source_pk_canonical"]),
    policyField("INSURE_METHOD_DES", "insure_method.des", ["hr_insurance_policy.policy_name"], ["t3.policies.source.name"]),
    policyField("INSURE_METHOD_RIGHTSCOPE", "insure_method.rightscope", ["hr_insurance_policy.scope_description"], ["t3.policies.source.scope"]),
  ];
  for (const kind of KINDS) for (const component of COMPONENTS) {
    const name = `${kind}${component.suffix}`;
    const target = `hr_insurance_policy_item[insurance_kind=${kind},variant_no=1].${component.target}`;
    fields.push({
      stableId: `INSURE_METHOD_${name.toUpperCase()}`,
      sourceField: `insure_method.${name}`,
      disposition: "verified_target",
      targetFields: [target],
      currentIncorrectTargetFields: [],
      preservationFields: [`t3.policies.items[insurance_kind=${kind},variant=1].${component.component}Rate`],
      transformRule: "divide_percentage_points_by_100_using_exact_decimal_string_normalization_before_writing_fractional_rate",
      reasonCode: null,
      compatibilityCredit: 1,
    });
  }
  for (const kind of KINDS) for (const component of COMPONENTS) {
    const name = `${kind}${component.suffix}2`;
    fields.push({
      stableId: `INSURE_METHOD_${name.toUpperCase()}`,
      sourceField: `insure_method.${name}`,
      disposition: "verified_target",
      targetFields: [`hr_insurance_policy_item[insurance_kind=${kind},variant_no=1].${component.fixedTarget}`],
      currentIncorrectTargetFields: [],
      preservationFields: [`t3.policies.items[insurance_kind=${kind},variant=1].${component.component}FixedAmount`],
      transformRule: "preserve_exact_decimal_fixed_addend_in_dedicated_fixed_amount_column",
      reasonCode: null,
      compatibilityCredit: 1,
    });
  }
  return fields;
};
const FIELDS = Object.freeze(expectedFields().map(Object.freeze));
const ROUTINES = Object.freeze([
  ["RULE-01B1E8BB98D7142B", "bs_insure_compute", "c48be83c0d90bf16cc2c5e1ede57bffb3ee299e1bea31ad328b858bc8b267f3b", true],
  ["RULE-39EB7B0B42127233", "bs_insure_compute_bak", "69f7ac6c7173234d481fdc399bd64ee0ef85921c9b2a6a17259c0de226454f2b", false],
]);

export class LegacyInsurancePolicyFieldMapError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyInsurancePolicyFieldMapError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyInsurancePolicyFieldMapError(code, detail); };
const sha256 = value => createHash("sha256").update(value).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);

function validateRepositoryEvidence(root, evidence) {
  if (!Array.isArray(evidence) || evidence.length !== 11 || new Set(evidence.map(row => row?.role)).size !== 11) {
    fail("INSURANCE_POLICY_FIELD_EVIDENCE_SET_INVALID", "repositoryEvidence");
  }
  return evidence.map(row => {
    if (!object(row) || typeof row.role !== "string" || typeof row.path !== "string" || !SHA256.test(row.sha256 ?? "")
      || !Array.isArray(row.requiredTokens) || row.requiredTokens.length === 0) {
      fail("INSURANCE_POLICY_FIELD_EVIDENCE_INVALID", String(row?.role));
    }
    const bytes = readFileSync(resolve(root, row.path));
    if (sha256(bytes) !== row.sha256) fail("INSURANCE_POLICY_FIELD_EVIDENCE_DRIFT", row.role);
    const source = bytes.toString("utf8");
    if (row.requiredTokens.some(token => typeof token !== "string" || !token || !source.includes(token))) {
      fail("INSURANCE_POLICY_FIELD_EVIDENCE_TOKEN_MISSING", row.role);
    }
    return { role: row.role, sha256: row.sha256 };
  });
}

function validateRoutineEvidence(root, evidence) {
  if (!object(evidence) || evidence.path !== "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json"
    || !SHA256.test(evidence.sha256 ?? "") || !Array.isArray(evidence.requiredRoutines)
    || evidence.requiredRoutines.length !== ROUTINES.length) fail("INSURANCE_POLICY_FIELD_ROUTINE_EVIDENCE_INVALID", "contract");
  const bytes = readFileSync(resolve(root, evidence.path));
  if (sha256(bytes) !== evidence.sha256) fail("INSURANCE_POLICY_FIELD_EVIDENCE_DRIFT", "routine ledger");
  const ledger = JSON.parse(bytes);
  ROUTINES.forEach(([routineId, sourceName, sourceArtifactSha256, rounded], index) => {
    const required = evidence.requiredRoutines[index];
    if (!same([required?.routineId, required?.sourceName, required?.sourceArtifactSha256], [routineId, sourceName, sourceArtifactSha256])) {
      fail("INSURANCE_POLICY_FIELD_ROUTINE_EVIDENCE_INVALID", routineId);
    }
    const routine = ledger.routines?.find(row => row.routineId === routineId);
    const expectedSignals = ["conditional_branch", "null_defaulting", "hierarchy_prefix_scope"];
    if (!routine || routine.sourceName !== sourceName || routine.sourceArtifactSha256 !== sourceArtifactSha256
      || routine.primaryDomain !== "insurance_welfare" || !same(routine.readTables, ["insure_method", "person", "person_insure"])
      || !same(routine.writeTables, ["person_insure"]) || routine.statementProfile?.update !== 3
      || ["select", "insert", "delete", "merge", "alter"].some(operation => routine.statementProfile?.[operation] !== 0)
      || expectedSignals.some(signal => !routine.logicSignals?.includes(signal))
      || Boolean(routine.logicSignals?.includes("decimal_rounding")) !== rounded
      || !routine.joinPredicates?.includes("insure_method.id=person.insuremod")) {
      fail("INSURANCE_POLICY_FIELD_ROUTINE_DRIFT", routineId);
    }
  });
  return { routineCount: 2, mutatingCalculationRoutineCount: 2, formulaParityPending: true };
}

function validateContract(contract) {
  const expectedTable = {
    sourceObject: "dbo.insure_method",
    sourceTable: "insure_method",
    observedRows: 12,
    stableKey: ["id"],
    columns: COLUMNS.map(([name, type, nullable, defaultValue, description]) => ({ name, type, nullable, default: defaultValue, description })),
  };
  const expectedBinding = {
    canonicalInventorySha256: CANONICAL_INVENTORY_SHA256,
    currentGeneratorObservedSha256: OBSERVED_GENERATOR_SHA256,
    reasonCode: "STRUCTURAL_INVENTORY_GENERATOR_DIGEST_DRIFT",
    decision: "KEEP_GAP_NO_REBIND",
  };
  const expectedFormula = {
    canonicalFamily: "bs_insure_compute",
    formula: "round(percentage_rate * contribution_base / 100 + fixed_addend, 2)",
    percentageFieldVariant: "no_numeric_suffix",
    fixedAddendFieldVariant: "suffix_2",
    fundInclusion: "conditional",
    hierarchyScope: "person.department_prefix",
  };
  const expectedRelation = [{ source: "person.insuremod", target: "insure_method.id", kind: "routine_join_without_declared_foreign_key", disposition: "verified_source_relation" }];
  const expectedRuntimeGap = {
    reasonCode: "INSURANCE_POLICY_DEFINITION_RUNTIME_SURFACE_MISSING",
    currentSurface: "employee_monthly_insurance_periods_only",
    missingEvidence: ["policy_definition_API", "policy_definition_frontend_with_all_rate_and_fixed_addend_fields"],
    decision: "KEEP_GAP",
  };
  if (!object(contract) || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_insurance_policy_field_map"
    || contract.mappingVersion !== "1.0.0" || contract.sourceSystem !== "yuzhou-v10"
    || !SHA256.test(contract.inventorySha256 ?? "")
    || contract.sourceTableCatalogArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256
    || contract.sourceDdlArtifactSha256 !== SOURCE_DDL_SHA256
    || !same(contract.inventoryBindingGap, expectedBinding)
    || !same(contract.sourceTables, [expectedTable])
    || contract.denominatorRule !== "all_fifty_one_catalog_fields_count_even_when_a_source_column_is_all_null_or_defaults_to_zero"
    || contract.receiptPolicy !== "field_metadata_stable_ids_hashes_aggregates_and_gap_codes_only"
    || !same(contract.calculationRuleEvidence, expectedFormula)
    || !same(contract.relations, expectedRelation)
    || !same(contract.runtimeSurfaceGap, expectedRuntimeGap)
    || !same(contract.compatibilityCredit, { numerator: 51, denominator: 51 })
    || contract.sourceRowValuesEmitted !== false || contract.containsSourceValues !== false
    || contract.containsPersonalData !== false || !same(contract.filesExcluded, ["photo", "docs"])
    || contract.productionImport !== "HOLD") {
    fail("INSURANCE_POLICY_FIELD_MAP_CONTRACT_INVALID", "root identity, metadata or safety policy");
  }
  if (!same(contract.fields, FIELDS)) fail("INSURANCE_POLICY_FIELD_MAPPING_INVALID", "complete fifty-one-field mapping");
  if (!same(contract.explicitGaps, [])) fail("INSURANCE_POLICY_FIELD_GAP_INVALID", "resolved rate and fixed-addend mappings must not remain gaps");
}

function validateInventory(inventory, contract) {
  if (!object(inventory) || !Array.isArray(inventory.tables)) fail("INSURANCE_POLICY_FIELD_INVENTORY_INVALID", "tables");
  const inventorySha256 = sha256(`${JSON.stringify(inventory)}\n`);
  if (inventorySha256 !== contract.inventorySha256) fail("INSURANCE_POLICY_FIELD_INVENTORY_DRIFT", inventorySha256);
  const selected = inventory.tables.filter(table => table.name === "insure_method");
  if (selected.length !== 1) fail("INSURANCE_POLICY_FIELD_SOURCE_TABLE_INVALID", "insure_method");
  const table = selected[0];
  if (!Array.isArray(table.columns) || table.sourceArtifactSha256 !== SOURCE_TABLE_CATALOG_SHA256) {
    fail("INSURANCE_POLICY_FIELD_SOURCE_METADATA_INVALID", "insure_method");
  }
  const actual = table.columns.map(column => [column.name, column.type, column.nullable, column.default ?? null, column.description ?? null]);
  if (!same(actual, COLUMNS)) fail("INSURANCE_POLICY_FIELD_SOURCE_COLUMNS_INVALID", "insure_method");
  return inventorySha256;
}

export function verifyLegacyInsurancePolicyFieldMap(inventory, contract, { root = process.cwd() } = {}) {
  validateContract(contract);
  const inventorySha256 = validateInventory(inventory, contract);
  const repositoryEvidence = validateRepositoryEvidence(root, contract.repositoryEvidence);
  const routineEvidence = validateRoutineEvidence(root, contract.routineEvidence);
  const fields = contract.fields.map(field => {
    const sourceColumn = field.sourceField.split(".")[1];
    const metadata = COLUMNS.find(([name]) => name === sourceColumn);
    return { ...structuredClone(field), sourceType: metadata[1], sourceNullable: metadata[2], denominatorDisposition: "included" };
  });
  const count = disposition => fields.filter(field => field.disposition === disposition).length;
  const summary = { sourceTables: 1, sourceFields: 51, verifiedTargetFields: count("verified_target"), authorizedArchiveFields: count("authorized_archive"), explicitGapFields: count("explicit_gap") };
  if (!same(summary, { sourceTables: 1, sourceFields: 51, verifiedTargetFields: 51, authorizedArchiveFields: 0, explicitGapFields: 0 })
    || fields.reduce((sum, field) => sum + field.compatibilityCredit, 0) !== 51) {
    fail("INSURANCE_POLICY_FIELD_CREDIT_INVALID", "summary");
  }
  const body = {
    formatVersion: 1,
    artifactKind: "yuzhou_hr_legacy_insurance_policy_field_map_receipt",
    mappingVersion: contract.mappingVersion,
    inventorySha256,
    sourceTableCatalogArtifactSha256: contract.sourceTableCatalogArtifactSha256,
    sourceDdlArtifactSha256: contract.sourceDdlArtifactSha256,
    inventoryBindingGap: structuredClone(contract.inventoryBindingGap),
    sourceAggregates: { insure_method: 12 },
    calculationRuleEvidence: structuredClone(contract.calculationRuleEvidence),
    summary,
    fields,
    relations: structuredClone(contract.relations),
    explicitGaps: structuredClone(contract.explicitGaps),
    runtimeSurfaceGap: structuredClone(contract.runtimeSurfaceGap),
    repositoryEvidenceCount: repositoryEvidence.length,
    routineEvidence,
    nullAndEmptyFieldsRemainInDenominator: true,
    sourceRowValuesEmitted: false,
    containsSourceValues: false,
    containsPersonalData: false,
    compatibilityCredit: structuredClone(contract.compatibilityCredit),
    status: "FIELD_MAPPING_COMPLETE_RUNTIME_SURFACE_GAP",
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: sha256(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const args = { inventory: null, contract: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--inventory" && argv[index + 1]) args.inventory = argv[++index];
    else if (argv[index] === "--contract" && argv[index + 1]) args.contract = argv[++index];
    else fail("INSURANCE_POLICY_FIELD_CLI_ARGUMENT_INVALID", String(argv[index]));
  }
  if (!isAbsolute(args.inventory ?? "") || !isAbsolute(args.contract ?? "")) {
    fail("INSURANCE_POLICY_FIELD_CLI_ARGUMENT_INVALID", "absolute --inventory and --contract are required");
  }
  return args;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  const receipt = verifyLegacyInsurancePolicyFieldMap(
    JSON.parse(readFileSync(args.inventory, "utf8")),
    JSON.parse(readFileSync(args.contract, "utf8")),
    { root: resolve(import.meta.dirname, "../..") },
  );
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}
