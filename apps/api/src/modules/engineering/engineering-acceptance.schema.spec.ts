import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringAcceptanceStatus, EngineeringAcceptanceType } from "./domain/engineering-project.enums";
import { EngineeringAcceptanceEntity } from "./entities/engineering-acceptance.entity";

test("EngineeringAcceptanceEntity is mapped to the engineering acceptance table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringAcceptanceEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringAcceptanceEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_acceptance");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("plan_id"));
  assert.ok(columns.includes("acceptance_code"));
  assert.ok(columns.includes("acceptance_type"));
  assert.ok(columns.includes("acceptance_status"));
  assert.ok(columns.includes("workflow_instance_id"));
  assert.ok(columns.includes("attachment_ids"));
});

test("EngineeringAcceptance enum baseline includes required values", () => {
  assert.equal(EngineeringAcceptanceType.HIDDEN_WORK, "HIDDEN_WORK");
  assert.equal(EngineeringAcceptanceType.COMPLETION, "COMPLETION");
  assert.equal(EngineeringAcceptanceStatus.DRAFT, "DRAFT");
  assert.equal(EngineeringAcceptanceStatus.RECTIFICATION_REQUIRED, "RECTIFICATION_REQUIRED");
});

test("EngineeringAcceptance migration declares table, uniqueness, and indexes", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000156_epdr_engineering_acceptance.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_acceptance/);
  assert.match(migration, /acceptance_code varchar\(64\) NOT NULL/);
  assert.match(migration, /acceptance_status varchar\(40\) NOT NULL DEFAULT 'DRAFT'/);
  assert.match(migration, /ON biz_engineering_acceptance \(tenant_id, acceptance_code\)/);
  assert.match(migration, /idx_biz_engineering_acceptance_project/);
});
