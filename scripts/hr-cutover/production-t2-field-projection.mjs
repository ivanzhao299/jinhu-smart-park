import { createHash } from "node:crypto";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL } from "./production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "./production-import-payload-generator.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const SHA = /^[0-9a-f]{64}$/u;
const SOURCE_FIELDS = Object.freeze({
  "dbo.compacttypecode": "typeCode typeName".split(" "),
  "dbo.compact": "contractNo typeName employeeCode startDate endDate probationEndDate contractMonths totalContractMonths probationMonths probationSalary baseSalary legacyState continuetimes continueyears signedDate nonCompeteFlag confidentialityFlag trainingServiceFlag legacyFilePresent legacyFileLocatorSha256 legacyTextPresent legacyTextSha256 legacyTextBytes derivedContractTermMonths legacyRenewalCount contractTermDecision signatureDateDecision renewalCountDecision".split(" "),
  "dbo.compact_c": "contractNo employeeCode contractMonths startDate endDate signedAt sequenceNo".split(" "),
});
const plain = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;

export class ProductionT2ProjectionError extends Error {
  constructor(code) { super(code); this.name = "ProductionT2ProjectionError"; this.code = code; }
}
const fail = code => { throw new ProductionT2ProjectionError(code); };
const text = value => typeof value === "string" ? value.trim() : "";
const requiredText = (value, max = 100) => {
  const result = text(value);
  if (!result || [...result].length > max) fail("T2_REQUIRED_TEXT_INVALID");
  return result;
};
const scalar = value => {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fail("T2_SOURCE_SCALAR_INVALID");
};
const integer = (value, { nullable = true, minimum = 0 } = {}) => {
  if (value === null || value === undefined || value === "") {
    if (nullable) return null;
    return fail("T2_INTEGER_INVALID");
  }
  if (!((typeof value === "number" && Number.isSafeInteger(value)) || (typeof value === "string" && /^\d+$/u.test(value)))) fail("T2_INTEGER_INVALID");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > 2147483647) fail("T2_INTEGER_INVALID");
  return parsed;
};
const flag = value => {
  if (value === true || value === 1 || value === "1") return true;
  if (value === false || value === 0 || value === "0") return false;
  return fail("T2_LEGACY_FLAG_UNRESOLVED");
};
const presence = value => {
  if (value !== 0 && value !== 1) fail("T2_EVIDENCE_PRESENCE_INVALID");
  return value === 1;
};
const amount = value => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(value)) fail("T2_DECIMAL_INVALID");
  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 16 || /[1-9]/u.test(fraction.slice(2))) fail("T2_DECIMAL_TARGET_PRECISION_LOSS");
  return `${whole}.${fraction.padEnd(2, "0").slice(0, 2)}`;
};
const date = value => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) fail("T2_DATE_INVALID");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail("T2_DATE_INVALID");
  return value;
};
const localTimestamp = value => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u.test(value)) fail("T2_TIMESTAMP_INVALID");
  date(value.slice(0, 10));
  if (Number(value.slice(11, 13)) > 23 || Number(value.slice(14, 16)) > 59 || Number(value.slice(17, 19)) > 59) fail("T2_TIMESTAMP_INVALID");
  return `${value.replace(" ", "T")}.000`;
};

function verifyRecord(row) {
  if (!plain(row) || !Object.hasOwn(SOURCE_FIELDS, row.sourceTable) || typeof row.sourceKey !== "string" || !row.sourceKey.trim() || !plain(row.source) || !SHA.test(row.sourceIdentitySha256 ?? "") || !SHA.test(row.sourceRowSha256 ?? "")) fail("T2_SOURCE_RECORD_INVALID");
  if (Object.keys(row).sort().join("|") !== ["sourceTable", "sourceKey", "sourceIdentitySha256", "sourceRowSha256", "source"].sort().join("|")) fail("T2_SOURCE_RECORD_INVALID");
  if (Object.keys(row.source).some(key => !SOURCE_FIELDS[row.sourceTable].includes(key))) fail("T2_SOURCE_FIELD_UNMAPPED");
  Object.values(row.source).forEach(scalar);
  if (hash(`${row.sourceTable}\0${row.sourceKey}`) !== row.sourceIdentitySha256 || hash(JSON.stringify(row.source, Object.keys(row.source).sort())) !== row.sourceRowSha256) fail("T2_SOURCE_HASH_MISMATCH");
  const expectedKey = row.sourceTable === "dbo.compacttypecode" ? String(row.source.typeCode ?? "").trim()
    : row.sourceTable === "dbo.compact" ? text(row.source.contractNo)
      : [row.source.contractNo, row.source.employeeCode, row.source.startDate, row.source.endDate, row.source.signedAt].map(value => String(value ?? "").trim()).join("|");
  if (row.sourceKey !== expectedKey) fail("T2_SOURCE_KEY_MISMATCH");
  if (row.sourceTable !== "dbo.compacttypecode") { requiredText(row.source.employeeCode); requiredText(row.source.contractNo); }
}

function projection(row, targetTable, fields, evidenceKind = null) {
  const sourceIdentitySha256 = evidenceKind ? hash(`yuzhou-hr-production-source-projection-v1\0${row.sourceIdentitySha256}\0${targetTable}\0${evidenceKind}`) : row.sourceIdentitySha256;
  let targetFields;
  try { targetFields = normalizeProductionImportTargetFields(targetTable, fields, DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL.targetTables[targetTable]); }
  catch { fail("T2_TARGET_FIELDS_INVALID"); }
  return { phase: "T2", targetTable, sourceSystem: "yuzhou-v10", sourceTable: row.sourceTable, sourcePkCanonical: `sha256:${sourceIdentitySha256}`, sourceIdentitySha256, sourceRowSha256: row.sourceRowSha256, targetFields };
}

/** Pure candidate projection. Does not approve dictionaries, resolve dependencies, seal plans or write data. */
export function projectProductionT2Fields(row, resolved = {}) {
  verifyRecord(row);
  if (!plain(resolved)) fail("T2_DICTIONARY_DECISION_INVALID");
  const decisionKey = row.sourceTable === "dbo.compacttypecode" ? "typeCode" : row.sourceTable === "dbo.compact" ? "status" : "changeType";
  if (Object.keys(resolved).length !== 1 || !Object.hasOwn(resolved, decisionKey)) fail("T2_DICTIONARY_DECISION_INVALID");
  const s = row.source;
  if (row.sourceTable === "dbo.compacttypecode") {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/u.test(resolved.typeCode ?? "")) fail("T2_DICTIONARY_DECISION_INVALID");
    return [projection(row, "hr_contract_type", { type_code: resolved.typeCode, type_name: requiredText(s.typeName), status: "enabled", is_historical_import: true, remark: null })];
  }
  if (row.sourceTable === "dbo.compact_c") {
    if (!["renewal", "amendment", "termination", "correction", "needs_review"].includes(resolved.changeType)) fail("T2_DICTIONARY_DECISION_INVALID");
    const start = localTimestamp(s.startDate), end = localTimestamp(s.endDate), signed = localTimestamp(s.signedAt);
    if (!start || (end && end < start)) fail("T2_DATE_RANGE_INVALID");
    return [projection(row, "hr_contract_change", {
      sequence_no: integer(s.sequenceNo, { nullable: false, minimum: 1 }), change_type: requiredText(resolved.changeType),
      previous_start_date: null, previous_end_date: null, new_start_date: start.slice(0, 10), new_end_date: end?.slice(0, 10) ?? null, signed_at: signed,
      is_historical_import: true, legacy_source_identity_sha256: row.sourceIdentitySha256, legacy_source_row_sha256: row.sourceRowSha256,
      source_snapshot: { contractNo: scalar(s.contractNo), employeeCode: scalar(s.employeeCode), unconfirmedTerm: scalar(s.contractMonths), sourceStartAt: scalar(s.startDate), sourceEndAt: scalar(s.endDate), sourceSignedAt: scalar(s.signedAt), sequenceDerivation: "ordered_source_tuple" }, remark: null,
    })];
  }
  if (!["draft", "active", "expired", "terminated", "cancelled"].includes(resolved.status)) fail("T2_DICTIONARY_DECISION_INVALID");
  const start = date(s.startDate), end = date(s.endDate), signed = date(s.signedDate);
  if (start && end && end < start) fail("T2_DATE_RANGE_INVALID");
  const term = integer(s.derivedContractTermMonths), renewal = integer(s.legacyRenewalCount);
  if ((term === null ? s.contractTermDecision !== "NO_FIXED_DATE_BOUNDARY" : s.contractTermDecision !== "DERIVED_FROM_DATE_BOUNDARY")
    || (signed === null ? s.signatureDateDecision !== "ABSENT" : s.signatureDateDecision !== "DIRECT_LEGACY_DATE")
    || (renewal === null ? s.renewalCountDecision !== "ABSENT_DEFAULT_ZERO" : s.renewalCountDecision !== "DIRECT_NONNEGATIVE_LEGACY_COUNT")) fail("T2_SEMANTIC_DECISION_INVALID");
  const textPresent = presence(s.legacyTextPresent), filePresent = presence(s.legacyFilePresent);
  const result = [projection(row, "hr_contract", {
    contract_no: requiredText(s.contractNo, 64), start_date: start, end_date: end, probation_end_date: date(s.probationEndDate), status: resolved.status,
    contract_term_months: term, signature_date: signed, effective_date: null, position_title: null, work_type: null, department_name_snapshot: null,
    first_signature_date: null, last_signature_date: null, cumulative_term_months: null, renewal_count: renewal ?? 0,
    probation_months: integer(s.probationMonths), probation_salary: amount(s.probationSalary), base_salary: amount(s.baseSalary),
    confidentiality_agreement: flag(s.confidentialityFlag), non_compete_agreement: flag(s.nonCompeteFlag), training_service_agreement: flag(s.trainingServiceFlag),
    legacy_file_reference: null, legacy_text_present: textPresent, is_historical_import: true,
    legacy_source_identity_sha256: row.sourceIdentitySha256, legacy_source_row_sha256: row.sourceRowSha256,
    source_snapshot: { legacyState: scalar(s.legacyState), unconfirmedTerm: scalar(s.contractMonths), unconfirmedTotalTerm: scalar(s.totalContractMonths), unconfirmedRenewalYears: scalar(s.continueyears), legacyRenewalCount: scalar(s.continuetimes), contractTermDecision: s.contractTermDecision, signatureDateDecision: s.signatureDateDecision, renewalCountDecision: s.renewalCountDecision, signatureHistoryDecision: "NOT_ESTABLISHED_FROM_SINGLE_SIGNATURE_DATE" }, remark: null,
  })];
  for (const kind of [textPresent && "controlled_text", filePresent && "file_manifest"].filter(Boolean)) {
    const isText = kind === "controlled_text", digest = isText ? s.legacyTextSha256 : s.legacyFileLocatorSha256;
    if (!SHA.test(digest ?? "")) fail("T2_EVIDENCE_HASH_INVALID");
    const identity = hash(`yuzhou-hr-production-source-projection-v1\0${row.sourceIdentitySha256}\0hr_contract_legacy_evidence\0${kind}`);
    result.push(projection(row, "hr_contract_legacy_evidence", {
      evidence_kind: kind, locator_sha256: isText ? null : digest, content_sha256: isText ? digest : null, mime_type: null,
      size_bytes: isText ? integer(s.legacyTextBytes, { nullable: false, minimum: 1 }) : null,
      migration_status: isText ? "hashed_only" : "not_extracted", protected_file_id: null,
      missing_reason: isText ? null : "SOURCE_FILE_NOT_EXTRACTED", source_identity_sha256: identity,
    }, kind));
  }
  return result;
}
