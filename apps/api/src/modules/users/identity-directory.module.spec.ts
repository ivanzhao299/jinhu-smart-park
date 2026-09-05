import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Global, Injectable, Module, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModulesContainer, NestFactory } from "@nestjs/core";
import { DataSource } from "typeorm";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { JwtStrategy } from "../auth/strategies/jwt.strategy";
import { TenantEntity } from "../tenants/entities/tenant.entity";
import { TenantStatusModule } from "../tenants/tenant-status.module";
import { UserEntity } from "./entities/user.entity";
import { IdentityDirectoryModule } from "./identity-directory.module";
import { IdentityDirectoryService } from "./identity-directory.service";

test("real identity and tenant leaf modules rebuild JWT context without management modules", async () => {
  // Real Nest providers, synthetic repositories: not a SQL or HTTP login test.
  const claims = {
    sub: "00000000-0000-4000-8000-000000000001", username: "synthetic-user",
    tenantId: "synthetic-tenant", parkId: "synthetic-park", authVersion: 2
  };
  const row = {
    user_id: claims.sub, user_username: claims.username, user_display_name: "Synthetic",
    user_tenant_id: claims.tenantId, user_park_id: claims.parkId,
    user_is_enabled: true, user_status: "enabled", user_auth_version: 2,
    is_tenant_super: false, role_link_id: null, role_code: null,
    role_is_super: null, role_data_scope: null, permission_code: null
  };
  const tenant = { tenantId: claims.tenantId, status: 1, expireTime: null, isDeleted: false };
  const requestedEntities: unknown[] = [];
  const principalQueries: unknown[][] = [];
  const identityLookups: unknown[] = [];
  const identityRow = Object.assign(new UserEntity(), { id: claims.sub, tenantId: claims.tenantId });
  const userRepository = {
    findOne: async (options: unknown) => {
      identityLookups.push(options);
      return identityRow;
    },
    query: async (_sql: string, parameters: unknown[]) => {
      principalQueries.push(parameters);
      return [row];
    }
  };
  const tenantRepository = {
    findOne: async (options: unknown) => {
      assert.deepEqual(options, { where: { tenantId: claims.tenantId, isDeleted: false } });
      return tenant;
    }
  };

  @Global()
  @Module({
    providers: [{
      provide: DataSource,
      useValue: {
        options: { type: "postgres" }, entityMetadatas: [],
        getRepository: (target: unknown) => {
          requestedEntities.push(target);
          if (target === UserEntity) return userRepository;
          assert.strictEqual(target, TenantEntity);
          return tenantRepository;
        }
      }
    }],
    exports: [DataSource]
  })
  class SyntheticIdentityDatabaseModule {}

  @Injectable()
  class IdentityConsumer {
    constructor(readonly identity: IdentityDirectoryService) {}
  }

  @Module({
    imports: [SyntheticIdentityDatabaseModule, IdentityDirectoryModule, TenantStatusModule],
    providers: [
      IdentityConsumer, JwtStrategy,
      { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: "synthetic-test-only-secret" }) }
    ]
  })
  class SyntheticIdentityRoot {}

  const context = await NestFactory.createApplicationContext(SyntheticIdentityRoot, {
    logger: false, abortOnError: false
  });
  try {
    const identity = context.get(IdentityDirectoryService);
    assert.strictEqual(context.get(IdentityConsumer).identity, identity);
    assert.strictEqual(await identity.findByIdForIdentity(claims.sub, claims.tenantId), identityRow);
    assert.deepEqual(identityLookups, [{ where: {
      id: claims.sub, tenantId: claims.tenantId, isDeleted: false, isEnabled: true
    } }]);
    const strategy = context.get(JwtStrategy);
    const principal = await strategy.validate(claims);
    assert.equal(principal.sub, claims.sub);
    assert.equal(principal.tenantId, claims.tenantId);
    assert.equal(principal.parkId, claims.parkId);
    assert.deepEqual(principal.permissions, [SYSTEM_PERMISSIONS.USER_ME]);
    assert.deepEqual(principal.roles, []);
    assert.equal(principal.isSuper, false);
    row.user_auth_version += 1;
    await assert.rejects(strategy.validate(claims), UnauthorizedException);
    row.user_auth_version = claims.authVersion;
    row.user_is_enabled = false;
    await assert.rejects(strategy.validate(claims), UnauthorizedException);
    row.user_is_enabled = true;
    tenant.status = 0;
    await assert.rejects(strategy.validate(claims), UnauthorizedException);
    assert.deepEqual(principalQueries, Array.from({ length: 4 }, () => [claims.sub, claims.tenantId, claims.parkId]));
    assert.deepEqual(new Set(requestedEntities), new Set([UserEntity, TenantEntity]));
    assert.equal(requestedEntities.length, 2);
    const names = [...context.get(ModulesContainer).values()].map(module => module.metatype.name);
    for (const forbidden of [
      "UsersModule", "TenantsModule", "RolesModule", "ParksModule", "OrgsModule",
      "DataScopesModule", "FieldPoliciesModule", "SaaSModulesModule", "PropertyOperationsModule"
    ]) assert.ok(!names.includes(forbidden), `unexpected management module ${forbidden}`);
  } finally {
    await context.close();
  }
});
