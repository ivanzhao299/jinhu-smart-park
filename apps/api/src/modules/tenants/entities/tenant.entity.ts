import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_tenant")
@Index("idx_sys_tenant_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_tenant_entity_code", ["tenantCode"], { unique: true, where: "is_deleted = false" })
export class TenantEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64, default: "0" })
  parkId!: string;

  @Column({ name: "tenant_code", type: "varchar", length: 64 })
  tenantCode!: string;

  @Column({ name: "tenant_name", type: "varchar", length: 100 })
  tenantName!: string;

  @Column({ name: "tenant_type", type: "varchar", length: 32, default: "park_operator" })
  tenantType!: string;

  @Column({ name: "contact_name", type: "varchar", length: 100, nullable: true })
  contactName!: string | null;

  @Column({ name: "contact_mobile", type: "varchar", length: 32, nullable: true })
  contactMobile!: string | null;

  @Column({ name: "contact_user_id", type: "uuid", nullable: true })
  contactUserId!: string | null;

  @Column({ name: "websites", type: "jsonb", default: [] })
  websites!: string[];

  @Column({ name: "domains", type: "jsonb", default: [] })
  domains!: string[];

  @Column({ name: "status", type: "integer", default: 1 })
  status!: number;

  @Column({ name: "expire_time", type: "timestamptz", nullable: true })
  expireTime!: Date | null;

  @Column({ name: "max_users", type: "integer", default: 0 })
  maxUsers!: number;

  @Column({ name: "max_parks", type: "integer", default: 0 })
  maxParks!: number;

  @Column({ name: "plan_code", type: "varchar", length: 64, nullable: true })
  planCode!: string | null;

  @Column({ name: "feature_config", type: "jsonb", default: {} })
  featureConfig!: Record<string, unknown>;

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
