import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("energy_allocation_rule")
@Index("idx_energy_allocation_rule_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_energy_allocation_rule_meter_scope", ["tenantId", "parkId", "meterType", "allocationScope", "status", "isDeleted"])
export class EnergyAllocationRuleEntity extends AuditableEntity {
  @Column({ name: "rule_name", type: "varchar", length: 160 })
  ruleName!: string;

  @Column({ name: "meter_type", type: "varchar", length: 32 })
  meterType!: string;

  @Column({ name: "allocation_scope", type: "varchar", length: 32 })
  allocationScope!: string;

  @Column({ name: "allocation_method", type: "varchar", length: 32 })
  allocationMethod!: string;

  @Column({ name: "public_meter_id", type: "uuid" })
  publicMeterId!: string;

  @Column({ name: "scope_id", type: "uuid", nullable: true })
  scopeId!: string | null;

  @Column({ name: "rule_config_json", type: "jsonb", default: {} })
  ruleConfigJson!: Record<string, unknown>;

  @Column({ name: "status", type: "varchar", length: 32, default: "ENABLED" })
  status!: string;
}
