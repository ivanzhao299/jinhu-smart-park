import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("biz_building")
@Index("idx_biz_building_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_building_entity_code", ["buildingCode"], { unique: true, where: "is_deleted = false" })
export class BuildingEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "building_code", type: "varchar", length: 64 })
  buildingCode!: string;

  @Column({ name: "building_name", type: "varchar", length: 100 })
  buildingName!: string;

  @Column({ name: "floor_count", type: "integer", default: 0 })
  floorCount!: number;

  @Column({ name: "build_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  buildArea!: string;

  @Column({ name: "status", type: "smallint", default: 1 })
  status!: number;

  @Column({ name: "sort_no", type: "integer", default: 0 })
  sortNo!: number;

  @Column({ name: "create_by", type: "varchar", length: 64, nullable: true })
  createBy!: string | null;

  @CreateDateColumn({ name: "create_time", type: "timestamptz" })
  createTime!: Date;

  @Column({ name: "update_by", type: "varchar", length: 64, nullable: true })
  updateBy!: string | null;

  @UpdateDateColumn({ name: "update_time", type: "timestamptz" })
  updateTime!: Date;

  @Column({ name: "is_deleted", type: "boolean", default: false })
  isDeleted!: boolean;

  @VersionColumn({ name: "version" })
  version!: number;

  @Column({ name: "remark", type: "varchar", length: 500, nullable: true })
  remark!: string | null;
}
