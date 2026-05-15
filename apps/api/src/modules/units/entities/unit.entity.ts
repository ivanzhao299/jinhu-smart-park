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
import { FloorEntity } from "../../floors/entities/floor.entity";

@Entity("biz_unit")
@Index("idx_biz_unit_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_unit_entity_scope_code", ["tenantId", "parkId", "unitCode"], { unique: true, where: "is_deleted = false" })
export class UnitEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "unit_code", type: "varchar", length: 64 })
  unitCode!: string;

  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "building_id", type: "uuid" })
  buildingId!: string;

  @ManyToOne(() => BuildingEntity, { eager: false })
  @JoinColumn({ name: "building_id" })
  building!: BuildingEntity;

  @Column({ name: "floor_id", type: "uuid" })
  floorId!: string;

  @ManyToOne(() => FloorEntity, { eager: false })
  @JoinColumn({ name: "floor_id" })
  floor!: FloorEntity;

  @Column({ name: "unit_name", type: "varchar", length: 100 })
  unitName!: string;

  @Column({ name: "usage_type", type: "smallint" })
  usageType!: number;

  @Column({ name: "unit_area", type: "numeric", precision: 14, scale: 2 })
  unitArea!: string;

  @Column({ name: "use_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  useArea!: string;

  @Column({ name: "rental_status", type: "smallint" })
  rentalStatus!: number;

  @Column({ name: "fitting_status", type: "smallint" })
  fittingStatus!: number;

  @Column({ name: "ref_price", type: "numeric", precision: 14, scale: 2, default: 0 })
  refPrice!: string;

  @Column({ name: "photo_file_ids", type: "uuid", array: true, nullable: true })
  photoFileIds!: string[] | null;

  @Column({ name: "photo_urls", type: "text", array: true, nullable: true })
  photoUrls!: string[] | null;

  @Column({ name: "floorplan_file_id", type: "uuid", nullable: true })
  floorplanFileId!: string | null;

  @ManyToOne(() => FileEntity, { eager: false, nullable: true })
  @JoinColumn({ name: "floorplan_file_id" })
  floorplanFile!: FileEntity | null;

  @Column({ name: "floorplan_url", type: "varchar", length: 500, nullable: true })
  floorplanUrl!: string | null;

  @Column({ name: "available_date", type: "date", nullable: true })
  availableDate!: string | null;

  @Column({ name: "lock_reason", type: "varchar", length: 500, nullable: true })
  lockReason!: string | null;

  @Column({ name: "lock_expire_time", type: "timestamptz", nullable: true })
  lockExpireTime!: Date | null;

  @Column({ name: "status_update_time", type: "timestamptz", nullable: true })
  statusUpdateTime!: Date | null;

  @Column({ name: "status_update_by", type: "varchar", length: 64, nullable: true })
  statusUpdateBy!: string | null;

  @Column({ name: "status", type: "smallint", default: 1 })
  status!: number;

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
