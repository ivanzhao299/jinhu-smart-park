import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("sys_login_log")
@Index("idx_sys_login_log_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class LoginLogEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @Column({ name: "username", type: "varchar", length: 64 })
  username!: string;

  @Column({ name: "login_time", type: "timestamptz", nullable: true })
  loginTime!: Date | null;

  @Column({ name: "login_ip", type: "varchar", length: 64, nullable: true })
  loginIp!: string | null;

  @Column({ name: "login_ua", type: "varchar", length: 500, nullable: true })
  loginUa!: string | null;

  @Column({ name: "login_method", type: "varchar", length: 32, nullable: true })
  loginMethod!: string | null;

  @Column({ name: "result", type: "varchar", length: 32, nullable: true })
  result!: string | null;

  @Column({ name: "fail_reason", type: "varchar", length: 255, nullable: true })
  failReason!: string | null;

  @Column({ name: "request_id", type: "varchar", length: 64, nullable: true })
  requestId!: string | null;

  @Column({ name: "ip_address", type: "varchar", length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: "user_agent", type: "varchar", length: 500, nullable: true })
  userAgent!: string | null;

  @Column({ name: "success", type: "boolean" })
  success!: boolean;

  @Column({ name: "message", type: "varchar", length: 255, nullable: true })
  message!: string | null;
}
