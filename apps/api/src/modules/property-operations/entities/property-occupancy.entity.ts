import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import type { PropertyOccupancyDomain, PropertyOccupancyStatus } from "@jinhu/shared";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UnitEntity } from "../../units/entities/unit.entity";

@Entity("biz_property_occupancy")
@Index("idx_property_occupancy_scope_unit_period", ["tenantId", "parkId", "unitId", "startAt", "endAt"])
@Index("uq_property_occupancy_scope_source", ["tenantId", "parkId", "sourceDomain", "sourceType", "sourceId"], {
  unique: true,
  where: "is_deleted = false"
})
export class PropertyOccupancyEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" })
  unitId!: string;

  @ManyToOne(() => UnitEntity)
  @JoinColumn({ name: "unit_id" })
  unit!: UnitEntity;

  @Column({ name: "source_domain", type: "varchar", length: 32 })
  sourceDomain!: PropertyOccupancyDomain;

  @Column({ name: "source_type", type: "varchar", length: 64 })
  sourceType!: string;

  @Column({ name: "source_id", type: "varchar", length: 64 })
  sourceId!: string;

  @Column({ name: "start_at", type: "timestamptz" })
  startAt!: Date;

  @Column({ name: "end_at", type: "timestamptz" })
  endAt!: Date;

  @Column({ name: "status", type: "varchar", length: 32 })
  status!: PropertyOccupancyStatus;

  @Column({ name: "hold_expires_at", type: "timestamptz", nullable: true })
  holdExpiresAt!: Date | null;

  @Column({ name: "idempotency_key", type: "varchar", length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ name: "release_reason", type: "varchar", length: 500, nullable: true })
  releaseReason!: string | null;

  @Column({ name: "released_at", type: "timestamptz", nullable: true })
  releasedAt!: Date | null;
}
