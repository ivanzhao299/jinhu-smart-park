#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateLegacyRoutineParityContract } from "./legacy-routine-parity-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-A490C8F10B0BB6DC";
const SOURCE_ARTIFACT_SHA256 = "32ebd704b5e66a9f364421da5288ba29171a6018c26fe45d2d1620eb442307da";
const EXPECTED_EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  sourceExtractor: "scripts/extract-yuzhou-t5-legacy-history.sh",
  familyMaterializer: "scripts/transform-yuzhou-t5-legacy-history.mjs",
  familyLoader: "scripts/load-yuzhou-t5-legacy-history.sh",
  recordSchema: "database/migrations/000252_hr_lifecycle_employee_records.sql",
  legacyMaterializationSchema: "database/migrations/000276_hr_legacy_employee_profile_materialization.sql",
  modernService: "apps/api/src/modules/hr/hr-lifecycle.service.ts",
  modernController: "apps/api/src/modules/hr/hr-lifecycle.controller.ts",
  permissionContract: "packages/shared/src/hr.ts",
  permissionEvidence: "apps/api/src/modules/hr/hr-employee-materialized-projection.spec.ts",
  modernPage: "apps/web/app/hr/employees/HrEmployeesClient.tsx",
  modernWebApi: "apps/web/lib/hr-api.ts",
  syntheticFixture: "scripts/hr-cutover/contracts/legacy-family-query-parity-fixture-v1.json",
});

export class LegacyFamilyQueryParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyFamilyQueryParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyFamilyQueryParityError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const text = value => value === null || value === undefined ? null : String(value).trim() || null;
const sqlVarcharEqual = (left, right) => String(left).replace(/\s+$/u, "") === String(right).replace(/\s+$/u, "");

function readBound(repositoryRoot, binding, expectedPath, label) {
  if (!object(binding) || binding.path !== expectedPath || !SHA256.test(binding.sha256 ?? "")) {
    fail("FAMILY_QUERY_EVIDENCE_BINDING_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== binding.sha256) fail("FAMILY_QUERY_EVIDENCE_DRIFT", label);
  return bytes;
}

export function emulateLegacyFamilyQuery(input, rows) {
  if (!Array.isArray(rows)) fail("FAMILY_QUERY_FIXTURE_INVALID", "rows");
  if (input === null || input === undefined) return [];
  if (String(input).length > 5) fail("FAMILY_QUERY_FIXTURE_INVALID", "declared varchar(5) input exceeded");
  return rows.filter(row => object(row) && row.person !== null && row.person !== undefined && sqlVarcharEqual(row.person, input)).map(row => ({
    member: row.member ?? null,
    rela: row.rela ?? null,
    birthday: row.birthday ?? null,
    jobunit: row.jobunit ?? null,
    jobname: row.jobname ?? null,
    political: row.political ?? null,
    tel: row.tel ?? null,
  }));
}

function normalizeBirthday(value, gaps) {
  const normalized = text(value);
  if (!normalized) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/u.exec(normalized);
  if (!match) {
    gaps.push("INVALID_STRUCTURED_VALUE");
    return null;
  }
  const canonical = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${canonical}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== canonical) {
    gaps.push("INVALID_STRUCTURED_VALUE");
    return null;
  }
  return canonical;
}

export function materializeSyntheticFamilyRow(row) {
  if (!object(row)) fail("FAMILY_QUERY_FIXTURE_INVALID", "family row");
  const gaps = [];
  const fullName = text(row.member);
  const relationship = text(row.rela);
  if (!relationship) gaps.push("INVALID_STRUCTURED_VALUE");
  if (!fullName) gaps.push("INVALID_STRUCTURED_VALUE");
  const birthDate = normalizeBirthday(row.birthday, gaps);
  return {
    disposition: relationship && fullName ? "loaded" : "quarantined",
    projection: {
      relationship,
      fullName,
      birthDate,
      workUnit: text(row.jobunit),
      jobTitle: text(row.jobname),
      politicalStatus: text(row.political),
      contact: text(row.tel),
    },
    reasonCodes: gaps,
  };
}

function assertSourceRoutine(ledger) {
  const familyRows = ledger.routines?.filter(row => row.canonicalFamily === "u_family") ?? [];
  const row = familyRows[0];
  if (familyRows.length !== 1
    || !object(row)
    || row.routineId !== ROUTINE_ID
    || row.kind !== "procedure"
    || row.sourceName !== "u_family"
    || row.sourceArtifact !== "SQL_STORED_PROCEDURE_u_family_sql"
    || row.sourceArtifactSha256 !== SOURCE_ARTIFACT_SHA256
    || row.primaryDomain !== "employee_profile"
    || row.businessCapability !== "lookup_or_query_projection"
    || !same(row.parameters, [{ name: "person", sourceType: "varchar(5)" }])
    || !same(row.readTables, ["family"])
    || !same(row.writeTables, [])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.calledRoutines, [])
    || !same(row.logicSignals, [])
    || !same(row.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })) {
    fail("FAMILY_QUERY_SOURCE_LEDGER_DRIFT", "u_family");
  }
}

function assertModernSurface(evidence) {
  const extractor = evidence.sourceExtractor.toString("utf8");
  const materializer = evidence.familyMaterializer.toString("utf8");
  const loader = evidence.familyLoader.toString("utf8");
  const recordSchema = evidence.recordSchema.toString("utf8");
  const materializationSchema = evidence.legacyMaterializationSchema.toString("utf8");
  const service = evidence.modernService.toString("utf8");
  const controller = evidence.modernController.toString("utf8");
  const permissions = evidence.permissionContract.toString("utf8");
  const permissionTest = evidence.permissionEvidence.toString("utf8");
  const page = evidence.modernPage.toString("utf8");
  const webApi = evidence.modernWebApi.toString("utf8");
  if (!/SELECT id,person,member,rela,CONVERT\(varchar\(33\),birthday,126\) birthday,jobunit,jobname,political,tel FROM dbo\.family/u.test(extractor)
    || !/family:4560/u.test(materializer)
    || !/if\(name==="family"\).*relationship=text\(row\.rela\)/u.test(materializer)
    || !/birthDate:structuredDate\(row\.birthday,"family\.birthday",gaps\)/u.test(materializer)
    || !/workUnit:text\(row\.jobunit\),jobTitle:text\(row\.jobname\),politicalStatus:text\(row\.political\)/u.test(materializer)
    || !/INSERT INTO hr_employee_family\(tenant_id,park_id,employee_id,relationship,full_name_encrypted,full_name_masked,full_name_fingerprint,contact_encrypted,contact_masked,contact_fingerprint,birth_date,work_unit,job_title,political_status,legacy_source_identity_sha256,legacy_source_row_sha256/u.test(loader)
    || !/source_count<>loaded_count\+quarantined_count\+approved_ignored_count/u.test(loader)
    || !/CREATE TABLE hr_employee_family/u.test(recordSchema)
    || !/ALTER TABLE hr_employee_family[\s\S]*ADD COLUMN birth_date date[\s\S]*ADD COLUMN work_unit varchar\(200\)[\s\S]*ADD COLUMN job_title varchar\(160\)[\s\S]*ADD COLUMN political_status varchar\(64\)/u.test(materializationSchema)
    || !/async listRecords/u.test(service)
    || !/FROM hr_employee_family WHERE tenant_id=\$1 AND park_id=\$2 AND employee_id=\$3 AND is_deleted=false/u.test(service)
    || !/relationship,full_name_masked "fullNameMasked"[\s\S]*birth_date "birthDate",work_unit "workUnit",job_title "jobTitle",political_status "politicalStatus"/u.test(service)
    || !/familyFull\?\{\.\.\.safe,fullName:this\.sensitive\.decrypt\(fullNameEncrypted as string\|null\),contact:this\.sensitive\.decrypt\(contactEncrypted as string\|null\)\}:safe/u.test(service)
    || !/recordHrSensitiveRead/u.test(service)
    || !/@Get\("employees\/:employeeId\/records"\)/u.test(controller)
    || !/HR_EMPLOYEE_RECORD_READ[\s\S]*HR_EMPLOYEE_RECORD_TEAM_READ[\s\S]*HR_EMPLOYEE_RECORD_SELF_READ/u.test(controller)
    || !/HR_EMPLOYEE_FAMILY_READ/u.test(permissions)
    || !/exact family and credential permissions expose decrypted PII to full HR only/u.test(permissionTest)
    || !/records\.family\.map/u.test(page)
    || !/employeeRecords:\(employeeId:string/u.test(webApi)) {
    fail("FAMILY_QUERY_MODERN_SURFACE_DRIFT", "extract, materialization, scoped API, permission, or page");
  }
}

function assertContract(contract) {
  const row = contract.routines?.[0];
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "family-query-1.0.0"
    || contract.compatibilityScope !== "u_family_employee_family_projection"
    || contract.productionImport !== "HOLD"
    || !Array.isArray(contract.routines)
    || contract.routines.length !== 1
    || row?.routineId !== ROUTINE_ID
    || row?.canonicalFamily !== "u_family"
    || row?.sourceKind !== "procedure"
    || row?.parityStatus !== "verified"
    || !same(row?.historicalVariants, [])
    || row?.review?.status !== "approved"
    || row?.semantics?.outputFieldMappings?.entries?.length !== 7
    || row?.semantics?.dynamicSql?.status !== "none"
    || row?.semantics?.writeMappings?.applicability !== "not_applicable"
    || row?.semantics?.roundingSemantics?.applicability !== "not_applicable"
    || row?.semantics?.dormantPaths?.triggerFiringCase?.status !== "not_applicable"
    || contract.nonClaims?.sourceProcedureRowOrder !== "NOT_CLAIMED"
    || contract.nonClaims?.rawWhitespaceOrBirthdayTimeOfDay !== "NOT_CLAIMED"
    || contract.nonClaims?.allSevenFieldsRenderedOnCurrentSummaryCard !== "NOT_CLAIMED"
    || contract.nonClaims?.otherFamilyReportRoutines !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImport !== "NOT_CLAIMED") {
    fail("FAMILY_QUERY_CONTRACT_INVALID", "identity, routine, dimensions, or non-claim boundary");
  }
  for (const kind of ["positive", "negative", "permission", "conservation"]) {
    if (!Array.isArray(row.testEvidence?.[kind]) || row.testEvidence[kind].length === 0) {
      fail("FAMILY_QUERY_TEST_EVIDENCE_INCOMPLETE", kind);
    }
  }
}

function assertFixture(fixture) {
  if (!object(fixture)
    || fixture.fixtureKind !== "yuzhou_hr_legacy_family_query_parity_fixture"
    || fixture.fixtureOnly !== true
    || fixture.containsSourceRows !== false
    || fixture.containsPersonalData !== false
    || fixture.productionImport !== "HOLD") {
    fail("FAMILY_QUERY_FIXTURE_INVALID", "identity or safety boundary");
  }
  const expectedCases = [
    "family-query-known-employee-full-projection",
    "family-query-no-match-and-null-input",
    "family-query-invalid-required-relation-quarantine",
    "family-query-scoped-sensitive-permission",
    "family-query-row-conservation",
  ];
  if (!same(fixture.cases?.map(row => row.testId), expectedCases)) fail("FAMILY_QUERY_FIXTURE_INVALID", "case coverage");
}

function runFixtureCases(fixture) {
  const [positive, noMatch, invalid, permission, conservation] = fixture.cases;
  const legacyRows = emulateLegacyFamilyQuery(positive.input, positive.rows);
  const modernRows = positive.rows
    .filter(row => sqlVarcharEqual(row.person, positive.input))
    .map(materializeSyntheticFamilyRow)
    .filter(row => row.disposition === "loaded")
    .map(row => row.projection);
  if (!same(legacyRows, positive.expectedLegacyRows)
    || !same(modernRows, positive.expectedModernFullRows)
    || legacyRows.length !== modernRows.length) {
    fail("FAMILY_QUERY_POSITIVE_MISMATCH", positive.testId);
  }
  for (const input of noMatch.inputs) {
    if (!same(emulateLegacyFamilyQuery(input, noMatch.rows), noMatch.expectedLegacyRows)) fail("FAMILY_QUERY_NO_MATCH_MISMATCH", noMatch.testId);
  }
  if (!same(noMatch.expectedModernRows, [])) fail("FAMILY_QUERY_NO_MATCH_MISMATCH", "modern expectation");
  const invalidLegacy = emulateLegacyFamilyQuery(invalid.input, [invalid.row]);
  const invalidModern = materializeSyntheticFamilyRow(invalid.row);
  if (invalidLegacy.length !== invalid.expectedLegacyRowCount
    || invalidModern.disposition !== invalid.expectedModernDisposition
    || !same(invalidModern.reasonCodes, invalid.expectedReasonCodes)) {
    fail("FAMILY_QUERY_QUARANTINE_MISMATCH", invalid.testId);
  }
  if (!same(permission.endpointPermissions, [
    "hr:employee_record:read",
    "hr:employee_record:team_read",
    "hr:employee_record:self_read",
  ])
    || permission.fullFieldPermission !== "hr:employee_family:read"
    || !same(permission.expectedFullFields, ["fullName", "contact"])
    || !same(permission.expectedMaskedFields, ["fullNameMasked", "contactMasked"])
    || permission.expectedAudit !== true) {
    fail("FAMILY_QUERY_PERMISSION_MISMATCH", permission.testId);
  }
  if (conservation.sourceRows !== conservation.loadedRows + conservation.quarantinedRows + conservation.approvedIgnoredRows
    || conservation.loadedRows !== conservation.expectedTargetRows
    || conservation.expectedUnrelatedBusinessWrites !== 0) {
    fail("FAMILY_QUERY_CONSERVATION_MISMATCH", conservation.testId);
  }
}

export function verifyLegacyFamilyQueryParity({ contract, fixture, repositoryRoot }) {
  assertContract(contract);
  assertFixture(fixture);
  if (!object(contract.evidenceBindings)
    || !same(Object.keys(contract.evidenceBindings).sort(), Object.keys(EXPECTED_EVIDENCE).sort())) {
    fail("FAMILY_QUERY_EVIDENCE_BINDING_INVALID", "coverage");
  }
  const evidence = Object.fromEntries(
    Object.entries(EXPECTED_EVIDENCE).map(([key, path]) => [key, readBound(repositoryRoot, contract.evidenceBindings[key], path, key)]),
  );
  assertSourceRoutine(JSON.parse(evidence.routineLedger.toString("utf8")));
  assertModernSurface(evidence);
  runFixtureCases(fixture);
  const generic = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  if (generic.status !== "COMPLETE" || generic.summary.verifiedRoutines !== 1 || generic.summary.pendingRoutines !== 0) {
    fail("FAMILY_QUERY_PARITY_INCOMPLETE", JSON.stringify(generic.summary));
  }
  return {
    ok: true,
    status: "COMPLETE",
    canonicalFamily: "u_family",
    verifiedRoutines: 1,
    historicalVariants: 0,
    sourceOutputFields: 7,
    mappedApiOutputFields: 7,
    sourceBusinessWrites: 0,
    modernQueryBusinessWrites: 0,
    controlledModernizations: contract.routines[0].controlledModernizations,
    nonClaims: contract.nonClaims,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-family-query-parity-v1.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-family-query-parity-fixture-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyFamilyQueryParity({ contract, fixture, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
