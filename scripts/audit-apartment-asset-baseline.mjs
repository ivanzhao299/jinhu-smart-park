#!/usr/bin/env node
import { createRequire } from "node:module";
import process from "node:process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const requireFromApi = createRequire(resolve(root, "apps/api/package.json"));
const { Client } = requireFromApi("pg");

export const REPORT_SCHEMA_VERSION = "apartment-asset-baseline-v1";
export const DEFAULT_SAMPLE_LIMIT = 20;
export const MAX_SAMPLE_LIMIT = 100;
export const DEFAULT_STATEMENT_TIMEOUT_MS = 30_000;
export const DEFAULT_LOCK_TIMEOUT_MS = 3_000;

const boundedInteger = (value, fallback, minimum, maximum, label) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d+$/u.test(String(value))) throw new Error(`${label} must be an integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return parsed;
};

export function parseArgs(argv) {
  const args = {
    json: false,
    sampleLimit: DEFAULT_SAMPLE_LIMIT,
    statementTimeoutMs: DEFAULT_STATEMENT_TIMEOUT_MS,
    lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--") continue;
    if (token === "--json") args.json = true;
    else if (token === "--sample-limit") args.sampleLimit = boundedInteger(argv[++index], null, 1, MAX_SAMPLE_LIMIT, "sample-limit");
    else if (token === "--statement-timeout-ms") args.statementTimeoutMs = boundedInteger(argv[++index], null, 1_000, 120_000, "statement-timeout-ms");
    else if (token === "--lock-timeout-ms") args.lockTimeoutMs = boundedInteger(argv[++index], null, 100, 30_000, "lock-timeout-ms");
    else throw new Error(`unknown argument: ${token}`);
  }
  return args;
}

const resultSql = (findingsSql) => `
WITH findings AS MATERIALIZED (
${findingsSql}
), samples AS (
  SELECT * FROM findings ORDER BY tenant_id, park_id, subject_id LIMIT $1
)
SELECT
  (SELECT count(*)::integer FROM findings) AS count,
  COALESCE(jsonb_agg(to_jsonb(samples)), '[]'::jsonb) AS samples
FROM samples`;

export const CHECKS = Object.freeze([
  Object.freeze({
    code: "ASSET_UNIT_WITHOUT_BIZ_UNIT",
    severity: "warning",
    title: "物理资产单元未映射运营房号",
    recommendation: "A 类唯一匹配可审核后关联；无法匹配项标记为待转换或合法非运营资产。",
    sql: resultSql(`  SELECT a.tenant_id::text AS tenant_id, a.park_id::text AS park_id,
         a.id::text AS subject_id, a.unit_code AS subject_code,
         jsonb_build_object('unitName', a.unit_name) AS details
  FROM asset_unit a
  WHERE a.is_deleted=false
    AND NOT EXISTS (
      SELECT 1 FROM biz_unit u
      WHERE u.asset_unit_id=a.id AND u.tenant_id=a.tenant_id::text
        AND u.park_id=a.park_id::text AND u.is_deleted=false
    )`)
  }),
  Object.freeze({
    code: "BIZ_UNIT_WITHOUT_ASSET_UNIT",
    severity: "warning",
    title: "运营房号未关联物理资产",
    recommendation: "按自有、代管、租入或外部房源分类；自有房优先补齐资产映射。",
    sql: resultSql(`  SELECT u.tenant_id, u.park_id, u.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('unitName', u.unit_name) AS details
  FROM biz_unit u
  WHERE u.is_deleted=false AND u.asset_unit_id IS NULL`)
  }),
  Object.freeze({
    code: "BIZ_UNIT_ASSET_SCOPE_MISMATCH",
    severity: "critical",
    title: "运营房号资产映射失效或跨范围",
    recommendation: "停止约束收紧，人工核对租户、园区和软删除状态后修复映射。",
    sql: resultSql(`  SELECT u.tenant_id, u.park_id, u.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('assetUnitId', u.asset_unit_id, 'assetDeleted', a.is_deleted,
           'assetTenantId', a.tenant_id, 'assetParkId', a.park_id) AS details
  FROM biz_unit u
  LEFT JOIN asset_unit a ON a.id=u.asset_unit_id
  WHERE u.is_deleted=false AND u.asset_unit_id IS NOT NULL
    AND (a.id IS NULL OR a.is_deleted=true OR a.tenant_id::text<>u.tenant_id OR a.park_id::text<>u.park_id)`)
  }),
  Object.freeze({
    code: "UNIT_CODE_MATCH_ATTRIBUTE_CONFLICT",
    severity: "warning",
    title: "同范围同编码房号属性冲突",
    recommendation: "归入 B 类人工确认，明确名称和面积权威来源后再建立映射。",
    sql: resultSql(`  SELECT u.tenant_id, u.park_id, u.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('assetUnitId', a.id, 'bizName', u.unit_name,
           'assetName', a.unit_name, 'bizArea', u.unit_area, 'assetArea', a.building_area) AS details
  FROM biz_unit u
  JOIN asset_unit a ON a.tenant_id::text=u.tenant_id AND a.park_id::text=u.park_id
    AND a.unit_code=u.unit_code AND a.is_deleted=false
  WHERE u.is_deleted=false AND u.asset_unit_id IS NULL
    AND (btrim(u.unit_name)<>btrim(a.unit_name) OR u.unit_area<>a.building_area)`)
  }),
  Object.freeze({
    code: "APARTMENT_ROOM_WITHOUT_ACTIVE_OCCUPANCY",
    severity: "critical",
    title: "公寓配置缺少有效公寓域占用",
    recommendation: "核对配置生命周期；仍在管理中的房号补建可审计的公寓域保留占用。",
    sql: resultSql(`  SELECT r.tenant_id, r.park_id, r.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('unitId', r.unit_id, 'occupancyId', r.occupancy_id,
           'managementStatus', r.management_status) AS details
  FROM biz_apartment_room r
  JOIN biz_unit u ON u.id=r.unit_id
  LEFT JOIN biz_property_occupancy o ON o.id=r.occupancy_id AND o.is_deleted=false
  WHERE r.is_deleted=false AND r.management_status<>'disabled'
    AND (o.id IS NULL OR o.status NOT IN ('held','active') OR o.source_domain<>'apartment')`)
  }),
  Object.freeze({
    code: "APARTMENT_ROOM_DUPLICATE_OCCUPANCY",
    severity: "critical",
    title: "公寓配置存在多个未释放公寓域占用",
    recommendation: "按来源和创建时间人工确认权威占用，保留审计后释放重复记录。",
    sql: resultSql(`  SELECT r.tenant_id, r.park_id, r.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('unitId', r.unit_id, 'activeOccupancyCount', count(o.id)) AS details
  FROM biz_apartment_room r
  JOIN biz_unit u ON u.id=r.unit_id
  JOIN biz_property_occupancy o ON o.tenant_id=r.tenant_id AND o.park_id=r.park_id
    AND o.unit_id=r.unit_id AND o.source_domain='apartment'
    AND o.status IN ('held','active') AND o.is_deleted=false
  WHERE r.is_deleted=false
  GROUP BY r.tenant_id,r.park_id,r.id,u.unit_code,r.unit_id
  HAVING count(o.id)>1`)
  }),
  Object.freeze({
    code: "APARTMENT_OCCUPANCY_LINK_MISMATCH",
    severity: "critical",
    title: "公寓配置与占用记录归属不一致",
    recommendation: "在修复前禁止自动迁移；核对 occupancy 的范围、房号和来源对象。",
    sql: resultSql(`  SELECT r.tenant_id, r.park_id, r.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('occupancyId', r.occupancy_id, 'occupancyTenantId', o.tenant_id,
           'occupancyParkId', o.park_id, 'occupancyUnitId', o.unit_id,
           'sourceDomain', o.source_domain, 'sourceType', o.source_type, 'sourceId', o.source_id) AS details
  FROM biz_apartment_room r
  JOIN biz_unit u ON u.id=r.unit_id
  JOIN biz_property_occupancy o ON o.id=r.occupancy_id
  WHERE r.is_deleted=false AND (
    o.tenant_id<>r.tenant_id OR o.park_id<>r.park_id OR o.unit_id<>r.unit_id
    OR o.source_domain<>'apartment' OR o.source_type<>'apartment_room'
    OR o.source_id<>r.id::text OR o.is_deleted=true
  )`)
  }),
  Object.freeze({
    code: "APARTMENT_UNIT_WITHOUT_METER",
    severity: "warning",
    title: "公寓房号缺少启用能源表计",
    recommendation: "在能源交接闭环上线前补录房号水电气热表计或登记审核例外。",
    sql: resultSql(`  SELECT r.tenant_id, r.park_id, r.id::text AS subject_id,
         u.unit_code AS subject_code,
         jsonb_build_object('unitId', r.unit_id, 'managementStatus', r.management_status) AS details
  FROM biz_apartment_room r
  JOIN biz_unit u ON u.id=r.unit_id
  WHERE r.is_deleted=false AND r.management_status<>'disabled'
    AND NOT EXISTS (
      SELECT 1 FROM energy_meter m
      WHERE m.tenant_id=r.tenant_id AND m.park_id=r.park_id AND m.room_id=r.unit_id
        AND m.is_deleted=false AND m.is_enabled=true
    )`)
  }),
  Object.freeze({
    code: "ENERGY_METER_LOCATION_MISMATCH",
    severity: "critical",
    title: "能源表计与房号空间归属不一致",
    recommendation: "核对表计真实安装位置；修复范围和楼栋楼层引用后再接入自动交接读数。",
    sql: resultSql(`  SELECT m.tenant_id, m.park_id, m.id::text AS subject_id,
         m.meter_code AS subject_code,
         jsonb_build_object('roomId', m.room_id, 'meterBuildingId', m.building_id,
           'unitBuildingId', u.building_id, 'meterFloorId', m.floor_id,
           'unitFloorId', u.floor_id, 'unitDeleted', u.is_deleted) AS details
  FROM energy_meter m
  LEFT JOIN biz_unit u ON u.id=m.room_id
  WHERE m.is_deleted=false AND m.room_id IS NOT NULL AND (
    u.id IS NULL OR u.is_deleted=true OR u.tenant_id<>m.tenant_id OR u.park_id<>m.park_id
    OR (m.building_id IS NOT NULL AND m.building_id<>u.building_id)
    OR (m.floor_id IS NOT NULL AND m.floor_id<>u.floor_id)
  )`)
  })
]);

export async function runAudit({
  connectionString,
  sampleLimit = DEFAULT_SAMPLE_LIMIT,
  statementTimeoutMs = DEFAULT_STATEMENT_TIMEOUT_MS,
  lockTimeoutMs = DEFAULT_LOCK_TIMEOUT_MS,
  clientFactory = (options) => new Client(options)
}) {
  if (!connectionString) throw new Error("DATABASE_URL is required");
  sampleLimit = boundedInteger(sampleLimit, DEFAULT_SAMPLE_LIMIT, 1, MAX_SAMPLE_LIMIT, "sample-limit");
  statementTimeoutMs = boundedInteger(statementTimeoutMs, DEFAULT_STATEMENT_TIMEOUT_MS, 1_000, 120_000, "statement-timeout-ms");
  lockTimeoutMs = boundedInteger(lockTimeoutMs, DEFAULT_LOCK_TIMEOUT_MS, 100, 30_000, "lock-timeout-ms");
  const client = clientFactory({ connectionString, connectionTimeoutMillis: 10_000 });
  await client.connect();
  let transactionStarted = false;
  try {
    await client.query("BEGIN TRANSACTION READ ONLY");
    transactionStarted = true;
    await client.query("SELECT set_config('statement_timeout', $1, true), set_config('lock_timeout', $2, true)", [
      `${statementTimeoutMs}ms`, `${lockTimeoutMs}ms`
    ]);
    const checks = [];
    for (const definition of CHECKS) {
      const response = await client.query(definition.sql, [sampleLimit]);
      const row = response.rows[0];
      if (!row) throw new Error(`${definition.code} returned no aggregate row`);
      checks.push({
        code: definition.code,
        severity: definition.severity,
        title: definition.title,
        count: Number(row.count),
        samples: Array.isArray(row.samples) ? row.samples : [],
        recommendation: definition.recommendation
      });
    }
    await client.query("ROLLBACK");
    transactionStarted = false;
    return {
      schemaVersion: REPORT_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      mode: "read-only",
      sampleLimit,
      summary: {
        checks: checks.length,
        criticalFindings: checks.filter((item) => item.severity === "critical").reduce((sum, item) => sum + item.count, 0),
        warningFindings: checks.filter((item) => item.severity === "warning").reduce((sum, item) => sum + item.count, 0),
        totalFindings: checks.reduce((sum, item) => sum + item.count, 0)
      },
      checks
    };
  } catch (error) {
    if (transactionStarted) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
    }
    throw error;
  } finally {
    await client.end();
  }
}

export function formatHumanReport(report) {
  const lines = [
    `公寓-资产-能源数据基线（${report.schemaVersion}）`,
    `模式: ${report.mode}  检查项: ${report.summary.checks}  异常总数: ${report.summary.totalFindings}`,
    `严重: ${report.summary.criticalFindings}  警告: ${report.summary.warningFindings}`,
    ""
  ];
  for (const check of report.checks) {
    lines.push(`[${check.severity.toUpperCase()}] ${check.code}: ${check.count} - ${check.title}`);
    lines.push(`  建议: ${check.recommendation}`);
    for (const sample of check.samples) lines.push(`  样例: ${JSON.stringify(sample)}`);
  }
  return `${lines.join("\n")}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const report = await runAudit({ connectionString: process.env.DATABASE_URL, ...args });
    process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : formatHumanReport(report));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`apartment-asset baseline audit failed: ${message}\n`);
    process.exitCode = 1;
  }
}
