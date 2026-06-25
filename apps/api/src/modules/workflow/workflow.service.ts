import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, type EntityManager, type FindOptionsWhere, type Repository } from "typeorm";
import type { QueryDeepPartialEntity } from "typeorm/query-builder/QueryPartialEntity";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { WorkOrderLogEntity } from "../work-orders/entities/work-order-log.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type { WorkflowMessageQueryDto } from "./dto/workflow-message-query.dto";
import { UserMessageEntity } from "./entities/user-message.entity";
import type { WorkflowInboxResponse, WorkflowMessage, WorkflowTodo } from "./workflow.types";

const WORK_ORDER_STATUS_SUBMITTED = "10";
const WORK_ORDER_STATUS_ASSIGNED = "20";
const WORK_ORDER_STATUS_ACCEPTED = "30";
const WORK_ORDER_STATUS_PROCESSING = "40";
const WORK_ORDER_STATUS_WAIT_MATERIAL = "45";
const WORK_ORDER_STATUS_FINISHED = "50";
const WORK_ORDER_STATUS_RETURNED = "91";
const ACTIVE_WORK_ORDER_STATUSES = [
  WORK_ORDER_STATUS_SUBMITTED,
  WORK_ORDER_STATUS_ASSIGNED,
  WORK_ORDER_STATUS_ACCEPTED,
  WORK_ORDER_STATUS_PROCESSING,
  WORK_ORDER_STATUS_WAIT_MATERIAL,
  WORK_ORDER_STATUS_FINISHED,
  WORK_ORDER_STATUS_RETURNED
];
const IN_PROGRESS_WORK_ORDER_STATUSES = [
  WORK_ORDER_STATUS_ASSIGNED,
  WORK_ORDER_STATUS_ACCEPTED,
  WORK_ORDER_STATUS_PROCESSING,
  WORK_ORDER_STATUS_WAIT_MATERIAL,
  WORK_ORDER_STATUS_RETURNED
];
const CUSTOMER_CONFIRM_STATUSES = [WORK_ORDER_STATUS_FINISHED];
const OPEN_INSPECTION_STATUSES = ["10", "20"];
const TAKE_LIMIT = 20;

@Injectable()
export class WorkflowService {
  constructor(
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @InjectRepository(WorkOrderLogEntity)
    private readonly workOrderLogsRepository: Repository<WorkOrderLogEntity>,
    @InjectRepository(SafetyInspectTaskEntity)
    private readonly inspectTasksRepository: Repository<SafetyInspectTaskEntity>,
    @InjectRepository(UserMessageEntity)
    private readonly userMessagesRepository: Repository<UserMessageEntity>
  ) {}

  async inbox(scope: TenantParkScope, actor: JwtPrincipal): Promise<WorkflowInboxResponse> {
    const [triage, assigned, customerConfirm, overdue, inspection] = await Promise.all([
      this.findTriageWorkOrders(scope, actor),
      this.findAssignedWorkOrders(scope, actor),
      this.findCustomerConfirmWorkOrders(scope, actor),
      this.findOverdueWorkOrders(scope, actor),
      this.findInspectionTasks(scope, actor)
    ]);
    const todos = this.dedupeTodos([
      ...triage.map((workOrder) => this.toWorkOrderTodo(workOrder, "work_order_triage", "服务台 / 调度岗", "派单或受理")),
      ...assigned.map((workOrder) => this.toWorkOrderTodo(workOrder, "work_order_assigned", "当前处理人", this.nextWorkOrderAction(workOrder.status))),
      ...customerConfirm.map((workOrder) => this.toWorkOrderTodo(workOrder, "work_order_customer_confirm", "报修人 / 客户联系人", "确认或评价")),
      ...overdue.map((workOrder) => this.toWorkOrderTodo(workOrder, "work_order_overdue", "主管 / 调度岗", "跟进超时")),
      ...inspection.map((task) => this.toInspectionTodo(task))
    ]);
    const messages = await this.findMessages(scope, actor, this.visibleWorkOrderIds([...triage, ...assigned, ...customerConfirm, ...overdue]));
    const unreadMessageCount = await this.countUnreadMessages(scope, actor);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        triageCount: triage.length,
        assignedCount: assigned.length,
        customerConfirmCount: customerConfirm.length,
        inspectionCount: inspection.length,
        overdueCount: overdue.length,
        messageCount: messages.length,
        unreadMessageCount
      },
      todos,
      messages,
      runtime: {
        mode: "read_model",
        writeModel: "工单与巡检仍通过现有状态动作落盘：派单、接单、开始、完成、确认、评价、关闭。",
        informationFlow: [
          "客户/业主提交服务请求后进入服务台待派单。",
          "调度岗派给物业、工程、信息化或安防处理人。",
          "处理人接单、到场处理、补充日志和附件，完成后交给报修人确认。",
          "巡检任务由责任人执行，异常进入隐患或工单后继续流转。",
          "各角色在流程收件箱看到自己的待办、最近反馈和超时提醒。"
        ]
      }
    };
  }

  async listMessages(scope: TenantParkScope, actor: JwtPrincipal, query: WorkflowMessageQueryDto): Promise<PaginatedResult<UserMessageEntity>> {
    const where: FindOptionsWhere<UserMessageEntity> = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      recipientId: actor.sub,
      archivedAt: IsNull(),
      isDeleted: false
    };
    if (query.read_status === "read") {
      where.readAt = Not(IsNull());
    } else if (query.read_status === "unread") {
      where.readAt = IsNull();
    }
    if (query.category) {
      where.category = query.category;
    }
    const [items, total] = await this.userMessagesRepository.findAndCount({
      where,
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async markMessageRead(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<UserMessageEntity> {
    const entity = await this.userMessagesRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        isDeleted: false
      }
    });
    if (!entity) {
      throw new NotFoundException("Message not found");
    }
    if (!entity.readAt) {
      entity.readAt = new Date();
      entity.updateBy = actor.sub;
      await this.userMessagesRepository.save(entity);
    }
    return entity;
  }

  async markAllMessagesRead(scope: TenantParkScope, actor: JwtPrincipal): Promise<{ updated: number }> {
    const result = await this.userMessagesRepository.update(
      {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        archivedAt: IsNull(),
        readAt: IsNull(),
        isDeleted: false
      },
      {
        readAt: new Date(),
        updateBy: actor.sub
      }
    );
    return { updated: result.affected ?? 0 };
  }

  async publishWorkOrderLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    workOrder: WorkOrderEntity,
    log: WorkOrderLogEntity,
    manager?: EntityManager
  ): Promise<void> {
    const recipients = await this.resolveWorkOrderMessageRecipients(scope, actor, workOrder, log.action, manager);
    if (recipients.length === 0) {
      return;
    }
    const repository = manager?.getRepository(UserMessageEntity) ?? this.userMessagesRepository;
    const values = recipients.map((recipientId) => repository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      recipientId,
      recipientName: null,
      senderId: actor.sub,
      senderName: this.actorName(actor),
      category: "work_order",
      priority: this.messagePriority(workOrder, log.action),
      sourceType: "work_order",
      sourceId: workOrder.id,
      bizType: "work_order",
      bizId: workOrder.id,
      action: log.action,
      title: this.messageTitle(workOrder, log.action),
      content: log.content ?? `${workOrder.woCode} 有新的处理动态`,
      targetUrl: `/workorders/${workOrder.id}`,
      uniqueKey: `work_order:${workOrder.id}:${log.id}:${recipientId}`,
      payload: {
        woCode: workOrder.woCode,
        workOrderTitle: workOrder.title,
        beforeStatus: log.beforeStatus,
        afterStatus: log.afterStatus,
        operatorName: log.operatorName,
        sourceType: workOrder.sourceType
      },
      createBy: actor.sub,
      updateBy: actor.sub
    }));
    if (values.length === 0) {
      return;
    }
    await repository
      .createQueryBuilder()
      .insert()
      .into(UserMessageEntity)
      .values(values as QueryDeepPartialEntity<UserMessageEntity>[])
      .orIgnore()
      .execute();
  }

  private async findTriageWorkOrders(scope: TenantParkScope, actor: JwtPrincipal): Promise<WorkOrderEntity[]> {
    if (!this.canAssignWorkOrders(actor)) {
      return [];
    }
    return this.workOrdersRepository.find({
      where: {
        ...this.scopeWhere(scope),
        status: WORK_ORDER_STATUS_SUBMITTED,
        assigneeId: IsNull()
      },
      order: { createTime: "DESC" },
      take: TAKE_LIMIT
    });
  }

  private async findAssignedWorkOrders(scope: TenantParkScope, actor: JwtPrincipal): Promise<WorkOrderEntity[]> {
    return this.workOrdersRepository.find({
      where: {
        ...this.scopeWhere(scope),
        status: In(IN_PROGRESS_WORK_ORDER_STATUSES),
        assigneeId: actor.sub
      },
      order: { updateTime: "DESC" },
      take: TAKE_LIMIT
    });
  }

  private async findCustomerConfirmWorkOrders(scope: TenantParkScope, actor: JwtPrincipal): Promise<WorkOrderEntity[]> {
    const where: FindOptionsWhere<WorkOrderEntity>[] = [
      {
        ...this.scopeWhere(scope),
        status: In(CUSTOMER_CONFIRM_STATUSES),
        reporterId: actor.sub
      },
      {
        ...this.scopeWhere(scope),
        status: In(CUSTOMER_CONFIRM_STATUSES),
        createBy: actor.sub
      }
    ];
    if (actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_CONFIRM) || actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_EVALUATE)) {
      where.push({ ...this.scopeWhere(scope), status: In(CUSTOMER_CONFIRM_STATUSES) });
    }
    return this.workOrdersRepository.find({
      where,
      order: { finishTime: "DESC", updateTime: "DESC" },
      take: TAKE_LIMIT
    });
  }

  private async findOverdueWorkOrders(scope: TenantParkScope, actor: JwtPrincipal): Promise<WorkOrderEntity[]> {
    if (!this.canAssignWorkOrders(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_OVERDUE)) {
      return [];
    }
    return this.workOrdersRepository.find({
      where: {
        ...this.scopeWhere(scope),
        status: In(ACTIVE_WORK_ORDER_STATUSES),
        overdueFlag: true
      },
      order: { updateTime: "DESC" },
      take: TAKE_LIMIT
    });
  }

  private async findInspectionTasks(scope: TenantParkScope, actor: JwtPrincipal): Promise<SafetyInspectTaskEntity[]> {
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MY) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_READ)) {
      return [];
    }
    const where: FindOptionsWhere<SafetyInspectTaskEntity> = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      status: In(OPEN_INSPECTION_STATUSES)
    };
    if (!actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MANAGE_ALL)) {
      where.handlerId = actor.sub;
    }
    return this.inspectTasksRepository.find({
      where,
      relations: { point: true, template: true },
      order: { dueTime: "ASC", planTime: "ASC" },
      take: TAKE_LIMIT
    });
  }

  private async findMessages(scope: TenantParkScope, actor: JwtPrincipal, workOrderIds: string[]): Promise<WorkflowMessage[]> {
    const persisted = await this.userMessagesRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        archivedAt: IsNull(),
        isDeleted: false
      },
      order: { createTime: "DESC" },
      take: 30
    });
    const persistedMessages = persisted.map((message) => this.toWorkflowMessage(message));
    const logMessages = workOrderIds.length === 0 ? [] : await this.findLogMessages(scope, workOrderIds);
    return [...persistedMessages, ...logMessages]
      .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))
      .slice(0, 30);
  }

  private async findLogMessages(scope: TenantParkScope, workOrderIds: string[]): Promise<WorkflowMessage[]> {
    const logs = await this.workOrderLogsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        workOrderId: In(workOrderIds)
      },
      relations: { workOrder: true },
      order: { opTime: "DESC", createTime: "DESC" },
      take: 20
    });
    return logs.map((log) => ({
      id: log.id,
      sourceType: "work_order",
      sourceId: log.workOrderId,
      title: log.workOrder?.title ?? "工单动态",
      content: log.content ?? log.reason ?? `${this.actionLabel(log.action)}：${this.statusLabel(log.beforeStatus)} → ${this.statusLabel(log.afterStatus)}`,
      actorName: log.operatorName ?? "系统",
      action: this.actionLabel(log.action),
      href: `/workorders/${log.workOrderId}`,
      occurredAt: log.opTime.toISOString()
    }));
  }

  private toWorkflowMessage(message: UserMessageEntity): WorkflowMessage {
    return {
      id: message.id,
      messageId: message.id,
      sourceType: message.sourceType === "inspection_task" ? "inspection_task" : "work_order",
      sourceId: message.sourceId ?? message.bizId ?? message.id,
      title: message.title,
      content: message.content ?? "",
      actorName: message.senderName ?? "系统",
      action: this.actionLabel(message.action),
      category: message.category,
      priority: message.priority,
      readAt: message.readAt?.toISOString() ?? null,
      href: message.targetUrl ?? "/workflow/inbox",
      occurredAt: message.createTime.toISOString()
    };
  }

  private async countUnreadMessages(scope: TenantParkScope, actor: JwtPrincipal): Promise<number> {
    return this.userMessagesRepository.count({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        recipientId: actor.sub,
        archivedAt: IsNull(),
        readAt: IsNull(),
        isDeleted: false
      }
    });
  }

  private toWorkOrderTodo(workOrder: WorkOrderEntity, kind: WorkflowTodo["kind"], ownerRole: string, actionLabel: string): WorkflowTodo {
    return {
      id: `${kind}:${workOrder.id}`,
      kind,
      sourceType: "work_order",
      sourceId: workOrder.id,
      title: workOrder.title,
      subtitle: `${workOrder.woCode} · ${this.statusLabel(workOrder.status)} · ${workOrder.location ?? workOrder.roomLabel ?? "未填位置"}`,
      status: this.statusLabel(workOrder.status),
      priority: workOrder.overdueFlag ? "urgent" : this.priorityLevel(workOrder.priority),
      ownerRole,
      actionLabel,
      href: `/workorders/${workOrder.id}`,
      createdAt: workOrder.createTime.toISOString(),
      dueAt: workOrder.finishTime?.toISOString() ?? null
    };
  }

  private toInspectionTodo(task: SafetyInspectTaskEntity): WorkflowTodo {
    return {
      id: `inspection_task:${task.id}`,
      kind: "inspection_task",
      sourceType: "inspection_task",
      sourceId: task.id,
      title: task.point?.pointName ? `巡检：${task.point.pointName}` : `巡检任务 ${task.taskCode}`,
      subtitle: `${task.taskCode} · ${task.template?.templateName ?? "巡检模板"} · ${this.inspectStatusLabel(task.status)}`,
      status: this.inspectStatusLabel(task.status),
      priority: new Date(task.dueTime).getTime() < Date.now() ? "urgent" : "normal",
      ownerRole: "巡检责任人",
      actionLabel: task.status === "10" ? "开始巡检" : "继续巡检",
      href: `/safety/my-inspect-tasks?taskId=${task.id}`,
      createdAt: task.createTime.toISOString(),
      dueAt: task.dueTime.toISOString()
    };
  }

  private scopeWhere(scope: TenantParkScope): Pick<WorkOrderEntity, "tenantId" | "parkId" | "isDeleted"> {
    return {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false
    };
  }

  private canAssignWorkOrders(actor: JwtPrincipal): boolean {
    return actor.isSuper === true ||
      actor.permissions.includes("*") ||
      actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_ASSIGN) ||
      actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
  }

  private async resolveWorkOrderMessageRecipients(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    workOrder: WorkOrderEntity,
    action: string,
    manager?: EntityManager
  ): Promise<string[]> {
    const recipients = new Set<string>();
    const add = (value?: string | null) => {
      if (value) recipients.add(value);
    };

    if (action === "create" && !workOrder.assigneeId) {
      for (const userId of await this.findUserIdsWithPermissions(scope, [SYSTEM_PERMISSIONS.WORKORDER_ASSIGN, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL], manager)) {
        add(userId);
      }
    }

    if (["assign", "reassign"].includes(action)) {
      add(workOrder.assigneeId);
    } else if (["accept", "start", "wait_material", "resume", "overdue", "overdue_clear"].includes(action)) {
      add(workOrder.reporterId);
      add(workOrder.createBy);
      add(workOrder.assignerId);
      if (action.startsWith("overdue")) {
        add(workOrder.assigneeId);
        for (const userId of await this.findUserIdsWithPermissions(scope, [SYSTEM_PERMISSIONS.WORKORDER_ASSIGN, SYSTEM_PERMISSIONS.WORKORDER_OVERDUE, SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL], manager)) {
          add(userId);
        }
      }
    } else if (["finish"].includes(action)) {
      add(workOrder.reporterId);
      add(workOrder.createBy);
      add(workOrder.assignerId);
      for (const userId of await this.findUserIdsWithPermissions(scope, [SYSTEM_PERMISSIONS.WORKORDER_CONFIRM, SYSTEM_PERMISSIONS.WORKORDER_EVALUATE], manager)) {
        add(userId);
      }
    } else if (["confirm", "evaluate", "close", "cancel", "return", "reject"].includes(action)) {
      add(workOrder.assigneeId);
      add(workOrder.assignerId);
      add(workOrder.reporterId);
      add(workOrder.createBy);
    } else {
      add(workOrder.assigneeId);
      add(workOrder.reporterId);
      add(workOrder.createBy);
    }

    recipients.delete(actor.sub);
    return [...recipients];
  }

  private async findUserIdsWithPermissions(scope: TenantParkScope, permissions: string[], manager?: EntityManager): Promise<string[]> {
    if (permissions.length === 0) {
      return [];
    }
    const queryRunner = manager ?? this.userMessagesRepository.manager;
    const rows = await queryRunner.query(
      `
      SELECT DISTINCT u.id::text AS id
      FROM sys_user u
      JOIN rel_user_role ur
        ON ur.user_id = u.id
       AND ur.tenant_id::text = u.tenant_id::text
       AND ur.park_id::text = u.park_id::text
       AND ur.is_deleted = false
      JOIN sys_role r
        ON r.id = ur.role_id
       AND r.tenant_id::text = u.tenant_id::text
       AND r.park_id::text = u.park_id::text
       AND r.is_deleted = false
      LEFT JOIN rel_role_perm rp
        ON rp.role_id = r.id
       AND rp.tenant_id::text = u.tenant_id::text
       AND rp.park_id::text = u.park_id::text
       AND rp.is_deleted = false
      LEFT JOIN sys_permission p
        ON p.id = rp.permission_id
       AND p.tenant_id::text = u.tenant_id::text
       AND p.park_id::text = u.park_id::text
       AND p.is_deleted = false
      WHERE u.tenant_id::text = $1
        AND u.park_id::text = $2
        AND u.is_deleted = false
        AND COALESCE(u.status, 'enabled') = 'enabled'
        AND COALESCE(u.is_enabled, true) = true
        AND COALESCE(r.status, 'enabled') = 'enabled'
        AND COALESCE(r.is_enabled, true) = true
        AND (r.is_super = true OR p.code = ANY($3::text[]))
      `,
      [scope.tenantId, scope.parkId, permissions]
    ) as Array<{ id: string }>;
    return rows.map((row) => row.id);
  }

  private messageTitle(workOrder: WorkOrderEntity, action: string): string {
    return `${this.actionLabel(action)}：${workOrder.title}`;
  }

  private messagePriority(workOrder: WorkOrderEntity, action: string): string {
    if (workOrder.overdueFlag || ["overdue", "return", "reject"].includes(action)) {
      return "urgent";
    }
    if (["assign", "finish", "cancel"].includes(action)) {
      return "important";
    }
    return "normal";
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }

  private visibleWorkOrderIds(workOrders: WorkOrderEntity[]): string[] {
    return [...new Set(workOrders.map((item) => item.id).filter(Boolean))];
  }

  private dedupeTodos(todos: WorkflowTodo[]): WorkflowTodo[] {
    const seen = new Set<string>();
    return todos.filter((todo) => {
      const key = `${todo.kind}:${todo.sourceId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).sort((a, b) => this.todoWeight(b) - this.todoWeight(a) || (Date.parse(b.createdAt) - Date.parse(a.createdAt)));
  }

  private todoWeight(todo: WorkflowTodo): number {
    if (todo.priority === "urgent") return 3;
    if (todo.priority === "important") return 2;
    return 1;
  }

  private nextWorkOrderAction(status: string): string {
    switch (status) {
      case WORK_ORDER_STATUS_ASSIGNED:
        return "接单";
      case WORK_ORDER_STATUS_ACCEPTED:
        return "开始处理";
      case WORK_ORDER_STATUS_PROCESSING:
      case WORK_ORDER_STATUS_WAIT_MATERIAL:
        return "补充处理 / 完成";
      case WORK_ORDER_STATUS_RETURNED:
        return "重新处理";
      default:
        return "查看处理";
    }
  }

  private priorityLevel(priority?: string | null): WorkflowTodo["priority"] {
    if (priority === "urgent" || priority === "high") return "urgent";
    if (priority === "medium") return "important";
    return "normal";
  }

  private statusLabel(status?: string | null): string {
    const labels: Record<string, string> = {
      "10": "已提交",
      "20": "已派单",
      "30": "已接单",
      "40": "处理中",
      "45": "待物料",
      "50": "待确认",
      "60": "已确认",
      "70": "已评价",
      "90": "已取消",
      "91": "已退回",
      "100": "已关闭"
    };
    return status ? labels[status] ?? status : "-";
  }

  private inspectStatusLabel(status?: string | null): string {
    const labels: Record<string, string> = {
      "10": "待执行",
      "20": "执行中",
      "30": "已完成",
      "40": "异常"
    };
    return status ? labels[status] ?? status : "-";
  }

  private actionLabel(action?: string | null): string {
    const labels: Record<string, string> = {
      create: "创建",
      update: "更新",
      assign: "派单",
      reassign: "改派",
      accept: "接单",
      start: "开始处理",
      wait_material: "待物料",
      resume: "继续处理",
      finish: "完成处理",
      confirm: "确认完成",
      evaluate: "评价",
      close: "关闭",
      cancel: "取消",
      return: "退回",
      reject: "驳回",
      overdue: "超时提醒",
      overdue_clear: "超时解除",
      comment: "补充记录"
    };
    return action ? labels[action] ?? action : "动态";
  }
}
