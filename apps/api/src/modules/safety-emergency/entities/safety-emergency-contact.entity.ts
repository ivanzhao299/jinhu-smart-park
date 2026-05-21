import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_safety_emergency_contact")
@Index("idx_biz_safety_emergency_contact_scope_deleted", ["tenantId", "parkId", "isDeleted"])
@Index("idx_biz_safety_emergency_contact_role", ["tenantId", "parkId", "contactRole", "isDeleted"])
@Index("idx_biz_safety_emergency_contact_user", ["tenantId", "parkId", "userId", "isDeleted"])
@Index("uk_biz_safety_emergency_contact_code", ["tenantId", "parkId", "contactCode"], {
  unique: true,
  where: "is_deleted = false"
})
export class SafetyEmergencyContactEntity extends AuditableEntity {
  @Column({ name: "code", type: "varchar", length: 64, nullable: true })
  code!: string | null;

  @Column({ name: "contact_code", type: "varchar", length: 64 })
  contactCode!: string;

  @Column({ name: "contact_name", type: "varchar", length: 100 })
  contactName!: string;

  @Column({ name: "contact_role", type: "varchar", length: 64, nullable: true })
  contactRole!: string | null;

  @Column({ name: "mobile", type: "varchar", length: 32 })
  mobile!: string;

  @Column({ name: "email", type: "varchar", length: 120, nullable: true })
  email!: string | null;

  @Column({ name: "org_id", type: "uuid", nullable: true })
  orgId!: string | null;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId!: string | null;

  @Column({ name: "duty_type", type: "varchar", length: 64, nullable: true })
  dutyType!: string | null;

  @Column({ name: "priority_level", type: "integer", default: 0 })
  priorityLevel!: number;

  @Column({ name: "notify_channels", type: "jsonb", default: () => "'[]'::jsonb" })
  notifyChannels!: string[];

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;
}
