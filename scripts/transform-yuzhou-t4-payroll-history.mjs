#!/usr/bin/env node
import { createHash } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareCanonical = (left, right) => left < right ? -1 : left > right ? 1 : 0;
export const canonical = (value) => Array.isArray(value)
  ? `[${value.map(canonical).join(",")}]`
  : value && typeof value === "object"
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`
    : JSON.stringify(value);

const exactInteger = (value, label) => {
  const text = String(value);
  if (!/^-?\d+$/.test(text)) throw new Error(`${label} must be an integer`);
  return BigInt(text);
};

export const exactDecimal = (value, present = true) => {
  if (!present) return { kind: "missing_column" };
  if (value === null) return { kind: "null" };
  const raw = String(value);
  if (raw === "") return { kind: "empty", raw };
  const match = /^([+-]?)(\d{1,16})(?:\.(\d{1,4}))?$/.exec(raw.trim());
  if (!match) return { kind: "invalid", rawSha256: sha256(raw) };
  const scale4 = `${match[3] ?? ""}0000`.slice(0, 4);
  let scaled = BigInt(match[2]) * 10000n + BigInt(scale4);
  if (match[1] === "-") scaled = -scaled;
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const whole = absolute / 10000n;
  const fraction = String(absolute % 10000n).padStart(4, "0");
  const decimal = `${negative ? "-" : ""}${whole}.${fraction}`;
  return { kind: scaled === 0n ? "zero" : "decimal", decimal };
};

const SYSTEM_SUMMARIES = Object.freeze({
  Saddsum: "gross_total", Ssubsum: "deduction_total", Stax: "tax_total", Srealpay: "net_total",
});
const BASE_COLUMNS = new Set(["year", "month", "department", "departmentname", "person", "name", "temp"]);
const FORBIDDEN_FORMULA = /(?:--|\/\*|\*\/|;|\b(?:select|insert|update|delete|drop|alter|exec(?:ute)?|merge|union|while|for|function|new|this|prototype|constructor|import|require)\b)/i;

export const lexicalFormulaProfile = (expression, condition) => {
  const raw = expression == null ? "" : String(expression);
  const cit = condition == null ? "" : String(condition);
  const tokens = raw.match(/\[([^\]]+)\]|\d+(?:\.\d+)?|<=|>=|<>|!=|==|[+\-*/()?:<>=]|[\p{L}_][\p{L}\p{N}_.]*/gu) ?? [];
  const compact = raw.replace(/\s+/gu, "");
  const tokenText = tokens.join("");
  const crossDomain = /\[\s*人事系统\s*\./u.test(raw) || /\[\s*人事系统\s*\./u.test(cit);
  const unsafe = raw.length > 4000 || tokens.length > 512 || FORBIDDEN_FORMULA.test(raw) || tokenText !== compact;
  return {
    expressionSha256: sha256(raw), conditionSha256: sha256(cit), expressionLength: raw.length,
    tokenCount: tokens.length, hasCondition: cit.trim() !== "", crossDomainReference: crossDomain,
    lexicalStatus: unsafe ? "rejected" : cit.trim() !== "" || crossDomain ? "manual_review" : "profiled",
  };
};

const readArray = (path) => {
  const data = JSON.parse(readFileSync(path, "utf8"));
  if (!Array.isArray(data)) throw new Error(`${basename(path)} must contain an array`);
  return data;
};
const writeJsonl = (path, rows) => {
  const ordered = [...rows].sort((left, right) => compareCanonical(canonical(left), canonical(right)));
  writeFileSync(path, ordered.map((row) => JSON.stringify(row)).join("\n") + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return { rows: ordered.length, fileSha256: sha256(readFileSync(path)) };
};
const identity = (table, sourceKey, source) => ({
  sourceTable: `dbo.${table}`, sourceKey: String(sourceKey),
  sourceIdentitySha256: sha256(`dbo.${table}\0${sourceKey}`), sourceRowSha256: sha256(canonical(source)),
});

export function transformPayroll(dir, evidencePath) {
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  const expected = evidence.payrollProfile;
  const catalog = readArray(resolve(dir, "catalog.raw.json"));
  const byTable = new Map();
  for (const column of catalog) {
    const columns = byTable.get(column.tableName) ?? [];
    columns.push(column); byTable.set(column.tableName, columns);
  }
  const expectedTables = Array.from({ length: 35 }, (_, index) => `salary${String(index + 1).padStart(2, "0")}`);
  if (expectedTables.some((table) => !byTable.has(table)) || expectedTables.some((table) => !/^salary(?:0[1-9]|[12]\d|3[0-5])$/.test(table))) throw new Error("salary table whitelist/catalog drift");

  const itemsRaw = readArray(resolve(dir, "items.raw.json"));
  const itemMap = new Map(itemsRaw.map((row) => [`${row.scheme}\0${row.itemname}`, row]));
  const items = itemsRaw.map((row) => ({ ...identity("salaryitems", `${row.scheme}/${row.itemname}`, row), source: row }));
  const formulasRaw = readArray(resolve(dir, "formulas.raw.json"));
  const formulas = formulasRaw.map((row) => ({ ...identity("salaryequal", row.id, row), source: row, lexicalProfile: lexicalFormulaProfile(row.expression, row.cit) }));
  const closesRaw = readArray(resolve(dir, "closes.raw.json"));
  const closes = closesRaw.map((row) => ({ ...identity("salarycount", `${row.scheme}/${row.year}/${row.month}`, row), source: row }));
  const membershipsRaw = readArray(resolve(dir, "scheme-memberships.raw.json"));
  const memberships = membershipsRaw.map((row) => ({ ...identity("schemes", row.id, row), source: row }));
  const taxRaw = readArray(resolve(dir, "tax-rules.raw.json"));
  const taxRules = taxRaw.map((row) => ({ ...identity("tax", row.id, row), source: { id: row.id, base: exactDecimal(row.base), limit1: exactDecimal(row.limit1), limit2: exactDecimal(row.limit2), taxpercent: exactDecimal(row.taxpercent), offset: exactDecimal(row.offset) } }));

  const payslips = [];
  let salaryRows = 0n;
  let minimumYear = null; let maximumYear = null;
  for (const table of expectedTables) {
    const scheme = table.slice(-2);
    const physical = byTable.get(table).sort((left, right) => {
      const leftId = exactInteger(left.columnId, "column id"); const rightId = exactInteger(right.columnId, "column id");
      return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
    });
    const physicalNames = new Set(physical.map((column) => column.columnName));
    for (const required of BASE_COLUMNS) if (!physicalNames.has(required)) throw new Error(`${table} required base column missing: ${required}`);
    const rawRows = readArray(resolve(dir, "raw-payslips", `${table}.raw.json`)).map((entry) => entry.rowData);
    const groups = new Map();
    for (const row of rawRows) {
      const content = canonical(row); const groupHash = sha256(`${table}\0${content}`);
      const existing = groups.get(groupHash);
      if (existing && canonical(existing.row) !== content) throw new Error("content hash collision");
      if (existing) existing.multiplicity += 1n; else groups.set(groupHash, { row, multiplicity: 1n });
      salaryRows += 1n;
      if (row.year != null) { const year = exactInteger(row.year, "year"); minimumYear = minimumYear === null || year < minimumYear ? year : minimumYear; maximumYear = maximumYear === null || year > maximumYear ? year : maximumYear; }
    }
    if (exactInteger(rawRows.length, `${table} count`) !== exactInteger(expected.salaryRowsByTable[table], `${table} expected count`)) throw new Error(`${table} actual count drift`);
    for (const [groupHash, group] of groups) {
      const year = exactInteger(group.row.year, `${table} year`);
      const month = exactInteger(group.row.month, `${table} month`);
      if (month < 1n || month > 12n) throw new Error(`${table} month is outside 1..12`);
      if (group.row.person == null || String(group.row.person).trim() === "") throw new Error(`${table} employee identity is empty`);
      const values = physical.filter((column) => !BASE_COLUMNS.has(column.columnName)).map((column) => {
        const present = Object.hasOwn(group.row, column.columnName);
        const definition = itemMap.get(`${exactInteger(scheme, "scheme").toString()}\0${column.columnName}`);
        const systemSummary = SYSTEM_SUMMARIES[column.columnName];
        const classification = systemSummary ? "system_summary" : definition ? "catalog_item" : "unmapped_column";
        const value = ["money", "smallmoney", "decimal", "numeric"].includes(column.typeName)
          ? exactDecimal(group.row[column.columnName], present)
          : !present ? { kind: "missing_column" } : group.row[column.columnName] === null ? { kind: "null" } : group.row[column.columnName] === "" ? { kind: "empty", raw: "" } : { kind: "text", value: String(group.row[column.columnName]) };
        return { legacyColumn: column.columnName, sourceType: column.typeName, classification, systemSummary: systemSummary ?? null, itemIdentitySha256: definition ? sha256(`dbo.salaryitems\0${definition.scheme}/${definition.itemname}`) : null, value };
      });
      const hasUnmappedColumn = values.some((entry) => entry.classification === "unmapped_column");
      const hasInvalidDecimal = values.some((entry) => entry.value.kind === "invalid");
      const disposition = group.multiplicity > 1n ? "duplicate_source" : hasUnmappedColumn ? "item_unmapped" : hasInvalidDecimal ? "value_invalid" : "candidate";
      payslips.push({ sourceTable: `dbo.${table}`, legacyScheme: scheme, sourceContentGroupSha256: groupHash, sourceRowSha256: sha256(canonical(group.row)), sourceMultiplicity: group.multiplicity.toString(), disposition, source: { year: year.toString(), month: month.toString(), department: group.row.department, departmentname: group.row.departmentname, person: group.row.person, name: group.row.name, temp: group.row.temp }, values });
    }
  }

  const assertCount = (actual, wanted, label) => { if (exactInteger(actual, label) !== exactInteger(wanted, `${label} expected`)) throw new Error(`${label} count drift`); };
  assertCount(items.length, expected.itemDefinitions, "items"); assertCount(formulas.length, expected.formulaDefinitions, "formulas");
  assertCount(closes.length, expected.closeRecords, "closes"); assertCount(memberships.length, expected.schemeMemberships, "scheme memberships"); assertCount(taxRules.length, expected.taxRules, "tax rules"); assertCount(salaryRows, expected.salaryActualRowCount, "salary rows");
  if (minimumYear?.toString() !== String(expected.period.minimumYear) || maximumYear?.toString() !== String(expected.period.maximumYear)) throw new Error("salary period drift");

  const outputs = {};
  for (const [name, rows] of [["scheme-memberships", memberships], ["items", items], ["formulas", formulas], ["tax-rules", taxRules], ["closes", closes], ["payslips", payslips]]) outputs[`${name}.jsonl`] = writeJsonl(resolve(dir, `${name}.jsonl`), rows);
  const rawBusiness = { catalogSha256: sha256(canonical(catalog)), files: Object.fromEntries(Object.keys(outputs).map((name) => [name, outputs[name].fileSha256])) };
  const manifest = { formatVersion: 1, profileVersion: evidence.profileVersion, sourceDatabase: evidence.sourceDatabase, sourceBackupSha256: evidence.sourceBackupSha256, catalogAggregateSha256: evidence.catalogAggregateSha256, actualCatalogSha256: rawBusiness.catalogSha256, actualSourceRows: salaryRows.toString(), minimumYear: minimumYear.toString(), maximumYear: maximumYear.toString(), outputFiles: outputs, rawBusinessContentSha256: sha256(canonical(rawBusiness)), businessContentSha256: sha256(canonical({ profileVersion: evidence.profileVersion, catalogSha256: rawBusiness.catalogSha256, outputFiles: rawBusiness.files })) };
  writeFileSync(resolve(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 }); chmodSync(resolve(dir, "manifest.json"), 0o600);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const dir = resolve(process.argv[2] ?? "");
  if (!basename(dir).startsWith("staging-t4-")) throw new Error("controlled T4 staging directory is required");
  transformPayroll(dir, resolve(process.argv[3] ?? ""));
}
