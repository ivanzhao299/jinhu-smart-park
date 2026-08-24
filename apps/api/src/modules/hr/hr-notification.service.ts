import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { EntityManager, Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";
import { HrEmployeeEntity, HrWorkReportEntity } from "./entities/hr.entities";

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
    const reviewer = await manager.getRepository(HrEmployeeEntity).findOne({
      where: { id: report.reviewerEmployeeId, ...scope, isDeleted: false }
    });
    if (!reviewer?.userId || reviewer.userId === actor.sub) return;
    await this.publish(manager, {
      scope,
      actor,
      recipientId: reviewer.userId,
      report,
      action: "review",
      title: `待审核${this.reportTypeLabel(report.reportType)}`,
      content: `${report.periodStart} 至 ${report.periodEnd} 的工作汇报已提交，请审核或退回补充。`,
      uniqueKey: `hr:work-report:${report.id}:submitted:${reviewer.userId}`
    });
  }

  async publishWorkReportReviewed(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    report: HrWorkReportEntity,
    manager: EntityManager
  ): Promise<void> {
    const employee = await manager.getRepository(HrEmployeeEntity).findOne({
      where: { id: report.employeeId, ...scope, isDeleted: false }
    });
    if (!employee?.userId || employee.userId === actor.sub) return;
    const returned = report.status === "returned";
    await this.publish(manager, {
      scope,
      actor,
      recipientId: employee.userId,
      report,
      action: returned ? "supplement" : "confirmed",
      title: returned ? `${this.reportTypeLabel(report.reportType)}需补充` : `${this.reportTypeLabel(report.reportType)}已确认`,
      content: report.reviewComment ?? (returned ? "负责人已退回，请补充后重新提交。" : "负责人已确认本期工作汇报。"),
      uniqueKey: `hr:work-report:${report.id}:${report.status}:${employee.userId}`
    });
  }

  private async publish(
    manager: EntityManager,
    input: {
      scope: TenantParkScope;
      actor: JwtPrincipal;
      recipientId: string;
      report: HrWorkReportEntity;
      action: string;
      title: string;
      content: string;
      uniqueKey: string;
    }
  ): Promise<void> {
    const repository = manager.getRepository(UserMessageEntity);
    const entity = repository.create({
      ...input.scope,
      recipientId: input.recipientId,
      recipientName: null,
      senderId: input.actor.sub,
      senderName: "人力资源管理",
      category: "hr",
      priority: input.action === "supplement" ? "high" : "normal",
      sourceType: "hr_work_report",
      sourceId: input.report.id,
      bizType: "hr_work_report",
      bizId: input.report.id,
      action: input.action,
      title: input.title,
      content: input.content,
      targetUrl: "/hr/work-reports",
      readAt: null,
      archivedAt: null,
      uniqueKey: input.uniqueKey,
      payload: {
        reportType: input.report.reportType,
        periodStart: input.report.periodStart,
        periodEnd: input.report.periodEnd,
        status: input.report.status
      },
      createBy: input.actor.sub,
      updateBy: input.actor.sub
    });
    await repository
      .createQueryBuilder()
      .insert()
      .into(UserMessageEntity)
      .values(entity as QueryDeepPartialEntity<UserMessageEntity>)
      .orIgnore()
      .execute();
  }

  private reportTypeLabel(reportType: string): string {
    return { daily: "日报", weekly: "周报", monthly: "月报" }[reportType] ?? "工作汇报";
  }
}
