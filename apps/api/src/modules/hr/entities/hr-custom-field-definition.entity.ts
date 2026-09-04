import { Column, Entity, Index, PrimaryGeneratedColumn } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

export const HR_CUSTOM_FIELD_RULE_CLASSIFICATIONS = ["declarative", "inert", "review_required"] as const;
export const HR_CUSTOM_FIELD_REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export const HR_CUSTOM_FIELD_COVERAGE_STATUSES = ["unmapped", "mapped", "excluded", "blocked"] as const;
export const HR_CUSTOM_FIELD_REVIEW_REASON_CODES = ["confirmed_declarative", "confirmed_inert", "requires_remediation", "mapped_to_modern_field", "excluded_obsolete", "insufficient_evidence"] as const;

export type HrCustomFieldRuleClassification = (typeof HR_CUSTOM_FIELD_RULE_CLASSIFICATIONS)[number];
export type HrCustomFieldReviewStatus = (typeof HR_CUSTOM_FIELD_REVIEW_STATUSES)[number];
export type HrCustomFieldCoverageStatus = (typeof HR_CUSTOM_FIELD_COVERAGE_STATUSES)[number];
export type HrCustomFieldReviewReasonCode = (typeof HR_CUSTOM_FIELD_REVIEW_REASON_CODES)[number];

@Entity("hr_custom_field_definition")
export class HrCustomFieldDefinitionEntity {
  @PrimaryGeneratedColumn("uuid") id!: string;
  @Column({ name: "tenant_id", length: 64 }) tenantId!: string;
  @Column({ name: "park_id", length: 64 }) parkId!: string;
  @Column({ name: "field_code", length: 64 }) fieldCode!: string;
  @Column({ name: "display_label", length: 100 }) displayLabel!: string;
  @Column({ name: "value_type", length: 16 }) valueType!: string;
  @Column({ name: "field_group", type: "varchar", length: 100, nullable: true }) fieldGroup!: string | null;
  @Column({ name: "sort_order", type: "integer" }) sortOrder!: number;
  @Column({ length: 16 }) sensitivity!: string;
  @Column({ length: 16 }) origin!: string;
  @Column({ name: "source_column", type: "varchar", length: 64, nullable: true }) sourceColumn!: string | null;
  @Column({ name: "legacy_definition_id", type: "varchar", length: 128, nullable: true }) legacyDefinitionId!: string | null;
  @Column({ name: "legacy_datatype", type: "varchar", length: 64, nullable: true }) legacyDatatype!: string | null;
  @Column({ name: "legacy_group_id", type: "varchar", length: 128, nullable: true }) legacyGroupId!: string | null;
  @Column({ name: "legacy_sort_order", type: "integer", nullable: true }) legacySortOrder!: number | null;
  @Column({ name: "legacy_nullable", type: "boolean", nullable: true }) legacyNullable!: boolean | null;
  @Column({ name: "legacy_description_d_present", type: "boolean", nullable: true }) legacyDescriptionDPresent!: boolean | null;
  @Column({ name: "legacy_description_d_sha256", type: "char", length: 64, nullable: true, select: false }) legacyDescriptionDSha256!: string | null;
  @Column({ name: "legacy_sqltext_present", type: "boolean", nullable: true }) legacySqltextPresent!: boolean | null;
  @Column({ name: "legacy_sqltext_sha256", type: "char", length: 64, nullable: true, select: false }) legacySqltextSha256!: string | null;
  @Column({ name: "legacy_crosssql_present", type: "boolean", nullable: true }) legacyCrosssqlPresent!: boolean | null;
  @Column({ name: "legacy_crosssql_sha256", type: "char", length: 64, nullable: true, select: false }) legacyCrosssqlSha256!: string | null;
  @Column({ name: "base_classification", type: "varchar", length: 16, nullable: true }) baseClassification!: "text" | "numeric" | "date" | null;
  @Column({ name: "legacy_rule_classification", type: "varchar", length: 24, nullable: true }) legacyRuleClassification!: HrCustomFieldRuleClassification | null;
  @Column({ length: 16 }) status!: string;
  @Column({ name: "is_deleted", type: "boolean" }) isDeleted!: boolean;
}

@Entity("hr_custom_field_legacy_review")
@Index(["tenantId", "parkId", "definitionId"], { unique: true, where: "is_deleted = false" })
export class HrCustomFieldLegacyReviewEntity extends AuditableEntity {
  @Column({ name: "definition_id", type: "uuid" }) definitionId!: string;
  @Column({ name: "classification_override", type: "varchar", length: 24, nullable: true }) classificationOverride!: HrCustomFieldRuleClassification | null;
  @Column({ name: "review_status", type: "varchar", length: 16, default: "pending" }) reviewStatus!: HrCustomFieldReviewStatus;
  @Column({ name: "coverage_status", type: "varchar", length: 16, default: "unmapped" }) coverageStatus!: HrCustomFieldCoverageStatus;
  @Column({ name: "target_field_key", type: "varchar", length: 128, nullable: true }) targetFieldKey!: string | null;
  @Column({ name: "review_reason_code", type: "varchar", length: 32, nullable: true }) reviewReasonCode!: HrCustomFieldReviewReasonCode | null;
  @Column({ name: "reviewed_by", type: "uuid", nullable: true }) reviewedBy!: string | null;
  @Column({ name: "reviewed_at", type: "timestamptz", nullable: true }) reviewedAt!: Date | null;
}
