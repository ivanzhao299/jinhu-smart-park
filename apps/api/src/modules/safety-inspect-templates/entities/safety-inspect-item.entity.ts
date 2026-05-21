import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { SafetyInspectTemplateEntity } from "./safety-inspect-template.entity";

@Entity("biz_safety_inspect_item")
@Index("idx_biz_safety_inspect_item_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_item_template", ["tenantId", "parkId", "templateId", "isDeleted"])
@Index("idx_biz_safety_inspect_item_hazard", ["tenantId", "parkId", "hazardType", "isDeleted"])
@Index("uk_biz_safety_inspect_item_code", ["tenantId", "parkId", "templateId", "itemCode"], {
  unique: true,
  where: "is_deleted = false AND item_code IS NOT NULL"
})
export class SafetyInspectItemEntity extends AuditableEntity {
  @Column({ name: "template_id", type: "uuid" })
  templateId!: string;

  @ManyToOne(() => SafetyInspectTemplateEntity, (template) => template.items)
  @JoinColumn({ name: "template_id" })
  template!: SafetyInspectTemplateEntity;

  @Column({ name: "item_code", type: "varchar", length: 64, nullable: true })
  itemCode!: string | null;

  @Column({ name: "item_name", type: "varchar", length: 200 })
  itemName!: string;

  @Column({ name: "item_type", type: "varchar", length: 64, default: "normal_abnormal" })
  itemType!: string;

  @Column({ name: "hazard_type", type: "varchar", length: 64, nullable: true })
  hazardType!: string | null;

  @Column({ name: "default_risk_level", type: "varchar", length: 32, nullable: true })
  defaultRiskLevel!: string | null;

  @Column({ name: "required", type: "boolean", default: true })
  required!: boolean;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "standard_desc", type: "varchar", length: 1000, nullable: true })
  standardDesc!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
