import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_file")
@Index("idx_sys_file_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_file_scope_biz", ["tenantId", "parkId", "bizType", "bizId"])
@Index("idx_sys_file_scope_code", ["tenantId", "parkId", "fileCode"], { unique: true })
export class FileEntity extends AuditableEntity {
  @Column({ name: "file_code", type: "varchar", length: 32 })
  fileCode!: string;

  @Column({ name: "original_name", type: "varchar", length: 255 })
  originalName!: string;

  @Column({ name: "stored_name", type: "varchar", length: 255 })
  storedName!: string;

  @Column({ name: "file_url", type: "varchar", length: 500 })
  fileUrl!: string;

  @Column({ name: "file_size", type: "bigint" })
  fileSize!: string;

  @Column({ name: "mime_type", type: "varchar", length: 128 })
  mimeType!: string;

  @Column({ name: "md5", type: "varchar", length: 32 })
  md5!: string;

  @Column({ name: "biz_type", type: "varchar", length: 64 })
  bizType!: string;

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "storage_type", type: "varchar", length: 32, default: "local" })
  storageType!: string;

  @Column({ name: "storage_bucket", type: "varchar", length: 128, nullable: true })
  storageBucket!: string | null;

  @Column({ name: "storage_path", type: "varchar", length: 500 })
  storagePath!: string;

  @Column({ name: "is_encrypted", type: "boolean", default: false })
  isEncrypted!: boolean;

  @Column({ name: "status", type: "smallint", default: 1 })
  status!: number;
}
