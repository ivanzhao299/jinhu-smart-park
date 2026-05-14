import { Column, Entity, Index, OneToMany } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserRoleEntity } from "../../roles/entities/user-role.entity";

@Entity("sys_user")
@Index("idx_sys_user_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class UserEntity extends AuditableEntity {
  @Column({ name: "username", type: "varchar", length: 64 })
  username!: string;

  @Column({ name: "display_name", type: "varchar", length: 100 })
  displayName!: string;

  @Column({ name: "password_hash", type: "varchar", length: 255 })
  passwordHash!: string;

  @Column({ name: "mobile", type: "varchar", length: 32, nullable: true })
  mobile!: string | null;

  @Column({ name: "email", type: "varchar", length: 128, nullable: true })
  email!: string | null;

  @Column({ name: "is_enabled", type: "boolean", default: true })
  isEnabled!: boolean;

  @Column({ name: "status", type: "varchar", length: 32, default: "enabled" })
  status!: string;

  @OneToMany(() => UserRoleEntity, (link) => link.user)
  roleLinks!: UserRoleEntity[];
}
