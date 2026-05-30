import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingContractEntity } from "../../leasing-contracts/entities/leasing-contract.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

@Entity("biz_leasing_receivable")
@Index("idx_biz_leasing_receivable_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_receivable_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_receivable_contract_entity", ["tenantId", "parkId", "contractId"])
@Index("idx_biz_leasing_receivable_status_due_entity", ["tenantId", "parkId", "status", "dueDate"])
@Index("uk_biz_leasing_receivable_code_entity", ["tenantId", "parkId", "arCode"], { unique: true, where: "is_deleted = false" })
export class LeasingReceivableEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "ar_code", type: "varchar", length: 64 })
  arCode!: string;

  @Column({ name: "contract_id", type: "uuid", nullable: true })
  contractId!: string | null;

  @ManyToOne(() => LeasingContractEntity, { nullable: true })
  @JoinColumn({ name: "contract_id" })
  contract?: LeasingContractEntity | null;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "fee_type", type: "varchar", length: 32 })
  feeType!: string;

  @Column({ name: "period_start", type: "date" })
  periodStart!: string;

  @Column({ name: "period_end", type: "date" })
  periodEnd!: string;

  @Column({ name: "due_date", type: "date" })
  dueDate!: string;

  @Column({ name: "amount_due", type: "numeric", precision: 14, scale: 2, default: 0 })
  amountDue!: string;

  @Column({ name: "amount_paid", type: "numeric", precision: 14, scale: 2, default: 0 })
  amountPaid!: string;

  @Column({ name: "amount_waived", type: "numeric", precision: 14, scale: 2, default: 0 })
  amountWaived!: string;

  @Column({ name: "amount_remain", type: "numeric", precision: 14, scale: 2, default: 0 })
  amountRemain!: string;

  @Column({ name: "late_fee", type: "numeric", precision: 14, scale: 2, default: 0 })
  lateFee!: string;

  @Column({ name: "invoice_status", type: "varchar", length: 32, default: "10" })
  invoiceStatus!: string;

  @Column({ name: "overdue_days", type: "integer", default: 0 })
  overdueDays!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "20" })
  status!: string;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: "contract" | "manual" | "adjustment" | "ENERGY_BILLING" | "ENERGY_BILLING_ADJUSTMENT" | "ENERGY_BILLING_REVERSAL";

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "generate_batch_no", type: "varchar", length: 64, nullable: true })
  generateBatchNo!: string | null;
}
