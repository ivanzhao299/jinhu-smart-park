import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_robot_command_log")
@Index("idx_biz_robot_command_log_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_robot_command_log_device", ["tenantId", "parkId", "deviceId", "isDeleted"])
export class RobotCommandLogEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "device_id", type: "uuid" })
  deviceId!: string;

  @Column({ name: "device_code", type: "varchar", length: 64 })
  deviceCode!: string;

  @Column({ name: "command", type: "varchar", length: 80 })
  command!: string;

  @Column({ name: "request_payload", type: "jsonb", default: {} })
  requestPayload!: Record<string, unknown>;

  @Column({ name: "response_payload", type: "jsonb", default: {} })
  responsePayload!: Record<string, unknown>;

  @Column({ name: "status", type: "varchar", length: 32, default: "success" })
  status!: string;

  @Column({ name: "error_message", type: "varchar", length: 500, nullable: true })
  errorMessage!: string | null;

  @Column({ name: "operator_id", type: "uuid", nullable: true })
  operatorId!: string | null;

  @Column({ name: "operator_name", type: "varchar", length: 120, nullable: true })
  operatorName!: string | null;

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;
}
