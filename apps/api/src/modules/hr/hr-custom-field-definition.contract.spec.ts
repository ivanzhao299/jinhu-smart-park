import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { projectHrCustomFieldDefinition, HrCustomFieldDefinitionService } from "./hr-custom-field-definition.service";

const scope = { tenantId: "tenant-a", parkId: "park-a" };

test("legacy definition projection is fail-closed and never exposes stored fingerprints", () => {
  const projection = projectHrCustomFieldDefinition({
    id: "definition-a",
    field_code: "legacy_def1",
    display_label: "自定义字段一",
    value_type: "text",
    field_group: "基础资料",
    sort_order: "1",
    sensitivity: "restricted",
    status: "enabled",
    source_column: "def1",
    legacy_definition_id: "1",
    legacy_datatype: "varchar",
    legacy_group_id: "base",
    legacy_sort_order: "1",
    legacy_nullable: null,
    legacy_description_d_present: true,
    legacy_sqltext_present: true,
    legacy_crosssql_present: false,
    base_classification: "text",
    imported_classification: null,
    classification_override: null,
    review_status: null,
    coverage_status: null,
    target_field_key: null,
    review_reason_code: null,
    review_version: null,
    logic_fingerprint_count: "10"
  });

  assert.equal(projection.legacyNullable, null, "nullable must remain unknown when dbo.defs has no proof");
  assert.equal(projection.legacyRules.classification, "review_required");
  assert.equal(projection.review.status, "pending");
  assert.equal(projection.coverage.status, "unmapped");
  assert.equal(projection.descriptionD.fingerprinted, true);
  assert.deepEqual(projection.logicCoverage, { captured: 10, denominator: 10, complete: true });
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /sha256|hash|SELECT|UPDATE|DELETE|INSERT/i);
});

test("direct service calls fail closed without the HR profile management permission", async () => {
  const service = new HrCustomFieldDefinitionService({} as never, {} as never, {} as never);
  await assert.rejects(
    service.list(scope, { sub: "user-a", username: "ordinary", tenantId: scope.tenantId, parkId: scope.parkId, roles: [], permissions: [] }, { page: 1, page_size: 20 }),
    ForbiddenException
  );
});

test("pending and rejected reviews keep classification and coverage fail closed", async () => {
  const service = new HrCustomFieldDefinitionService({} as never, {} as never, {} as never);
  const privileged = { sub: "admin-a", username: "admin", tenantId: scope.tenantId, parkId: scope.parkId, roles: [], permissions: ["hr:employee_profile:manage"] };
  await assert.rejects(
    service.review(scope, privileged, "00000000-0000-0000-0000-000000000001", { classification: "declarative", reviewStatus: "pending", coverageStatus: "mapped", targetFieldKey: "employee.custom", expectedVersion: 0 }),
    /Pending review must remain fail-closed/
  );
  await assert.rejects(
    service.review(scope, privileged, "00000000-0000-0000-0000-000000000001", { classification: "review_required", reviewStatus: "rejected", coverageStatus: "unmapped", reviewReasonCode: "insufficient_evidence", expectedVersion: 0 }),
    /Rejected review must block modern coverage/
  );
});

test("controller and migration keep scoped audited review without any raw legacy SQL storage", () => {
  const controller = readFileSync(resolve(__dirname, "hr-custom-field-definition.controller.ts"), "utf8");
  const service = readFileSync(resolve(__dirname, "hr-custom-field-definition.service.ts"), "utf8");
  const migration = readFileSync(resolve(__dirname, "../../../../../database/migrations/000293_hr_custom_field_legacy_rule_metadata.sql"), "utf8");

  assert.match(controller, /@Controller\("hr\/custom-field-definitions"\)/);
  assert.match(controller, /HR_EMPLOYEE_PROFILE_MANAGE/);
  assert.match(controller, /captureBody: false/);
  assert.match(service, /definition\.tenant_id=:tenantId AND definition\.park_id=:parkId/);
  assert.match(service, /recordHrSensitiveRead/);
  assert.match(service, /import \{ DataSource, type Repository, type SelectQueryBuilder \} from "typeorm";/);
  assert.doesNotMatch(service, /import type \{[^}]*DataSource/);
  assert.match(migration, /legacy_sqltext_present boolean/);
  assert.match(migration, /legacy_sqltext_sha256 char\(64\)/);
  assert.match(migration, /legacy_crosssql_present boolean/);
  assert.match(migration, /legacy_crosssql_sha256 char\(64\)/);
  assert.match(migration, /legacy_description_d_present boolean/);
  assert.match(migration, /review_reason_code/);
  assert.doesNotMatch(migration, /(?:raw|original)_(?:sqltext|crosssql)|(?:sqltext|crosssql)_(?:raw|original)/i);
});
