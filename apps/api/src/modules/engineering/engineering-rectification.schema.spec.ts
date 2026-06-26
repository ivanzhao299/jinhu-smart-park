import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringIssueSeverity, EngineeringRectificationStatus } from "./domain/engineering-project.enums";
import { EngineeringRectificationEntity } from "./entities/engineering-rectification.entity";

test("EngineeringRectificationEntity is mapped to the engineering rectification table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringRectificationEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringRectificationEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_rectification");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("issue_id"));
  assert.ok(columns.includes("inspection_id"));
  assert.ok(columns.includes("rectification_code"));
  assert.ok(columns.includes("rectification_title"));
  assert.ok(columns.includes("status"));
  assert.ok(columns.includes("deadline"));
  assert.ok(columns.includes("attachment_ids"));
});

test("EngineeringRectification enum baseline includes required values", () => {
  assert.equal(EngineeringRectificationStatus.PENDING, "PENDING");
  assert.equal(EngineeringRectificationStatus.IN_PROGRESS, "IN_PROGRESS");
  assert.equal(EngineeringRectificationStatus.SUBMITTED, "SUBMITTED");
  assert.equal(EngineeringRectificationStatus.RECHECKING, "RECHECKING");
  assert.equal(EngineeringRectificationStatus.PASSED, "PASSED");
  assert.equal(EngineeringRectificationStatus.REJECTED, "REJECTED");
  assert.equal(EngineeringRectificationStatus.OVERDUE, "OVERDUE");
  assert.equal(EngineeringRectificationStatus.CLOSED, "CLOSED");
  assert.equal(EngineeringIssueSeverity.HIGH, "HIGH");
});

test("EngineeringRectification migration declares table and key indexes", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000155_epdr_engineering_rectification.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_rectification/);
  assert.match(migration, /rectification_code varchar\(64\) NOT NULL/);
  assert.match(migration, /status varchar\(32\) NOT NULL DEFAULT 'PENDING'/);
  assert.match(migration, /deadline date NULL/);
  assert.match(migration, /ON biz_engineering_rectification \(tenant_id, rectification_code\)/);
  assert.match(migration, /idx_biz_engineering_rectification_project/);
  assert.match(migration, /idx_biz_engineering_rectification_deadline/);
});
