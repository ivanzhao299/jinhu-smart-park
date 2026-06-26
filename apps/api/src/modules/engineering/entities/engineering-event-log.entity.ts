import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import type { EngineeringEventType } from "../events/engineering-event.types";

@Entity("biz_engineering_event_log")
@Index("idx_biz_engineering_event_log_scope", ["tenantId", "parkId", "occurredAt"])
@Index("idx_biz_engineering_event_log_project", ["tenantId", "parkId", "projectId", "occurredAt"])
@Index("idx_biz_engineering_event_log_entity", ["tenantId", "entityId", "occurredAt"])
@Index("idx_biz_engineering_event_log_type", ["tenantId", "eventType", "occurredAt"])
@Index("uk_biz_engineering_event_log_event_id", ["eventId"], { unique: true })
export class EngineeringEventLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "event_id", type: "uuid" })
  eventId!: string;

  @Column({ name: "event_type", type: "varchar", length: 100 })
  eventType!: EngineeringEventType;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "project_id", type: "uuid", nullable: true })
  projectId!: string | null;

  @Column({ name: "entity_id", type: "uuid" })
  entityId!: string;

  @Column({ name: "actor_user_id", type: "uuid", nullable: true })
  actorUserId!: string | null;

  @Column({ name: "occurred_at", type: "timestamptz" })
  occurredAt!: Date;

  @Column({ name: "payload", type: "jsonb" })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
