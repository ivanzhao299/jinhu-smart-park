import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_auth_login_ticket")
export class AuthLoginTicketEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "provider", type: "varchar", length: 32 })
  provider!: string;

  @Column({ name: "ticket", type: "varchar", length: 191 })
  ticket!: string;

  @Column({ name: "context_payload", type: "jsonb" })
  contextPayload!: Record<string, unknown>;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "used", type: "boolean", default: false })
  used!: boolean;

  @Column({ name: "used_time", type: "timestamptz", nullable: true })
  usedTime!: Date | null;

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
