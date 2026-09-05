import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn
} from "typeorm";

@Entity("sys_business_scope_module")
@Index(
  "idx_sys_business_scope_module_resolve",
  ["tenantId", "scopeId", "moduleCode", "status", "isDeleted"]
)
@Index("uq_sys_business_scope_module_active", ["tenantId", "scopeId", "moduleCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class BusinessScopeModuleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "scope_id", type: "uuid" })
  scopeId!: string;

  @Column({ name: "module_code", type: "varchar", length: 64 })
  moduleCode!: string;

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
