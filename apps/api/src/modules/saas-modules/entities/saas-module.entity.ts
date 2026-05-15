import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("sys_module")
@Index("idx_sys_module_entity_code", ["moduleCode"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_sys_module_entity_group_deleted", ["moduleGroup", "isDeleted"])
export class SaaSModuleEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "module_code", type: "varchar", length: 64 })
  moduleCode!: string;

  @Column({ name: "module_name", type: "varchar", length: 100 })
  moduleName!: string;

  @Column({ name: "module_group", type: "varchar", length: 64 })
  moduleGroup!: string;

  @Column({ name: "description", type: "varchar", length: 500, nullable: true })
  description!: string | null;

  @Column({ name: "route_prefix", type: "varchar", length: 255, nullable: true })
  routePrefix!: string | null;

  @Column({ name: "icon", type: "varchar", length: 64, nullable: true })
  icon!: string | null;

  @Column({ name: "status", type: "integer", default: 1 })
  status!: number;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
