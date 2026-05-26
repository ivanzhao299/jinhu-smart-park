import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("video_platform_config")
@Index("idx_video_platform_config_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_video_platform_config_type_status", ["tenantId", "parkId", "platformType", "status", "isDeleted"])
export class VideoPlatformConfigEntity extends AuditableEntity {
  @Column({ name: "platform_type", type: "varchar", length: 64 })
  platformType!: string;

  @Column({ name: "platform_name", type: "varchar", length: 200 })
  platformName!: string;

  @Column({ name: "vendor_name", type: "varchar", length: 160, nullable: true })
  vendorName!: string | null;

  @Column({ name: "app_key", type: "varchar", length: 256, nullable: true })
  appKey!: string | null;

  @Column({ name: "app_secret_encrypted", type: "text", nullable: true })
  appSecretEncrypted!: string | null;

  @Column({ name: "access_token_encrypted", type: "text", nullable: true })
  accessTokenEncrypted!: string | null;

  @Column({ name: "refresh_token_encrypted", type: "text", nullable: true })
  refreshTokenEncrypted!: string | null;

  @Column({ name: "token_expire_at", type: "timestamptz", nullable: true })
  tokenExpireAt!: Date | null;

  @Column({ name: "api_base_url", type: "varchar", length: 500, nullable: true })
  apiBaseUrl!: string | null;

  @Column({ name: "callback_url", type: "varchar", length: 500, nullable: true })
  callbackUrl!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "ACTIVE" })
  status!: string;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
