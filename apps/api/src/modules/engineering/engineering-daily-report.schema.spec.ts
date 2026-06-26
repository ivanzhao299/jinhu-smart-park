import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { getMetadataArgsStorage } from "typeorm";
import { EngineeringDailyReportStatus, EngineeringWeatherType } from "./domain/engineering-project.enums";
import { EngineeringDailyReportEntity } from "./entities/engineering-daily-report.entity";

test("EngineeringDailyReportEntity is mapped to the engineering daily report table", () => {
  const table = getMetadataArgsStorage().tables.find((item) => item.target === EngineeringDailyReportEntity);
  const columns = getMetadataArgsStorage()
    .columns.filter((item) => item.target === EngineeringDailyReportEntity)
    .map((item) => item.options.name);

  assert.equal(table?.name, "biz_engineering_daily_report");
  assert.ok(columns.includes("project_id"));
  assert.ok(columns.includes("plan_id"));
  assert.ok(columns.includes("report_code"));
  assert.ok(columns.includes("report_date"));
  assert.ok(columns.includes("report_status"));
  assert.ok(columns.includes("attachment_ids"));
});

test("EngineeringDailyReport enum baseline includes required status and weather values", () => {
  assert.equal(EngineeringDailyReportStatus.DRAFT, "DRAFT");
  assert.equal(EngineeringDailyReportStatus.REVIEWED, "REVIEWED");
  assert.equal(EngineeringWeatherType.SUNNY, "SUNNY");
  assert.equal(EngineeringWeatherType.OTHER, "OTHER");
});

test("EngineeringDailyReport migration declares table, uniqueness, and status checks", () => {
  const migrationPath = resolve(__dirname, "../../../../../database/migrations/000153_epdr_engineering_daily_report.sql");
  const migration = readFileSync(migrationPath, "utf8");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS biz_engineering_daily_report/);
  assert.match(migration, /report_code varchar\(64\) NOT NULL/);
  assert.match(migration, /ON biz_engineering_daily_report \(tenant_id, report_code\)/);
  assert.match(migration, /tenant_id, project_id, report_date, contractor_org_id/);
  assert.match(migration, /report_status varchar\(32\) NOT NULL DEFAULT 'DRAFT'/);
  assert.match(migration, /chk_biz_engineering_daily_report_progress/);
});
