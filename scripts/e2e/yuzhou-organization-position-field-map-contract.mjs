/* global process, structuredClone */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { LegacyOrganizationPositionFieldMapError, verifyLegacyOrganizationPositionFieldMap } from "../hr-cutover/legacy-organization-position-field-map.mjs";

const root = resolve(import.meta.dirname, "../..");
const read = path => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("scripts/hr-cutover/contracts/legacy-organization-position-field-map-v1.json"));
const columns = {
  assignment: ["assignment", "assignmentname"],
  company: ["id", "company", "addr", "phone", "email", "bank", "account", "taxcount", "master", "etype"],
  departmentcode: ["department", "departmentname", "rating", "master", "defpersons", "realpersons", "tel", "rights", "myorder", "id"],
  job: ["job", "jobname", "jobgrade", "parentjob", "upto", "department", "authority", "qualify", "respos", "salarygrade", "salarybase", "defpersons", "realpersons", "manual", "rating", "myorder", "id"],
  secassignmentcode: ["secassignment", "myorder"],
  station: ["product", "specification", "station", "stationname", "unit", "price", "feicipingbi", "jianglibi", "fakuanbi"]
};
const inventory = {
  tables: Object.entries(columns).map(([name, names]) => ({ name, columns: names.map((column, index) => ({ name: column, type: index === 0 ? "varchar(30)" : "int", nullable: index !== 0 })) }))
};
const fixtureContract = structuredClone(contract);
fixtureContract.inventorySha256 = createHash("sha256").update(`${JSON.stringify(inventory)}\n`).digest("hex");

test("organization and position mapping accounts for all 50 structural fields", () => {
  const result = verifyLegacyOrganizationPositionFieldMap(inventory, fixtureContract);
  assert.deepEqual(result.summary, { sourceTables: 6, sourceFields: 50, exactMappedFields: 25, archiveOnlyFields: 14, pendingFields: 11 });
  assert.equal(result.fields.length, 50);
  assert.equal(result.fields.find(field => field.sourceTable === "departmentcode" && field.sourceColumn === "department")?.nullable, false);
  assert.deepEqual(result.fields.find(field => field.sourceTable === "job" && field.sourceColumn === "parentjob")?.targetLocators, ["hr_position.reports_to_position_id"]);
  assert.deepEqual(result.fields.find(field => field.sourceTable === "job" && field.sourceColumn === "upto")?.targetLocators, ["hr_position.legacy_upto_code"]);
  assert.equal(result.resolutionRules[0].uptoMayOverrideReportsTo, false);
  assert.equal(result.resolutionRules[0].evidence.sourceParentjobEqualsCodePrefixRows, 0);
  assert.deepEqual(result.fields.find(field => field.sourceTable === "departmentcode" && field.sourceColumn === "master")?.targetLocators, ["sys_org.legacy_manager_reference"]);
  assert.equal(result.resolutionRules[1].mayPopulateIdentityTarget, false);
  assert.deepEqual(result.fields.find(field => field.sourceTable === "assignment" && field.sourceColumn === "assignment")?.targetLocators, ["hr_employee_profile.legacy_professional_title_code"]);
  assert.deepEqual(result.fields.find(field => field.sourceTable === "assignment" && field.sourceColumn === "assignmentname")?.targetLocators, ["hr_employee_profile.technical_title"]);
  assert.equal(result.resolutionRules[2].doesNotDefinePosition, true);
  assert.equal(result.resolutionRules[3].action, "KEEP_PENDING");
  assert.equal(result.resolutionRules[3].aggregateReceiptContract, "legacy-secassignment-relationship-receipt-v1");
  assert.equal(result.status, "IN_PROGRESS");
  assert.equal(result.productionImport, "HOLD");
});

test("mapping fails closed for a dropped, duplicated, or invented field", () => {
  const missing = structuredClone(fixtureContract);
  missing.fields.pop();
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, missing), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_COVERAGE_INCOMPLETE");
  const duplicate = structuredClone(fixtureContract);
  duplicate.fields.push(structuredClone(duplicate.fields[0]));
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, duplicate), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_DUPLICATE");
  const invented = structuredClone(fixtureContract);
  invented.fields[0].sourceColumn = "not_a_real_column";
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, invented), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_UNKNOWN_SOURCE");
  const precedenceGuess = structuredClone(fixtureContract);
  precedenceGuess.resolutionRules[0].uptoMayOverrideReportsTo = true;
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, precedenceGuess), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_RESOLUTION_RULE_INVALID");
  const identityGuess = structuredClone(fixtureContract);
  identityGuess.resolutionRules[1].mayPopulateIdentityTarget = true;
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, identityGuess), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_RESOLUTION_RULE_INVALID");
  const positionGuess = structuredClone(fixtureContract);
  positionGuess.resolutionRules[2].doesNotDefinePosition = false;
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, positionGuess), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_RESOLUTION_RULE_INVALID");
  const secondaryIdentityGuess = structuredClone(fixtureContract);
  secondaryIdentityGuess.resolutionRules[3].action = "MAP_TO_EMPLOYEE_IDENTITY";
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, secondaryIdentityGuess), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_RESOLUTION_RULE_INVALID");
  const fabricatedAggregateReceipt = structuredClone(fixtureContract);
  fabricatedAggregateReceipt.resolutionRules[3].aggregateReceiptStatus = "MATCH_CONFIRMED_AND_MAPPED";
  assert.throws(() => verifyLegacyOrganizationPositionFieldMap(inventory, fabricatedAggregateReceipt), error => error instanceof LegacyOrganizationPositionFieldMapError && error.code === "FIELD_MAP_RESOLUTION_RULE_INVALID");
});

test("migration and API expose the exact mapped hierarchy and descriptive fields", () => {
  const migration = read("database/migrations/000295_hr_organization_position_legacy_mapping.sql");
  for (const column of ["legacy_source_id", "legacy_hierarchy_level", "legacy_manager_reference", "planned_headcount", "contact_phone", "reports_to_position_id", "legacy_upto_code", "hierarchy_level", "sort_order", "authority", "qualification", "responsibilities", "position_manual"]) assert.match(migration, new RegExp(column));
  assert.match(migration, /FOREIGN KEY \(tenant_id, park_id, reports_to_position_id\)[\s\S]*REFERENCES hr_position\(tenant_id, park_id, id\)/);
  assert.match(migration, /hr_position_hierarchy_guard/);
  assert.match(migration, /position hierarchy cannot contain a cycle/);
  const entity = read("apps/api/src/modules/hr/entities/hr.entities.ts");
  const dto = read("apps/api/src/modules/hr/dto/hr.dto.ts");
  const service = read("apps/api/src/modules/hr/hr.service.ts");
  const webApi = read("apps/web/lib/hr-api.ts");
  const orgEntity = read("apps/api/src/modules/orgs/entities/org.entity.ts");
  const createOrgDto = read("apps/api/src/modules/orgs/dto/create-org.dto.ts");
  const updateOrgDto = read("apps/api/src/modules/orgs/dto/update-org.dto.ts");
  assert.match(migration, /hr_employee_profile[\s\S]{0,200}legacy_professional_title_code varchar\(2\)/);
  assert.match(entity, /reportsToPositionId/);
  assert.match(entity, /legacyUptoCode/);
  assert.match(entity, /positionManual/);
  assert.match(dto, /reportsToPositionId/);
  assert.match(dto, /@MaxLength\(1024\) authority/);
  assert.match(service, /reportsToPositionId\)await this\.mustPosition/);
  assert.match(service, /Parent position is unavailable in current scope/);
  assert.match(service, /order:\{sortOrder:"ASC",positionCode:"ASC"\}/);
  const positionProjection = service.slice(service.indexOf("function projectHrPosition"), service.indexOf("@Injectable()"));
  assert.ok(positionProjection.length > 0);
  assert.doesNotMatch(positionProjection, /legacySourceId|legacyUptoCode/);
  assert.match(service, /async listPositions[\s\S]*?\.map\(projectHrPosition\)/);
  assert.match(service, /async createPosition[\s\S]*?return projectHrPosition\(/);
  const webPosition = webApi.match(/export interface HrPosition \{([^}]*)\}/)?.[1] ?? "";
  assert.ok(webPosition.length > 0);
  assert.doesNotMatch(webPosition, /legacySourceId|legacyUptoCode/);
  for (const property of ["legacySourceId", "legacyHierarchyLevel", "plannedHeadcount", "contactPhone"]) assert.match(orgEntity, new RegExp(property));
  assert.match(orgEntity, /legacy_manager_reference[\s\S]{0,160}select:\s*false[\s\S]{0,160}legacyManagerReference/);
  assert.doesNotMatch(createOrgDto, /legacyManagerReference/);
  assert.doesNotMatch(updateOrgDto, /legacyManagerReference/);
  assert.match(entity, /technical_title[\s\S]{0,300}legacy_professional_title_code[\s\S]{0,120}select:false[\s\S]{0,120}legacyProfessionalTitleCode/);
  assert.doesNotMatch(dto, /legacyProfessionalTitleCode/);
  for (const property of ["legacyHierarchyLevel", "plannedHeadcount", "contactPhone"]) {
    assert.match(createOrgDto, new RegExp(property));
    assert.match(updateOrgDto, new RegExp(property));
  }
});

test("T0 extraction and load carry exact modern columns and fail closed on missing relations", () => {
  const extract = read("scripts/extract-yuzhou-t0.sh");
  const load = read("scripts/load-yuzhou-t0.sh");
  for (const alias of ["plannedHeadcount", "contactPhone", "legacySourceId", "legacyUptoCode", "qualification", "responsibilities", "headcountLimit", "positionManual"]) assert.match(extract, new RegExp(alias));
  for (const column of ["legacy_hierarchy_level", "legacy_manager_reference", "planned_headcount", "contact_phone", "reports_to_position_id", "legacy_upto_code", "headcount_limit", "position_manual"]) assert.match(load, new RegExp(column));
  assert.match(load, /legacy_manager_reference[\s\S]{0,500}legacyManagerValue/);
  assert.doesNotMatch(load, /leader_user_id[\s\S]{0,500}legacyManagerValue|legacyManagerValue[\s\S]{0,500}leader_user_id/);
  assert.match(load, /T0 position references an unknown organization/);
  assert.match(load, /T0 position references an unknown parent position/);
  assert.match(load, /T0 position omitted legacy upto structural field/);
  assert.doesNotMatch(load, /legacyUptoCode[\s\S]{0,160}reports_to_position_id/);
  assert.doesNotMatch(load, /salarybase/);
});

test("T0 transform preserves explicit null columns and rejects an omitted structural column", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "staging-org-position-"));
  const department = { legacyCode: "D001", orgName: "Fixture Org", rating: 2, legacyManagerValue: null, plannedHeadcount: null, contactPhone: null, sortOrder: null, legacySourceId: 1 };
  const position = { legacyCode: "P001", positionName: "Fixture Position", departmentCode: "D001", parentPositionCode: null, legacyUptoCode: "U001", jobgrade: null, salarygrade: null, authority: null, qualification: null, responsibilities: null, headcountLimit: null, positionManual: null, rating: 1, sortOrder: null, legacySourceId: 2 };
  writeFileSync(resolve(directory, "departments.raw.json"), JSON.stringify([department]));
  writeFileSync(resolve(directory, "positions.raw.json"), JSON.stringify([position]));
  writeFileSync(resolve(directory, "employees.raw.json"), "[]");
  for (const file of ["employee-job-states.raw.json", "job-state-code-metadata.raw.json", "job-state-codes.raw.json"]) writeFileSync(resolve(directory, file), "[]");
  const transform = resolve(root, "scripts/transform-yuzhou-t0.mjs");
  const result = spawnSync(process.execPath, [transform, directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const transformed = JSON.parse(readFileSync(resolve(directory, "positions.jsonl"), "utf8"));
  assert.equal(Object.hasOwn(transformed.source, "authority"), true);
  assert.equal(transformed.source.authority, null);
  assert.equal(transformed.source.legacyUptoCode, "U001");
  delete position.legacyUptoCode;
  const invalidDirectory = mkdtempSync(resolve(tmpdir(), "staging-org-position-invalid-"));
  writeFileSync(resolve(invalidDirectory, "departments.raw.json"), JSON.stringify([department]));
  writeFileSync(resolve(invalidDirectory, "positions.raw.json"), JSON.stringify([position]));
  writeFileSync(resolve(invalidDirectory, "employees.raw.json"), "[]");
  for (const file of ["employee-job-states.raw.json", "job-state-code-metadata.raw.json", "job-state-codes.raw.json"]) writeFileSync(resolve(invalidDirectory, file), "[]");
  const invalid = spawnSync(process.execPath, [transform, invalidDirectory], { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /positions row omitted structural column legacyUptoCode/);
});
