import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { EngineeringProjectStatus } from "../domain/engineering-project.enums";
import { EngineeringProjectAction } from "../domain/engineering-project-state-machine.types";

@Entity("biz_engineering_project_status_log")
@Index("idx_biz_engineering_project_status_log_scope", ["tenantId", "parkId", "projectId", "createdAt"])
@Index("idx_biz_engineering_project_status_log_actor", ["tenantId", "parkId", "actorUserId", "createdAt"])
export class EngineeringProjectStatusLogEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "project_id", type: "uuid" })
  projectId!: string;

  @Column({ name: "from_status", type: "varchar", length: 32 })
  fromStatus!: EngineeringProjectStatus;

  @Column({ name: "to_status", type: "varchar", length: 32 })
  toStatus!: EngineeringProjectStatus;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: EngineeringProjectAction;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "comment", type: "text", nullable: true })
  comment!: string | null;

  @Column({ name: "actor_user_id", type: "uuid" })
  actorUserId!: string;

  @Column({ name: "actor_name", type: "varchar", length: 100, nullable: true })
  actorName!: string | null;

  @Column({ name: "workflow_instance_id", type: "uuid", nullable: true })
  workflowInstanceId!: string | null;

  @Column({ name: "request_id", type: "varchar", length: 128, nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;
}
