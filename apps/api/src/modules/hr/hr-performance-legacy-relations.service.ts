import { Injectable } from "@nestjs/common";
import {
  HR_PERMISSIONS,
  type PaginatedResult,
  type TenantParkScope,
} from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { HrPerformanceLegacyPageQueryDto } from "./dto/hr-performance-legacy.dto";
import type { HrPerformanceLegacyRelationQueryDto } from "./dto/hr-performance-legacy-relations.dto";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type RawRow = Record<string, unknown>;
type PageQuery = HrPerformanceLegacyPageQueryDto;
type Page<T> = PaginatedResult<T> & { page_size: number };

const has = (actor: JwtPrincipal, permission: string): boolean =>
  Boolean(
    actor.isSuper ||
      actor.permissions?.includes("*") ||
      actor.permissions?.includes(permission),
  );

const text = (value: unknown): string => String(value);
const optionalText = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);
const integer = (value: unknown): number => Number(value);
const optionalInteger = (value: unknown): number | null =>
  value === null || value === undefined ? null : Number(value);

@Injectable()
export class HrPerformanceLegacyRelationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async sessions(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: PageQuery,
  ) {
    if (!this.canReadDefinitions(actor)) return this.emptyPage(query);
    const result = await this.readPage(
      scope,
      query,
      "hr_performance_legacy_session",
      "hr_performance_legacy_session",
      `fact.source_session_id "sourceSessionId",
       fact.source_session_name "sourceSessionName",
       fact.source_description "sourceDescription",
       fact.source_assessment_type "sourceAssessmentType",
       fact.source_year "sourceYear",
       fact.source_month "sourceMonth",
       fact.source_quarter "sourceQuarter",
       fact.source_my_order "sourceMyOrder",
       fact.target_review_cycle_id "targetReviewCycleId"`,
      "fact.source_year DESC NULLS LAST, fact.source_month DESC NULLS LAST, fact.source_quarter DESC NULLS LAST, fact.source_my_order ASC NULLS LAST, fact.source_session_id DESC",
      "",
      [],
      row => ({
        sourceSessionId: integer(row.sourceSessionId),
        sourceSessionName: text(row.sourceSessionName),
        sourceDescription: optionalText(row.sourceDescription),
        sourceAssessmentType: optionalText(row.sourceAssessmentType),
        sourceYear: optionalInteger(row.sourceYear),
        sourceMonth: optionalInteger(row.sourceMonth),
        sourceQuarter: optionalInteger(row.sourceQuarter),
        sourceMyOrder: optionalInteger(row.sourceMyOrder),
        targetReviewCycleId: optionalText(row.targetReviewCycleId),
      }),
    );
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_relation_session",
      action: "读取玉舟历史绩效周期定义",
      bizType: "hr_performance_legacy_session",
      bizId: null,
      path: "/hr/performance-legacy/relations/sessions",
      fieldGroups: ["legacy_definition_metadata"],
      projection: "metadata",
      itemCount: result.items.length,
    });
    return result;
  }

  async scoreSources(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyRelationQueryDto,
  ) {
    if (!this.canReadPersonRelations(actor)) return this.emptyPage(query);
    const filter = this.sessionFilter(query);
    const result = await this.readPage(
      scope,
      query,
      "hr_performance_legacy_score_source",
      "hr_performance_legacy_score_source",
      `fact.source_score_id "sourceScoreId",
       fact.source_session_id "sourceSessionId",
       fact.source_person_code "sourcePersonCode",
       fact.source_item_id "sourceItemId",
       fact.source_relation_type "sourceRelationType",
       fact.source_item_value::text "sourceItemValue",
       fact.source_ass_grade "sourceAssGrade",
       fact.source_appraisal "sourceAppraisal",
       fact.legacy_session_id "legacySessionId",
       fact.legacy_dimension_profile_id "legacyDimensionProfileId"`,
      "fact.source_session_id DESC NULLS LAST, fact.source_person_code ASC NULLS LAST, fact.source_item_id ASC NULLS LAST, fact.source_score_id ASC",
      filter.sql,
      filter.parameters,
      row => ({
        sourceScoreId: integer(row.sourceScoreId),
        sourceSessionId: optionalInteger(row.sourceSessionId),
        sourcePersonCode: optionalText(row.sourcePersonCode),
        sourceItemId: optionalInteger(row.sourceItemId),
        sourceRelationType: optionalInteger(row.sourceRelationType),
        sourceItemValue: optionalText(row.sourceItemValue),
        sourceAssGrade: optionalText(row.sourceAssGrade),
        sourceAppraisal: optionalText(row.sourceAppraisal),
        legacySessionId: optionalText(row.legacySessionId),
        legacyDimensionProfileId: optionalText(row.legacyDimensionProfileId),
      }),
    );
    await this.auditPersonRelations(
      scope,
      actor,
      "评分来源",
      "score-sources",
      "hr_performance_legacy_score_source",
      result.items.length,
    );
    return result;
  }

  async sourcePersonAssignments(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyRelationQueryDto,
  ) {
    if (!this.canReadPersonRelations(actor)) return this.emptyPage(query);
    const filter = this.sessionFilter(query);
    const result = await this.readPage(
      scope,
      query,
      "hr_performance_legacy_source_person_assignment",
      "hr_performance_legacy_source_person_assignment",
      `fact.source_assignment_id "sourceAssignmentId",
       fact.source_session_id "sourceSessionId",
       fact.source_person_code "sourcePersonCode",
       fact.source_assessor_code "sourceAssessorCode",
       fact.source_relation_type "sourceRelationType",
       fact.legacy_session_id "legacySessionId"`,
      "fact.source_session_id DESC NULLS LAST, fact.source_person_code ASC NULLS LAST, fact.source_assessor_code ASC NULLS LAST, fact.source_assignment_id ASC",
      filter.sql,
      filter.parameters,
      row => ({
        sourceAssignmentId: integer(row.sourceAssignmentId),
        sourceSessionId: optionalInteger(row.sourceSessionId),
        sourcePersonCode: optionalText(row.sourcePersonCode),
        sourceAssessorCode: optionalText(row.sourceAssessorCode),
        sourceRelationType: optionalInteger(row.sourceRelationType),
        legacySessionId: optionalText(row.legacySessionId),
      }),
    );
    await this.auditPersonRelations(
      scope,
      actor,
      "评分人分配",
      "source-person-assignments",
      "hr_performance_legacy_source_person_assignment",
      result.items.length,
    );
    return result;
  }

  private canReadDefinitions(actor: JwtPrincipal): boolean {
    return (
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ) ||
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE)
    );
  }

  private canReadPersonRelations(actor: JwtPrincipal): boolean {
    return (
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_RESULT_READ) ||
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_MANAGE)
    );
  }

  private visibilitySql(targetTable: string): string {
    return `JOIN legacy_record_map record_map
      ON record_map.id=fact.legacy_record_map_id
     AND record_map.batch_id=fact.migration_batch_id
     AND record_map.source_system='yuzhou-v10'
     AND record_map.target_table='${targetTable}'
     AND record_map.target_id=fact.id
     AND record_map.mapping_status='verified'
     AND record_map.is_active=true
    JOIN migration_batch batch
      ON batch.id=fact.migration_batch_id
     AND batch.source_system='yuzhou-v10'
     AND batch.execution_context='production_import'
     AND batch.status='succeeded'
    WHERE fact.tenant_id=$1 AND fact.park_id=$2`;
  }

  private sessionFilter(query: HrPerformanceLegacyRelationQueryDto): {
    sql: string;
    parameters: unknown[];
  } {
    return query.source_session_id === undefined
      ? { sql: "", parameters: [] }
      : { sql: " AND fact.source_session_id=$3", parameters: [query.source_session_id] };
  }

  private async readPage<T>(
    scope: TenantParkScope,
    query: PageQuery,
    table: string,
    targetTable: string,
    projection: string,
    orderBy: string,
    filterSql: string,
    filterParameters: unknown[],
    project: (row: RawRow) => T,
  ): Promise<Page<T>> {
    const visibility = this.visibilitySql(targetTable);
    const parameters: unknown[] = [
      scope.tenantId,
      scope.parkId,
      ...filterParameters,
    ];
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total FROM ${table} fact ${visibility}${filterSql}`,
      [...parameters],
    )) as Array<{ total: number | string }>;
    const limitIndex = parameters.length + 1;
    const offsetIndex = limitIndex + 1;
    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const rows = (await this.dataSource.query(
      `SELECT ${projection} FROM ${table} fact ${visibility}${filterSql}
       ORDER BY ${orderBy} LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
      parameters,
    )) as RawRow[];
    return {
      items: rows.map(project),
      total: Number(countRows[0]?.total ?? 0),
      page: query.page,
      page_size: query.page_size,
    };
  }

  private emptyPage<T>(query: PageQuery): Page<T> {
    return { items: [], total: 0, page: query.page, page_size: query.page_size };
  }

  private auditPersonRelations(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    label: string,
    route: string,
    bizType: string,
    itemCount: number,
  ) {
    return recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_person_relation",
      action: `读取玉舟历史绩效${label}`,
      bizType,
      bizId: null,
      path: `/hr/performance-legacy/relations/${route}`,
      fieldGroups: ["legacy_projection"],
      projection: "park",
      itemCount,
    });
  }
}
