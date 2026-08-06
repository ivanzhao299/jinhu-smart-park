import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { ParseUUIDPipe, type ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  METHOD_METADATA,
  PATH_METADATA,
  ROUTE_ARGS_METADATA
} from "@nestjs/common/constants";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY
} from "../../shared/decorators/permissions.decorator";
import {
  PROPERTY_HIGH_RISK_ACTION_KEY
} from "../../shared/decorators/property-high-risk-action.decorator";
import { ModuleGuard } from "../../shared/guards/module.guard";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { HomestayController } from "./homestay.controller";

const exactReads = {
  tasks: SYSTEM_PERMISSIONS.HOMESTAY_TASK_READ,
  guestCandidates: SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
  workOrderCandidates: SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ,
  listStays: SYSTEM_PERMISSIONS.HOMESTAY_STAY_READ,
  getStay: SYSTEM_PERMISSIONS.HOMESTAY_STAY_READ,
  finance: SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_READ,
  getTurnover: SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ
} as const;

test("homestay rate routes preserve read and manage permission boundaries", () => {
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, HomestayController.prototype.rateCalendar),
    [SYSTEM_PERMISSIONS.HOMESTAY_RATE_READ]
  );
  for (const handler of [
    HomestayController.prototype.upsertRate,
    HomestayController.prototype.upsertRateOverride
  ]) {
    assert.deepEqual(
      Reflect.getMetadata(PERMISSIONS_KEY, handler),
      [SYSTEM_PERMISSIONS.HOMESTAY_RATE_MANAGE]
    );
  }
});

test("homestay pure high-risk route requires approval-create while mixed route preserves permissions", () => {
  const expected = {
    cancelBooking: {
      actionId: "homestay.bookings.cancel",
      permissions: [
        SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
        SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_CANCEL,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    registerLedgerEntry: {
      actionId: "homestay.finance.refund-or-waive",
      permissions: [SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ]
    }
  } as const;

  for (const [methodName, contract] of Object.entries(expected)) {
    const handler = HomestayController.prototype[
      methodName as keyof HomestayController
    ];
    const metadata = Reflect.getMetadata(PROPERTY_HIGH_RISK_ACTION_KEY, handler);
    assert.equal(metadata.actionId, contract.actionId);
    assert.deepEqual(
      Reflect.getMetadata(PERMISSIONS_KEY, handler),
      contract.permissions
    );
  }
  assert.deepEqual(
    Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      HomestayController.prototype.registerLedgerEntry
    ),
    [
      SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER,
      SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_WAIVE
    ]
  );
});

test("homestay mixed ledger route keeps the original PermissionGuard lattice", () => {
  const user = {
    sub: "user-1",
    username: "operator",
    tenantId: "tenant-1",
    parkId: "park-1",
    roles: [],
    permissions: [
      SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ,
      SYSTEM_PERMISSIONS.HOMESTAY_FINANCE_REGISTER
    ]
  } satisfies JwtPrincipal;
  const handler = HomestayController.prototype.registerLedgerEntry;
  const context = {
    getHandler: () => handler,
    getClass: () => HomestayController,
    switchToHttp: () => ({ getRequest: () => ({ user }) })
  } as unknown as ExecutionContext;
  assert.equal(new PermissionGuard(new Reflector()).canActivate(context), true);
});

test("A-2.5 homestay GET handlers declare exact permissions and required module dependencies", () => {
  for (const [methodName, permission] of Object.entries(exactReads)) {
    const handler = HomestayController.prototype[
      methodName as keyof HomestayController
    ];
    assert.equal(typeof handler, "function");
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), [permission]);
    assert.deepEqual(
      Reflect.getMetadata(MODULES_KEY, handler),
      ["homestay", "asset"],
      `${methodName} must keep wildcard and super users behind module availability`
    );
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), 0);
  }
  const exactPaths = {
    tasks: "tasks",
    guestCandidates: "guest-candidates",
    workOrderCandidates: "work-order-candidates",
    listStays: "stays",
    getStay: "stays/:stayId",
    finance: "finance",
    getTurnover: "turnovers/:id"
  } as const;
  for (const [methodName, path] of Object.entries(exactPaths)) {
    assert.equal(
      Reflect.getMetadata(
        PATH_METADATA,
        HomestayController.prototype[methodName as keyof HomestayController]
      ),
      path
    );
  }
});

test("A-2.5 candidate handlers do not add unrelated permissions or workorder module gates", () => {
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, HomestayController.prototype.guestCandidates),
    [SYSTEM_PERMISSIONS.HOMESTAY_BOOKING_READ]
  );
  assert.deepEqual(
    Reflect.getMetadata(PERMISSIONS_KEY, HomestayController.prototype.workOrderCandidates),
    [SYSTEM_PERMISSIONS.HOMESTAY_TURNOVER_READ]
  );
  assert.deepEqual(
    Reflect.getMetadata(MODULES_KEY, HomestayController.prototype.workOrderCandidates),
    ["homestay", "asset"]
  );
});

test("every homestay GET UUID path rejects malformed identifiers with HTTP 400", async () => {
  for (const methodName of ["rateCalendar", "getBooking", "getStay", "getTurnover"]) {
    const routeArguments = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      HomestayController,
      methodName
    ) as Record<string, { pipes?: unknown[] }>;
    const uuidPipe = Object.values(routeArguments)
      .flatMap((argument) => argument.pipes ?? [])
      .find((pipe): pipe is ParseUUIDPipe => pipe instanceof ParseUUIDPipe);
    assert.ok(uuidPipe, `${methodName} must declare ParseUUIDPipe`);
    await assert.rejects(
      uuidPipe.transform("not-a-uuid", {
        type: "param",
        metatype: String,
        data: "id"
      }),
      (error: unknown) =>
        typeof error === "object"
        && error !== null
        && "getStatus" in error
        && (error as { getStatus(): number }).getStatus() === 400
    );
  }
});

test("all A-2.5 GETs reject normal, super, and wildcard for missing/disabled/expired modules", async () => {
  const baseUser: JwtPrincipal = {
    sub: "00000000-0000-4000-8000-000000000001",
    username: "operator",
    tenantId: "tenant-1",
    parkId: "park-1",
    roles: [],
    permissions: [SYSTEM_PERMISSIONS.HOMESTAY_TASK_READ]
  };
  const module = (moduleCode: string) => ({
    module_code: moduleCode,
    module_name: moduleCode,
    module_group: "property",
    enabled: true
  });
  const contextFor = (
    handler: HomestayController[keyof HomestayController],
    user: JwtPrincipal
  ) => ({
    getHandler: () => handler,
    getClass: () => HomestayController,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
      getResponse: () => ({}),
      getNext: () => undefined
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as never),
    switchToWs: () => ({} as never),
    getType: () => "http"
  }) as unknown as ExecutionContext;
  const principals: Array<[string, JwtPrincipal]> = [
    ["normal", baseUser],
    ["super", { ...baseUser, isSuper: true }],
    ["wildcard", { ...baseUser, permissions: ["*"] }]
  ];
  const unavailableCases = [
    ["homestay", "missing", [module("asset")]],
    ["homestay", "disabled", [module("asset")]],
    ["homestay", "expired", [module("asset")]],
    ["asset", "missing", [module("homestay")]],
    ["asset", "disabled", [module("homestay")]],
    ["asset", "expired", [module("homestay")]]
  ] as const;

  for (const [methodName] of Object.entries(exactReads)) {
    const handler = HomestayController.prototype[
      methodName as keyof HomestayController
    ];
    for (const [moduleCode, state, enabledModules] of unavailableCases) {
      const guard = new ModuleGuard(
        new Reflector(),
        { listEnabledModulesForTenant: async () => enabledModules } as never
      );
      for (const [principalName, user] of principals) {
        await assert.rejects(
          guard.canActivate(contextFor(handler, user)),
          (error: unknown) =>
            typeof error === "object"
            && error !== null
            && "getStatus" in error
            && (error as { getStatus(): number }).getStatus() === 403,
          `${methodName}/${principalName}/${moduleCode}/${state}`
        );
      }
    }
  }
});
