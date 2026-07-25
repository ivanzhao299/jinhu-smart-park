import type { HousingLeaseStatus, HousingLedgerEntryType } from "@jinhu/shared";
import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_housing_lease")
@Index("uq_housing_lease_scope_code", ["tenantId", "parkId", "leaseCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class HousingLeaseEntity extends AuditableEntity {
  @Column({ name: "lease_code", type: "varchar", length: 64 })
  leaseCode!: string;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @Column({ name: "tenant_party_id", type: "uuid" })
  tenantPartyId!: string;

  @Column({ name: "occupancy_id", type: "uuid", nullable: true })
  occupancyId!: string | null;

  @Column({ type: "varchar", length: 32, default: "draft" })
  status!: HousingLeaseStatus;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date" })
  endDate!: string;

  @Column({ name: "payment_cycle_months", type: "integer", default: 1 })
  paymentCycleMonths!: number;

  @Column({ name: "billing_day", type: "integer", default: 1 })
  billingDay!: number;

  @Column({ name: "monthly_rent", type: "numeric", precision: 18, scale: 2 })
  monthlyRent!: string;

  @Column({ name: "deposit_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  depositAmount!: string;

  @Column({ name: "first_due_date", type: "date" })
  firstDueDate!: string;

  @Column({ name: "tail_period_rule", type: "varchar", length: 32, default: "prorate" })
  tailPeriodRule!: string;

  @Column({ name: "approval_note", type: "varchar", length: 500, nullable: true })
  approvalNote!: string | null;

  @Column({ name: "approved_by", type: "uuid", nullable: true })
  approvedBy!: string | null;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt!: Date | null;

  @Column({ name: "signature_file_id", type: "uuid", nullable: true })
  signatureFileId!: string | null;

  @Column({ name: "signed_at", type: "timestamptz", nullable: true })
  signedAt!: Date | null;

  @Column({ name: "effective_at", type: "timestamptz", nullable: true })
  effectiveAt!: Date | null;

  @Column({ name: "checkout_at", type: "timestamptz", nullable: true })
  checkoutAt!: Date | null;

  @Column({ name: "termination_reason", type: "varchar", length: 500, nullable: true })
  terminationReason!: string | null;
}

@Entity("rel_housing_lease_occupant")
@Index("uq_housing_lease_occupant", ["tenantId", "parkId", "leaseId", "partyId"], {
  unique: true,
  where: "is_deleted = false"
})
export class HousingLeaseOccupantEntity extends AuditableEntity {
  @Column({ name: "lease_id", type: "uuid" })
  leaseId!: string;

  @Column({ name: "party_id", type: "uuid" })
  partyId!: string;

  @Column({ name: "occupant_role", type: "varchar", length: 32, default: "cohabitant" })
  occupantRole!: string;

  @Column({ name: "emergency_contact", type: "boolean", default: false })
  emergencyContact!: boolean;
}

@Entity("biz_housing_charge_plan")
export class HousingChargePlanEntity extends AuditableEntity {
  @Column({ name: "lease_id", type: "uuid" })
  leaseId!: string;

  @Column({ name: "charge_type", type: "varchar", length: 32 })
  chargeType!: string;

  @Column({ name: "billing_source", type: "varchar", length: 32, default: "fixed" })
  billingSource!: "fixed" | "energy_meter" | "manual";

  @Column({ name: "cycle_months", type: "integer", default: 1 })
  cycleMonths!: number;

  @Column({ type: "numeric", precision: 18, scale: 2, nullable: true })
  amount!: string | null;

  @Column({ name: "unit_price", type: "numeric", precision: 18, scale: 6, nullable: true })
  unitPrice!: string | null;

  @Column({ name: "meter_id", type: "uuid", nullable: true })
  meterId!: string | null;

  @Column({ type: "boolean", default: true })
  enabled!: boolean;
}

@Entity("biz_housing_receivable")
export class HousingReceivableEntity extends AuditableEntity {
  @Column({ name: "lease_id", type: "uuid" })
  leaseId!: string;

  @Column({ name: "charge_plan_id", type: "uuid", nullable: true })
  chargePlanId!: string | null;

  @Column({ name: "source_type", type: "varchar", length: 32 })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "charge_type", type: "varchar", length: 32 })
  chargeType!: string;

  @Column({ name: "period_start", type: "date" })
  periodStart!: string;

  @Column({ name: "period_end", type: "date" })
  periodEnd!: string;

  @Column({ name: "due_date", type: "date" })
  dueDate!: string;

  @Column({ name: "opening_reading", type: "numeric", precision: 18, scale: 6, nullable: true })
  openingReading!: string | null;

  @Column({ name: "closing_reading", type: "numeric", precision: 18, scale: 6, nullable: true })
  closingReading!: string | null;

  @Column({ name: "usage_amount", type: "numeric", precision: 18, scale: 6, nullable: true })
  usageAmount!: string | null;

  @Column({ name: "unit_price", type: "numeric", precision: 18, scale: 6, nullable: true })
  unitPrice!: string | null;

  @Column({ type: "numeric", precision: 18, scale: 2 })
  amount!: string;

  @Column({ name: "paid_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  paidAmount!: string;

  @Column({ name: "waived_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  waivedAmount!: string;

  @Column({ type: "varchar", length: 32, default: "unpaid" })
  status!: "unpaid" | "partial" | "paid" | "waived" | "void";
}

@Entity("biz_housing_ledger_entry")
export class HousingLedgerEntryEntity extends AuditableEntity {
  @Column({ name: "lease_id", type: "uuid" })
  leaseId!: string;

  @Column({ name: "receivable_id", type: "uuid", nullable: true })
  receivableId!: string | null;

  @Column({ name: "entry_type", type: "varchar", length: 32 })
  entryType!: HousingLedgerEntryType;

  @Column({ name: "charge_type", type: "varchar", length: 32 })
  chargeType!: string;

  @Column({ type: "numeric", precision: 18, scale: 2 })
  amount!: string;

  @Column({ name: "payment_method", type: "varchar", length: 32, nullable: true })
  paymentMethod!: string | null;

  @Column({ name: "transaction_reference", type: "varchar", length: 100, nullable: true })
  transactionReference!: string | null;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "manual" })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ type: "varchar", length: 32, default: "confirmed" })
  status!: "confirmed" | "void";

  @Column({ type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "occurred_at", type: "timestamptz", default: () => "now()" })
  occurredAt!: Date;
}

@Entity("biz_housing_handover")
@Index("uq_housing_handover_type", ["tenantId", "parkId", "leaseId", "handoverType"], {
  unique: true,
  where: "is_deleted = false"
})
export class HousingHandoverEntity extends AuditableEntity {
  @Column({ name: "lease_id", type: "uuid" })
  leaseId!: string;

  @Column({ name: "handover_type", type: "varchar", length: 32 })
  handoverType!: "move_in" | "move_out";

  @Column({ type: "varchar", length: 32, default: "draft" })
  status!: "draft" | "completed";

  @Column({ name: "handover_at", type: "timestamptz", nullable: true })
  handoverAt!: Date | null;

  @Column({ name: "item_snapshot", type: "jsonb", default: () => "'[]'::jsonb" })
  itemSnapshot!: Record<string, unknown>[];

  @Column({ name: "meter_readings", type: "jsonb", default: () => "'[]'::jsonb" })
  meterReadings!: Record<string, unknown>[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  credentials!: Record<string, unknown>[];

  @Column({ name: "photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  photoFileIds!: string[];

  @Column({ name: "signature_file_id", type: "uuid", nullable: true })
  signatureFileId!: string | null;

  @Column({ name: "damage_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  damageAmount!: string;

  @Column({ name: "unsettled_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  unsettledAmount!: string;

  @Column({ name: "deposit_deduction_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  depositDeductionAmount!: string;
}

@Entity("biz_housing_purchase")
@Index("uq_housing_purchase_scope_code", ["tenantId", "parkId", "purchaseCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class HousingPurchaseEntity extends AuditableEntity {
  @Column({ name: "purchase_code", type: "varchar", length: 64 })
  purchaseCode!: string;

  @Column({ name: "unit_id", type: "uuid", nullable: true })
  unitId!: string | null;

  @Column({ name: "vendor_name", type: "varchar", length: 200 })
  vendorName!: string;

  @Column({ name: "purchase_date", type: "date" })
  purchaseDate!: string;

  @Column({ name: "cost_category", type: "varchar", length: 64 })
  costCategory!: string;

  @Column({ name: "total_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  totalAmount!: string;

  @Column({ name: "approval_status", type: "varchar", length: 32, default: "draft" })
  approvalStatus!: "draft" | "approved" | "rejected" | "void";

  @Column({ name: "payment_status", type: "varchar", length: 32, default: "unpaid" })
  paymentStatus!: "unpaid" | "paid" | "refunded";

  @Column({ name: "receipt_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  receiptFileIds!: string[];
}

@Entity("biz_housing_purchase_item")
export class HousingPurchaseItemEntity extends AuditableEntity {
  @Column({ name: "purchase_id", type: "uuid" })
  purchaseId!: string;

  @Column({ name: "item_name", type: "varchar", length: 200 })
  itemName!: string;

  @Column({ type: "numeric", precision: 18, scale: 3 })
  quantity!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  unit!: string | null;

  @Column({ name: "unit_price", type: "numeric", precision: 18, scale: 2 })
  unitPrice!: string;

  @Column({ type: "numeric", precision: 18, scale: 2 })
  amount!: string;

  @Column({ name: "transferred_receivable_id", type: "uuid", nullable: true })
  transferredReceivableId!: string | null;
}
