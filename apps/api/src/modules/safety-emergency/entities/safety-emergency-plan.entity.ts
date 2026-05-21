import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_emergency_plan")
@Index("idx_biz_safety_emergency_plan_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_emergency_plan_incident", ["tenantId", "parkId", "incidentType", "isDeleted"])
@Index("idx_biz_safety_emergency_plan_severity", ["tenantId", "parkId", "severityLevel", "isDeleted"])
@Index("uk_biz_safety_emergency_plan_code", ["tenantId", "parkId", "planCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyEmergencyPlanEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "plan_code", type: "varchar", length: 64 })
  planCode!: string;

  @Column({ name: "plan_name", type: "varchar", length: 200 })
  planName!: string;

  @Column({ name: "incident_type", type: "varchar", length: 64 })
  incidentType!: string;

  @Column({ name: "severity_level", type: "varchar", length: 32 })
  severityLevel!: string;

  @Column({ name: "response_level", type: "varchar", length: 32, nullable: true })
  responseLevel!: string | null;

  @Column({ name: "commander_role", type: "varchar", length: 64, nullable: true })
  commanderRole!: string | null;

  @Column({ name: "response_team_role_codes", type: "jsonb", default: () => "'[]'::jsonb" })
  responseTeamRoleCodes!: string[];

  @Column({ name: "steps_json", type: "jsonb", default: () => "'[]'::jsonb" })
  stepsJson!: unknown;

  @Column({ name: "attachment_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  attachmentFileIds!: string[];

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
