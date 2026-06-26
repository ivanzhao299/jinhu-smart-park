import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringEventLogEntity } from "./entities/engineering-event-log.entity";

test("EngineeringEventLogEntity is mapped to the engineering event log table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringEventLogEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringEventLogEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_event_log");
  assert.ok(columns.includes("event_id"));
  assert.ok(columns.includes("event_type"));
  assert.ok(columns.includes("tenant_id"));
  assert.ok(columns.includes("park_id"));
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("entity_id"));
  assert.ok(columns.includes("actor_user_id"));
  assert.ok(columns.includes("occurred_at"));
  assert.ok(columns.includes("payload"));
});

test("EngineeringEventLog migration declares table, uniqueness, and indexes", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000158_epdr_engineering_event_log.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_event_log/);
  assert.match(migration, /event_id uuid NOT NULL/);
  assert.match(migration, /event_type varchar\(100\) NOT NULL/);
  assert.match(migration, /payload jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  assert.match(migration, /uk_biz_engineering_event_log_event_id/);
  assert.match(migration, /idx_biz_engineering_event_log_project/);
  assert.match(migration, /idx_biz_engineering_event_log_type/);
});
