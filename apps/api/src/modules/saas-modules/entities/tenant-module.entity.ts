import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { PlanEntity } from "./plan.entity";
import { SaaSModuleEntity } from "./saas-module.entity";

@Entity("rel_tenant_module")
@Index("idx_rel_tenant_module_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_rel_tenant_module_entity_unique", ["tenantId", "parkId", "moduleId"], {
  unique: true,
  where: "is_deleted = false"
})
export class TenantModuleEntity extends AuditableEntity {
  @Column({ name: "tenant_code", type: "varchar", length: 64, nullable: true })
  tenantCode!: string | null;

  @Column({ name: "module_id", type: "uuid" })
  moduleId!: string;

  @ManyToOne(() => SaaSModuleEntity, { nullable: true })
  @JoinColumn({ name: "module_id" })
  module!: SaaSModuleEntity | null;

  @Column({ name: "plan_id", type: "uuid", nullable: true })
  planId!: string | null;

  @ManyToOne(() => PlanEntity, { nullable: true })
  @JoinColumn({ name: "plan_id" })
  plan!: PlanEntity | null;

  @Column({ name: "start_time", type: "timestamptz", nullable: true })
  startTime!: Date | null;

  @Column({ name: "expire_time", type: "timestamptz", nullable: true })
  expireTime!: Date | null;

  @Column({ name: "enabled", type: "boolean", default: true })
  enabled!: boolean;

  @Column({ name: "feature_config", type: "jsonb", default: {} })
  featureConfig!: Record<string, unknown>;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
