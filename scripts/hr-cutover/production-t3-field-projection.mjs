import { createHash } from "node:crypto";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "./production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";
import { buildProductionT3Provenance, deriveProductionT3ChildProvenance, buildProductionT3AttendanceBatchProvenance, buildProductionT3AttendanceSymbolProvenance } from "./materialize-production-t3-phase-artifact.mjs";

const SHA = /^[0-9a-f]{64}$/u;
const hash = value => createHash("sha256").update(value).digest("hex");
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
const kinds = new Set(["oldage", "remedy", "losework", "fund", "wound", "bear"]);
const symbols = new Map([["普通班次", "standard_shift"], ["晚上班", "night_shift"]]);
const sourceFields = { "dbo.timekeeptable": ["id", "calendarName", "year", "month"], "dbo.insure_method": ["id", "name", "scope"], "dbo.person_insure": ["id", "year", "month", "employeeCode"] };
const policyKeys = ["kind", "variant", "baseRate", "employerRate", "employeeRate", "supplementRate", "baseFixedAmount", "employerFixedAmount", "employeeFixedAmount", "supplementFixedAmount"];
const legacyPolicyKeys = ["kind", "variant", "baseRate", "employerRate", "employeeRate", "supplementRate"];
const insuranceKeys = ["kind", "contributionBase", "totalAmount", "employerAmount", "employeeAmount", "supplementAmount", "legacyBaseNegative", "legacyFlag"];
export class ProductionT3ProjectionError extends Error {
  constructor(code) { super(code); this.name = "ProductionT3ProjectionError"; this.code = code; }
}
const fail = code => { throw new ProductionT3ProjectionError(code); };
function exact(value, keys) {
  if (!plain(value) || Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail("T3_SOURCE_SHAPE_INVALID");
}
const scalar = value => value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));

/** sourceRowSha256 is the raw pre-transform row hash. Reduced staging cannot
 * reproduce it; only a manifest-bound private owner may establish its bytes. */
export function verifyProductionT3StagedRecord(row) {
  if (!plain(row) || !Object.hasOwn(sourceFields, row.sourceTable)) fail("T3_SOURCE_TABLE_INVALID");
  const children = row.sourceTable === "dbo.timekeeptable" ? "days" : "items";
  exact(row, ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source", children]);
  exact(row.source, sourceFields[row.sourceTable]);
  if (Object.values(row.source).some(value => !scalar(value)) || !["string", "number"].includes(typeof row.source.id)
    || typeof row.sourceKey !== "string" || !row.sourceKey.trim() || row.sourceKey !== String(row.source.id)
    || typeof row.sourceRowSha256 !== "string" || !SHA.test(row.sourceRowSha256)
    || row.sourceIdentitySha256 !== hash(`${row.sourceTable}\0${row.sourceKey}`) || !Array.isArray(row[children])) fail("T3_SOURCE_BINDING_INVALID");
  const seen = new Set();
  for (const item of row[children]) {
    if (children === "days") {
      exact(item, ["day", "legacySymbol"]);
      if (!Number.isSafeInteger(item.day) || item.day < 1 || item.day > 31 || (item.legacySymbol !== null && typeof item.legacySymbol !== "string")) fail("T3_SOURCE_DAY_INVALID");
      if (seen.has(item.day)) fail("T3_SOURCE_CHILD_DUPLICATE"); seen.add(item.day);
    } else {
      // The attested older stage has exactly the six rate-layout keys. It is
      // recognizable provenance, not evidence that absent fixed amounts are
      // null or that its rates used the newer fractional transformation.
      const itemKeys = row.sourceTable === "dbo.insure_method"
        ? plain(item) && Object.keys(item).length === legacyPolicyKeys.length ? legacyPolicyKeys : policyKeys
        : insuranceKeys;
      exact(item, itemKeys);
      if (Object.values(item).some(value => !scalar(value)) || typeof item.kind !== "string" || !item.kind.trim()
        || (row.sourceTable === "dbo.insure_method" && !Number.isSafeInteger(item.variant))
        || (row.sourceTable === "dbo.person_insure" && typeof item.legacyBaseNegative !== "boolean")) fail("T3_SOURCE_ITEM_INVALID");
      const key = row.sourceTable === "dbo.insure_method" ? `${item.kind}\0${item.variant}` : item.kind;
      if (seen.has(key)) fail("T3_SOURCE_CHILD_DUPLICATE"); seen.add(key);
    }
  }
  return row;
}

function integer(value) {
  const result = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/u.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(result) || result < -2147483648 || result > 2147483647) fail("T3_INT4_INVALID");
  return result;
}
function period(source) {
  const year = integer(source.year), month = integer(source.month);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) fail("T3_CALENDAR_PERIOD_INVALID");
  return { year, month };
}
function date(source, day) {
  const { year, month } = period(source);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maximum = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (day > maximum) fail("T3_DATE_INVALID");
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
function text(value, maximum, { required = false } = {}) {
  if (value === null && !required) return null;
  if (typeof value !== "string" || (required && !value.trim())) fail("T3_TEXT_INVALID");
  if ([...value].length > maximum) fail("T3_TEXT_LENGTH_INVALID");
  return value;
}
function decimal(value, scale) {
  if (value === null || value === "") return null;
  if (typeof value !== "string") fail("T3_DECIMAL_INVALID");
  const match = value.trim().match(/^([+-]?)(\d+)(?:\.(\d+))?$/u);
  if (!match) fail("T3_DECIMAL_INVALID");
  const whole = match[2].replace(/^0+(?=\d)/u, ""), fraction = match[3] ?? "";
  if (match[1] === "-" && /[1-9]/u.test(whole + fraction)) fail("T3_NEGATIVE_DECIMAL_UNSUPPORTED");
  if (fraction.slice(scale).replace(/0/gu, "") !== "") fail("T3_DECIMAL_PRECISION_LOSS");
  if (whole.length > 18 - scale) fail("T3_DECIMAL_OVERFLOW");
  return `${whole}.${fraction.slice(0, scale).padEnd(scale, "0")}`;
}
function kind(value) {
  text(value, 32, { required: true });
  if (!kinds.has(value)) fail("T3_INSURANCE_KIND_UNSUPPORTED");
  return value;
}
function provenance(row, table) { return buildProductionT3Provenance({ targetTable: table, sourceTable: row.sourceTable, sourceIdentitySha256: row.sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256 }); }
function child(row, table, discriminator) { return buildProductionT3Provenance({ targetTable: table, sourceTable: row.sourceTable, ...deriveProductionT3ChildProvenance(row.sourceIdentitySha256, table, discriminator, row.sourceRowSha256) }); }
function dependency(role, table, identity, phase = "T3") { return { role, phase, sourceIdentitySha256: identity, expectedTargetTable: table }; }
function project(meta, refs, build, parentReason = null) {
  if (parentReason !== null) return { ...meta, targetFields: null, dependencyRefs: refs, reasonCode: parentReason };
  try {
    const fields = build(), rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[meta.targetTable];
    if (Object.keys(fields).sort().join("|") !== [...rule.fieldWhitelist].sort().join("|")) fail("T3_TARGET_FIELDS_INCOMPLETE");
    let targetFields;
    try { targetFields = normalizeProductionImportTargetFields(meta.targetTable, fields, rule); }
    catch { fail("T3_TARGET_FIELDS_UNREPRESENTABLE"); }
    return { ...meta, targetFields, dependencyRefs: refs, reasonCode: null };
  } catch (error) {
    if (!(error instanceof ProductionT3ProjectionError)) throw error;
    return { ...meta, targetFields: null, dependencyRefs: refs, reasonCode: error.code };
  }
}

function observedAttendanceSymbols(attendanceRows, attendanceFileSha256) {
  if (!Array.isArray(attendanceRows) || typeof attendanceFileSha256 !== "string" || !SHA.test(attendanceFileSha256)) fail("T3_ATTENDANCE_SUPPORT_INVALID");
  const observed = new Set(), identities = new Set();
  for (const row of attendanceRows) {
    verifyProductionT3StagedRecord(row);
    if (row.sourceTable !== "dbo.timekeeptable" || identities.has(row.sourceIdentitySha256)) fail("T3_ATTENDANCE_SUPPORT_INVALID");
    identities.add(row.sourceIdentitySha256);
    for (const day of row.days) if (day.legacySymbol !== null && day.legacySymbol.trim()) observed.add(day.legacySymbol.trim());
  }
  return [...observed];
}
function attendanceSymbolFacts(symbol) {
  return { rule_version: "yuzhou-v1", legacy_symbol: text(symbol, 64, { required: true }), effective_from: null, effective_to: null, is_historical_import: true, remark: null };
}
function insurancePeriodFacts(row) {
  const legacyItems = Object.fromEntries([...row.items].sort((a, b) => a.kind.localeCompare(b.kind)).map(item => [item.kind, { legacyBaseNegative: item.legacyBaseNegative, legacyFlag: item.legacyFlag }]));
  return { legacy_id: integer(row.source.id), needs_review: row.items.some(item => item.legacyBaseNegative || item.legacyFlag !== null), is_historical_import: true,
    source_snapshot: { sourceRowSha256: row.sourceRowSha256, employeeCode: row.source.employeeCode, legacyItems }, remark: null };
}
function insuranceItemFields(item) {
  if (item.legacyBaseNegative && item.contributionBase !== null) fail("T3_LEGACY_BASE_CONTRADICTION");
  return { insurance_kind: kind(item.kind), contribution_base: decimal(item.contributionBase, 2), total_amount: decimal(item.totalAmount, 2), employer_amount: decimal(item.employerAmount, 2), employee_amount: decimal(item.employeeAmount, 2), supplement_amount: decimal(item.supplementAmount, 2), legacy_base_negative: item.legacyBaseNegative, remark: null };
}
export function buildProductionT3AttendanceSupport(attendanceRows, attendanceFileSha256) {
  const observed = observedAttendanceSymbols(attendanceRows, attendanceFileSha256);
  const batch = project(buildProductionT3AttendanceBatchProvenance(attendanceFileSha256), [], () => ({ batch_code: attendanceFileSha256, source_system: "yuzhou-v10", source_checksum: attendanceFileSha256, status: "imported", is_historical_import: true, remark: null }));
  const rules = [...observed].map(symbol => project(buildProductionT3AttendanceSymbolProvenance(symbol), [], () => {
    const facts = attendanceSymbolFacts(symbol);
    if (!symbols.has(symbol)) fail("T3_ATTENDANCE_SYMBOL_UNRESOLVED");
    return { ...facts, normalized_kind: symbols.get(symbol), status: "enabled" };
  })).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  return [batch, ...rules];
}

export function projectProductionT3Fields(row, options = {}) {
  verifyProductionT3StagedRecord(row);
  if (!plain(options)) fail("T3_SOURCE_SHAPE_INVALID");
  exact(options, Object.hasOwn(options, "attendanceFileSha256") ? ["attendanceFileSha256"] : []);
  if (row.sourceTable === "dbo.timekeeptable") {
    if (typeof options.attendanceFileSha256 !== "string" || !SHA.test(options.attendanceFileSha256)) fail("T3_ATTENDANCE_SUPPORT_INVALID");
    const batch = buildProductionT3AttendanceBatchProvenance(options.attendanceFileSha256);
    const calendar = project(provenance(row, "hr_attendance_calendar_source"), [dependency("import_batch", batch.targetTable, batch.sourceIdentitySha256)], () => {
      const { year, month } = period(row.source);
      return { legacy_id: integer(row.source.id), calendar_name: text(row.source.calendarName, 100), calendar_year: year, calendar_month: month, source_snapshot: { sourceRowSha256: row.sourceRowSha256 }, remark: null };
    });
    const days = [...row.days].sort((a, b) => a.day - b.day).map(day => project(child(row, "hr_attendance_day", String(day.day)), [dependency("calendar_source", calendar.targetTable, calendar.sourceIdentitySha256)], () => {
      const symbol = day.legacySymbol === null || !day.legacySymbol.trim() ? null : text(day.legacySymbol, 64);
      const normalized = symbol === null ? null : symbols.get(symbol) ?? null;
      return { attendance_date: date(row.source, day.day), legacy_symbol: symbol, symbol_status: symbol === null ? "blank" : normalized === null ? "needs_review" : "mapped", normalized_kind: normalized, is_historical_import: true, remark: null };
    }, calendar.reasonCode));
    return [calendar, ...days];
  }
  if (row.sourceTable === "dbo.insure_method") {
    const policy = project(provenance(row, "hr_insurance_policy"), [], () => {
      integer(row.source.id);
      return { policy_code: text(`YUZHOU-${row.source.id}`, 64, { required: true }), policy_name: text(row.source.name, 200), scope_description: text(row.source.scope, 500), status: "historical", is_historical_import: true, remark: null };
    });
    const items = row.items.map(item => project(child(row, "hr_insurance_policy_item", `${item.kind}\0${item.variant}`), [dependency("policy", policy.targetTable, policy.sourceIdentitySha256)], () => {
      if (!Object.hasOwn(item, "baseFixedAmount")) fail("T3_POLICY_FIXED_AMOUNTS_UNATTESTED");
      return { insurance_kind: kind(item.kind), variant_no: integer(item.variant), base_rate: decimal(item.baseRate, 6), employer_rate: decimal(item.employerRate, 6), employee_rate: decimal(item.employeeRate, 6), supplement_rate: decimal(item.supplementRate, 6),
        base_fixed_amount: decimal(item.baseFixedAmount, 3), employer_fixed_amount: decimal(item.employerFixedAmount, 3), employee_fixed_amount: decimal(item.employeeFixedAmount, 3), supplement_fixed_amount: decimal(item.supplementFixedAmount, 3), source_snapshot: { sourceRowSha256: row.sourceRowSha256 }, remark: null };
    }, policy.reasonCode)).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
    return [policy, ...items];
  }
  const employeeCode = typeof row.source.employeeCode === "string" ? row.source.employeeCode.trim() : "";
  const employeeRefs = employeeCode ? [dependency("employee", "hr_employee", hash(`dbo.person\0${employeeCode}`), "T0")] : [];
  const insurancePeriod = project(provenance(row, "hr_employee_insurance_period"), employeeRefs, () => {
    const { year, month } = period(row.source);
    if (!employeeCode) fail("T3_EMPLOYEE_REQUIRED");
    return { period_year: year, period_month: month, ...insurancePeriodFacts(row), status: "historical" };
  });
  const items = row.items.map(item => project(child(row, "hr_employee_insurance_item", item.kind), [dependency("period", insurancePeriod.targetTable, insurancePeriod.sourceIdentitySha256)], () => {
    return insuranceItemFields(item);
  }, insurancePeriod.reasonCode)).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
  return [insurancePeriod, ...items];
}

function quarantineProjection(original, fields, omittedFields) {
  const rule = DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[original.targetTable];
  let targetFields;
  try { targetFields = normalizeProductionImportTargetFields(original.targetTable, fields, rule, { partial: true }); }
  catch { fail("T3_TARGET_FIELDS_UNREPRESENTABLE"); }
  return { ...structuredClone(original), targetFields, omittedFields };
}

/** Opt-in source facts only: missing calendar components must be literal null.
 * Never catch arbitrary semantic errors as partial success or change candidates. */
export function projectProductionT3InsuranceQuarantineFields(row) {
  verifyProductionT3StagedRecord(row);
  if (row.sourceTable !== "dbo.person_insure") fail("T3_QUARANTINE_CASE_UNSUPPORTED");
  const calendar = {}, omittedFields = [];
  for (const [sourceField, field, minimum, maximum] of [["year", "period_year", 1900, 2100], ["month", "period_month", 1, 12]]) {
    if (row.source[sourceField] === null) omittedFields.push({ field, reasonCode: "T3_INT4_INVALID" });
    else {
      const value = integer(row.source[sourceField]);
      if (value < minimum || value > maximum) fail("T3_CALENDAR_PERIOD_INVALID");
      calendar[field] = value;
    }
  }
  if (!omittedFields.length) fail("T3_QUARANTINE_CASE_UNSUPPORTED");
  if (typeof row.source.employeeCode !== "string" || !row.source.employeeCode.trim()) fail("T3_EMPLOYEE_REQUIRED");
  // Build every child even though the default path propagates its parent error:
  // this exposes precision, kind, type and negative-base contradictions instead
  // of hiding them behind a supported missing-calendar classification.
  const itemFields = new Map(row.items.map(item => [child(row, "hr_employee_insurance_item", item.kind).sourceIdentitySha256, insuranceItemFields(item)]));
  const parentFields = { ...calendar, ...insurancePeriodFacts(row) }, originals = projectProductionT3Fields(row);
  if (originals.some(item => item.reasonCode !== "T3_INT4_INVALID" || item.targetFields !== null)) fail("T3_QUARANTINE_CASE_UNSUPPORTED");
  return originals.map(original => quarantineProjection(original, original.targetTable === "hr_employee_insurance_period" ? parentFields : itemFields.get(original.sourceIdentitySha256),
    original.targetTable === "hr_employee_insurance_period" ? [...omittedFields, { field: "status", reasonCode: "T3_QUARANTINE_STATUS_NOT_SELECTED" }] : []));
}

/** Unknown rule source facts only; known mappings and the import batch stay in
 * the existing support API. No inferred normalized kind or enabled state. */
export function buildProductionT3AttendanceQuarantineSupport(attendanceRows, attendanceFileSha256) {
  return observedAttendanceSymbols(attendanceRows, attendanceFileSha256).filter(symbol => !symbols.has(symbol)).map(symbol => {
    const facts = attendanceSymbolFacts(symbol);
    const original = { ...buildProductionT3AttendanceSymbolProvenance(symbol), targetFields: null, dependencyRefs: [], reasonCode: "T3_ATTENDANCE_SYMBOL_UNRESOLVED" };
    return quarantineProjection(original, facts, ["normalized_kind", "status"].map(field => ({ field, reasonCode: "T3_ATTENDANCE_SYMBOL_UNRESOLVED" })));
  }).sort((a, b) => a.sourceIdentitySha256.localeCompare(b.sourceIdentitySha256));
}
