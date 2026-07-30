import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rowsForTable, TABLE_ORDER } from "./profile.mjs";
import { loadReviewedBootstrapContract } from "./reviewed-bootstrap-contract.mjs";

export const LOGICAL_TABLES = Object.freeze({
  park: "biz_park",
  building: "biz_building",
  floor: "biz_floor",
  unit: "biz_unit",
  party: "biz_party",
  property_occupancy: "biz_property_occupancy",
  booking: "biz_homestay_booking",
  booking_night: "biz_homestay_booking_night",
  turnover: "biz_homestay_turnover_task",
  lease: "biz_housing_lease",
  charge_plan: "biz_housing_charge_plan",
  housing_receivable: "biz_housing_receivable",
  purchase: "biz_housing_purchase",
  purchase_item: "biz_housing_purchase_item",
  handover: "biz_housing_handover",
  work_order: "biz_work_order",
  sys_file: "sys_file"
});

const SQL_IDENTIFIER = /^[a-z][a-z0-9_]+$/;

function csv(value) {
  if (value === null || value === undefined) return "\\N";
  const serialized =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${serialized.replaceAll('"', '""')}"`;
}

export function copyChunkSql(table, rows) {
  if (!SQL_IDENTIFIER.test(table) || rows.length === 0) {
    throw new Error("COPY requires a known non-empty table chunk");
  }
  const columns = Object.keys(rows[0]);
  if (
    columns.some((column) => !SQL_IDENTIFIER.test(column)) ||
    rows.some(
      (row) =>
        Object.keys(row).length !== columns.length ||
        columns.some((column) => !Object.hasOwn(row, column))
    )
  ) {
    throw new Error(`COPY ${table} rows have inconsistent or unsafe columns`);
  }
  return [
    "BEGIN;",
    "SET LOCAL statement_timeout = '120s';",
    "SELECT pg_advisory_xact_lock(hashtextextended('pr192:a-base:v1', 0));",
    `COPY ${table} (${columns.join(",")}) FROM STDIN WITH (FORMAT csv, NULL '\\N');`,
    ...rows.map((row) => columns.map((column) => csv(row[column])).join(",")),
    "\\.",
    "COMMIT;",
    ""
  ].join("\n");
}

export function* fixtureCopyChunks(profile, chunkSize = 1000) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 5000) {
    throw new Error("COPY chunk size must be between 1 and 5000");
  }
  for (const logicalName of TABLE_ORDER) {
    const table = LOGICAL_TABLES[logicalName];
    const chunk = [];
    for (const row of rowsForTable(profile, logicalName)) {
      chunk.push(row);
      if (chunk.length === chunkSize) {
        yield {
          logicalName,
          table,
          count: chunk.length,
          sql: copyChunkSql(table, chunk.splice(0))
        };
      }
    }
    if (chunk.length > 0) {
      yield {
        logicalName,
        table,
        count: chunk.length,
        sql: copyChunkSql(table, chunk)
      };
    }
  }
}

export function fixtureIdManifest(profile) {
  return Object.fromEntries(
    TABLE_ORDER.map((logicalName) => [
      LOGICAL_TABLES[logicalName],
      [...rowsForTable(profile, logicalName)].map((row) => row.id)
    ])
  );
}

export function exactCleanupSql(profile) {
  const lines = [
    "BEGIN;",
    "SELECT pg_advisory_xact_lock(hashtextextended('pr192:a-base:v1', 0));",
    "CREATE TEMP TABLE a_base_cleanup_keys(table_name text NOT NULL, id uuid NOT NULL) ON COMMIT DROP;",
    "COPY a_base_cleanup_keys (table_name,id) FROM STDIN WITH (FORMAT csv);"
  ];
  for (const logicalName of TABLE_ORDER) {
    const table = LOGICAL_TABLES[logicalName];
    for (const row of rowsForTable(profile, logicalName)) {
      lines.push(`${table},${row.id}`);
    }
  }
  lines.push("\\.");
  for (const logicalName of [...TABLE_ORDER].reverse()) {
    const table = LOGICAL_TABLES[logicalName];
    lines.push(
      `DELETE FROM ${table} target USING a_base_cleanup_keys keys ` +
        `WHERE keys.table_name = '${table}' AND target.id = keys.id;`
    );
  }
  lines.push("COMMIT;", "");
  return lines.join("\n");
}

export function residualScanSql(profile) {
  const queries = [];
  for (const logicalName of TABLE_ORDER) {
    const table = LOGICAL_TABLES[logicalName];
    const ids = [...rowsForTable(profile, logicalName)]
      .map((row) => `'${row.id}'::uuid`)
      .join(",");
    queries.push(
      `SELECT '${logicalName}', count(*) FROM ${table} WHERE id IN (${ids});`
    );
  }
  return queries.join("\n");
}

export function migrationPlan(migrationsDir = resolve("database/migrations")) {
  return loadReviewedBootstrapContract(migrationsDir).entries;
}

export function generatorSha256() {
  const hash = createHash("sha256");
  const files = [
    "scripts/e2e/property-remediation/a-base-core.mjs",
    ...[
      "contracts",
      "lib",
      "profiles",
      "roles",
      "traceability"
    ].flatMap((directory) =>
      readdirSync(
        resolve("scripts/e2e/property-remediation", directory),
        { recursive: true }
      )
        .filter((entry) => /\.(json|mjs)$/.test(entry))
        .map((entry) =>
          `scripts/e2e/property-remediation/${directory}/${entry}`
        )
    )
  ].sort();
  for (const path of files) {
    hash.update(path);
    hash.update(readFileSync(resolve(path)));
  }
  return hash.digest("hex");
}
