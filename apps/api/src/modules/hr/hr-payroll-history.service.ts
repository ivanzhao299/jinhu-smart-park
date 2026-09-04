import {
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
  type ObjectLiteral,
  type SelectQueryBuilder,
} from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type {
  CreateHrPayrollReconciliationDto,
  CreateHrPayrollReconciliationPolicyDto,
  HrPayrollCatalogQueryDto,
  HrPayrollFormulaReviewDto,
  HrPayrollHistoryQueryDto,
  HrPayrollReconciliationDetailQueryDto,
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
  assertAcyclicFormulaDependencies,
  assertFormulaEvaluationOrder,
  evaluatePayrollFormula,
  parsePayrollFormula,
  type PayrollAst,
} from "./hr-payroll-formula-dsl";

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
    else qb.addSelect("employee.employee_code","employeeCode").addSelect("employee.full_name","employeeName");
    if(q.employee_id)qb.andWhere("snapshot.employee_id=:filterEmployeeId",{filterEmployeeId:q.employee_id});
    if(q.book_id)qb.andWhere("book.id=:bookId",{bookId:q.book_id});
    if(q.period_from)qb.andWhere("period.period_month>=:periodFrom",{periodFrom:q.period_from});
    if(q.period_to)qb.andWhere("period.period_month<=:periodTo",{periodTo:q.period_to});
    const {items,total}=await this.paginate(qb,q.page,q.page_size,"period.period_month DESC,book.legacy_scheme ASC,employee.employee_code ASC");
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
    else qb.addSelect("employee.employee_code","employeeCode").addSelect("employee.full_name","employeeName");
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
      .addSelect("item.display_name","itemName")
      .addSelect("formula.parse_status","parseStatus").addSelect("formula.dependency_codes","dependencyCodes")
      .addSelect("formula.calculation_order","calculationOrder").addSelect("formula.reviewed_at","reviewedAt").addSelect("formula.review_reason","reviewReason");
    if(q.book_id)qb.andWhere("book.id=:bookId",{bookId:q.book_id});
    if(q.parse_status)qb.andWhere("formula.parse_status=:parseStatus",{parseStatus:q.parse_status});
    const result=await this.paginate(qb,q.page,q.page_size,"book.legacy_scheme ASC,formula.calculation_order ASC,formula.id ASC");
    await this.audit(scope,actor,{resource:"hr.payroll_formula",action:"读取历史工资公式",bizType:"hr_payroll_formula_version",bizId:null,path:"/hr/payroll/history-formulas",fieldGroups:["compensation"],projection:"admin",itemCount:result.items.length});
    return {...result,page:q.page,page_size:q.page_size};
  }

  async formulaDetail(scope:TenantParkScope,actor:JwtPrincipal,id:string) {
    this.requireRuleRead(actor);
    const row=await this.dataSource.createQueryBuilder().from("hr_payroll_formula_version","formula")
      .innerJoin("hr_payroll_book","book","book.id=formula.book_id AND book.tenant_id=formula.tenant_id AND book.park_id=formula.park_id")
      .leftJoin("hr_payroll_item_version","item","item.id=formula.item_version_id AND item.tenant_id=formula.tenant_id AND item.park_id=formula.park_id")
      .where("formula.tenant_id=:tenantId AND formula.park_id=:parkId AND formula.id=:id AND formula.is_deleted=false AND book.is_deleted=false",{...scope,id})
      .select("formula.id","id").addSelect("book.id","bookId").addSelect("book.legacy_scheme","legacyScheme")
      .addSelect("item.display_name","itemName")
      .addSelect("formula.parse_status","parseStatus").addSelect("formula.dependency_codes","dependencyCodes")
      .addSelect("formula.calculation_order","calculationOrder").addSelect("formula.reviewed_at","reviewedAt").addSelect("formula.review_reason","reviewReason").getRawOne<RawRow>();
    if(!row)throw new NotFoundException("Payroll formula not found");
    await this.audit(scope,actor,{resource:"hr.payroll_formula",action:"读取历史工资公式详情",bizType:"hr_payroll_formula_version",bizId:id,path:"/hr/payroll/history-formulas/:id",fieldGroups:["compensation"],projection:"admin",itemCount:1});
    return row;
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
              HR_PAYROLL_DSL_PARSER_VERSION,
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
        attendanceBatches.length,
    });
    return { books, netItems, legacyBatches, attendanceBatches };
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
      `SELECT r.id,r.status,r.tolerance_amount AS "toleranceAmount",r.employee_count AS "employeeCount",r.difference_count AS "differenceCount",r.engine_version AS "engineVersion",r.create_time AS "createdAt",e.id AS "resultId",employee.employee_code AS "employeeCode",employee.full_name AS "employeeName",e.old_total AS "oldTotal",e.new_total AS "newTotal",e.delta_total AS "deltaTotal",e.review_status AS "reviewStatus"
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

  async simulateReconciliation(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateHrPayrollReconciliationDto,
  ) {
    if (!this.has(actor, HR_PERMISSIONS.HR_PAYROLL_RECONCILIATION_CALCULATE))
      throw new ForbiddenException(
        "Payroll reconciliation calculate permission is required",
      );
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
      if (!legacy || legacy.status !== "published")
        throw new ConflictException(
          "Simulation requires a published immutable legacy batch",
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
        `SELECT f.id,f.book_id,f.item_version_id,f.raw_expression,f.raw_condition,f.dsl_ast,f.dependency_codes,f.parser_version,f.calculation_order,d.item_code,v.item_category FROM hr_payroll_formula_version f JOIN hr_payroll_item_version v ON v.id=f.item_version_id AND v.tenant_id=f.tenant_id AND v.park_id=f.park_id JOIN hr_payroll_item_definition d ON d.id=v.item_definition_id AND d.tenant_id=v.tenant_id AND d.park_id=v.park_id WHERE f.tenant_id=$1 AND f.park_id=$2 AND f.parse_status='approved_for_simulation' AND f.is_deleted=false ORDER BY f.book_id,f.calculation_order,f.id FOR SHARE OF f`,
        [scope.tenantId, scope.parkId],
      )) as ReconciliationFormula[];
      if (!formulas.length)
        throw new ConflictException(
          "No approved formula version is available for simulation",
        );
      const verified = formulas.map((formula) => {
        if (formula.parser_version !== HR_PAYROLL_DSL_PARSER_VERSION)
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
      const snapshots = (await manager.query(
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
      const [year, month] = sqlDate(attendance.period_month)
          .slice(0, 7)
          .split("-")
          .map(Number),
        insurance = (await manager.query(
          `SELECT id,employee_id,version FROM hr_employee_insurance_period WHERE tenant_id=$1 AND park_id=$2 AND employee_id=ANY($3::uuid[]) AND period_year=$4 AND period_month=$5 AND is_deleted=false FOR SHARE`,
          [scope.tenantId, scope.parkId, employeeIds, year, month],
        )) as Array<Record<string, unknown>>;
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
            { id: String(i.id), version: String(i.version) },
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
      const frozen = {
        employeeVersions,
        compVersions,
        insuranceVersions,
        formulaVersions,
        reconciliationPolicies,
        attendanceVersions,
        attendanceInputBatchId: dto.attendanceInputBatchId,
        legacyBatchId: dto.legacyBatchId,
        parserVersion: HR_PAYROLL_DSL_PARSER_VERSION,
        engineVersion: HR_PAYROLL_DSL_ENGINE_VERSION,
      };
      const inputHash = createHash("sha256")
        .update(JSON.stringify(frozen))
        .digest("hex");
      const inserted = (await manager.query(
        `INSERT INTO hr_payroll_reconciliation_run(tenant_id,park_id,legacy_batch_id,attendance_input_batch_id,parser_version,engine_version,tolerance_amount,status,frozen_employee_version,frozen_compensation_version,frozen_insurance_version,frozen_formula_version,input_snapshot_hash,supersedes_run_id,employee_count,difference_count,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,'calculating',$8,$9,$10,$11,$12,$13,$14,0,$15,$15) RETURNING id`,
        [
          scope.tenantId,
          scope.parkId,
          dto.legacyBatchId,
          dto.attendanceInputBatchId,
          HR_PAYROLL_DSL_PARSER_VERSION,
          HR_PAYROLL_DSL_ENGINE_VERSION,
          "0.0000",
          JSON.stringify(employeeVersions),
          JSON.stringify(compVersions),
          JSON.stringify(insuranceVersions),
          JSON.stringify({ formulaVersions, reconciliationPolicies }),
          inputHash,
          dto.supersedesRunId ?? null,
          snapshots.length,
          actor.sub,
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
        const oldItems = (await manager.query(
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
        const calculated = new Map<string, string>();
        for (const formula of verified.filter(
          (f) => String(f.book_id) === String(snapshot.book_id),
        )) {
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
            `INSERT INTO hr_payroll_reconciliation_result(tenant_id,park_id,run_id,employee_id,legacy_snapshot_id,employee_version,compensation_version_id,insurance_period_id,attendance_input_item_id,old_total,new_total,delta_total,review_status,create_by,update_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14) RETURNING id`,
            [
              scope.tenantId,
              scope.parkId,
              runId,
              employeeId,
              snapshot.id,
              snapshot.employee_version,
              comp.id,
              insuranceBy.get(employeeId)!.id,
              attendanceInput.id,
              this.scaledToDecimal(oldTotal),
              this.scaledToDecimal(newTotal),
              this.scaledToDecimal(delta),
              resultStatus,
              actor.sub,
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
                insurancePeriodId: insuranceBy.get(employeeId)!.id,
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
            "SELECT d.id FROM hr_payroll_reconciliation_item_difference d JOIN hr_payroll_reconciliation_result r ON r.id=d.result_id AND r.tenant_id=d.tenant_id AND r.park_id=d.park_id WHERE d.id=$1 AND r.run_id=$2 AND d.tenant_id=$3 AND d.park_id=$4 AND d.is_deleted=false FOR SHARE OF d",
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
