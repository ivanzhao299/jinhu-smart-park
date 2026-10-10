import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  HR_PERMISSIONS,
  type PaginatedResult,
  type TenantParkScope,
} from "@jinhu/shared";
import {
  DataSource,
  QueryFailedError,
  type EntityManager,
  type ObjectLiteral,
  type SelectQueryBuilder,
} from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type {
  CreateHrPayrollReconciliationDto,
  HrPayrollInsuranceOptionsQueryDto,
  CreateHrPayrollReconciliationSourceDto,
  HrPayrollReconciliationSourcePreviewDto,
  HrPayrollReconciliationSourcePeriodQueryDto,
  CreateHrPayrollReconciliationPolicyDto,
  HrPayrollCatalogQueryDto,
  HrPayrollFormulaReviewDto,
  HrPayrollHistoryQueryDto,
  HrPayrollReconciliationDetailQueryDto,
  HrPayrollReconciliationReviewActionQueryDto,
  HrPayrollReconciliationQueryDto,
  HrPayrollReconciliationReviewDto,
  HrPayrollReviewActionDto,
  HrPayrollTaxRuleQueryDto,
} from "./dto/hr-payroll-history.dto";
import {
  HrPayrollReviewActionEntity,
  HrPayrollReviewCaseEntity,
} from "./entities/hr.entities";
import {
  resolveHrPayrollHistoryAccessScope,
  type HrPayrollHistoryAccessScope,
} from "./hr-access-policy";
import {
  recordHrSensitiveRead,
  type HrSensitiveReadAuditDetails,
} from "./hr-sensitive-read-audit";
import {
  HR_PAYROLL_DSL_ENGINE_VERSION,
  HR_PAYROLL_DSL_PARSER_VERSION,
  HR_PAYROLL_INSURANCE_DSL_PARSER_VERSION,
  assertAcyclicFormulaDependencies,
  assertFormulaEvaluationOrder,
  evaluatePayrollFormula,
  parsePayrollFormula,
  type PayrollAst,
} from "./hr-payroll-formula-dsl";

import { projectPayrollInsuranceInputs, type PayrollInsuranceAmountFact } from "./hr-payroll-insurance-input";

import { assertPayrollInsuranceChoices, lockModernPayrollInsuranceSources, type ModernPayrollInsuranceSource } from "./hr-payroll-insurance-source";

import { payrollInsuranceEvidence } from "./hr-payroll-insurance-evidence";

type HistoryAccess=HrPayrollHistoryAccessScope;
type RawRow=Record<string,unknown>;
type ReconciliationFormula = {
  id: string;
  book_id: string;
  item_version_id: string;
  raw_expression: string;
  raw_condition: string | null;
  dsl_ast: unknown;
  dependency_codes: unknown;
  parser_version: string;
  calculation_order: number;
  item_code: string;
  item_category: string;
};
const stableJson=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.entries(item as Record<string,unknown>).sort(([a],[b])=>a.localeCompare(b))):item);
const sqlDate=(value:unknown):string=>value instanceof Date?`${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`:String(value).slice(0,10);

@Injectable()
export class HrPayrollHistoryService {
  constructor(private readonly dataSource:DataSource,private readonly auditService:AuditService){}

  async listHistory(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollHistoryQueryDto):Promise<PaginatedResult<RawRow>> {
    const access=this.resolveHistoryAccess(actor);
    if(access==="none")return this.auditedPage(scope,actor,q,[],0,"读取历史工资条","/hr/payroll/history",access);
    const employeeId=access==="self"?await this.selfEmployeeId(scope,actor):null;
    const qb=this.historyBase(scope)
      .select("snapshot.id","id").addSelect("period.period_month","periodMonth")
      .addSelect("book.legacy_scheme","legacyScheme").addSelect("book.book_name","bookName")
      .addSelect("snapshot.gross_amount","grossAmount").addSelect("snapshot.deduction_amount","deductionAmount")
      .addSelect("snapshot.tax_amount","taxAmount").addSelect("snapshot.net_amount","netAmount")
      .addSelect("batch.status","publicationStatus");
    if(access==="self")qb.andWhere("snapshot.employee_id=:employeeId AND batch.status='published'",{employeeId});
    else qb.addSelect("employee.employee_code","employeeCode").addSelect("employee.full_name","employeeName")
      .addSelect("snapshot.legacy_source_table","legacySourceTable")
      .addSelect("snapshot.mapping_status","mappingStatus");
    if(q.employee_id)qb.andWhere("snapshot.employee_id=:filterEmployeeId",{filterEmployeeId:q.employee_id});
    if(q.book_id)qb.andWhere("book.id=:bookId",{bookId:q.book_id});
    if(q.period_from)qb.andWhere("period.period_month>=:periodFrom",{periodFrom:q.period_from});
    if(q.period_to)qb.andWhere("period.period_month<=:periodTo",{periodTo:q.period_to});
    const {items,total}=await this.paginate(qb,q.page,q.page_size,"period.period_month DESC,book.legacy_scheme ASC,employee.employee_code ASC,snapshot.id ASC");
    return this.auditedPage(scope,actor,q,items,total,"读取历史工资条","/hr/payroll/history",access);
  }

  async historyDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string):Promise<RawRow> {
    const access=this.resolveHistoryAccess(actor);
    if(access==="none")throw new NotFoundException("Historical payslip not found");
    const employeeId=access==="self"?await this.selfEmployeeId(scope,actor):null;
    const qb=this.historyBase(scope).andWhere("snapshot.id=:id",{id})
      .select("snapshot.id","id").addSelect("period.period_month","periodMonth")
      .addSelect("book.legacy_scheme","legacyScheme").addSelect("book.book_name","bookName")
      .addSelect("snapshot.gross_amount","grossAmount").addSelect("snapshot.deduction_amount","deductionAmount")
      .addSelect("snapshot.tax_amount","taxAmount").addSelect("snapshot.net_amount","netAmount")
      .addSelect("batch.status","publicationStatus");
    if(access==="self")qb.andWhere("snapshot.employee_id=:employeeId AND batch.status='published'",{employeeId});
    else qb.addSelect("employee.employee_code","employeeCode").addSelect("employee.full_name","employeeName")
      .addSelect("snapshot.legacy_source_table","legacySourceTable")
      .addSelect("snapshot.mapping_status","mappingStatus");
    const row=await qb.getRawOne<RawRow>();
    if(!row)throw new NotFoundException("Historical payslip not found");
    await this.audit(scope,actor,{resource:"hr.payroll_history",action:"读取历史工资条详情",bizType:"hr_payroll_legacy_snapshot",bizId:id,path:"/hr/payroll/history/:id",fieldGroups:["financial","compensation"],projection:access,itemCount:1});
    return row;
  }

  async historyItems(scope:TenantParkScope,actor:JwtPrincipal,id:string):Promise<RawRow[]> {
    await this.historyDetail(scope,actor,id);
    const rows=await this.dataSource.createQueryBuilder().from("hr_payroll_legacy_snapshot_item","entry")
      .leftJoin("hr_payroll_item_version","version","version.id=entry.item_version_id AND version.tenant_id=entry.tenant_id AND version.park_id=entry.park_id")
      .leftJoin("hr_payroll_item_definition","definition","definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id")
      .where("entry.tenant_id=:tenantId AND entry.park_id=:parkId AND entry.snapshot_id=:id AND entry.is_deleted=false",{...scope,id})
      .select("entry.id","id").addSelect("definition.item_code","itemCode").addSelect("version.display_name","displayName")
      .addSelect("entry.value_type","valueType").addSelect("entry.is_source_null","isSourceNull")
      .addSelect("entry.decimal_value","decimalValue").addSelect("entry.text_value","textValue").addSelect("entry.date_value","dateValue")
      .addSelect("entry.sort_no","sortNo").orderBy("entry.sort_no","ASC").addOrderBy("entry.id","ASC").getRawMany<RawRow>();
    const access=this.resolveHistoryAccess(actor);
    await this.audit(scope,actor,{resource:"hr.payroll_history_item",action:"读取历史工资逐项明细",bizType:"hr_payroll_legacy_snapshot",bizId:id,path:"/hr/payroll/history/:id/items",fieldGroups:["financial","compensation"],projection:access==="none"?"metadata":access,itemCount:rows.length});
    return rows;
  }

  async teamSummary(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollHistoryQueryDto):Promise<PaginatedResult<RawRow>> {
    if(!this.has(actor,HR_PERMISSIONS.HR_PAYROLL_HISTORY_TEAM_SUMMARY))throw new ForbiddenException("Payroll team summary permission is required");
    // Team permission is deliberately not an amount permission. Until a separate
    // workflow/anomaly aggregate with a k-anonymity contract exists, even counts
    // grouped by employee, period, or payroll book would reveal salary presence.
    return this.auditedTeamPage(scope,actor,q,[],0);
  }

  async listBooks(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollCatalogQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_book","book")
      .where("book.tenant_id=:tenantId AND book.park_id=:parkId AND book.is_deleted=false",scope)
      .select("book.id","id").addSelect("book.legacy_scheme","legacyScheme").addSelect("book.book_name","bookName").addSelect("book.status","status");
    const result=await this.paginate(qb,q.page,q.page_size,"book.legacy_scheme ASC");
    await this.audit(scope,actor,{resource:"hr.payroll_rule",action:"读取历史工资账套",bizType:"hr_payroll_book",bizId:null,path:"/hr/payroll/history-books",fieldGroups:["compensation"],projection:"admin",itemCount:result.items.length});
    return {...result,page:q.page,page_size:q.page_size};
  }

  async bookDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string) {
    this.requireRuleRead(actor);
    const row=await this.dataSource.createQueryBuilder().from("hr_payroll_book","book")
      .where("book.tenant_id=:tenantId AND book.park_id=:parkId AND book.id=:id AND book.is_deleted=false",{...scope,id})
      .select("book.id","id").addSelect("book.legacy_scheme","legacyScheme").addSelect("book.book_name","bookName").addSelect("book.status","status").getRawOne<RawRow>();
    if(!row)throw new NotFoundException("Payroll book not found");
    await this.audit(scope,actor,{resource:"hr.payroll_rule",action:"读取历史工资账套详情",bizType:"hr_payroll_book",bizId:id,path:"/hr/payroll/history-books/:id",fieldGroups:["compensation"],projection:"admin",itemCount:1});
    return row;
  }

  async listTaxRules(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollTaxRuleQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_tax_rule_version","tax_rule")
      .where("tax_rule.tenant_id=:tenantId AND tax_rule.park_id=:parkId AND tax_rule.is_deleted=false",scope)
      .select("tax_rule.legacy_tax_id","legacyTaxId").addSelect("tax_rule.version_no","versionNo")
      .addSelect("tax_rule.base_amount","baseAmount").addSelect("tax_rule.lower_limit","lowerLimit")
      .addSelect("tax_rule.upper_limit","upperLimit").addSelect("tax_rule.tax_percent","taxPercent")
      .addSelect("tax_rule.offset_amount","offsetAmount");
    const result=await this.paginate(qb,q.page,q.page_size,"tax_rule.legacy_tax_id ASC,tax_rule.version_no ASC");
    const items=result.items.map(row=>({...row,semanticsStatus:"pending_review"}));
    await this.audit(scope,actor,{resource:"hr.payroll_tax_rule",action:"读取历史税率规则",bizType:"hr_payroll_tax_rule_version",bizId:null,path:"/hr/payroll/history-tax-rules",fieldGroups:["compensation"],projection:"admin",itemCount:items.length});
    return {items,total:result.total,page:q.page,page_size:q.page_size};
  }

  async listCatalogItems(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollCatalogQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_item_version","version")
      .innerJoin("hr_payroll_item_definition","definition","definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id")
      .innerJoin("hr_payroll_book","book","book.id=definition.book_id AND book.tenant_id=definition.tenant_id AND book.park_id=definition.park_id")
      .where("version.tenant_id=:tenantId AND version.park_id=:parkId AND version.is_deleted=false AND definition.is_deleted=false AND book.is_deleted=false",scope)
      .select("version.id","id").addSelect("book.id","bookId").addSelect("definition.item_code","itemCode")
      .addSelect("version.display_name","displayName").addSelect("version.value_type","valueType").addSelect("version.item_category","itemCategory")
      .addSelect("version.decimal_scale","decimalScale").addSelect("version.sort_no","sortNo").addSelect("version.taxable","taxable")
      .addSelect("version.print_enabled","printEnabled").addSelect("version.enabled","enabled")
      .addSelect("version.legacy_print_width","legacyPrintWidth").addSelect("version.legacy_decimal_length","legacyDecimalLength")
      .addSelect("version.legacy_item_title","legacyItemTitle").addSelect("version.legacy_long_description","legacyLongDescription")
      .addSelect("version.suppress_decimals","suppressDecimals").addSelect("version.legacy_metadata_review_required","legacyMetadataReviewRequired");
    if(q.book_id)qb.andWhere("book.id=:bookId",{bookId:q.book_id});
    const result=await this.paginate(qb,q.page,q.page_size,"book.legacy_scheme ASC,version.sort_no ASC,version.id ASC");
    await this.audit(scope,actor,{resource:"hr.payroll_rule",action:"读取历史工资项目",bizType:"hr_payroll_item_version",bizId:null,path:"/hr/payroll/history-items",fieldGroups:["compensation"],projection:"admin",itemCount:result.items.length});
    return {...result,page:q.page,page_size:q.page_size};
  }

  async catalogItemDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string) {
    this.requireRuleRead(actor);
    const row=await this.dataSource.createQueryBuilder().from("hr_payroll_item_version","version")
      .innerJoin("hr_payroll_item_definition","definition","definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id")
      .innerJoin("hr_payroll_book","book","book.id=definition.book_id AND book.tenant_id=definition.tenant_id AND book.park_id=definition.park_id")
      .where("version.tenant_id=:tenantId AND version.park_id=:parkId AND version.id=:id AND version.is_deleted=false AND definition.is_deleted=false AND book.is_deleted=false",{...scope,id})
      .select("version.id","id").addSelect("book.id","bookId").addSelect("definition.item_code","itemCode")
      .addSelect("version.display_name","displayName").addSelect("version.value_type","valueType").addSelect("version.item_category","itemCategory")
      .addSelect("version.decimal_scale","decimalScale").addSelect("version.sort_no","sortNo").addSelect("version.taxable","taxable")
      .addSelect("version.print_enabled","printEnabled").addSelect("version.enabled","enabled")
      .addSelect("version.legacy_print_width","legacyPrintWidth").addSelect("version.legacy_decimal_length","legacyDecimalLength")
      .addSelect("version.legacy_item_title","legacyItemTitle").addSelect("version.legacy_long_description","legacyLongDescription")
      .addSelect("version.suppress_decimals","suppressDecimals").addSelect("version.legacy_metadata_review_required","legacyMetadataReviewRequired").getRawOne<RawRow>();
    if(!row)throw new NotFoundException("Payroll item not found");
    await this.audit(scope,actor,{resource:"hr.payroll_rule",action:"读取历史工资项目详情",bizType:"hr_payroll_item_version",bizId:id,path:"/hr/payroll/history-items/:id",fieldGroups:["compensation"],projection:"admin",itemCount:1});
    return row;
  }

  async listFormulas(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollCatalogQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_formula_version","formula")
      .innerJoin("hr_payroll_book","book","book.id=formula.book_id AND book.tenant_id=formula.tenant_id AND book.park_id=formula.park_id")
      .leftJoin("hr_payroll_item_version","item","item.id=formula.item_version_id AND item.tenant_id=formula.tenant_id AND item.park_id=formula.park_id")
      .where("formula.tenant_id=:tenantId AND formula.park_id=:parkId AND formula.is_deleted=false AND book.is_deleted=false",scope)
      .select("formula.id","id").addSelect("book.id","bookId").addSelect("book.legacy_scheme","legacyScheme")
      .addSelect("book.book_name","bookName").addSelect("item.display_name","itemName")
      .addSelect("formula.parse_status","parseStatus").addSelect("formula.dependency_codes","dependencyCodes")
      .addSelect("formula.calculation_order","calculationOrder").addSelect("formula.reviewed_at","reviewedAt").addSelect("formula.review_reason","reviewReason");
    if(q.book_id)qb.andWhere("book.id=:bookId",{bookId:q.book_id});
    if(q.parse_status)qb.andWhere("formula.parse_status=:parseStatus",{parseStatus:q.parse_status});
    const result=await this.paginate(qb,q.page,q.page_size,"book.legacy_scheme ASC,formula.calculation_order ASC,formula.id ASC");
    await this.audit(scope,actor,{resource:"hr.payroll_formula",action:"读取历史工资公式",bizType:"hr_payroll_formula_version",bizId:null,path:"/hr/payroll/history-formulas",fieldGroups:["compensation"],projection:"admin",itemCount:result.items.length});
    return {...result,page:q.page,page_size:q.page_size};
  }

  async formulaDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string):Promise<RawRow & {rawExpression:string;rawCondition:string|null;syntax:Pick<ReturnType<typeof parsePayrollFormula>,"status"|"parserVersion"|"dependencies"|"reason">;approvalEligibility:"terminal"|"blocked"|"syntax_ready"}> {
    this.requireRuleRead(actor);
    const row=await this.dataSource.createQueryBuilder().from("hr_payroll_formula_version","formula")
      .innerJoin("hr_payroll_book","book","book.id=formula.book_id AND book.tenant_id=formula.tenant_id AND book.park_id=formula.park_id")
      .leftJoin("hr_payroll_item_version","item","item.id=formula.item_version_id AND item.tenant_id=formula.tenant_id AND item.park_id=formula.park_id")
      .where("formula.tenant_id=:tenantId AND formula.park_id=:parkId AND formula.id=:id AND formula.is_deleted=false AND book.is_deleted=false",{...scope,id})
      .select("formula.id","id").addSelect("book.id","bookId").addSelect("book.legacy_scheme","legacyScheme")
      .addSelect("book.book_name","bookName").addSelect("item.display_name","itemName")
      .addSelect("formula.version_no","versionNo").addSelect("formula.raw_expression","rawExpression").addSelect("formula.raw_condition","rawCondition").addSelect("formula.parser_version","parserVersion")
      .addSelect("formula.parse_status","parseStatus").addSelect("formula.dependency_codes","dependencyCodes")
      .addSelect("formula.calculation_order","calculationOrder").addSelect("formula.reviewed_at","reviewedAt").addSelect("formula.review_reason","reviewReason").getRawOne<RawRow>();
    if(!row)throw new NotFoundException("Payroll formula not found");
    await this.audit(scope,actor,{resource:"hr.payroll_formula",action:"读取历史工资公式详情",bizType:"hr_payroll_formula_version",bizId:id,path:"/hr/payroll/history-formulas/:id",fieldGroups:["compensation"],projection:"admin",itemCount:1});
    const parsed = parsePayrollFormula(String(row.rawExpression), row.rawCondition == null ? null : String(row.rawCondition));
    const terminal = ["approved_for_simulation", "rejected"].includes(String(row.parseStatus));
    return { ...row, rawExpression: String(row.rawExpression), rawCondition: row.rawCondition == null ? null : String(row.rawCondition), syntax: { status: parsed.status, parserVersion: parsed.parserVersion, dependencies: parsed.dependencies, reason: parsed.reason }, approvalEligibility: terminal ? "terminal" : !parsed.ast || String(row.rawCondition ?? "").trim() ? "blocked" : "syntax_ready" };
  }

  async listReviewCases(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollCatalogQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_review_case","review")
      .leftJoin("hr_payroll_review_action","action","action.review_case_id=review.id AND action.tenant_id=review.tenant_id AND action.park_id=review.park_id AND action.is_deleted=false")
      .where("review.tenant_id=:tenantId AND review.park_id=:parkId AND review.is_deleted=false",scope)
      .select("review.id","id").addSelect("review.case_type","caseType").addSelect("review.evidence_summary","evidenceSummary")
      .addSelect("review.status","sourceStatus").addSelect("review.create_time","createdAt").addSelect("COUNT(action.id)::int","actionCount").addSelect("MAX(action.sequence_no)","latestSequence")
      .groupBy("review.id").addGroupBy("review.case_type").addGroupBy("review.evidence_summary").addGroupBy("review.status").addGroupBy("review.create_time");
    if(q.status)qb.andWhere("review.status=:status",{status:q.status});
    if(q.case_type)qb.andWhere("review.case_type=:caseType",{caseType:q.case_type});
    const result=await this.paginate(qb,q.page,q.page_size,"review.create_time DESC,review.id ASC",true);
    result.items=result.items.map(row=>({...row,evidenceSummary:this.projectReviewEvidence(row.evidenceSummary)}));
    await this.audit(scope,actor,{resource:"hr.payroll_review_case",action:"读取历史工资复核队列",bizType:"hr_payroll_review_case",bizId:null,path:"/hr/payroll/history-review-cases",fieldGroups:["financial","compensation"],projection:"admin",itemCount:result.items.length});
    return {...result,page:q.page,page_size:q.page_size};
  }

  async reviewCaseDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string) {
    this.requireRuleRead(actor);
    const review=await this.dataSource.createQueryBuilder().from("hr_payroll_review_case","review")
      .where("review.tenant_id=:tenantId AND review.park_id=:parkId AND review.id=:id AND review.is_deleted=false",{...scope,id})
      .select("review.id","id").addSelect("review.case_type","caseType").addSelect("review.evidence_summary","evidenceSummary")
      .addSelect("review.status","sourceStatus").addSelect("review.create_time","createdAt").getRawOne<RawRow>();
    if(!review)throw new NotFoundException("Payroll review case not found");
    const actions=await this.dataSource.createQueryBuilder().from("hr_payroll_review_action","action")
      .where("action.tenant_id=:tenantId AND action.park_id=:parkId AND action.review_case_id=:id AND action.is_deleted=false",{...scope,id})
      .select("action.id","id").addSelect("action.sequence_no","sequenceNo").addSelect("action.action","action")
      .addSelect("action.decision","decision").addSelect("action.comment","comment").addSelect("action.create_time","createdAt")
      .orderBy("action.sequence_no","ASC").getRawMany<RawRow>();
    await this.audit(scope,actor,{resource:"hr.payroll_review_case",action:"读取历史工资复核详情",bizType:"hr_payroll_review_case",bizId:id,path:"/hr/payroll/history-review-cases/:id",fieldGroups:["financial","compensation"],projection:"admin",itemCount:1});
    return {...review,evidenceSummary:this.projectReviewEvidence(review.evidenceSummary),actions};
  }

  async addReviewAction(scope:TenantParkScope,actor:JwtPrincipal,id:string,dto:HrPayrollReviewActionDto) {
    if(!this.has(actor,HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW))throw new ForbiddenException("Payroll review permission is required");
    return this.dataSource.transaction(async manager=>{
      const caseRepo=manager.getRepository(HrPayrollReviewCaseEntity),actionRepo=manager.getRepository(HrPayrollReviewActionEntity);
      const review=await caseRepo.findOne({where:{id,...scope,isDeleted:false},lock:{mode:"pessimistic_write"}});
      if(!review)throw new NotFoundException("Payroll review case not found");
      const latest=await actionRepo.findOne({where:{reviewCaseId:id,...scope,isDeleted:false},order:{sequenceNo:"DESC"}});
      if(latest&&["resolve","reject"].includes(latest.action))throw new ConflictException("Payroll review case already has a terminal action");
      if(dto.action==="comment"&&dto.decision!=="needs_follow_up")throw new ConflictException("Comment actions must keep the case in follow-up");
      if(dto.action==="reject"&&dto.decision!=="unsafe_rejected")throw new ConflictException("Rejected cases require the unsafe-rejected decision");
      if(dto.action==="resolve"&&!["accepted_exception","mapping_confirmed"].includes(dto.decision))throw new ConflictException("Resolved cases require an accepted decision");
      const saved=await actionRepo.save(actionRepo.create({...scope,reviewCaseId:id,sequenceNo:(latest?.sequenceNo??0)+1,action:dto.action,decision:dto.decision,comment:dto.comment,actorId:actor.sub,createBy:actor.sub,updateBy:actor.sub}));
      return {id:saved.id,reviewCaseId:saved.reviewCaseId,sequenceNo:saved.sequenceNo,action:saved.action,decision:saved.decision,comment:saved.comment,createdAt:saved.createTime};
    });
  }

  async reviewFormula(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: HrPayrollFormulaReviewDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_FORMULA_REVIEW))
      throw new ForbiddenException(
        "Payroll formula review permission is required",
      );
    return this.dataSource.transaction(async (manager) => {
      const formula = (
        (await manager.query(
          "SELECT book_id,item_version_id,legacy_formula_id,version_no,raw_expression,raw_condition,expression_hash,parse_status,calculation_order FROM hr_payroll_formula_version WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE",
          [id, scope.tenantId, scope.parkId],
        )) as Array<Record<string, unknown>>
      )[0];
      if (!formula) throw new NotFoundException("Payroll formula not found");
      if (
        ["approved_for_simulation", "rejected"].includes(
          String(formula.parse_status),
        )
      )
        throw new ConflictException(
          "Payroll formula version already has a terminal review",
        );
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `hr-payroll-formula:${scope.tenantId}:${scope.parkId}:${formula.legacy_formula_id}`,
        ],
      );
      const reviewed = (
        (await manager.query(
          "SELECT id FROM hr_payroll_formula_version WHERE tenant_id=$1 AND park_id=$2 AND legacy_formula_id=$3 AND parse_status IN('approved_for_simulation','rejected') AND is_deleted=false LIMIT 1 FOR SHARE",
          [scope.tenantId, scope.parkId, formula.legacy_formula_id],
        )) as RawRow[]
      )[0];
      if (reviewed)
        throw new ConflictException(
          "Payroll formula already has an appended terminal review version",
        );
      const parsed = parsePayrollFormula(
        String(formula.raw_expression),
        formula.raw_condition == null ? null : String(formula.raw_condition),
      );
      if (dto.decision === "approve_for_simulation" && !parsed.ast)
        throw new ConflictException(
          "Unsafe formula cannot be approved for simulation",
        );
      if (
        dto.decision === "approve_for_simulation" &&
        String(formula.raw_condition ?? "").trim()
      )
        throw new ConflictException(
          "Legacy conditional formula must be converted to an explicit restricted DSL condition before approval",
        );
      if (dto.decision === "approve_for_simulation") {
        const existing = (
          (await manager.query(
            "SELECT id FROM hr_payroll_formula_version WHERE tenant_id=$1 AND park_id=$2 AND book_id=$3 AND item_version_id=$4 AND parse_status='approved_for_simulation' AND is_deleted=false LIMIT 1 FOR SHARE",
            [
              scope.tenantId,
              scope.parkId,
              formula.book_id,
              formula.item_version_id,
            ],
          )) as RawRow[]
        )[0];
        if (existing)
          throw new ConflictException(
            "An approved simulation formula already exists for this item",
          );
        const approved = (await manager.query(
          "SELECT d.item_code,f.dependency_codes FROM hr_payroll_formula_version f JOIN hr_payroll_item_version v ON v.id=f.item_version_id AND v.tenant_id=f.tenant_id AND v.park_id=f.park_id JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id WHERE f.tenant_id=$1 AND f.park_id=$2 AND f.book_id=$3 AND f.parse_status='approved_for_simulation' AND f.is_deleted=false",
          [scope.tenantId, scope.parkId, formula.book_id],
        )) as Array<{ item_code: string; dependency_codes: string[] }>;
        const currentItem = (
          (await manager.query(
            "SELECT d.item_code FROM hr_payroll_item_version v JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id WHERE v.id=$1 AND v.tenant_id=$2 AND v.park_id=$3",
            [formula.item_version_id, scope.tenantId, scope.parkId],
          )) as Array<{ item_code: string }>
        )[0];
        if (!currentItem)
          throw new ConflictException("Formula item is unavailable");
        assertAcyclicFormulaDependencies([
          ...approved.map((row) => ({
            itemCode: row.item_code,
            dependencies: row.dependency_codes,
          })),
          {
            itemCode: currentItem.item_code,
            dependencies: parsed.dependencies,
          },
        ]);
      }
      const status =
          dto.decision === "approve_for_simulation"
            ? "approved_for_simulation"
            : "rejected",
        versionRow = (
          (await manager.query(
            "SELECT COALESCE(MAX(version_no),0)+1 AS next_version FROM hr_payroll_formula_version WHERE tenant_id=$1 AND park_id=$2 AND legacy_formula_id=$3",
            [scope.tenantId, scope.parkId, formula.legacy_formula_id],
          )) as RawRow[]
        )[0],
        nextVersion = Number(versionRow?.next_version ?? 1),
        saved = (
          (await manager.query(
            `INSERT INTO hr_payroll_formula_version(tenant_id,park_id,book_id,item_version_id,legacy_formula_id,version_no,raw_expression,raw_condition,expression_hash,parser_version,parse_status,dsl_ast,dependency_codes,calculation_order,reviewed_by,reviewed_at,review_reason,create_by,update_by,remark) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now(),$16,$15,$15,$17) RETURNING id,parse_status AS "parseStatus",parser_version AS "parserVersion",dependency_codes AS "dependencyCodes",reviewed_at AS "reviewedAt"`,
            [
              scope.tenantId,
              scope.parkId,
              formula.book_id,
              formula.item_version_id,
              formula.legacy_formula_id,
              nextVersion,
              formula.raw_expression,
              formula.raw_condition,
              formula.expression_hash,
              parsed.parserVersion,
              status,
              status === "approved_for_simulation"
                ? JSON.stringify(parsed.ast)
                : null,
              JSON.stringify(parsed.dependencies),
              formula.calculation_order,
              actor.sub,
              dto.reason,
              `review version of ${id}`,
            ],
          )) as RawRow[]
        )[0]!;
      return saved;
    });
  }

  async listReconciliations(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    q: HrPayrollReconciliationQueryDto,
  ) {
    this.requireReconciliationRead(actor);
    const qb = this.dataSource
      .createQueryBuilder()
      .from("hr_payroll_reconciliation_run", "run")
      .innerJoin(
        "hr_payroll_legacy_batch",
        "batch",
        "batch.id=run.legacy_batch_id AND batch.tenant_id=run.tenant_id AND batch.park_id=run.park_id",
      )
      .innerJoin(
        "hr_attendance_payroll_input_batch",
        "attendance",
        "attendance.id=run.attendance_input_batch_id AND attendance.tenant_id=run.tenant_id AND attendance.park_id=run.park_id",
      )
      .where(
        "run.tenant_id=:tenantId AND run.park_id=:parkId AND run.is_deleted=false",
        scope,
      )
      .select("run.id", "id")
      .addSelect("run.status", "status")
      .addSelect("run.tolerance_amount", "toleranceAmount")
      .addSelect("run.employee_count", "employeeCount")
      .addSelect("run.difference_count", "differenceCount")
      .addSelect("run.engine_version", "engineVersion")
      .addSelect("run.create_time", "createdAt")
      .addSelect("batch.batch_code", "legacyBatchCode")
      .addSelect("attendance.batch_no", "attendanceBatchNo");
    if (q.status) qb.andWhere("run.status=:status", { status: q.status });
    const result = await this.paginate(
      qb,
      q.page,
      q.page_size,
      "run.create_time DESC,run.id DESC",
    );
    await this.audit(scope, actor, {
      resource: "hr.payroll_reconciliation",
      action: "读取工资双轨差异",
      bizType: "hr_payroll_reconciliation_run",
      bizId: null,
      path: "/hr/payroll/reconciliations",
      fieldGroups: ["financial", "compensation"],
      projection: "admin",
      itemCount: result.items.length,
    });
    return { ...result, page: q.page, page_size: q.page_size };
  }

  async reconciliationSetup(scope: TenantParkScope, actor: JwtPrincipal) {
    this.requireReconciliationRead(actor);
    const books = (await this.dataSource.query(
      `SELECT b.id,b.book_name AS "bookName",b.legacy_scheme AS "legacyScheme",p.id AS "policyVersionId",p.net_item_version_id AS "netItemVersionId",item.display_name AS "netItemName",p.tolerance_amount AS "toleranceAmount",p.version_no AS "policyVersion" FROM hr_payroll_book b LEFT JOIN hr_payroll_reconciliation_policy_current cur ON cur.tenant_id=b.tenant_id AND cur.park_id=b.park_id AND cur.book_id=b.id LEFT JOIN hr_payroll_reconciliation_policy_version p ON p.id=cur.policy_version_id AND p.tenant_id=cur.tenant_id AND p.park_id=cur.park_id AND p.book_id=cur.book_id LEFT JOIN hr_payroll_item_version item ON item.id=p.net_item_version_id AND item.tenant_id=p.tenant_id AND item.park_id=p.park_id WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.is_deleted=false ORDER BY b.legacy_scheme,b.id LIMIT 100`,
      [scope.tenantId, scope.parkId],
    )) as RawRow[];
    const netItems = (await this.dataSource.query(
      `SELECT DISTINCT definition.book_id AS "bookId",version.id,version.display_name AS "displayName",definition.item_code AS "itemCode",version.version_no AS "versionNo" FROM hr_payroll_formula_version formula JOIN hr_payroll_item_version version ON version.id=formula.item_version_id AND version.tenant_id=formula.tenant_id AND version.park_id=formula.park_id JOIN hr_payroll_item_definition definition ON definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id WHERE formula.tenant_id=$1 AND formula.park_id=$2 AND formula.parse_status='approved_for_simulation' AND formula.is_deleted=false AND version.enabled=true AND version.value_type='decimal' AND version.is_deleted=false AND definition.is_deleted=false ORDER BY definition.book_id,version.display_name,version.id LIMIT 500`,
      [scope.tenantId, scope.parkId],
    )) as RawRow[];
    const legacyBatches = (await this.dataSource.query(
      `SELECT id,batch_code AS "batchCode",source_row_count AS "sourceRowCount",published_at AS "publishedAt" FROM hr_payroll_legacy_batch WHERE tenant_id=$1 AND park_id=$2 AND status='published' AND is_deleted=false ORDER BY published_at DESC,id DESC LIMIT 100`,
      [scope.tenantId, scope.parkId],
    )) as RawRow[];
    const attendanceBatches = (await this.dataSource.query(
      `SELECT batch.id,batch.batch_no AS "batchNo",period.period_month AS "periodMonth",batch.batch_type AS "batchType" FROM hr_attendance_payroll_input_batch batch JOIN hr_attendance_period period ON period.id=batch.period_id AND period.tenant_id=batch.tenant_id AND period.park_id=batch.park_id WHERE batch.tenant_id=$1 AND batch.park_id=$2 AND batch.status='effective' AND batch.is_deleted=false AND period.status='closed' AND period.is_deleted=false ORDER BY period.period_month DESC,batch.batch_no DESC LIMIT 100`,
      [scope.tenantId, scope.parkId],
    )) as RawRow[];
    const sourceBatches = this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW) ? (await this.dataSource.query(
      `SELECT b.id,b.create_time AS "createdAt",b.loaded_row_count AS "recordCount"
       FROM hr_payroll_legacy_batch b JOIN hr_yuzhou_t4_followon_operation receipt
         ON receipt.operation_id=b.batch_code AND receipt.status='succeeded'
       JOIN migration_batch control ON control.run_id=receipt.operation_id
         AND control.t4_followon_operation_id=receipt.operation_id AND control.status='succeeded'
         AND control.target_database=current_database()
       WHERE b.tenant_id=$1 AND b.park_id=$2 AND b.status='staged' AND b.is_deleted=false
         AND receipt.binding->'targetScope'->>'tenantId'=b.tenant_id
         AND receipt.binding->'targetScope'->>'parkId'=b.park_id
       ORDER BY b.create_time DESC,b.id DESC LIMIT 100`, [scope.tenantId,scope.parkId],
    )) as RawRow[] : [];
    const frozenSources = (await this.dataSource.query(
      `SELECT source.id,source.legacy_batch_id AS "legacyBatchId",source.book_id AS "bookId",
         book.book_name AS "bookName",source.period_month AS "periodMonth",
         source.snapshot_count AS "snapshotCount",source.item_count AS "itemCount"
       FROM hr_payroll_reconciliation_source source
       JOIN hr_payroll_book book ON book.id=source.book_id AND book.tenant_id=source.tenant_id AND book.park_id=source.park_id
       JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=source.operation_id
         AND receipt.status='succeeded' AND receipt.binding_sha256=source.binding_sha256
       JOIN migration_batch control ON control.run_id=source.operation_id AND control.status='succeeded'
         AND control.t4_followon_operation_id=source.operation_id AND control.target_database=current_database()
       WHERE source.tenant_id=$1 AND source.park_id=$2 ORDER BY source.created_at DESC,source.id DESC LIMIT 100`,
      [scope.tenantId,scope.parkId],
    )) as RawRow[];
    await this.audit(scope, actor, {
      resource: "hr.payroll_reconciliation_setup",
      action: "读取工资双轨候选",
      bizType: "hr_payroll_reconciliation_policy_version",
      bizId: null,
      path: "/hr/payroll/reconciliations/setup",
      fieldGroups: ["financial", "compensation"],
      projection: "admin",
      itemCount:
        books.length +
        netItems.length +
        legacyBatches.length +
        attendanceBatches.length + sourceBatches.length + frozenSources.length,
    });
    return { books, netItems, legacyBatches, attendanceBatches, sourceBatches, frozenSources };
  }

  private async sourceTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    try {
      return await this.dataSource.transaction("READ COMMITTED", async (manager) => {
        await manager.query("SET LOCAL statement_timeout='15s'");
        await manager.query("SET LOCAL lock_timeout='2s'");
        return work(manager);
      });
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code && ["P0001", "55P03", "57014", "40P01", "40001"].includes(code))
          throw new ConflictException("历史来源发生变化或暂时忙碌，请重新核对月份并预览后再试");
      }
      throw error;
    }
  }

  async previewReconciliationSource(scope: TenantParkScope, actor: JwtPrincipal, dto: HrPayrollReconciliationSourcePreviewDto) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW))
      throw new ForbiddenException("Payroll reconciliation review permission is required");
    return this.sourceTransaction(async (manager) => {
      const rows = (await manager.query(
        `WITH candidate AS MATERIALIZED (
          SELECT hr_build_payroll_reconciliation_source($1,$2,$3,$4,$5::date) AS payload
        ) SELECT payload->>'legacyBatchId' AS "legacyBatchId",payload->>'bookId' AS "bookId",
          payload->>'periodMonth' AS "periodMonth",payload->>'bindingSha256' AS "bindingSha256",
          encode(digest(payload::text,'sha256'),'hex') AS "sourceSha256",
          jsonb_array_length(payload->'snapshots') AS "snapshotCount",
          jsonb_array_length(payload->'items') AS "itemCount",
          (SELECT count(DISTINCT x->>'employee_id')::int FROM jsonb_array_elements(payload->'snapshots') x) AS "employeeCount"
          FROM candidate`,
        [scope.tenantId, scope.parkId, dto.legacyBatchId, dto.bookId, dto.periodMonth],
      )) as Array<{legacyBatchId:string;bookId:string;periodMonth:string;bindingSha256:string;sourceSha256:string;snapshotCount:number;itemCount:number;employeeCount:number}>;
      const preview = rows[0]!;
      await this.auditService.recordOperationRequired({
        tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub, username: actor.username,
        roleCodes: actor.roles, module: "人力资源管理", resource: "hr.payroll_reconciliation_source",
        action: "预览工资双轨历史来源", bizType: "hr_payroll_legacy_batch", bizId: dto.legacyBatchId,
        beforeJson: null, afterJson: { snapshotCount: preview.snapshotCount, itemCount: preview.itemCount },
        method: "GET", path: "/hr/payroll/reconciliation-sources/preview", success: true,
        result: "success", requestId: null,
      }, manager);
      return preview;
    });
  }

  async reconciliationSourcePeriods(scope: TenantParkScope,actor: JwtPrincipal,q: HrPayrollReconciliationSourcePeriodQueryDto) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW)) throw new ForbiddenException("Payroll reconciliation review permission is required");
    const page=q.page??1,pageSize=q.pageSize??50,offset=(page-1)*pageSize;
    return this.sourceTransaction(async manager=>{
      const rows=await manager.query(`WITH eligible AS (
        SELECT legacy.id FROM hr_payroll_legacy_batch legacy
        JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=legacy.batch_code AND receipt.status='succeeded'
          AND receipt.binding->'targetScope'->>'tenantId'=legacy.tenant_id AND receipt.binding->'targetScope'->>'parkId'=legacy.park_id
          AND receipt.binding->'triple'->>'sourceSnapshotHash'=legacy.source_backup_hash::text
        WHERE legacy.id=$3 AND legacy.tenant_id=$1 AND legacy.park_id=$2 AND NOT legacy.is_deleted AND legacy.status='staged' AND legacy.published_at IS NULL
          AND EXISTS(SELECT 1 FROM migration_batch control WHERE control.run_id=receipt.operation_id AND control.t4_followon_operation_id=receipt.operation_id AND control.target_database=current_database() AND control.status='succeeded')
      ), scoped_snapshots AS (
        SELECT snapshot.id,snapshot.tenant_id,snapshot.park_id,snapshot.book_period_id,snapshot.mapping_status,snapshot.employee_id,period.period_month
        FROM hr_payroll_legacy_snapshot snapshot
        JOIN hr_payroll_book_period period ON period.id=snapshot.book_period_id AND period.tenant_id=snapshot.tenant_id AND period.park_id=snapshot.park_id AND NOT period.is_deleted
        JOIN hr_payroll_book book ON book.id=period.book_id AND book.tenant_id=period.tenant_id AND book.park_id=period.park_id AND NOT book.is_deleted
        WHERE snapshot.batch_id IN(SELECT id FROM eligible) AND snapshot.tenant_id=$1 AND snapshot.park_id=$2 AND NOT snapshot.is_deleted AND period.book_id=$4
      ), item_counts AS (
        SELECT item.snapshot_id,item.tenant_id,item.park_id,count(*)::int item_count
        FROM hr_payroll_legacy_snapshot_item item
        JOIN scoped_snapshots snapshot ON snapshot.id=item.snapshot_id AND snapshot.tenant_id=item.tenant_id AND snapshot.park_id=item.park_id
        WHERE NOT item.is_deleted
        GROUP BY item.snapshot_id,item.tenant_id,item.park_id
      ), grouped AS (
        SELECT snapshot.period_month::text period_month,count(snapshot.id)::int record_count,
          count(snapshot.id) FILTER(WHERE snapshot.mapping_status='mapped' AND snapshot.employee_id IS NOT NULL)::int mapped_record_count,
          count(snapshot.id) FILTER(WHERE snapshot.mapping_status IS DISTINCT FROM 'mapped' OR snapshot.employee_id IS NULL)::int unmapped_record_count,
          count(DISTINCT snapshot.employee_id) FILTER(WHERE snapshot.mapping_status='mapped' AND snapshot.employee_id IS NOT NULL)::int mapped_employee_count,
          coalesce(sum(item_counts.item_count) FILTER(WHERE snapshot.mapping_status='mapped' AND snapshot.employee_id IS NOT NULL),0)::int mapped_item_count
        FROM scoped_snapshots snapshot
        LEFT JOIN item_counts ON item_counts.snapshot_id=snapshot.id AND item_counts.tenant_id=snapshot.tenant_id AND item_counts.park_id=snapshot.park_id
        GROUP BY snapshot.period_month
      ), totals AS (SELECT count(*)::int total FROM grouped), paged AS (SELECT * FROM grouped ORDER BY period_month DESC LIMIT $5 OFFSET $6)
      SELECT paged.period_month "periodMonth",paged.record_count "recordCount",paged.mapped_record_count "mappedRecordCount",paged.unmapped_record_count "unmappedRecordCount",paged.mapped_employee_count "mappedEmployeeCount",paged.mapped_item_count "mappedItemCount",totals.total FROM totals LEFT JOIN paged ON true ORDER BY paged.period_month DESC NULLS LAST`,[scope.tenantId,scope.parkId,q.legacyBatchId,q.bookId,pageSize,offset]) as Array<Record<string,unknown>>;
      const total=Number(rows[0]?.total??0),items=rows.filter(row=>row.periodMonth!==null&&row.periodMonth!==undefined).map(row=>({periodMonth:String(row.periodMonth),recordCount:Number(row.recordCount),mappedRecordCount:Number(row.mappedRecordCount),unmappedRecordCount:Number(row.unmappedRecordCount),mappedEmployeeCount:Number(row.mappedEmployeeCount),mappedItemCount:Number(row.mappedItemCount)}));
      await this.auditService.recordOperationRequired({tenantId:scope.tenantId,parkId:scope.parkId,userId:actor.sub,username:actor.username,roleCodes:actor.roles,module:"人力资源管理",resource:"hr.payroll_reconciliation_source",action:"读取可用工资来源月份",bizType:"hr_payroll_legacy_batch",bizId:q.legacyBatchId,beforeJson:null,afterJson:{bookId:q.bookId,page,pageSize,total},method:"GET",path:"/hr/payroll/reconciliation-sources/periods",success:true,result:"success",requestId:null},manager);
      return {items,total,page,pageSize};
    });
  }

  async createReconciliationSource(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHrPayrollReconciliationSourceDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW))
      throw new ForbiddenException("Payroll reconciliation review permission is required");
      return this.sourceTransaction(async (manager) => {
        const rows = (await manager.query(
          "SELECT hr_freeze_payroll_reconciliation_source($1,$2,$3,$4,$5::date,$6,$7,$8,$9,$10,$11) AS id",
          [scope.tenantId, scope.parkId, dto.legacyBatchId, dto.bookId, dto.periodMonth,
            dto.bindingSha256, dto.sourceSha256, dto.snapshotCount, dto.itemCount, actor.sub, dto.reason],
        )) as Array<{ id: string }>;
        await this.auditService.recordOperationRequired({
          tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub,
          username: actor.username, roleCodes: actor.roles, module: "人力资源管理",
          resource: "hr.payroll_reconciliation_source", action: "冻结工资双轨历史来源",
          bizType: "hr_payroll_reconciliation_source", bizId: rows[0]!.id,
          beforeJson: null, afterJson: { sourceSha256: dto.sourceSha256,
            snapshotCount: dto.snapshotCount, itemCount: dto.itemCount },
          method: "POST", path: "/hr/payroll/reconciliation-sources",
          success: true, result: "success", requestId: null,
        }, manager);
        return { id: rows[0]!.id, legacyBatchId: dto.legacyBatchId,
          bookId: dto.bookId, periodMonth: dto.periodMonth, sourceSha256: dto.sourceSha256,
          snapshotCount: dto.snapshotCount, itemCount: dto.itemCount };
      });
  }

  async createReconciliationPolicy(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHrPayrollReconciliationPolicyDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW))
      throw new ForbiddenException(
        "Payroll reconciliation review permission is required",
      );
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `hr-payroll-reconciliation-policy:${scope.tenantId}:${scope.parkId}:${dto.bookId}`,
        ],
      );
      const book = (
        (await manager.query(
          "SELECT id FROM hr_payroll_book WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE",
          [dto.bookId, scope.tenantId, scope.parkId],
        )) as RawRow[]
      )[0];
      if (!book) throw new NotFoundException("Payroll book not found");
      const item = (
        (await manager.query(
          `SELECT version.id,version.display_name FROM hr_payroll_item_version version JOIN hr_payroll_item_definition definition ON definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id JOIN hr_payroll_formula_version formula ON formula.item_version_id=version.id AND formula.tenant_id=version.tenant_id AND formula.park_id=version.park_id AND formula.book_id=definition.book_id WHERE version.id=$1 AND version.tenant_id=$2 AND version.park_id=$3 AND definition.book_id=$4 AND version.enabled=true AND version.value_type='decimal' AND version.is_deleted=false AND definition.is_deleted=false AND formula.parse_status='approved_for_simulation' AND formula.is_deleted=false LIMIT 1 FOR SHARE OF version,definition,formula`,
          [dto.netItemVersionId, scope.tenantId, scope.parkId, dto.bookId],
        )) as RawRow[]
      )[0];
      if (!item)
        throw new ConflictException(
          "Net payroll item must be an approved current decimal formula item in this book",
        );
      const next = (
        (await manager.query(
          "SELECT COALESCE(MAX(version_no),0)+1 AS version_no FROM hr_payroll_reconciliation_policy_version WHERE tenant_id=$1 AND park_id=$2 AND book_id=$3",
          [scope.tenantId, scope.parkId, dto.bookId],
        )) as RawRow[]
      )[0];
      const policy = (
        (await manager.query(
          `INSERT INTO hr_payroll_reconciliation_policy_version(tenant_id,park_id,book_id,net_item_version_id,version_no,tolerance_amount,status,reviewed_by,review_reason,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,'approved',$7,$8,$7,$7) RETURNING id,book_id AS "bookId",net_item_version_id AS "netItemVersionId",version_no AS "versionNo",tolerance_amount AS "toleranceAmount",status,reviewed_at AS "reviewedAt"`,
          [
            scope.tenantId,
            scope.parkId,
            dto.bookId,
            dto.netItemVersionId,
            Number(next?.version_no ?? 1),
            dto.toleranceAmount,
            actor.sub,
            dto.reason,
          ],
        )) as RawRow[]
      )[0]!;
      await manager.query(
        `INSERT INTO hr_payroll_reconciliation_policy_current(tenant_id,park_id,book_id,policy_version_id,update_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,park_id,book_id) DO UPDATE SET policy_version_id=EXCLUDED.policy_version_id,update_by=EXCLUDED.update_by,update_time=now()`,
        [scope.tenantId, scope.parkId, dto.bookId, policy.id, actor.sub],
      );
      await this.audit(scope, actor, {
        resource: "hr.payroll_reconciliation_policy",
        action: "审核工资双轨净额映射",
        bizType: "hr_payroll_reconciliation_policy_version",
        bizId: String(policy.id),
        path: "/hr/payroll/reconciliation-policies",
        fieldGroups: ["financial", "compensation"],
        projection: "admin",
        itemCount: 1,
      });
      return { ...policy, netItemName: item.display_name };
    });
  }

  async reconciliationDetail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    q: HrPayrollReconciliationDetailQueryDto,
  ) {
    const offset = (q.result_page - 1) * q.result_page_size;
    this.requireReconciliationRead(actor);
    const rows = (await this.dataSource.query(
      `SELECT r.id,r.status,r.tolerance_amount AS "toleranceAmount",r.employee_count AS "employeeCount",r.difference_count AS "differenceCount",r.engine_version AS "engineVersion",r.create_time AS "createdAt",e.id AS "resultId",employee.employee_code AS "employeeCode",employee.full_name AS "employeeName",e.old_total AS "oldTotal",e.new_total AS "newTotal",e.delta_total AS "deltaTotal",e.review_status AS "reviewStatus",e.insurance_period_id AS "insuranceHistoricalId",e.insurance_modern_revision_id AS "insuranceModernId",(r.frozen_insurance_version->e.employee_id::text)->>'id' AS "insuranceFrozenId",(r.frozen_insurance_version->e.employee_id::text)->>'version' AS "insuranceFrozenVersion",(r.frozen_insurance_version->e.employee_id::text)->>'snapshotVersion' AS "insuranceFrozenFormat",(r.frozen_insurance_version->e.employee_id::text)->>'snapshotHash' AS "insuranceFrozenHash"
      FROM hr_payroll_reconciliation_run r LEFT JOIN LATERAL (SELECT result.* FROM hr_payroll_reconciliation_result result JOIN hr_employee scoped_employee ON scoped_employee.id=result.employee_id AND scoped_employee.tenant_id=result.tenant_id AND scoped_employee.park_id=result.park_id WHERE result.run_id=r.id AND result.tenant_id=r.tenant_id AND result.park_id=r.park_id AND result.is_deleted=false ORDER BY scoped_employee.employee_code,result.id LIMIT $4 OFFSET $5) e ON true LEFT JOIN hr_employee employee ON employee.id=e.employee_id AND employee.tenant_id=e.tenant_id AND employee.park_id=e.park_id
      WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.id=$3 AND r.is_deleted=false ORDER BY employee.employee_code,e.id`,
      [scope.tenantId, scope.parkId, id, q.result_page_size, offset],
    )) as RawRow[];
    if (!rows.length)
      throw new NotFoundException("Payroll reconciliation run not found");
    const resultIds = rows.flatMap((row) =>
        row.resultId ? [String(row.resultId)] : [],
      ),
      differences = resultIds.length
        ? ((await this.dataSource.query(
            `SELECT d.id,d.result_id AS "resultId",v.display_name AS "itemName",d.old_amount AS "oldAmount",d.new_amount AS "newAmount",d.delta_amount AS "deltaAmount",d.tolerance_amount AS "toleranceAmount",d.review_status AS "reviewStatus" FROM hr_payroll_reconciliation_item_difference d JOIN hr_payroll_item_version v ON v.id=d.item_version_id AND v.tenant_id=d.tenant_id AND v.park_id=d.park_id WHERE d.tenant_id=$1 AND d.park_id=$2 AND d.result_id=ANY($3::uuid[]) AND d.is_deleted=false ORDER BY d.result_id,v.sort_no,d.id`,
            [scope.tenantId, scope.parkId, resultIds],
          )) as RawRow[])
        : [];
    const head = rows[0]!,
      results = rows
        .filter((row) => row.resultId)
        .map((row) => ({
          resultId: row.resultId,
          insuranceSource: payrollInsuranceEvidence(row),
          employeeCode: row.employeeCode,
          employeeName: row.employeeName,
          oldTotal: row.oldTotal,
          newTotal: row.newTotal,
          deltaTotal: row.deltaTotal,
          reviewStatus: row.reviewStatus,
          differences: differences.filter(
            (item) => item.resultId === row.resultId,
          ),
        }));
    await this.audit(scope, actor, {
      resource: "hr.payroll_reconciliation",
      action: "读取工资双轨差异详情",
      bizType: "hr_payroll_reconciliation_run",
      bizId: id,
      path: "/hr/payroll/reconciliations/:id",
      fieldGroups: ["financial", "compensation"],
      projection: "admin",
      itemCount: results.length,
    });
    return {
      id: head.id,
      status: head.status,
      toleranceAmount: head.toleranceAmount,
      employeeCount: head.employeeCount,
      differenceCount: head.differenceCount,
      engineVersion: head.engineVersion,
      createdAt: head.createdAt,
      results,
      resultPage: q.result_page,
      resultPageSize: q.result_page_size,
      resultTotal: Number(head.employeeCount),
    };
  }

  async listReconciliationReviewActions(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    q: HrPayrollReconciliationReviewActionQueryDto,
  ) {
    this.requireReconciliationRead(actor);
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const run = ((await manager.query(
        "SELECT id FROM hr_payroll_reconciliation_run WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false",
        [id, scope.tenantId, scope.parkId],
      )) as RawRow[])[0];
      if (!run) throw new NotFoundException("Payroll reconciliation run not found");
      const params = [scope.tenantId, scope.parkId, id];
      const count = ((await manager.query(
        `SELECT COUNT(*)::int AS total
           FROM hr_payroll_reconciliation_review_action action
          WHERE action.tenant_id=$1 AND action.park_id=$2 AND action.run_id=$3
            AND action.is_deleted=false`,
        params,
      )) as RawRow[])[0];
      const rows = (await manager.query(
        `SELECT action.id,action.sequence_no AS "sequenceNo",action.decision,action.comment,
                action.create_time AS "createdAt",CASE WHEN action.item_difference_id IS NOT NULL THEN result.id ELSE action.result_id END AS "resultId",
                action.item_difference_id AS "itemDifferenceId",
                employee.employee_code AS "employeeCode",employee.full_name AS "employeeName",
                item.display_name AS "itemName"
           FROM hr_payroll_reconciliation_review_action action
           LEFT JOIN hr_payroll_reconciliation_item_difference difference
             ON difference.id=action.item_difference_id AND difference.tenant_id=action.tenant_id
            AND difference.park_id=action.park_id AND difference.is_deleted=false
           LEFT JOIN hr_payroll_reconciliation_result result
             ON result.id=COALESCE(action.result_id,difference.result_id) AND result.tenant_id=action.tenant_id
            AND result.park_id=action.park_id AND result.run_id=action.run_id
            AND result.is_deleted=false
           LEFT JOIN hr_employee employee
             ON employee.id=result.employee_id AND employee.tenant_id=result.tenant_id
            AND employee.park_id=result.park_id AND employee.is_deleted=false
           LEFT JOIN hr_payroll_item_version item
             ON result.id IS NOT NULL AND item.id=difference.item_version_id AND item.tenant_id=difference.tenant_id
            AND item.park_id=difference.park_id AND item.is_deleted=false
          WHERE action.tenant_id=$1 AND action.park_id=$2 AND action.run_id=$3
            AND action.is_deleted=false
          ORDER BY action.sequence_no ASC,action.id ASC
          LIMIT $4 OFFSET $5`,
        [...params, q.page_size, (q.page - 1) * q.page_size],
      )) as RawRow[];
      await this.auditService.recordOperationRequired({
        tenantId: scope.tenantId, parkId: scope.parkId, userId: actor.sub,
        username: actor.username, roleCodes: actor.roles, module: "人力资源管理",
        resource: "hr.payroll_reconciliation", action: "读取工资双轨复核记录",
        bizType: "hr_payroll_reconciliation_run", bizId: id, beforeJson: null,
        afterJson: { page: q.page, pageSize: q.page_size, total: Number(count?.total ?? 0) },
        method: "GET", path: "/hr/payroll/reconciliations/:id/review-actions",
        success: true, result: "success", requestId: null,
      }, manager);
      return { items: rows, total: Number(count?.total ?? 0), page: q.page, page_size: q.page_size };
    });
  }

  private async lockFrozenPayrollSource(manager: EntityManager, scope: TenantParkScope, dto: { reconciliationSourceId?: string; legacyBatchId: string }) {
    return ((await manager.query(`SELECT source.id,source.book_id,source.period_month,source.source_sha256,
            (source.frozen_input->'snapshots')::text AS snapshots_json,
            (source.frozen_input->'items')::text AS items_json
           FROM hr_payroll_reconciliation_source source
           JOIN hr_yuzhou_t4_followon_operation receipt ON receipt.operation_id=source.operation_id
             AND receipt.status='succeeded' AND receipt.binding_sha256=source.binding_sha256
           JOIN migration_batch control ON control.run_id=source.operation_id
             AND control.t4_followon_operation_id=source.operation_id AND control.status='succeeded'
             AND control.target_database=current_database()
           WHERE source.id=$1 AND source.tenant_id=$2 AND source.park_id=$3
             AND source.legacy_batch_id=$4 FOR SHARE OF source,receipt,control`,
      [dto.reconciliationSourceId, scope.tenantId, scope.parkId, dto.legacyBatchId])) as RawRow[])[0];
  }

  async insuranceSourceOptions(scope: TenantParkScope, actor: JwtPrincipal, query: HrPayrollInsuranceOptionsQueryDto) {
    if (![HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE, HR_PERMISSIONS.HR_EMPLOYEE_READ,
      HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ].every(permission => this.has(actor, permission))) {
      throw new ForbiddenException("Payroll insurance source read permission is required");
    }
    return this.dataSource.transaction("REPEATABLE READ", async manager => {
      await manager.query("SET LOCAL statement_timeout='15s'");
      const attendance = (await manager.query(`SELECT p.period_month FROM hr_attendance_payroll_input_batch b
        JOIN hr_attendance_period p ON p.id=b.period_id AND p.tenant_id=b.tenant_id AND p.park_id=b.park_id
        WHERE b.id=$1 AND b.tenant_id=$2 AND b.park_id=$3 AND NOT b.is_deleted AND NOT p.is_deleted
          AND b.status='effective' AND p.status='closed'`, [query.attendanceInputBatchId,scope.tenantId,scope.parkId]))[0] as RawRow | undefined;
      if (!attendance) throw new ConflictException("Selected attendance input is not effective and closed");
      const month = sqlDate(attendance.period_month);
      const legacy = (await manager.query("SELECT status FROM hr_payroll_legacy_batch WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND NOT is_deleted",
        [query.legacyBatchId,scope.tenantId,scope.parkId]))[0] as RawRow | undefined;
      const frozen = query.reconciliationSourceId ? await this.lockFrozenPayrollSource(manager,scope,query) : undefined;
      if (query.reconciliationSourceId && (!frozen || sqlDate(frozen.period_month)!==month)) throw new ConflictException("Frozen source does not match selected period");
      if (!legacy || (legacy.status!=="published" && !(legacy.status==="staged" && frozen))) throw new ConflictException("Selected payroll source is not available");
      const employeeSql = frozen ? `SELECT DISTINCT x.employee_id FROM jsonb_to_recordset($4::jsonb) AS x(employee_id uuid) WHERE $3::date IS NOT NULL`
        : `SELECT DISTINCT s.employee_id FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p
           ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id
           WHERE s.tenant_id=$1 AND s.park_id=$2 AND s.batch_id=$4::uuid AND s.mapping_status='mapped' AND NOT s.is_deleted AND p.period_month=$3::date`;
      const base = `WITH candidates AS (${employeeSql}), employees AS (SELECT e.id,e.employee_code,e.full_name FROM candidates c
        JOIN hr_employee e ON e.id=c.employee_id AND e.tenant_id=$1 AND e.park_id=$2 WHERE NOT e.is_deleted)`;
      const params = [scope.tenantId,scope.parkId,month,frozen?.snapshots_json ?? query.legacyBatchId];
      const total = Number((await manager.query(`${base} SELECT count(*)::int AS total FROM employees`,params))[0].total);
      if (total>5000) throw new ConflictException("Payroll insurance employee count exceeds supported limit");
      const employees = await manager.query(`${base} SELECT id AS "employeeId",employee_code AS "employeeCode",full_name AS "fullName"
        FROM employees ORDER BY employee_code,id LIMIT $5 OFFSET $6`,[...params,query.page_size,(query.page-1)*query.page_size]) as Array<{employeeId:string;employeeCode:string;fullName:string}>;
      const ids = employees.map(employee=>employee.employeeId);
      const options = ids.length ? await manager.query(`SELECT employee_id AS "employeeId",id AS "sourceId",'historical'::text AS "sourceKind",version AS "expectedVersion",NULL::text AS "expectedHash"
        FROM hr_employee_insurance_period WHERE tenant_id=$1 AND park_id=$2 AND employee_id=ANY($3::uuid[]) AND NOT is_deleted AND NOT needs_review
          AND period_year=EXTRACT(YEAR FROM $4::date)::int AND period_month=EXTRACT(MONTH FROM $4::date)::int
        UNION ALL SELECT r.employee_id,r.id,'modern_confirmed',r.revision_no,p.snapshot_sha256::text
        FROM hr_insurance_owned_revision r JOIN hr_insurance_owned_preview p ON p.id=r.preview_id AND p.tenant_id=r.tenant_id AND p.park_id=r.park_id
        WHERE r.tenant_id=$1 AND r.park_id=$2 AND r.employee_id=ANY($3::uuid[]) AND r.period_month=$4::date
          AND NOT EXISTS(SELECT 1 FROM hr_insurance_owned_revision n WHERE n.tenant_id=r.tenant_id AND n.park_id=r.park_id
            AND n.employee_id=r.employee_id AND n.period_month=r.period_month AND n.revision_no>r.revision_no)
        ORDER BY "employeeId","sourceKind","sourceId"`,[scope.tenantId,scope.parkId,ids,month]) as RawRow[] : [];
      await this.auditService.recordOperationRequired({tenantId:scope.tenantId,parkId:scope.parkId,userId:actor.sub,username:actor.username,
        realName:actor.realName??null,roleCodes:actor.roles,module:"人力资源管理",resource:"hr.payroll_insurance_sources",action:"读取工资社保来源",
        bizType:"hr_payroll_reconciliation_run",bizId:null,beforeJson:null,afterJson:{employeeCount:employees.length,optionCount:options.length},
        method:"GET",path:"/hr/payroll/reconciliations/insurance-sources",success:true,result:"success",requestId:null},manager);
      return {items:employees.map(employee=>({...employee,options:options.filter(option=>option.employeeId===employee.employeeId)
        .map(option=>({...option,...(option.sourceKind==='historical'?{expectedHash:undefined}: {})}))})),total,page:query.page,page_size:query.page_size,periodMonth:month};
    });
  }

  async simulateReconciliation(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHrPayrollReconciliationDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE))
      throw new ForbiddenException(
        "Payroll reconciliation calculate permission is required",
      );
    if (dto.insuranceSources?.some(choice => choice.sourceKind === "modern_confirmed") &&
      ![HR_PERMISSIONS.HR_INSURANCE_READ, HR_PERMISSIONS.HR_INSURANCE_AMOUNT_READ, HR_PERMISSIONS.HR_EMPLOYEE_READ].every(permission => this.has(actor, permission))) {
      throw new ForbiddenException("Modern insurance financial source permission is required");
    }
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [
          `hr-payroll-reconciliation:${scope.tenantId}:${scope.parkId}:${dto.legacyBatchId}:${dto.attendanceInputBatchId}`,
        ],
      );
      const attendance = (
        (await manager.query(
          `SELECT b.id,b.period_id,p.period_month,p.status AS period_status,b.status AS batch_status,b.batch_no FROM hr_attendance_payroll_input_batch b JOIN hr_attendance_period p ON p.id=b.period_id AND p.tenant_id=b.tenant_id AND p.park_id=b.park_id WHERE b.id=$1 AND b.tenant_id=$2 AND b.park_id=$3 AND b.is_deleted=false AND p.is_deleted=false FOR UPDATE OF b,p`,
          [dto.attendanceInputBatchId, scope.tenantId, scope.parkId],
        )) as RawRow[]
      )[0];
      if (
        !attendance ||
        attendance.period_status !== "closed" ||
        attendance.batch_status !== "effective"
      )
        throw new ConflictException(
          "Simulation requires the current effective payroll input from a closed attendance period",
        );
      const legacy = (
        (await manager.query(
          "SELECT id,status FROM hr_payroll_legacy_batch WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE",
          [dto.legacyBatchId, scope.tenantId, scope.parkId],
        )) as RawRow[]
      )[0];
      const frozenSource = dto.reconciliationSourceId ? await this.lockFrozenPayrollSource(manager, scope, dto) : undefined;
      if (dto.reconciliationSourceId && (!frozenSource || sqlDate(frozenSource.period_month) !== sqlDate(attendance.period_month)))
        throw new ConflictException("Frozen payroll source must match the selected scope, batch and closed period");
      if (!legacy || (legacy.status !== "published" && !(frozenSource && legacy.status === "staged")))
        throw new ConflictException(
          "Simulation requires a published immutable legacy batch or a reviewed frozen period source",
        );
      if (dto.supersedesRunId) {
        const prior = (
          (await manager.query(
            "SELECT id FROM hr_payroll_reconciliation_run WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR SHARE",
            [dto.supersedesRunId, scope.tenantId, scope.parkId],
          )) as RawRow[]
        )[0];
        if (!prior)
          throw new NotFoundException(
            "Superseded reconciliation run not found",
          );
      }
      const formulas = (await manager.query(
        `SELECT f.id,f.book_id,f.item_version_id,f.raw_expression,f.raw_condition,f.dsl_ast,f.dependency_codes,f.parser_version,f.calculation_order,d.item_code,v.item_category FROM hr_payroll_formula_version f JOIN hr_payroll_item_version v ON v.id=f.item_version_id AND v.tenant_id=f.tenant_id AND v.park_id=f.park_id JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id WHERE f.tenant_id=$1 AND f.park_id=$2 AND ($3::uuid IS NULL OR f.book_id=$3) AND f.parse_status='approved_for_simulation' AND f.is_deleted=false ORDER BY f.book_id,f.calculation_order,f.id FOR SHARE OF f`,
        [scope.tenantId, scope.parkId, frozenSource?.book_id ?? null],
      )) as ReconciliationFormula[];
      if (!formulas.length)
        throw new ConflictException(
          "No approved formula version is available for simulation",
        );
      const verified = formulas.map((formula) => {
        if (![HR_PAYROLL_DSL_PARSER_VERSION, HR_PAYROLL_INSURANCE_DSL_PARSER_VERSION].includes(formula.parser_version))
          throw new ConflictException(
            "Approved formula parser version is not supported",
          );
        if (formula.raw_condition?.trim())
          throw new ConflictException(
            "Approved formula contains an unsupported legacy condition",
          );
        const parsed = parsePayrollFormula(formula.raw_expression);
        if (!parsed.ast)
          throw new ConflictException(
            "Approved formula no longer passes the restricted parser",
          );
        if (
          parsed.parserVersion !== formula.parser_version ||
          stableJson(parsed.ast) !== stableJson(formula.dsl_ast) ||
          JSON.stringify(parsed.dependencies) !==
            JSON.stringify(formula.dependency_codes)
        )
          throw new ConflictException(
            "Approved formula AST evidence has drifted",
          );
        return {
          ...formula,
          ast: parsed.ast,
          dependencies: parsed.dependencies,
          itemCode: formula.item_code,
        };
      });
      for (const bookId of new Set(
        verified.map((formula) => formula.book_id),
      )) {
        const bookFormulas = verified.filter(
          (formula) => formula.book_id === bookId,
        );
        assertAcyclicFormulaDependencies(
          bookFormulas.map((f) => ({
            itemCode: f.itemCode,
            dependencies: f.dependencies,
          })),
        );
        assertFormulaEvaluationOrder(
          bookFormulas.map((f) => ({
            itemCode: f.itemCode,
            dependencies: f.dependencies,
          })),
        );
      }
      const snapshots = (frozenSource ? await manager.query(
        `SELECT x.id,x.employee_id,x.net_amount,e.version AS employee_version,$4::uuid AS book_id
         FROM jsonb_to_recordset($1::jsonb) AS x(id uuid,employee_id uuid,net_amount numeric(20,4))
         JOIN hr_employee e ON e.id=x.employee_id AND e.tenant_id=$2 AND e.park_id=$3
         ORDER BY x.employee_id,x.id FOR SHARE OF e`,
        [frozenSource.snapshots_json, scope.tenantId, scope.parkId, frozenSource.book_id],
      ) : await manager.query(
        `SELECT s.id,s.employee_id,s.net_amount,e.version AS employee_version,p.book_id FROM hr_payroll_legacy_snapshot s JOIN hr_payroll_book_period p ON p.id=s.book_period_id AND p.tenant_id=s.tenant_id AND p.park_id=s.park_id JOIN hr_employee e ON e.id=s.employee_id AND e.tenant_id=s.tenant_id AND e.park_id=s.park_id WHERE s.batch_id=$1 AND s.tenant_id=$2 AND s.park_id=$3 AND s.mapping_status='mapped' AND s.is_deleted=false AND p.period_month=$4::date ORDER BY s.employee_id,s.id FOR SHARE OF s,e`,
        [
          dto.legacyBatchId,
          scope.tenantId,
          scope.parkId,
          sqlDate(attendance.period_month),
        ],
      )) as Array<Record<string, unknown>>;
      if (!snapshots.length)
        throw new ConflictException(
          "No mapped legacy payroll snapshot matches the closed attendance period",
        );
      const snapshotBookIds = [
        ...new Set(snapshots.map((snapshot) => String(snapshot.book_id))),
      ];
      const policyRows = (await manager.query(
        `SELECT cur.book_id,policy.id AS policy_version_id,policy.version_no AS policy_version_no,policy.net_item_version_id,policy.tolerance_amount,definition.item_code,formula.id AS formula_version_id
         FROM hr_payroll_reconciliation_policy_current cur
         JOIN hr_payroll_reconciliation_policy_version policy ON policy.id=cur.policy_version_id AND policy.tenant_id=cur.tenant_id AND policy.park_id=cur.park_id AND policy.book_id=cur.book_id
         JOIN hr_payroll_item_version item ON item.id=policy.net_item_version_id AND item.tenant_id=policy.tenant_id AND item.park_id=policy.park_id
         JOIN hr_payroll_item_definition definition ON definition.id=item.item_definition_id AND definition.tenant_id=item.tenant_id AND definition.park_id=item.park_id AND definition.book_id=policy.book_id
         JOIN hr_payroll_formula_version formula ON formula.item_version_id=item.id AND formula.tenant_id=item.tenant_id AND formula.park_id=item.park_id AND formula.book_id=policy.book_id AND formula.parse_status='approved_for_simulation' AND formula.is_deleted=false
         WHERE cur.tenant_id=$1 AND cur.park_id=$2 AND cur.book_id=ANY($3::uuid[]) AND policy.status='approved' AND policy.is_deleted=false AND item.enabled=true AND item.value_type='decimal' AND item.is_deleted=false AND definition.is_deleted=false
         ORDER BY cur.book_id,formula.id FOR SHARE OF cur,policy,item,definition,formula`,
        [scope.tenantId, scope.parkId, snapshotBookIds],
      )) as RawRow[];
      const policiesByBook = new Map<string, RawRow>();
      for (const bookId of snapshotBookIds) {
        const matches = policyRows.filter(
          (policy) => String(policy.book_id) === bookId,
        );
        if (matches.length !== 1)
          throw new ConflictException(
            "Each payroll book requires exactly one current approved net-item mapping",
          );
        const mappedFormula = verified.find(
          (formula) => String(formula.id) === String(matches[0]!.formula_version_id),
        );
        if (!mappedFormula)
          throw new ConflictException(
            "Current net-item mapping does not reference a verified formula version",
          );
        policiesByBook.set(bookId, matches[0]!);
      }
      const employeeIds = snapshots.map((x) => String(x.employee_id));
      const inputRows = (await manager.query(
        `SELECT i.id,i.employee_id,i.worked_minutes,i.late_minutes,i.early_minutes,i.absence_days,i.missing_punch_days FROM hr_attendance_payroll_input_item i WHERE i.batch_id=$1 AND i.tenant_id=$2 AND i.park_id=$3 AND i.employee_id=ANY($4::uuid[]) AND i.is_deleted=false FOR SHARE`,
        [dto.attendanceInputBatchId, scope.tenantId, scope.parkId, employeeIds],
      )) as Array<Record<string, unknown>>;
      const compensationRows = (await manager.query(
          `SELECT id,employee_id,version,base_salary,allowance_amount,variable_target,effective_from,effective_to FROM hr_employee_compensation WHERE tenant_id=$1 AND park_id=$2 AND employee_id=ANY($3::uuid[]) AND status='active' AND effective_from<=$4::date AND (effective_to IS NULL OR effective_to>=$4::date) AND is_deleted=false ORDER BY employee_id,effective_from DESC,id DESC FOR SHARE`,
          [
            scope.tenantId,
            scope.parkId,
            employeeIds,
            sqlDate(attendance.period_month),
          ],
        )) as Array<Record<string, unknown>>,
        compensationLatest = new Map<string, Record<string, unknown>>();
      for (const row of compensationRows) {
        const employeeId = String(row.employee_id);
        if (!compensationLatest.has(employeeId))
          compensationLatest.set(employeeId, row);
      }
      const compensations = [...compensationLatest.values()];
      if (dto.insuranceSources) assertPayrollInsuranceChoices(employeeIds, dto.insuranceSources);
      const modernInsurance = dto.insuranceSources
        ? await lockModernPayrollInsuranceSources(manager, scope, sqlDate(attendance.period_month), dto.insuranceSources)
        : new Map<string, ModernPayrollInsuranceSource>();
      const historicalEmployeeIds = employeeIds.filter(id => !modernInsurance.has(id));
      const [year, month] = sqlDate(attendance.period_month)
          .slice(0, 7)
          .split("-")
          .map(Number),
        insurance = (await manager.query(
          `SELECT id,employee_id,version,needs_review FROM hr_employee_insurance_period WHERE tenant_id=$1 AND park_id=$2 AND employee_id=ANY($3::uuid[]) AND period_year=$4 AND period_month=$5 AND is_deleted=false ORDER BY employee_id,id FOR UPDATE`,
          [scope.tenantId, scope.parkId, historicalEmployeeIds, year, month],
        )) as Array<Record<string, unknown>>;
      if (dto.insuranceSources) {
        for (const choice of dto.insuranceSources.filter(choice => choice.sourceKind === "historical")) {
          const matches = insurance.filter(period => String(period.employee_id) === choice.employeeId);
          if (matches.length !== 1 || String(matches[0]!.id) !== choice.sourceId || Number(matches[0]!.version) !== choice.expectedVersion) {
            throw new ConflictException("Selected historical insurance period is stale, foreign or changed");
          }
        }
      }
      if (insurance.some((period) => period.needs_review === true))
        throw new ConflictException(
          "Insurance input requires review before payroll simulation",
        );
      // Parent UPDATE locks also block new child facts through the scoped FK.
      // Keep exact PostgreSQL numeric strings and source NULLs in the snapshot;
      // never infer missing amounts or recompute historical policy results.
      const insuranceItems = insurance.length ? (await manager.query(
        `SELECT id,period_id,version,insurance_kind,contribution_base,total_amount,
          employer_amount,employee_amount,supplement_amount,legacy_base_negative
         FROM hr_employee_insurance_item
         WHERE tenant_id=$1 AND park_id=$2 AND period_id=ANY($3::uuid[]) AND is_deleted=false
         ORDER BY period_id,insurance_kind,id FOR SHARE`,
        [scope.tenantId, scope.parkId, insurance.map((period) => period.id)],
      )) as Array<Record<string, unknown>> : [];
      const insuranceItemsByPeriod = new Map<string, Array<PayrollInsuranceAmountFact & Record<string, unknown>>>();
      for (const item of insuranceItems) {
        const periodId = String(item.period_id);
        const entries = insuranceItemsByPeriod.get(periodId) ?? [];
        entries.push({
          id: String(item.id), version: String(item.version),
          insuranceKind: String(item.insurance_kind),
          contributionBase: item.contribution_base == null ? null : String(item.contribution_base),
          totalAmount: item.total_amount == null ? null : String(item.total_amount),
          employerAmount: item.employer_amount == null ? null : String(item.employer_amount),
          employeeAmount: item.employee_amount == null ? null : String(item.employee_amount),
          supplementAmount: item.supplement_amount == null ? null : String(item.supplement_amount),
          legacyBaseNegative: item.legacy_base_negative === true,
        });
        insuranceItemsByPeriod.set(periodId, entries);
      }
      for (const source of modernInsurance.values()) {
        insurance.push({ id: source.id, employee_id: source.employeeId, version: source.revisionNo,
          source_kind: "modern_confirmed", snapshot_hash: source.snapshotHash });
        insuranceItemsByPeriod.set(source.id, source.items.map(item => ({ ...item })));
      }
      const employeeVersions = Object.fromEntries(
          snapshots.map((s) => [
            String(s.employee_id),
            { version: String(s.employee_version) },
          ]),
        ),
        compVersions = Object.fromEntries(
          compensations.map((c) => [
            String(c.employee_id),
            {
              id: String(c.id),
              version: String(c.version),
              effectiveFrom: String(c.effective_from),
              effectiveTo:
                c.effective_to == null ? null : String(c.effective_to),
              baseSalary: String(c.base_salary),
              allowanceAmount: String(c.allowance_amount),
              variableTarget: String(c.variable_target),
            },
          ]),
        ),
        insuranceVersions = Object.fromEntries(
          insurance.map((i) => [
            String(i.employee_id),
            {
              id: String(i.id), version: String(i.version),
              snapshotVersion: i.source_kind === "modern_confirmed" ? "insurance-modern-v1" : "insurance-facts-v1", needsReview: false,
              ...(i.source_kind === "modern_confirmed" ? { sourceKind: "modern_confirmed", snapshotHash: String(i.snapshot_hash) } : {}),
              items: insuranceItemsByPeriod.get(String(i.id)) ?? [],
            },
          ]),
        ),
        formulaVersions = Object.fromEntries(
          verified.map((f) => [
            `${f.book_id}:${f.itemCode}`,
            {
              id: String(f.id),
              parserVersion: f.parser_version,
              astHash: createHash("sha256")
                .update(stableJson(f.dsl_ast))
                .digest("hex"),
            },
          ]),
        ),
        reconciliationPolicies = Object.fromEntries(
          [...policiesByBook].map(([bookId, policy]) => [
            bookId,
            {
              policyVersionId: String(policy.policy_version_id),
              policyVersionNo: String(policy.policy_version_no),
              netItemVersionId: String(policy.net_item_version_id),
              formulaVersionId: String(policy.formula_version_id),
              itemCode: String(policy.item_code),
              toleranceAmount: String(policy.tolerance_amount),
            },
          ]),
        );
      const attendanceVersions = Object.fromEntries(
        inputRows.map((row) => [
          String(row.employee_id),
          {
            id: String(row.id),
            workedMinutes: String(row.worked_minutes),
            lateMinutes: String(row.late_minutes),
            earlyMinutes: String(row.early_minutes),
            absenceDays: String(row.absence_days),
            missingPunchDays: String(row.missing_punch_days),
          },
        ]),
      );
      const runParserVersion = verified.some(f => f.parser_version === HR_PAYROLL_INSURANCE_DSL_PARSER_VERSION)
        ? HR_PAYROLL_INSURANCE_DSL_PARSER_VERSION : HR_PAYROLL_DSL_PARSER_VERSION;
      const frozen = {
        employeeVersions,
        compVersions,
        insuranceVersions,
        formulaVersions,
        reconciliationPolicies,
        attendanceVersions,
        attendanceInputBatchId: dto.attendanceInputBatchId,
        legacyBatchId: dto.legacyBatchId,
        legacySource: frozenSource ? { id: frozenSource.id, sourceSha256: frozenSource.source_sha256,
          bookId: frozenSource.book_id, periodMonth: sqlDate(frozenSource.period_month) } : null,
        parserVersion: runParserVersion,
        engineVersion: HR_PAYROLL_DSL_ENGINE_VERSION,
      };
      const inputHash = createHash("sha256")
        .update(JSON.stringify(frozen))
        .digest("hex");
      const inserted = (await manager.query(
        `INSERT INTO hr_payroll_reconciliation_run(tenant_id,park_id,legacy_batch_id,attendance_input_batch_id,parser_version,engine_version,tolerance_amount,status,frozen_employee_version,frozen_compensation_version,frozen_insurance_version,frozen_formula_version,input_snapshot_hash,supersedes_run_id,employee_count,difference_count,create_by,update_by,reconciliation_source_id) VALUES($1,$2,$3,$4,$5,$6,$7,'calculating',$8,$9,$10,$11,$12,$13,$14,0,$15,$15,$16) RETURNING id`,
        [
          scope.tenantId,
          scope.parkId,
          dto.legacyBatchId,
          dto.attendanceInputBatchId,
          runParserVersion,
          HR_PAYROLL_DSL_ENGINE_VERSION,
          "0.0000",
          JSON.stringify(employeeVersions),
          JSON.stringify(compVersions),
          JSON.stringify(insuranceVersions),
          JSON.stringify({ formulaVersions, reconciliationPolicies, legacySource: frozen.legacySource }),
          inputHash,
          dto.supersedesRunId ?? null,
          snapshots.length,
          actor.sub,
          dto.reconciliationSourceId ?? null,
        ],
      )) as Array<{ id: string }>;
      const runId = inserted[0]!.id;
      let differenceCount = 0;
      const attendanceBy = new Map(
          inputRows.map((x) => [String(x.employee_id), x]),
        ),
        compBy = new Map(compensations.map((x) => [String(x.employee_id), x])),
        insuranceBy = new Map(insurance.map((x) => [String(x.employee_id), x]));
      for (const snapshot of snapshots) {
        const employeeId = String(snapshot.employee_id),
          attendanceInput = attendanceBy.get(employeeId),
          policy = policiesByBook.get(String(snapshot.book_id));
        if (!policy)
          throw new ConflictException(
            "Current approved net-item mapping is missing for payroll book",
          );
        const tolerance = this.decimalToScaled(String(policy.tolerance_amount));
        if (!attendanceInput)
          throw new ConflictException(
            "Frozen attendance input is incomplete for a legacy employee",
          );
        const oldItems = (frozenSource ? await manager.query(
          `SELECT d.item_code,i.item_version_id,i.decimal_value FROM jsonb_to_recordset($1::jsonb)
           AS i(snapshot_id uuid,item_version_id uuid,decimal_value numeric(20,4),value_type text,is_source_null boolean,is_deleted boolean)
           JOIN hr_payroll_item_version v ON v.id=i.item_version_id AND v.tenant_id=$3 AND v.park_id=$4
           JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id
           WHERE i.snapshot_id=$2 AND i.value_type='decimal' AND i.is_source_null=false AND i.is_deleted=false`,
          [frozenSource.items_json, snapshot.id, scope.tenantId, scope.parkId],
        ) : await manager.query(
          `SELECT d.item_code,i.item_version_id,i.decimal_value FROM hr_payroll_legacy_snapshot_item i JOIN hr_payroll_item_version v ON v.id=i.item_version_id AND v.tenant_id=i.tenant_id AND v.park_id=i.park_id JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id WHERE i.snapshot_id=$1 AND i.tenant_id=$2 AND i.park_id=$3 AND i.value_type='decimal' AND i.is_source_null=false AND i.is_deleted=false`,
          [snapshot.id, scope.tenantId, scope.parkId],
        )) as Array<Record<string, unknown>>;
        const inputs: Record<string, string> = Object.fromEntries(
          oldItems.map((item) => [
            `payroll:${String(item.item_code)}`,
            String(item.decimal_value),
          ]),
        );
        const comp = compBy.get(employeeId);
        if (!comp)
          throw new ConflictException(
            "Frozen compensation input is incomplete for a legacy employee",
          );
        if (!insuranceBy.has(employeeId))
          throw new ConflictException(
            "Frozen insurance input is incomplete for a legacy employee",
          );
        if (snapshot.net_amount == null)
          throw new ConflictException(
            "Legacy net amount is missing and no authoritative net policy can be applied",
          );
        Object.assign(inputs, {
          "hr:基本工资": String(comp.base_salary),
          "hr:津贴": String(comp.allowance_amount),
          "hr:浮动目标": String(comp.variable_target),
          "hr:工作分钟": `${attendanceInput.worked_minutes}.0000`,
          "hr:迟到分钟": `${attendanceInput.late_minutes}.0000`,
          "hr:早退分钟": `${attendanceInput.early_minutes}.0000`,
          "hr:缺勤天数": `${attendanceInput.absence_days}.0000`,
          "hr:缺卡天数": `${attendanceInput.missing_punch_days}.0000`,
        });
        const employeeFormulas = verified.filter(f => String(f.book_id) === String(snapshot.book_id));
        const employeeInsurance = insuranceBy.get(employeeId)!;
        Object.assign(inputs, projectPayrollInsuranceInputs(
          insuranceItemsByPeriod.get(String(employeeInsurance.id)) ?? [],
          employeeFormulas.flatMap(formula => formula.dependencies),
        ));
        const calculated = new Map<string, string>();
        for (const formula of employeeFormulas) {
          for (const [key, value] of calculated)
            inputs[`payroll:${key}`] = value;
          calculated.set(
            formula.itemCode,
            evaluatePayrollFormula(formula.ast as PayrollAst, inputs),
          );
        }
        const oldTotal = this.decimalToScaled(
          String(snapshot.net_amount),
        );
        const mappedNetValue = calculated.get(String(policy.item_code));
        if (mappedNetValue == null)
          throw new ConflictException(
            "Current net-item mapping did not produce a formula result",
          );
        const newTotal = this.decimalToScaled(mappedNetValue);
        const delta = newTotal - oldTotal,
          resultStatus =
            this.abs(delta) <= tolerance ? "within_tolerance" : "needs_review";
        if (resultStatus === "needs_review") differenceCount++;
        const result = (
          (await manager.query(
            `INSERT INTO hr_payroll_reconciliation_result(tenant_id,park_id,run_id,employee_id,legacy_snapshot_id,employee_version,compensation_version_id,insurance_period_id,attendance_input_item_id,old_total,new_total,delta_total,review_status,create_by,update_by,insurance_modern_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15) RETURNING id`,
            [
              scope.tenantId,
              scope.parkId,
              runId,
              employeeId,
              snapshot.id,
              snapshot.employee_version,
              comp.id,
              modernInsurance.has(employeeId) ? null : insuranceBy.get(employeeId)!.id,
              attendanceInput.id,
              this.scaledToDecimal(oldTotal),
              this.scaledToDecimal(newTotal),
              this.scaledToDecimal(delta),
              resultStatus,
              actor.sub,
              modernInsurance.get(employeeId)?.id ?? null,
            ],
          )) as Array<{ id: string }>
        )[0]!;
        for (const formula of verified.filter(
          (f) => String(f.book_id) === String(snapshot.book_id),
        )) {
          const old = oldItems.find(
              (i) =>
                String(i.item_version_id) === String(formula.item_version_id),
            );
          if (!old || old.decimal_value == null)
            throw new ConflictException(
              "Legacy payroll item required by an approved formula is missing",
            );
          const oldAmount = this.decimalToScaled(String(old.decimal_value)),
            newAmount = this.decimalToScaled(calculated.get(formula.itemCode)!),
            itemDelta = newAmount - oldAmount,
            status =
              this.abs(itemDelta) <= tolerance
                ? "within_tolerance"
                : "needs_review",
            evaluationHash = createHash("sha256")
              .update(
                `${inputHash}:${formula.id}:${employeeId}:${this.scaledToDecimal(newAmount)}`,
              )
              .digest("hex");
          await manager.query(
            `INSERT INTO hr_payroll_reconciliation_item_difference(tenant_id,park_id,result_id,item_version_id,formula_version_id,old_amount,new_amount,delta_amount,tolerance_amount,review_status,input_source_versions,evaluation_hash,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)`,
            [
              scope.tenantId,
              scope.parkId,
              result.id,
              formula.item_version_id,
              formula.id,
              this.scaledToDecimal(oldAmount),
              this.scaledToDecimal(newAmount),
              this.scaledToDecimal(itemDelta),
              String(policy.tolerance_amount),
              status,
              JSON.stringify({
                attendanceInputItemId: attendanceInput.id,
                compensationVersionId: comp.id,
                insurancePeriodId: modernInsurance.has(employeeId) ? null : insuranceBy.get(employeeId)!.id,
                ...(modernInsurance.has(employeeId) ? { insuranceModernRevisionId: modernInsurance.get(employeeId)!.id,
                  insuranceSourceVersion: modernInsurance.get(employeeId)!.revisionNo,
                  insuranceSourceHash: modernInsurance.get(employeeId)!.snapshotHash } : {}),
                formulaVersionId: formula.id,
                reconciliationPolicyVersionId: policy.policy_version_id,
                reconciliationPolicyVersionNo: policy.policy_version_no,
                netItemVersionId: policy.net_item_version_id,
                netItemCode: policy.item_code,
                toleranceAmount: policy.tolerance_amount,
                engineVersion: HR_PAYROLL_DSL_ENGINE_VERSION,
              }),
              evaluationHash,
              actor.sub,
            ],
          );
        }
      }
      await manager.query(
        "UPDATE hr_payroll_reconciliation_run SET status='review',difference_count=$1,update_by=$2,update_time=now() WHERE id=$3",
        [differenceCount, actor.sub, runId],
      );
      return {
        id: runId,
        status: "review",
        employeeCount: snapshots.length,
        differenceCount,
        toleranceAmount: "0.0000",
        engineVersion: HR_PAYROLL_DSL_ENGINE_VERSION,
      };
    });
  }

  async addReconciliationReview(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: HrPayrollReconciliationReviewDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW))
      throw new ForbiddenException(
        "Payroll reconciliation review permission is required",
      );
    if (dto.resultId && dto.itemDifferenceId)
      throw new BadRequestException(
        "Select either a payroll result or an item difference, not both",
      );
    return this.dataSource.transaction(async (manager) => {
      const run = (
        (await manager.query(
          "SELECT id,status FROM hr_payroll_reconciliation_run WHERE id=$1 AND tenant_id=$2 AND park_id=$3 AND is_deleted=false FOR UPDATE",
          [id, scope.tenantId, scope.parkId],
        )) as RawRow[]
      )[0];
      if (!run)
        throw new NotFoundException("Payroll reconciliation run not found");
      if (run.status !== "review")
        throw new ConflictException("Payroll reconciliation run is terminal");
      if (dto.resultId) {
        const target = (
          (await manager.query(
            "SELECT id FROM hr_payroll_reconciliation_result WHERE id=$1 AND run_id=$2 AND tenant_id=$3 AND park_id=$4 AND is_deleted=false FOR SHARE",
            [dto.resultId, id, scope.tenantId, scope.parkId],
          )) as RawRow[]
        )[0];
        if (!target)
          throw new NotFoundException(
            "Payroll reconciliation result not found",
          );
      }
      if (dto.itemDifferenceId) {
        const target = (
          (await manager.query(
            "SELECT d.id,d.result_id FROM hr_payroll_reconciliation_item_difference d JOIN hr_payroll_reconciliation_result r ON r.id=d.result_id AND r.tenant_id=d.tenant_id AND r.park_id=d.park_id AND r.is_deleted=false WHERE d.id=$1 AND r.run_id=$2 AND d.tenant_id=$3 AND d.park_id=$4 AND d.is_deleted=false FOR SHARE OF d,r",
            [dto.itemDifferenceId, id, scope.tenantId, scope.parkId],
          )) as RawRow[]
        )[0];
        if (!target)
          throw new NotFoundException(
            "Payroll reconciliation difference not found",
          );
      }
      const seq = Number(
        (
          (await manager.query(
            "SELECT COALESCE(MAX(sequence_no),0)+1 AS seq FROM hr_payroll_reconciliation_review_action WHERE tenant_id=$1 AND park_id=$2 AND run_id=$3",
            [scope.tenantId, scope.parkId, id],
          )) as RawRow[]
        )[0]?.seq ?? 1,
      );
      const saved = (
        (await manager.query(
          `INSERT INTO hr_payroll_reconciliation_review_action(tenant_id,park_id,run_id,result_id,item_difference_id,sequence_no,decision,comment,actor_id,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$9) RETURNING id,sequence_no AS "sequenceNo",decision,comment,create_time AS "createdAt"`,
          [
            scope.tenantId,
            scope.parkId,
            id,
            dto.resultId ?? null,
            dto.itemDifferenceId ?? null,
            seq,
            dto.decision,
            dto.comment,
            actor.sub,
          ],
        )) as RawRow[]
      )[0]!;
      if (
        !dto.resultId &&
        !dto.itemDifferenceId &&
        dto.decision !== "request_follow_up"
      )
        await manager.query(
          "UPDATE hr_payroll_reconciliation_run SET status=$1,update_by=$2,update_time=now() WHERE id=$3",
          [
            dto.decision === "accept_explanation" ? "accepted" : "rejected",
            actor.sub,
            id,
          ],
        );
      return saved;
    });
  }

  private historyBase(scope:TenantParkScope):SelectQueryBuilder<ObjectLiteral> {
    return this.dataSource.createQueryBuilder().from("hr_payroll_legacy_snapshot","snapshot")
      .innerJoin("hr_payroll_book_period","period","period.id=snapshot.book_period_id AND period.tenant_id=snapshot.tenant_id AND period.park_id=snapshot.park_id")
      .innerJoin("hr_payroll_book","book","book.id=period.book_id AND book.tenant_id=period.tenant_id AND book.park_id=period.park_id")
      .innerJoin("hr_payroll_legacy_batch","batch","batch.id=snapshot.batch_id AND batch.tenant_id=snapshot.tenant_id AND batch.park_id=snapshot.park_id")
      .innerJoin("hr_employee","employee","employee.id=snapshot.employee_id AND employee.tenant_id=snapshot.tenant_id AND employee.park_id=snapshot.park_id")
      .where("snapshot.tenant_id=:tenantId AND snapshot.park_id=:parkId AND snapshot.is_deleted=false AND snapshot.mapping_status='mapped'",scope)
      .andWhere("period.is_deleted=false AND book.is_deleted=false AND batch.is_deleted=false AND employee.is_deleted=false");
  }

  private async paginate(qb:SelectQueryBuilder<ObjectLiteral>,page:number,pageSize:number,order:string,grouped=false):Promise<{items:RawRow[];total:number}> {
    const countQb=qb.clone().orderBy();
    const totalRows=grouped
      ? await this.dataSource.createQueryBuilder().select("COUNT(*)","count").from(`(${countQb.getQuery()})`,`grouped_rows`).setParameters(countQb.getParameters()).getRawOne<{count:string}>()
      : await countQb.select("COUNT(*)","count").getRawOne<{count:string}>();
    const orderTerms=order.split(",").map(term=>{
      const match=term.trim().match(/^([a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*)\s+(ASC|DESC)$/i);
      return match?{column:match[1]!,direction:match[2]!.toUpperCase() as "ASC"|"DESC"}:null;
    }).filter((term):term is {column:string;direction:"ASC"|"DESC"}=>Boolean(term));
    if(orderTerms.length!==order.split(",").length)throw new Error("Invalid payroll history ordering contract");
    orderTerms.forEach((term,index)=>index===0?qb.orderBy(term.column,term.direction):qb.addOrderBy(term.column,term.direction));
    const items=await qb.offset((page-1)*pageSize).limit(pageSize).getRawMany<RawRow>();
    return {items,total:Number(totalRows?.count??0)};
  }

  private resolveHistoryAccess(actor:JwtPrincipal):HistoryAccess {
    return resolveHrPayrollHistoryAccessScope(actor);
  }

  private requireRuleRead(actor:JwtPrincipal):void {
    if(!this.has(actor,HR_PERMISSIONS.HR_PAYROLL_RULE_READ))throw new ForbiddenException("Payroll rule read permission is required");
  }

  private requireReconciliationRead(actor: JwtPrincipal): void {
    if (
      !this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE) &&
      !this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_REVIEW)
    )
      throw new ForbiddenException(
        "Payroll reconciliation permission is required",
      );
  }
  private decimalToScaled(value: string): bigint {
    const match = value.match(/^(-?)(\d+)(?:\.(\d{1,4}))?$/);
    if (!match) throw new ConflictException("Invalid payroll decimal");
    const amount =
      BigInt(match[2]!) * 10000n + BigInt((match[3] ?? "").padEnd(4, "0"));
    return match[1] ? -amount : amount;
  }
  private scaledToDecimal(value: bigint): string {
    const negative = value < 0n,
      amount = negative ? -value : value;
    return `${negative ? "-" : ""}${amount / 10000n}.${(amount % 10000n).toString().padStart(4, "0")}`;
  }
  private abs(value: bigint): bigint {
    return value < 0n ? -value : value;
  }

  private has(actor:JwtPrincipal,permission:string):boolean {
    return Boolean(actor.isSuper||actor.permissions.includes("*")||actor.permissions.includes(permission));
  }

  private async selfEmployeeId(scope:TenantParkScope,actor:JwtPrincipal):Promise<string> {
    const rows=await this.dataSource.query("SELECT id FROM hr_employee WHERE tenant_id=$1 AND park_id=$2 AND user_id=$3 AND is_deleted=false LIMIT 1",[scope.tenantId,scope.parkId,actor.sub]) as Array<{id:string}>;
    if(!rows[0])throw new NotFoundException("No employee profile is linked to current user");
    return rows[0].id;
  }

  private async audit(scope:TenantParkScope,actor:JwtPrincipal,details:HrSensitiveReadAuditDetails):Promise<void> {
    await recordHrSensitiveRead(this.auditService,scope,actor,details);
  }

  private async auditedPage(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollHistoryQueryDto,items:RawRow[],total:number,action:string,path:string,access:HistoryAccess) {
    await this.audit(scope,actor,{resource:"hr.payroll_history",action,bizType:"hr_payroll_legacy_snapshot",bizId:null,path,fieldGroups:["financial","compensation"],projection:access==="none"?"metadata":access,itemCount:items.length});
    return {items,total,page:q.page,page_size:q.page_size};
  }

  private async auditedTeamPage(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollHistoryQueryDto,items:RawRow[],total:number) {
    await this.audit(scope,actor,{resource:"hr.payroll_history_summary",action:"读取团队历史工资非金额摘要",bizType:"hr_payroll_legacy_snapshot",bizId:null,path:"/hr/payroll/history/team-summary",fieldGroups:["compensation"],projection:"team",itemCount:items.length});
    return {items,total,page:q.page,page_size:q.page_size};
  }

  private projectReviewEvidence(value:unknown):Record<string,string|number|boolean|null> {
    if(!value||typeof value!=="object"||Array.isArray(value))return {};
    const source=value as Record<string,unknown>,projected:Record<string,string|number|boolean|null>={};
    for(const key of ["reason","category","sourceCount","loadedCount","quarantinedCount","differenceCount"]){
      const entry=source[key];
      if(entry===null||typeof entry==="string"||typeof entry==="number"||typeof entry==="boolean")projected[key]=entry;
    }
    return projected;
  }
}
