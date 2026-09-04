#!/usr/bin/env node
/* global process, structuredClone, URL */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL = `SET NOCOUNT ON;
WITH company_normalized AS (
  SELECT
    id AS source_key,
    NULLIF(LOWER(LTRIM(RTRIM(company))), '') AS match_key
  FROM dbo.company
),
department_normalized AS (
  SELECT
    NULLIF(LTRIM(RTRIM(department)), '') AS source_key,
    NULLIF(LOWER(LTRIM(RTRIM(departmentname))), '') AS match_key
  FROM dbo.departmentcode
),
department_roots AS (
  SELECT child.source_key, child.match_key
  FROM department_normalized child
  WHERE child.source_key IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM department_normalized parent
      WHERE parent.source_key IS NOT NULL
        AND LEN(parent.source_key) < LEN(child.source_key)
        AND LEFT(child.source_key, LEN(parent.source_key)) = parent.source_key
    )
)
SELECT
  (SELECT COUNT_BIG(*) FROM company_normalized) AS companyRows,
  (SELECT COUNT_BIG(*) FROM department_normalized) AS departmentRows,
  (SELECT COUNT_BIG(*) FROM department_roots) AS departmentRootRows,
  (SELECT COUNT_BIG(*) FROM company_normalized WHERE source_key IS NULL) AS companyBlankIdRows,
  (SELECT COUNT_BIG(DISTINCT source_key) FROM company_normalized WHERE source_key IS NOT NULL) AS companyDistinctIdRows,
  (SELECT COUNT_BIG(*) FROM (SELECT source_key FROM company_normalized WHERE source_key IS NOT NULL GROUP BY source_key HAVING COUNT_BIG(*) > 1) duplicate_company_ids) AS companyDuplicateIdGroups,
  (SELECT COUNT_BIG(*) FROM company_normalized WHERE match_key IS NULL) AS companyBlankMatchKeyRows,
  (SELECT COUNT_BIG(DISTINCT match_key) FROM company_normalized WHERE match_key IS NOT NULL) AS companyDistinctMatchKeyRows,
  (SELECT COUNT_BIG(*) FROM (SELECT match_key FROM company_normalized WHERE match_key IS NOT NULL GROUP BY match_key HAVING COUNT_BIG(*) > 1) duplicate_company_match_keys) AS companyDuplicateMatchKeyGroups,
  (SELECT COUNT_BIG(*) FROM department_normalized WHERE source_key IS NULL) AS departmentBlankKeyRows,
  (SELECT COUNT_BIG(DISTINCT source_key) FROM department_normalized WHERE source_key IS NOT NULL) AS departmentDistinctKeyRows,
  (SELECT COUNT_BIG(*) FROM (SELECT source_key FROM department_normalized WHERE source_key IS NOT NULL GROUP BY source_key HAVING COUNT_BIG(*) > 1) duplicate_department_keys) AS departmentDuplicateKeyGroups,
  (SELECT COUNT_BIG(*) FROM department_roots WHERE match_key IS NULL) AS departmentRootBlankMatchKeyRows,
  (SELECT COUNT_BIG(DISTINCT match_key) FROM department_roots WHERE match_key IS NOT NULL) AS departmentRootDistinctMatchKeyRows,
  (SELECT COUNT_BIG(*) FROM (SELECT match_key FROM department_roots WHERE match_key IS NOT NULL GROUP BY match_key HAVING COUNT_BIG(*) > 1) duplicate_root_match_keys) AS departmentRootDuplicateMatchKeyGroups,
  (SELECT COUNT_BIG(*) FROM company_normalized company_row INNER JOIN department_roots root_row ON root_row.match_key = company_row.match_key WHERE company_row.match_key IS NOT NULL) AS matchedPairRows,
  (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE root_row.match_key = company_row.match_key AND company_row.match_key IS NOT NULL) = 0) AS companyZeroMatchRows,
  (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE root_row.match_key = company_row.match_key AND company_row.match_key IS NOT NULL) = 1) AS companyUniqueMatchRows,
  (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE root_row.match_key = company_row.match_key AND company_row.match_key IS NOT NULL) > 1) AS companyMultipleMatchRows,
  (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE company_row.match_key = root_row.match_key AND root_row.match_key IS NOT NULL) = 0) AS departmentRootZeroMatchRows,
  (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE company_row.match_key = root_row.match_key AND root_row.match_key IS NOT NULL) = 1) AS departmentRootUniqueMatchRows,
  (SELECT COUNT_BIG(*) FROM department_roots root_row WHERE (SELECT COUNT_BIG(*) FROM company_normalized company_row WHERE company_row.match_key = root_row.match_key AND root_row.match_key IS NOT NULL) > 1) AS departmentRootMultipleMatchRows
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;`;

const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_IDENTITIES = [
  { table: "company", keyColumn: "id", matchColumn: "company" },
  { table: "departmentcode", keyColumn: "department", matchColumn: "departmentname" },
];
const CONTRACT_KEYS = [
  "formatVersion", "contractKind", "sourceSystem", "scope", "sourceIdentities", "rootRule", "matchRule",
  "evidenceBindings", "aggregateFields", "allowedDecisions", "privacyPolicy", "materialization",
  "compatibilityCredit", "productionImport",
];
const CATALOG_COLUMNS = [
  ["company", "id"],
  ["company", "company"],
  ["departmentcode", "department"],
  ["departmentcode", "departmentname"],
];

export class LegacyCompanyDepartmentRootMergeReceiptError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyCompanyDepartmentRootMergeReceiptError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyCompanyDepartmentRootMergeReceiptError(code, detail); };
const hash = value => createHash("sha256").update(value).digest("hex");
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const exactKeys = (value, keys) => object(value)
  && same(Object.keys(value).sort((a, b) => a.localeCompare(b, "en")), [...keys].sort((a, b) => a.localeCompare(b, "en")));

function readBinding(repositoryRoot, binding, label) {
  if (!object(binding) || typeof binding.path !== "string" || !binding.path || !SHA256.test(binding.sha256 ?? "")) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", label);
  }
  const root = resolve(repositoryRoot);
  const path = resolve(root, binding.path);
  if (!path.startsWith(`${root}/`)) fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", `${label} path`);
  const bytes = readFileSync(path);
  if (hash(bytes) !== binding.sha256) fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_DRIFT", label);
  return bytes;
}

function validateEvidence(repositoryRoot, evidence) {
  if (!exactKeys(evidence, ["companyRootFieldReceipt", "organizationPositionMap", "currentHierarchyMaterializer"])) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "bindings");
  }
  const companyBinding = evidence.companyRootFieldReceipt;
  if (!exactKeys(companyBinding, ["path", "sha256", "requiredContractKind", "requiredDecision"])) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "company receipt binding");
  }
  if (companyBinding.path !== "scripts/hr-cutover/contracts/legacy-company-root-field-receipt-v1.json") {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "company receipt path");
  }
  const companyReceipt = JSON.parse(readBinding(repositoryRoot, companyBinding, "company receipt").toString("utf8"));
  if (companyReceipt.contractKind !== companyBinding.requiredContractKind
    || companyReceipt.allowedDecision !== companyBinding.requiredDecision
    || companyReceipt.productionImport !== "HOLD") {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "company receipt authority");
  }

  const mapBinding = evidence.organizationPositionMap;
  if (!exactKeys(mapBinding, ["path", "sha256", "requiredInventorySha256"])) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "organization map binding");
  }
  if (mapBinding.path !== "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json") {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "organization map path");
  }
  const map = JSON.parse(readBinding(repositoryRoot, mapBinding, "organization map").toString("utf8"));
  const requiredFields = new Map([
    ["company.id", ["pending", "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED"]],
    ["company.company", ["pending", "COMPANY_ROOT_MERGE_RULE_UNCONFIRMED"]],
    ["departmentcode.department", ["exact_mapped", null]],
    ["departmentcode.departmentname", ["exact_mapped", null]],
  ]);
  if (map.inventorySha256 !== mapBinding.requiredInventorySha256 || map.productionImport !== "HOLD") {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "organization map authority");
  }
  for (const [locator, expected] of requiredFields) {
    const [sourceTable, sourceColumn] = locator.split(".");
    const field = map.fields?.find(row => row.sourceTable === sourceTable && row.sourceColumn === sourceColumn);
    if (!field || field.disposition !== expected[0] || field.reasonCode !== expected[1]) {
      fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", locator);
    }
  }

  const materializerBinding = evidence.currentHierarchyMaterializer;
  if (!exactKeys(materializerBinding, ["path", "sha256", "requiredTokens"])) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "hierarchy materializer binding");
  }
  if (materializerBinding.path !== "scripts/hr-cutover/materialize-production-t0-decision-candidates.mjs") {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "hierarchy materializer path");
  }
  const materializer = readBinding(repositoryRoot, materializerBinding, "hierarchy materializer").toString("utf8");
  if (!Array.isArray(materializerBinding.requiredTokens) || materializerBinding.requiredTokens.length === 0
    || materializerBinding.requiredTokens.some(token => typeof token !== "string" || !token || !materializer.includes(token))) {
    fail("COMPANY_DEPARTMENT_ROOT_EVIDENCE_INVALID", "hierarchy materializer tokens");
  }
}

function validateContract(contract, repositoryRoot) {
  if (!exactKeys(contract, CONTRACT_KEYS)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_company_department_root_merge_receipt"
    || contract.sourceSystem !== "yuzhou-v10"
    || contract.scope !== "company_to_existing_department_root_one_to_one_merge"
    || !same(contract.sourceIdentities, SOURCE_IDENTITIES)
    || !same(contract.rootRule, { classification: "no_shorter_department_code_prefix_parent", sourceTable: "departmentcode", sourceKeyColumn: "department" })
    || !same(contract.matchRule, { classification: "trimmed_case_folded_exact_name_candidate", left: "company.company", right: "departmentcode.departmentname", valuesMayAppearInReceipt: false })
    || contract.privacyPolicy !== "table_column_identity_anonymous_counts_deidentified_match_counts_and_sha256_only"
    || contract.materialization !== "NOT_EXECUTED"
    || contract.compatibilityCredit !== 0
    || contract.productionImport !== "HOLD") {
    fail("COMPANY_DEPARTMENT_ROOT_CONTRACT_INVALID", "identity or safety boundary");
  }
  const expectedDecisions = ["MERGE_ONE_TO_ONE_READY", "HOLD_EMPTY_TABLE", "HOLD_INVALID_OR_DUPLICATE_SOURCE_KEY", "HOLD_ZERO_MATCH", "HOLD_MULTIPLE_MATCH", "HOLD_NON_BIJECTIVE_MATCH"];
  if (!same(contract.allowedDecisions, expectedDecisions)
    || !Array.isArray(contract.aggregateFields) || contract.aggregateFields.length !== 22
    || new Set(contract.aggregateFields).size !== contract.aggregateFields.length) {
    fail("COMPANY_DEPARTMENT_ROOT_CONTRACT_INVALID", "decision or aggregate fields");
  }
  validateEvidence(repositoryRoot, contract.evidenceBindings);
}

function validateCatalog(catalog) {
  if (!Array.isArray(catalog) || catalog.length !== CATALOG_COLUMNS.length) {
    fail("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", "cardinality");
  }
  const byLocator = new Map();
  for (const row of catalog) {
    if (!exactKeys(row, ["table", "column", "type", "maxLength", "nullable"])) {
      fail("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", "shape");
    }
    const locator = `${row.table}.${row.column}`;
    if (!CATALOG_COLUMNS.some(([table, column]) => locator === `${table}.${column}`) || byLocator.has(locator)
      || typeof row.type !== "string" || typeof row.nullable !== "boolean"
      || !(row.maxLength === null || (Number.isSafeInteger(row.maxLength) && row.maxLength > 0))) {
      fail("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", locator);
    }
    byLocator.set(locator, row);
  }
  const companyId = byLocator.get("company.id");
  if (!/^(?:tinyint|smallint|int|bigint)$/u.test(companyId.type) || companyId.nullable) {
    fail("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", "company.id");
  }
  for (const locator of ["company.company", "departmentcode.department", "departmentcode.departmentname"]) {
    const row = byLocator.get(locator);
    if (!/^(?:char|nchar|varchar|nvarchar)$/u.test(row.type) || !Number.isSafeInteger(row.maxLength)) {
      fail("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", locator);
    }
  }
  return CATALOG_COLUMNS.map(([table, column]) => byLocator.get(`${table}.${column}`));
}

function validateAggregate(aggregate, fields) {
  if (!exactKeys(aggregate, fields)) fail("COMPANY_DEPARTMENT_ROOT_AGGREGATE_INVALID", "fields");
  for (const field of fields) {
    if (!Number.isSafeInteger(aggregate[field]) || aggregate[field] < 0) {
      fail("COMPANY_DEPARTMENT_ROOT_AGGREGATE_INVALID", field);
    }
  }
  const c = aggregate;
  const companyIdCardinalityIsUnique = c.companyDistinctIdRows + c.companyBlankIdRows === c.companyRows;
  const companyMatchCardinalityIsUnique = c.companyDistinctMatchKeyRows + c.companyBlankMatchKeyRows === c.companyRows;
  const departmentKeyCardinalityIsUnique = c.departmentDistinctKeyRows + c.departmentBlankKeyRows === c.departmentRows;
  const rootMatchCardinalityIsUnique = c.departmentRootDistinctMatchKeyRows + c.departmentRootBlankMatchKeyRows === c.departmentRootRows;
  if (c.departmentRootRows > c.departmentRows
    || c.companyBlankIdRows > c.companyRows
    || c.companyDistinctIdRows + c.companyBlankIdRows > c.companyRows
    || c.companyDuplicateIdGroups > c.companyDistinctIdRows
    || c.companyBlankMatchKeyRows > c.companyRows
    || c.companyDistinctMatchKeyRows + c.companyBlankMatchKeyRows > c.companyRows
    || c.companyDuplicateMatchKeyGroups > c.companyDistinctMatchKeyRows
    || c.departmentBlankKeyRows > c.departmentRows
    || c.departmentDistinctKeyRows + c.departmentBlankKeyRows > c.departmentRows
    || c.departmentDuplicateKeyGroups > c.departmentDistinctKeyRows
    || c.departmentRootBlankMatchKeyRows > c.departmentRootRows
    || c.departmentRootDistinctMatchKeyRows + c.departmentRootBlankMatchKeyRows > c.departmentRootRows
    || c.departmentRootDuplicateMatchKeyGroups > c.departmentRootDistinctMatchKeyRows
    || c.companyZeroMatchRows + c.companyUniqueMatchRows + c.companyMultipleMatchRows !== c.companyRows
    || c.departmentRootZeroMatchRows + c.departmentRootUniqueMatchRows + c.departmentRootMultipleMatchRows !== c.departmentRootRows
    || (c.companyDuplicateIdGroups === 0) !== companyIdCardinalityIsUnique
    || (c.companyDuplicateMatchKeyGroups === 0) !== companyMatchCardinalityIsUnique
    || (c.departmentDuplicateKeyGroups === 0) !== departmentKeyCardinalityIsUnique
    || (c.departmentRootDuplicateMatchKeyGroups === 0) !== rootMatchCardinalityIsUnique
    || ((c.companyMultipleMatchRows === 0 && c.departmentRootMultipleMatchRows === 0)
      && (c.matchedPairRows !== c.companyUniqueMatchRows || c.matchedPairRows !== c.departmentRootUniqueMatchRows))) {
    fail("COMPANY_DEPARTMENT_ROOT_AGGREGATE_INVALID", "count conservation differs");
  }
}

function decide(facts) {
  if (facts.companyRows === 0 || facts.departmentRows === 0) return ["HOLD_EMPTY_TABLE", "EMPTY_SOURCE_TABLE"];
  if (facts.companyBlankIdRows > 0 || facts.companyDuplicateIdGroups > 0
    || facts.departmentBlankKeyRows > 0 || facts.departmentDuplicateKeyGroups > 0) {
    return ["HOLD_INVALID_OR_DUPLICATE_SOURCE_KEY", "SOURCE_KEY_NOT_UNIQUE"];
  }
  if (facts.companyDuplicateMatchKeyGroups > 0 || facts.departmentRootDuplicateMatchKeyGroups > 0
    || facts.companyMultipleMatchRows > 0 || facts.departmentRootMultipleMatchRows > 0) {
    return ["HOLD_MULTIPLE_MATCH", "MATCH_NOT_UNIQUE"];
  }
  if (facts.departmentRootRows === 0 || facts.companyZeroMatchRows > 0 || facts.departmentRootZeroMatchRows > 0) {
    return ["HOLD_ZERO_MATCH", "MATCH_MISSING"];
  }
  if (facts.companyRows === facts.departmentRootRows
    && facts.matchedPairRows === facts.companyRows
    && facts.companyUniqueMatchRows === facts.companyRows
    && facts.departmentRootUniqueMatchRows === facts.departmentRootRows) {
    return ["MERGE_ONE_TO_ONE_READY", "BIJECTIVE_MATCH_COUNTS_VERIFIED"];
  }
  return ["HOLD_NON_BIJECTIVE_MATCH", "MATCH_COUNTS_NOT_BIJECTIVE"];
}

export function buildLegacyCompanyDepartmentRootMergeReceipt({ contract, repositoryRoot, catalog, aggregate, sourceRestoreReceiptSha256, databaseIdentitySha256 }) {
  validateContract(contract, repositoryRoot);
  for (const [label, digest] of Object.entries({ sourceRestoreReceiptSha256, databaseIdentitySha256 })) {
    if (!SHA256.test(digest ?? "")) fail("COMPANY_DEPARTMENT_ROOT_SOURCE_BINDING_INVALID", label);
  }
  const canonicalCatalog = validateCatalog(catalog);
  validateAggregate(aggregate, contract.aggregateFields);
  const canonicalAggregate = Object.fromEntries(contract.aggregateFields.map(field => [field, aggregate[field]]));
  const [decision, reasonCode] = decide(canonicalAggregate);
  if (!contract.allowedDecisions.includes(decision)) fail("COMPANY_DEPARTMENT_ROOT_DECISION_INVALID", decision);
  const body = {
    formatVersion: 1,
    artifactKind: contract.contractKind,
    sourceSystem: contract.sourceSystem,
    scope: contract.scope,
    sourceIdentities: structuredClone(contract.sourceIdentities),
    sourceBinding: {
      sourceRestoreReceiptSha256,
      databaseIdentitySha256,
      companyRootFieldReceiptSha256: contract.evidenceBindings.companyRootFieldReceipt.sha256,
      organizationPositionMapSha256: contract.evidenceBindings.organizationPositionMap.sha256,
      currentHierarchyMaterializerSha256: contract.evidenceBindings.currentHierarchyMaterializer.sha256,
      catalogSha256: hash(`${JSON.stringify(canonicalCatalog)}\n`),
      aggregateQuerySha256: hash(COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL),
      aggregateSha256: hash(`${JSON.stringify(canonicalAggregate)}\n`),
    },
    rootClassification: contract.rootRule.classification,
    matchClassification: contract.matchRule.classification,
    safeFacts: canonicalAggregate,
    decision,
    reasonCode,
    mergeAction: decision === "MERGE_ONE_TO_ONE_READY" ? "MERGE_COMPANY_FIELDS_INTO_MATCHED_DEPARTMENT_ROOT" : "BLOCKED",
    materialization: "NOT_EXECUTED",
    compatibilityCredit: 0,
    containsSourceValues: false,
    containsSourceKeys: false,
    containsPersonData: false,
    productionImport: "HOLD",
  };
  return { ...body, receiptSha256: hash(`${JSON.stringify(body)}\n`) };
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--print-safe-sql") values.printSafeSql = true;
    else if (["--catalog", "--aggregate", "--source-restore-receipt-sha256", "--database-identity-sha256"].includes(arg)) {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) fail("COMPANY_DEPARTMENT_ROOT_ARGUMENT_INVALID", arg);
      values[arg.slice(2).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = next;
      index += 1;
    } else fail("COMPANY_DEPARTMENT_ROOT_ARGUMENT_INVALID", arg);
  }
  return values;
}

function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printSafeSql) {
    if (Object.keys(args).length !== 1) fail("COMPANY_DEPARTMENT_ROOT_ARGUMENT_INVALID", "--print-safe-sql must be used alone");
    process.stdout.write(`${COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL}\n`);
    return;
  }
  for (const field of ["catalog", "aggregate", "sourceRestoreReceiptSha256", "databaseIdentitySha256"]) {
    if (!args[field]) fail("COMPANY_DEPARTMENT_ROOT_ARGUMENT_INVALID", field);
  }
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-company-department-root-merge-receipt-v1.json"), "utf8"));
  const receipt = buildLegacyCompanyDepartmentRootMergeReceipt({
    contract,
    repositoryRoot,
    catalog: JSON.parse(readFileSync(resolve(args.catalog), "utf8")),
    aggregate: JSON.parse(readFileSync(resolve(args.aggregate), "utf8")),
    sourceRestoreReceiptSha256: args.sourceRestoreReceiptSha256,
    databaseIdentitySha256: args.databaseIdentitySha256,
  });
  process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    cli();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
