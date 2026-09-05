import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { projectProductionT2Fields, ProductionT2ProjectionError } from "../hr-cutover/production-t2-field-projection.mjs";
import { DEFAULT_PRODUCTION_IMPORT_TARGET_MODEL as model, computeProductionImportTargetCanonicalHash } from "../hr-cutover/production-import-target-model.mjs";
import { normalizeProductionImportTargetFields } from "../hr-cutover/production-import-payload-generator.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const contract = overrides => ({
  contractNo: "TEST-C1", employeeCode: "TEST-E1", typeName: "Synthetic fixed term",
  startDate: "2024-01-01", endDate: "2026-12-31", probationEndDate: null, signedDate: "2023-12-20",
  contractMonths: "999", totalContractMonths: "100", continueyears: "2", continuetimes: "2",
  derivedContractTermMonths: 36, legacyRenewalCount: 2,
  contractTermDecision: "DERIVED_FROM_DATE_BOUNDARY", signatureDateDecision: "DIRECT_LEGACY_DATE", renewalCountDecision: "DIRECT_NONNEGATIVE_LEGACY_COUNT",
  probationMonths: 0, probationSalary: "0.00", baseSalary: "9999999999999999.99", legacyState: "SYNTHETIC_ACTIVE",
  confidentialityFlag: 0, nonCompeteFlag: "1", trainingServiceFlag: false,
  legacyTextPresent: 0, legacyFilePresent: 0, legacyTextSha256: null, legacyTextBytes: null, legacyFileLocatorSha256: null,
  ...overrides,
});
const change = overrides => ({ contractNo: "TEST-C1", employeeCode: "TEST-E1", contractMonths: "unconfirmed", startDate: "2027-01-01 09:10:11", endDate: "2027-12-31 17:30:00", signedAt: "2026-12-20 10:15:30", sequenceNo: 1, ...overrides });
const record = (source, sourceTable = "dbo.compact") => {
  const sourceKey = sourceTable === "dbo.compact" ? source.contractNo : sourceTable === "dbo.compacttypecode" ? String(source.typeCode)
    : [source.contractNo, source.employeeCode, source.startDate, source.endDate, source.signedAt].map(value => String(value ?? "").trim()).join("|");
  return { sourceTable, sourceKey, sourceIdentitySha256: hash(`${sourceTable}\0${sourceKey}`), sourceRowSha256: hash(JSON.stringify(source, Object.keys(source).sort())), source };
};
const project = overrides => projectProductionT2Fields(record(contract(overrides)), { status: "active" });
const rejects = (fn, code) => assert.throws(fn, error => error instanceof ProductionT2ProjectionError && error.code === code && error.message === code);

test("projects all contract fields without inventing signature history or converting ambiguous terms", () => {
  const input = record(contract()), before = structuredClone(input), rows = projectProductionT2Fields(input, { status: "active" }), f = rows[0].targetFields;
  assert.deepEqual(input, before);
  assert.deepEqual(Object.keys(f), model.targetTables.hr_contract.fieldWhitelist);
  assert.equal(f.contract_term_months, 36);
  assert.equal(f.signature_date, "2023-12-20");
  assert.equal(f.first_signature_date, null); assert.equal(f.last_signature_date, null); assert.equal(f.cumulative_term_months, null);
  assert.equal(f.source_snapshot.unconfirmedTerm, "999"); assert.equal(f.source_snapshot.unconfirmedTotalTerm, "100");
  assert.equal(f.renewal_count, 2); assert.equal(f.probation_months, 0); assert.equal(f.probation_salary, "0.00");
  assert.equal(f.base_salary, "9999999999999999.99");
  assert.equal(f.confidentiality_agreement, false); assert.equal(f.non_compete_agreement, true);
  assert.equal(f.legacy_file_reference, null);
  assert.equal(rows.length, 1);
});

test("keeps null, zero and explicit absent renewal semantics distinct", () => {
  const f = project({ startDate: null, endDate: null, signedDate: null, derivedContractTermMonths: null, contractTermDecision: "NO_FIXED_DATE_BOUNDARY", signatureDateDecision: "ABSENT", continuetimes: null, legacyRenewalCount: null, renewalCountDecision: "ABSENT_DEFAULT_ZERO", probationMonths: null, probationSalary: null })[0].targetFields;
  assert.equal(f.start_date, null); assert.equal(f.contract_term_months, null); assert.equal(f.signature_date, null);
  assert.equal(f.renewal_count, 0); assert.equal(f.source_snapshot.legacyRenewalCount, null); assert.equal(f.probation_months, null); assert.equal(f.probation_salary, null);
});

test("rejects unresolved flags, missing semantic decisions and invalid integer/decimal values", () => {
  for (const flag of [null, undefined, "", "unknown", 2]) rejects(() => project({ confidentialityFlag: flag }), "T2_LEGACY_FLAG_UNRESOLVED");
  rejects(() => project({ contractTermDecision: "UNKNOWN" }), "T2_SEMANTIC_DECISION_INVALID");
  for (const value of [true, -1, 1.5, "1e2", "0x10", "2147483648"]) rejects(() => project({ probationMonths: value }), "T2_INTEGER_INVALID");
  for (const value of [12.3, "-1.00", "1e2", "NaN"]) rejects(() => project({ baseSalary: value }), "T2_DECIMAL_INVALID");
  for (const value of ["10000000000000000.00", "1.001"]) rejects(() => project({ baseSalary: value }), "T2_DECIMAL_TARGET_PRECISION_LOSS");
  assert.equal(project({ baseSalary: "12.3400" })[0].targetFields.base_salary, "12.34");
  for (const [input, stored] of [["0", "0.00"], ["12", "12.00"], ["12.3", "12.30"]]) {
    const fields = project({ baseSalary: input })[0].targetFields;
    assert.equal(fields.base_salary, stored);
    assert.equal(computeProductionImportTargetCanonicalHash("hr_contract", { tenantId: "TEST", parkId: "TEST" }, fields), computeProductionImportTargetCanonicalHash("hr_contract", { tenantId: "TEST", parkId: "TEST" }, { ...fields, base_salary: stored }));
  }
});

test("rejects invalid calendar and reversed dates, preserves valid leap day", () => {
  rejects(() => project({ startDate: "2024-02-30" }), "T2_DATE_INVALID");
  rejects(() => project({ startDate: "2027-01-01" }), "T2_DATE_RANGE_INVALID");
  assert.equal(project({ probationEndDate: "2024-02-29" })[0].targetFields.probation_end_date, "2024-02-29");
});

test("binds source hashes and keys, refuses new unmapped fields", () => {
  const changed = record(contract()); changed.source.contractNo = "CHANGED";
  rejects(() => projectProductionT2Fields(changed, { status: "active" }), "T2_SOURCE_HASH_MISMATCH");
  const key = record(contract()); key.sourceKey = "wrong"; key.sourceIdentitySha256 = hash(`${key.sourceTable}\0wrong`);
  rejects(() => projectProductionT2Fields(key, { status: "active" }), "T2_SOURCE_KEY_MISMATCH");
  rejects(() => project({ futureField: "must not disappear" }), "T2_SOURCE_FIELD_UNMAPPED");
  rejects(() => projectProductionT2Fields(record(contract()), {}), "T2_DICTIONARY_DECISION_INVALID");
});

test("maps type fields using an explicit resolved code and PostgreSQL varchar bounds", () => {
  const r = record({ typeCode: 1, typeName: "Synthetic fixed term" }, "dbo.compacttypecode");
  const f = projectProductionT2Fields(r, { typeCode: "FIXED" })[0].targetFields;
  assert.deepEqual(Object.keys(f), model.targetTables.hr_contract_type.fieldWhitelist);
  assert.equal(f.type_code, "FIXED"); assert.equal(f.type_name, "Synthetic fixed term");
  rejects(() => projectProductionT2Fields(r, { typeCode: "X".repeat(33) }), "T2_DICTIONARY_DECISION_INVALID");
  rejects(() => project({ contractNo: "X".repeat(65) }), "T2_REQUIRED_TEXT_INVALID");
});

test("preserves full local change timestamps while projecting date columns", () => {
  const f = projectProductionT2Fields(record(change(), "dbo.compact_c"), { changeType: "renewal" })[0].targetFields;
  assert.deepEqual(Object.keys(f), model.targetTables.hr_contract_change.fieldWhitelist);
  assert.equal(f.new_start_date, "2027-01-01"); assert.equal(f.signed_at, "2026-12-20T10:15:30.000");
  const scope = { tenantId: "TEST", parkId: "TEST" };
  assert.equal(computeProductionImportTargetCanonicalHash("hr_contract_change", scope, f), computeProductionImportTargetCanonicalHash("hr_contract_change", scope, { ...f, signed_at: "2026-12-20T10:15:30.000" }));
  for (const invalid of ["2026-02-30T10:15:30.000", "2026-12-20T24:00:00.000"]) assert.throws(() => normalizeProductionImportTargetFields("hr_contract_change", { ...f, signed_at: invalid }, model.targetTables.hr_contract_change));
  assert.throws(() => normalizeProductionImportTargetFields("hr_employment_event", { source_effective_at: f.signed_at }, model.targetTables.hr_employment_event, { partial: true }), "other timestamp contracts remain unchanged");
  assert.equal(f.previous_start_date, null); assert.equal(f.source_snapshot.sourceStartAt, "2027-01-01 09:10:11");
  assert.equal(f.source_snapshot.unconfirmedTerm, "unconfirmed");
  rejects(() => projectProductionT2Fields(record(change({ signedAt: "2026-12-20 24:00:00" }), "dbo.compact_c"), { changeType: "renewal" }), "T2_TIMESTAMP_INVALID");
  rejects(() => projectProductionT2Fields(record(change(), "dbo.compact_c"), { changeType: "unknown" }), "T2_DICTIONARY_DECISION_INVALID");
});

test("emits both hash-only evidence projections with phase-materializer identities", () => {
  const r = record(contract({ legacyTextPresent: 1, legacyFilePresent: 1, legacyTextSha256: hash("synthetic-text"), legacyTextBytes: 28, legacyFileLocatorSha256: hash("synthetic-locator") }));
  const rows = projectProductionT2Fields(r, { status: "active" }); assert.equal(rows.length, 3);
  for (const row of rows.slice(1)) {
    const f = row.targetFields;
    assert.deepEqual(Object.keys(f), model.targetTables.hr_contract_legacy_evidence.fieldWhitelist);
    assert.equal(row.sourceIdentitySha256, hash(`yuzhou-hr-production-source-projection-v1\0${r.sourceIdentitySha256}\0hr_contract_legacy_evidence\0${f.evidence_kind}`));
    assert.equal(f.source_identity_sha256, row.sourceIdentitySha256); assert.equal(f.protected_file_id, null);
  }
  assert.equal(rows[1].targetFields.migration_status, "hashed_only");
  assert.equal(rows[2].targetFields.migration_status, "not_extracted");
  assert.equal(rows[2].targetFields.missing_reason, "SOURCE_FILE_NOT_EXTRACTED");
  rejects(() => project({ legacyTextPresent: 1 }), "T2_EVIDENCE_HASH_INVALID");
  for (const value of ["0", "1", true, null]) rejects(() => project({ legacyTextPresent: value }), "T2_EVIDENCE_PRESENCE_INVALID");
});

test("PostgreSQL literal casts agree with projected canonical hashes (read-only, no business tables)", { skip: !process.env.YUZHOU_T2_PROJECTION_PG_CONTAINER }, () => {
  const container = process.env.YUZHOU_T2_PROJECTION_PG_CONTAINER;
  assert.match(container, /^[A-Za-z0-9][A-Za-z0-9_.-]{0,100}$/u);
  const run = args => {
    try { return execFileSync("docker", args, { encoding: "utf8", timeout: 15000, maxBuffer: 65536, stdio: ["ignore", "pipe", "pipe"] }).trim(); }
    catch { assert.fail("T2_PROJECTION_PG_READONLY_CHECK_FAILED"); }
  };
  const context = run(["context", "show"]);
  assert.match(run(["context", "inspect", context, "--format", "{{.Endpoints.docker.Host}}"]), /^unix:\/\//u, "only an explicit local Docker endpoint is allowed");
  const sql = "BEGIN READ ONLY; SELECT json_build_object('amount',('12.3'::numeric(18,2))::text,'maximum',('9999999999999999.99'::numeric(18,2))::text,'signature',to_char('2026-12-20T10:15:30.000'::timestamp,'YYYY-MM-DD\"T\"HH24:MI:SS.MS'))::text; ROLLBACK;";
  const stored = JSON.parse(run(["exec", container, "psql", "-X", "-w", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-U", "jinhu", "-d", "postgres", "-c", sql]));
  const scope = { tenantId: "TEST", parkId: "TEST" };
  const c = project({ baseSalary: "12.3" })[0].targetFields;
  const h = projectProductionT2Fields(record(change(), "dbo.compact_c"), { changeType: "renewal" })[0].targetFields;
  assert.equal(computeProductionImportTargetCanonicalHash("hr_contract", scope, c), computeProductionImportTargetCanonicalHash("hr_contract", scope, { ...c, base_salary: stored.amount }));
  assert.equal(project()[0].targetFields.base_salary, stored.maximum);
  assert.equal(computeProductionImportTargetCanonicalHash("hr_contract_change", scope, h), computeProductionImportTargetCanonicalHash("hr_contract_change", scope, { ...h, signed_at: stored.signature }));
});
