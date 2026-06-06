import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type IdempotencyRequestStatus = "processing" | "succeeded" | "failed";

@Entity("sys_idempotency_request")
@Index("uq_sys_idempotency_request_scope", ["tenantId", "userId", "requestPath", "idempotencyKey"], { unique: true })
@Index("idx_sys_idempotency_request_expires_at", ["expiresAt"])
@Index("idx_sys_idempotency_request_status_locked_until", ["status", "lockedUntil"])
export class IdempotencyRequestEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 32 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 32 })
  parkId!: string;

  @Column({ name: "user_id", type: "varchar", length: 64 })
  userId!: string;

  @Column({ name: "idempotency_key", type: "varchar", length: 128 })
  idempotencyKey!: string;

  @Column({ name: "request_method", type: "varchar", length: 10 })
  requestMethod!: string;

  @Column({ name: "request_path", type: "varchar", length: 255 })
  requestPath!: string;

  @Column({ name: "request_fingerprint", type: "varchar", length: 128 })
  requestFingerprint!: string;

  @Column({ name: "status", type: "varchar", length: 20, default: "processing" })
  status!: IdempotencyRequestStatus;

  @Column({ name: "response_status", type: "integer", nullable: true })
  responseStatus!: number | null;

  @Column({ name: "response_body", type: "jsonb", nullable: true })
  responseBody!: unknown | null;

  @Column({ name: "error_code", type: "varchar", length: 64, nullable: true })
  errorCode!: string | null;

  @Column({ name: "locked_until", type: "timestamptz" })
  lockedUntil!: Date;

  @Column({ name: "expires_at", type: "timestamptz" })
  expiresAt!: Date;

  @CreateDateColumn({ name: "created_at", type: "timestamptz" })
  createdAt!: Date;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt!: Date;
}
