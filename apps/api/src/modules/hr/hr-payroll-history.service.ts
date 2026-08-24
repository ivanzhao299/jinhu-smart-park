import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { HR_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { DataSource, type ObjectLiteral, type SelectQueryBuilder } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuditService } from "../audit/audit.service";
import type { HrPayrollCatalogQueryDto, HrPayrollHistoryQueryDto, HrPayrollReviewActionDto } from "./dto/hr-payroll-history.dto";
import { HrPayrollReviewActionEntity, HrPayrollReviewCaseEntity } from "./entities/hr.entities";
import { resolveHrPayrollHistoryAccessScope, type HrPayrollHistoryAccessScope } from "./hr-access-policy";
import { recordHrSensitiveRead, type HrSensitiveReadAuditDetails } from "./hr-sensitive-read-audit";

type HistoryAccess=HrPayrollHistoryAccessScope;
type RawRow=Record<string,unknown>;

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

  async listCatalogItems(scope:TenantParkScope,actor:JwtPrincipal,q:HrPayrollCatalogQueryDto) {
    this.requireRuleRead(actor);
    const qb=this.dataSource.createQueryBuilder().from("hr_payroll_item_version","version")
      .innerJoin("hr_payroll_item_definition","definition","definition.id=version.item_definition_id AND definition.tenant_id=version.tenant_id AND definition.park_id=version.park_id")
      .innerJoin("hr_payroll_book","book","book.id=definition.book_id AND book.tenant_id=definition.tenant_id AND book.park_id=definition.park_id")
      .where("version.tenant_id=:tenantId AND version.park_id=:parkId AND version.is_deleted=false AND definition.is_deleted=false AND book.is_deleted=false",scope)
      .select("version.id","id").addSelect("book.id","bookId").addSelect("definition.item_code","itemCode")
      .addSelect("version.display_name","displayName").addSelect("version.value_type","valueType").addSelect("version.item_category","itemCategory")
      .addSelect("version.decimal_scale","decimalScale").addSelect("version.sort_no","sortNo").addSelect("version.taxable","taxable")
      .addSelect("version.print_enabled","printEnabled").addSelect("version.enabled","enabled");
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
      .addSelect("version.print_enabled","printEnabled").addSelect("version.enabled","enabled").getRawOne<RawRow>();
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
