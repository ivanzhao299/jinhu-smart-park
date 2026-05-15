import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn
} from "typeorm";
import { BuildingEntity } from "../../buildings/entities/building.entity";
import { FileEntity } from "../../files/entities/file.entity";

@Entity("biz_floor")
@Index("idx_biz_floor_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_floor_entity_code", ["floorCode"], { unique: true, where: "is_deleted = false" })
export class FloorEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "building_id", type: "uuid" })
  buildingId!: string;

  @ManyToOne(() => BuildingEntity, { eager: false })
  @JoinColumn({ name: "building_id" })
  building!: BuildingEntity;

  @Column({ name: "floor_code", type: "varchar", length: 64 })
  floorCode!: string;

  @Column({ name: "floor_no", type: "integer" })
  floorNo!: number;

  @Column({ name: "floor_name", type: "varchar", length: 100 })
  floorName!: string;

  @Column({ name: "floor_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  floorArea!: string;

  @Column({ name: "layout_file_id", type: "uuid", nullable: true })
  layoutFileId!: string | null;

  @ManyToOne(() => FileEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "layout_file_id" })
  layoutFile!: FileEntity | null;

  @Column({ name: "layout_url", type: "varchar", length: 500, nullable: true })
  layoutUrl!: string | null;

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
