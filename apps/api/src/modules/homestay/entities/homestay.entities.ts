import type {
  HomestayBookingStatus,
  HomestayLedgerEntryType,
  HomestayTurnoverStatus
} from "@jinhu/shared";
import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_homestay_rate_config")
@Index("uq_homestay_rate_config_scope_unit", ["tenantId", "parkId", "unitId"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayRateConfigEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @Column({ name: "base_daily_rate", type: "numeric", precision: 18, scale: 2 })
  baseDailyRate!: string;

  @Column({ type: "varchar", length: 8, default: "CNY" })
  currency!: string;

  @Column({ name: "free_cancel_before_hours", type: "integer", default: 24 })
  freeCancelBeforeHours!: number;

  @Column({ name: "late_cancel_fee_type", type: "varchar", length: 16, default: "fixed" })
  lateCancelFeeType!: "fixed" | "percentage";

  @Column({ name: "late_cancel_fee_value", type: "numeric", precision: 18, scale: 2, default: 0 })
  lateCancelFeeValue!: string;

  @Column({ name: "checkout_requires_inspection", type: "boolean", default: false })
  checkoutRequiresInspection!: boolean;
}

@Entity("biz_homestay_rate_override")
@Index("uq_homestay_rate_override_scope_date", ["tenantId", "parkId", "unitId", "businessDate"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayRateOverrideEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @Column({ name: "business_date", type: "date" })
  businessDate!: string;

  @Column({ name: "daily_rate", type: "numeric", precision: 18, scale: 2 })
  dailyRate!: string;

  @Column({ type: "varchar", length: 500 })
  reason!: string;
}

@Entity("biz_homestay_booking")
@Index("uq_homestay_booking_scope_code", ["tenantId", "parkId", "bookingCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayBookingEntity extends AuditableEntity {
  @Column({ name: "booking_code", type: "varchar", length: 64 })
  bookingCode!: string;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @Column({ name: "booker_party_id", type: "uuid", nullable: true })
  bookerPartyId!: string | null;

  @Column({ name: "occupancy_id", type: "uuid", nullable: true })
  occupancyId!: string | null;

  @Column({ type: "varchar", length: 32, default: "draft" })
  status!: HomestayBookingStatus;

  @Column({ name: "arrival_date", type: "date" })
  arrivalDate!: string;

  @Column({ name: "departure_date", type: "date" })
  departureDate!: string;

  @Column({ name: "expected_arrival_time", type: "timestamptz", nullable: true })
  expectedArrivalTime!: Date | null;

  @Column({ name: "actual_check_in_time", type: "timestamptz", nullable: true })
  actualCheckInTime!: Date | null;

  @Column({ name: "actual_check_out_time", type: "timestamptz", nullable: true })
  actualCheckOutTime!: Date | null;

  @Column({ name: "source_type", type: "varchar", length: 32, default: "direct" })
  sourceType!: "direct" | "manual" | "ota_reserved";

  @Column({ name: "channel_name", type: "varchar", length: 100, nullable: true })
  channelName!: string | null;

  @Column({ name: "external_order_no", type: "varchar", length: 100, nullable: true })
  externalOrderNo!: string | null;

  @Column({ name: "channel_sync_status", type: "varchar", length: 32, default: "not_applicable" })
  channelSyncStatus!: string;

  @Column({ name: "guest_count", type: "integer", default: 1 })
  guestCount!: number;

  @Column({ type: "varchar", length: 8, default: "CNY" })
  currency!: string;

  @Column({ name: "room_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  roomAmount!: string;

  @Column({ name: "adjustment_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  adjustmentAmount!: string;

  @Column({ name: "total_amount", type: "numeric", precision: 18, scale: 2, default: 0 })
  totalAmount!: string;

  @Column({ name: "cancellation_policy_snapshot", type: "jsonb", default: () => "'{}'::jsonb" })
  cancellationPolicySnapshot!: Record<string, unknown>;

  @Column({ name: "cancel_reason", type: "varchar", length: 500, nullable: true })
  cancelReason!: string | null;

  @Column({ name: "cancelled_at", type: "timestamptz", nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: "no_show_at", type: "timestamptz", nullable: true })
  noShowAt!: Date | null;
}

@Entity("biz_homestay_booking_night")
@Index("uq_homestay_booking_night_scope_date", ["tenantId", "parkId", "bookingId", "businessDate"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayBookingNightEntity extends AuditableEntity {
  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ name: "business_date", type: "date" })
  businessDate!: string;

  @Column({ name: "base_rate", type: "numeric", precision: 18, scale: 2 })
  baseRate!: string;

  @Column({ name: "override_rate", type: "numeric", precision: 18, scale: 2, nullable: true })
  overrideRate!: string | null;

  @Column({ name: "final_rate", type: "numeric", precision: 18, scale: 2 })
  finalRate!: string;

  @Column({ name: "price_source", type: "varchar", length: 32 })
  priceSource!: "base" | "date_override";
}

@Entity("rel_homestay_booking_guest")
@Index("uq_homestay_booking_guest_scope", ["tenantId", "parkId", "bookingId", "partyId"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayBookingGuestEntity extends AuditableEntity {
  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ name: "party_id", type: "uuid" })
  partyId!: string;

  @Column({ name: "is_primary", type: "boolean", default: false })
  isPrimary!: boolean;

  @Column({ name: "verification_status", type: "varchar", length: 32, default: "unverified" })
  verificationStatus!: "unverified" | "verified" | "rejected";

  @Column({ name: "verified_by", type: "uuid", nullable: true })
  verifiedBy!: string | null;

  @Column({ name: "verified_at", type: "timestamptz", nullable: true })
  verifiedAt!: Date | null;
}

@Entity("biz_homestay_stay_credential")
export class HomestayStayCredentialEntity extends AuditableEntity {
  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ name: "credential_type", type: "varchar", length: 32 })
  credentialType!: "key" | "card" | "voucher";

  @Column({ name: "credential_label", type: "varchar", length: 100 })
  credentialLabel!: string;

  @Column({ name: "credential_reference", type: "varchar", length: 100, nullable: true })
  credentialReference!: string | null;

  @Column({ name: "lock_device_id", type: "varchar", length: 100, nullable: true })
  lockDeviceId!: string | null;

  @Column({ name: "temporary_code_task_status", type: "varchar", length: 32, default: "not_applicable" })
  temporaryCodeTaskStatus!: string;

  @Column({ type: "varchar", length: 32, default: "issued" })
  status!: "issued" | "returned" | "lost" | "void";

  @Column({ name: "issued_at", type: "timestamptz", default: () => "now()" })
  issuedAt!: Date;

  @Column({ name: "returned_at", type: "timestamptz", nullable: true })
  returnedAt!: Date | null;
}

@Entity("biz_homestay_ledger_entry")
export class HomestayLedgerEntryEntity extends AuditableEntity {
  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ name: "entry_type", type: "varchar", length: 32 })
  entryType!: HomestayLedgerEntryType;

  @Column({ name: "charge_type", type: "varchar", length: 32 })
  chargeType!: string;

  @Column({ type: "numeric", precision: 18, scale: 2 })
  amount!: string;

  @Column({ name: "payment_method", type: "varchar", length: 32, nullable: true })
  paymentMethod!: string | null;

  @Column({ name: "payment_channel", type: "varchar", length: 64, nullable: true })
  paymentChannel!: string | null;

  @Column({ name: "transaction_reference", type: "varchar", length: 100, nullable: true })
  transactionReference!: string | null;

  @Column({ type: "varchar", length: 32, default: "confirmed" })
  status!: "registered" | "confirmed" | "void";

  @Column({ type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "occurred_at", type: "timestamptz", default: () => "now()" })
  occurredAt!: Date;
}

@Entity("biz_homestay_turnover_task")
@Index("uq_homestay_turnover_scope_booking", ["tenantId", "parkId", "bookingId"], {
  unique: true,
  where: "is_deleted = false"
})
export class HomestayTurnoverTaskEntity extends AuditableEntity {
  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @Column({ name: "occupancy_id", type: "uuid", nullable: true })
  occupancyId!: string | null;

  @Column({ type: "varchar", length: 32, default: "pending" })
  status!: HomestayTurnoverStatus;

  @Column({ name: "assignee_id", type: "uuid", nullable: true })
  assigneeId!: string | null;

  @Column({ name: "assignee_name", type: "varchar", length: 100, nullable: true })
  assigneeName!: string | null;

  @Column({ name: "started_at", type: "timestamptz", nullable: true })
  startedAt!: Date | null;

  @Column({ name: "completed_at", type: "timestamptz", nullable: true })
  completedAt!: Date | null;

  @Column({ name: "inspected_at", type: "timestamptz", nullable: true })
  inspectedAt!: Date | null;

  @Column({ name: "photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  photoFileIds!: string[];

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  consumables!: Array<{ name: string; quantity: number; unit?: string }>;

  @Column({ name: "exception_description", type: "varchar", length: 1000, nullable: true })
  exceptionDescription!: string | null;

  @Column({ name: "linked_work_order_id", type: "uuid", nullable: true })
  linkedWorkOrderId!: string | null;
}

@Entity("biz_homestay_booking_action_log")
export class HomestayBookingActionLogEntity {
  @Column({ primary: true, generated: "uuid", type: "uuid" })
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "booking_id", type: "uuid" })
  bookingId!: string;

  @Column({ type: "varchar", length: 32 })
  action!: string;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32, nullable: true })
  afterStatus!: string | null;

  @Column({ type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  snapshot!: Record<string, unknown>;

  @Column({ name: "operator_id", type: "uuid" })
  operatorId!: string;

  @Column({ name: "operator_name", type: "varchar", length: 100 })
  operatorName!: string;

  @Column({ name: "action_time", type: "timestamptz", default: () => "now()" })
  actionTime!: Date;

  @Column({ name: "create_time", type: "timestamptz", default: () => "now()" })
  createTime!: Date;
}
