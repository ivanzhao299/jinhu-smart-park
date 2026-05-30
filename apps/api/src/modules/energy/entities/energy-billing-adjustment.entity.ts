import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_billing_adjustment")
@Index("idx_energy_billing_adjustment_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_energy_billing_adjustment_item", ["tenantId", "parkId", "billingItemId", "isDeleted"])
@Index("idx_energy_billing_adjustment_cycle", ["tenantId", "parkId", "cycleId", "isDeleted"])
@Index("uk_energy_billing_adjustment_code", ["tenantId", "parkId", "adjustmentCode"], { unique: true, where: "is_deleted = false" })
export class EnergyBillingAdjustmentEntity extends AuditableEntity {
  @Column({ name: "adjustment_code", type: "varchar", length: 64 })
  adjustmentCode!: string;

  @Column({ name: "billing_item_id", type: "uuid" })
  billingItemId!: string;

  @Column({ name: "cycle_id", type: "uuid" })
  cycleId!: string;

  @Column({ name: "related_park_tenant_id", type: "uuid" })
  relatedParkTenantId!: string;

  @Column({ name: "original_receivable_id", type: "uuid" })
  originalReceivableId!: string;

  @Column({ name: "adjustment_type", type: "varchar", length: 32 })
  adjustmentType!: "REVERSAL" | "ADJUSTMENT";

  @Column({ name: "adjustment_amount", type: "numeric", precision: 14, scale: 2 })
  adjustmentAmount!: string;

  @Column({ name: "final_adjustment_amount", type: "numeric", precision: 14, scale: 2 })
  finalAdjustmentAmount!: string;

  @Column({ name: "adjustment_reason", type: "varchar", length: 500 })
  adjustmentReason!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "DRAFT" })
  status!: "DRAFT" | "APPROVED" | "POSTED" | "CANCELLED";

  @Column({ name: "related_receivable_id", type: "uuid", nullable: true })
  relatedReceivableId!: string | null;

  @Column({ name: "approved_by", type: "varchar", length: 64, nullable: true })
  approvedBy!: string | null;

  @Column({ name: "posted_by", type: "varchar", length: 64, nullable: true })
  postedBy!: string | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ name: "posted_at", type: "timestamptz", nullable: true })
  postedAt!: Date | null;

  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;
}
