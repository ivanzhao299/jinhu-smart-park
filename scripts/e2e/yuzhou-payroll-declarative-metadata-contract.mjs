import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { normalizePayrollItemDeclarativeMetadata } from "../transform-yuzhou-t4-payroll-history.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const migration = read("database/migrations/000296_hr_payroll_item_legacy_declarative_metadata.sql");
const loader = read("scripts/sql/load-yuzhou-t4-payroll-history.sql");
const entity = read("apps/api/src/modules/hr/entities/hr.entities.ts");
const service = read("apps/api/src/modules/hr/hr-payroll-history.service.ts");
const webApi = read("apps/web/lib/hr-api.ts");
const parityContract = JSON.parse(read("scripts/hr-cutover/contracts/legacy-payroll-rule-family-parity-v1.json"));

const metadataColumns = [
  "legacy_print_width",
  "legacy_print_width_hash",
  "legacy_tax_flag",
  "legacy_no_decimal_flag",
  "legacy_use_flag",
  "legacy_decimal_length",
  "legacy_decimal_length_hash",
  "legacy_print_report",
  "legacy_print_report_hash",
  "legacy_item_title",
  "legacy_long_description",
  "suppress_decimals",
  "legacy_metadata_review_required",
];

test("000296 adds only declarative payroll metadata and keeps legacy rows review-required", () => {
  assert.match(migration, /^BEGIN;/u);
  assert.match(migration, /COMMIT;\s*$/u);
  for (const column of metadataColumns) assert.match(migration, new RegExp(`ADD COLUMN ${column}\\b`, "u"));
  assert.match(migration, /legacy_metadata_review_required boolean NOT NULL DEFAULT true/u);
  assert.match(migration, /legacy_print_width_hash IS NULL OR legacy_print_width_hash ~ '\^\[0-9a-f\]\{64\}\$'/u);
  assert.match(migration, /legacy_decimal_length BETWEEN 0 AND 4/u);
  assert.match(migration, /decimal_scale = legacy_decimal_length/u);
  assert.doesNotMatch(migration, /ADD COLUMN [^\n]*(?:expression|condition|default_value)/iu);
});

test("source contract declares legacy integer columns while JSON remains defensive", () => {
  const salaryItems = parityContract.sourceBinding.sourceObjects.find(item => item.name === "salaryitems");
  assert.deepEqual(salaryItems.declaredIntegerFields, ["printwidth", "declen", "printreport"]);
});

test("T4 item loader preserves raw flags and projects only reviewed normalized booleans", () => {
  const itemInsert = loader.slice(
    loader.indexOf("INSERT INTO hr_payroll_item_version"),
    loader.indexOf("INSERT INTO hr_payroll_formula_version"),
  );
  assert.ok(itemInsert.length > 0);
  for (const column of metadataColumns) assert.match(itemInsert, new RegExp(`\\b${column}\\b`, "u"));
  for (const sourceField of ["istax", "notdec", "isuse"]) assert.match(itemInsert, new RegExp(`source'->>'${sourceField}'`, "u"));
  for (const metadataField of ["printWidth", "legacyDecimalLength", "legacyPrintReport"]) assert.match(itemInsert, new RegExp(`declarativeMetadata'->>'${metadataField}'~'\\^-\\?\\[0-9\\]\\{1,10\\}\\$'`, "u"));
  assert.doesNotMatch(itemInsert, /source'->>'(?:printwidth|declen|printreport)'[^,;]*::int/u);
  assert.match(itemInsert, /::numeric BETWEEN -2147483648 AND 2147483647/u);
  assert.match(itemInsert, /ELSE false END/u);
  assert.match(itemInsert, /legacyMetadataReviewRequired'WHEN'false'THEN false ELSE true END/u);
  assert.doesNotMatch(itemInsert, /source'->>'(?:expression[2-5]?|cit[2-5]?|defvalue)'/u);
});

test("declarative normalizer converts reviewed metadata without payroll values", () => {
  assert.deepEqual(normalizePayrollItemDeclarativeMetadata({
    datatype: "数值", printwidth: 12, istax: "是", notdec: "否", isuse: "使用", declen: 2,
    printreport: 1, itemtitle: "标题", des: "说明",
  }), {
    printWidth: 12,
    printWidthSourceHash: "6b51d431df5d7f141cbececcf79edf3dd861c3b4069f0b11661a3eefacbba918",
    taxable: true,
    suppressDecimals: false,
    enabled: true,
    legacyDecimalLength: 2,
    decimalLengthSourceHash: "d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35",
    decimalScale: 2,
    legacyPrintReport: 1,
    printReportSourceHash: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
    printEnabled: true,
    itemTitle: "标题",
    longDescription: "说明",
    legacyMetadataReviewRequired: false,
  });
});

test("invalid and null integer metadata is hashed, quarantined from casts, and marked for review", () => {
  const invalid = normalizePayrollItemDeclarativeMetadata({
    datatype: "数值", printwidth: "not-an-int", istax: "unknown", notdec: null, isuse: "unknown",
    declen: null, printreport: "999999999999", itemtitle: null, des: "",
  });
  assert.equal(invalid.printWidth, null);
  assert.match(invalid.printWidthSourceHash, /^[0-9a-f]{64}$/u);
  assert.equal(invalid.legacyDecimalLength, null);
  assert.equal(invalid.decimalLengthSourceHash, null);
  assert.equal(invalid.legacyPrintReport, null);
  assert.match(invalid.printReportSourceHash, /^[0-9a-f]{64}$/u);
  assert.equal(invalid.decimalScale, 4);
  assert.equal(invalid.enabled, false);
  assert.equal(invalid.taxable, null);
  assert.equal(invalid.printEnabled, null);
  assert.equal(invalid.legacyMetadataReviewRequired, true);
});

test("entity hides raw legacy flags from default ORM projection", () => {
  const itemEntity = entity.slice(entity.indexOf("export class HrPayrollItemVersionEntity"), entity.indexOf("@Entity(\"hr_payroll_formula_version\")"));
  for (const field of ["legacy_print_width_hash", "legacy_tax_flag", "legacy_no_decimal_flag", "legacy_use_flag", "legacy_decimal_length_hash", "legacy_print_report_hash", "legacy_item_title", "legacy_long_description"]) {
    assert.match(itemEntity, new RegExp(`name:\"${field}\",type:\"varchar\"`, "u"));
  }
  for (const field of ["legacy_tax_flag", "legacy_no_decimal_flag", "legacy_use_flag", "legacy_print_report"]) {
    assert.match(itemEntity, new RegExp(`name:\"${field}\"[^}]+select:false`, "u"));
  }
  for (const field of ["legacyPrintWidth", "legacyDecimalLength", "legacyItemTitle", "legacyLongDescription", "suppressDecimals", "legacyMetadataReviewRequired"]) {
    assert.match(itemEntity, new RegExp(`\\b${field}\\b`, "u"));
  }
});

test("catalog API exposes normalized metadata without raw flags or formula bodies", () => {
  const catalog = service.slice(service.indexOf("async listCatalogItems"), service.indexOf("async listFormulas"));
  for (const alias of ["legacyPrintWidth", "legacyDecimalLength", "legacyItemTitle", "legacyLongDescription", "suppressDecimals", "legacyMetadataReviewRequired"]) {
    assert.match(catalog, new RegExp(`\"${alias}\"`, "u"));
  }
  assert.doesNotMatch(catalog, /legacy_(?:tax|no_decimal|use)_flag|legacy_print_report|raw_expression|raw_condition/iu);
  assert.match(catalog, /this\.requireRuleRead\(actor\)/u);
  assert.match(catalog, /await this\.audit\(scope,actor/u);
});

test("web payroll catalog types preserve nullable legacy metadata", () => {
  const catalogItem = webApi.match(/export interface HrPayrollCatalogItem \{([^}]*)\}/u)?.[1] ?? "";
  assert.ok(catalogItem.length > 0);
  for (const field of ["legacyPrintWidth", "legacyDecimalLength", "legacyItemTitle", "legacyLongDescription", "suppressDecimals"]) {
    assert.match(catalogItem, new RegExp(`\\b${field}:[^;]+\\|null;`, "u"));
  }
  assert.match(catalogItem, /\blegacyPrintWidth:number\|null;/u);
  assert.match(catalogItem, /\blegacyDecimalLength:number\|null;/u);
  assert.match(catalogItem, /\blegacyItemTitle:string\|null;/u);
  assert.match(catalogItem, /\blegacyLongDescription:string\|null;/u);
  assert.match(catalogItem, /\bsuppressDecimals:boolean\|null;/u);
  assert.match(catalogItem, /\blegacyMetadataReviewRequired:boolean;/u);
  assert.doesNotMatch(catalogItem, /\blegacyMetadataReviewRequired:boolean\|null;/u);
});

console.log("Yuzhou payroll declarative metadata contract passed.");
