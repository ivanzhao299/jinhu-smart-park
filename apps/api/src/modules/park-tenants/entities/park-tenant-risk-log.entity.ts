import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { ParkTenantEntity } from "./park-tenant.entity";

@Entity("biz_park_tenant_risk_log")
@Index("idx_biz_park_tenant_risk_log_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_park_tenant_risk_log_entity_parent_time", ["tenantId", "parkId", "parkTenantId", "opTime"])
export class ParkTenantRiskLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "park_tenant_id", type: "uuid" })
  parkTenantId!: string;

  @ManyToOne(() => ParkTenantEntity)
  @JoinColumn({ name: "park_tenant_id" })
  parkTenant!: ParkTenantEntity;

  @Column({ name: "before_risk_level", type: "varchar", length: 32, nullable: true })
  beforeRiskLevel!: string | null;

  @Column({ name: "after_risk_level", type: "varchar", length: 32 })
  afterRiskLevel!: string;

  @Column({ name: "before_risk_tags", type: "jsonb", default: [] })
  beforeRiskTags!: string[];

  @Column({ name: "after_risk_tags", type: "jsonb", default: [] })
  afterRiskTags!: string[];

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "operator_id", type: "varchar", length: 64, nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;

  @Column({ name: "create_by", type: "varchar", length: 64, nullable: true })
  createBy!: string | null;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @Column({ name: "update_by", type: "varchar", length: 64, nullable: true })
  updateBy!: string | null;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
