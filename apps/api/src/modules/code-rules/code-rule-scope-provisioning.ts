import { ConflictException } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager } from "typeorm";
import { DEFAULT_PLATFORM_SCOPE } from "../../shared/constants/platform-scope";

const ASSET_CORE_RULE_CODES = ["BUILDING_CODE", "FLOOR_CODE", "UNIT_CODE"] as const;

interface ModuleCodeRow {
  moduleCode: string;
}

interface RuleCodeRow {
  ruleCode: string;
  targetModule: string;
  entityType: string;
  targetEntity: string;
}

const ASSET_CORE_RULE_IDENTITIES = new Map<string, readonly [string, string, string]>([
  ["BUILDING_CODE", ["asset", "building", "building"]],
  ["FLOOR_CODE", ["asset", "floor", "floor"]],
  ["UNIT_CODE", ["asset", "unit", "unit"]]
]);

export function codeRuleScopeLockKey(scope: TenantParkScope): string {
  return `tenant-code-rule:${scope.tenantId}:${scope.parkId}`;
}

export async function ensureCodeRuleScopeProvisioned(
  manager: EntityManager,
  scope: TenantParkScope,
  actorId: string | null
): Promise<number> {
  await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [codeRuleScopeLockKey(scope)]);

  const assignments = await manager.query<ModuleCodeRow[]>(
    `SELECT DISTINCT module.module_code AS "moduleCode"
       FROM rel_tenant_module assignment
       JOIN sys_module module
         ON module.id = assignment.module_id
        AND module.status = 1
        AND module.is_deleted = false
      WHERE assignment.tenant_id = $1
        AND assignment.park_id = $2
        AND assignment.enabled = true
        AND assignment.status = 'enabled'
        AND assignment.is_deleted = false
        AND (assignment.expire_time IS NULL OR assignment.expire_time > now())
      ORDER BY module.module_code`,
    [scope.tenantId, scope.parkId]
  );
  const moduleCodes = assignments.map((assignment) => assignment.moduleCode);
  if (moduleCodes.length === 0) return 0;

  if (moduleCodes.includes("asset")) {
    const sourceRows = await manager.query<RuleCodeRow[]>(
      `SELECT rule_code AS "ruleCode",
              target_module AS "targetModule",
              entity_type AS "entityType",
              target_entity AS "targetEntity"
         FROM sys_code_rule
        WHERE tenant_id = $1
          AND park_id = $2
          AND rule_code = ANY($3::text[])
          AND status = 'enabled'
          AND is_deleted = false
        FOR SHARE`,
      [DEFAULT_PLATFORM_SCOPE.tenantId, DEFAULT_PLATFORM_SCOPE.parkId, ASSET_CORE_RULE_CODES]
    );
    const sourceIdentities = new Map(sourceRows.map((row) => [
      row.ruleCode,
      [row.targetModule, row.entityType, row.targetEntity]
    ]));
    if (ASSET_CORE_RULE_CODES.some((ruleCode) => {
      const actual = sourceIdentities.get(ruleCode);
      const expected = ASSET_CORE_RULE_IDENTITIES.get(ruleCode);
      return !actual || !expected || actual.some((value, index) => value !== expected[index]);
    })) {
      throw new ConflictException("平台标准资产编码规则配置不完整");
    }
  }

  const inserted = await manager.query<RuleCodeRow[]>(
    `WITH source_rules AS (
       SELECT source.*
         FROM sys_code_rule source
        WHERE source.tenant_id = $1
          AND source.park_id = $2
          AND source.target_module = ANY($3::text[])
          AND source.status = 'enabled'
          AND source.is_deleted = false
        FOR SHARE
     ), inserted AS (
       INSERT INTO sys_code_rule (
         tenant_id, park_id, entity_type, rule_code, rule_name, target_module, target_entity,
         prefix, pattern, date_pattern, sequence_length, current_seq, current_sequence,
         reset_policy, reset_strategy, next_reset_time, separator, example_code, sample_code,
         status, create_by, update_by, remark
       )
       SELECT
         $4::varchar, $5::varchar, source.entity_type, source.rule_code, source.rule_name,
         source.target_module, source.target_entity, source.prefix, source.pattern,
         source.date_pattern, source.sequence_length, 0, 0,
         source.reset_policy, source.reset_strategy, NULL, source.separator,
         regexp_replace(
           regexp_replace(
             replace(source.pattern, '{PREFIX}', source.prefix),
             $regex$\{DATE(?::[^}]+)?}$regex$,
             CASE source.date_pattern
               WHEN 'yyyyMMdd' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
               WHEN 'yyyyMM' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMM')
               WHEN 'yyyy' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY')
               ELSE ''
             END,
             'g'
           ),
           $regex$\{SEQ(?::[0-9]+)?}$regex$,
           lpad('1', source.sequence_length, '0'),
           'g'
         ),
         regexp_replace(
           regexp_replace(
             replace(source.pattern, '{PREFIX}', source.prefix),
             $regex$\{DATE(?::[^}]+)?}$regex$,
             CASE source.date_pattern
               WHEN 'yyyyMMdd' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMMDD')
               WHEN 'yyyyMM' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYYMM')
               WHEN 'yyyy' THEN to_char(now() AT TIME ZONE 'UTC', 'YYYY')
               ELSE ''
             END,
             'g'
           ),
           $regex$\{SEQ(?::[0-9]+)?}$regex$,
           lpad('1', source.sequence_length, '0'),
           'g'
         ),
         'enabled', $6::uuid, $6::uuid,
         left(coalesce(source.remark || ' | ', '') || 'Tenant scope provisioned standard code rule', 500)
       FROM source_rules source
       WHERE NOT EXISTS (
         SELECT 1
           FROM sys_code_rule target
          WHERE target.tenant_id = $4::varchar
            AND target.park_id = $5::varchar
            AND (
              target.rule_code = source.rule_code
              OR target.entity_type = source.entity_type
            )
       )
       RETURNING rule_code AS "ruleCode"
     )
     SELECT "ruleCode" FROM inserted ORDER BY "ruleCode"`,
    [
      DEFAULT_PLATFORM_SCOPE.tenantId,
      DEFAULT_PLATFORM_SCOPE.parkId,
      moduleCodes,
      scope.tenantId,
      scope.parkId,
      actorId
    ]
  );
  return inserted.length;
}
