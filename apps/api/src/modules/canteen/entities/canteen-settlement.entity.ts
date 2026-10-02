import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_settlements")
@Index("uq_canteen_settlements_scope_outlet_period", ["tenantId", "outletId", "period"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_settlements_scope_period_status", ["tenantId", "parkId", "period", "status"])
@Index("idx_canteen_settlements_contractor_period", ["tenantId", "contractorId", "period"])
export class CanteenSettlementEntity extends AuditableEntity {
  @Column({ name: "settlement_no", type: "varchar", length: 40 })
  settlementNo!: string;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "contractor_id", type: "varchar", length: 64 })
  contractorId!: string;

  @Column({ name: "sales_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  salesTotal!: string;

  @Column({ name: "qr_pay_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  qrPayTotal!: string;

  @Column({ name: "subsidy_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  subsidyTotal!: string;

  @Column({ name: "refund_total", type: "numeric", precision: 12, scale: 2, default: 0 })
  refundTotal!: string;

  @Column({ name: "company_payable", type: "numeric", precision: 12, scale: 2, default: 0 })
  companyPayable!: string;

  @Column({ type: "varchar", length: 16, default: "draft" })
  status!: string;

  @Column({ name: "generated_time", type: "timestamptz", nullable: true })
  generatedTime!: Date | null;

  @Column({ name: "submitted_time", type: "timestamptz", nullable: true })
  submittedTime!: Date | null;

  @Column({ name: "reconciled_time", type: "timestamptz", nullable: true })
  reconciledTime!: Date | null;

  @Column({ name: "approved_time", type: "timestamptz", nullable: true })
  approvedTime!: Date | null;

  @Column({ name: "settled_time", type: "timestamptz", nullable: true })
  settledTime!: Date | null;

  @Column({ name: "finance_user_id", type: "uuid", nullable: true })
  financeUserId!: string | null;

  @Column({ name: "settle_evidence_file_id", type: "uuid", nullable: true })
  settleEvidenceFileId!: string | null;
}
