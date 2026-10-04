import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_dishes")
@Index("uq_canteen_dishes_scope_outlet_no", ["tenantId", "outletId", "dishNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_dishes_scope_outlet_cat_status", [
  "tenantId", "parkId", "outletId", "categoryId", "status"
])
export class CanteenDishEntity extends AuditableEntity {
  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "category_id", type: "uuid" })
  categoryId!: string;

  @Column({ name: "dish_no", type: "varchar", length: 32 })
  dishNo!: string;

  @Column({ type: "varchar", length: 128 })
  name!: string;

  @Column({ type: "numeric", precision: 12, scale: 2 })
  price!: string;

  @Column({ name: "image_file_id", type: "uuid", nullable: true })
  imageFileId!: string | null;

  @Column({ type: "varchar", length: 16, default: "份" })
  unit!: string;

  @Column({ type: "varchar", length: 64, nullable: true })
  barcode!: string | null;

  @Column({ name: "daily_stock", type: "integer", nullable: true })
  dailyStock!: number | null;

  @Column({ name: "sold_count", type: "integer", default: 0 })
  soldCount!: number;

  @Column({ name: "need_booking", type: "boolean", default: false })
  needBooking!: boolean;

  @Column({ type: "varchar", length: 16, default: "off_shelf" })
  status!: string;

  @Column({ name: "shelf_time", type: "timestamptz", nullable: true })
  shelfTime!: Date | null;

  @Column({ name: "unshelf_time", type: "timestamptz", nullable: true })
  unshelfTime!: Date | null;
}
