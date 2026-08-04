import assert from "node:assert/strict";
import test from "node:test";
import {
  SYSTEM_PERMISSIONS,
  type TenantParkScope
} from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { ConflictException, ForbiddenException } from "@nestjs/common";
import {
  PROPERTY_APPROVAL_REQUIRED_MESSAGE,
  PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE
} from "../../shared/property-workbench/property-high-risk-stopship";
import { HousingService } from "./housing.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("direct housing pure high-risk actions stop before a transaction for every principal class", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      transaction: async () => {
        transactionCalls += 1;
      }
    } as never,
    {} as never
  );
  const principals = [
    actor,
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];

  for (const principal of principals) {
    const runs = [
      () => service.approveLease(scope, principal, "lease-1", {}),
      () => service.voidLease(scope, principal, "lease-1", "reason"),
      () => service.checkoutLease(scope, principal, "lease-1", "reason"),
      () => service.purchaseAction(scope, principal, "purchase-1", {
        action: "approve",
        reason: "reason"
      }),
      () => service.transferPurchase(scope, principal, "purchase-1", {} as never)
    ];
    for (const run of runs) {
      await assert.rejects(run, (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
        return true;
      });
    }
  }
  assert.equal(transactionCalls, 0);
});

test("housing mixed high-risk variants enforce exact permission intersections before stop-ship", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { transaction: async () => { transactionCalls += 1; } } as never,
    {} as never
  );
  const financeDenied = [
    actor,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE] },
    { ...actor, permissions: [SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE] },
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    }
  ];
  const financeAllowed = [
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_FINANCE_WAIVE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];
  for (const entryType of ["refund", "waiver", "deposit_refund"] as const) {
    for (const principal of financeDenied) {
      await assert.rejects(
        service.registerLedger(scope, principal, "lease-1", {
          entry_type: entryType
        } as never),
        (error: unknown) => {
          assert.ok(error instanceof ForbiddenException);
          assert.equal(error.message, PROPERTY_HIGH_RISK_PERMISSION_REQUIRED_MESSAGE);
          return true;
        }
      );
    }
    for (const principal of financeAllowed) {
      await assert.rejects(
        service.registerLedger(scope, principal, "lease-1", {
          entry_type: entryType
        } as never),
        (error: unknown) => {
          assert.ok(error instanceof ConflictException);
          assert.equal(error.message, PROPERTY_APPROVAL_REQUIRED_MESSAGE);
          return true;
        }
      );
    }
  }

  const handoverDenied = [
    actor,
    { ...actor, permissions: [SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE] },
    { ...actor, permissions: [SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE] }
  ];
  const handoverAllowed = [
    {
      ...actor,
      permissions: [
        SYSTEM_PERMISSIONS.HOUSING_HANDOVER_MANAGE,
        SYSTEM_PERMISSIONS.PROPERTY_APPROVAL_CREATE
      ]
    },
    { ...actor, isSuper: true },
    { ...actor, permissions: ["*"] }
  ];
  for (const field of [
    "damage_amount",
    "unsettled_amount",
    "deposit_deduction_amount"
  ] as const) {
    const dto = {
      handover_type: "move_out" as const,
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00",
      [field]: "0.01"
    };
    for (const principal of handoverDenied) {
      await assert.rejects(
        service.completeHandover(scope, principal, "lease-1", dto),
        ForbiddenException
      );
    }
    for (const principal of handoverAllowed) {
      await assert.rejects(
        service.completeHandover(scope, principal, "lease-1", dto),
        ConflictException
      );
    }
  }
  assert.equal(transactionCalls, 0);
});

test("direct housing service keeps low-risk ledger and handover variants reachable", async () => {
  let transactionCalls = 0;
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      transaction: async () => {
        transactionCalls += 1;
        return "direct";
      }
    } as never,
    {} as never
  );
  const principal = {
    ...actor,
    permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER]
  };
  for (const entryType of ["payment", "deposit_receipt"] as const) {
    assert.equal(
      await service.registerLedger(scope, principal, "lease-1", {
        entry_type: entryType
      } as never),
      "direct"
    );
  }
  for (const dto of [
    {
      handover_type: "move_in",
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00"
    },
    {
      handover_type: "move_out",
      damage_amount: "0.00",
      unsettled_amount: "0.00",
      deposit_deduction_amount: "0.00"
    }
  ] as const) {
    assert.equal(
      await service.completeHandover(scope, principal, "lease-1", dto),
      "direct"
    );
  }
  assert.equal(transactionCalls, 4);
});
