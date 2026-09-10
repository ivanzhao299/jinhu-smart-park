#!/usr/bin/env node
import assert from "node:assert/strict";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { projectLegacyT0ExtendedFields, projectLegacyEmployeeState } from "../hr-cutover/materialize-production-t0-decision-candidates.mjs";

// Real retained staging, temporary tables only. Never emit SQL or database diagnostics.
assert.equal(process.env.YUZHOU_EXTENDED_FIELDS_PG, "yes", "explicit test opt-in required");
const container = process.env.YUZHOU_TEST_PG_CONTAINER;
const database = process.env.YUZHOU_TEST_PG_DATABASE;
const user = process.env.YUZHOU_TEST_PG_USER;
assert.match(container ?? "", /^[a-zA-Z0-9_-]+$/);
assert.match(database ?? "", /^jinhu_hr_migration_lab_[a-zA-Z0-9_]+$/);
assert.match(user ?? "", /^[a-zA-Z0-9_]+$/);
assert.ok(process.env.YUZHOU_TEST_STAGING_DIR, "explicit retained staging required");
const inspect = spawnSync("docker", ["inspect", "--format", '{{ index .Config.Labels "com.docker.compose.project" }}', container], { encoding: "utf8", timeout: 10000 });
assert.equal(inspect.status, 0, "LAB_INSPECTION_FAILED");
assert.equal(inspect.stdout.trim(), "jinhu_hr_migration_lab", "LAB_IDENTITY_MISMATCH");
const base = resolve(process.env.YUZHOU_TEST_STAGING_DIR);
const manifest = JSON.parse(readFileSync(resolve(base, "manifest.json"), "utf8"));
const migration = readFileSync(new URL("../../database/migrations/000295_hr_organization_position_legacy_mapping.sql", import.meta.url), "utf8");
const employeeMigration = readFileSync(new URL("../../database/migrations/000313_hr_yuzhou_employee_legacy_state.sql", import.meta.url), "utf8");
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const literal = value => `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
for (const [domain, table, file, expected] of [["departments", "sys_org", "departments.jsonl", 138], ["positions", "hr_position", "positions.jsonl", 18], ["employees", "hr_employee", "employees.jsonl", 2949]]) {
  const bytes = readFileSync(resolve(base, file));
  assert.equal(sha(bytes), manifest.domains[domain].fileSha256, "STAGING_HASH_MISMATCH");
  const rows = bytes.toString().trim().split("\n").map(JSON.parse);
  assert.equal(rows.length, expected, "STAGING_COUNT_MISMATCH");
  const payloads = rows.map(row => {
    assert.equal(sha(JSON.stringify(row.source, Object.keys(row.source).sort())), row.sourceRowSha256, "SOURCE_ROW_HASH_MISMATCH");
    const projection = table === "hr_employee" ? projectLegacyEmployeeState(row.source.legacyStatus) : projectLegacyT0ExtendedFields(table, row.source);
    assert.equal(projection.valid, true, "SOURCE_PROJECTION_INVALID");
    if (table === "hr_employee") delete projection.fields.employment_type;
    return projection.fields;
  });
  const columns = Object.keys(payloads[0]);
  const ddl = (table === "hr_employee" ? employeeMigration : migration).split(`ALTER TABLE ${table}\n`)[1]?.split(";")[0];
  assert.ok(ddl, "MIGRATION_TABLE_NOT_FOUND");
  const types = columns.map(column => {
    const type = ddl.match(new RegExp(`ADD COLUMN IF NOT EXISTS ${column} (smallint|integer|varchar\\(\\d+\\))(?=[,;\\s]|$)`))?.[1];
    assert.ok(type, "MIGRATION_COLUMN_TYPE_NOT_FOUND");
    return `${column} ${type}`;
  });
  const sql = `SET standard_conforming_strings=on;
SET search_path=pg_temp,pg_catalog;
SET statement_timeout='10s';
CREATE TEMP TABLE extension_expected(ordinal integer, payload jsonb);
CREATE TEMP TABLE extension_actual(ordinal integer, ${types.join(",")});
BEGIN READ ONLY;
INSERT INTO extension_expected SELECT ordinality, value FROM jsonb_array_elements(${literal(payloads)}) WITH ORDINALITY;
INSERT INTO extension_actual SELECT e.ordinal, x.* FROM extension_expected e CROSS JOIN LATERAL jsonb_to_record(e.payload) AS x(${types.join(",")});
DO $$ BEGIN
 IF (SELECT count(*) FROM extension_actual) <> ${expected}
 OR EXISTS(SELECT 1 FROM extension_expected e FULL JOIN extension_actual a USING(ordinal) WHERE e.payload IS DISTINCT FROM (to_jsonb(a)-'ordinal'))
 THEN RAISE EXCEPTION 'EXTENSION_ROUNDTRIP_MISMATCH'; END IF;
END $$;
ROLLBACK;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM extension_actual) OR EXISTS(SELECT 1 FROM extension_expected) THEN RAISE EXCEPTION 'EXTENSION_ROLLBACK_RESIDUAL'; END IF; END $$;`;
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-X", "-q", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8", timeout: 20000 });
  // Do not attach result or stderr to assertions: PostgreSQL may quote source values.
  assert.equal(result.status, 0, "EXTENSION_PG_CHECK_FAILED_REDACTED");
  console.log(JSON.stringify({ domain, rows: expected, columns: columns.length, roundtrip: "PASS", rollbackRows: 0, publicWrites: 0 }));
}
