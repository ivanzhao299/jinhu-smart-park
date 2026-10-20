/**
 * Complete, immutable monthly payroll source contract.
 *
 * This deliberately is not part of the generic incremental-import contract:
 * payroll values require one complete month generation, stable source identity
 * and a server-owned head compare-and-swap before they can be used for trial.
 */
export const YUZHOU_PAYROLL_SOURCE_VERSION = 1 as const;
export const YUZHOU_PAYROLL_SOURCE_MAX_BYTES = 8 * 1024 * 1024;
export const YUZHOU_PAYROLL_SOURCE_LIMITS = Object.freeze({ books: 50, records: 5000, values: 200000, itemVersions: 2048, formulas: 4096 });

export type YuzhouPayrollSourceValue = {
  column: string;
  valueType: "decimal" | "text" | "date";
  isSourceNull: boolean;
  decimalValue?: string;
  textValue?: string;
  dateValue?: string;
  sourceHash: string;
};

export type YuzhouPayrollSourceRecord = {
  sourcePersonIdentity: string;
  sourceRowSha256: string;
  employeeMappingId: string;
  sourceTable: string;
  values: YuzhouPayrollSourceValue[];
  summary: { grossAmount?: string | null; deductionAmount?: string | null; taxAmount?: string | null; netAmount?: string | null };
};

export type YuzhouPayrollSourceItemMetadata = {
  taxable: boolean | null;
  printEnabled: boolean | null;
  enabled: boolean;
  printWidth: number | null;
  printWidthSourceHash: string | null;
  taxFlag: string | null;
  noDecimalFlag: string | null;
  useFlag: string | null;
  legacyDecimalLength: number | null;
  decimalLengthSourceHash: string | null;
  legacyPrintReport: number | null;
  printReportSourceHash: string | null;
  itemTitle: string | null;
  longDescription: string | null;
  suppressDecimals: boolean | null;
  legacyMetadataReviewRequired: boolean;
};

export type YuzhouPayrollSourceItem = {
  legacyItemName: string;
  itemCode: string;
  displayName: string;
  valueType: "decimal" | "text" | "date";
  legacyItemType: string;
  legacyAddOrSub: string;
  itemCategory: "earning" | "deduction" | "employer_contribution" | "summary" | "informational" | "unclassified";
  decimalScale: number | null;
  sortNo: number;
  sourceHash: string;
  declarativeMetadata?: YuzhouPayrollSourceItemMetadata;
};

export type YuzhouPayrollSourceFormula = {
  legacyFormulaId: number;
  itemCode: string | null;
  rawExpression: string;
  rawCondition: string | null;
  calculationOrder: number;
  sourceHash: string;
};

export type YuzhouPayrollSourceBook = {
  scheme: number;
  bookName: string | null;
  closeState: 0 | 1;
  closeSourceHash: string;
  records: YuzhouPayrollSourceRecord[];
  items: YuzhouPayrollSourceItem[];
  formulas: YuzhouPayrollSourceFormula[];
};

export type YuzhouPayrollSourcePackage = {
  version: typeof YUZHOU_PAYROLL_SOURCE_VERSION;
  sourceSystem: "yuzhou-v10";
  targetScope: { tenantId: string; parkId: string };
  manifestId: string;
  sourceInstance: string;
  month: string;
  extractedAt: string;
  evidenceSha256: string;
  expectedHeadVersion: number;
  expectedHeadHash: string | null;
  bookSetSha256: string;
  rosterSha256: string;
  catalogSha256: string;
  books: YuzhouPayrollSourceBook[];
};

const SHA256 = /^[0-9a-f]{64}$/u;
const SCOPE_ID = /^\S{1,64}$/u;
const MONTH = /^(?:19|20|21)\d{2}-(?:0[1-9]|1[0-2])$/u;
const DECIMAL = /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/u;
const DATE = /^(?!0000)\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const text = (value: unknown, max: number, empty = false): value is string => typeof value === "string"
  && !value.includes("\0") && [...value].length <= max && (empty || value.trim().length > 0);
const integer = (value: unknown, min = -2147483648): value is number => typeof value === "number"
  && Number.isInteger(value) && value >= min && value <= 2147483647;
const decimal = (value: unknown): value is string => typeof value === "string" && DECIMAL.test(value);
const date = (value: unknown): value is string => typeof value === "string" && DATE.test(value)
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value;
function shape(value: unknown, required: string[], optional: string[] = [], code = "SCHEMA_INVALID"): void {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || required.some(key => !Object.prototype.hasOwnProperty.call(value, key))
    || Object.keys(value).some(key => !required.includes(key) && !optional.includes(key)))
    throw new Error(`YUZHOU_PAYROLL_SOURCE_${code}`);
}

export function validateYuzhouPayrollItemMetadata(item: YuzhouPayrollSourceItem): void {
  const metadata = item.declarativeMetadata;
  if (metadata === undefined) {
    if (Object.prototype.hasOwnProperty.call(item, "declarativeMetadata")) throw new Error("YUZHOU_PAYROLL_SOURCE_ITEM_METADATA_INVALID");
    return;
  }
  const fail = () => { throw new Error("YUZHOU_PAYROLL_SOURCE_ITEM_METADATA_INVALID"); };
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) || Object.keys(metadata).length !== 16) fail();
  for (const key of ["taxable", "printEnabled", "suppressDecimals"] as const)
    if (metadata[key] !== null && typeof metadata[key] !== "boolean") fail();
  for (const key of ["enabled", "legacyMetadataReviewRequired"] as const)
    if (typeof metadata[key] !== "boolean") fail();
  for (const key of ["printWidth", "legacyDecimalLength", "legacyPrintReport"] as const)
    if (metadata[key] !== null && (!Number.isInteger(metadata[key]) || metadata[key]! < -2147483648 || metadata[key]! > 2147483647)) fail();
  for (const key of ["printWidthSourceHash", "decimalLengthSourceHash", "printReportSourceHash"] as const)
    if (metadata[key] !== null && !SHA256.test(metadata[key]!)) fail();
  for (const [key, max] of [["taxFlag", 2], ["noDecimalFlag", 2], ["useFlag", 4], ["itemTitle", 24], ["longDescription", 100]] as const)
    if (metadata[key] !== null && (!text(metadata[key], max, true))) fail();
  if (!metadata.legacyMetadataReviewRequired && ([metadata.printWidth, metadata.printWidthSourceHash, metadata.taxFlag,
    metadata.taxable, metadata.noDecimalFlag, metadata.suppressDecimals, metadata.useFlag, metadata.legacyDecimalLength,
    metadata.decimalLengthSourceHash, metadata.legacyPrintReport, metadata.printReportSourceHash, metadata.printEnabled].some(value => value === null)
    || (item.valueType === "decimal" && (metadata.legacyDecimalLength! < 0 || metadata.legacyDecimalLength! > 4 || metadata.legacyDecimalLength !== item.decimalScale)))) fail();
}

export const canonicalJson = (value: unknown): string => value === null || typeof value !== "object"
  ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonicalJson).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map(key => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;

export function canonicalYuzhouPayrollSourcePackage(input: YuzhouPayrollSourcePackage): YuzhouPayrollSourcePackage {
  return { ...input, books: [...input.books].map(book => ({ ...book,
    records: [...book.records].map(record => ({ ...record, values: [...record.values].sort((a, b) => compare(a.column, b.column)) })).sort((a, b) => compare(a.sourcePersonIdentity, b.sourcePersonIdentity)),
    items: [...book.items].sort((a, b) => compare(a.itemCode, b.itemCode)),
    formulas: [...book.formulas].sort((a, b) => a.legacyFormulaId - b.legacyFormulaId),
  })).sort((a, b) => a.scheme - b.scheme) };
}

/** Reject ambiguous or incomplete packages before persistence; no amount is coerced to a Number. */
export function validateYuzhouPayrollSourcePackage(input: YuzhouPayrollSourcePackage): void {
  shape(input, ["version", "sourceSystem", "targetScope", "manifestId", "sourceInstance", "month", "extractedAt", "evidenceSha256", "expectedHeadVersion", "expectedHeadHash", "bookSetSha256", "rosterSha256", "catalogSha256", "books"]);
  if (input.version !== 1 || input.sourceSystem !== "yuzhou-v10" || typeof input.month !== "string" || !MONTH.test(input.month)
    || !text(input.sourceInstance, 128) || !text(input.manifestId, 200) || !integer(input.expectedHeadVersion, 0)
    || (input.expectedHeadVersion === 0 ? input.expectedHeadHash !== null : typeof input.expectedHeadHash !== "string" || !SHA256.test(input.expectedHeadHash))
    || typeof input.extractedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/u.test(input.extractedAt)
    || !date(input.extractedAt.slice(0, 10)) || !Number.isFinite(Date.parse(input.extractedAt))) throw new Error("YUZHOU_PAYROLL_SOURCE_PACKAGE_INVALID");
  shape(input.targetScope, ["tenantId", "parkId"], [], "TARGET_SCOPE_INVALID");
  if (!text(input.targetScope.tenantId, 64) || !SCOPE_ID.test(input.targetScope.tenantId) || !text(input.targetScope.parkId, 64) || !SCOPE_ID.test(input.targetScope.parkId)) throw new Error("YUZHOU_PAYROLL_SOURCE_TARGET_SCOPE_INVALID");
  for (const hash of [input.evidenceSha256, input.bookSetSha256, input.rosterSha256, input.catalogSha256]) if (typeof hash !== "string" || !SHA256.test(hash)) throw new Error("YUZHOU_PAYROLL_SOURCE_HASH_INVALID");
  if (!Array.isArray(input.books) || !input.books.length || input.books.length > YUZHOU_PAYROLL_SOURCE_LIMITS.books) throw new Error("YUZHOU_PAYROLL_SOURCE_BOOK_SET_INVALID");
  let records = 0, values = 0, items = 0, formulas = 0;
  const schemes = new Set<number>(), formulaIds = new Set<number>();
  for (const book of input.books) {
    shape(book, ["scheme", "bookName", "closeState", "closeSourceHash", "records", "items", "formulas"]);
    if (!integer(book.scheme, 1) || book.scheme > 35 || schemes.has(book.scheme) || (book.closeState !== 0 && book.closeState !== 1)
      || !text(book.closeSourceHash, 64) || !SHA256.test(book.closeSourceHash) || (book.bookName !== null && !text(book.bookName, 200, true))
      || !Array.isArray(book.items) || !Array.isArray(book.formulas) || !Array.isArray(book.records) || !book.records.length) throw new Error("YUZHOU_PAYROLL_SOURCE_BOOK_INVALID");
    schemes.add(book.scheme); items += book.items.length; formulas += book.formulas.length; records += book.records.length;
    const people = new Set<string>(), employees = new Set<string>(), rowHashes = new Set<string>(), itemCodes = new Set<string>(), itemNames = new Set<string>();
    const aliases = new Map<string, YuzhouPayrollSourceItem>();
    for (const item of book.items) {
      shape(item, ["legacyItemName", "itemCode", "displayName", "valueType", "legacyItemType", "legacyAddOrSub", "itemCategory", "decimalScale", "sortNo", "sourceHash"], ["declarativeMetadata"]);
      validateYuzhouPayrollItemMetadata(item);
      if (!text(item.itemCode, 96) || !text(item.legacyItemName, 64) || !text(item.displayName, 200, true)
        || !text(item.legacyItemType, 64, true) || !text(item.legacyAddOrSub, 32, true) || !integer(item.sortNo)
        || itemCodes.has(item.itemCode) || itemNames.has(item.legacyItemName) || !text(item.sourceHash, 64) || !SHA256.test(item.sourceHash)
        || !["decimal", "text", "date"].includes(item.valueType)
        || !["earning", "deduction", "employer_contribution", "summary", "informational", "unclassified"].includes(item.itemCategory)
        || (item.valueType === "decimal" ? !integer(item.decimalScale, 0) || item.decimalScale > 4 : item.decimalScale !== null)) throw new Error("YUZHOU_PAYROLL_SOURCE_CATALOG_INVALID");
      itemCodes.add(item.itemCode); itemNames.add(item.legacyItemName);
      for (const alias of new Set([item.itemCode, item.legacyItemName])) {
        if (aliases.has(alias)) throw new Error("YUZHOU_PAYROLL_SOURCE_CATALOG_ALIAS_AMBIGUOUS");
        aliases.set(alias, item);
      }
    }
    for (const formula of book.formulas) {
      shape(formula, ["legacyFormulaId", "itemCode", "rawExpression", "rawCondition", "calculationOrder", "sourceHash"]);
      if (!integer(formula.legacyFormulaId, 1) || formulaIds.has(formula.legacyFormulaId) || !integer(formula.calculationOrder, 1)
        || (formula.itemCode !== null && !text(formula.itemCode, 96)) || !text(formula.rawExpression, YUZHOU_PAYROLL_SOURCE_MAX_BYTES, true)
        || (formula.rawCondition !== null && !text(formula.rawCondition, YUZHOU_PAYROLL_SOURCE_MAX_BYTES, true))
        || !text(formula.sourceHash, 64) || !SHA256.test(formula.sourceHash)) throw new Error("YUZHOU_PAYROLL_SOURCE_FORMULA_INVALID");
      // Distinct IDs may legitimately target one item (conditional formulas).
      formulaIds.add(formula.legacyFormulaId);
    }
    for (const record of book.records) {
      shape(record, ["sourcePersonIdentity", "sourceRowSha256", "employeeMappingId", "sourceTable", "values", "summary"]);
      if (!text(record.sourcePersonIdentity, 256) || people.has(record.sourcePersonIdentity)
        || !text(record.sourceRowSha256, 64) || !SHA256.test(record.sourceRowSha256) || rowHashes.has(record.sourceRowSha256)
        || typeof record.employeeMappingId !== "string" || !UUID.test(record.employeeMappingId) || employees.has(record.employeeMappingId)
        || record.sourceTable !== `salary${String(book.scheme).padStart(2, "0")}` && record.sourceTable !== `dbo.salary${String(book.scheme).padStart(2, "0")}`
        || !Array.isArray(record.values) || !record.values.length) throw new Error("YUZHOU_PAYROLL_SOURCE_NATURAL_KEY_INVALID");
      people.add(record.sourcePersonIdentity); employees.add(record.employeeMappingId); rowHashes.add(record.sourceRowSha256); values += record.values.length;
      shape(record.summary, [], ["grossAmount", "deductionAmount", "taxAmount", "netAmount"]);
      if (Object.values(record.summary).some(value => value !== null && !decimal(value))) throw new Error("YUZHOU_PAYROLL_SOURCE_SUMMARY_INVALID");
      const columns = new Set<string>(), targets = new Set<string>();
      for (const value of record.values) {
        shape(value, ["column", "valueType", "isSourceNull", "sourceHash"], ["decimalValue", "textValue", "dateValue"]);
        const item = aliases.get(value.column);
        if (!text(value.column, 64) || columns.has(value.column) || !text(value.sourceHash, 64) || !SHA256.test(value.sourceHash)
          || !item || targets.has(item.itemCode) || item.valueType !== value.valueType || typeof value.isSourceNull !== "boolean") throw new Error("YUZHOU_PAYROLL_SOURCE_VALUE_INVALID");
        columns.add(value.column); targets.add(item.itemCode);
        const present = ["decimalValue", "textValue", "dateValue"].filter(key => Object.prototype.hasOwnProperty.call(value, key));
        if (value.isSourceNull ? present.length !== 0 : present.length !== 1 || present[0] !== `${value.valueType}Value`) throw new Error("YUZHOU_PAYROLL_SOURCE_NULL_INVALID");
        if (!value.isSourceNull && (value.valueType === "decimal" ? !decimal(value.decimalValue)
          : value.valueType === "text" ? !text(value.textValue, YUZHOU_PAYROLL_SOURCE_MAX_BYTES, true) : !date(value.dateValue))) throw new Error("YUZHOU_PAYROLL_SOURCE_VALUE_TYPE_INVALID");
      }
    }
  }
  if (!records || !values || records > YUZHOU_PAYROLL_SOURCE_LIMITS.records || values > YUZHOU_PAYROLL_SOURCE_LIMITS.values || items > YUZHOU_PAYROLL_SOURCE_LIMITS.itemVersions || formulas > YUZHOU_PAYROLL_SOURCE_LIMITS.formulas) throw new Error("YUZHOU_PAYROLL_SOURCE_LIMIT_EXCEEDED");
  if (new TextEncoder().encode(canonicalJson(canonicalYuzhouPayrollSourcePackage(input))).byteLength > YUZHOU_PAYROLL_SOURCE_MAX_BYTES) throw new Error("YUZHOU_PAYROLL_SOURCE_PACKAGE_TOO_LARGE");
}

/** Browser-neutral canonical hash inputs. API and offline writer supply SHA256. */
export function yuzhouPayrollSourceHashInputs(input: YuzhouPayrollSourcePackage) {
  const { books } = canonicalYuzhouPayrollSourcePackage(input);
  return {
    bookSetSha256: books.map(book => ({ scheme: book.scheme, closeState: book.closeState, closeSourceHash: book.closeSourceHash })),
    rosterSha256: books.map(book => ({ scheme: book.scheme, roster: book.records.map(row => row.sourcePersonIdentity) })),
    catalogSha256: books.map(book => ({ scheme: book.scheme, items: book.items, formulas: book.formulas })),
  };
}

export function validateYuzhouPayrollSourceHashes(input: YuzhouPayrollSourcePackage, digest: (value: string) => string): void {
  for (const [key, value] of Object.entries(yuzhouPayrollSourceHashInputs(input))) {
    if (input[key as keyof ReturnType<typeof yuzhouPayrollSourceHashInputs>] !== digest(canonicalJson(value)))
      throw new Error("YUZHOU_PAYROLL_SOURCE_DECLARED_HASH_MISMATCH");
  }
}
