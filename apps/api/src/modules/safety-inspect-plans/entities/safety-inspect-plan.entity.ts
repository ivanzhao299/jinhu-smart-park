import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { SafetyInspectTemplateEntity } from "../../safety-inspect-templates/entities/safety-inspect-template.entity";

@Entity("biz_safety_inspect_plan")
@Index("idx_biz_safety_inspect_plan_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_plan_template", ["tenantId", "parkId", "templateId", "isDeleted"])
@Index("idx_biz_safety_inspect_plan_frequency", ["tenantId", "parkId", "frequencyType", "isDeleted"])
@Index("idx_biz_safety_inspect_plan_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("uk_biz_safety_inspect_plan_code", ["tenantId", "parkId", "planCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyInspectPlanEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "plan_code", type: "varchar", length: 64 })
  planCode!: string;

  @Column({ name: "plan_name", type: "varchar", length: 200 })
  planName!: string;

  @Column({ name: "template_id", type: "uuid" })
  templateId!: string;

  @ManyToOne(() => SafetyInspectTemplateEntity, { nullable: false })
  @JoinColumn({ name: "template_id" })
  template!: SafetyInspectTemplateEntity;

  @Column({ name: "point_ids", type: "jsonb", default: [] })
  pointIds!: string[];

  @Column({ name: "frequency_type", type: "varchar", length: 64 })
  frequencyType!: string;

  @Column({ name: "cron_expr", type: "varchar", length: 120, nullable: true })
  cronExpr!: string | null;

  @Column({ name: "start_date", type: "date" })
  startDate!: string;

  @Column({ name: "end_date", type: "date", nullable: true })
  endDate!: string | null;

  @Column({ name: "handler_user_ids", type: "jsonb", default: [] })
  handlerUserIds!: string[];

  @Column({ name: "handler_role_codes", type: "jsonb", default: [] })
  handlerRoleCodes!: string[];

  @Column({ name: "next_generate_time", type: "timestamptz", nullable: true })
  nextGenerateTime!: Date | null;

  @Column({ name: "last_generate_time", type: "timestamptz", nullable: true })
  lastGenerateTime!: Date | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "disabled" })
  status!: string;
}
