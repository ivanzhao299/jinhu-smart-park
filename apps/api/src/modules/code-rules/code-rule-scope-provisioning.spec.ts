import assert from "node:assert/strict";
import test from "node:test";
import { ConflictException } from "@nestjs/common";
import type { EntityManager } from "typeorm";
import {
  codeRuleScopeLockKey,
  ensureCodeRuleScopeProvisioned
} from "./code-rule-scope-provisioning";

test("code-rule scope provisioning derives every rule from persisted provisionable modules", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const manager = {
    query: async (sql: string, parameters: unknown[]) => {
      calls.push({ sql, parameters });
      if (sql.includes('module.module_code AS "moduleCode"')) {
        return [{ moduleCode: "asset" }, { moduleCode: "workorder" }];
      }
      if (sql.includes('rule_code AS "ruleCode"') && !sql.includes("WITH source_rules")) {
        return [
          { ruleCode: "BUILDING_CODE" },
          { ruleCode: "FLOOR_CODE" },
          { ruleCode: "UNIT_CODE" }
        ];
      }
      if (sql.includes("WITH source_rules")) {
        return [{ ruleCode: "BUILDING_CODE" }, { ruleCode: "WORKORDER_CODE" }];
      }
      return [];
    }
  } as unknown as EntityManager;

  const inserted = await ensureCodeRuleScopeProvisioned(
    manager,
    { tenantId: "tenant-a", parkId: "park-a" },
    "00000000-0000-0000-0000-000000000001"
  );

  assert.equal(inserted, 2);
  assert.equal(calls[0]?.parameters[0], codeRuleScopeLockKey({ tenantId: "tenant-a", parkId: "park-a" }));
  assert.match(calls[1]!.sql, /assignment\.enabled = true/);
  assert.match(calls[1]!.sql, /assignment\.status = 'enabled'/);
  assert.match(calls[1]!.sql, /assignment\.expire_time IS NULL OR assignment\.expire_time > now\(\)/);
  assert.doesNotMatch(calls[1]!.sql, /assignment\.start_time/);
  assert.match(calls[2]!.sql, /FOR SHARE/);
  assert.deepEqual(calls[3]?.parameters[2], ["asset", "workorder"]);
  assert.match(calls[3]!.sql, /source\.is_deleted = false\s+FOR SHARE/);
  assert.match(calls[3]!.sql, /current_seq, current_sequence/);
  assert.match(calls[3]!.sql, /source\.sequence_length, 0, 0/);
  assert.match(calls[3]!.sql, /target\.rule_code = source\.rule_code/);
  assert.match(calls[3]!.sql, /target\.entity_type = source\.entity_type/);
  assert.doesNotMatch(calls[3]!.sql, /target\.is_deleted/);
});

test("code-rule scope provisioning fails closed when the standard asset core is incomplete", async () => {
  const manager = {
    query: async (sql: string) => {
      if (sql.includes('module.module_code AS "moduleCode"')) return [{ moduleCode: "asset" }];
      if (sql.includes('rule_code AS "ruleCode"')) return [{ ruleCode: "BUILDING_CODE" }];
      return [];
    }
  } as unknown as EntityManager;

  await assert.rejects(
    () => ensureCodeRuleScopeProvisioned(manager, { tenantId: "tenant-a", parkId: "park-a" }, null),
    (error: unknown) => error instanceof ConflictException
      && error.message === "平台标准资产编码规则配置不完整"
  );
});

test("a scope without provisionable modules is a no-op", async () => {
  let calls = 0;
  const manager = {
    query: async () => {
      calls += 1;
      return [];
    }
  } as unknown as EntityManager;

  assert.equal(await ensureCodeRuleScopeProvisioned(manager, { tenantId: "tenant-a", parkId: "park-a" }, null), 0);
  assert.equal(calls, 2);
});
