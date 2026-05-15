import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { AssetBuildingEntity } from "./asset-building.entity";
import { AssetParkEntity } from "./asset-park.entity";
import { AssetUnitEntity } from "./asset-unit.entity";

@Entity("asset_floor")
@Index("idx_asset_floor_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_asset_floor_scope_code", ["tenantId", "parkId", "floorCode"], { unique: true, where: "is_deleted = false" })
export class AssetFloorEntity extends AuditableEntity {
  @Column({ name: "asset_park_id", type: "uuid" })
  assetParkId!: string;

  @Column({ name: "building_id", type: "uuid" })
  buildingId!: string;

  @Column({ name: "floor_code", type: "varchar", length: 64 })
  floorCode!: string;

  @Column({ name: "floor_name", type: "varchar", length: 100 })
  floorName!: string;

  @Column({ name: "floor_no", type: "integer" })
  floorNo!: number;

  @Column({ name: "gross_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  grossArea!: string;

  @Column({ name: "rentable_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  rentableArea!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @ManyToOne(() => AssetParkEntity)
  @JoinColumn({ name: "asset_park_id" })
  assetPark!: AssetParkEntity;

  @ManyToOne(() => AssetBuildingEntity, (building) => building.floors)
  @JoinColumn({ name: "building_id" })
  building!: AssetBuildingEntity;

  @OneToMany(() => AssetUnitEntity, (unit) => unit.floor)
  units!: AssetUnitEntity[];
}
