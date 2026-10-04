import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_meal_records")
@Index("uq_canteen_meal_records_scope_no", ["tenantId", "recordNo"], {
  unique: true,
  where: "is_deleted = false"
})
@Index("idx_canteen_meal_records_scope_period_employee", ["tenantId", "parkId", "period", "employeeUserId"])
@Index("idx_canteen_meal_records_scope_outlet_date", ["tenantId", "parkId", "outletId", "businessDate"])
export class CanteenMealRecordEntity extends AuditableEntity {
  @Column({ name: "record_no", type: "varchar", length: 40 })
  recordNo!: string;

  @Column({ type: "varchar", length: 7 })
  period!: string;

  @Column({ name: "business_date", type: "date" })
  businessDate!: string;

  @Column({ name: "meal_period", type: "varchar", length: 16 })
  mealPeriod!: string;

  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "employee_user_id", type: "uuid" })
  employeeUserId!: string;

  @Column({ name: "order_id", type: "uuid" })
  orderId!: string;

  @Column({ name: "total_amount", type: "numeric", precision: 12, scale: 2 })
  totalAmount!: string;

  @Column({ name: "subsidy_used", type: "numeric", precision: 12, scale: 2 })
  subsidyUsed!: string;

  @Column({ name: "qr_pay_amount", type: "numeric", precision: 12, scale: 2, default: 0 })
  qrPayAmount!: string;

  @Column({ type: "varchar", length: 16, default: "normal" })
  status!: string;
}
