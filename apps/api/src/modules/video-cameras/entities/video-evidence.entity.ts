import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { CameraDeviceEntity } from "./camera-device.entity";

@Entity("video_evidence")
@Index("idx_video_evidence_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_video_evidence_camera", ["tenantId", "parkId", "cameraId", "isDeleted"])
@Index("idx_video_evidence_source", ["tenantId", "parkId", "sourceType", "sourceId", "isDeleted"])
@Index("idx_video_evidence_status", ["tenantId", "parkId", "status", "isDeleted"])
export class VideoEvidenceEntity extends AuditableEntity {
  @Column({ name: "camera_id", type: "uuid" })
  cameraId!: string;

  @ManyToOne(() => CameraDeviceEntity)
  @JoinColumn({ name: "camera_id" })
  camera?: CameraDeviceEntity;

  @Column({ name: "source_type", type: "varchar", length: 32 })
  sourceType!: string;

  @Column({ name: "source_id", type: "uuid", nullable: true })
  sourceId!: string | null;

  @Column({ name: "evidence_type", type: "varchar", length: 32 })
  evidenceType!: string;

  @Column({ name: "evidence_url", type: "text", nullable: true })
  evidenceUrl!: string | null;

  @Column({ name: "snapshot_url", type: "text", nullable: true })
  snapshotUrl!: string | null;

  @Column({ name: "clip_start_time", type: "timestamptz", nullable: true })
  clipStartTime!: Date | null;

  @Column({ name: "clip_end_time", type: "timestamptz", nullable: true })
  clipEndTime!: Date | null;

  @Column({ name: "captured_at", type: "timestamptz" })
  capturedAt!: Date;

  @Column({ name: "captured_by", type: "uuid", nullable: true })
  capturedBy!: string | null;

  @Column({ name: "description", type: "varchar", length: 1000, nullable: true })
  description!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "VALID" })
  status!: string;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
