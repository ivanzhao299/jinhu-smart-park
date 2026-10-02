import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_canteen_qr_codes")
@Index("idx_canteen_qr_codes_scope_outlet_status", ["tenantId", "parkId", "outletId", "status"])
export class CanteenQrCodeEntity extends AuditableEntity {
  @Column({ name: "outlet_id", type: "uuid" })
  outletId!: string;

  @Column({ name: "code_type", type: "varchar", length: 16 })
  codeType!: string;

  @Column({ type: "varchar", length: 64 })
  name!: string;

  @Column({ type: "text" })
  payload!: string;

  @Column({ type: "varchar", length: 16, nullable: true })
  provider!: string | null;

  @Column({ type: "varchar", length: 16, default: "active" })
  status!: string;

  @Column({ name: "bound_cashier_user_id", type: "uuid", nullable: true })
  boundCashierUserId!: string | null;
}
