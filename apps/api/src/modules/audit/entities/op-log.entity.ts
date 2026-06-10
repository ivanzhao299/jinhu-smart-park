import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_op_log")
@Index("idx_sys_op_log_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class OpLogEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @Column({ name: "username", type: "varchar", length: 64, nullable: true })
  username!: string | null;

  @Column({ name: "real_name", type: "varchar", length: 100, nullable: true })
  realName!: string | null;

  @Column({ name: "role_codes", type: "text", nullable: true })
  roleCodes!: string | null;

  @Column({ name: "module", type: "varchar", length: 100 })
  module!: string;

  @Column({ name: "resource", type: "varchar", length: 128, nullable: true })
  resource!: string | null;

  @Column({ name: "action", type: "varchar", length: 100 })
  action!: string;

  @Column({ name: "biz_type", type: "varchar", length: 64, nullable: true })
  bizType!: string | null;

  @Column({ name: "biz_id", type: "uuid", nullable: true })
  bizId!: string | null;

  @Column({ name: "before_json", type: "jsonb", nullable: true })
  beforeJson!: Record<string, unknown> | null;

  @Column({ name: "after_json", type: "jsonb", nullable: true })
  afterJson!: Record<string, unknown> | null;

  @Column({ name: "client_ip", type: "varchar", length: 64, nullable: true })
  clientIp!: string | null;

  @Column({ name: "client_ua", type: "varchar", length: 500, nullable: true })
  clientUa!: string | null;

  @Column({ name: "method", type: "varchar", length: 16 })
  method!: string;

  @Column({ name: "path", type: "varchar", length: 255 })
  path!: string;

  @Column({ name: "success", type: "boolean" })
  success!: boolean;

  @Column({ name: "op_time", type: "timestamptz", nullable: true })
  opTime!: Date | null;

  @Column({ name: "result", type: "varchar", length: 32, nullable: true })
  result!: string | null;

  @Column({ name: "error_msg", type: "varchar", length: 1000, nullable: true })
  errorMsg!: string | null;

  @Column({ name: "request_id", type: "varchar", length: 128, nullable: true })
  requestId!: string | null;

  @Column({ name: "idempotency_key", type: "varchar", length: 128, nullable: true })
  idempotencyKey!: string | null;
}
