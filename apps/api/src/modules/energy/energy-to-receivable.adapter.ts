import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { LeasingReceivableEntity } from "../leasing-receivables/entities/leasing-receivable.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { EnergyBillingAdjustmentEntity } from "./entities/energy-billing-adjustment.entity";
import { EnergyBillingItemEntity } from "./entities/energy-billing-item.entity";

const RECEIVABLE_CODE_RULE = "RECEIVABLE_CODE";
const ENERGY_FEE_TYPE_OTHER = "90";
const INVOICE_STATUS_NONE = "10";
const RECEIVABLE_STATUS_GENERATED = "20";

export interface EnergyReceivablePostResult {
  item_id?: string;
  adjustment_id?: string;
  receivable_id: string | null;
  status: "posted" | "skipped" | "failed";
  message?: string;
}

@Injectable()
export class EnergyToReceivableAdapter {
  constructor(
    @InjectRepository(LeasingReceivableEntity)
    private readonly receivableRepository: Repository<LeasingReceivableEntity>,
    private readonly codeRulesService: CodeRulesService
  ) {}

  async postItem(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    item: EnergyBillingItemEntity,
    periodStart: string,
    periodEnd: string,
    manager?: EntityManager
  ): Promise<EnergyReceivablePostResult> {
    if (item.receivableId) {
      return { item_id: item.id, receivable_id: item.receivableId, status: "skipped", message: "Already posted" };
    }
    const repo = manager?.getRepository(LeasingReceivableEntity) ?? this.receivableRepository;
    const existing = await repo.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sourceId: item.id,
        isDeleted: false
      }
    });
    if (existing) {
      item.receivableId = existing.id;
      item.postedAt = existing.createTime;
      return { item_id: item.id, receivable_id: existing.id, status: "skipped", message: "Existing energy receivable found" };
    }

    const generated = await this.codeRulesService.generateNext(scope, actor.sub, RECEIVABLE_CODE_RULE);
    const amount = Number(item.finalAmount ?? 0);
    const receivable = repo.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      arCode: generated.code,
      contractId: null,
      parkTenantId: item.relatedParkTenantId,
      feeType: ENERGY_FEE_TYPE_OTHER,
      periodStart,
      periodEnd,
      dueDate: periodEnd,
      amountDue: amount.toFixed(2),
      amountPaid: "0.00",
      amountWaived: "0.00",
      amountRemain: amount.toFixed(2),
      lateFee: "0.00",
      invoiceStatus: INVOICE_STATUS_NONE,
      overdueDays: 0,
      status: RECEIVABLE_STATUS_GENERATED,
      sourceType: "ENERGY_BILLING" as LeasingReceivableEntity["sourceType"],
      sourceId: item.id,
      generateBatchNo: item.cycleId,
      remark: `能源账单发布：${item.meterType} ${item.billingMethod}`,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await repo.save(receivable);
    item.receivableId = saved.id;
    item.postedAt = new Date();
    return { item_id: item.id, receivable_id: saved.id, status: "posted" };
  }

  async postAdjustment(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    adjustment: EnergyBillingAdjustmentEntity,
    periodStart: string,
    periodEnd: string,
    manager?: EntityManager
  ): Promise<EnergyReceivablePostResult> {
    if (adjustment.relatedReceivableId) {
      return { adjustment_id: adjustment.id, receivable_id: adjustment.relatedReceivableId, status: "skipped", message: "Already posted" };
    }
    const repo = manager?.getRepository(LeasingReceivableEntity) ?? this.receivableRepository;
    const existing = await repo.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sourceId: adjustment.id,
        isDeleted: false
      }
    });
    if (existing) {
      adjustment.relatedReceivableId = existing.id;
      adjustment.postedAt = existing.createTime;
      return { adjustment_id: adjustment.id, receivable_id: existing.id, status: "skipped", message: "Existing adjustment receivable found" };
    }

    const generated = await this.codeRulesService.generateNext(scope, actor.sub, RECEIVABLE_CODE_RULE);
    const amount = Number(adjustment.finalAdjustmentAmount ?? adjustment.adjustmentAmount ?? 0);
    const sourceType = adjustment.adjustmentType === "REVERSAL" ? "ENERGY_BILLING_REVERSAL" : "ENERGY_BILLING_ADJUSTMENT";
    const receivable = repo.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      arCode: generated.code,
      contractId: null,
      parkTenantId: adjustment.relatedParkTenantId,
      feeType: ENERGY_FEE_TYPE_OTHER,
      periodStart,
      periodEnd,
      dueDate: periodEnd,
      amountDue: amount.toFixed(2),
      amountPaid: "0.00",
      amountWaived: "0.00",
      amountRemain: amount.toFixed(2),
      lateFee: "0.00",
      invoiceStatus: INVOICE_STATUS_NONE,
      overdueDays: 0,
      status: RECEIVABLE_STATUS_GENERATED,
      sourceType: sourceType as LeasingReceivableEntity["sourceType"],
      sourceId: adjustment.id,
      generateBatchNo: adjustment.cycleId,
      remark: `能源账单${adjustment.adjustmentType === "REVERSAL" ? "红冲" : "补差"}：${adjustment.adjustmentReason}`,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await repo.save(receivable);
    adjustment.relatedReceivableId = saved.id;
    adjustment.postedAt = new Date();
    return { adjustment_id: adjustment.id, receivable_id: saved.id, status: "posted" };
  }
}
