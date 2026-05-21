import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_auth_policy")
export class AuthPolicyEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64, nullable: true })
  parkId!: string | null;

  @Column({ name: "allow_password_login", type: "boolean", default: true })
  allowPasswordLogin!: boolean;

  @Column({ name: "allow_mobile_login", type: "boolean", default: true })
  allowMobileLogin!: boolean;

  @Column({ name: "allow_wechat_open_login", type: "boolean", default: false })
  allowWechatOpenLogin!: boolean;

  @Column({ name: "allow_wechat_mp_login", type: "boolean", default: false })
  allowWechatMpLogin!: boolean;

  @Column({ name: "require_bound_identity", type: "boolean", default: true })
  requireBoundIdentity!: boolean;

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
