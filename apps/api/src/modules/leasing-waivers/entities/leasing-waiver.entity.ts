import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";
import { LeasingReceivableEntity } from "../../leasing-receivables/entities/leasing-receivable.entity";

export interface LeasingWaiverApproveRecord {
  action: "apply" | "approve" | "reject";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string | null;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
}

@Entity("biz_leasing_waiver")
@Index("idx_biz_leasing_waiver_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_waiver_receivable_entity", ["tenantId", "parkId", "receivableId"])
@Index("idx_biz_leasing_waiver_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_waiver_status_apply_time_entity", ["tenantId", "parkId", "status", "applyTime"])
@Index("uk_biz_leasing_waiver_code_entity", ["tenantId", "parkId", "waiverCode"], { unique: true, where: "is_deleted = false" })
export class LeasingWaiverEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "waiver_code", type: "varchar", length: 64 })
  waiverCode!: string;

  @Column({ name: "receivable_id", type: "uuid" })
  receivableId!: string;

  @ManyToOne(() => LeasingReceivableEntity)
  @JoinColumn({ name: "receivable_id" })
  receivable!: LeasingReceivableEntity;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "waiver_amount", type: "numeric", precision: 14, scale: 2 })
  waiverAmount!: string;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "20" })
  status!: string;

  @Column({ name: "apply_by", type: "varchar", length: 64, nullable: true })
  applyBy!: string | null;

  @Column({ name: "apply_time", type: "timestamptz", default: () => "now()" })
  applyTime!: Date;

  @Column({ name: "approve_by", type: "varchar", length: 64, nullable: true })
  approveBy!: string | null;

  @Column({ name: "approve_time", type: "timestamptz", nullable: true })
  approveTime!: Date | null;

  @Column({ name: "reject_reason", type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;

  @Column({ name: "approve_records", type: "jsonb", default: [] })
  approveRecords!: LeasingWaiverApproveRecord[];
}
