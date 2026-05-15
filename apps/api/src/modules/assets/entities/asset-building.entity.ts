import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { AssetParkEntity } from "./asset-park.entity";
import { AssetFloorEntity } from "./asset-floor.entity";

@Entity("asset_building")
@Index("idx_asset_building_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_asset_building_scope_code", ["tenantId", "parkId", "buildingCode"], { unique: true, where: "is_deleted = false" })
export class AssetBuildingEntity extends AuditableEntity {
  @Column({ name: "asset_park_id", type: "uuid" })
  assetParkId!: string;

  @Column({ name: "building_code", type: "varchar", length: 64 })
  buildingCode!: string;

  @Column({ name: "building_name", type: "varchar", length: 100 })
  buildingName!: string;

  @Column({ name: "floor_count", type: "integer", default: 0 })
  floorCount!: number;

  @Column({ name: "total_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  totalArea!: string;

  @Column({ name: "sort_order", type: "integer", default: 0 })
  sortOrder!: number;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @ManyToOne(() => AssetParkEntity, (park) => park.buildings)
  @JoinColumn({ name: "asset_park_id" })
  assetPark!: AssetParkEntity;

  @OneToMany(() => AssetFloorEntity, (floor) => floor.building)
  floors!: AssetFloorEntity[];
}
