import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import {
  EngineeringInspectionStatus,
  EngineeringInspectionType,
  EngineeringIssueSeverity,
  EngineeringIssueSourceType,
  EngineeringIssueStatus,
  EngineeringIssueType
} from "./domain/engineering-project.enums";
import { EngineeringInspectionEntity } from "./entities/engineering-inspection.entity";
import { EngineeringIssueEntity } from "./entities/engineering-issue.entity";

test("EngineeringInspectionEntity is mapped to the engineering inspection table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringInspectionEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringInspectionEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_inspection");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("plan_id"));
  assert.ok(columns.includes("daily_report_id"));
  assert.ok(columns.includes("inspection_code"));
  assert.ok(columns.includes("inspection_status"));
  assert.ok(columns.includes("issue_count"));
  assert.ok(columns.includes("attachment_ids"));
});

test("EngineeringIssueEntity is mapped to the engineering issue table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringIssueEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringIssueEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_issue");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("inspection_id"));
  assert.ok(columns.includes("issue_code"));
  assert.ok(columns.includes("issue_status"));
  assert.ok(columns.includes("severity"));
  assert.ok(columns.includes("rectification_id"));
  assert.ok(columns.includes("source_type"));
});

test("EngineeringInspection and EngineeringIssue enum baseline includes required values", () => {
  assert.equal(EngineeringInspectionType.QUALITY, "QUALITY");
  assert.equal(EngineeringInspectionStatus.DRAFT, "DRAFT");
  assert.equal(EngineeringIssueType.SAFETY, "SAFETY");
  assert.equal(EngineeringIssueSeverity.CRITICAL, "CRITICAL");
  assert.equal(EngineeringIssueStatus.RECTIFICATION_PENDING, "RECTIFICATION_PENDING");
  assert.equal(EngineeringIssueSourceType.INSPECTION, "INSPECTION");
});

test("EngineeringInspection and EngineeringIssue migration declares tables and key indexes", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000154_epdr_engineering_inspection_issue.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_inspection/);
  assert.match(migration, /inspection_code varchar\(64\) NOT NULL/);
  assert.match(migration, /ON biz_engineering_inspection \(tenant_id, inspection_code\)/);
  assert.match(migration, /chk_biz_engineering_inspection_issue_count/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_issue/);
  assert.match(migration, /issue_code varchar\(64\) NOT NULL/);
  assert.match(migration, /ON biz_engineering_issue \(tenant_id, issue_code\)/);
  assert.match(migration, /rectification_id uuid NULL/);
});
