import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_user_message")
@Index("idx_biz_user_message_recipient_read", ["tenantId", "parkId", "recipientId", "readAt", "isDeleted"])
@Index("idx_biz_user_message_source", ["tenantId", "parkId", "sourceType", "sourceId", "isDeleted"])
@Index("uk_biz_user_message_unique_key", ["tenantId", "parkId", "recipientId", "uniqueKey"], {
  unique: true,
  where: "is_deleted = false"
})
export class UserMessageEntity extends AuditableEntity {
  @Column({ name: "recipient_id", type: "uuid" })
  recipientId!: string;

  @Column({ name: "recipient_name", type: "varchar", length: 100, nullable: true })
  recipientName!: string | null;

  @Column({ name: "sender_id", type: "uuid", nullable: true })
  senderId!: string | null;

  @Column({ name: "sender_name", type: "varchar", length: 100, nullable: true })
  senderName!: string | null;

  @Column({ name: "category", type: "varchar", length: 64, default: "workflow" })
  category!: string;

  @Column({ name: "priority", type: "varchar", length: 32, default: "normal" })
  priority!: string;

  @Column({ name: "source_type", type: "varchar", length: 64 })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "biz_type", type: "varchar", length: 64 })
  bizType!: string;

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "action", type: "varchar", length: 64, nullable: true })
  action!: string | null;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "content", type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "target_url", type: "varchar", length: 255, nullable: true })
  targetUrl!: string | null;

  @Column({ name: "read_at", type: "timestamptz", nullable: true })
  readAt!: Date | null;

  @Column({ name: "archived_at", type: "timestamptz", nullable: true })
  archivedAt!: Date | null;

  @Column({ name: "unique_key", type: "varchar", length: 180 })
  uniqueKey!: string;

  @Column({ name: "payload", type: "jsonb", default: {} })
  payload!: Record<string, unknown>;
}
