import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { SafetyInspectPlanEntity } from "../../safety-inspect-plans/entities/safety-inspect-plan.entity";
import { SafetyInspectPointEntity } from "../../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectTemplateEntity } from "../../safety-inspect-templates/entities/safety-inspect-template.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { SafetyInspectTaskResultEntity } from "./safety-inspect-task-result.entity";

@Entity("biz_safety_inspect_task")
@Index("idx_biz_safety_inspect_task_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_task_plan", ["tenantId", "parkId", "planId", "planTime", "isDeleted"])
@Index("idx_biz_safety_inspect_task_point", ["tenantId", "parkId", "pointId", "isDeleted"])
@Index("idx_biz_safety_inspect_task_handler", ["tenantId", "parkId", "handlerId", "status", "isDeleted"])
@Index("idx_biz_safety_inspect_task_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("uk_biz_safety_inspect_task_plan_point_time", ["tenantId", "parkId", "planId", "pointId", "planTime"], {
  unique: true,
  where: "plan_id IS NOT NULL AND is_deleted = false"
})
@Index("uk_biz_safety_inspect_task_code", ["tenantId", "parkId", "taskCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyInspectTaskEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "task_code", type: "varchar", length: 64 })
  taskCode!: string;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @ManyToOne(() => SafetyInspectPlanEntity, { nullable: true })
  @JoinColumn({ name: "plan_id" })
  plan?: SafetyInspectPlanEntity | null;

  @Column({ name: "template_id", type: "uuid" })
  templateId!: string;

  @ManyToOne(() => SafetyInspectTemplateEntity)
  @JoinColumn({ name: "template_id" })
  template!: SafetyInspectTemplateEntity;

  @Column({ name: "point_id", type: "uuid" })
  pointId!: string;

  @ManyToOne(() => SafetyInspectPointEntity)
  @JoinColumn({ name: "point_id" })
  point!: SafetyInspectPointEntity;

  @Column({ name: "handler_id", type: "uuid" })
  handlerId!: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: "handler_id" })
  handler!: UserEntity;

  @Column({ name: "handler_name", type: "varchar", length: 100 })
  handlerName!: string;

  @Column({ name: "plan_time", type: "timestamptz" })
  planTime!: Date;

  @Column({ name: "due_time", type: "timestamptz" })
  dueTime!: Date;

  @Column({ name: "actual_start_time", type: "timestamptz", nullable: true })
  actualStartTime!: Date | null;

  @Column({ name: "actual_end_time", type: "timestamptz", nullable: true })
  actualEndTime!: Date | null;

  @Column({ name: "scan_ok", type: "boolean", default: false })
  scanOk!: boolean;

  @Column({ name: "gps_lng", type: "numeric", precision: 12, scale: 6, nullable: true })
  gpsLng!: string | null;

  @Column({ name: "gps_lat", type: "numeric", precision: 12, scale: 6, nullable: true })
  gpsLat!: string | null;

  @Column({ name: "gps_offset_meter", type: "numeric", precision: 12, scale: 2, nullable: true })
  gpsOffsetMeter!: string | null;

  @Column({ name: "photo_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  photoFileIds!: string[];

  @Column({ name: "result", type: "varchar", length: 32, nullable: true })
  result!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "10" })
  status!: string;

  results!: SafetyInspectTaskResultEntity[];
}
