import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingContractEntity } from "../../leasing-contracts/entities/leasing-contract.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

export interface LeasingCheckoutApproveRecord {
  action: "create" | "update" | "submit" | "approve" | "reject" | "delete" | "effective";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string | null;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
}

@Entity("biz_leasing_checkout")
@Index("idx_biz_leasing_checkout_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_checkout_contract_entity", ["tenantId", "parkId", "contractId"])
@Index("idx_biz_leasing_checkout_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_checkout_status_entity", ["tenantId", "parkId", "status"])
@Index("uk_biz_leasing_checkout_code_entity", ["tenantId", "parkId", "checkoutCode"], { unique: true, where: "is_deleted = false" })
export class LeasingCheckoutEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "checkout_code", type: "varchar", length: 64 })
  checkoutCode!: string;

  @Column({ name: "contract_id", type: "uuid" })
  contractId!: string;

  @ManyToOne(() => LeasingContractEntity)
  @JoinColumn({ name: "contract_id" })
  contract!: LeasingContractEntity;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "checkout_type", type: "varchar", length: 32 })
  checkoutType!: string;

  @Column({ name: "planned_checkout_date", type: "date" })
  plannedCheckoutDate!: string;

  @Column({ name: "actual_checkout_date", type: "date", nullable: true })
  actualCheckoutDate!: string | null;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "release_unit_status", type: "varchar", length: 32 })
  releaseUnitStatus!: string;

  @Column({ name: "unpaid_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  unpaidAmount!: string;

  @Column({ name: "late_fee_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  lateFeeAmount!: string;

  @Column({ name: "deposit_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  depositAmount!: string;

  @Column({ name: "deduction_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  deductionAmount!: string;

  @Column({ name: "additional_charge_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  additionalChargeAmount!: string;

  @Column({ name: "refund_amount", type: "numeric", precision: 14, scale: 2, default: 0 })
  refundAmount!: string;

  @Column({ name: "amount_due_from_tenant", type: "numeric", precision: 14, scale: 2, default: 0 })
  amountDueFromTenant!: string;

  @Column({ name: "settlement_remark", type: "varchar", length: 500, nullable: true })
  settlementRemark!: string | null;

  @Column({ name: "settlement_status", type: "varchar", length: 32, default: "10" })
  settlementStatus!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "submit_time", type: "timestamptz", nullable: true })
  submitTime!: Date | null;

  @Column({ name: "approve_time", type: "timestamptz", nullable: true })
  approveTime!: Date | null;

  @Column({ name: "approve_by", type: "varchar", length: 64, nullable: true })
  approveBy!: string | null;

  @Column({ name: "reject_reason", type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;

  @Column({ name: "approve_records", type: "jsonb", default: [] })
  approveRecords!: LeasingCheckoutApproveRecord[];
}
