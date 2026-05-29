import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { CameraDeviceEntity } from "./camera-device.entity";

@Entity("video_alert")
@Index("idx_video_alert_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_video_alert_camera", ["tenantId", "parkId", "cameraId", "isDeleted"])
@Index("idx_video_alert_status", ["tenantId", "parkId", "processStatus", "isDeleted"])
@Index("idx_video_alert_level", ["tenantId", "parkId", "alertLevel", "isDeleted"])
@Index("idx_video_alert_triggered", ["tenantId", "parkId", "triggeredAt", "isDeleted"])
@Index("uk_video_alert_code", ["tenantId", "parkId", "alertCode"], { unique: true, where: "is_deleted = false" })
export class VideoAlertEntity extends AuditableEntity {
  @Column({ name: "camera_id", type: "uuid" })
  cameraId!: string;

  @ManyToOne(() => CameraDeviceEntity)
  @JoinColumn({ name: "camera_id" })
  camera?: CameraDeviceEntity;

  @Column({ name: "alert_code", type: "varchar", length: 64 })
  alertCode!: string;

  @Column({ name: "alert_type", type: "varchar", length: 64 })
  alertType!: string;

  @Column({ name: "alert_level", type: "varchar", length: 32 })
  alertLevel!: string;

  @Column({ name: "alert_source", type: "varchar", length: 32, default: "MANUAL" })
  alertSource!: string;

  @Column({ name: "title", type: "varchar", length: 200 })
  title!: string;

  @Column({ name: "description", type: "text", nullable: true })
  description!: string | null;

  @Column({ name: "snapshot_url", type: "text", nullable: true })
  snapshotUrl!: string | null;

  @Column({ name: "video_clip_url", type: "text", nullable: true })
  videoClipUrl!: string | null;

  @Column({ name: "triggered_at", type: "timestamptz" })
  triggeredAt!: Date;

  @Column({ name: "acknowledged_at", type: "timestamptz", nullable: true })
  acknowledgedAt!: Date | null;

  @Column({ name: "resolved_at", type: "timestamptz", nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: "resolved_by", type: "uuid", nullable: true })
  resolvedBy!: string | null;

  @Column({ name: "assigned_to", type: "uuid", nullable: true })
  assignedTo!: string | null;

  @Column({ name: "linked_inspection_id", type: "uuid", nullable: true })
  linkedInspectionId!: string | null;

  @Column({ name: "linked_hazard_id", type: "uuid", nullable: true })
  linkedHazardId!: string | null;

  @Column({ name: "process_status", type: "varchar", length: 32, default: "PENDING" })
  processStatus!: string;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
