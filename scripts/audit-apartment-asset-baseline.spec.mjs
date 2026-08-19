import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  CHECKS,
  MAX_SAMPLE_LIMIT,
  REPORT_SCHEMA_VERSION,
  formatHumanReport,
  parseArgs,
  runAudit
} from "./audit-apartment-asset-baseline.mjs";

test("defines the complete stable baseline check catalog", () => {
  assert.deepEqual(CHECKS.map((check) => check.code), [
    "ASSET_UNIT_WITHOUT_BIZ_UNIT",
    "BIZ_UNIT_WITHOUT_ASSET_UNIT",
    "BIZ_UNIT_ASSET_SCOPE_MISMATCH",
    "UNIT_CODE_MATCH_ATTRIBUTE_CONFLICT",
    "APARTMENT_ROOM_WITHOUT_ACTIVE_OCCUPANCY",
    "APARTMENT_ROOM_DUPLICATE_OCCUPANCY",
    "APARTMENT_OCCUPANCY_LINK_MISMATCH",
    "APARTMENT_UNIT_WITHOUT_METER",
    "ENERGY_METER_LOCATION_MISMATCH"
  ]);
  for (const check of CHECKS) {
    assert.match(check.sql, /LIMIT \$1/u);
    assert.match(check.sql, /SELECT\s+[\s\S]*count\(\*\)/iu);
    assert.doesNotMatch(check.sql, /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|CALL|COPY)\b/iu);
  }
});

test("bounds every operator-controlled numeric argument", () => {
  assert.deepEqual(parseArgs(["--", "--json", "--sample-limit", "7", "--statement-timeout-ms", "5000", "--lock-timeout-ms", "900"]), {
    json: true, sampleLimit: 7, statementTimeoutMs: 5000, lockTimeoutMs: 900
  });
  assert.throws(() => parseArgs(["--sample-limit", String(MAX_SAMPLE_LIMIT + 1)]), /between 1 and 100/u);
  assert.throws(() => parseArgs(["--sample-limit", "1;DROP TABLE"]), /must be an integer/u);
  assert.throws(() => parseArgs(["--unknown"]), /unknown argument/u);
});

test("runs all checks inside a read-only transaction and always releases the client", async () => {
  const statements = [];
  let ended = false;
  const fakeClient = {
    async connect() { statements.push("CONNECT"); },
    async query(sql, parameters) {
      statements.push({ sql, parameters });
      if (sql.trimStart().startsWith("WITH findings")) return { rows: [{ count: "0", samples: [] }] };
      return { rows: [] };
    },
    async end() { ended = true; }
  };
  const report = await runAudit({ connectionString: "postgresql://redacted", clientFactory: () => fakeClient });
  assert.equal(report.schemaVersion, REPORT_SCHEMA_VERSION);
  assert.equal(report.summary.checks, CHECKS.length);
  assert.equal(report.summary.totalFindings, 0);
  assert.equal(statements[1].sql, "BEGIN TRANSACTION READ ONLY");
  assert.equal(statements.at(-1).sql, "ROLLBACK");
  assert.equal(ended, true);
});

test("rolls back and fails closed when a check fails", async () => {
  const statements = [];
  let checkCalls = 0;
  const fakeClient = {
    async connect() {},
    async query(sql) {
      statements.push(sql);
      if (sql.trimStart().startsWith("WITH findings") && ++checkCalls === 2) throw new Error("query timed out");
      if (sql.trimStart().startsWith("WITH findings")) return { rows: [{ count: 0, samples: [] }] };
      return { rows: [] };
    },
    async end() {}
  };
  await assert.rejects(() => runAudit({ connectionString: "postgresql://redacted", clientFactory: () => fakeClient }), /query timed out/u);
  assert.equal(statements.at(-1), "ROLLBACK");
});

test("human output contains findings but source never prints database authority", () => {
  const source = readFileSync(resolve("scripts/audit-apartment-asset-baseline.mjs"), "utf8");
  assert.match(source, /BEGIN TRANSACTION READ ONLY/u);
  assert.doesNotMatch(source, /console\.log\(.*connectionString/su);
  const output = formatHumanReport({
    schemaVersion: REPORT_SCHEMA_VERSION,
    mode: "read-only",
    summary: { checks: 1, totalFindings: 1, criticalFindings: 1, warningFindings: 0 },
    checks: [{ code: "TEST", severity: "critical", title: "测试", count: 1, recommendation: "人工复核", samples: [{ subject_id: "id" }] }]
  });
  assert.match(output, /TEST: 1/u);
  assert.doesNotMatch(output, /postgresql:\/\//u);
});
