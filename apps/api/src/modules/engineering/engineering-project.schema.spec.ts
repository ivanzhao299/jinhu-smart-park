import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringProjectStatus, EngineeringProjectType } from "./domain/engineering-project.enums";
import { UpdateEngineeringProjectDto } from "./dto/engineering-project.dto";
import { EngineeringProjectEntity } from "./entities/engineering-project.entity";
import { EngineeringProjectStatusLogEntity } from "./entities/engineering-project-status-log.entity";

test("EngineeringProjectEntity is mapped to the engineering project table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringProjectEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringProjectEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_project");
  assert.ok(columns.includes("project_code"));
  assert.ok(columns.includes("project_name"));
  assert.ok(columns.includes("project_type"));
  assert.ok(columns.includes("status"));
});

test("EngineeringProject enum baseline includes required project type and default status", () => {
  assert.equal(EngineeringProjectType.FIRE_PROTECTION, "FIRE_PROTECTION");
  assert.equal(EngineeringProjectStatus.DRAFT, "DRAFT");
});

test("EngineeringProject migration declares table and tenant-scoped code uniqueness", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000150_epdr_engineering_project.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_project/);
  assert.match(migration, /project_code varchar\(64\) NOT NULL/);
  assert.match(migration, /ON biz_engineering_project \(tenant_id, project_code\)/);
  assert.match(migration, /status varchar\(32\) NOT NULL DEFAULT 'DRAFT'/);
});

test("UpdateEngineeringProjectDto does not expose direct status updates", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(new UpdateEngineeringProjectDto(), "status"), false);
});

test("EngineeringProjectStatusLogEntity is mapped to the status log table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringProjectStatusLogEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringProjectStatusLogEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_project_status_log");
  assert.ok(columns.includes("from_status"));
  assert.ok(columns.includes("to_status"));
  assert.ok(columns.includes("action"));
  assert.ok(columns.includes("reason"));
});
