import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_plan")
@Index("idx_sys_plan_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_plan_entity_code", ["tenantId", "parkId", "planCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class PlanEntity extends AuditableEntity {
  @Column({ name: "plan_code", type: "varchar", length: 64 })
  planCode!: string;

  @Column({ name: "plan_name", type: "varchar", length: 100 })
  planName!: string;

  @Column({ name: "description", type: "varchar", length: 500, nullable: true })
  description!: string | null;

  @Column({ name: "plan_type", type: "varchar", length: 32, default: "standard" })
  planType!: string;

  @Column({ name: "module_codes", type: "jsonb", default: [] })
  moduleCodes!: string[];

  @Column({ name: "permission_codes", type: "jsonb", default: [] })
  permissionCodes!: string[];

  @Column({ name: "max_users", type: "integer", default: 0 })
  maxUsers!: number;

  @Column({ name: "max_parks", type: "integer", default: 0 })
  maxParks!: number;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "feature_config", type: "jsonb", default: {} })
  featureConfig!: Record<string, unknown>;
}
