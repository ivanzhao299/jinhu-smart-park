/* global process */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildLegacyCompanyDepartmentRootMergeReceipt,
  COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL,
  LegacyCompanyDepartmentRootMergeReceiptError,
} from "../hr-cutover/legacy-company-department-root-merge-receipt.mjs";

const root = resolve(import.meta.dirname, "../..");
const contractPath = resolve(root, "scripts/hr-cutover/contracts/legacy-company-department-root-merge-receipt-v1.json");
const contract = () => JSON.parse(readFileSync(contractPath, "utf8"));
const catalog = [
  { table: "company", column: "id", type: "int", maxLength: null, nullable: false },
  { table: "company", column: "company", type: "varchar", maxLength: 50, nullable: false },
  { table: "departmentcode", column: "department", type: "varchar", maxLength: 20, nullable: false },
  { table: "departmentcode", column: "departmentname", type: "varchar", maxLength: 40, nullable: false },
];
const unique = {
  companyRows: 1,
  departmentRows: 3,
  departmentRootRows: 1,
  companyBlankIdRows: 0,
  companyDistinctIdRows: 1,
  companyDuplicateIdGroups: 0,
  companyBlankMatchKeyRows: 0,
  companyDistinctMatchKeyRows: 1,
  companyDuplicateMatchKeyGroups: 0,
  departmentBlankKeyRows: 0,
  departmentDistinctKeyRows: 3,
  departmentDuplicateKeyGroups: 0,
  departmentRootBlankMatchKeyRows: 0,
  departmentRootDistinctMatchKeyRows: 1,
  departmentRootDuplicateMatchKeyGroups: 0,
  matchedPairRows: 1,
  companyZeroMatchRows: 0,
  companyUniqueMatchRows: 1,
  companyMultipleMatchRows: 0,
  departmentRootZeroMatchRows: 0,
  departmentRootUniqueMatchRows: 1,
  departmentRootMultipleMatchRows: 0,
};
const sourceRestoreReceiptSha256 = "a".repeat(64);
const databaseIdentitySha256 = "b".repeat(64);
const build = ({ selectedContract = contract(), selectedCatalog = catalog, selectedAggregate = unique, ...overrides } = {}) => buildLegacyCompanyDepartmentRootMergeReceipt({
  contract: selectedContract,
  repositoryRoot: root,
  catalog: selectedCatalog,
  aggregate: selectedAggregate,
  sourceRestoreReceiptSha256,
  databaseIdentitySha256,
  ...overrides,
});
const rejects = (code, action) => assert.throws(action, error => error instanceof LegacyCompanyDepartmentRootMergeReceiptError && error.code === code);

test("a bijective aggregate match is ready to merge into existing roots without executing materialization", () => {
  const receipt = build();
  assert.equal(receipt.decision, "MERGE_ONE_TO_ONE_READY");
  assert.equal(receipt.reasonCode, "BIJECTIVE_MATCH_COUNTS_VERIFIED");
  assert.equal(receipt.mergeAction, "MERGE_COMPANY_FIELDS_INTO_MATCHED_DEPARTMENT_ROOT");
  assert.equal(receipt.rootClassification, "no_shorter_department_code_prefix_parent");
  assert.equal(receipt.matchClassification, "trimmed_case_folded_exact_name_candidate");
  assert.deepEqual(receipt.sourceIdentities, [
    { table: "company", keyColumn: "id", matchColumn: "company" },
    { table: "departmentcode", keyColumn: "department", matchColumn: "departmentname" },
  ]);
  assert.deepEqual(receipt.safeFacts, unique);
  assert.equal(receipt.materialization, "NOT_EXECUTED");
  assert.equal(receipt.compatibilityCredit, 0);
  assert.equal(receipt.productionImport, "HOLD");
  assert.equal(receipt.containsSourceValues, false);
  assert.equal(receipt.containsSourceKeys, false);
  assert.equal(receipt.containsPersonData, false);
  assert.match(receipt.receiptSha256, /^[0-9a-f]{64}$/u);
  assert.equal(receipt.sourceBinding.aggregateQuerySha256, createHash("sha256").update(COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL).digest("hex"));
});

test("zero matches hold both unmatched company and unmatched root paths", () => {
  const receipt = build({ selectedAggregate: {
    ...unique,
    matchedPairRows: 0,
    companyZeroMatchRows: 1,
    companyUniqueMatchRows: 0,
    departmentRootZeroMatchRows: 1,
    departmentRootUniqueMatchRows: 0,
  } });
  assert.equal(receipt.decision, "HOLD_ZERO_MATCH");
  assert.equal(receipt.reasonCode, "MATCH_MISSING");
  assert.equal(receipt.mergeAction, "BLOCKED");
  assert.equal(receipt.productionImport, "HOLD");
});

test("multiple matches hold whether duplication is on the company or root side", () => {
  const duplicateRoots = build({ selectedAggregate: {
    ...unique,
    departmentRows: 2,
    departmentRootRows: 2,
    departmentDistinctKeyRows: 2,
    departmentRootDistinctMatchKeyRows: 1,
    departmentRootDuplicateMatchKeyGroups: 1,
    matchedPairRows: 2,
    companyUniqueMatchRows: 0,
    companyMultipleMatchRows: 1,
    departmentRootUniqueMatchRows: 2,
  } });
  assert.equal(duplicateRoots.decision, "HOLD_MULTIPLE_MATCH");
  assert.equal(duplicateRoots.reasonCode, "MATCH_NOT_UNIQUE");

  const duplicateCompanies = build({ selectedAggregate: {
    ...unique,
    companyRows: 2,
    companyDistinctIdRows: 2,
    companyDistinctMatchKeyRows: 1,
    companyDuplicateMatchKeyGroups: 1,
    matchedPairRows: 2,
    companyUniqueMatchRows: 2,
    departmentRootUniqueMatchRows: 0,
    departmentRootMultipleMatchRows: 1,
  } });
  assert.equal(duplicateCompanies.decision, "HOLD_MULTIPLE_MATCH");
  assert.equal(duplicateCompanies.mergeAction, "BLOCKED");
});

test("an empty company or department table holds without treating absence as a match", () => {
  const emptyCompany = build({ selectedAggregate: {
    ...unique,
    companyRows: 0,
    companyDistinctIdRows: 0,
    companyDistinctMatchKeyRows: 0,
    matchedPairRows: 0,
    companyUniqueMatchRows: 0,
    departmentRootZeroMatchRows: 1,
    departmentRootUniqueMatchRows: 0,
  } });
  assert.equal(emptyCompany.decision, "HOLD_EMPTY_TABLE");

  const emptyDepartment = build({ selectedAggregate: {
    ...unique,
    departmentRows: 0,
    departmentRootRows: 0,
    departmentDistinctKeyRows: 0,
    departmentRootDistinctMatchKeyRows: 0,
    matchedPairRows: 0,
    companyZeroMatchRows: 1,
    companyUniqueMatchRows: 0,
    departmentRootUniqueMatchRows: 0,
  } });
  assert.equal(emptyDepartment.decision, "HOLD_EMPTY_TABLE");
  assert.equal(emptyDepartment.productionImport, "HOLD");
});

test("duplicate company ids or department keys fail the source-key uniqueness gate", () => {
  const duplicateCompanyIds = build({ selectedAggregate: {
    ...unique,
    companyRows: 2,
    companyDistinctIdRows: 1,
    companyDuplicateIdGroups: 1,
    companyDistinctMatchKeyRows: 2,
    departmentRows: 2,
    departmentRootRows: 2,
    departmentDistinctKeyRows: 2,
    departmentRootDistinctMatchKeyRows: 2,
    matchedPairRows: 2,
    companyUniqueMatchRows: 2,
    departmentRootUniqueMatchRows: 2,
  } });
  assert.equal(duplicateCompanyIds.decision, "HOLD_INVALID_OR_DUPLICATE_SOURCE_KEY");

  const duplicateDepartmentKeys = build({ selectedAggregate: {
    ...unique,
    companyRows: 2,
    companyDistinctIdRows: 2,
    companyDistinctMatchKeyRows: 2,
    departmentRows: 2,
    departmentRootRows: 2,
    departmentDistinctKeyRows: 1,
    departmentDuplicateKeyGroups: 1,
    departmentRootDistinctMatchKeyRows: 2,
    matchedPairRows: 2,
    companyUniqueMatchRows: 2,
    departmentRootUniqueMatchRows: 2,
  } });
  assert.equal(duplicateDepartmentKeys.decision, "HOLD_INVALID_OR_DUPLICATE_SOURCE_KEY");
  assert.equal(duplicateDepartmentKeys.reasonCode, "SOURCE_KEY_NOT_UNIQUE");
});

test("catalog aggregate source identity and hash-bound authority drift fail closed", () => {
  rejects("COMPANY_DEPARTMENT_ROOT_SOURCE_BINDING_INVALID", () => build({ sourceRestoreReceiptSha256: "not-a-sha" }));
  rejects("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", () => build({ selectedCatalog: catalog.slice(1) }));
  rejects("COMPANY_DEPARTMENT_ROOT_CATALOG_INVALID", () => build({ selectedCatalog: catalog.map((row, index) => index === 0 ? { ...row, sourceValue: 1 } : row) }));
  rejects("COMPANY_DEPARTMENT_ROOT_AGGREGATE_INVALID", () => build({ selectedAggregate: { ...unique, companyUniqueMatchRows: 2 } }));
  rejects("COMPANY_DEPARTMENT_ROOT_AGGREGATE_INVALID", () => build({ selectedAggregate: { ...unique, sourceValue: 1 } }));

  const evidenceDrift = contract();
  evidenceDrift.evidenceBindings.organizationPositionMap.sha256 = "0".repeat(64);
  rejects("COMPANY_DEPARTMENT_ROOT_EVIDENCE_DRIFT", () => build({ selectedContract: evidenceDrift }));

  const unsafeContract = contract();
  unsafeContract.compatibilityCredit = 1;
  rejects("COMPANY_DEPARTMENT_ROOT_CONTRACT_INVALID", () => build({ selectedContract: unsafeContract }));
});

test("receipt hashes are stable across catalog and aggregate input order", () => {
  const baseline = build();
  const reordered = build({
    selectedCatalog: [...catalog].reverse(),
    selectedAggregate: Object.fromEntries(Object.entries(unique).reverse()),
  });
  assert.equal(reordered.sourceBinding.catalogSha256, baseline.sourceBinding.catalogSha256);
  assert.equal(reordered.sourceBinding.aggregateSha256, baseline.sourceBinding.aggregateSha256);
  assert.equal(reordered.receiptSha256, baseline.receiptSha256);
});

test("safe SQL and receipt expose no source values credentials people or mutation path", () => {
  const sql = COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL;
  assert.match(sql, /FROM dbo\.company/u);
  assert.match(sql, /FROM dbo\.departmentcode/u);
  assert.match(sql, /LEN\(parent\.source_key\) < LEN\(child\.source_key\)/u);
  assert.match(sql, /root_row\.match_key = company_row\.match_key/u);
  assert.doesNotMatch(sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|EXEC(?:UTE)?|ALTER|DROP|TRUNCATE)\b/iu);
  assert.doesNotMatch(sql, /\bdbo\.(?:person|job|salary|payroll)\b/iu);
  assert.doesNotMatch(sql, /\bAS\s+(?:companyName|companyCode|departmentName|departmentCode|sourceValue|matchedValue)\b/iu);

  const serialized = JSON.stringify(build());
  assert.doesNotMatch(serialized, /"(?:sourceValue|sourceName|sourceCode|companyName|departmentName|matchedValue|employee|person)"\s*:/iu);
  assert.doesNotMatch(serialized, /(?:password|credential|token|secret)/iu);
});

test("CLI only prints the reviewed read-only aggregate query when requested", () => {
  const script = resolve(root, "scripts/hr-cutover/legacy-company-department-root-merge-receipt.mjs");
  const result = spawnSync(process.execPath, [script, "--print-safe-sql"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), COMPANY_DEPARTMENT_ROOT_SAFE_AGGREGATE_SQL);
  assert.equal(result.stderr, "");
});
