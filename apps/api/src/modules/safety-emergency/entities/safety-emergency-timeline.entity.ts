import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_emergency_timeline")
@Index("idx_biz_safety_emergency_timeline_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_emergency_timeline_event", ["tenantId", "parkId", "emergencyId", "opTime"])
export class SafetyEmergencyTimelineEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "emergency_id", type: "uuid" })
  emergencyId!: string;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "before_status", type: "varchar", length: 32, nullable: true })
  beforeStatus!: string | null;

  @Column({ name: "after_status", type: "varchar", length: 32, nullable: true })
  afterStatus!: string | null;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "content", type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "attachment_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  attachmentFileIds!: string[];

  @Column({ name: "gps_lng", type: "numeric", precision: 10, scale: 6, nullable: true })
  gpsLng!: string | null;

  @Column({ name: "gps_lat", type: "numeric", precision: 10, scale: 6, nullable: true })
  gpsLat!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
