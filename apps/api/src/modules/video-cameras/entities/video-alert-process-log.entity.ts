import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { VideoAlertEntity } from "./video-alert.entity";

@Entity("video_alert_process_log")
@Index("idx_video_alert_process_log_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_video_alert_process_log_alert", ["tenantId", "parkId", "alertId", "createTime"])
export class VideoAlertProcessLogEntity extends AuditableEntity {
  @Column({ name: "alert_id", type: "uuid" })
  alertId!: string;

  @ManyToOne(() => VideoAlertEntity)
  @JoinColumn({ name: "alert_id" })
  alert?: VideoAlertEntity;

  @Column({ name: "action", type: "varchar", length: 64 })
  action!: string;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 100, nullable: true })
  operatorName!: string | null;

  @Column({ name: "old_status", type: "varchar", length: 32, nullable: true })
  oldStatus!: string | null;

  @Column({ name: "new_status", type: "varchar", length: 32, nullable: true })
  newStatus!: string | null;
}
