import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn
} from "typeorm";

@Entity("sys_user_business_scope_membership")
@Index(
  "idx_sys_user_business_scope_membership_resolve",
  ["tenantId", "userId", "scopeId", "status", "isDeleted"]
)
@Index("uq_sys_user_business_scope_membership_active", ["tenantId", "scopeId", "userId"], {
  unique: true,
  where: "is_deleted = false"
})
export class BusinessScopeMembershipEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "scope_id", type: "uuid" })
  scopeId!: string;

  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

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
