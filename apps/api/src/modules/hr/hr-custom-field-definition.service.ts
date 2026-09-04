import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { HR_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { DataSource, Repository, SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import { HrCustomFieldDefinitionQueryDto, ReviewHrCustomFieldDefinitionDto } from "./dto/hr-custom-field-definition.dto";
import {
  HrCustomFieldDefinitionEntity,
  HrCustomFieldLegacyReviewEntity,
  type HrCustomFieldCoverageStatus,
  type HrCustomFieldReviewReasonCode,
  type HrCustomFieldReviewStatus,
  type HrCustomFieldRuleClassification
} from "./entities/hr-custom-field-definition.entity";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

interface CustomFieldDefinitionRaw {
  id: string;
  field_code: string;
  display_label: string;
  value_type: string;
  field_group: string | null;
  sort_order: number | string;
  sensitivity: string;
  status: string;
  source_column: string | null;
  legacy_definition_id: string | null;
  legacy_datatype: string | null;
  legacy_group_id: string | null;
  legacy_sort_order: number | string | null;
  legacy_nullable: boolean | null;
  legacy_description_d_present: boolean | null;
  legacy_sqltext_present: boolean | null;
  legacy_crosssql_present: boolean | null;
  base_classification: "text" | "numeric" | "date" | null;
  imported_classification: HrCustomFieldRuleClassification | null;
  classification_override: HrCustomFieldRuleClassification | null;
  review_status: HrCustomFieldReviewStatus | null;
  coverage_status: HrCustomFieldCoverageStatus | null;
  target_field_key: string | null;
  review_reason_code: HrCustomFieldReviewReasonCode | null;
  review_version: number | string | null;
  logic_fingerprint_count: number | string;
}

export interface HrCustomFieldDefinitionProjection {
  id: string;
  fieldCode: string;
  displayLabel: string;
  valueType: string;
  fieldGroup: string | null;
  sortOrder: number;
  sensitivity: string;
  status: string;
  sourceColumn: string | null;
  legacyDefinitionId: string | null;
  legacyDatatype: string | null;
  legacyGroupId: string | null;
  legacySortOrder: number | null;
  legacyNullable: boolean | null;
  baseClassification: "text" | "numeric" | "date" | null;
  descriptionD: { present: boolean | null; fingerprinted: boolean };
  legacyRules: {
    sqltextPresent: boolean | null;
    crosssqlPresent: boolean | null;
    importedClassification: HrCustomFieldRuleClassification | null;
    classification: HrCustomFieldRuleClassification;
  };
  review: {
    status: HrCustomFieldReviewStatus;
    reasonCode: HrCustomFieldReviewReasonCode | null;
    version: number;
  };
  coverage: { status: HrCustomFieldCoverageStatus; targetFieldKey: string | null };
  logicCoverage: { captured: number; denominator: 10; complete: boolean };
  metadataCoverage: "complete" | "partial" | "missing";
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

export function projectHrCustomFieldDefinition(row: CustomFieldDefinitionRaw): HrCustomFieldDefinitionProjection {
  const proofFields = [row.legacy_definition_id, row.legacy_datatype, row.legacy_sort_order, row.base_classification, row.legacy_description_d_present, row.legacy_sqltext_present, row.legacy_crosssql_present, row.imported_classification];
  const proofCount = proofFields.filter((value) => value !== null).length;
  return {
    id: row.id,
    fieldCode: row.field_code,
    displayLabel: row.display_label,
    valueType: row.value_type,
    fieldGroup: row.field_group,
    sortOrder: Number(row.sort_order),
    sensitivity: row.sensitivity,
    status: row.status,
    sourceColumn: row.source_column,
    legacyDefinitionId: row.legacy_definition_id,
    legacyDatatype: row.legacy_datatype,
    legacyGroupId: row.legacy_group_id,
    legacySortOrder: nullableNumber(row.legacy_sort_order),
    legacyNullable: row.legacy_nullable,
    baseClassification: row.base_classification,
    descriptionD: { present: row.legacy_description_d_present, fingerprinted: row.legacy_description_d_present === true },
    legacyRules: {
      sqltextPresent: row.legacy_sqltext_present,
      crosssqlPresent: row.legacy_crosssql_present,
      importedClassification: row.imported_classification,
      classification: row.classification_override ?? row.imported_classification ?? "review_required"
    },
    review: {
      status: row.review_status ?? "pending",
      reasonCode: row.review_reason_code,
      version: row.review_version === null ? 0 : Number(row.review_version)
    },
    coverage: { status: row.coverage_status ?? "unmapped", targetFieldKey: row.target_field_key },
    logicCoverage: { captured: Number(row.logic_fingerprint_count), denominator: 10, complete: Number(row.logic_fingerprint_count) === 10 },
    metadataCoverage: proofCount === 0 ? "missing" : proofCount === proofFields.length ? "complete" : "partial"
  };
}

@Injectable()
export class HrCustomFieldDefinitionService {
  constructor(
    @InjectRepository(HrCustomFieldDefinitionEntity) private readonly definitions: Repository<HrCustomFieldDefinitionEntity>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: HrCustomFieldDefinitionQueryDto) {
    this.assertManagePermission(actor);
    const builder = this.listBuilder(scope);
    if (query.keyword) {
      builder.andWhere("(definition.field_code ILIKE :keyword OR definition.display_label ILIKE :keyword OR definition.legacy_definition_id ILIKE :keyword)", { keyword: `%${query.keyword}%` });
    }
    if (query.classification) builder.andWhere("COALESCE(review.classification_override,definition.legacy_rule_classification,'review_required')=:classification", { classification: query.classification });
    if (query.review_status) builder.andWhere("COALESCE(review.review_status,'pending')=:reviewStatus", { reviewStatus: query.review_status });
    if (query.coverage_status) builder.andWhere("COALESCE(review.coverage_status,'unmapped')=:coverageStatus", { coverageStatus: query.coverage_status });

    const total = await builder.clone().getCount();
    const raw = await this.selectProjection(builder)
      .orderBy("definition.sort_order", "ASC")
      .addOrderBy("definition.id", "ASC")
      .offset((query.page - 1) * query.page_size)
      .limit(query.page_size)
      .getRawMany<CustomFieldDefinitionRaw>();
    const items = raw.map(projectHrCustomFieldDefinition);
    const summary = await this.summary(scope);
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.custom_field_definition",
      action: "读取玉舟自定义字段安全元数据",
      bizType: "hr_custom_field_definition",
      bizId: null,
      path: "/hr/custom-field-definitions/legacy",
      fieldGroups: ["legacy_definition_metadata"],
      projection: "metadata",
      itemCount: items.length
    });
    return { items, total, page: query.page, page_size: query.page_size, summary };
  }

  async review(scope: TenantParkScope, actor: JwtPrincipal, definitionId: string, dto: ReviewHrCustomFieldDefinitionDto) {
    this.assertManagePermission(actor);
    this.assertReviewShape(dto);
    return this.dataSource.transaction(async (manager) => {
      const definitionRepo = manager.getRepository(HrCustomFieldDefinitionEntity);
      const reviewRepo = manager.getRepository(HrCustomFieldLegacyReviewEntity);
      const definition = await definitionRepo.findOne({ where: { id: definitionId, ...scope, origin: "legacy", isDeleted: false }, lock: { mode: "pessimistic_write" } });
      if (!definition) throw new NotFoundException("Legacy custom field definition not found");
      let row = await reviewRepo.findOne({ where: { ...scope, definitionId, isDeleted: false }, lock: { mode: "pessimistic_write" } });
      if (!row) {
        if (dto.expectedVersion !== 0) throw new ConflictException("Custom field review version changed");
        row = reviewRepo.create({ ...scope, definitionId, createBy: actor.sub, version: 1 });
      } else if (row.version !== dto.expectedVersion) {
        throw new ConflictException("Custom field review version changed");
      }
      const pending = dto.reviewStatus === "pending";
      Object.assign(row, {
        classificationOverride: pending ? null : dto.classification,
        reviewStatus: dto.reviewStatus,
        coverageStatus: dto.coverageStatus,
        targetFieldKey: dto.coverageStatus === "mapped" ? dto.targetFieldKey : null,
        reviewReasonCode: pending ? null : dto.reviewReasonCode,
        reviewedBy: pending ? null : actor.sub,
        reviewedAt: pending ? null : new Date(),
        updateBy: actor.sub,
        remark: null
      });
      const saved = await reviewRepo.save(row);
      return { id: definitionId, reviewStatus: saved.reviewStatus, coverageStatus: saved.coverageStatus, reviewVersion: saved.version };
    });
  }

  private listBuilder(scope: TenantParkScope): SelectQueryBuilder<HrCustomFieldDefinitionEntity> {
    return this.definitions.createQueryBuilder("definition")
      .leftJoin(HrCustomFieldLegacyReviewEntity, "review", "review.definition_id=definition.id AND review.tenant_id=definition.tenant_id AND review.park_id=definition.park_id AND review.is_deleted=false")
      .where("definition.tenant_id=:tenantId AND definition.park_id=:parkId", scope)
      .andWhere("definition.origin='legacy' AND definition.is_deleted=false");
  }

  private selectProjection(builder: SelectQueryBuilder<HrCustomFieldDefinitionEntity>) {
    return builder.select([
      "definition.id AS id", "definition.field_code AS field_code", "definition.display_label AS display_label",
      "definition.value_type AS value_type", "definition.field_group AS field_group", "definition.sort_order AS sort_order",
      "definition.sensitivity AS sensitivity", "definition.status AS status", "definition.source_column AS source_column",
      "definition.legacy_definition_id AS legacy_definition_id", "definition.legacy_datatype AS legacy_datatype",
      "definition.legacy_group_id AS legacy_group_id", "definition.legacy_sort_order AS legacy_sort_order",
      "definition.legacy_nullable AS legacy_nullable", "definition.legacy_description_d_present AS legacy_description_d_present",
      "definition.legacy_sqltext_present AS legacy_sqltext_present", "definition.legacy_crosssql_present AS legacy_crosssql_present",
      "definition.base_classification AS base_classification",
      "definition.legacy_rule_classification AS imported_classification", "review.classification_override AS classification_override",
      "review.review_status AS review_status", "review.coverage_status AS coverage_status",
      "review.target_field_key AS target_field_key", "review.review_reason_code AS review_reason_code", "review.version AS review_version",
      "(SELECT count(*) FROM hr_custom_field_legacy_logic_fingerprint logic WHERE logic.tenant_id=definition.tenant_id AND logic.park_id=definition.park_id AND logic.definition_id=definition.id) AS logic_fingerprint_count"
    ]);
  }

  private async summary(scope: TenantParkScope) {
    const rows = await this.dataSource.query<Array<{ total: string; pending: string; mapped: string; blocked: string; complete: string }>>(
      `SELECT count(*)::text AS total,
              count(*) FILTER(WHERE COALESCE(review.review_status,'pending')='pending')::text AS pending,
              count(*) FILTER(WHERE COALESCE(review.coverage_status,'unmapped')='mapped')::text AS mapped,
              count(*) FILTER(WHERE COALESCE(review.coverage_status,'unmapped')='blocked')::text AS blocked,
              count(*) FILTER(WHERE definition.legacy_definition_id IS NOT NULL
                                AND definition.legacy_datatype IS NOT NULL
                                AND definition.legacy_sort_order IS NOT NULL
                                AND definition.base_classification IS NOT NULL
                                AND definition.legacy_description_d_present IS NOT NULL
                                AND definition.legacy_sqltext_present IS NOT NULL
                                AND definition.legacy_crosssql_present IS NOT NULL
                                AND definition.legacy_rule_classification IS NOT NULL
                                AND (SELECT count(*) FROM hr_custom_field_legacy_logic_fingerprint logic
                                     WHERE logic.tenant_id=definition.tenant_id AND logic.park_id=definition.park_id
                                       AND logic.definition_id=definition.id)=10)::text AS complete
         FROM hr_custom_field_definition definition
         LEFT JOIN hr_custom_field_legacy_review review
           ON review.definition_id=definition.id AND review.tenant_id=definition.tenant_id
          AND review.park_id=definition.park_id AND review.is_deleted=false
        WHERE definition.tenant_id=$1 AND definition.park_id=$2
          AND definition.origin='legacy' AND definition.is_deleted=false`,
      [scope.tenantId, scope.parkId]
    );
    const row = rows[0] ?? { total: "0", pending: "0", mapped: "0", blocked: "0", complete: "0" };
    return { total: Number(row.total), pending: Number(row.pending), mapped: Number(row.mapped), blocked: Number(row.blocked), complete: Number(row.complete) };
  }

  private assertManagePermission(actor: JwtPrincipal): void {
    if (actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(HR_PERMISSIONS.HR_EMPLOYEE_PROFILE_MANAGE)) return;
    throw new ForbiddenException("HR custom field metadata management is not permitted");
  }

  private assertReviewShape(dto: ReviewHrCustomFieldDefinitionDto): void {
    if (dto.coverageStatus === "mapped" && !dto.targetFieldKey) throw new BadRequestException("Mapped coverage requires targetFieldKey");
    if (dto.coverageStatus !== "mapped" && dto.targetFieldKey) throw new BadRequestException("targetFieldKey is allowed only for mapped coverage");
    if (dto.reviewStatus === "pending" && dto.reviewReasonCode) throw new BadRequestException("Pending review must not have a reason code");
    if (dto.reviewStatus !== "pending" && !dto.reviewReasonCode) throw new BadRequestException("Completed review requires a reason code");
    if (dto.reviewStatus === "pending" && (dto.classification !== "review_required" || dto.coverageStatus !== "unmapped")) {
      throw new BadRequestException("Pending review must remain fail-closed");
    }
    if (dto.reviewStatus === "rejected" && dto.coverageStatus !== "blocked") {
      throw new BadRequestException("Rejected review must block modern coverage");
    }
  }
}
