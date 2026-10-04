import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_status_logs")
@Index("idx_canteen_status_logs_scope_entity_time", [
  "tenantId", "parkId", "entityType", "entityId", "opTime"
])
export class CanteenStatusLogEntity extends AuditableEntity {
  @Column({ name: "entity_type", type: "varchar", length: 16 })
  entityType!: string;

  @Column({ name: "entity_id", type: "uuid" })
  entityId!: string;

  @Column({ name: "before_status", type: "varchar", length: 20, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 20 })
  afterStatus!: string;

  @Column({ type: "varchar", length: 32 })
  action!: string;

  @Column({ type: "varchar", length: 256, nullable: true })
  reason!: string | null;

  @Column({ name: "operator_user_id", type: "uuid", nullable: true })
  operatorUserId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 64, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
