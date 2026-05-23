import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_work_permit_check")
@Index("idx_biz_safety_work_permit_check_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_work_permit_check_permit", ["tenantId", "parkId", "permitId", "checkTime"])
export class SafetyWorkPermitCheckEntity extends AuditableEntity {
  @Column({ name: "permit_id", type: "uuid" })
  permitId!: string;

  @Column({ name: "check_type", type: "varchar", length: 64 })
  checkType!: string;

  @Column({ name: "check_user_id", type: "uuid", nullable: true })
  checkUserId!: string | null;

  @Column({ name: "check_user_name", type: "varchar", length: 100, nullable: true })
  checkUserName!: string | null;

  @Column({ name: "check_time", type: "timestamptz" })
  checkTime!: Date;

  @Column({ name: "result", type: "varchar", length: 32 })
  result!: string;

  @Column({ name: "violation_desc", type: "text", nullable: true })
  violationDesc!: string | null;

  @Column({ name: "photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" })
  photoFileIds!: string[];

  @Column({ name: "create_hazard", type: "boolean", default: false })
  createHazard!: boolean;

  @Column({ name: "hazard_id", type: "uuid", nullable: true })
  hazardId!: string | null;

  @Column({ name: "create_work_order", type: "boolean", default: false })
  createWorkOrder!: boolean;

  @Column({ name: "work_order_id", type: "uuid", nullable: true })
  workOrderId!: string | null;
}
