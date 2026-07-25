import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import type { PropertyOperatingMode } from "@jinhu/shared";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_property_mode_transition_log")
@Index("idx_property_mode_transition_scope_unit_time", ["tenantId", "parkId", "unitId", "transitionTime"])
export class PropertyModeTransitionLogEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity)
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "from_mode", type: "varchar", length: 32 })
  fromMode!: PropertyOperatingMode;

  @Column({ name: "to_mode", type: "varchar", length: 32 })
  toMode!: PropertyOperatingMode;

  @Column({ name: "reason", type: "varchar", length: 500 })
  reason!: string;

  @Column({ name: "check_snapshot", type: "jsonb", default: {} })
  checkSnapshot!: Record<string, unknown>;

  @Column({ name: "operator_id", type: "uuid" })
  operatorId!: string;

  @Column({ name: "operator_name", type: "varchar", length: 100 })
  operatorName!: string;

  @Column({ name: "transition_time", type: "timestamptz" })
  transitionTime!: Date;
}
