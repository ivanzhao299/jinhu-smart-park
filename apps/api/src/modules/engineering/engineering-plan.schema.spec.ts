import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringPlanLevel, EngineeringPlanStatus, EngineeringPlanType } from "./domain/engineering-project.enums";
import { EngineeringPlanEntity } from "./entities/engineering-plan.entity";

test("EngineeringPlanEntity is mapped to the engineering plan table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringPlanEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringPlanEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_plan");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("plan_code"));
  assert.ok(columns.includes("plan_name"));
  assert.ok(columns.includes("plan_type"));
  assert.ok(columns.includes("status"));
});

test("EngineeringPlan enum baseline includes required plan dimensions", () => {
  assert.equal(EngineeringPlanType.MASTER, "MASTER");
  assert.equal(EngineeringPlanStatus.DRAFT, "DRAFT");
  assert.equal(EngineeringPlanLevel.L1, "L1");
});

test("EngineeringPlan migration declares table, code uniqueness, and progress checks", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000152_epdr_engineering_plan.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_plan/);
  assert.match(migration, /plan_code varchar\(64\) NOT NULL/);
  assert.match(migration, /ON biz_engineering_plan \(tenant_id, plan_code\)/);
  assert.match(migration, /status varchar\(32\) NOT NULL DEFAULT 'DRAFT'/);
  assert.match(migration, /chk_biz_engineering_plan_actual_progress/);
});
