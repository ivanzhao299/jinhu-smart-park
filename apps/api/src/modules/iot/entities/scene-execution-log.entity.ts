import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("scene_execution_log")
@Index("idx_scene_execution_log_instance_time", ["tenantId", "parkId", "sceneInstanceId", "executedAt", "isDeleted"])
@Index("idx_scene_execution_log_status", ["tenantId", "parkId", "executionStatus", "executedAt", "isDeleted"])
export class SceneExecutionLogEntity extends AuditableEntity {
  @Column({ name: "scene_instance_id", type: "uuid" })
  sceneInstanceId!: string;

  @Column({ name: "trigger_type", type: "varchar", length: 32 })
  triggerType!: string;

  @Column({ name: "trigger_payload", type: "jsonb", default: () => "'{}'::jsonb" })
  triggerPayload!: Record<string, unknown>;

  @Column({ name: "execution_status", type: "varchar", length: 32 })
  executionStatus!: string;

  @Column({ name: "action_result_json", type: "jsonb", default: () => "'[]'::jsonb" })
  actionResultJson!: Array<Record<string, unknown>>;

  @Column({ name: "error_message", type: "text", nullable: true })
  errorMessage!: string | null;

  @Column({ name: "executed_by", type: "uuid", nullable: true })
  executedBy!: string | null;

  @Column({ name: "executed_at", type: "timestamptz", default: () => "now()" })
  executedAt!: Date;
}
