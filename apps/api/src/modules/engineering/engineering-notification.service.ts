import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { UserMessageEntity } from "../workflow/entities/user-message.entity";

interface EngineeringNotificationEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  parkId: string;
  projectId: string;
  entityId: string;
  actorUserId?: string | null;
  payload: Record<string, unknown>;
}

@Injectable()
export class EngineeringNotificationService {
  constructor(
    @InjectRepository(UserMessageEntity)
    private readonly userMessagesRepository: Repository<UserMessageEntity>
  ) {}

  async publishFromEvent(event: EngineeringNotificationEvent): Promise<{ recipients: number }> {
    const recipients = this.extractRecipients(event.payload.notificationRecipients);
    if (recipients.length === 0) {
      return { recipients: 0 };
    }

    const values = recipients.map((recipientId) =>
      this.userMessagesRepository.create({
        tenantId: event.tenantId,
        parkId: event.parkId,
        recipientId,
        recipientName: null,
        senderId: event.actorUserId ?? null,
        senderName: "工程 Runtime",
        category: "engineering",
        priority: this.priority(event),
        sourceType: "engineering",
        sourceId: event.entityId,
        bizType: this.bizType(event.eventType),
        bizId: event.entityId,
        action: event.eventType,
        title: this.title(event),
        content: this.content(event),
        targetUrl: this.targetUrl(event),
        uniqueKey: `engineering:${event.eventId}:${recipientId}`,
        payload: {
          eventType: event.eventType,
          projectId: event.projectId,
          entityId: event.entityId,
          ...event.payload
        },
        createBy: event.actorUserId ?? "system",
        updateBy: event.actorUserId ?? "system"
      })
    );

    await this.userMessagesRepository
      .createQueryBuilder()
      .insert()
      .into(UserMessageEntity)
      .values(values as QueryDeepPartialEntity<UserMessageEntity>[])
      .orIgnore()
      .execute();
    return { recipients: recipients.length };
  }

  private extractRecipients(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0))];
  }

  private title(event: EngineeringNotificationEvent): string {
    if (typeof event.payload.notificationTitle === "string" && event.payload.notificationTitle.trim()) {
      return event.payload.notificationTitle.trim();
    }
    const titles: Record<string, string> = {
      EngineeringProjectStatusChangedEvent: "工程项目状态更新",
      EngineeringPlanCreatedEvent: "工程计划已创建",
      EngineeringIssueCreatedEvent: "工程问题待处理",
      EngineeringRectificationCreatedEvent: "整改任务待处理",
      EngineeringRectificationOverdueEvent: "整改任务已逾期",
      EngineeringAcceptanceCreatedEvent: "工程验收待处理",
      EngineeringAcceptanceSubmittedEvent: "工程验收待处理",
      EngineeringAcceptanceFailedEvent: "工程验收未通过",
      EngineeringAcceptanceRectificationRequiredEvent: "工程验收需整改"
    };
    return titles[event.eventType] ?? "工程业务通知";
  }

  private content(event: EngineeringNotificationEvent): string {
    if (typeof event.payload.notificationContent === "string" && event.payload.notificationContent.trim()) {
      return event.payload.notificationContent.trim();
    }
    const code = this.firstText(event.payload.projectCode, event.payload.planCode, event.payload.issueCode, event.payload.rectificationCode, event.payload.acceptanceCode);
    return code ? `${code} 有新的工程业务动态` : "你有一条新的工程业务待处理消息";
  }

  private priority(event: EngineeringNotificationEvent): string {
    if (typeof event.payload.notificationPriority === "string" && event.payload.notificationPriority.trim()) {
      return event.payload.notificationPriority.trim();
    }
    if (event.eventType.includes("Overdue") || event.eventType.includes("Failed") || event.eventType.includes("RectificationRequired")) {
      return "urgent";
    }
    if (event.eventType.includes("Issue") || event.eventType.includes("Rectification")) {
      return "high";
    }
    return "normal";
  }

  private targetUrl(event: EngineeringNotificationEvent): string {
    if (typeof event.payload.notificationTargetUrl === "string" && event.payload.notificationTargetUrl.trim()) {
      return event.payload.notificationTargetUrl.trim();
    }
    if (event.eventType.includes("Plan")) return `/engineering/plans/${event.entityId}`;
    if (event.eventType.includes("Issue")) return `/engineering/inspections?issueId=${event.entityId}`;
    if (event.eventType.includes("Rectification")) return `/engineering/rectifications/${event.entityId}`;
    if (event.eventType.includes("Acceptance")) return `/engineering/acceptances/${event.entityId}`;
    return `/engineering/projects/${event.projectId}`;
  }

  private bizType(eventType: string): string {
    if (eventType.includes("Plan")) return "engineering_plan";
    if (eventType.includes("Issue")) return "engineering_issue";
    if (eventType.includes("Rectification")) return "engineering_rectification";
    if (eventType.includes("Acceptance")) return "engineering_acceptance";
    return "engineering_project";
  }

  private firstText(...values: unknown[]): string | null {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
