import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { DictItemEntity } from "./dict-item.entity";

@Entity("sys_dict_type")
@Index("idx_sys_dict_type_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_sys_dict_type_scope_code", ["tenantId", "parkId", "dictCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class DictTypeEntity extends AuditableEntity {
  @Column({ name: "dict_code", type: "varchar", length: 64 })
  dictCode!: string;

  @Column({ name: "dict_name", type: "varchar", length: 100 })
  dictName!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => DictItemEntity, (item) => item.dictType)
  items!: DictItemEntity[];
}
