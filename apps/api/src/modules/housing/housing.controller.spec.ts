import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import {
  ParseUUIDPipe,
  type ExecutionContext
} from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { Reflector } from "@nestjs/core";
import { SYSTEM_PERMISSIONS } from "@jinhu/shared";
import { MODULES_KEY } from "../../shared/decorators/modules.decorator";
import {
  ANY_PERMISSIONS_KEY,
  PERMISSIONS_KEY
} from "../../shared/decorators/permissions.decorator";
import {
  PROPERTY_HIGH_RISK_ACTION_KEY,
  type PropertyHighRiskActionMetadata
} from "../../shared/decorators/property-high-risk-action.decorator";
import { ModuleGuard } from "../../shared/guards/module.guard";
import { PermissionGuard } from "../../shared/guards/permission.guard";
import { PropertyHighRiskActionGuard } from "../../shared/guards/property-high-risk-action.guard";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import { HousingController } from "./housing.controller";

const exactReads = {
  listTasks: SYSTEM_PERMISSIONS.HOUSING_TASK_READ,
  listHandovers: SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
  getHandover: SYSTEM_PERMISSIONS.HOUSING_HANDOVER_READ,
  listBilling: SYSTEM_PERMISSIONS.HOUSING_BILLING_READ,
  listFinance: SYSTEM_PERMISSIONS.HOUSING_FINANCE_READ,
  listRepairs: SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ,
  getRepair: SYSTEM_PERMISSIONS.HOUSING_REPAIR_READ
} as const;

const paths = {
  listTasks: "tasks",
  listHandovers: "handovers",
  getHandover: "handovers/:id",
  listBilling: "billing",
  listFinance: "finance",
  listRepairs: "repairs",
  getRepair: "repairs/:id"
} as const;

test("housing pure high-risk routes require approval-create while mixed routes preserve permissions", () => {
  const expected = {
    approveLease: {
      actionId: "housing.leases.approve",
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_LEASE_APPROVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    voidLease: {
      actionId: "housing.leases.void",
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_LEASE_CREATE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    registerLedger: {
      actionId: "housing.finance.refund-waive-or-deposit-refund",
      permissions: undefined
    },
    completeHandover: {
      actionId: "housing.handovers.complete-move-out-financial",
      permissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE]
    },
    checkoutLease: {
      actionId: "housing.leases.checkout",
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_LEASE_CHECKOUT,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    purchaseAction: {
      actionId: "housing.purchases.lifecycle",
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_PURCHASE_MANAGE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    transferPurchase: {
      actionId: "housing.purchases.transfer",
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_PURCHASE_TRANSFER,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    }
  } as const;

  for (const [methodName, contract] of Object.entries(expected)) {
    const handler = HousingController.prototype[
      methodName as keyof HousingController
    ];
    const metadata = Reflect.getMetadata(
      PROPERTY_HIGH_RISK_ACTION_KEY,
      handler
    ) as PropertyHighRiskActionMetadata;
    assert.equal(metadata.actionId, contract.actionId);
    assert.deepEqual(
      Reflect.getMetadata(PERMISSIONS_KEY, handler),
      contract.permissions,
      `${methodName} must keep the exact required-permission metadata`
    );
  }
  assert.deepEqual(
    Reflect.getMetadata(
      ANY_PERMISSIONS_KEY,
      HousingController.prototype.registerLedger
    ),
    [
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
      SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE
    ]
  );
});

test("housing mixed routes retain their original PermissionGuard requirements", () => {
  const cases = [
    [
      HousingController.prototype.registerLedger,
      [SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER]
    ],
    [
      HousingController.prototype.completeHandover,
      [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE]
    ]
  ] as const;
  for (const [handler, permissions] of cases) {
    const user = { ...baseUser, permissions: [...permissions] };
    assert.equal(
      new PermissionGuard(new Reflector()).canActivate(
        contextFor(handler, user)
      ),
      true
    );
  }
});

const baseUser: JwtPrincipal = {
  sub: "00000000-0000-4000-8000-000000000001",
  username: "operator",
  tenantId: "tenant-1",
  parkId: "park-1",
  roles: [],
  permissions: [SYSTEM_PERMISSIONS.HOUSING_TASK_READ]
};

function contextFor(
  handler: HousingController[keyof HousingController],
  user: JwtPrincipal,
  body: unknown = undefined
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => HousingController,
    switchToHttp: () => ({
      getRequest: () => ({ user, body }),
      getResponse: () => ({}),
      getNext: () => undefined
    }),
    getArgs: () => [],
    getArgByIndex: () => undefined,
    switchToRpc: () => ({} as never),
    switchToWs: () => ({} as never),
    getType: () => "http"
  } as unknown as ExecutionContext;
}

test("all housing A-2.5 GET handlers expose exact literal metadata", () => {
  for (const [name, permission] of Object.entries(exactReads)) {
    const handler = HousingController.prototype[name as keyof HousingController];
    assert.equal(typeof handler, "function");
    assert.deepEqual(Reflect.getMetadata(PERMISSIONS_KEY, handler), [permission]);
    assert.deepEqual(Reflect.getMetadata(MODULES_KEY, handler), ["housing_rental", "asset"]);
    assert.equal(Reflect.getMetadata(METHOD_METADATA, handler), 0);
    assert.equal(Reflect.getMetadata(PATH_METADATA, handler), paths[name as keyof typeof paths]);
  }
});

test("every housing route requires both the housing and asset modules", () => {
  const controllerModules = Reflect.getMetadata(MODULES_KEY, HousingController) as string[];
  assert.deepEqual(controllerModules, ["housing_rental", "asset"]);
  for (const methodName of Object.getOwnPropertyNames(HousingController.prototype)) {
    if (methodName === "constructor") continue;
    const handler = HousingController.prototype[methodName as keyof HousingController];
    if (typeof handler !== "function" || Reflect.getMetadata(METHOD_METADATA, handler) === undefined) continue;
    const modules = (Reflect.getMetadata(MODULES_KEY, handler) as string[] | undefined) ?? controllerModules;
    assert.equal(modules.includes("housing_rental"), true, `${methodName} requires housing_rental`);
    assert.equal(modules.includes("asset"), true, `${methodName} requires asset`);
  }
});

test("all housing UUID route params reject malformed identifiers with HTTP 400", async () => {
  for (const methodName of [
    "getHandover",
    "getRepair",
    "listEnergyMeterCandidates",
    "getLease",
    "submitLease",
    "approveLease",
    "signLease",
    "activateLease",
    "voidLease",
    "addOccupant",
    "saveChargePlan",
    "generateBills",
    "registerLedger",
    "completeHandover",
    "createRepair",
    "checkoutLease",
    "getPurchase",
    "purchaseAction",
    "transferPurchase"
  ]) {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      HousingController,
      methodName
    ) as Record<string, { pipes?: unknown[] }>;
    const pipe = Object.values(args)
      .flatMap((argument) => argument.pipes ?? [])
      .find((candidate): candidate is ParseUUIDPipe => candidate instanceof ParseUUIDPipe);
    assert.ok(pipe, `${methodName} must use ParseUUIDPipe`);
    await assert.rejects(
      pipe.transform("not-a-uuid", { type: "param", metatype: String, data: "id" }),
      (error: unknown) =>
        typeof error === "object" && error !== null && "getStatus" in error
        && (error as { getStatus(): number }).getStatus() === 400
    );
  }
});

test("normal, super, and wildcard cannot bypass either housing module dependency", async () => {
  const assignment = (
    moduleCode: string,
    state: "enabled" | "disabled" | "expired"
  ) => ({
    isDeleted: false,
    enabled: state !== "disabled",
    status: state === "disabled" ? "disabled" : "enabled",
    expireTime: state === "expired"
      ? new Date("2020-01-01T00:00:00Z")
      : new Date("2099-01-01T00:00:00Z"),
    module: {
      moduleCode,
      moduleName: moduleCode,
      moduleGroup: "property",
      routePrefix: `/${moduleCode}`,
      icon: moduleCode,
      isDeleted: false,
      status: 1,
      sortNo: 1
    }
  });
  const enabledModules = async (assignments: ReturnType<typeof assignment>[]) => {
    const conditions: string[] = [];
    const builder = {
      innerJoinAndSelect: () => builder,
      where: (condition: string) => {
        conditions.push(condition);
        return builder;
      },
      andWhere: (condition: string) => {
        conditions.push(condition);
        return builder;
      },
      orderBy: () => builder,
      addOrderBy: () => builder,
      getMany: async () => assignments.filter((item) =>
        !item.isDeleted
        && item.enabled
        && item.status === "enabled"
        && !item.module.isDeleted
        && item.module.status === 1
        && (item.expireTime === null || item.expireTime > new Date())
      )
    };
    const service = new SaaSModulesService(
      {} as never,
      {} as never,
      {} as never,
      { createQueryBuilder: () => builder } as never
    );
    const result = await service.listEnabledModulesForTenant("tenant-1", "park-1");
    assert.ok(conditions.includes("tenantModule.enabled = true"));
    assert.ok(conditions.includes("tenantModule.status = :status"));
    assert.ok(conditions.includes("(tenantModule.expireTime IS NULL OR tenantModule.expireTime > now())"));
    return result;
  };
  const principals: JwtPrincipal[] = [
    baseUser,
    { ...baseUser, isSuper: true },
    { ...baseUser, permissions: ["*"] }
  ];
  const unavailable = [
    ["housing_rental", "missing", [assignment("asset", "enabled")]],
    ["housing_rental", "disabled", [
      assignment("asset", "enabled"), assignment("housing_rental", "disabled")
    ]],
    ["housing_rental", "expired", [
      assignment("asset", "enabled"), assignment("housing_rental", "expired")
    ]],
    ["asset", "missing", [assignment("housing_rental", "enabled")]],
    ["asset", "disabled", [
      assignment("housing_rental", "enabled"), assignment("asset", "disabled")
    ]],
    ["asset", "expired", [
      assignment("housing_rental", "enabled"), assignment("asset", "expired")
    ]]
  ] as const;
  let serviceCalls = 0;
  const controller = new HousingController({} as never, new Proxy({}, {
    get: () => () => { serviceCalls += 1; }
  }) as never);

  for (const methodName of Object.keys(exactReads) as Array<keyof typeof exactReads>) {
    const handler = HousingController.prototype[methodName];
    for (const [moduleCode, state, assignments] of unavailable) {
      const guard = new ModuleGuard(
        new Reflector(),
        { listEnabledModulesForTenant: async () => enabledModules([...assignments]) } as never
      );
      for (const principal of principals) {
        await assert.rejects(
          guard.canActivate(contextFor(handler, principal)),
          (error: unknown) =>
            typeof error === "object" && error !== null && "getStatus" in error
            && (error as { getStatus(): number }).getStatus() === 403,
          `${methodName}/${moduleCode}/${state}`
        );
      }
    }
  }
  assert.equal(serviceCalls, 0);
  assert.ok(controller);
});

test("actual handover controller metadata delegates financial move-out to the strict Track-B service", async () => {
  const handler = HousingController.prototype.completeHandover;
  const metadata = Reflect.getMetadata(
    PROPERTY_HIGH_RISK_ACTION_KEY,
    handler
  ) as PropertyHighRiskActionMetadata;
  assert.deepEqual(metadata, {
    actionId: "housing.handovers.complete-move-out-financial",
    variantPredicate: {
      allEquals: { handover_type: "move_out" },
      anyNonZero: ["damage_amount", "unsettled_amount", "deposit_deduction_amount"]
    }
  });
  let mutationCalls = 0;
  const service = {
    completeHandover: async () => {
      mutationCalls += 1;
      return { ok: true };
    }
  };
  const controller = new HousingController(service as never, {} as never);
  const principals = [
    baseUser,
    { ...baseUser, isSuper: true },
    { ...baseUser, permissions: ["*"] }
  ];
  const highRiskBodies = [
    { handover_type: "move_out", damage_amount: "0.01" },
    { handover_type: "move_out", unsettled_amount: "1" },
    { handover_type: "move_out", deposit_deduction_amount: "1.00" }
  ];
  for (const principal of principals) {
    for (const body of highRiskBodies) {
      const guard = new PropertyHighRiskActionGuard(
        new Reflector(),
        { get: () => "true" } as never
      );
      assert.equal(guard.canActivate(contextFor(handler, principal, body)), true);
    }
  }
  assert.equal(mutationCalls, 0);

  for (const body of [
    { handover_type: "move_in", damage_amount: "0" },
    {
      handover_type: "move_out",
      damage_amount: "0.00",
      unsettled_amount: 0,
      deposit_deduction_amount: "-0.0"
    }
  ]) {
    const guard = new PropertyHighRiskActionGuard(
      new Reflector(),
      { get: () => "true" } as never
    );
    assert.equal(guard.canActivate(contextFor(handler, baseUser, body)), true);
    await controller.completeHandover(
      { tenantId: "tenant-1", parkId: "park-1" },
      baseUser,
      "00000000-0000-4000-8000-000000000020",
      body as never
    );
  }
  assert.equal(mutationCalls, 2);
});
