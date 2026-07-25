import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import type { PropertyOperatingMode, PropertyOperatingStatus } from "@jinhu/shared";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_property_operation_config")
@Index("uq_property_operation_config_scope_unit", ["tenantId", "parkId", "unitId"], {
  unique: true,
  where: "is_deleted = false"
})
export class PropertyOperationConfigEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity)
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "operating_mode", type: "varchar", length: 32, default: "none" })
  operatingMode!: PropertyOperatingMode;

  @Column({ name: "operating_status", type: "varchar", length: 32, default: "enabled" })
  operatingStatus!: PropertyOperatingStatus;

  @Column({ name: "effective_time", type: "timestamptz", nullable: true })
  effectiveTime!: Date | null;

  @Column({ name: "suspend_reason", type: "varchar", length: 500, nullable: true })
  suspendReason!: string | null;
}
