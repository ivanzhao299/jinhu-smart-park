import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn
} from "typeorm";
import type { BusinessScopeKind } from "@jinhu/shared";

@Entity("sys_business_scope")
@Index("uq_sys_business_scope_tenant_id", ["tenantId", "id"], { unique: true })
@Index("idx_sys_business_scope_resolve", ["tenantId", "id", "scopeKind", "status", "isDeleted"])
export class BusinessScopeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_row_id", type: "uuid" })
  tenantRowId!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "scope_kind", type: "varchar", length: 16 })
  scopeKind!: BusinessScopeKind;

  @Column({ name: "scope_code", type: "varchar", length: 64 })
  scopeCode!: string;

  @Column({ name: "scope_name", type: "varchar", length: 100 })
  scopeName!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "create_by", type: "uuid", nullable: true })
  createBy!: string | null;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @Column({ name: "update_by", type: "uuid", nullable: true })
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
