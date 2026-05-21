import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { SafetyInspectItemEntity } from "./safety-inspect-item.entity";

@Entity("biz_safety_inspect_template")
@Index("idx_biz_safety_inspect_template_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_inspect_template_type", ["tenantId", "parkId", "templateType", "isDeleted"])
@Index("idx_biz_safety_inspect_template_status", ["tenantId", "parkId", "status", "isDeleted"])
@Index("uk_biz_safety_inspect_template_code", ["tenantId", "parkId", "templateCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyInspectTemplateEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "template_code", type: "varchar", length: 64 })
  templateCode!: string;

  @Column({ name: "template_name", type: "varchar", length: 200 })
  templateName!: string;

  @Column({ name: "template_type", type: "varchar", length: 64, default: "comprehensive" })
  templateType!: string;

  @Column({ name: "description", type: "varchar", length: 1000, nullable: true })
  description!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => SafetyInspectItemEntity, (item) => item.template)
  items?: SafetyInspectItemEntity[];
}
