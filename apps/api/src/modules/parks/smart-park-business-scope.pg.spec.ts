import "reflect-metadata";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { Module } from "@nestjs/common";
import { ModulesContainer, NestFactory } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { BusinessScopeCoreModule } from "../../shared/business-scope/business-scope-core.module";
import { BusinessScopeResolverService } from "../../shared/business-scope/business-scope-resolver.service";
import { BusinessScopeEntity } from "../../shared/business-scope/entities/business-scope.entity";
import { BusinessScopeMembershipEntity } from "../../shared/business-scope/entities/business-scope-membership.entity";
import { BusinessScopeModuleEntity } from "../../shared/business-scope/entities/business-scope-module.entity";
import { SmartParkBusinessScopeAdapter } from "./smart-park-business-scope.adapter";

const databaseUrl = process.env.BUSINESS_SCOPE_TEST_DATABASE_URL;
const tenantRow = "10000000-0000-4000-8000-000000000001";
const foreignTenantRow = "10000000-0000-4000-8000-000000000002";
const user = "20000000-0000-4000-8000-000000000001";
const enterprise = "30000000-0000-4000-8000-000000000001";

async function rejectCode(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, (error: unknown) => typeof error === "object" && error !== null
    && (error as { code?: string }).code === code);
}

test("real park binding backfill and read-only Nest adapter preserve scope identity", { skip: !databaseUrl }, async () => {
  assert.ok(databaseUrl);
  const connection = new URL(databaseUrl);
  assert.equal(connection.hostname, "127.0.0.1");
  assert.equal(connection.pathname, "/postgres");
  const owner = await new DataSource({ type: "postgres", url: databaseUrl, entities: [] }).initialize();
  try {
    await owner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
      CREATE TABLE sys_tenant(id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL,
        status integer NOT NULL DEFAULT 1, expire_time timestamptz, is_deleted boolean NOT NULL DEFAULT false);
      CREATE UNIQUE INDEX tenant_active ON sys_tenant(tenant_id) WHERE is_deleted = false;
      CREATE TABLE sys_user(id uuid PRIMARY KEY, tenant_id varchar(64) NOT NULL, park_id varchar(64) NOT NULL,
        status varchar(32) NOT NULL DEFAULT 'enabled', is_enabled boolean NOT NULL DEFAULT true,
        is_deleted boolean NOT NULL DEFAULT false);
    `);
    for (const file of [
      "database/migrations/000008_s2_biz_park.sql",
      "database/components/business-scope/000001_core.sql",
      "database/components/business-scope/000002_smart_park_binding.sql"
    ]) await owner.query(await readFile(path.resolve(process.cwd(), "../..", file), "utf8"));
    await owner.query(`INSERT INTO sys_tenant(id,tenant_id) VALUES ($1,'alpha'),($2,'beta')`, [tenantRow, foreignTenantRow]);
    await owner.query(`INSERT INTO sys_user(id,tenant_id,park_id) VALUES ($1,'alpha','park-a1')`, [user]);
    await owner.query(`INSERT INTO biz_park(tenant_id,park_id,park_code,park_name,status)
      VALUES ('alpha','park-a1','a1','Synthetic A1',1),('alpha','park-a2','a2','Synthetic A2',0),
             ('beta','park-b1','b1','Synthetic B1',1)`);
    const backfill = async () => (await owner.query(
      `SELECT backfill_smart_park_business_scopes('alpha') AS receipt`
    ))[0].receipt;
    assert.deepEqual(await backfill(), { sourceParks: 2, createdScopes: 2, createdBindings: 2, existingBindings: 0 });
    assert.deepEqual(await backfill(), { sourceParks: 2, createdScopes: 0, createdBindings: 0, existingBindings: 2 });
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM sys_business_scope WHERE tenant_id='beta'`))[0].n, 0);
    const bindings: { scope_id: string; park_row_id: string; park_id: string }[] = await owner.query(
      `SELECT scope_id,park_row_id,park_id FROM sys_business_scope_park_binding ORDER BY park_id`
    );
    assert.equal(bindings.length, 2);
    const first = bindings[0];
    assert.ok(first);
    const scopeId = first.scope_id;
    assert.notEqual(scopeId, first.park_row_id);
    await owner.query(`INSERT INTO sys_business_scope(id,tenant_row_id,tenant_id,scope_kind,scope_code,scope_name)
      VALUES ($1,$2,'alpha','enterprise','enterprise','Synthetic Enterprise')`, [enterprise, tenantRow]);

    await rejectCode(() => owner.query(`UPDATE sys_business_scope_park_binding SET scope_id=$1 WHERE scope_id=$2`,
      [enterprise, scopeId]), "23503");
    await rejectCode(() => owner.query(`INSERT INTO sys_business_scope_park_binding SELECT *
      FROM sys_business_scope_park_binding WHERE scope_id=$1`, [scopeId]), "23505");
    await rejectCode(() => owner.query(`UPDATE sys_business_scope SET scope_kind='enterprise' WHERE id=$1`, [scopeId]), "23503");
    await rejectCode(() => owner.query(`UPDATE sys_business_scope SET id=gen_random_uuid() WHERE id=$1`, [scopeId]), "23503");
    await rejectCode(() => owner.query(`UPDATE biz_park SET id=gen_random_uuid() WHERE id=$1`, [first.park_row_id]), "23503");
    await rejectCode(() => owner.query(`UPDATE biz_park SET park_id='changed' WHERE id=$1`, [first.park_row_id]), "23503");
    await rejectCode(() => owner.query(`UPDATE biz_park SET tenant_id='beta' WHERE id=$1`, [first.park_row_id]), "23503");
    await rejectCode(() => owner.query(`UPDATE sys_business_scope_park_binding SET park_row_id=
      (SELECT id FROM biz_park WHERE park_id='park-b1') WHERE scope_id=$1`, [scopeId]), "23503");

    await owner.query(`CREATE ROLE park_scope_reader LOGIN PASSWORD 'synthetic-reader-password';
      GRANT USAGE ON SCHEMA public TO park_scope_reader;
      GRANT SELECT ON sys_tenant,sys_user,biz_park,sys_business_scope,sys_business_scope_park_binding,
        sys_user_business_scope_membership,sys_business_scope_module TO park_scope_reader;`);
    connection.username = "park_scope_reader";
    connection.password = "synthetic-reader-password";
    @Module({ imports: [
      TypeOrmModule.forRoot({ type: "postgres", url: connection.toString(), synchronize: false,
        entities: [BusinessScopeEntity, BusinessScopeMembershipEntity, BusinessScopeModuleEntity] }),
      BusinessScopeCoreModule.register({ parkAdapterProvider: { useClass: SmartParkBusinessScopeAdapter } })
    ] })
    class SyntheticParkRoot {}
    const context = await NestFactory.createApplicationContext(SyntheticParkRoot, { logger: false, abortOnError: false });
    try {
      const resolver = context.get(BusinessScopeResolverService);
      const resolve = () => resolver.resolveForUser({ tenantId: "alpha", userId: user, scopeId, requiredModuleCode: "hr" });
      assert.equal(await resolve(), null); // Backfill did not grant membership or module access.
      await owner.query(`INSERT INTO sys_user_business_scope_membership(tenant_id,scope_id,user_id)
        VALUES ('alpha',$1,$2),('alpha',$3,$2)`, [scopeId, user, enterprise]);
      await owner.query(`INSERT INTO sys_business_scope_module(tenant_id,scope_id,module_code)
        VALUES ('alpha',$1,'hr'),('alpha',$2,'hr')`, [scopeId, enterprise]);
      assert.deepEqual(await resolve(), { tenantId: "alpha", scopeId, kind: "park", parkId: "park-a1" });
      assert.deepEqual(await resolver.resolveForUser({ tenantId: "alpha", userId: user, scopeId: enterprise, requiredModuleCode: "hr" }),
        { tenantId: "alpha", scopeId: enterprise, kind: "enterprise", parkId: null });
      for (const [table, where, column, bad, good] of [
        ["biz_park", "park_id='park-a1'", "status", "0", "1"],
        ["biz_park", "park_id='park-a1'", "is_deleted", "true", "false"],
        ["sys_user", "tenant_id='alpha'", "is_enabled", "false", "true"],
        ["sys_user_business_scope_membership", "tenant_id='alpha'", "status", "'disabled'", "'enabled'"],
        ["sys_business_scope_module", "tenant_id='alpha'", "status", "'disabled'", "'enabled'"]
      ]) {
        await owner.query(`UPDATE ${table} SET ${column}=${bad} WHERE ${where}`);
        assert.equal(await resolve(), null);
        await owner.query(`UPDATE ${table} SET ${column}=${good} WHERE ${where}`);
        assert.ok(await resolve());
      }
      await owner.query(`INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
        VALUES ('alpha','park-a1','duplicate-a1','Synthetic duplicate')`);
      assert.equal(await resolve(), null);
      await assert.rejects(backfill(), /SMART_PARK_SCOPE_SOURCE_AMBIGUOUS/u);
      await owner.query(`DELETE FROM biz_park WHERE park_code='duplicate-a1'`);
      assert.ok(await resolve());
      const reader = context.get(DataSource);
      await rejectCode(() => reader.query(`SELECT backfill_smart_park_business_scopes('alpha')`), "42501");
      await rejectCode(() => reader.query(`DELETE FROM sys_business_scope_park_binding`), "42501");
      const moduleNames = [...context.get(ModulesContainer).values()].map(module => module.metatype.name);
      for (const forbidden of ["ParksModule", "UsersModule", "SaaSModulesModule", "PropertyOperationsModule"]) {
        assert.ok(!moduleNames.includes(forbidden));
      }
    } finally { await context.close(); }

    // A later code collision must roll back every earlier insertion from the same function call.
    await owner.query(`INSERT INTO biz_park(tenant_id,park_id,park_code,park_name)
      VALUES ('alpha','park-a3','a3','Synthetic A3'),('alpha','park-a4','a4','Synthetic A4')`);
    await owner.query(`INSERT INTO sys_business_scope(tenant_row_id,tenant_id,scope_kind,scope_code,scope_name)
      VALUES ($1,'alpha','enterprise','park:' || md5(jsonb_build_array('alpha','park-a4')::text),'Synthetic collision')`, [tenantRow]);
    await rejectCode(backfill, "23505");
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM sys_business_scope_park_binding`))[0].n, 2);
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM sys_business_scope WHERE scope_kind='park'`))[0].n, 2);
    assert.equal((await owner.query(`SELECT count(*)::int AS n FROM biz_park`))[0].n, 5);
  } finally { await owner.destroy(); }
});
