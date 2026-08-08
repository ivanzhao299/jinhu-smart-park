import { Injectable } from "@nestjs/common";
import type { TenantParkScope } from "@jinhu/shared";
import { IsNull, type EntityManager } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import {
  HousingLeaseEntity,
  HousingReceivableEntity
} from "./entities/housing.entities";
import {
  addHousingMoneyAmounts,
  formatHousingDecimal,
  formatHousingMoney,
  housingReceivableStatus
} from "./housing-finance.policy";
import { HousingTransactionSupportService } from "./housing-transaction-support.service";

export type CreateHousingReceivableInput = {
  chargePlanId: string | null;
  sourceType: string;
  sourceId: string | null;
  chargeType: string;
  periodStart: string;
  periodEnd: string;
  dueDate: string;
  amount: string | number;
  openingReading?: string | number;
  closingReading?: string | number;
  usageAmount?: string | number;
  unitPrice?: string | number;
  remark?: string;
  accumulateIfExisting?: boolean;
};

@Injectable()
export class HousingReceivableWriterService {
  constructor(private readonly support: HousingTransactionSupportService) {}

  async create(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    lease: HousingLeaseEntity,
    input: CreateHousingReceivableInput
  ) {
    const repository = manager.getRepository(HousingReceivableEntity);
    await this.support.lockBusinessKey(
      manager,
      this.support.receivableBusinessKey(scope, lease.id, {
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? "null",
        chargeType: input.chargeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      })
    );
    const existing = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        leaseId: lease.id,
        chargeType: input.chargeType,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? IsNull(),
        isDeleted: false
      }
    });
    if (existing) return this.updateExisting(repository, existing, actor, input);
    return repository.save(repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      leaseId: lease.id,
      chargePlanId: input.chargePlanId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      chargeType: input.chargeType,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      dueDate: input.dueDate,
      openingReading: this.optionalDecimal(input.openingReading),
      closingReading: this.optionalDecimal(input.closingReading),
      usageAmount: this.optionalDecimal(input.usageAmount),
      unitPrice: this.optionalDecimal(input.unitPrice),
      amount: formatHousingMoney(input.amount),
      paidAmount: "0.00",
      waivedAmount: "0.00",
      status: "unpaid",
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: input.remark ?? null
    }));
  }

  private updateExisting(
    repository: ReturnType<EntityManager["getRepository"]>,
    existing: HousingReceivableEntity,
    actor: JwtPrincipal,
    input: CreateHousingReceivableInput
  ) {
    if (!input.accumulateIfExisting) return existing;
    const nextAmount = addHousingMoneyAmounts([existing.amount, input.amount]);
    existing.amount = nextAmount;
    existing.status = housingReceivableStatus(
      nextAmount,
      existing.paidAmount,
      existing.waivedAmount
    );
    existing.dueDate = input.dueDate;
    existing.updateBy = actor.sub;
    existing.remark = input.remark ?? existing.remark;
    return repository.save(existing);
  }

  private optionalDecimal(value: string | number | undefined) {
    return value === undefined ? null : formatHousingDecimal(value);
  }
}
