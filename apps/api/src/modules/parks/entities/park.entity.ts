import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn } from "typeorm";

@Entity("biz_park")
@Index("idx_biz_park_entity_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_park_entity_code", ["parkCode"], { unique: true, where: "is_deleted = false" })
export class ParkEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "tenant_id", type: "varchar", length: 64 })
  tenantId!: string;

  @Column({ name: "park_id", type: "varchar", length: 64 })
  parkId!: string;

  @Column({ name: "park_code", type: "varchar", length: 64 })
  parkCode!: string;

  @Column({ name: "park_name", type: "varchar", length: 100 })
  parkName!: string;

  @Column({ name: "address", type: "varchar", length: 255, nullable: true })
  address!: string | null;

  @Column({ name: "province", type: "varchar", length: 64, nullable: true })
  province!: string | null;

  @Column({ name: "city", type: "varchar", length: 64, nullable: true })
  city!: string | null;

  @Column({ name: "district", type: "varchar", length: 64, nullable: true })
  district!: string | null;

  @Column({ name: "lng", type: "numeric", precision: 12, scale: 6, nullable: true })
  lng!: string | null;

  @Column({ name: "lat", type: "numeric", precision: 12, scale: 6, nullable: true })
  lat!: string | null;

  @Column({ name: "total_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  totalArea!: string;

  @Column({ name: "land_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  landArea!: string;

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
