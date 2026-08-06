import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HousingLeaseEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import { HousingService } from "./housing.service";
import { HousingReceivableWriterService } from "./housing-receivable-writer.service";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";
import { HousingFinanceCommandService } from "./housing-finance-command.service";

const scope: TenantParkScope = { tenantId: "tenant-1", parkId: "park-1" };
const actor: JwtPrincipal = {
  sub: "user-1",
  username: "operator",
  tenantId: scope.tenantId,
  parkId: scope.parkId,
  roles: [],
  permissions: [SYSTEM_PERMISSIONS.HOUSING_FINANCE_REGISTER]
};
const lease = {
  id: "lease-1",
  unitId: "unit-1",
  status: "active",
  depositAmount: "2000.00"
};

function serviceFor(receivable: Record<string, unknown>) {
  const support = new HousingTransactionSupportService();
  const manager = {
    getRepository: (entity: unknown) => {
      if (entity === HousingLeaseEntity) {
        return { findOne: async () => lease };
      }
      if (entity === HousingReceivableEntity) {
        return { findOne: async () => receivable };
      }
      throw new Error("unexpected repository access");
    }
  };
  const dataSource = {
    transaction: async (run: (value: typeof manager) => unknown) => run(manager)
  };
  const finance = new HousingFinanceCommandService(
    dataSource as never,
    { assertAccess: async () => undefined } as never,
    support
  );
  return new HousingService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { assertAccess: async () => undefined } as never,
    {} as never,
    dataSource as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    support,
    new HousingReceivableWriterService(support),
    undefined,
    finance
  );
}

test("payment cannot target a deposit receivable", async () => {
  const service = serviceFor({
    id: "receivable-deposit",
    chargeType: "deposit",
    sourceType: "lease_deposit",
    status: "unpaid"
  });
  await assert.rejects(
    service.registerLedger(scope, actor, lease.id, {
      entry_type: "payment",
      receivable_id: "00000000-0000-4000-8000-000000000011",
      charge_type: "deposit",
      amount: "100.00",
      reason: "收取押金"
    }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message.includes("require deposit_receipt")
  );
});

test("deposit_receipt cannot target an ordinary receivable", async () => {
  const service = serviceFor({
    id: "receivable-rent",
    chargeType: "rent",
    sourceType: "charge_plan",
    status: "unpaid"
  });
  await assert.rejects(
    service.registerLedger(scope, actor, lease.id, {
      entry_type: "deposit_receipt",
      receivable_id: "00000000-0000-4000-8000-000000000012",
      charge_type: "rent",
      amount: "100.00",
      reason: "错误押金入账"
    }),
    (error: unknown) =>
      error instanceof BadRequestException
      && error.message.includes("only target the lease deposit receivable")
  );
});
