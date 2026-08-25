import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager, Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { HrAttendanceRequestEntity,HrEmployeeEntity, HrWorkReportEntity } from "./entities/hr.entities";

@Injectable()
export class HrNotificationService {
  constructor(
    @InjectRepository(UserMessageEntity)
    private readonly messages: Repository<UserMessageEntity>
  ) {}

  async publishWorkReportSubmitted(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    report: HrWorkReportEntity,
    manager: EntityManager
  ): Promise<void> {
    if (!report.reviewerEmployeeId) return;
    const reviewer = await manager.getRepository(HrEmployeeEntity).findOne({where:{id:report.reviewerEmployeeId,...scope,isDeleted:false}});
    if (!reviewer?.userId || reviewer.userId === actor.sub) return;
    await this.publish(manager, {
      scope,
      actor,
      recipientId: reviewer.userId,
      sourceId:report.id,sourceType:"hr_work_report",bizType:"hr_work_report",targetUrl:"/hr/work-reports",
      action: "review",
      title: `待审核${this.reportTypeLabel(report.reportType)}`,
      content: `${report.periodStart} 至 ${report.periodEnd} 的工作汇报已提交，请审核或退回补充。`,payload:{reportType:report.reportType,periodStart:report.periodStart,periodEnd:report.periodEnd,status:report.status},
      uniqueKey: `hr:work-report:${report.id}:${report.status}:${report.submissionNo}:${reviewer.userId}`
    });
  }

  async publishWorkReportReviewed(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    report: HrWorkReportEntity,
    manager: EntityManager
  ): Promise<void> {
    const employee = await manager.getRepository(HrEmployeeEntity).findOne({where:{id:report.employeeId,...scope,isDeleted:false}});
    if (!employee?.userId || employee.userId === actor.sub) return;
    const returned = report.status === "returned";
    await this.publish(manager, {
      scope,
      actor,
      recipientId: employee.userId,
      sourceId:report.id,sourceType:"hr_work_report",bizType:"hr_work_report",targetUrl:"/hr/work-reports",
      action: returned ? "supplement" : "confirmed",
      title: returned ? `${this.reportTypeLabel(report.reportType)}需补充` : `${this.reportTypeLabel(report.reportType)}已确认`,
      content: returned ? "负责人已退回，请进入工作汇报查看意见并补充。" : "负责人已确认本期工作汇报。",payload:{reportType:report.reportType,periodStart:report.periodStart,periodEnd:report.periodEnd,status:report.status},
      uniqueKey: `hr:work-report:${report.id}:${report.status}:${report.submissionNo}:${employee.userId}`
    });
  }

  async publishAttendanceRequestSubmitted(scope:TenantParkScope,actor:JwtPrincipal,request:HrAttendanceRequestEntity,manager:EntityManager):Promise<void>{
    const employee=await manager.getRepository(HrEmployeeEntity).findOne({where:{id:request.employeeId,...scope,isDeleted:false}});
    if(!employee?.managerEmployeeId)return;
    const reviewer=await manager.getRepository(HrEmployeeEntity).findOne({where:{id:employee.managerEmployeeId,...scope,isDeleted:false}});
    if(!reviewer?.userId||reviewer.userId===actor.sub)return;
    await this.publish(manager,{scope,actor,recipientId:reviewer.userId,sourceId:request.id,sourceType:"hr_attendance_request",bizType:"hr_attendance_request",targetUrl:"/hr/attendance",action:"review",title:`待审批${this.attendanceTypeLabel(request.requestType)}`,content:"员工已提交考勤申请，请在考勤工作台审核。",payload:{requestType:request.requestType,status:request.status},uniqueKey:`hr:attendance-request:${request.id}:submitted:${reviewer.userId}`});
  }

  async publishAttendanceRequestReviewed(scope:TenantParkScope,actor:JwtPrincipal,request:HrAttendanceRequestEntity,manager:EntityManager):Promise<void>{
    const employee=await manager.getRepository(HrEmployeeEntity).findOne({where:{id:request.employeeId,...scope,isDeleted:false}});
    if(!employee?.userId||employee.userId===actor.sub)return;
    const returned=request.status==="returned";
    await this.publish(manager,{scope,actor,recipientId:employee.userId,sourceId:request.id,sourceType:"hr_attendance_request",bizType:"hr_attendance_request",targetUrl:"/hr/attendance",action:returned?"supplement":"approved",title:returned?`${this.attendanceTypeLabel(request.requestType)}申请已退回`:`${this.attendanceTypeLabel(request.requestType)}申请已批准`,content:returned?"考勤申请已退回，请确认审批意见后重新提交。":"考勤申请已批准。",payload:{requestType:request.requestType,status:request.status},uniqueKey:`hr:attendance-request:${request.id}:${request.status}:${employee.userId}`});
  }

  async publishFeedback360Task(scope:TenantParkScope,actor:JwtPrincipal,input:{assignmentId:string;reviewerUserId:string},manager:EntityManager):Promise<void>{
    if(input.reviewerUserId===actor.sub)return;
    await this.publish(manager,{scope,actor,recipientId:input.reviewerUserId,sourceId:input.assignmentId,sourceType:"hr_feedback360_assignment",bizType:"hr_feedback360_assignment",targetUrl:"/hr/feedback-360",action:"respond",title:"待完成360评价",content:"您有一项360评价任务，请在截止日前完成。",payload:{status:"pending"},uniqueKey:`hr:feedback360:${input.assignmentId}:pending:${input.reviewerUserId}`});
  }

  async publishFeedback360Result(scope:TenantParkScope,actor:JwtPrincipal,input:{subjectId:string;subjectUserId:string},manager:EntityManager):Promise<void>{
    if(input.subjectUserId===actor.sub)return;
    await this.publish(manager,{scope,actor,recipientId:input.subjectUserId,sourceId:input.subjectId,sourceType:"hr_feedback360_subject",bizType:"hr_feedback360_subject",targetUrl:"/hr/feedback-360",action:"result",title:"360评价结果已发布",content:"您的360评价匿名聚合结果已发布。",payload:{status:"published"},uniqueKey:`hr:feedback360:${input.subjectId}:published:${input.subjectUserId}`});
  }

  async publishDevelopmentAction(scope:TenantParkScope,actor:JwtPrincipal,input:{actionId:string;ownerEmployeeId:string},manager:EntityManager):Promise<void>{
    const owner=await manager.getRepository(HrEmployeeEntity).findOne({where:{id:input.ownerEmployeeId,...scope,isDeleted:false}});
    if(!owner?.userId||owner.userId===actor.sub)return;
    await this.publish(manager,{scope,actor,recipientId:owner.userId,sourceId:input.actionId,sourceType:"hr_development_action",bizType:"hr_development_action",targetUrl:"/hr/talent",action:"develop",title:"待完成发展行动",content:"您有一项个人发展行动，请在截止日前完成并提交证据。",payload:{status:"pending"},uniqueKey:`hr:development:${input.actionId}:pending:${owner.userId}`});
  }

  private async publish(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      actor: JwtPrincipal;
      recipientId: string;
      sourceId:string;sourceType:string;bizType:string;targetUrl:string;payload:Record<string,unknown>;
      action: string;
      title: string;
      content: string;
      uniqueKey: string;
    }
  ): Promise<void> {
    const repository=manager.getRepository(UserMessageEntity);const entity=repository.create({...input.scope,recipientId:input.recipientId,recipientName:null,senderId:input.actor.sub,senderName:"人力资源管理",category:"hr",priority:input.action==="supplement"?"high":"normal",sourceType:input.sourceType,sourceId:input.sourceId,bizType:input.bizType,bizId:input.sourceId,action:input.action,title:input.title,content:input.content,targetUrl:input.targetUrl,readAt:null,archivedAt:null,uniqueKey:input.uniqueKey,payload:input.payload,createBy:input.actor.sub,updateBy:input.actor.sub});
    await repository.createQueryBuilder().insert().into(UserMessageEntity).values(entity as QueryDeepPartialEntity<UserMessageEntity>).orIgnore().execute();
  }

  private reportTypeLabel(reportType: string): string {
    return { daily: "日报", weekly: "周报", monthly: "月报" }[reportType] ?? "工作汇报";
  }
  private attendanceTypeLabel(type:string):string{return {leave:"请假",overtime:"加班",business_trip:"出差",correction:"考勤更正"}[type]??"考勤";}
}
