import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { UserEntity } from "../../users/entities/user.entity";
import { RoleEntity } from "./role.entity";

@Entity("rel_user_role")
@Index("idx_rel_user_role_tenant_park_deleted", ["tenantId", "parkId", "isDeleted"])
export class UserRoleEntity extends AuditableEntity {
  @Column({ name: "user_id", type: "uuid" })
  userId!: string;

  @Column({ name: "role_id", type: "uuid" })
  roleId!: string;

  @ManyToOne(() => UserEntity, (user) => user.roleLinks)
  @JoinColumn({ name: "user_id" })
  user!: UserEntity;

  @ManyToOne(() => RoleEntity, (role) => role.userLinks)
  @JoinColumn({ name: "role_id" })
  role!: RoleEntity;
}
