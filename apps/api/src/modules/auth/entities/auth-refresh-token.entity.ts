import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_auth_refresh_token")
@Index("idx_sys_auth_refresh_token_user", ["tenantId", "parkId", "userId", "revoked", "isDeleted"])
export class AuthRefreshTokenEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "token_hash", type: "varchar", length: 128 })
  tokenHash!: string;

  @Column({ name: "device_id", type: "varchar", length: 128, nullable: true })
  deviceId!: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @Column({ name: "revoked", type: "boolean", default: false })
  revoked!: boolean;

  @Column({ name: "revoked_time", type: "timestamptz", nullable: true })
  revokedTime!: Date | null;
}
