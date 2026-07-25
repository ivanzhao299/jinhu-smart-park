import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";
import { PartyEntity } from "./party.entity";

@Entity("rel_party_role")
@Index("uq_rel_party_role_scope", ["tenantId", "parkId", "partyId", "roleType", "sourceType", "sourceId"], {
  unique: true,
  where: "is_deleted = false"
})
export class PartyRoleEntity extends AuditableEntity {
  @Column({ name: "party_id", type: "uuid" })
  partyId!: string;

  @ManyToOne(() => PartyEntity)
  @JoinColumn({ name: "party_id" })
  party!: PartyEntity;

  @Column({ name: "role_type", type: "varchar", length: 32 })
  roleType!: string;

  @Column({ name: "source_type", type: "varchar", length: 64, nullable: true })
  sourceType!: string | null;

  @Column({ name: "source_id", type: "varchar", length: 64, nullable: true })
  sourceId!: string | null;

  @Column({ name: "status", type: "varchar", length: 32, default: "active" })
  status!: string;
}
