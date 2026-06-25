import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, type FindOptionsWhere, type Repository } from "typeorm";
import { SYSTEM_PERMISSIONS, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { SafetyInspectTaskEntity } from "../safety-inspect-tasks/entities/safety-inspect-task.entity";
import { WorkOrderLogEntity } from "../work-orders/entities/work-order-log.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
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
    private readonly inspectTasksRepository: Repository<SafetyInspectTaskEntity>
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
    const messages = await this.findMessages(scope, this.visibleWorkOrderIds([...triage, ...assigned, ...customerConfirm, ...overdue]));

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        triageCount: triage.length,
        assignedCount: assigned.length,
        customerConfirmCount: customerConfirm.length,
        inspectionCount: inspection.length,
        overdueCount: overdue.length,
        messageCount: messages.length
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

  private async findMessages(scope: TenantParkScope, workOrderIds: string[]): Promise<WorkflowMessage[]> {
    if (workOrderIds.length === 0) {
      return [];
    }
    const logs = await this.workOrderLogsRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        workOrderId: In(workOrderIds)
      },
      relations: { workOrder: true },
      order: { opTime: "DESC", createTime: "DESC" },
      take: 30
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
      assign: "派单",
      reassign: "改派",
      accept: "接单",
      start: "开始处理",
      wait_material: "待物料",
      finish: "完成处理",
      confirm: "确认完成",
      evaluate: "评价",
      close: "关闭",
      cancel: "取消",
      return: "退回",
      reject: "驳回",
      comment: "补充记录"
    };
    return action ? labels[action] ?? action : "动态";
  }
}
