import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("camera_device")
@Index("idx_camera_device_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_camera_device_location", ["tenantId", "parkId", "buildingId", "floorId", "roomId", "isDeleted"])
@Index("idx_camera_device_area", ["tenantId", "parkId", "areaId", "isDeleted"])
@Index("idx_camera_device_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("idx_camera_device_enabled", ["tenantId", "parkId", "isEnabled", "isDeleted"])
@Index("uk_camera_device_code", ["tenantId", "parkId", "cameraCode"], { unique: true, where: "is_deleted = false" })
export class CameraDeviceEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "building_id", type: "uuid", nullable: true })
  buildingId!: string | null;

  @Column({ name: "floor_id", type: "uuid", nullable: true })
  floorId!: string | null;

  @Column({ name: "room_id", type: "uuid", nullable: true })
  roomId!: string | null;

  @Column({ name: "area_id", type: "uuid", nullable: true })
  areaId!: string | null;

  @Column({ name: "camera_code", type: "varchar", length: 64 })
  cameraCode!: string;

  @Column({ name: "camera_name", type: "varchar", length: 200 })
  cameraName!: string;

  @Column({ name: "camera_type", type: "varchar", length: 64, nullable: true })
  cameraType!: string | null;

  @Column({ name: "camera_usage", type: "varchar", length: 64 })
  cameraUsage!: string;

  @Column({ name: "brand", type: "varchar", length: 120, nullable: true })
  brand!: string | null;

  @Column({ name: "model", type: "varchar", length: 120, nullable: true })
  model!: string | null;

  @Column({ name: "manufacturer", type: "varchar", length: 160, nullable: true })
  manufacturer!: string | null;

  @Column({ name: "platform_type", type: "varchar", length: 64, default: "LOCAL_RTSP" })
  platformType!: string;

  @Column({ name: "platform_device_id", type: "varchar", length: 128, nullable: true })
  platformDeviceId!: string | null;

  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: "port", type: "integer", nullable: true })
  port!: number | null;

  @Column({ name: "username", type: "varchar", length: 128, nullable: true })
  username!: string | null;

  @Column({ name: "password_encrypted", type: "varchar", length: 256, nullable: true })
  passwordEncrypted!: string | null;

  @Column({ name: "rtsp_url", type: "text", nullable: true })
  rtspUrl!: string | null;

  @Column({ name: "hls_url", type: "text", nullable: true })
  hlsUrl!: string | null;

  @Column({ name: "webrtc_url", type: "text", nullable: true })
  webrtcUrl!: string | null;

  @Column({ name: "snapshot_url", type: "text", nullable: true })
  snapshotUrl!: string | null;

  @Column({ name: "install_location", type: "varchar", length: 300, nullable: true })
  installLocation!: string | null;

  @Column({ name: "longitude", type: "numeric", precision: 12, scale: 8, nullable: true })
  longitude!: string | null;

  @Column({ name: "latitude", type: "numeric", precision: 12, scale: 8, nullable: true })
  latitude!: string | null;

  @Column({ name: "direction", type: "varchar", length: 64, nullable: true })
  direction!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "UNKNOWN" })
  status!: string;

  @Column({ name: "is_recording", type: "boolean", default: false })
  isRecording!: boolean;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "deleted_at", type: "timestamptz", nullable: true })
  deletedAt!: Date | null;
}
