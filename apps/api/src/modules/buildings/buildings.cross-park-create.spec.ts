import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { ForbiddenException, type CallHandler, type ExecutionContext } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import { lastValueFrom, Observable } from "rxjs";
import { AuditLogInterceptor, type AuditScopeRequest } from "../../shared/interceptors/audit-log.interceptor";
import { BuildingsService } from "./buildings.service";
import { BuildingsController } from "./buildings.controller";
import type { CreateBuildingDto } from "./dto/create-building.dto";
import type { BuildingEntity } from "./entities/building.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

test("building create resolves explicit target park without auth context switching", () => {
  const controller = readFileSync(resolve(__dirname, "buildings.controller.ts"), "utf8");
  const service = readFileSync(resolve(__dirname, "buildings.service.ts"), "utf8");
  const dto = readFileSync(resolve(__dirname, "dto/create-building.dto.ts"), "utf8");
  const queryDto = readFileSync(resolve(__dirname, "dto/building-query.dto.ts"), "utf8");

  assert.match(dto, /parkId\?: string/u);
  assert.match(queryDto, /parkId\?: string/u);
  assert.match(controller, /request\.auditScopeOverride = targetScope/u);
  assert.match(service, /resolveTargetAccess\(scope, actor, query\.parkId, SYSTEM_PERMISSIONS\.BUILDING_READ/u);
  assert.match(service, /resolveTargetAccess\(scope, actor, dto\.parkId, SYSTEM_PERMISSIONS\.BUILDING_CREATE/u);
  assert.match(service, /resolveTargetAccess\(scope, actor, dto\.parkId, SYSTEM_PERMISSIONS\.BUILDING_UPDATE/u);
  assert.match(service, /resolveTargetAccess\(scope, actor, parkId, SYSTEM_PERMISSIONS\.BUILDING_DELETE/u);
  assert.match(service, /usersService\.resolveJwtPrincipal\(targetScope, actor\.sub\)/u);
  assert.match(service, /assertTargetModuleEnabled\(targetScope\)/u);
  assert.match(service, /listEnabledModulesForTenant\(scope\.tenantId, scope\.parkId\)/u);
  assert.match(service, /SYSTEM_PERMISSIONS\.BUILDING_CREATE/u);
  assert.match(service, /SYSTEM_PERMISSIONS\.BUILDING_READ/u);
  assert.match(service, /SYSTEM_PERMISSIONS\.BUILDING_UPDATE/u);
  assert.match(service, /SYSTEM_PERMISSIONS\.BUILDING_DELETE/u);
  assert.match(service, /tenantId: targetScope\.tenantId/u);
  assert.match(service, /parkId: targetScope\.parkId/u);
  assert.equal((controller.match(/request\.auditScopeOverride = targetScope/gu) ?? []).length, 3);
});

test("building create writes to explicit target park when actor has target permission", async () => {
  const targetParkId = "park-new";
  const savedEntities: BuildingEntity[] = [];
  const generatedScopes: TenantParkScope[] = [];
  const service = makeService({
    resolveTargetActor: async (targetScope, actor) => ({
      ...actor,
      parkId: targetScope.parkId,
      permissions: [SYSTEM_PERMISSIONS.BUILDING_CREATE]
    }),
    generateCode: async (scope) => {
      generatedScopes.push(scope);
      return { code: "BLD-AUTO-001" };
    },
    save: async (entity) => {
      savedEntities.push(entity);
      return { ...entity, id: "building-1" };
    }
  });

  const auditScopes: TenantParkScope[] = [];
  const result = await service.create(currentScope(), actor(), createDto({ parkId: targetParkId }), (targetScope) => {
    auditScopes.push(targetScope);
  });

  assert.equal(result.tenantId, "tenant-1");
  assert.equal(result.parkId, targetParkId);
  assert.equal(result.createBy, "user-1");
  assert.deepEqual(generatedScopes, [{ tenantId: "tenant-1", parkId: targetParkId }]);
  assert.deepEqual(auditScopes, [{ tenantId: "tenant-1", parkId: targetParkId }]);
  assert.equal(savedEntities[0]?.parkId, targetParkId);
});

test("building create rejects explicit target park without target create permission", async () => {
  const service = makeService({
    resolveTargetActor: async (targetScope, targetActor) => ({
      ...targetActor,
      parkId: targetScope.parkId,
      permissions: []
    })
  });

  await assert.rejects(
    () => service.create(currentScope(), actor(), createDto({ parkId: "park-denied" })),
    ForbiddenException
  );
});

test("building target access rejects explicit park without asset module entitlement", async () => {
  const service = makeService({
    enabledModules: [],
    resolveTargetActor: async (targetScope, targetActor) => ({
      ...targetActor,
      parkId: targetScope.parkId,
      permissions: [SYSTEM_PERMISSIONS.BUILDING_CREATE]
    })
  });

  await assert.rejects(
    () => service.create(currentScope(), actor(), createDto({ parkId: "park-disabled-asset" })),
    ForbiddenException
  );
});

test("building list reads explicit target park with target read permission", async () => {
  const targetParkId = "park-new";
  const scopedWhere: Array<{ clause: string; params?: Record<string, unknown> }> = [];
  const service = makeService({
    queryRecorder: scopedWhere,
    resolveTargetActor: async (targetScope, targetActor) => ({
      ...targetActor,
      parkId: targetScope.parkId,
      permissions: [SYSTEM_PERMISSIONS.BUILDING_READ]
    })
  });

  const result = await service.list(currentScope(), { page: 1, page_size: 20, parkId: targetParkId }, actor());

  assert.equal(result.total, 0);
  assert.deepEqual(
    scopedWhere.filter((entry) => entry.clause.includes("building.park_id")),
    [{ clause: "building.park_id = :parkId", params: { parkId: targetParkId } }]
  );
});

test("building list rejects explicit target park without target read permission", async () => {
  const service = makeService({
    resolveTargetActor: async (targetScope, targetActor) => ({
      ...targetActor,
      parkId: targetScope.parkId,
      permissions: [SYSTEM_PERMISSIONS.BUILDING_CREATE]
    })
  });

  await assert.rejects(
    () => service.list(currentScope(), { page: 1, page_size: 20, parkId: "park-denied" }, actor()),
    ForbiddenException
  );
});

test("building create propagates explicit target park through controller audit scope", async () => {
  const targetScope = { tenantId: "tenant-1", parkId: "park-new" };
  const recorded: Array<Record<string, unknown>> = [];
  const request = {
    method: "POST",
    user: actor(),
    body: createDto({ parkId: targetScope.parkId }),
    params: {},
    headers: { "x-idempotency-key": "building-create-audit-1" },
    route: { path: "/buildings" },
    path: "/buildings",
    originalUrl: "/api/v1/buildings",
    ip: "127.0.0.1"
  } as unknown as AuditScopeRequest;
  const service = {
    create: async (
      scope: TenantParkScope,
      createActor: JwtPrincipal,
      dto: CreateBuildingDto,
      onTargetScope?: (scope: TenantParkScope) => void
    ) => {
      assert.deepEqual(scope, currentScope());
      assert.equal(createActor.sub, "user-1");
      assert.equal(dto.parkId, targetScope.parkId);
      onTargetScope?.(targetScope);
      return { id: "building-1", tenantId: targetScope.tenantId, parkId: targetScope.parkId };
    }
  };
  const controller = new BuildingsController(service as never);
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => controller.create,
    getClass: () => BuildingsController
  } as unknown as ExecutionContext;
  const interceptor = new AuditLogInterceptor(
    { recordOperation: async (entry: Record<string, unknown>) => { recorded.push(entry); } } as never,
    { getId: () => "request-building-create" } as never,
    { getAllAndOverride: () => ({ module: "楼栋管理", resource: "biz.building", action: "新增", bizType: "biz_building" }) } as never
  );
  const next = {
    handle: () => new Observable((subscriber) => {
      void controller.create(currentScope(), actor(), request.body as CreateBuildingDto, request)
        .then((result) => {
          subscriber.next(result);
          subscriber.complete();
        })
        .catch((error: Error) => subscriber.error(error));
    })
  } as CallHandler;

  await lastValueFrom(interceptor.intercept(context, next));

  assert.deepEqual(request.auditScopeOverride, targetScope);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0]?.tenantId, targetScope.tenantId);
  assert.equal(recorded[0]?.parkId, targetScope.parkId);
  assert.equal(recorded[0]?.userId, "user-1");
  assert.equal(recorded[0]?.success, true);
});

test("building update and delete propagate explicit target park through controller audit scope", async () => {
  const targetScope = { tenantId: "tenant-1", parkId: "park-new" };
  const request = {} as AuditScopeRequest;
  const service = {
    update: async (
      scope: TenantParkScope,
      updateActor: JwtPrincipal,
      id: string,
      dto: { parkId?: string },
      onTargetScope?: (scope: TenantParkScope) => void
    ) => {
      assert.deepEqual(scope, currentScope());
      assert.equal(updateActor.sub, "user-1");
      assert.equal(id, "building-1");
      assert.equal(dto.parkId, targetScope.parkId);
      onTargetScope?.(targetScope);
      return { id, tenantId: targetScope.tenantId, parkId: targetScope.parkId };
    },
    softDelete: async (
      scope: TenantParkScope,
      deleteActor: JwtPrincipal,
      id: string,
      parkId?: string,
      onTargetScope?: (scope: TenantParkScope) => void
    ) => {
      assert.deepEqual(scope, currentScope());
      assert.equal(deleteActor.sub, "user-1");
      assert.equal(id, "building-1");
      assert.equal(parkId, targetScope.parkId);
      onTargetScope?.(targetScope);
      return { id };
    }
  };
  const controller = new BuildingsController(service as never);

  await controller.update(currentScope(), actor(), "building-1", { parkId: targetScope.parkId }, request);
  assert.deepEqual(request.auditScopeOverride, targetScope);

  request.auditScopeOverride = undefined;
  await controller.remove(currentScope(), actor(), "building-1", { parkId: targetScope.parkId }, request);
  assert.deepEqual(request.auditScopeOverride, targetScope);
});

function currentScope(): TenantParkScope {
  return { tenantId: "tenant-1", parkId: "park-current" };
}

function actor(): JwtPrincipal {
  return {
    sub: "user-1",
    username: "admin",
    tenantId: "tenant-1",
    parkId: "park-current",
    roles: [],
    permissions: [SYSTEM_PERMISSIONS.BUILDING_CREATE],
    isSuper: false
  };
}

function createDto(overrides: Partial<CreateBuildingDto> = {}): CreateBuildingDto {
  return {
    buildingName: "新楼栋",
    floorCount: 10,
    buildArea: 1200,
    status: 1,
    sortNo: 1,
    remark: "",
    ...overrides
  };
}

function makeService(overrides: {
  resolveTargetActor?: (targetScope: TenantParkScope, actor: JwtPrincipal) => Promise<JwtPrincipal>;
  generateCode?: (scope: TenantParkScope) => Promise<{ code: string }>;
  save?: (entity: BuildingEntity) => Promise<BuildingEntity>;
  queryRecorder?: Array<{ clause: string; params?: Record<string, unknown> }>;
  enabledModules?: Array<{ module_code: string }>;
} = {}): BuildingsService {
  const queryBuilder = {
    where: (clause: string, params?: Record<string, unknown>) => {
      overrides.queryRecorder?.push({ clause, params });
      return queryBuilder;
    },
    andWhere: (clause: string, params?: Record<string, unknown>) => {
      overrides.queryRecorder?.push({ clause, params });
      return queryBuilder;
    },
    orderBy: () => queryBuilder,
    addOrderBy: () => queryBuilder,
    skip: () => queryBuilder,
    take: () => queryBuilder,
    getExists: async () => false,
    getManyAndCount: async () => [[], 0] as [BuildingEntity[], number]
  };
  const buildingsRepository = {
    create: (entity: BuildingEntity) => entity,
    save: overrides.save ?? (async (entity: BuildingEntity) => entity),
    createQueryBuilder: () => queryBuilder
  };
  const codeRulesService = {
    generateCode: async (_type: string, tenantId: string, parkId: string) => {
      const generated = overrides.generateCode
        ? await overrides.generateCode({ tenantId, parkId })
        : { code: "BLD-AUTO-001" };
      return generated;
    }
  };
  const dataScopeService = {
    buildScopeFilter: async () => ({ unrestricted: true, allowed_ids: [] })
  };
  const usersService = {
    resolveJwtPrincipal: async (targetScope: TenantParkScope, actorId: string) => {
      assert.equal(actorId, "user-1");
      return overrides.resolveTargetActor
        ? overrides.resolveTargetActor(targetScope, actor())
        : { ...actor(), parkId: targetScope.parkId };
    }
  };
  const saasModulesService = {
    listEnabledModulesForTenant: async () => overrides.enabledModules ?? [{ module_code: "asset" }]
  };

  return new BuildingsService(
    buildingsRepository as never,
    {} as never,
    codeRulesService as never,
    dataScopeService as never,
    saasModulesService as never,
    usersService as never
  );
}
