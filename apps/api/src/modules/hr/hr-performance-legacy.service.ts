import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import {
  HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH,
  HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
  HR_PERMISSIONS,
  isHrPerformanceLegacyDepartmentMatchMode,
  isHrPerformanceLegacyDepartmentPattern,
  isHrPerformanceLegacyDepartmentPrefix,
  isHrPerformanceLegacyPersonSummaryRoutine,
  isHrPerformanceLegacyQueryText,
  normalizeHrPerformanceLegacyQueryText,
  type PaginatedResult,
  type TenantParkScope,
} from "@jinhu/shared";
import { DataSource } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { HrPerformanceLegacyAssessmentMasterQueryDto } from "./dto/hr-performance-legacy-assessment-master.dto";
import type { HrPerformanceLegacyAssessmentValueQueryDto } from "./dto/hr-performance-legacy-assessment-value.dto";
import type {
  HrPerformanceLegacyPageQueryDto,
  HrPerformanceLegacyResultQueryDto,
  HrPerformanceLegacyRubricQueryDto,
} from "./dto/hr-performance-legacy.dto";
import type { HrPerformanceLegacyPersonSummaryRoutineQueryDto } from "./dto/hr-performance-legacy-person-summary.dto";
import { recordHrSensitiveRead } from "./hr-sensitive-read-audit";

type RawRow = Record<string, unknown>;
type ResultAccess = "park" | "managed_org_tree" | "self" | "none";
type RubricLevelRow = {
  _batchId: string;
  sourceAssGrade: string;
  sourceDescription: string | null;
  sourceMyOrder: string | null;
  sourceMinValue: number | null;
  sourceMaxValue: number | null;
};
type RubricItemRow = {
  _batchId: string;
  sourceItemId: number;
  sourceItemName: string | null;
  sourceFullValue: string | null;
  sourceMyOrder: number | null;
};
type RubricGuideRow = {
  _batchId: string;
  sourceItemId: number;
  sourceGrade: string;
  sourceDescription: string | null;
};

const has = (actor: JwtPrincipal, permission: string): boolean =>
  Boolean(
    actor.isSuper ||
      actor.permissions?.includes("*") ||
      actor.permissions?.includes(permission),
  );

@Injectable()
export class HrPerformanceLegacyService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
  ) {}

  async templates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyPageQueryDto,
  ) {
    if (!this.canReadDefinitions(actor)) return this.emptyPage(query);
    const result = await this.definitionPage(
      scope,
      query,
      "hr_performance_legacy_template_profile",
      "hr_performance_legacy_template_profile",
      `fact.id,
       fact.source_assessment "sourceAssessment",
       fact.source_assessment_name "sourceAssessmentName",
       fact.source_department "sourceDepartment",
       fact.source_m_percent "sourceMPercent",
       fact.source_t_percent "sourceTPercent",
       fact.source_x_percent "sourceXPercent",
       fact.source_c_percent "sourceCPercent",
       fact.source_s_percent "sourceSPercent",
       fact.source_timekeep "sourceTimekeep",
       fact.source_bonus "sourceBonus",
       fact.source_master "sourceMaster",
       fact.target_template_id "targetTemplateId",
       fact.target_template_version_id "targetTemplateVersionId"`,
      "fact.source_assessment ASC, fact.id ASC",
    );
    await this.auditDefinitions(scope, actor, "模板", "templates", result.items.length);
    return result;
  }

  async levels(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyPageQueryDto,
  ) {
    if (!this.canReadDefinitions(actor)) return this.emptyPage(query);
    const result = await this.definitionPage(
      scope,
      query,
      "hr_performance_legacy_level_rule",
      "hr_performance_legacy_level_rule",
      `fact.id,
       fact.source_ass_grade "sourceAssGrade",
       fact.source_description "sourceDescription",
       fact.source_my_order "sourceMyOrder",
       fact.source_assessment_id "sourceAssessmentId",
       fact.source_min_value "sourceMinValue",
       fact.source_max_value "sourceMaxValue",
       fact.legacy_template_profile_id "legacyTemplateProfileId",
       fact.target_template_version_id "targetTemplateVersionId",
       fact.target_level_id "targetLevelId"`,
      "fact.source_my_order ASC NULLS LAST, fact.source_ass_grade ASC, fact.id ASC",
    );
    await this.auditDefinitions(scope, actor, "等级规则", "levels", result.items.length);
    return result;
  }

  async dimensions(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyPageQueryDto,
  ) {
    if (!this.canReadDefinitions(actor)) return this.emptyPage(query);
    const result = await this.definitionPage(
      scope,
      query,
      "hr_performance_legacy_dimension_profile",
      "hr_performance_legacy_dimension_profile",
      `fact.id,
       fact.source_item_id "sourceItemId",
       fact.source_assessment_id "sourceAssessmentId",
       fact.source_item_name "sourceItemName",
       fact.source_full_value::text "sourceFullValue",
       fact.source_my_order "sourceMyOrder",
       fact.legacy_template_profile_id "legacyTemplateProfileId",
       fact.target_template_version_id "targetTemplateVersionId",
       fact.target_dimension_id "targetDimensionId"`,
      "fact.source_my_order ASC NULLS LAST, fact.source_item_id ASC, fact.id ASC",
    );
    await this.auditDefinitions(scope, actor, "考核项目", "dimensions", result.items.length);
    return result;
  }

  async guides(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyPageQueryDto,
  ) {
    if (!this.canReadDefinitions(actor)) return this.emptyPage(query);
    const result = await this.definitionPage(
      scope,
      query,
      "hr_performance_legacy_dimension_level_guide",
      "hr_performance_legacy_dimension_level_guide",
      `fact.id,
       fact.source_guide_id "sourceGuideId",
       fact.source_item_id "sourceItemId",
       fact.source_grade "sourceGrade",
       fact.source_description "sourceDescription",
       fact.source_min_value "sourceMinValue",
       fact.source_max_value "sourceMaxValue",
       fact.source_my_order "sourceMyOrder",
       fact.legacy_dimension_profile_id "legacyDimensionProfileId",
       fact.legacy_level_rule_id "legacyLevelRuleId",
       fact.target_template_version_id "targetTemplateVersionId",
       fact.target_dimension_id "targetDimensionId",
       fact.target_level_id "targetLevelId"`,
      "fact.source_my_order ASC NULLS LAST, fact.source_guide_id ASC, fact.id ASC",
    );
    await this.auditDefinitions(scope, actor, "评分说明", "guides", result.items.length);
    return result;
  }

  async rubric(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyRubricQueryDto,
  ) {
    if (!this.canReadDefinitions(actor)) {
      return { sourceAssessmentId: query.source_assessment_id, levels: [], items: [] };
    }
    const parameters = [scope.tenantId, scope.parkId, query.source_assessment_id];
    const levels = (await this.dataSource.query(
      `SELECT fact.migration_batch_id::text "_batchId",
        fact.source_ass_grade "sourceAssGrade",
        fact.source_description "sourceDescription",
        fact.source_my_order "sourceMyOrder",
        fact.source_min_value "sourceMinValue",
        fact.source_max_value "sourceMaxValue"
       FROM hr_performance_legacy_level_rule fact
       ${this.visibilitySql("hr_performance_legacy_level_rule")}
         AND fact.source_assessment_id=$3
       ORDER BY fact.source_my_order ASC NULLS LAST,
                fact.source_ass_grade ASC, fact.id ASC`,
      parameters,
    )) as RubricLevelRow[];
    const items = (await this.dataSource.query(
      `SELECT fact.migration_batch_id::text "_batchId",
        fact.source_item_id "sourceItemId",
        fact.source_item_name "sourceItemName",
        fact.source_full_value::text "sourceFullValue",
        fact.source_my_order "sourceMyOrder"
       FROM hr_performance_legacy_dimension_profile fact
       ${this.visibilitySql("hr_performance_legacy_dimension_profile")}
         AND fact.source_assessment_id=$3
       ORDER BY fact.source_my_order ASC NULLS LAST,
                fact.source_item_id ASC, fact.id ASC`,
      parameters,
    )) as RubricItemRow[];
    const sourceItemIds = [...new Set(items.map(item => item.sourceItemId))];
    const guides = sourceItemIds.length === 0
      ? []
      : (await this.dataSource.query(
        `SELECT fact.migration_batch_id::text "_batchId",
          fact.source_item_id "sourceItemId",
          fact.source_grade "sourceGrade",
          fact.source_description "sourceDescription"
         FROM hr_performance_legacy_dimension_level_guide fact
         ${this.visibilitySql("hr_performance_legacy_dimension_level_guide")}
           AND fact.source_item_id=ANY($3::int[])
         ORDER BY fact.source_item_id ASC,
                  fact.source_my_order ASC NULLS LAST,
                  fact.source_guide_id ASC, fact.id ASC`,
        [scope.tenantId, scope.parkId, sourceItemIds],
      )) as RubricGuideRow[];

    const batchIds = new Set([...levels, ...items, ...guides].map(row => row._batchId));
    if (batchIds.size > 1) throw new ConflictException("Legacy performance rubric has multiple active source batches");
    const allowedGrades = new Set(levels.map(level => level.sourceAssGrade));
    const descriptionByItemGrade = new Map<string, string | null>();
    for (const guide of guides) {
      if (!allowedGrades.has(guide.sourceGrade)) continue;
      const key = `${guide.sourceItemId}\u0000${guide.sourceGrade}`;
      if (descriptionByItemGrade.has(key)) {
        throw new ConflictException("Legacy performance rubric has duplicate item-grade descriptions");
      }
      descriptionByItemGrade.set(key, guide.sourceDescription);
    }
    const response = {
      sourceAssessmentId: query.source_assessment_id,
      levels: levels.map(({ _batchId: _batch, ...level }) => level),
      items: items.map(({ _batchId: _batch, ...item }) => ({
        ...item,
        descriptions: Object.fromEntries(levels.map(level => [
          level.sourceAssGrade,
          descriptionByItemGrade.get(`${item.sourceItemId}\u0000${level.sourceAssGrade}`) ?? null,
        ])),
      })),
    };
    await this.auditDefinitions(scope, actor, "评分表", "rubric", response.items.length);
    return response;
  }

  async results(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyResultQueryDto,
  ) {
    const resolved = this.resultScope(scope, actor, query);
    if (!resolved) return this.emptyPage(query);
    const { access, parameters, accessJoin, accessWhere } = resolved;

    const visibility = this.visibilitySql(
      "hr_performance_legacy_dimension_result",
    );
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_dimension_result fact
       ${accessJoin}
       ${visibility}${accessWhere}`,
      parameters,
    )) as Array<{ total: number | string }>;
    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const items = (await this.dataSource.query(
      `SELECT fact.id,
        fact.source_detail_id "sourceDetailId",
        fact.source_session_id "sourceSessionId",
        fact.source_person_code "sourcePersonCode",
        fact.source_item_id "sourceItemId",
        fact.source_self_value::text "sourceSelfValue",
        fact.source_m_item_value::text "sourceMItemValue",
        fact.source_item_value::text "sourceItemValue",
        fact.source_x_item_value::text "sourceXItemValue",
        fact.source_c_item_value::text "sourceCItemValue",
        fact.source_self_grade "sourceSelfGrade",
        fact.source_ass_grade "sourceAssGrade",
        fact.source_appraisal "sourceAppraisal",
        fact.legacy_dimension_profile_id "legacyDimensionProfileId",
        fact.target_cycle_employee_id "targetCycleEmployeeId",
        fact.target_template_version_id "targetTemplateVersionId",
        fact.target_dimension_id "targetDimensionId"
       FROM hr_performance_legacy_dimension_result fact
       ${accessJoin}
       ${visibility}${accessWhere}
       ORDER BY fact.source_session_id DESC NULLS LAST,
                fact.source_person_code ASC NULLS LAST,
                fact.source_detail_id ASC,
                fact.id ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as RawRow[];
    const result = this.page(query, items, Number(countRows[0]?.total ?? 0));
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_result",
      action: "读取玉舟历史绩效结果",
      bizType: "hr_performance_legacy_dimension_result",
      bizId: null,
      path: "/hr/performance-legacy/results",
      fieldGroups: ["legacy_projection"],
      projection: access,
      itemCount: items.length,
    });
    return result;
  }

  async masters(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyResultQueryDto,
  ) {
    const resolved = this.resultScope(scope, actor, query);
    if (!resolved) return this.emptyPage(query);
    const { access, parameters, accessJoin, accessWhere } = resolved;
    const visibility = this.visibilitySql("hr_performance_legacy_master_result");
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_master_result fact
       ${accessJoin}
       ${visibility}${accessWhere}`,
      parameters,
    )) as Array<{ total: number | string }>;

    const canReadPay =
      has(actor, HR_PERMISSIONS.HR_PAYROLL_DETAIL_READ) ||
      has(actor, HR_PERMISSIONS.HR_PAYROLL_HISTORY_READ) ||
      (access === "self" && has(actor, HR_PERMISSIONS.HR_PAYROLL_HISTORY_SELF_READ));
    parameters.push(canReadPay);
    const payVisibilityParameter = parameters.length;
    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const items = (await this.dataSource.query(
      `WITH page_fact AS (
         SELECT fact.*
         FROM hr_performance_legacy_master_result fact
         ${accessJoin}
         ${visibility}${accessWhere}
         ORDER BY fact.source_session_id DESC NULLS LAST,
                  fact.source_person_code ASC NULLS LAST,
                  fact.source_master_id ASC,
                  fact.id ASC
         LIMIT $${parameters.length - 1} OFFSET $${parameters.length}
       )
       SELECT fact.id,
        fact.source_master_id "sourceMasterId",
        fact.source_session_id "sourceSessionId",
        fact.source_person_code "sourcePersonCode",
        fact.source_self_grade "sourceSelfGrade",
        fact.source_ass_grade "sourceAssGrade",
        fact.source_self_value::text "sourceSelfValue",
        fact.source_item_value::text "sourceItemValue",
        fact.source_m_item_value::text "sourceMItemValue",
        fact.source_x_item_value::text "sourceXItemValue",
        fact.source_c_item_value::text "sourceCItemValue",
        fact.source_master_value::text "sourceMasterValue",
        fact.source_timekeep_value::text "sourceTimekeepValue",
        fact.source_bonus_value::text "sourceBonusValue",
        fact.source_total_value::text "sourceTotalValue",
        fact.source_self_appraisal "sourceSelfAppraisal",
        fact.source_appraisal "sourceAppraisal",
        CASE WHEN $${payVisibilityParameter}::boolean THEN fact.source_pay::text END "sourcePay",
        fact.source_assessment_person "sourceAssessmentPerson",
        fact.source_recorded_at "sourceRecordedAt",
        fact.source_operator_code "sourceOperatorCode",
        fact.source_description "sourceDescription",
        fact.legacy_template_profile_id "legacyTemplateProfileId",
        fact.target_cycle_employee_id "targetCycleEmployeeId",
        fact.target_template_version_id "targetTemplateVersionId",
        parity.calculated_total::text "calculatedTotal",
        parity.expected_ass_grade "expectedAssGrade",
        parity.winning_min_value "winningMinValue",
        parity.winning_candidate_count::int "winningCandidateCount",
        parity.parity_status "parityStatus"
       FROM page_fact fact
       LEFT JOIN LATERAL hr_performance_yuzhou_legacy_grade_parity(fact.id) parity ON true
       ORDER BY fact.source_session_id DESC NULLS LAST,
                fact.source_person_code ASC NULLS LAST,
                fact.source_master_id ASC,
                fact.id ASC`,
      parameters,
    )) as RawRow[];
    const result = this.page(query, items, Number(countRows[0]?.total ?? 0));
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_master",
      action: "读取玉舟历史绩效汇总",
      bizType: "hr_performance_legacy_master_result",
      bizId: null,
      path: "/hr/performance-legacy/masters",
      fieldGroups: canReadPay
        ? ["legacy_projection", "compensation"]
        : ["legacy_projection"],
      projection: access,
      itemCount: items.length,
    });
    return result;
  }

  async personSummary(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyPersonSummaryRoutineQueryDto,
  ) {
    const resolved = this.resultScope(scope, actor, query);
    if (!resolved) return this.emptyPage(query);
    if (!isHrPerformanceLegacyPersonSummaryRoutine(query.source_routine)) {
      throw new BadRequestException("Unsupported legacy performance person-summary routine");
    }
    const parameters = [...resolved.parameters, query.source_person_code];
    const sourcePersonParameter = parameters.length;
    const accessWhere = `${resolved.accessWhere}
      AND fact.source_person_code=$${sourcePersonParameter}`;
    const visibility = this.visibilitySql("hr_performance_legacy_master_result");
    const employeeProjectionJoin = resolved.access === "park"
      ? `LEFT JOIN hr_performance_cycle_employee summary_cycle_employee
          ON (summary_cycle_employee.id,summary_cycle_employee.tenant_id,summary_cycle_employee.park_id)=
             (fact.target_cycle_employee_id,fact.tenant_id,fact.park_id)
        LEFT JOIN hr_employee summary_employee
          ON (summary_employee.id,summary_employee.tenant_id,summary_employee.park_id)=
             (summary_cycle_employee.employee_id,summary_cycle_employee.tenant_id,summary_cycle_employee.park_id)
         AND summary_employee.is_deleted=false`
      : "";
    const employeeDisplayName = resolved.access === "park"
      ? "summary_employee.full_name"
      : "employee.full_name";
    const mappedEmployeePredicate = query.source_routine === "web_ass"
      ? ` AND ${resolved.access === "park" ? "summary_employee" : "employee"}.id IS NOT NULL`
      : "";
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${employeeProjectionJoin}
       ${visibility}${accessWhere}${mappedEmployeePredicate}`,
      parameters,
    )) as Array<{ total: number | string }>;

    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const items = (await this.dataSource.query(
      `SELECT fact.source_person_code "sourcePersonCode",
        ${employeeDisplayName} "employeeDisplayName",
        fact.source_self_grade "sourceSelfGrade",
        fact.source_ass_grade "sourceAssGrade",
        fact.source_item_value::text "sourceItemValue",
        fact.source_total_value::text "sourceTotalValue"
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${employeeProjectionJoin}
       ${visibility}${accessWhere}${mappedEmployeePredicate}
       ORDER BY fact.source_session_id DESC NULLS LAST,
                fact.source_master_id ASC,
                fact.id ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as RawRow[];
    const result = this.page(query, items, Number(countRows[0]?.total ?? 0));
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_person_summary",
      action: query.source_routine === "web_ass"
        ? "按玉舟 web_ass 语义读取历史个人绩效汇总"
        : "按玉舟 web_assessmentquery 语义读取历史个人绩效汇总",
      bizType: "hr_performance_legacy_master_result",
      bizId: null,
      path: "/hr/performance-legacy/query-reports/person-summary",
      fieldGroups: ["legacy_projection"],
      projection: resolved.access,
      itemCount: items.length,
    });
    return result;
  }

  async assessmentMasterQuery(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyAssessmentMasterQueryDto,
  ) {
    const resolved = this.resultScope(scope, actor, query);
    if (!resolved) return this.emptyPage(query);
    if (
      !isHrPerformanceLegacyDepartmentMatchMode(query.department_match_mode)
      || !isHrPerformanceLegacyDepartmentPattern(query.department_like)
      || !isHrPerformanceLegacyQueryText(
        query.ass_session,
        HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
      )
      || !isHrPerformanceLegacyQueryText(
        query.assessment_type,
        HR_PERFORMANCE_LEGACY_ASSESSMENT_TYPE_MAX_LENGTH,
      )
      || query.ass_session !== normalizeHrPerformanceLegacyQueryText(query.ass_session)
      || query.assessment_type !== normalizeHrPerformanceLegacyQueryText(query.assessment_type)
      || query.department_like !== normalizeHrPerformanceLegacyQueryText(query.department_like)
    ) {
      throw new BadRequestException("Unsupported legacy assessment-master query parameters");
    }

    const parameters = [...resolved.parameters];
    parameters.push(query.ass_session);
    const sessionNameParameter = parameters.length;
    parameters.push(query.assessment_type);
    const assessmentTypeParameter = parameters.length;
    parameters.push(query.department_like);
    const departmentParameter = parameters.length;
    const departmentPredicate = query.department_match_mode === "exact"
      ? `query_org.org_code=$${departmentParameter}`
      : `query_org.org_code LIKE $${departmentParameter} ESCAPE '\\'`;
    const employeeAccessJoin = resolved.access === "park"
      ? `JOIN hr_performance_cycle_employee query_cycle_employee
          ON (query_cycle_employee.id,query_cycle_employee.tenant_id,query_cycle_employee.park_id)=
             (fact.target_cycle_employee_id,fact.tenant_id,fact.park_id)
        JOIN hr_employee query_employee
          ON (query_employee.id,query_employee.tenant_id,query_employee.park_id)=
             (query_cycle_employee.employee_id,query_cycle_employee.tenant_id,query_cycle_employee.park_id)
         AND query_employee.is_deleted=false`
      : "";
    const employeeAlias = resolved.access === "park" ? "query_employee" : "employee";
    const compatibilityJoins = `${employeeAccessJoin}
      JOIN sys_org query_org
        ON (query_org.id,query_org.tenant_id,query_org.park_id)=
           (${employeeAlias}.primary_org_id,${employeeAlias}.tenant_id,${employeeAlias}.park_id)
      JOIN hr_performance_legacy_session query_session
        ON (query_session.tenant_id,query_session.park_id,query_session.migration_batch_id,
            query_session.source_session_id)=
           (fact.tenant_id,fact.park_id,fact.migration_batch_id,fact.source_session_id)
       AND query_session.source_session_name=$${sessionNameParameter}
       AND query_session.source_assessment_type=$${assessmentTypeParameter}
      JOIN legacy_record_map query_session_map
        ON query_session_map.id=query_session.legacy_record_map_id
       AND query_session_map.batch_id=query_session.migration_batch_id
       AND query_session_map.source_system='yuzhou-v10'
       AND query_session_map.target_table='hr_performance_legacy_session'
       AND query_session_map.target_id=query_session.id
       AND query_session_map.mapping_status='verified'
       AND query_session_map.is_active=true`;
    const visibility = this.visibilitySql("hr_performance_legacy_master_result");
    const filter = `${resolved.accessWhere} AND ${departmentPredicate}`;
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${compatibilityJoins}
       ${visibility}${filter}`,
      [...parameters],
    )) as Array<{ total: number | string }>;

    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const items = (await this.dataSource.query(
      `SELECT NULL::text "unresolvedLegacyAssessmentMasterId",
        fact.source_person_code "sourcePersonCode",
        ${employeeAlias}.full_name "employeeDisplayName",
        fact.source_ass_grade "sourceAssGrade",
        fact.source_item_value::text "sourceItemValue",
        fact.source_master_value::text "sourceMasterValue",
        fact.source_timekeep_value::text "sourceTimekeepValue",
        fact.source_bonus_value::text "sourceBonusValue",
        fact.source_appraisal "sourceAppraisal",
        fact.source_assessment_person "sourceAssessmentPerson",
        fact.source_recorded_at "sourceRecordedAt",
        fact.source_operator_code "sourceOperatorCode"
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${compatibilityJoins}
       ${visibility}${filter}
       ORDER BY fact.source_session_id DESC NULLS LAST,
                fact.source_person_code ASC NULLS LAST,
                fact.source_master_id ASC,
                fact.id ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as RawRow[];
    const result = this.page(query, items, Number(countRows[0]?.total ?? 0));
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_assessment_master_query",
      action: "按玉舟 u_assessmentmaster 语义读取历史绩效汇总",
      bizType: "hr_performance_legacy_master_result",
      bizId: null,
      path: "/hr/performance-legacy/query-reports/assessment-master",
      fieldGroups: ["legacy_projection"],
      projection: resolved.access,
      itemCount: items.length,
    });
    return result;
  }

  async assessmentValueQuery(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyAssessmentValueQueryDto,
  ) {
    const resolved = this.resultScope(scope, actor, query);
    if (!resolved) return this.emptyPage(query);
    if (
      !isHrPerformanceLegacyQueryText(
        query.ass_session,
        HR_PERFORMANCE_LEGACY_SESSION_MAX_LENGTH,
      )
      || !isHrPerformanceLegacyDepartmentPrefix(query.department_prefix)
      || query.ass_session !== normalizeHrPerformanceLegacyQueryText(query.ass_session)
      || query.department_prefix !== normalizeHrPerformanceLegacyQueryText(query.department_prefix)
    ) {
      throw new BadRequestException("Unsupported legacy assessment-value query parameters");
    }

    const parameters = [...resolved.parameters];
    parameters.push(query.ass_session);
    const sessionNameParameter = parameters.length;
    const departmentPrefix = query.department_prefix.replace(/([\\%_])/gu, "\\$1");
    parameters.push(`${departmentPrefix}%`);
    const departmentParameter = parameters.length;
    const employeeAccessJoin = resolved.access === "park"
      ? `JOIN hr_performance_cycle_employee value_cycle_employee
          ON (value_cycle_employee.id,value_cycle_employee.tenant_id,value_cycle_employee.park_id)=
             (fact.target_cycle_employee_id,fact.tenant_id,fact.park_id)
        JOIN hr_employee value_employee
          ON (value_employee.id,value_employee.tenant_id,value_employee.park_id)=
             (value_cycle_employee.employee_id,value_cycle_employee.tenant_id,value_cycle_employee.park_id)
         AND value_employee.is_deleted=false`
      : "";
    const employeeAlias = resolved.access === "park" ? "value_employee" : "employee";
    const compatibilityJoins = `${employeeAccessJoin}
      JOIN sys_org value_org
        ON (value_org.id,value_org.tenant_id,value_org.park_id)=
           (${employeeAlias}.primary_org_id,${employeeAlias}.tenant_id,${employeeAlias}.park_id)
      JOIN hr_performance_legacy_session value_session
        ON (value_session.tenant_id,value_session.park_id,value_session.migration_batch_id,
            value_session.source_session_id)=
           (fact.tenant_id,fact.park_id,fact.migration_batch_id,fact.source_session_id)
       AND value_session.source_session_name=$${sessionNameParameter}
      JOIN legacy_record_map value_session_map
        ON value_session_map.id=value_session.legacy_record_map_id
       AND value_session_map.batch_id=value_session.migration_batch_id
       AND value_session_map.source_system='yuzhou-v10'
       AND value_session_map.target_table='hr_performance_legacy_session'
       AND value_session_map.target_id=value_session.id
       AND value_session_map.mapping_status='verified'
       AND value_session_map.is_active=true`;
    const visibility = this.visibilitySql("hr_performance_legacy_master_result");
    const filter = `${resolved.accessWhere}
      AND value_org.org_code LIKE $${departmentParameter} ESCAPE '\\'`;
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${compatibilityJoins}
       ${visibility}${filter}`,
      [...parameters],
    )) as Array<{ total: number | string }>;

    parameters.push(query.page_size, (query.page - 1) * query.page_size);
    const items = (await this.dataSource.query(
      `SELECT fact.source_person_code "sourcePersonCode",
        ${employeeAlias}.full_name "employeeDisplayName",
        NULL::text "unresolvedLegacyGrade",
        fact.source_item_value::text "sourceItemValue",
        fact.source_master_value::text "sourceMasterValue",
        fact.source_timekeep_value::text "sourceTimekeepValue",
        fact.source_bonus_value::text "sourceBonusValue",
        (fact.source_item_value
          + fact.source_timekeep_value
          + fact.source_bonus_value)::text "legacyLastValueWithoutMaster",
        fact.source_appraisal "sourceAppraisal"
       FROM hr_performance_legacy_master_result fact
       ${resolved.accessJoin}
       ${compatibilityJoins}
       ${visibility}${filter}
       ORDER BY fact.source_session_id DESC NULLS LAST,
                fact.source_person_code ASC NULLS LAST,
                fact.source_master_id ASC,
                fact.id ASC
       LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters,
    )) as RawRow[];
    const result = this.page(query, items, Number(countRows[0]?.total ?? 0));
    await recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_assessment_value_query",
      action: "按玉舟 u_assessmentvalue 语义读取历史绩效评分",
      bizType: "hr_performance_legacy_master_result",
      bizId: null,
      path: "/hr/performance-legacy/query-reports/assessment-value",
      fieldGroups: ["legacy_projection"],
      projection: resolved.access,
      itemCount: items.length,
    });
    return result;
  }

  private canReadDefinitions(actor: JwtPrincipal) {
    return (
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_READ) ||
      has(actor, HR_PERMISSIONS.HR_PERFORMANCE_TEMPLATE_MANAGE)
    );
  }

  private resultAccess(actor: JwtPrincipal): ResultAccess {
    if (has(actor, HR_PERMISSIONS.HR_PERFORMANCE_READ)) {
      return "park";
    }
    if (has(actor, HR_PERMISSIONS.HR_PERFORMANCE_TEAM_READ)) {
      return "managed_org_tree";
    }
    if (has(actor, HR_PERMISSIONS.HR_PERFORMANCE_SELF_READ)) return "self";
    return "none";
  }

  private resultScope(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HrPerformanceLegacyResultQueryDto,
  ) {
    const access = this.resultAccess(actor);
    if (access === "none") return null;
    const parameters: unknown[] = [scope.tenantId, scope.parkId];
    let accessJoin = "";
    let accessWhere = "";
    if (access === "self") {
      parameters.push(actor.sub);
      accessJoin = `JOIN hr_performance_cycle_employee cycle_employee
        ON (cycle_employee.id,cycle_employee.tenant_id,cycle_employee.park_id)=
           (fact.target_cycle_employee_id,fact.tenant_id,fact.park_id)
        JOIN hr_employee employee
        ON (employee.id,employee.tenant_id,employee.park_id)=
           (cycle_employee.employee_id,cycle_employee.tenant_id,cycle_employee.park_id)`;
      accessWhere = ` AND employee.user_id::text=$${parameters.length}::text
        AND employee.is_deleted=false`;
    } else if (access === "managed_org_tree") {
      parameters.push(actor.sub);
      accessJoin = `JOIN hr_performance_cycle_employee cycle_employee
        ON (cycle_employee.id,cycle_employee.tenant_id,cycle_employee.park_id)=
           (fact.target_cycle_employee_id,fact.tenant_id,fact.park_id)
        JOIN hr_employee employee
        ON (employee.id,employee.tenant_id,employee.park_id)=
           (cycle_employee.employee_id,cycle_employee.tenant_id,cycle_employee.park_id)`;
      accessWhere = ` AND employee.primary_org_id IN (
        WITH RECURSIVE managed_org AS (
          SELECT id FROM sys_org
          WHERE tenant_id=$1 AND park_id=$2
            AND leader_user_id::text=$${parameters.length}::text
            AND is_deleted=false AND status='enabled'
          UNION ALL
          SELECT child.id FROM sys_org child
          JOIN managed_org parent ON child.parent_id=parent.id
          WHERE child.tenant_id=$1 AND child.park_id=$2
            AND child.is_deleted=false AND child.status='enabled'
        ) SELECT id FROM managed_org
      ) AND employee.is_deleted=false`;
    }
    if (query.source_session_id !== undefined) {
      parameters.push(query.source_session_id);
      accessWhere += ` AND fact.source_session_id=$${parameters.length}`;
    }
    return { access, parameters, accessJoin, accessWhere };
  }

  private visibilitySql(targetTable: string) {
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

  private async definitionPage(
    scope: TenantParkScope,
    query: HrPerformanceLegacyPageQueryDto,
    table: string,
    targetTable: string,
    projection: string,
    orderBy: string,
  ) {
    const visibility = this.visibilitySql(targetTable);
    const countRows = (await this.dataSource.query(
      `SELECT count(*)::int total FROM ${table} fact ${visibility}`,
      [scope.tenantId, scope.parkId],
    )) as Array<{ total: number | string }>;
    const items = (await this.dataSource.query(
      `SELECT ${projection} FROM ${table} fact ${visibility}
       ORDER BY ${orderBy} LIMIT $3 OFFSET $4`,
      [
        scope.tenantId,
        scope.parkId,
        query.page_size,
        (query.page - 1) * query.page_size,
      ],
    )) as RawRow[];
    return this.page(query, items, Number(countRows[0]?.total ?? 0));
  }

  private page(
    query: HrPerformanceLegacyPageQueryDto,
    items: RawRow[],
    total: number,
  ): PaginatedResult<RawRow> & { page_size: number } {
    return { items, total, page: query.page, page_size: query.page_size };
  }

  private emptyPage(query: HrPerformanceLegacyPageQueryDto) {
    return this.page(query, [], 0);
  }

  private auditDefinitions(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    label: string,
    route: string,
    itemCount: number,
  ) {
    return recordHrSensitiveRead(this.auditService, scope, actor, {
      resource: "hr.performance_legacy_definition",
      action: `读取玉舟历史绩效${label}`,
      bizType: "hr_performance_legacy_definition",
      bizId: null,
      path: `/hr/performance-legacy/${route}`,
      fieldGroups: ["legacy_definition_metadata"],
      projection: "metadata",
      itemCount,
    });
  }
}
