import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { AssetBuildingEntity } from "./asset-building.entity";
import { AssetFloorEntity } from "./asset-floor.entity";
import { AssetParkEntity } from "./asset-park.entity";

@Entity("asset_unit")
@Index("idx_asset_unit_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_asset_unit_scope_code", ["tenantId", "parkId", "unitCode"], { unique: true, where: "is_deleted = false" })
export class AssetUnitEntity extends AuditableEntity {
  @Column({ name: "asset_park_id", type: "uuid" })
  assetParkId!: string;

  @Column({ name: "building_id", type: "uuid" })
  buildingId!: string;

  @Column({ name: "floor_id", type: "uuid" })
  floorId!: string;

  @Column({ name: "unit_code", type: "varchar", length: 64 })
  unitCode!: string;

  @Column({ name: "unit_name", type: "varchar", length: 100 })
  unitName!: string;

  @Column({ name: "unit_no", type: "varchar", length: 64 })
  unitNo!: string;

  @Column({ name: "usage_type", type: "varchar", length: 32, default: "office" })
  usageType!: string;

  @Column({ name: "building_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  buildingArea!: string;

  @Column({ name: "rentable_area", type: "numeric", precision: 14, scale: 2, default: 0 })
  rentableArea!: string;

  @Column({ name: "orientation", type: "varchar", length: 32, nullable: true })
  orientation!: string | null;

  @Column({ name: "lease_status", type: "varchar", length: 32, default: "vacant" })
  leaseStatus!: string;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @ManyToOne(() => AssetParkEntity)
  @JoinColumn({ name: "asset_park_id" })
  assetPark!: AssetParkEntity;

  @ManyToOne(() => AssetBuildingEntity)
  @JoinColumn({ name: "building_id" })
  building!: AssetBuildingEntity;

  @ManyToOne(() => AssetFloorEntity, (floor) => floor.units)
  @JoinColumn({ name: "floor_id" })
  floor!: AssetFloorEntity;
}
