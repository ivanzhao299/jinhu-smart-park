import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("scene_template")
@Index("idx_scene_template_tenant_deleted", ["tenantId", "isDeleted"])
@Index("uk_scene_template_code", ["tenantId", "sceneCode"], { unique: true, where: "is_deleted = false" })
export class SceneTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "scene_code", type: "varchar", length: 64 })
  sceneCode!: string;

  @Column({ name: "scene_name", type: "varchar", length: 200 })
  sceneName!: string;

  @Column({ name: "scene_type", type: "varchar", length: 64 })
  sceneType!: string;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "trigger_config_json", type: "jsonb", default: () => "'{}'::jsonb" })
  triggerConfigJson!: Record<string, unknown>;

  @Column({ name: "action_config_json", type: "jsonb", default: () => "'[]'::jsonb" })
  actionConfigJson!: Array<Record<string, unknown>>;

  @Column({ name: "is_system", type: "boolean", default: false })
  isSystem!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "ENABLED" })
  status!: string;

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

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
