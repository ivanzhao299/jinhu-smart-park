#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildLegacyProfessionalTitleDictionary,
  materializeLegacyProfessionalTitle,
} from "./legacy-professional-title-materialization.mjs";
import { evaluateLegacyRoutineParityContract } from "./legacy-routine-parity-contract.mjs";

const SHA256 = /^[a-f0-9]{64}$/u;
const ROUTINE_ID = "RULE-06D838A8343E39F6";
const SOURCE_ARTIFACT_SHA256 = "762c5c6f623276a39a6b1e754283fdd690e21f8584e442de9fcdff76f72ec1f3";
const EXPECTED_EVIDENCE = Object.freeze({
  routineLedger: "scripts/hr-cutover/contracts/legacy-routine-logic-ledger-v2.json",
  organizationPositionFieldMap: "scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json",
  professionalTitleMaterializer: "scripts/hr-cutover/legacy-professional-title-materialization.mjs",
  t5Transformer: "scripts/transform-yuzhou-t5-legacy-history.mjs",
  profileSchema: "database/migrations/000270_hr_employee_basic_profile_parity.sql",
  professionalTitleCodeSchema: "database/migrations/000295_hr_organization_position_legacy_mapping.sql",
  modernService: "apps/api/src/modules/hr/hr.service.ts",
  modernAccessPolicy: "apps/api/src/modules/hr/hr-access-policy.ts",
  modernController: "apps/api/src/modules/hr/hr.controller.ts",
  modernPage: "apps/web/app/hr/employees/HrEmployeesClient.tsx",
  materializationEvidence: "scripts/e2e/yuzhou-professional-title-materialization-contract.mjs",
  permissionEvidence: "apps/api/src/modules/hr/hr-employee-basic-profile-parity.contract.spec.ts",
});

export class LegacyProfessionalTitleLookupParityError extends Error {
  constructor(code, detail) {
    super(`${code}: ${detail}`);
    this.name = "LegacyProfessionalTitleLookupParityError";
    this.code = code;
  }
}

const fail = (code, detail) => { throw new LegacyProfessionalTitleLookupParityError(code, detail); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const rightTrim = value => String(value).replace(/\s+$/u, "");

function readBound(repositoryRoot, binding, expectedPath, label) {
  if (!object(binding) || binding.path !== expectedPath || !SHA256.test(binding.sha256 ?? "")) {
    fail("PROFESSIONAL_TITLE_LOOKUP_EVIDENCE_BINDING_INVALID", label);
  }
  const bytes = readFileSync(resolve(repositoryRoot, expectedPath));
  if (digest(bytes) !== binding.sha256) fail("PROFESSIONAL_TITLE_LOOKUP_EVIDENCE_DRIFT", label);
  return bytes;
}

export function emulateLegacyProfessionalTitleLookup(input, rows) {
  if (!Array.isArray(rows)) fail("PROFESSIONAL_TITLE_LOOKUP_FIXTURE_INVALID", "dictionary");
  if (input === null || input === undefined) return "";
  const key = rightTrim(input);
  const match = rows.find(row => object(row) && rightTrim(row.assignment ?? "") === key);
  return match?.assignmentname === null || match?.assignmentname === undefined ? "" : rightTrim(match.assignmentname);
}

function assertSourceRoutine(ledger) {
  const familyRows = ledger.routines?.filter(row => row.canonicalFamily === "getNameByassignment") ?? [];
  const row = familyRows[0];
  if (familyRows.length !== 1
    || !object(row)
    || row.routineId !== ROUTINE_ID
    || row.kind !== "function"
    || row.sourceName !== "getNameByassignment"
    || row.sourceArtifact !== "SQL_SCALAR_FUNCTION_getNameByassignment_sql"
    || row.sourceArtifactSha256 !== SOURCE_ARTIFACT_SHA256
    || row.primaryDomain !== "organization_position"
    || row.businessCapability !== "reference_label_or_search_helper"
    || !same(row.parameters, [{ name: "id", sourceType: "varchar(50)" }])
    || !same(row.readTables, ["assignment"])
    || !same(row.writeTables, [])
    || !same(row.dynamicWriteTables, [])
    || row.dynamicMutationStatus !== "none"
    || !same(row.calledRoutines, [])
    || !same(row.logicSignals, ["conditional_branch"])
    || !same(row.statementProfile, { select: 1, insert: 0, update: 0, delete: 0, merge: 0, alter: 0 })) {
    fail("PROFESSIONAL_TITLE_LOOKUP_SOURCE_LEDGER_DRIFT", "getNameByassignment");
  }
}

function assertReviewedFieldMap(mapping) {
  const code = mapping.fields?.find(row => row.sourceTable === "assignment" && row.sourceColumn === "assignment");
  const label = mapping.fields?.find(row => row.sourceTable === "assignment" && row.sourceColumn === "assignmentname");
  const rule = mapping.resolutionRules?.find(row => row.ruleId === "ASSIGNMENT_PROFESSIONAL_TITLE_V1");
  if (code?.disposition !== "exact_mapped"
    || !same(code.targetLocators, ["hr_employee_profile.legacy_professional_title_code"])
    || label?.disposition !== "exact_mapped"
    || !same(label.targetLocators, ["hr_employee_profile.technical_title"])
    || rule?.sourceCode !== "assignment.assignment"
    || rule?.sourceLabel !== "assignment.assignmentname"
    || rule?.personRelation !== "person.assignment"
    || rule?.codeTarget !== "hr_employee_profile.legacy_professional_title_code"
    || rule?.labelTarget !== "hr_employee_profile.technical_title"
    || rule?.doesNotDefinePosition !== true
    || rule?.evidence?.labelFunctionSha256 !== SOURCE_ARTIFACT_SHA256
    || rule?.evidence?.declaredForeignKey !== "FK_person_assignment"
    || rule?.evidence?.conclusion !== "ASSIGNMENT_IS_EMPLOYEE_PROFESSIONAL_TITLE_NOT_POSITION") {
    fail("PROFESSIONAL_TITLE_LOOKUP_FIELD_MAP_DRIFT", "assignment code-label relation");
  }
}

function assertModernSurface(evidence) {
  const materializer = evidence.professionalTitleMaterializer.toString("utf8");
  const transform = evidence.t5Transformer.toString("utf8");
  const schema = evidence.profileSchema.toString("utf8");
  const codeSchema = evidence.professionalTitleCodeSchema.toString("utf8");
  const service = evidence.modernService.toString("utf8");
  const access = evidence.modernAccessPolicy.toString("utf8");
  const controller = evidence.modernController.toString("utf8");
  const page = evidence.modernPage.toString("utf8");
  if (!/buildLegacyProfessionalTitleDictionary/u.test(materializer)
    || !/materializeLegacyProfessionalTitle/u.test(materializer)
    || !/LEGACY_PROFESSIONAL_TITLE_UNKNOWN_CODE/u.test(materializer)
    || !/legacyProfessionalTitleCode: code, technicalTitle: dictionary\.get\(code\)/u.test(materializer)
    || !/materializeLegacyProfessionalTitle\(row\.assignment,professionalTitleDictionary\)/u.test(transform)
    || !/technical_title/u.test(schema)
    || !/legacy_professional_title_code/u.test(codeSchema)
    || !/legacy assignment dictionary means professional title, not position/u.test(codeSchema)
    || !/async employeeProfile/u.test(service)
    || !/recordHrSensitiveRead/u.test(service)
    || !/technicalTitle: profile\.technicalTitle\?\?null/u.test(access)
    || !/@Get\("employees\/:id\/profile"\)/u.test(controller)
    || !/HR_EMPLOYEE_PROFILE_(?:READ|TEAM_READ|SELF_READ|MANAGE)/u.test(controller)
    || !/name="technicalTitle"/u.test(page)
    || !/label="技术职称"/u.test(page)) {
    fail("PROFESSIONAL_TITLE_LOOKUP_MODERN_SURFACE_DRIFT", "materializer, profile API, permission, or page");
  }
}

function assertContract(contract) {
  const row = contract.routines?.[0];
  if (!object(contract)
    || contract.formatVersion !== 1
    || contract.contractKind !== "yuzhou_hr_legacy_routine_semantic_parity"
    || contract.contractVersion !== "professional-title-lookup-1.0.0"
    || contract.compatibilityScope !== "getNameByassignment_person_profile_projection"
    || contract.productionImport !== "HOLD"
    || !Array.isArray(contract.routines)
    || contract.routines.length !== 1
    || row?.routineId !== ROUTINE_ID
    || row?.canonicalFamily !== "getNameByassignment"
    || row?.sourceKind !== "function"
    || row?.parityStatus !== "verified"
    || !same(row?.historicalVariants, [])
    || row?.review?.status !== "approved"
    || row?.semantics?.dynamicSql?.status !== "none"
    || row?.semantics?.writeMappings?.applicability !== "not_applicable"
    || row?.semantics?.roundingSemantics?.applicability !== "not_applicable"
    || row?.semantics?.dormantPaths?.triggerFiringCase?.status !== "not_applicable"
    || contract.nonClaims?.assignmentDefinesPosition !== "NOT_CLAIMED"
    || contract.nonClaims?.arbitraryUnvalidatedLookupInput !== "NOT_CLAIMED"
    || contract.nonClaims?.otherReferenceLookupFunctions !== "NOT_CLAIMED"
    || contract.nonClaims?.productionImport !== "NOT_CLAIMED") {
    fail("PROFESSIONAL_TITLE_LOOKUP_CONTRACT_INVALID", "identity, routine, or non-claim boundary");
  }
  for (const kind of ["positive", "negative", "permission", "conservation"]) {
    if (!Array.isArray(row.testEvidence?.[kind]) || row.testEvidence[kind].length === 0) {
      fail("PROFESSIONAL_TITLE_LOOKUP_TEST_EVIDENCE_INCOMPLETE", kind);
    }
  }
}

function assertFixture(fixture) {
  if (!object(fixture)
    || fixture.fixtureKind !== "yuzhou_hr_legacy_professional_title_lookup_fixture"
    || fixture.fixtureOnly !== true
    || fixture.containsSourceRows !== false
    || fixture.containsPersonalData !== false
    || fixture.productionImport !== "HOLD") {
    fail("PROFESSIONAL_TITLE_LOOKUP_FIXTURE_INVALID", "identity or safety boundary");
  }
  const expectedCases = [
    "professional-title-known-code",
    "professional-title-null-code",
    "professional-title-unknown-code",
    "professional-title-profile-read-permission",
    "professional-title-code-label-conservation",
  ];
  if (!same(fixture.cases?.map(row => row.testId), expectedCases)) {
    fail("PROFESSIONAL_TITLE_LOOKUP_FIXTURE_INVALID", "case coverage");
  }
}

function runFixtureCases(fixture) {
  const [positive, nullCase, unknown, permission, conservation] = fixture.cases;
  const dictionary = buildLegacyProfessionalTitleDictionary(positive.dictionary);
  const modern = materializeLegacyProfessionalTitle(positive.input, dictionary);
  if (emulateLegacyProfessionalTitleLookup(positive.input, positive.dictionary) !== positive.expectedLegacyOutput
    || !same(modern, positive.expectedModernProjection)
    || modern.technicalTitle !== positive.expectedLegacyOutput) {
    fail("PROFESSIONAL_TITLE_LOOKUP_POSITIVE_MISMATCH", positive.testId);
  }
  const nullModern = materializeLegacyProfessionalTitle(nullCase.input, buildLegacyProfessionalTitleDictionary(nullCase.dictionary));
  if (emulateLegacyProfessionalTitleLookup(nullCase.input, nullCase.dictionary) !== nullCase.expectedLegacyOutput
    || !same(nullModern, nullCase.expectedModernProjection)
    || (nullModern.technicalTitle ?? "") !== nullCase.expectedPresentation) {
    fail("PROFESSIONAL_TITLE_LOOKUP_NULL_MISMATCH", nullCase.testId);
  }
  if (emulateLegacyProfessionalTitleLookup(unknown.input, unknown.dictionary) !== unknown.expectedLegacyOutput) {
    fail("PROFESSIONAL_TITLE_LOOKUP_UNKNOWN_MISMATCH", "legacy output");
  }
  try {
    materializeLegacyProfessionalTitle(unknown.input, buildLegacyProfessionalTitleDictionary(unknown.dictionary));
    fail("PROFESSIONAL_TITLE_LOOKUP_UNKNOWN_MISMATCH", "modern fail-closed path did not reject");
  } catch (error) {
    if (error?.code !== unknown.expectedModernError) throw error;
  }
  if (!same(permission.requiredPermissions, [
    "hr:employee_profile:read",
    "hr:employee_profile:team_read",
    "hr:employee_profile:self_read",
    "hr:employee_profile:manage",
  ]) || permission.expectedAudit !== true || permission.expectedField !== "technicalTitle") {
    fail("PROFESSIONAL_TITLE_LOOKUP_PERMISSION_MISMATCH", permission.testId);
  }
  if (conservation.sourceDictionaryRows !== conservation.sourcePersonAssignments
    || conservation.sourcePersonAssignments !== conservation.expectedProfileRows
    || conservation.expectedCodeFields !== 1
    || conservation.expectedLabelFields !== 1
    || conservation.expectedUnrelatedWrites !== 0) {
    fail("PROFESSIONAL_TITLE_LOOKUP_CONSERVATION_MISMATCH", conservation.testId);
  }
}

export function verifyLegacyProfessionalTitleLookupParity({ contract, fixture, repositoryRoot }) {
  assertContract(contract);
  assertFixture(fixture);
  if (!object(contract.evidenceBindings)
    || !same(Object.keys(contract.evidenceBindings).sort(), Object.keys(EXPECTED_EVIDENCE).sort())) {
    fail("PROFESSIONAL_TITLE_LOOKUP_EVIDENCE_BINDING_INVALID", "coverage");
  }
  const evidence = Object.fromEntries(
    Object.entries(EXPECTED_EVIDENCE).map(([key, path]) => [key, readBound(repositoryRoot, contract.evidenceBindings[key], path, key)]),
  );
  const ledger = JSON.parse(evidence.routineLedger.toString("utf8"));
  assertSourceRoutine(ledger);
  assertReviewedFieldMap(JSON.parse(evidence.organizationPositionFieldMap.toString("utf8")));
  assertModernSurface(evidence);
  runFixtureCases(fixture);
  const generic = evaluateLegacyRoutineParityContract({ contract, routineLedger: fixture.sourceRoutineLedger });
  if (generic.status !== "COMPLETE"
    || generic.summary.verifiedRoutines !== 1
    || generic.summary.pendingRoutines !== 0) {
    fail("PROFESSIONAL_TITLE_LOOKUP_PARITY_INCOMPLETE", JSON.stringify(generic.summary));
  }
  return {
    ok: true,
    status: "COMPLETE",
    canonicalFamily: "getNameByassignment",
    verifiedRoutines: 1,
    historicalVariants: 0,
    sourceBusinessWrites: 0,
    modernLookupBusinessWrites: 0,
    controlledModernizations: contract.routines[0].controlledModernizations,
    nonClaims: contract.nonClaims,
    containsSourceRows: false,
    containsPersonalData: false,
    productionImport: "HOLD",
  };
}

function cli() {
  const repositoryRoot = resolve(fileURLToPath(new URL("../../", import.meta.url)));
  const contract = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-professional-title-lookup-parity-v1.json"), "utf8"));
  const fixture = JSON.parse(readFileSync(resolve(repositoryRoot, "scripts/hr-cutover/contracts/legacy-professional-title-lookup-fixture-v1.json"), "utf8"));
  process.stdout.write(`${JSON.stringify(verifyLegacyProfessionalTitleLookupParity({ contract, fixture, repositoryRoot }), null, 2)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
