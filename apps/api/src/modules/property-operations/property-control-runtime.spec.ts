import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { METHOD_METADATA, PATH_METADATA } from "@nestjs/common/constants";
import { BadRequestException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY
} from "../../shared/decorators/permissions.decorator";
import {
  PropertyModeTransitionListController,
  PropertyOperationListController,
  PropertyOperationsController
} from "./property-operations.controller";
import { PropertyOccupanciesController } from "./property-occupancies.controller";
import { PropertyOccupanciesService } from "./property-occupancies.service";
import { PropertyOperationsService } from "./property-operations.service";

test("the frozen nine property control routes expose the missing list/detail endpoints", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOperationListController),
    "property/operations"
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOperationListController.prototype.list),
    "/"
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PropertyOperationListController.prototype.list),
    0
  );
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyOccupanciesController.prototype.detail),
    ":id"
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PropertyOccupanciesController.prototype.detail),
    0
  );
});

test("mode transition audit exposes an aggregate scope-safe list route", () => {
  assert.equal(
    Reflect.getMetadata(PATH_METADATA, PropertyModeTransitionListController),
    "property/mode-transitions"
  );
  assert.equal(
    Reflect.getMetadata(METHOD_METADATA, PropertyModeTransitionListController.prototype.list),
    0
  );
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, PropertyModeTransitionListController.prototype.list),
    [
      SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
    ]
  );
});

test("aggregate mode transition audit binds scope, allowed units, approval execution key, and stable pagination", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new PropertyOperationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => ["00000000-0000-4000-8000-000000000001"] } as never,
    {
      query: async (sql: string, parameters: unknown[]) => {
        calls.push({ sql, parameters });
        return [{
          id: "log-1",
          unitId: "00000000-0000-4000-8000-000000000001",
          unitCode: "A-101",
          unitName: "101",
          fromMode: "none",
          toMode: "long_rent",
          decisionStatus: "approved",
          executionStatus: "executed",
          checkSnapshot: {
            active_occupancy_count: 1,
            blocking_reasons: ["存在未结清财务事项"]
          },
          totalCount: 1
        }];
      }
    } as never
  );
  const result = await service.transitionLogsAggregate(
    { tenantId: "tenant-1", parkId: "park-1" },
    {
      sub: "user-1",
      username: "auditor",
      tenantId: "tenant-1",
      parkId: "park-1",
      roles: [],
      permissions: [
        SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
      ]
    },
    {
      page: 2,
      pageSize: 20,
      order: "desc",
      sort: "executionTime",
      keyword: "A-101"
    }
  );

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /log\.approval_execution_key=request\.execution_idempotency_key/u);
  assert.match(calls[0]!.sql, /audit\.unit_id=ANY\(\$3::uuid\[\]\)/u);
  assert.match(calls[0]!.sql, /request\.action_id='property\.mode-transition\.request'/u);
  assert.match(calls[0]!.sql, /COALESCE\(log\.check_snapshot, request\.canonical_payload->'checkSnapshot'\)/u);
  assert.match(calls[0]!.sql, /COALESCE\(log\.source_expected_version, request\.source_expected_version, log\.version\) AS version/u);
  assert.match(calls[0]!.sql, /COALESCE\(log\.source_expected_version, log\.version\) AS version/u);
  assert.match(calls[0]!.sql, /request\.id AS request_id/u);
  assert.match(calls[0]!.sql, /audit\.request_id AS "requestId"/u);
  assert.match(calls[0]!.sql, /audit\.check_snapshot AS "checkSnapshot"/u);
  assert.match(calls[0]!.sql, /count\(\*\) OVER\(\)::int/u);
  assert.deepEqual(calls[0]!.parameters, [
    "tenant-1",
    "park-1",
    ["00000000-0000-4000-8000-000000000001"],
    "%A-101%",
    20,
    20
  ]);
  assert.equal(result.total, 1);
  const first = result.items[0] as Record<string, unknown>;
  assert.equal(first.unitCode, "A-101");
  assert.equal(first.unitName, "101");
  assert.deepEqual(first.checkSnapshot, {
    active_occupancy_count: 1,
    blocking_reasons: ["存在未结清财务事项"]
  });
  assert.equal(result.items[0]?.allowedActions.length, 0);
});

test("aggregate mode transition audit preserves total on an empty page and accepts wildcard principals", async () => {
  const calls: Array<{ sql: string; parameters: unknown[] }> = [];
  const service = new PropertyOperationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => null } as never,
    {
      query: async (sql: string, parameters: unknown[]) => {
        calls.push({ sql, parameters });
        return calls.length === 1 ? [] : [{ total: 7 }];
      }
    } as never
  );
  const result = await service.transitionLogsAggregate(
    { tenantId: "tenant-1", parkId: "park-1" },
    {
      sub: "super-1",
      username: "super",
      tenantId: "tenant-1",
      parkId: "park-1",
      roles: [],
      permissions: ["*"]
    },
    { page: 3, pageSize: 20, order: "desc", sort: "createTime" }
  );

  assert.equal(calls.length, 2);
  assert.match(calls[1]!.sql, /SELECT count\(\*\)::int AS total/u);
  assert.deepEqual(calls[1]!.parameters, ["tenant-1", "park-1"]);
  assert.equal(result.total, 7);
  assert.deepEqual(result.items, []);
});

test("aggregate mode transition audit rejects an inverted time range before querying scope or storage", async () => {
  let scopeQueries = 0;
  let dataQueries = 0;
  const service = new PropertyOperationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { allowedUnitIds: async () => { scopeQueries += 1; return null; } } as never,
    { query: async () => { dataQueries += 1; return []; } } as never
  );

  await assert.rejects(
    service.transitionLogsAggregate(
      { tenantId: "tenant-1", parkId: "park-1" },
      {
        sub: "user-1", username: "auditor", tenantId: "tenant-1", parkId: "park-1", roles: [],
        permissions: [SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE, SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ]
      },
      {
        page: 1, pageSize: 20, order: "desc", sort: "createTime",
        startFrom: "2026-08-12T10:00:00.000Z", endTo: "2026-08-12T09:00:00.000Z"
      }
    ),
    BadRequestException
  );
  assert.equal(scopeQueries, 0);
  assert.equal(dataQueries, 0);
});

test("configure rejects a stale version before mutating the unit or configuration", async () => {
  let unitSaveCalls = 0;
  let configSaveCalls = 0;
  const unit = {
    id: "unit-1",
    tenantId: "tenant-1",
    parkId: "park-1",
    assetUnitId: null,
    updateBy: null
  };
  const config = {
    id: "config-1",
    unitId: "unit-1",
    version: 2,
    operatingMode: "long_rent",
    operatingStatus: "enabled"
  };
  const manager = {
    getRepository: (entity: { name: string }) => entity.name === "UnitEntity"
      ? {
        findOne: async () => unit,
        save: async () => { unitSaveCalls += 1; }
      }
      : {
        findOne: async () => config,
        save: async () => { configSaveCalls += 1; }
      }
  };
  const service = new PropertyOperationsService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => unit } as never,
    { transaction: async (work: (value: typeof manager) => unknown) => work(manager) } as never
  );

  await assert.rejects(
    service.configure(
      { tenantId: "tenant-1", parkId: "park-1" },
      {
        sub: "operator-1",
        username: "operator",
        tenantId: "tenant-1",
        parkId: "park-1",
        roles: [],
        permissions: [SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE]
      },
      "unit-1",
      { version: 1, operating_status: "enabled" }
    ),
    /Property operation configuration version has changed/u
  );
  assert.equal(unitSaveCalls, 0);
  assert.equal(configSaveCalls, 0);
});

test("configure clears an asset mapping only when null is explicitly submitted", async () => {
  for (const [dto, expected, expectedSaves] of [
    [{ version: 2, operating_status: "enabled" }, "asset-1", 0],
    [{ version: 2, operating_status: "enabled", asset_unit_id: null }, null, 1]
  ] as const) {
    let unitSaveCalls = 0;
    const unit = { id: "unit-1", tenantId: "tenant-1", parkId: "park-1", assetUnitId: "asset-1", updateBy: null };
    const config = { id: "config-1", unitId: "unit-1", version: 2, operatingMode: "long_rent", operatingStatus: "enabled", suspendReason: null, updateBy: null, remark: null };
    const manager = {
      getRepository: (entity: { name: string }) => entity.name === "UnitEntity"
        ? { findOne: async () => unit, save: async () => { unitSaveCalls += 1; return unit; } }
        : { findOne: async () => config, save: async () => config }
    };
    const service = new PropertyOperationsService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { assertAccess: async () => unit } as never,
      { transaction: async (work: (value: typeof manager) => unknown) => work(manager) } as never
    );

    await service.configure(
      { tenantId: "tenant-1", parkId: "park-1" },
      { sub: "operator-1", username: "operator", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions: [SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE] },
      "unit-1",
      dto
    );
    assert.equal(unit.assetUnitId, expected);
    assert.equal(unitSaveCalls, expectedSaves);
  }
});

test("configure preserves an omitted remark and clears an explicit null remark", async () => {
  for (const [dto, expected] of [
    [{ version: 2, operating_status: "enabled" }, "既有备注"],
    [{ version: 2, operating_status: "enabled", remark: null }, null]
  ] as const) {
    const unit = { id: "unit-1", tenantId: "tenant-1", parkId: "park-1", assetUnitId: null };
    const config = { id: "config-1", unitId: "unit-1", version: 2, operatingStatus: "enabled", remark: "既有备注" as string | null };
    const manager = {
      getRepository: (entity: { name: string }) => entity.name === "UnitEntity"
        ? { findOne: async () => unit, save: async () => unit }
        : { findOne: async () => config, save: async () => config }
    };
    const service = new PropertyOperationsService(
      {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
      { assertAccess: async () => unit } as never,
      { transaction: async (work: (value: typeof manager) => unknown) => work(manager) } as never
    );

    await service.configure(
      { tenantId: "tenant-1", parkId: "park-1" },
      { sub: "operator-1", username: "operator", tenantId: "tenant-1", parkId: "park-1", roles: [], permissions: [SYSTEM_PERMISSIONS.PROPERTY_OPERATION_UPDATE] },
      "unit-1",
      dto
    );
    assert.equal(config.remark, expected);
  }
});

test("control reads combine exact page and action permissions", () => {
  assert.deepEqual(
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      PropertyOperationListController.prototype.list
    ),
    [
      SYSTEM_PERMISSIONS.PROPERTY_OPERATIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_OPERATION_READ
    ]
  );
  assert.deepEqual(
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      PropertyOperationsController.prototype.transitionLogs
    ),
    [
      SYSTEM_PERMISSIONS.PROPERTY_MODE_TRANSITIONS_PAGE,
      SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_READ
    ]
  );
  for (const method of ["list", "detail", "checkAvailability"] as const) {
    assert.deepEqual(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        PropertyOccupanciesController.prototype[method]
      ),
      [
        SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCIES_PAGE,
        SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_READ
      ]
    );
  }
});

test("occupancy release exposes the same runtime any-permission alternatives as the manifest", () => {
  assert.deepEqual(
    Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      PropertyOccupanciesController.prototype.release
    ),
    [
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_RELEASE,
      SYSTEM_PERMISSIONS.PROPERTY_OCCUPANCY_FORCE_RELEASE
    ]
  );
});

test("availability is a read-only POST without an idempotency interceptor or audit decorator", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "property-occupancies.controller.ts"),
    "utf8"
  );
  const start = source.indexOf('@Post("availability")');
  const end = source.indexOf("@Get(\":id\")", start);
  const block = source.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(block, /IdempotencyInterceptor/);
  assert.doesNotMatch(block, /AuditLog/);
});

test("control DTOs and projections use camelCase and stable pagination", () => {
  const dto = fs.readFileSync(
    path.join(__dirname, "dto/property-control.dto.ts"),
    "utf8"
  );
  const occupancyDto = fs.readFileSync(
    path.join(__dirname, "dto/property-occupancy.dto.ts"),
    "utf8"
  );
  const service = fs.readFileSync(
    path.join(__dirname, "property-occupancies.service.ts"),
    "utf8"
  );
  const operationService = fs.readFileSync(
    path.join(__dirname, "property-operations.service.ts"),
    "utf8"
  );
  for (const field of [
    "pageSize",
    "buildingId",
    "configuredMode",
    "operationStatus",
    "blockerCode",
    "unitId",
    "keyword",
    "fromMode",
    "toMode",
    "startFrom",
    "endTo",
    "decisionStatus",
    "executionStatus"
  ]) {
    assert.match(dto, new RegExp(`\\b${field}\\b`));
  }
  for (const field of [
    "unitId",
    "sourceDomain",
    "sourceType",
    "startFrom",
    "endTo",
    "pageSize"
  ]) {
    assert.match(occupancyDto, new RegExp(`\\b${field}\\b`));
  }
  assert.match(service, /allowedActions/);
  assert.match(service, /addOrderBy\("occupancy\.id", "ASC"\)/);
  assert.match(dto, /class PropertyModeTransitionUnitListQueryDto extends PropertyControlPageQueryDto/);
  assert.match(dto, /class PropertyModeTransitionListQueryDto extends PropertyControlPageQueryDto/);
  assert.match(operationService, /canRequestTransition: allowedActions\.includes\("property\.mode-transition\.request"\)/);
  assert.doesNotMatch(operationService, /canRequestTransition: blockers\.length === 0/);
  assert.match(operationService, /\.leftJoin\("unit\.building", "building"\)/);
  assert.match(operationService, /AssetUnitEntity,\s*"assetUnit"/);
  for (const projection of [
    '"buildingCode"',
    '"buildingName"',
    '"assetUnitCode"',
    '"assetUnitName"'
  ]) {
    assert.match(operationService, new RegExp(projection));
  }
  for (const financialSource of [
    "rel_leasing_contract_unit relation",
    "biz_housing_receivable receivable",
    "biz_homestay_ledger_entry entry"
  ]) {
    assert.match(operationService, new RegExp(financialSource));
  }
  const operationsBlocker = operationService.slice(
    operationService.lastIndexOf('"operations-blocker"'),
    operationService.lastIndexOf('"checkout-pending"')
  );
  assert.match(operationsBlocker, /biz_homestay_turnover_task/);
  assert.match(operationsBlocker, /biz_property_occupancy/);
  assert.match(operationsBlocker, /source_domain IN \('maintenance','operations'\)/);
  assert.match(operationsBlocker, /hold_expires_at IS NULL OR occupancy\.hold_expires_at>now\(\)/);
  assert.match(operationService, /source_domain IN \('commercial_leasing','housing_rental','apartment'\)/);
  assert.match(operationService, /private async buildTransitionSnapshots/);
  assert.match(operationService, /unnest\(\$3::uuid\[\], \$4::text\[\]\)/);
  assert.match(operationService, /projectOperation\(scope, actor, row, snapshots\.get/);
  assert.match(operationService, /projectedSnapshot \?\? await this\.buildTransitionSnapshot/);
  assert.match(operationService, /relation\.end_date \+ interval '1 day'/);
});

test("source identifiers and deep links are emitted only by a server allowlist", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "property-occupancies.service.ts"),
    "utf8"
  );
  assert.match(service, /private projectSource/);
  assert.match(service, /permissions\.every/);
  assert.match(service, /encodeURIComponent\(id\)/);
  assert.match(service, /return \{\};/);
  assert.match(service, /actor\.isSuper === true \|\| actor\.permissions\.includes\("\*"\)/);
  assert.match(service, /sourceDomain === "maintenance" \|\| sourceDomain === "operations"/);
  assert.match(service, /return \{ sourceId \}/);
});

test("occupancy source projection honors super and wildcard grants without bypassing the domain allowlist", () => {
  const service = new PropertyOccupanciesService(
    {} as never, {} as never, {} as never, {} as never, {} as never, {} as never
  ) as unknown as {
    projectSource: (
      actor: { permissions: string[]; isSuper?: boolean },
      sourceDomain: string,
      sourceId: string
    ) => { sourceId?: string; deepLink?: string };
  };

  for (const actor of [{ permissions: ["*"] }, { permissions: [], isSuper: true }]) {
    assert.deepEqual(service.projectSource(actor, "housing_rental", "lease-1"), {
      sourceId: "lease-1",
      deepLink: "/housing/leases/lease-1"
    });
  }
  assert.deepEqual(service.projectSource({ permissions: ["*"] }, "maintenance", "lock-1"), {
    sourceId: "lock-1"
  });
  assert.deepEqual(service.projectSource({ permissions: ["*"] }, "apartment", "room-1"), {
    sourceId: "room-1",
    deepLink: "/apartments/rooms"
  });
  assert.deepEqual(service.projectSource({
    permissions: ["apartment:rooms", "apartment:read"]
  }, "apartment", "room-2"), {
    sourceId: "room-2",
    deepLink: "/apartments/rooms"
  });
  assert.deepEqual(service.projectSource({ permissions: ["apartment:read"] }, "apartment", "room-3"), {});
  assert.deepEqual(service.projectSource({ permissions: ["*"] }, "commercial_leasing", "contract-1"), {});
});

test("occupancy reads join units with the full tenant and park scope instead of relation metadata", () => {
  const service = fs.readFileSync(
    path.join(__dirname, "property-occupancies.service.ts"),
    "utf8"
  );
  assert.doesNotMatch(service, /leftJoinAndSelect\("occupancy\.unit"/u);
  assert.doesNotMatch(service, /relations:\s*\{\s*unit:\s*true\s*\}/u);
  assert.match(service, /unit\.tenant_id = occupancy\.tenant_id/u);
  assert.match(service, /unit\.park_id = occupancy\.park_id/u);
  assert.match(service, /startAt: "occupancy\.startAt"/u);
  assert.match(service, /endAt: "occupancy\.endAt"/u);
  assert.match(service, /updateTime: "occupancy\.updateTime"/u);
  assert.doesNotMatch(service, /orderBy\([^\n]*occupancy\.start_at/u);
});
