import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("scene_instance")
@Index("idx_scene_instance_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_scene_instance_type_status", ["tenantId", "parkId", "sceneType", "status", "isDeleted"])
@Index("idx_scene_instance_rule", ["tenantId", "parkId", "linkedRuleId", "isDeleted"])
export class SceneInstanceEntity extends AuditableEntity {
  @Column({ name: "template_id", type: "uuid", nullable: true })
  templateId!: string | null;

  @Column({ name: "scene_name", type: "varchar", length: 200 })
  sceneName!: string;

  @Column({ name: "scene_type", type: "varchar", length: 64 })
  sceneType!: string;

  @Column({ name: "trigger_mode", type: "varchar", length: 32, default: "MANUAL" })
  triggerMode!: string;

  @Column({ name: "linked_rule_id", type: "uuid", nullable: true })
  linkedRuleId!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "DISABLED" })
  status!: string;

  @Column({ name: "priority", type: "integer", default: 100 })
  priority!: number;

  @Column({ name: "trigger_config_json", type: "jsonb", default: () => "'{}'::jsonb" })
  triggerConfigJson!: Record<string, unknown>;

  @Column({ name: "action_config_json", type: "jsonb", default: () => "'[]'::jsonb" })
  actionConfigJson!: Array<Record<string, unknown>>;

  @Column({ name: "last_triggered_at", type: "timestamptz", nullable: true })
  lastTriggeredAt!: Date | null;
}
