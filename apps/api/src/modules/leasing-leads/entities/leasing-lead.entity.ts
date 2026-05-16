import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { UserEntity } from "../../users/entities/user.entity";

@Entity("biz_leasing_lead")
@Index("idx_biz_leasing_lead_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("uk_biz_leasing_lead_code_entity", ["tenantId", "parkId", "leadCode"], { unique: true, where: "is_deleted = false" })
export class LeasingLeadEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "lead_code", type: "varchar", length: 64 })
  leadCode!: string;

  @Column({ name: "customer_name", type: "varchar", length: 200 })
  customerName!: string;

  @Column({ name: "contact_name", type: "varchar", length: 100 })
  contactName!: string;

  @Column({ name: "contact_mobile", type: "varchar", length: 32 })
  contactMobile!: string;

  @Column({ name: "contact_email", type: "varchar", length: 120, nullable: true })
  contactEmail!: string | null;

  @Column({ name: "source", type: "varchar", length: 32, nullable: true })
  source!: string | null;

  @Column({ name: "channel_name", type: "varchar", length: 100, nullable: true })
  channelName!: string | null;

  @Column({ name: "industry_code", type: "varchar", length: 64, nullable: true })
  industryCode!: string | null;

  @Column({ name: "industry_detail", type: "varchar", length: 200, nullable: true })
  industryDetail!: string | null;

  @Column({ name: "demand_area", type: "numeric", precision: 14, scale: 2, nullable: true })
  demandArea!: string | null;

  @Column({ name: "demand_price", type: "numeric", precision: 14, scale: 2, nullable: true })
  demandPrice!: string | null;

  @Column({ name: "demand_unit_type", type: "varchar", length: 32, nullable: true })
  demandUnitType!: string | null;

  @Column({ name: "intention_level", type: "varchar", length: 32, nullable: true })
  intentionLevel!: string | null;

  @Column({ name: "follow_user_id", type: "uuid", nullable: true })
  followUserId!: string | null;

  @Column({ name: "follow_user_name", type: "varchar", length: 100, nullable: true })
  followUserName!: string | null;

  @Column({ name: "park_tenant_id", type: "uuid", nullable: true })
  parkTenantId!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "lost_reason", type: "varchar", length: 64, nullable: true })
  lostReason!: string | null;

  @Column({ name: "lost_remark", type: "varchar", length: 500, nullable: true })
  lostRemark!: string | null;

  @Column({ name: "last_follow_time", type: "timestamptz", nullable: true })
  lastFollowTime!: Date | null;

  @Column({ name: "next_follow_time", type: "timestamptz", nullable: true })
  nextFollowTime!: Date | null;

  @Column({ name: "expected_close_date", type: "date", nullable: true })
  expectedCloseDate!: string | null;

  @Column({ name: "is_in_pool", type: "boolean", default: false })
  isInPool!: boolean;

  @Column({ name: "pool_enter_time", type: "timestamptz", nullable: true })
  poolEnterTime!: Date | null;

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: "follow_user_id" })
  followUser?: UserEntity | null;

  @ManyToOne(() => ParkTenantEntity, { nullable: true })
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant?: ParkTenantEntity | null;
}
