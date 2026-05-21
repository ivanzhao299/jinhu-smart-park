import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { SafetyHazardEntity } from "./safety-hazard.entity";

@Entity("biz_safety_inspect_task_result")
@Index("idx_biz_safety_inspect_task_result_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_task_result_task", ["tenantId", "parkId", "taskId", "isDeleted"])
@Index("idx_biz_safety_inspect_task_result_item", ["tenantId", "parkId", "itemId", "isDeleted"])
@Index("uk_biz_safety_inspect_task_result_task_item", ["tenantId", "parkId", "taskId", "itemId"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyInspectTaskResultEntity extends AuditableEntity {
  @Column({ name: "task_id", type: "uuid" })
  taskId!: string;

  @Column({ name: "item_id", type: "uuid" })
  itemId!: string;

  @Column({ name: "item_name", type: "varchar", length: 200 })
  itemName!: string;

  @Column({ name: "result", type: "varchar", length: 32 })
  result!: string;

  @Column({ name: "value_text", type: "text", nullable: true })
  valueText!: string | null;

  @Column({ name: "value_number", type: "numeric", precision: 18, scale: 2, nullable: true })
  valueNumber!: string | null;

  @Column({ name: "photo_file_ids", type: "uuid", array: true, default: () => "ARRAY[]::uuid[]" })
  photoFileIds!: string[];

  @Column({ name: "is_abnormal", type: "boolean", default: false })
  isAbnormal!: boolean;

  @Column({ name: "hazard_created", type: "boolean", default: false })
  hazardCreated!: boolean;

  @Column({ name: "hazard_id", type: "uuid", nullable: true })
  hazardId!: string | null;

  @ManyToOne(() => SafetyHazardEntity, { nullable: true })
  @JoinColumn({ name: "hazard_id" })
  hazard?: SafetyHazardEntity | null;
}
