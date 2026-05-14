import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_attachment")
@Index("idx_sys_attachment_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_attachment_scope_biz", ["tenantId", "parkId", "bizType", "bizId"])
export class AttachmentEntity extends AuditableEntity {
  @Column({ name: "biz_type", type: "varchar", length: 64 })
  bizType!: string;

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "file_name", type: "varchar", length: 255 })
  fileName!: string;

  @Column({ name: "file_ext", type: "varchar", length: 32, nullable: true })
  fileExt!: string | null;

  @Column({ name: "mime_type", type: "varchar", length: 128, nullable: true })
  mimeType!: string | null;

  @Column({ name: "file_size", type: "bigint" })
  fileSize!: string;

  @Column({ name: "storage_provider", type: "varchar", length: 32 })
  storageProvider!: string;

  @Column({ name: "storage_key", type: "varchar", length: 500 })
  storageKey!: string;

  @Column({ name: "sha256", type: "varchar", length: 64, nullable: true })
  sha256!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
