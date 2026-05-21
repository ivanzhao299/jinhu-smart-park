import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_auth_otp_code")
@Index("idx_sys_auth_otp_code_lookup", ["tenantId", "mobile", "scene", "used", "expiresAt", "isDeleted"])
export class AuthOtpCodeEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64, nullable: true })
  parkId!: string | null;

  @Column({ name: "mobile", type: "varchar", length: 32 })
  mobile!: string;

  @Column({ name: "scene", type: "varchar", length: 32, default: "login" })
  scene!: string;

  @Column({ name: "code_hash", type: "varchar", length: 128 })
  codeHash!: string;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "used", type: "boolean", default: false })
  used!: boolean;

  @Column({ name: "used_time", type: "timestamptz", nullable: true })
  usedTime!: Date | null;

  @Column({ name: "attempt_count", type: "integer", default: 0 })
  attemptCount!: number;

  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

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
