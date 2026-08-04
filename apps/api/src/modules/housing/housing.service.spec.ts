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
import { HousingLeaseCommandService } from "./housing-lease-command.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";
import { HousingHandoverCommandService } from "./housing-handover-command.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "user-1",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: []
};

test("HousingService lease commands are facade-only delegations", async () => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const commands = Object.fromEntries(
    ["create", "submit", "approve", "sign", "activate", "void", "addOccupant"].map(
      (action) => [action, async (...args: unknown[]) => {
        calls.push({ action, args });
        return action;
      }]
    )
  );
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    commands as never
  );
  const createDto = { lease_code: "HL-1" } as never;
  const approveDto = { approval_note: "ok" } as never;
  const signDto = { signature_file_id: "file-1" } as never;
  const occupantDto = { party_id: "party-1" } as never;

  await service.createLease(scope, actor, createDto);
  await service.submitLease(scope, actor, "lease-1");
  await service.approveLease(scope, actor, "lease-1", approveDto, "approve-key");
  await service.signLease(scope, actor, "lease-1", signDto);
  await service.activateLease(scope, actor, "lease-1", "activate-key");
  await service.voidLease(scope, actor, "lease-1", "reason", "void-key");
  await service.addOccupant(scope, actor, "lease-1", occupantDto);

  assert.deepEqual(calls, [
    { action: "create", args: [scope, actor, createDto] },
    { action: "submit", args: [scope, actor, "lease-1"] },
    { action: "approve", args: [scope, actor, "lease-1", approveDto, "approve-key"] },
    { action: "sign", args: [scope, actor, "lease-1", signDto] },
    { action: "activate", args: [scope, actor, "lease-1", "activate-key"] },
    { action: "void", args: [scope, actor, "lease-1", "reason", "void-key"] },
    { action: "addOccupant", args: [scope, actor, "lease-1", occupantDto] }
  ]);
});

test("HousingService billing commands are facade-only delegations", async () => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const billingCommands = {
    async saveChargePlan(...args: unknown[]) {
      calls.push({ action: "saveChargePlan", args });
      return "plan";
    },
    async generateBills(...args: unknown[]) {
      calls.push({ action: "generateBills", args });
      return ["bill"];
    }
  };
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    billingCommands as never
  );
  const planDto = { charge_type: "rent" } as never;
  const billDto = { charge_plan_id: "plan-1" } as never;

  assert.equal(await service.saveChargePlan(scope, actor, "lease-1", planDto), "plan");
  assert.deepEqual(await service.generateBills(scope, actor, "lease-1", billDto), ["bill"]);
  assert.deepEqual(calls, [
    { action: "saveChargePlan", args: [scope, actor, "lease-1", planDto] },
    { action: "generateBills", args: [scope, actor, "lease-1", billDto] }
  ]);
});

test("HousingService finance commands are facade-only delegations", async () => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const financeCommands = {
    async registerLedger(...args: unknown[]) {
      calls.push({ action: "registerLedger", args });
      return "ledger";
    },
    async executeApprovedFinance(...args: unknown[]) {
      calls.push({ action: "executeApprovedFinance", args });
    }
  };
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, financeCommands as never
  );
  const ledgerDto = { entry_type: "payment" } as never;
  const execution = { requestId: "request-1" } as never;

  assert.equal(
    await service.registerLedger(scope, actor, "lease-1", ledgerDto, "ledger-key"),
    "ledger"
  );
  await service.executeApprovedFinance(execution);
  assert.deepEqual(calls, [
    {
      action: "registerLedger",
      args: [scope, actor, "lease-1", ledgerDto, "ledger-key"]
    },
    { action: "executeApprovedFinance", args: [execution] }
  ]);
});

test("HousingService handover and repair commands are facade-only delegations", async () => {
  const calls: Array<{ action: string; args: unknown[] }> = [];
  const handover = { complete: async (...args: unknown[]) => {
    calls.push({ action: "complete", args });
    return "handover";
  } };
  const executor = { execute: async (...args: unknown[]) => {
    calls.push({ action: "execute", args });
  } };
  const repair = { create: async (...args: unknown[]) => {
    calls.push({ action: "repair", args });
    return "repair";
  } };
  const service = new HousingService(
    {} as never, {} as never, {} as never, {} as never, {} as never,
    {} as never, {} as never, undefined, undefined, undefined, undefined,
    undefined, undefined, undefined, undefined,
    handover as never, executor as never, repair as never
  );
  const handoverDto = { handover_type: "move_in" } as never;
  const repairDto = { title: "repair" } as never;
  const execution = { requestId: "request-1" } as never;

  assert.equal(
    await service.completeHandover(scope, actor, "lease-1", handoverDto, "key"),
    "handover"
  );
  assert.equal(await service.createRepair(scope, actor, "lease-1", repairDto), "repair");
  await service.executeApprovedMoveOutHandover(execution);
  assert.deepEqual(calls, [
    { action: "complete", args: [scope, actor, "lease-1", handoverDto, "key"] },
    { action: "repair", args: [scope, actor, "lease-1", repairDto] },
    { action: "execute", args: [execution] }
  ]);
});

test("direct housing pure high-risk actions stop before a transaction for every principal class", async () => {
  let transactionCalls = 0;
  const dataSource = {
    transaction: async () => {
      transactionCalls += 1;
    }
  };
  const support = new HousingTransactionSupportService();
  const writer = new HousingReceivableWriterService(support);
  const commands = new HousingLeaseCommandService(
    dataSource as never,
    {} as never,
    {} as never,
    support,
    writer
  );
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    undefined,
    undefined,
    commands,
    support,
    writer
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
  const dataSource = {
    transaction: async () => { transactionCalls += 1; }
  };
  const finance = new HousingFinanceCommandService(
    dataSource as never,
    {} as never,
    new HousingTransactionSupportService()
  );
  const handover = new HousingHandoverCommandService(
    dataSource as never,
    {} as never,
    new HousingTransactionSupportService(),
    {} as never
  );
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    undefined, undefined, undefined, undefined, undefined, undefined,
    finance, handover
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
  const dataSource = {
    transaction: async () => {
      transactionCalls += 1;
      return "direct";
    }
  };
  const finance = new HousingFinanceCommandService(
    dataSource as never,
    {} as never,
    new HousingTransactionSupportService()
  );
  const handover = new HousingHandoverCommandService(
    dataSource as never,
    {} as never,
    new HousingTransactionSupportService(),
    {} as never
  );
  const service = new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    dataSource as never,
    {} as never,
    undefined, undefined, undefined, undefined, undefined, undefined,
    finance, handover
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
