import assert from "node:assert/strict";
import test from "node:test";
import { ConfigService } from "@nestjs/config";
import { Global, Injectable, Module, type INestApplicationContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { getDataSourceToken } from "@nestjs/typeorm";
import { ClsService } from "nestjs-cls";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { PropertyOperationsService } from "../property-operations/property-operations.service";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { FileBusinessAccessService } from "./file-business-access.service";
import { FILE_PROPERTY_UNIT_ACCESS_PORT, type FilePropertyUnitAccessPort } from "./file-property-unit-access.port";
import { FilesController } from "./files.controller";
import { FilesModule } from "./files.module";
import { FilesService } from "./files.service";
import { HrFilesModule } from "./hr-files.module";
import { IntegratedPropertyUnitAccessAdapter } from "./integrated-property-unit-access.adapter";
import { FileStorageService } from "./storage/file-storage.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

const repository = {};
const dataSource = {
  options: { type: "postgres" },
  entityMetadatas: [],
  manager: {
    getRepository: () => repository,
    query: async () => [],
    transaction: async (callback: (manager: unknown) => unknown) => callback(dataSource.manager)
  },
  getRepository: () => repository,
  query: async () => [],
  transaction: async (callback: (manager: unknown) => unknown) => callback(dataSource.manager)
};

@Global()
@Module({
  providers: [
    { provide: getDataSourceToken(), useValue: dataSource },
    {
      provide: ConfigService,
      useValue: {
        get: (key: string, fallback: unknown) => key === "PARTY_DATA_ENCRYPTION_KEY"
          ? "test-only-party-key-12345678901234567890"
          : fallback
      }
    },
    { provide: ClsService, useValue: { getId: () => null } }
  ],
  exports: [getDataSourceToken(), ConfigService, ClsService]
})
class FilesCompositionTestInfrastructureModule {}

@Injectable()
class DownstreamFilesConsumer {
  constructor(readonly filesService: FilesService) {}
}

@Module({
  imports: [FilesCompositionTestInfrastructureModule, HrFilesModule],
  providers: [DownstreamFilesConsumer]
})
class HrFilesCompositionTestModule {}

@Module({
  imports: [FilesCompositionTestInfrastructureModule, FilesModule],
  providers: [DownstreamFilesConsumer]
})
class IntegratedFilesCompositionTestModule {}

async function applicationContext(rootModule: unknown): Promise<INestApplicationContext> {
  return NestFactory.createApplicationContext(rootModule as never, {
    abortOnError: false,
    logger: ["error"]
  });
}

test("HrFilesModule starts the shared file kernel without property operation providers", async () => {
  const context = await applicationContext(HrFilesCompositionTestModule);
  try {
    assert.ok(context.get(FilesService, { strict: false }));
    assert.ok(context.get(DownstreamFilesConsumer).filesService);
    assert.ok(context.get(FilesController, { strict: false }));
    assert.ok(context.get(FileStorageService, { strict: false }));
    assert.ok(context.get(FileBusinessAccessService, { strict: false }));
    const port = context.get<FilePropertyUnitAccessPort>(FILE_PROPERTY_UNIT_ACCESS_PORT, { strict: false });
    assert.equal(port.compositionMode, "hr_leaf");
    assert.throws(() => context.get(PropertyUnitAccessService, { strict: false }));
    assert.throws(() => context.get(PropertyOperationsService, { strict: false }));
  } finally {
    await context.close();
  }
});

test("integrated FilesModule starts the same kernel and binds the real property adapter", async () => {
  const context = await applicationContext(IntegratedFilesCompositionTestModule);
  try {
    assert.ok(context.get(FilesService, { strict: false }));
    assert.ok(context.get(DownstreamFilesConsumer).filesService);
    assert.ok(context.get(PropertyUnitAccessService, { strict: false }));
    assert.ok(context.get(PropertyOperationsService, { strict: false }));
    const port = context.get<FilePropertyUnitAccessPort>(FILE_PROPERTY_UNIT_ACCESS_PORT, { strict: false });
    assert.ok(port instanceof IntegratedPropertyUnitAccessAdapter);
    assert.equal(port.compositionMode, "integrated");
  } finally {
    await context.close();
  }
});

test("integrated property adapter preserves delegated allow and deny decisions", async () => {
  const calls: string[] = [];
  const delegated = {
    async assertAccess(_scope: TenantParkScope, _actor: JwtPrincipal, unitId: string) {
      calls.push(`assert:${unitId}`);
      if (unitId === "denied") throw new Error("property-denied");
      return { id: unitId };
    },
    async allowedUnitIds() {
      calls.push("allowed");
      return ["unit-1"];
    }
  };
  const adapter = new IntegratedPropertyUnitAccessAdapter(delegated as never);
  await assert.doesNotReject(adapter.assertAccess(scope, actor, "unit-1"));
  await assert.rejects(adapter.assertAccess(scope, actor, "denied"), /property-denied/u);
  assert.deepEqual(await adapter.allowedUnitIds(scope, actor), ["unit-1"]);
  assert.deepEqual(calls, ["assert:unit-1", "assert:denied", "allowed"]);
});
