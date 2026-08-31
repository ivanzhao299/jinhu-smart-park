import { Column, Entity, Index } from "typeorm";
import type { PartyType, PropertyOccupancyDomain } from "@jinhu/shared";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_party")
@Index("idx_biz_party_scope_type_name", ["tenantId", "parkId", "partyType", "displayName"])
@Index("uq_biz_party_scope_identity_hash", ["tenantId", "parkId", "identityDocumentType", "identityNumberHash"], {
  unique: true,
  where: "is_deleted = false AND identity_number_hash IS NOT NULL"
})
export class PartyEntity extends AuditableEntity {
  @Column({ name: "party_type", type: "varchar", length: 32 })
  partyType!: PartyType;

  @Column({ name: "display_name", type: "varchar", length: 200 })
  displayName!: string;

  @Column({ name: "mobile", type: "varchar", length: 32, nullable: true })
  mobile!: string | null;

  @Column({ name: "email", type: "varchar", length: 200, nullable: true })
  email!: string | null;

  @Column({ name: "identity_document_type", type: "varchar", length: 32, nullable: true })
  identityDocumentType!: string | null;

  @Column({ name: "identity_number_encrypted", type: "text", nullable: true, select: false })
  identityNumberEncrypted!: string | null;

  @Column({ name: "identity_number_encryption_key_id", type: "varchar", length: 128, nullable: true })
  identityNumberEncryptionKeyId!: string | null;

  @Column({ name: "identity_number_hash", type: "varchar", length: 80, nullable: true, select: false })
  identityNumberHash!: string | null;

  @Column({ name: "identity_number_masked", type: "varchar", length: 64, nullable: true })
  identityNumberMasked!: string | null;

  @Column({ name: "source_domain", type: "varchar", length: 32, nullable: true })
  sourceDomain!: PropertyOccupancyDomain | null;

  @Column({ name: "verification_status", type: "varchar", length: 32, default: "unverified" })
  verificationStatus!: string;

  @Column({ name: "consent_status", type: "varchar", length: 32, default: "pending" })
  consentStatus!: string;

  @Column({ name: "identity_version", type: "bigint", default: 0 })
  identityVersion!: string;

  @Column({ name: "current_identity_submission_id", type: "uuid", nullable: true })
  currentIdentitySubmissionId!: string | null;

  @Column({ name: "current_verified_submission_id", type: "uuid", nullable: true })
  currentVerifiedSubmissionId!: string | null;
}
