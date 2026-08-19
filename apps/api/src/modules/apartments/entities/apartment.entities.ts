import { Column, Entity, Index } from "typeorm";
import type { ApartmentApplicationStatus, ApartmentGenderPolicy, ApartmentRoomType, ApartmentStayStatus } from "@jinhu/shared";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("biz_apartment_room")
@Index("uq_apartment_room_scope_unit", ["tenantId", "parkId", "unitId"], { unique: true, where: "is_deleted = false" })
export class ApartmentRoomEntity extends AuditableEntity {
  @Column({ name: "unit_id", type: "uuid" }) unitId!: string;
  @Column({ name: "occupancy_id", type: "uuid", nullable: true }) occupancyId!: string | null;
  @Column({ name: "room_type", type: "varchar", length: 32 }) roomType!: ApartmentRoomType;
  @Column({ name: "gender_policy", type: "varchar", length: 16, default: "any" }) genderPolicy!: ApartmentGenderPolicy;
  @Column({ type: "integer", default: 1 }) capacity!: number;
  @Column({ type: "jsonb", default: () => "'[]'::jsonb" }) facilities!: string[];
  @Column({ name: "management_status", type: "varchar", length: 24, default: "draft" }) managementStatus!: string;
  @Column({ name: "effective_from", type: "date", nullable: true }) effectiveFrom!: string | null;
}

@Entity("biz_apartment_bed")
export class ApartmentBedEntity extends AuditableEntity {
  @Column({ name: "room_id", type: "uuid" }) roomId!: string;
  @Column({ name: "bed_code", type: "varchar", length: 32 }) bedCode!: string;
  @Column({ type: "varchar", length: 24, default: "enabled" }) status!: string;
}

@Entity("biz_apartment_application")
export class ApartmentApplicationEntity extends AuditableEntity {
  @Column({ name: "application_code", type: "varchar", length: 64 }) applicationCode!: string;
  @Column({ name: "applicant_party_id", type: "uuid", nullable: true }) applicantPartyId!: string | null;
  @Column({ name: "applicant_user_id", type: "uuid", nullable: true }) applicantUserId!: string | null;
  @Column({ name: "applicant_name", type: "varchar", length: 100 }) applicantName!: string;
  @Column({ name: "applicant_type", type: "varchar", length: 32 }) applicantType!: string;
  @Column({ name: "organization_name", type: "varchar", length: 200, nullable: true }) organizationName!: string | null;
  @Column({ name: "department_name", type: "varchar", length: 200, nullable: true }) departmentName!: string | null;
  @Column({ name: "job_title", type: "varchar", length: 100, nullable: true }) jobTitle!: string | null;
  @Column({ name: "mobile_masked", type: "varchar", length: 32, nullable: true }) mobileMasked!: string | null;
  @Column({ name: "identity_number_masked", type: "varchar", length: 64, nullable: true }) identityNumberMasked!: string | null;
  @Column({ name: "emergency_contact_name", type: "varchar", length: 100, nullable: true }) emergencyContactName!: string | null;
  @Column({ name: "emergency_contact_mobile", type: "varchar", length: 32, nullable: true }) emergencyContactMobile!: string | null;
  @Column({ name: "household_size", type: "integer", default: 1 }) householdSize!: number;
  @Column({ name: "accompanying_names", type: "varchar", length: 500, nullable: true }) accompanyingNames!: string | null;
  @Column({ name: "vehicle_plate", type: "varchar", length: 32, nullable: true }) vehiclePlate!: string | null;
  @Column({ name: "accommodation_notes", type: "varchar", length: 1000, nullable: true }) accommodationNotes!: string | null;
  @Column({ name: "policy_accepted", type: "boolean", default: false }) policyAccepted!: boolean;
  @Column({ name: "requested_room_type", type: "varchar", length: 32 }) requestedRoomType!: ApartmentRoomType;
  @Column({ name: "requested_start_date", type: "date" }) requestedStartDate!: string;
  @Column({ name: "requested_end_date", type: "date", nullable: true }) requestedEndDate!: string | null;
  @Column({ type: "varchar", length: 1000 }) reason!: string;
  @Column({ type: "varchar", length: 32, default: "draft" }) status!: ApartmentApplicationStatus;
  @Column({ name: "submitted_at", type: "timestamptz", nullable: true }) submittedAt!: Date | null;
  @Column({ name: "decided_at", type: "timestamptz", nullable: true }) decidedAt!: Date | null;
}

@Entity("biz_apartment_approval")
export class ApartmentApprovalEntity extends AuditableEntity {
  @Column({ name: "application_id", type: "uuid" }) applicationId!: string;
  @Column({ name: "application_version", type: "integer" }) applicationVersion!: number;
  @Column({ type: "varchar", length: 16 }) decision!: "approve" | "reject";
  @Column({ name: "decided_by", type: "uuid" }) decidedBy!: string;
  @Column({ name: "decided_at", type: "timestamptz" }) decidedAt!: Date;
  @Column({ type: "varchar", length: 1000, nullable: true }) opinion!: string | null;
  @Column({ name: "approved_start_date", type: "date", nullable: true }) approvedStartDate!: string | null;
  @Column({ name: "approved_end_date", type: "date", nullable: true }) approvedEndDate!: string | null;
  @Column({ name: "cost_bearer", type: "varchar", length: 24, nullable: true }) costBearer!: string | null;
  @Column({ name: "deposit_amount", type: "numeric", precision: 12, scale: 2, nullable: true }) depositAmount!: string | null;
  @Column({ name: "monthly_fee", type: "numeric", precision: 12, scale: 2, nullable: true }) monthlyFee!: string | null;
  @Column({ name: "allocation_note", type: "varchar", length: 500, nullable: true }) allocationNote!: string | null;
  @Column({ name: "safety_requirements", type: "varchar", length: 1000, nullable: true }) safetyRequirements!: string | null;
}

@Entity("biz_apartment_stay")
export class ApartmentStayEntity extends AuditableEntity {
  @Column({ name: "stay_code", type: "varchar", length: 64 }) stayCode!: string;
  @Column({ name: "application_id", type: "uuid" }) applicationId!: string;
  @Column({ name: "room_id", type: "uuid" }) roomId!: string;
  @Column({ name: "bed_id", type: "uuid" }) bedId!: string;
  @Column({ name: "occupant_party_id", type: "uuid", nullable: true }) occupantPartyId!: string | null;
  @Column({ name: "occupant_user_id", type: "uuid", nullable: true }) occupantUserId!: string | null;
  @Column({ name: "occupant_name", type: "varchar", length: 100 }) occupantName!: string;
  @Column({ name: "planned_start_date", type: "date" }) plannedStartDate!: string;
  @Column({ name: "planned_end_date", type: "date", nullable: true }) plannedEndDate!: string | null;
  @Column({ name: "actual_check_in_at", type: "timestamptz", nullable: true }) actualCheckInAt!: Date | null;
  @Column({ name: "checkout_requested_at", type: "timestamptz", nullable: true }) checkoutRequestedAt!: Date | null;
  @Column({ name: "actual_check_out_at", type: "timestamptz", nullable: true }) actualCheckOutAt!: Date | null;
  @Column({ type: "varchar", length: 32, default: "reserved" }) status!: ApartmentStayStatus;
}

@Entity("biz_apartment_handover")
export class ApartmentHandoverEntity extends AuditableEntity {
  @Column({ name: "stay_id", type: "uuid" }) stayId!: string;
  @Column({ name: "handover_type", type: "varchar", length: 16 }) handoverType!: "move_in" | "move_out";
  @Column({ type: "varchar", length: 24, default: "draft" }) status!: string;
  @Column({ name: "item_snapshot", type: "jsonb", default: () => "'[]'::jsonb" }) itemSnapshot!: unknown[];
  @Column({ name: "key_snapshot", type: "jsonb", default: () => "'[]'::jsonb" }) keySnapshot!: unknown[];
  @Column({ name: "photo_file_ids", type: "jsonb", default: () => "'[]'::jsonb" }) photoFileIds!: string[];
  @Column({ name: "exception_note", type: "varchar", length: 1000, nullable: true }) exceptionNote!: string | null;
  @Column({ name: "water_meter_reading", type: "numeric", precision: 14, scale: 3, nullable: true }) waterMeterReading!: string | null;
  @Column({ name: "electricity_meter_reading", type: "numeric", precision: 14, scale: 3, nullable: true }) electricityMeterReading!: string | null;
  @Column({ name: "confirmed_by", type: "uuid", nullable: true }) confirmedBy!: string | null;
  @Column({ name: "confirmed_at", type: "timestamptz", nullable: true }) confirmedAt!: Date | null;
}

@Entity("biz_apartment_document_template")
export class ApartmentDocumentTemplateEntity extends AuditableEntity {
  @Column({ name: "document_type", type: "varchar", length: 40 }) documentType!: string;
  @Column({ name: "version_no", type: "integer" }) versionNo!: number;
  @Column({ type: "varchar", length: 16, default: "draft" }) status!: string;
  @Column({ name: "template_file_id", type: "uuid", nullable: true }) templateFileId!: string | null;
  @Column({ type: "varchar", length: 200 }) title!: string;
  @Column({ name: "content_html", type: "text" }) contentHtml!: string;
  @Column({ name: "signature_required", type: "boolean", default: true }) signatureRequired!: boolean;
  @Column({ name: "variable_schema", type: "jsonb", default: () => "'{}'::jsonb" }) variableSchema!: Record<string, unknown>;
  @Column({ name: "published_at", type: "timestamptz", nullable: true }) publishedAt!: Date | null;
}

@Entity("biz_apartment_document")
export class ApartmentDocumentEntity extends AuditableEntity {
  @Column({ name: "document_no", type: "varchar", length: 64 }) documentNo!: string;
  @Column({ name: "stay_id", type: "uuid", nullable: true }) stayId!: string | null;
  @Column({ name: "application_id", type: "uuid", nullable: true }) applicationId!: string | null;
  @Column({ name: "template_id", type: "uuid" }) templateId!: string;
  @Column({ name: "document_type", type: "varchar", length: 40 }) documentType!: string;
  @Column({ name: "template_version", type: "integer" }) templateVersion!: number;
  @Column({ type: "varchar", length: 200 }) title!: string;
  @Column({ name: "content_html", type: "text" }) contentHtml!: string;
  @Column({ type: "varchar", length: 24, default: "pending_signature" }) status!: string;
  @Column({ name: "variable_snapshot", type: "jsonb", default: () => "'{}'::jsonb" }) variableSnapshot!: Record<string, unknown>;
  @Column({ name: "generated_file_id", type: "uuid", nullable: true }) generatedFileId!: string | null;
  @Column({ name: "signed_file_id", type: "uuid", nullable: true }) signedFileId!: string | null;
  @Column({ name: "signed_sha256", type: "char", length: 64, nullable: true }) signedSha256!: string | null;
  @Column({ name: "signed_at", type: "timestamptz", nullable: true }) signedAt!: Date | null;
  @Column({ name: "signature_method", type: "varchar", length: 16, nullable: true }) signatureMethod!: string | null;
  @Column({ name: "signer_user_id", type: "uuid", nullable: true }) signerUserId!: string | null;
  @Column({ name: "signer_name", type: "varchar", length: 100, nullable: true }) signerName!: string | null;
  @Column({ name: "signature_statement", type: "varchar", length: 500, nullable: true }) signatureStatement!: string | null;
  @Column({ name: "signature_evidence", type: "jsonb", default: () => "'{}'::jsonb" }) signatureEvidence!: Record<string, unknown>;
  @Column({ name: "voided_at", type: "timestamptz", nullable: true }) voidedAt!: Date | null;
  @Column({ name: "void_reason", type: "varchar", length: 500, nullable: true }) voidReason!: string | null;
}

export const APARTMENT_ENTITIES = [ApartmentRoomEntity, ApartmentBedEntity, ApartmentApplicationEntity, ApartmentApprovalEntity, ApartmentStayEntity, ApartmentHandoverEntity, ApartmentDocumentTemplateEntity, ApartmentDocumentEntity];
