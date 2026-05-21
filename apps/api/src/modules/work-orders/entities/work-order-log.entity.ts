import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { WorkOrderEntity } from "./work-order.entity";

@Entity("biz_work_order_log")
@Index("idx_biz_work_order_log_entity_work_order", ["tenantId", "parkId", "workOrderId", "opTime", "isDeleted"])
export class WorkOrderLogEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "log_code", type: "varchar", length: 64, nullable: true })
  logCode!: string | null;

  @Column({ name: "work_order_id", type: "uuid" })
  workOrderId!: string;

  @ManyToOne(() => WorkOrderEntity)
  @JoinColumn({ name: "work_order_id" })
  workOrder!: WorkOrderEntity;

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

  @Column({ name: "op_time", type: "timestamptz" })
  opTime!: Date;

  @Column({ name: "content", type: "text", nullable: true })
  content!: string | null;

  @Column({ name: "reason", type: "varchar", length: 500, nullable: true })
  reason!: string | null;

  @Column({ name: "attachment_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  attachmentFileIds!: string[];

  @Column({ name: "payload", type: "jsonb", default: {} })
  payload!: Record<string, unknown>;
}
