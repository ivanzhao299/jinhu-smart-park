import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { Global, Module, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ModulesContainer, NestFactory } from "@nestjs/core";
import { DataSource, type Repository } from "typeorm";
import { AuthModule } from "../auth/auth.module";
import { AuthService } from "../auth/auth.service";
import { JwtStrategy } from "../auth/strategies/jwt.strategy";
import { IdentityDirectoryService } from "../users/identity-directory.service";
import { IdentityDirectoryModule } from "../users/identity-directory.module";
import { TenantEntity } from "./entities/tenant.entity";
import { TenantStatusModule } from "./tenant-status.module";
import { TenantStatusService } from "./tenant-status.service";
import { TenantsModule } from "./tenants.module";
import { TenantsService } from "./tenants.service";

function tenant(status = 1, expireTime: Date | null = null): TenantEntity {
  return Object.assign(new TenantEntity(), {
    tenantId: "synthetic-tenant", status, expireTime, isDeleted: false
  });
}

function fixture(row: TenantEntity | null) {
  const calls: unknown[] = [];
  const repository = {
    findOne: async (options: unknown) => {
      calls.push(options);
      return row;
    }
  } as Repository<TenantEntity>;
  return { service: new TenantStatusService(repository), repository, calls };
}

test("tenant status reads only the requested live tenant and returns its exact entity", async () => {
  const row = tenant();
  const { service, calls } = fixture(row);
  assert.strictEqual(await service.assertTenantActive(row.tenantId), row);
  assert.deepEqual(calls, [{ where: { tenantId: row.tenantId, isDeleted: false } }]);
});

test("tenant status preserves missing, disabled, expired and boundary rejection", async (t) => {
  t.mock.method(Date, "now", () => 1_800_000_000_000);
  const cases = [
    { row: null, message: "账号所属租户不存在，请联系管理员" },
    { row: tenant(0), message: "账号所属租户已停用，请联系管理员" },
    { row: tenant(2), message: "账号所属租户已过期，请联系管理员续费" },
    { row: tenant(1, new Date(Date.now() - 1)), message: "账号所属租户已过期，请联系管理员续费" },
    { row: tenant(1, new Date(Date.now())), message: "账号所属租户已过期，请联系管理员续费" },
    { row: tenant(0, new Date(Date.now() - 1)), message: "账号所属租户已停用，请联系管理员" }
  ];
  for (const { row, message } of cases) {
    await assert.rejects(fixture(row).service.assertTenantActive("synthetic-tenant"),
      (error: unknown) => error instanceof UnauthorizedException
        && error.getStatus() === 401 && error.message === message);
  }
  const future = tenant(1, new Date(Date.now() + 1));
  assert.strictEqual(await fixture(future).service.assertTenantActive(future.tenantId), future);
});

test("repository failure remains a failure and the management facade delegates to the same gate", async () => {
  const databaseError = new Error("synthetic-repository-failure");
  const { service, repository } = fixture(tenant());
  repository.findOne = async () => { throw databaseError; };
  const facade = Object.create(TenantsService.prototype) as TenantsService;
  Object.assign(facade, { tenantStatusService: service });
  await assert.rejects(service.assertTenantActive("synthetic-tenant"), error => error === databaseError);
  await assert.rejects(facade.assertTenantActive("synthetic-tenant"), error => error === databaseError);
});

test("Auth and JWT inject the leaf service while the tenant management facade keeps it shared", () => {
  assert.strictEqual(Reflect.getMetadata("design:paramtypes", AuthService)[0], IdentityDirectoryService);
  assert.strictEqual(Reflect.getMetadata("design:paramtypes", JwtStrategy)[2], IdentityDirectoryService);
  assert.strictEqual(Reflect.getMetadata("design:paramtypes", AuthService)[4], TenantStatusService);
  assert.strictEqual(Reflect.getMetadata("design:paramtypes", JwtStrategy)[1], TenantStatusService);
  assert.strictEqual(Reflect.getMetadata("design:paramtypes", TenantsService)[4], TenantStatusService);
  const authImports: unknown[] = Reflect.getMetadata("imports", AuthModule);
  assert.ok(authImports.includes(TenantStatusModule));
  assert.ok(authImports.includes(IdentityDirectoryModule));
  assert.ok(!authImports.includes(TenantsModule));
  assert.ok(Reflect.getMetadata("imports", TenantsModule).includes(TenantStatusModule));
});

test("real leaf module and JWT provider start without tenant management or park business modules", async () => {
  const row = tenant();
  const { repository, calls } = fixture(row);
  const requestedEntities: unknown[] = [];
  const claims = { sub: "synthetic-user", username: "synthetic", tenantId: row.tenantId, parkId: "synthetic-park", authVersion: 1 };
  const principal = { ...claims, roles: [], permissions: [], isSuper: false };

  @Global()
  @Module({
    providers: [{
      provide: DataSource,
      useValue: {
        entityMetadatas: [], options: { type: "postgres" },
        getRepository: (target: unknown) => {
          requestedEntities.push(target);
          assert.strictEqual(target, TenantEntity);
          return repository;
        }
      }
    }],
    exports: [DataSource]
  })
  class SyntheticDatabaseModule {}

  @Module({
    imports: [SyntheticDatabaseModule, TenantStatusModule],
    providers: [
      JwtStrategy,
      { provide: ConfigService, useValue: new ConfigService({ JWT_SECRET: "synthetic-test-only-secret" }) },
      { provide: IdentityDirectoryService, useValue: { resolveJwtPrincipal: async () => principal } }
    ]
  })
  class SyntheticJwtRoot {}

  const context = await NestFactory.createApplicationContext(SyntheticJwtRoot, { logger: false, abortOnError: false });
  try {
    const gate = context.get(TenantStatusService);
    assert.strictEqual(await gate.assertTenantActive(row.tenantId), row);
    const strategy = context.get(JwtStrategy);
    assert.strictEqual(await strategy.validate(claims), principal);
    row.status = 0;
    await assert.rejects(strategy.validate(claims), UnauthorizedException);
    const names = [...context.get(ModulesContainer).values()].map(module => module.metatype.name);
    for (const forbidden of ["TenantsModule", "FilesModule", "PropertyOperationsModule", "ParksModule", "AssetsModule", "UsersModule"]) {
      assert.ok(!names.includes(forbidden), `unexpected module ${forbidden}`);
    }
    assert.deepEqual(requestedEntities, [TenantEntity]);
    assert.equal(calls.length, 3);
  } finally {
    await context.close();
  }
});
