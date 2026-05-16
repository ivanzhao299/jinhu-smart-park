import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UnitEntity } from "../../units/entities/unit.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { LeasingLeadEntity } from "./leasing-lead.entity";

export interface LeasingQuoteApproveRecord {
  action: "submit" | "approve" | "reject";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
  priceWarning?: string | null;
}

@Entity("biz_leasing_quote")
@Index("idx_biz_leasing_quote_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_quote_lead_status_entity", ["tenantId", "parkId", "leadId", "quoteStatus"])
export class LeasingQuoteEntity extends AuditableEntity {
  @Column({ name: "lead_id", type: "uuid" })
  leadId!: string;

  @ManyToOne(() => LeasingLeadEntity)
  @JoinColumn({ name: "lead_id" })
  lead!: LeasingLeadEntity;

  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity)
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "quote_price", type: "numeric", precision: 14, scale: 2, default: 0 })
  quotePrice!: string;

  @Column({ name: "quote_period", type: "varchar", length: 100, nullable: true })
  quotePeriod!: string | null;

  @Column({ name: "free_rent_months", type: "numeric", precision: 8, scale: 2, default: 0 })
  freeRentMonths!: string;

  @Column({ name: "deposit_months", type: "numeric", precision: 8, scale: 2, default: 0 })
  depositMonths!: string;

  @Column({ name: "payment_period", type: "varchar", length: 32, nullable: true })
  paymentPeriod!: string | null;

  @Column({ name: "property_fee_price", type: "numeric", precision: 14, scale: 2, default: 0 })
  propertyFeePrice!: string;

  @Column({ name: "quote_status", type: "varchar", length: 32, default: "10" })
  quoteStatus!: string;

  @Column({ name: "approve_records", type: "jsonb", default: [] })
  approveRecords!: LeasingQuoteApproveRecord[];

  @Column({ name: "submit_time", type: "timestamptz", nullable: true })
  submitTime!: Date | null;

  @Column({ name: "approve_time", type: "timestamptz", nullable: true })
  approveTime!: Date | null;

  @Column({ name: "approve_by", type: "uuid", nullable: true })
  approveBy!: string | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "approve_by" })
  approveUser?: UserEntity | null;

  @Column({ name: "reject_reason", type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;
}
