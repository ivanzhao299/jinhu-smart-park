import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { LeasingContractEntity } from "../../leasing-contracts/entities/leasing-contract.entity";
import { ParkTenantEntity } from "../../park-tenants/entities/park-tenant.entity";

export interface LeasingContractChangeApproveRecord {
  action: "create" | "update" | "submit" | "approve" | "reject" | "effective" | "void";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string | null;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
}

@Entity("biz_leasing_contract_change")
@Index("idx_biz_leasing_contract_change_scope_deleted_entity", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_leasing_contract_change_contract_entity", ["tenantId", "parkId", "contractId"])
@Index("idx_biz_leasing_contract_change_tenant_company_entity", ["tenantId", "parkId", "parkTenantId"])
@Index("idx_biz_leasing_contract_change_status_entity", ["tenantId", "parkId", "status"])
@Index("uk_biz_leasing_contract_change_code_entity", ["tenantId", "parkId", "changeCode"], { unique: true, where: "is_deleted = false" })
export class LeasingContractChangeEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "change_code", type: "varchar", length: 64 })
  changeCode!: string;

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

  @Column({ name: "change_type", type: "varchar", length: 32 })
  changeType!: string;

  @Column({ name: "change_reason", type: "varchar", length: 500 })
  changeReason!: string;

  @Column({ name: "effective_date", type: "date" })
  effectiveDate!: string;

  @Column({ name: "before_snapshot", type: "jsonb", default: {} })
  beforeSnapshot!: Record<string, unknown>;

  @Column({ name: "after_snapshot", type: "jsonb", default: {} })
  afterSnapshot!: Record<string, unknown>;

  @Column({ name: "finance_impact", type: "jsonb", default: {} })
  financeImpact!: Record<string, unknown>;

  @Column({ name: "receivable_policy", type: "varchar", length: 32, default: "manual_review" })
  receivablePolicy!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  @Column({ name: "submit_time", type: "timestamptz", nullable: true })
  submitTime!: Date | null;

  @Column({ name: "approve_time", type: "timestamptz", nullable: true })
  approveTime!: Date | null;

  @Column({ name: "approve_by", type: "uuid", nullable: true })
  approveBy!: string | null;

  @Column({ name: "reject_reason", type: "varchar", length: 500, nullable: true })
  rejectReason!: string | null;

  @Column({ name: "approve_records", type: "jsonb", default: [] })
  approveRecords!: LeasingContractChangeApproveRecord[];
}
