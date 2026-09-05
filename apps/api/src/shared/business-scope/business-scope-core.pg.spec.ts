import "reflect-metadata";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Injectable, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import type { BusinessScopeParkAdapter } from "./business-scope-park-adapter";
import { BusinessScopeCoreModule } from "./business-scope-core.module";
import { BusinessScopeResolverService } from "./business-scope-resolver.service";
import { BusinessScopeEntity } from "./entities/business-scope.entity";
import { BusinessScopeMembershipEntity } from "./entities/business-scope-membership.entity";
import { BusinessScopeModuleEntity } from "./entities/business-scope-module.entity";

const databaseUrl = process.env.BUSINESS_SCOPE_TEST_DATABASE_URL;
const enabled = typeof databaseUrl === "string" && databaseUrl !== "";

const TENANT_A = "tenant-alpha";
const TENANT_B = "tenant-beta";
const TENANT_A_ROW = "10000000-0000-0000-0000-000000000001";
const TENANT_A_HISTORY_ROW = "10000000-0000-0000-0000-000000000002";
const TENANT_B_ROW = "10000000-0000-0000-0000-000000000003";
const USER_A = "20000000-0000-0000-0000-000000000001";
const USER_B = "20000000-0000-0000-0000-000000000002";
const SCOPE_A1 = "30000000-0000-0000-0000-000000000001";
const SCOPE_A2 = "30000000-0000-0000-0000-000000000002";
const SCOPE_PARK = "30000000-0000-0000-0000-000000000003";

async function expectDatabaseReject(action: () => Promise<unknown>, expectedCode: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const record = error as { code?: unknown; driverError?: { code?: unknown } };
    return record.code === expectedCode || record.driverError?.code === expectedCode;
  });
}

function readerUrl(source: string): string {
  const parsed = new URL(source);
  parsed.username = "scope_contract_reader";
  parsed.password = "synthetic-reader-password";
  return parsed.toString();
}

test("business scope core synthetic PostgreSQL contract", { skip: !enabled }, async () => {
  assert.ok(databaseUrl);
  const owner = new DataSource({ type: "postgres", url: databaseUrl, entities: [] });
  await owner.initialize();
  try {
    await owner.query(`
      CREATE TABLE sys_tenant (
        id uuid PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        park_id varchar(64) NOT NULL DEFAULT 'legacy-required-column',
        status integer NOT NULL DEFAULT 1,
        expire_time timestamptz,
        is_deleted boolean NOT NULL DEFAULT false
      );
      CREATE UNIQUE INDEX uq_sys_tenant_tenant_id_active
        ON sys_tenant(tenant_id) WHERE is_deleted = false;
      CREATE TABLE sys_user (
        id uuid PRIMARY KEY,
        tenant_id varchar(64) NOT NULL,
        park_id varchar(64) NOT NULL,
        is_enabled boolean NOT NULL DEFAULT true,
        status varchar(32) NOT NULL DEFAULT 'enabled',
        is_deleted boolean NOT NULL DEFAULT false
      );
    `);
    const component = await readFile(
      path.resolve(process.cwd(), "../../database/components/business-scope/000001_core.sql"),
      "utf8"
    );
    await owner.query(component);

    assert.equal((await owner.query(`SELECT to_regclass('public.biz_park') AS value`))[0].value, null);
    await owner.query(
      `INSERT INTO sys_tenant(id, tenant_id, status, is_deleted)
       VALUES ($1, $2, 1, false), ($3, $2, 0, true), ($4, $5, 1, false)`,
      [TENANT_A_ROW, TENANT_A, TENANT_A_HISTORY_ROW, TENANT_B_ROW, TENANT_B]
    );
    assert.equal(
      Number((await owner.query(`SELECT count(*)::int AS value FROM sys_tenant WHERE tenant_id = $1`, [TENANT_A]))[0].value),
      2
    );
    await owner.query(
      `INSERT INTO sys_user(id, tenant_id, park_id, status, is_enabled, is_deleted)
       VALUES ($1, $2, 'legacy-required-column-a', 'enabled', true, false),
              ($3, $4, 'legacy-required-column-b', 'enabled', true, false)`,
      [USER_A, TENANT_A, USER_B, TENANT_B]
    );
    await owner.query(
      `INSERT INTO sys_business_scope(id, tenant_row_id, tenant_id, scope_kind, scope_code, scope_name)
       VALUES ($1, $2, $3, 'enterprise', 'enterprise-a', 'Synthetic Enterprise A'),
              ($4, $2, $3, 'enterprise', 'enterprise-b', 'Synthetic Enterprise B')`,
      [SCOPE_A1, TENANT_A_ROW, TENANT_A, SCOPE_A2]
    );
    assert.equal(
      Number((await owner.query(
        `SELECT count(*)::int AS value FROM sys_business_scope
          WHERE tenant_id = $1 AND scope_kind = 'enterprise' AND status = 'enabled' AND is_deleted = false`,
        [TENANT_A]
      ))[0].value),
      2
    );
    await expectDatabaseReject(() => owner.query(
      `INSERT INTO sys_business_scope(tenant_row_id, tenant_id, scope_kind, scope_code, scope_name)
       VALUES ($1, $2, 'enterprise', 'ENTERPRISE-A', 'Duplicate active code')`,
      [TENANT_A_ROW, TENANT_A]
    ), "23505");
    await expectDatabaseReject(() => owner.query(
      `INSERT INTO sys_business_scope(tenant_row_id, tenant_id, scope_kind, scope_code, scope_name)
       VALUES ($1, $2, 'enterprise', 'cross-tenant-scope', 'Cross tenant scope')`,
      [TENANT_A_ROW, TENANT_B]
    ), "23503");

    await owner.query(
      `INSERT INTO sys_user_business_scope_membership(tenant_id, scope_id, user_id)
       VALUES ($1, $2, $3)`,
      [TENANT_A, SCOPE_A1, USER_A]
    );
    await owner.query(
      `INSERT INTO sys_business_scope_module(tenant_id, scope_id, module_code)
       VALUES ($1, $2, 'hr')`,
      [TENANT_A, SCOPE_A1]
    );
    await expectDatabaseReject(() => owner.query(
      `INSERT INTO sys_user_business_scope_membership(tenant_id, scope_id, user_id)
       VALUES ($1, $2, $3)`,
      [TENANT_A, SCOPE_A2, USER_B]
    ), "23503");

    await owner.query(`CREATE ROLE scope_contract_reader LOGIN PASSWORD 'synthetic-reader-password'`);
    await owner.query(`GRANT CONNECT ON DATABASE postgres TO scope_contract_reader`);
    await owner.query(`GRANT USAGE ON SCHEMA public TO scope_contract_reader`);
    await owner.query(
      `GRANT SELECT ON sys_tenant, sys_user, sys_business_scope,
        sys_user_business_scope_membership, sys_business_scope_module TO scope_contract_reader`
    );

    const readOnlyUrl = readerUrl(databaseUrl);
    @Module({
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          url: readOnlyUrl,
          entities: [BusinessScopeEntity, BusinessScopeMembershipEntity, BusinessScopeModuleEntity],
          synchronize: false
        }),
        BusinessScopeCoreModule.register()
      ]
    })
    class EnterpriseScopeTestModule {}

    const enterpriseContext = await NestFactory.createApplicationContext(EnterpriseScopeTestModule, {
      logger: false
    });
    try {
      const resolver = enterpriseContext.get(BusinessScopeResolverService);
      const resolveA1 = () => resolver.resolveForUser({
        tenantId: TENANT_A,
        userId: USER_A,
        scopeId: SCOPE_A1,
        requiredModuleCode: "hr"
      });
      assert.deepEqual(await resolveA1(), {
        tenantId: TENANT_A,
        scopeId: SCOPE_A1,
        kind: "enterprise",
        parkId: null
      });
      assert.equal(
        await resolver.resolveForUser({
          tenantId: TENANT_A,
          userId: USER_A,
          scopeId: SCOPE_A2,
          requiredModuleCode: "hr"
        }),
        null
      );
      await owner.query(
        `INSERT INTO sys_business_scope_module(tenant_id, scope_id, module_code) VALUES ($1, $2, 'hr')`,
        [TENANT_A, SCOPE_A2]
      );
      assert.equal(
        await resolver.resolveForUser({
          tenantId: TENANT_A,
          userId: USER_A,
          scopeId: SCOPE_A2,
          requiredModuleCode: "hr"
        }),
        null
      );
      await owner.query(
        `INSERT INTO sys_user_business_scope_membership(tenant_id, scope_id, user_id) VALUES ($1, $2, $3)`,
        [TENANT_A, SCOPE_A2, USER_A]
      );
      await owner.query(
        `DELETE FROM sys_business_scope_module WHERE tenant_id = $1 AND scope_id = $2`,
        [TENANT_A, SCOPE_A2]
      );
      assert.equal(
        await resolver.resolveForUser({
          tenantId: TENANT_A,
          userId: USER_A,
          scopeId: SCOPE_A2,
          requiredModuleCode: "hr"
        }),
        null
      );
      const reader = enterpriseContext.get(DataSource);
      await expectDatabaseReject(() => reader.query(
        `INSERT INTO sys_business_scope_module(tenant_id, scope_id, module_code) VALUES($1, $2, 'write-denied')`,
        [TENANT_A, SCOPE_A1]
      ), "42501");

      await owner.query(
        `UPDATE sys_user_business_scope_membership SET status = 'disabled' WHERE tenant_id = $1 AND scope_id = $2`,
        [TENANT_A, SCOPE_A1]
      );
      assert.equal(await resolveA1(), null);
      await owner.query(
        `UPDATE sys_user_business_scope_membership SET status = 'enabled' WHERE tenant_id = $1 AND scope_id = $2`,
        [TENANT_A, SCOPE_A1]
      );

      await owner.query(
        `UPDATE sys_business_scope_module SET status = 'disabled' WHERE tenant_id = $1 AND scope_id = $2`,
        [TENANT_A, SCOPE_A1]
      );
      assert.equal(await resolveA1(), null);
      await owner.query(
        `UPDATE sys_business_scope_module SET status = 'enabled' WHERE tenant_id = $1 AND scope_id = $2`,
        [TENANT_A, SCOPE_A1]
      );

      await owner.query(`UPDATE sys_user SET is_enabled = false WHERE id = $1`, [USER_A]);
      assert.equal(await resolveA1(), null);
      await owner.query(`UPDATE sys_user SET is_enabled = true, status = 'disabled' WHERE id = $1`, [USER_A]);
      assert.equal(await resolveA1(), null);
      await owner.query(`UPDATE sys_user SET status = 'enabled' WHERE id = $1`, [USER_A]);

      await owner.query(`UPDATE sys_business_scope SET status = 'disabled' WHERE id = $1`, [SCOPE_A1]);
      assert.equal(await resolveA1(), null);
      await owner.query(`UPDATE sys_business_scope SET status = 'enabled' WHERE id = $1`, [SCOPE_A1]);

      await owner.query(`UPDATE sys_tenant SET status = 0 WHERE id = $1`, [TENANT_A_ROW]);
      assert.equal(await resolveA1(), null);
      await owner.query(`UPDATE sys_tenant SET status = 1, expire_time = now() - interval '1 minute' WHERE id = $1`, [TENANT_A_ROW]);
      assert.equal(await resolveA1(), null);
      await owner.query(`UPDATE sys_tenant SET expire_time = NULL WHERE id = $1`, [TENANT_A_ROW]);
      assert.deepEqual(await resolveA1(), {
        tenantId: TENANT_A,
        scopeId: SCOPE_A1,
        kind: "enterprise",
        parkId: null
      });

      await owner.query(
        `INSERT INTO sys_business_scope(id, tenant_row_id, tenant_id, scope_kind, scope_code, scope_name)
         VALUES ($1, $2, $3, 'park', 'park-adapter-required', 'Synthetic Park Adapter Contract')`,
        [SCOPE_PARK, TENANT_A_ROW, TENANT_A]
      );
      await owner.query(
        `INSERT INTO sys_user_business_scope_membership(tenant_id, scope_id, user_id) VALUES ($1, $2, $3)`,
        [TENANT_A, SCOPE_PARK, USER_A]
      );
      await owner.query(
        `INSERT INTO sys_business_scope_module(tenant_id, scope_id, module_code) VALUES ($1, $2, 'hr')`,
        [TENANT_A, SCOPE_PARK]
      );
      assert.equal(
        await resolver.resolveForUser({
          tenantId: TENANT_A,
          userId: USER_A,
          scopeId: SCOPE_PARK,
          requiredModuleCode: "hr"
        }),
        null
      );
    } finally {
      await enterpriseContext.close();
    }

    @Injectable()
    class SyntheticParkAdapter implements BusinessScopeParkAdapter {
      async resolveParkScope() {
        return {
          tenantId: TENANT_A,
          scopeId: SCOPE_PARK,
          kind: "park" as const,
          parkId: "synthetic-adapter-contract-only"
        };
      }
    }
    @Module({
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          url: readOnlyUrl,
          entities: [BusinessScopeEntity, BusinessScopeMembershipEntity, BusinessScopeModuleEntity],
          synchronize: false
        }),
        BusinessScopeCoreModule.register({ parkAdapterProvider: { useClass: SyntheticParkAdapter } })
      ]
    })
    class ParkScopeTestModule {}
    const parkContext = await NestFactory.createApplicationContext(ParkScopeTestModule, { logger: false });
    try {
      assert.deepEqual(
        await parkContext.get(BusinessScopeResolverService).resolveForUser({
          tenantId: TENANT_A,
          userId: USER_A,
          scopeId: SCOPE_PARK,
          requiredModuleCode: "hr"
        }),
        {
          tenantId: TENANT_A,
          scopeId: SCOPE_PARK,
          kind: "park",
          parkId: "synthetic-adapter-contract-only"
        }
      );
    } finally {
      await parkContext.close();
    }
  } finally {
    await owner.destroy();
  }
});
