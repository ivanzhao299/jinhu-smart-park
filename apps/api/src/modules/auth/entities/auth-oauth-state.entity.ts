import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_auth_oauth_state")
export class AuthOauthStateEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64, nullable: true })
  tenantId!: string | null;

  @Column({ name: "park_id", type: "varchar", length: 64, nullable: true })
  parkId!: string | null;

  @Column({ name: "provider", type: "varchar", length: 32 })
  provider!: string;

  @Column({ name: "state", type: "varchar", length: 191 })
  state!: string;

  @Column({ name: "redirect_uri", type: "varchar", length: 500, nullable: true })
  redirectUri!: string | null;

  @Column({ name: "context_json", type: "jsonb", nullable: true })
  contextJson!: Record<string, unknown> | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "consumed", type: "boolean", default: false })
  consumed!: boolean;

  @Column({ name: "consumed_time", type: "timestamptz", nullable: true })
  consumedTime!: Date | null;

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
