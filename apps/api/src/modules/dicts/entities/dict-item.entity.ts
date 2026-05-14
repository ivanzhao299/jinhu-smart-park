import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { DictTypeEntity } from "./dict-type.entity";

@Entity("sys_dict_item")
@Index("idx_sys_dict_item_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_dict_item_scope_type", ["tenantId", "parkId", "dictTypeId"])
export class DictItemEntity extends AuditableEntity {
  @Column({ name: "dict_type_id", type: "uuid" })
  dictTypeId!: string;

  @Column({ name: "item_label", type: "varchar", length: 100 })
  itemLabel!: string;

  @Column({ name: "item_value", type: "varchar", length: 100 })
  itemValue!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @Column({ name: "tag_type", type: "varchar", length: 32, nullable: true })
  tagType!: string | null;

  @ManyToOne(() => DictTypeEntity, (type) => type.items)
  @JoinColumn({ name: "dict_type_id" })
  dictType!: DictTypeEntity;
}
