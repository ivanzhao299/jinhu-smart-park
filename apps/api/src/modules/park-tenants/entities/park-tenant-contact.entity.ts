import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";
import { ParkTenantEntity } from "./park-tenant.entity";

@Entity("biz_park_tenant_contact")
@Index("idx_biz_park_tenant_contact_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_park_tenant_contact_entity_parent", ["tenantId", "parkId", "parkTenantId", "isDeleted"])
export class ParkTenantContactEntity {
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

  @Column({ name: "contact_name", type: "varchar", length: 100 })
  contactName!: string;

  @Column({ name: "contact_role", type: "varchar", length: 64, nullable: true })
  contactRole!: string | null;

  @Column({ name: "mobile", type: "varchar", length: 32, nullable: true })
  mobile!: string | null;

  @Column({ name: "email", type: "varchar", length: 120, nullable: true })
  email!: string | null;

  @Column({ name: "position", type: "varchar", length: 100, nullable: true })
  position!: string | null;

  @Column({ name: "is_primary", type: "boolean", default: false })
  isPrimary!: boolean;

  @Column({ name: "is_emergency", type: "boolean", default: false })
  isEmergency!: boolean;

  @Column({ name: "status", type: "integer", default: 1 })
  status!: number;

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
