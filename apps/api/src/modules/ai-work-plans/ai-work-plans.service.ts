import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import { randomBytes } from "node:crypto";
import { ILike, type FindOptionsWhere, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { OrgEntity } from "../orgs/entities/org.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { WorkflowService } from "../workflow/workflow.service";
import { LocalNaturalLanguageWorkPlanner } from "./ai-work-plan-parser";
import { scoreWorkforceCandidates, shouldAutoSelect } from "./assignment-scoring";
import type { AiWorkPlanStatus, ScoredWorkforceCandidate } from "./domain/ai-work-plan.types";
import type {
  AiWorkPlanQueryDto,
  CreateAiWorkPlanDto,
  ReviewAiWorkPlanDto,
  UpdateAiWorkPlanTaskDto
} from "./dto/ai-work-plan.dto";
import { AiAssignmentDecisionEntity } from "./entities/ai-assignment-decision.entity";
import { AiWorkPlanTaskEntity } from "./entities/ai-work-plan-task.entity";
import { AiWorkPlanEntity } from "./entities/ai-work-plan.entity";
import { WorkforceDirectoryService } from "./workforce-directory.service";

const EDITABLE_STATUSES: AiWorkPlanStatus[] = ["DRAFT", "NEEDS_CLARIFICATION", "READY_FOR_REVIEW"];

export interface AiWorkPlanDetail {
  plan: AiWorkPlanEntity;
  tasks: Array<AiWorkPlanTaskEntity & { candidates: AiAssignmentDecisionEntity[] }>;
  readiness: {
    ready: boolean;
    missingAssigneeTaskCodes: string[];
    missingDueAtTaskCodes: string[];
    clarificationQuestions: string[];
  };
}

@Injectable()
export class AiWorkPlansService {
  constructor(
    @InjectRepository(AiWorkPlanEntity)
    private readonly plansRepository: Repository<AiWorkPlanEntity>,
    @InjectRepository(AiWorkPlanTaskEntity)
    private readonly tasksRepository: Repository<AiWorkPlanTaskEntity>,
    @InjectRepository(AiAssignmentDecisionEntity)
    private readonly decisionsRepository: Repository<AiAssignmentDecisionEntity>,
    @InjectRepository(OrgEntity)
    private readonly orgsRepository: Repository<OrgEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    private readonly planner: LocalNaturalLanguageWorkPlanner,
    private readonly directory: WorkforceDirectoryService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly workflowService: WorkflowService
  ) {}

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateAiWorkPlanDto): Promise<AiWorkPlanDetail> {
    const targetOrg = dto.target_org_id ? await this.findOrg(scope, dto.target_org_id) : null;
    const parsed = this.planner.parse(dto.instruction, {
      defaultDueAt: dto.default_due_at ? new Date(dto.default_due_at) : null
    });
    const workforce = await this.directory.list(scope);
    const planCode = this.generatePlanCode();
    const scoredTasks = parsed.tasks.map((task) => {
      const candidates = scoreWorkforceCandidates(task, workforce).slice(0, 5);
      const selected = shouldAutoSelect(candidates) ? candidates[0] : undefined;
      return { task, candidates, selected };
    });
    const missingAssignee = scoredTasks.some(({ selected }) => !selected);
    const missingDueAt = scoredTasks.some(({ task }) => !task.dueAt);
    const status: AiWorkPlanStatus = missingAssignee || missingDueAt || parsed.clarificationQuestions.length > 0
      ? "NEEDS_CLARIFICATION"
      : "READY_FOR_REVIEW";

    const plan = await this.plansRepository.manager.transaction(async (manager) => {
      const planRepository = manager.getRepository(AiWorkPlanEntity);
      const taskRepository = manager.getRepository(AiWorkPlanTaskEntity);
      const decisionRepository = manager.getRepository(AiAssignmentDecisionEntity);
      const savedPlan = await planRepository.save(planRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        planCode,
        rawInstruction: dto.instruction,
        normalizedGoal: parsed.normalizedGoal,
        plannerMode: "local_semantic_rules",
        plannerVersion: "v1",
        status,
        riskLevel: parsed.riskLevel,
        locationText: dto.location ?? null,
        targetOrgId: targetOrg?.id ?? null,
        assumptions: parsed.assumptions,
        clarificationQuestions: parsed.clarificationQuestions,
        taskCount: scoredTasks.length,
        approvedBy: null,
        approvedAt: null,
        approvalComment: null,
        materializedBy: null,
        materializedAt: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        createBy: actor.sub,
        updateBy: actor.sub
      }));
      const taskCodes = scoredTasks.map((_item, index) => `${planCode}-T${String(index + 1).padStart(2, "0")}`);
      for (const [index, scoredTask] of scoredTasks.entries()) {
        const { task, candidates, selected } = scoredTask;
        const taskCode = taskCodes[index]!;
        const savedTask = await taskRepository.save(taskRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          planId: savedPlan.id,
          taskCode,
          sequenceNo: index + 1,
          title: task.title,
          description: task.description,
          workOrderType: task.workOrderType,
          departmentId: selected?.orgId ?? targetOrg?.id ?? null,
          departmentName: selected?.orgName ?? targetOrg?.orgName ?? task.departmentHint,
          roleCode: selected?.roleCodes[0] ?? null,
          roleName: selected?.roleNames[0] ?? task.roleHint,
          suggestedAssigneeId: selected?.userId ?? null,
          suggestedAssigneeName: selected?.displayName ?? null,
          confirmedAssigneeId: selected?.userId ?? null,
          confirmedAssigneeName: selected?.displayName ?? null,
          assignmentStrategy: selected ? (task.personHint ? "explicit_person" : "ranked_match") : "department_dispatch",
          assignmentConfidence: selected?.confidence ?? candidates[0]?.confidence ?? 0,
          priority: task.priority,
          urgency: task.urgency,
          dueAt: task.dueAt,
          plannedEffortMinutes: null,
          dependencyTaskCodes: task.dependencyIndexes.map((dependencyIndex: number) => taskCodes[dependencyIndex]).filter((code): code is string => Boolean(code)),
          acceptanceCriteria: task.acceptanceCriteria,
          evidenceRequirements: task.evidenceRequirements,
          speedWeight: 50,
          qualityWeight: 50,
          status: "PLANNED",
          workOrderId: null,
          createBy: actor.sub,
          updateBy: actor.sub
        }));
        if (candidates.length > 0) {
          await decisionRepository.save(candidates.map((candidate: ScoredWorkforceCandidate) => this.toDecision(scope, actor, savedPlan.id, savedTask.id, candidate, selected?.userId)));
        }
      }
      return savedPlan;
    });
    return this.detail(scope, actor, plan.id);
  }

  async list(scope: TenantParkScope, actor: JwtPrincipal, query: AiWorkPlanQueryDto): Promise<PaginatedResult<AiWorkPlanEntity>> {
    const where: FindOptionsWhere<AiWorkPlanEntity> = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      ...(query.status ? { status: query.status as AiWorkPlanStatus } : {}),
      ...(query.keyword ? { normalizedGoal: ILike(`%${query.keyword}%`) } : {}),
      ...(this.canManageAll(actor) ? {} : { createBy: actor.sub })
    };
    const [items, total] = await this.plansRepository.findAndCount({
      where,
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<AiWorkPlanDetail> {
    const plan = await this.findPlan(scope, actor, id);
    const [tasks, decisions] = await Promise.all([
      this.tasksRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, planId: plan.id, isDeleted: false },
        order: { sequenceNo: "ASC" }
      }),
      this.decisionsRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, planId: plan.id, isDeleted: false },
        order: { score: "DESC" }
      })
    ]);
    const grouped = new Map<string, AiAssignmentDecisionEntity[]>();
    for (const decision of decisions) grouped.set(decision.taskId, [...(grouped.get(decision.taskId) ?? []), decision]);
    return {
      plan,
      tasks: tasks.map((task) => Object.assign(task, { candidates: grouped.get(task.id) ?? [] })),
      readiness: this.readiness(plan, tasks)
    };
  }

  async updateTask(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    planId: string,
    taskId: string,
    dto: UpdateAiWorkPlanTaskDto
  ): Promise<AiWorkPlanDetail> {
    const plan = await this.findPlan(scope, actor, planId);
    this.assertEditable(plan);
    const task = await this.findTask(scope, plan.id, taskId);
    if (dto.confirmed_assignee_id !== undefined) {
      if (dto.confirmed_assignee_id === null) {
        task.confirmedAssigneeId = null;
        task.confirmedAssigneeName = null;
        task.assignmentStrategy = "department_dispatch";
        await this.clearSelectedDecision(scope, actor, plan.id, task.id);
      } else {
        const assignee = await this.directory.get(scope, dto.confirmed_assignee_id);
        task.confirmedAssigneeId = assignee.userId;
        task.confirmedAssigneeName = assignee.displayName;
        task.departmentId = assignee.orgId;
        task.departmentName = assignee.orgName;
        task.assignmentStrategy = "manual_confirmed";
        task.assignmentConfidence = 1;
        await this.recordManualDecision(scope, actor, plan.id, task.id, assignee);
      }
    }
    if (dto.department_id !== undefined) {
      const org = dto.department_id ? await this.findOrg(scope, dto.department_id) : null;
      task.departmentId = org?.id ?? null;
      task.departmentName = org?.orgName ?? null;
    }
    if (dto.title !== undefined) task.title = dto.title;
    if (dto.description !== undefined) task.description = dto.description;
    if (dto.due_at !== undefined) task.dueAt = dto.due_at ? new Date(dto.due_at) : null;
    if (dto.priority !== undefined) task.priority = dto.priority;
    if (dto.urgency !== undefined) task.urgency = dto.urgency;
    if (dto.acceptance_criteria !== undefined) task.acceptanceCriteria = dto.acceptance_criteria;
    if (dto.planned_effort_minutes !== undefined) task.plannedEffortMinutes = dto.planned_effort_minutes;
    task.updateBy = actor.sub;
    await this.tasksRepository.save(task);
    await this.refreshReadinessStatus(plan, actor.sub);
    return this.detail(scope, actor, plan.id);
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReviewAiWorkPlanDto): Promise<AiWorkPlanDetail> {
    const plan = await this.findPlan(scope, actor, id);
    this.assertEditable(plan);
    const tasks = await this.tasksRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, planId: plan.id, isDeleted: false } });
    const readiness = this.readiness(plan, tasks);
    if (!readiness.ready) {
      throw new BadRequestException(`工作计划尚未就绪：${[...readiness.missingAssigneeTaskCodes, ...readiness.missingDueAtTaskCodes].join("、")}`);
    }
    plan.status = "APPROVED";
    plan.approvedBy = actor.sub;
    plan.approvedAt = new Date();
    plan.approvalComment = dto.comment ?? null;
    plan.updateBy = actor.sub;
    await this.plansRepository.save(plan);
    for (const task of tasks) {
      if (task.confirmedAssigneeId) {
        await this.workflowService.publishAiWorkPlanAssignment(scope, actor, {
          planId: plan.id,
          planCode: plan.planCode,
          taskId: task.id,
          taskCode: task.taskCode,
          taskTitle: task.title,
          recipientId: task.confirmedAssigneeId,
          dueAt: task.dueAt
        });
      }
    }
    return this.detail(scope, actor, plan.id);
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, reason: string): Promise<AiWorkPlanDetail> {
    const plan = await this.findPlan(scope, actor, id);
    this.assertEditable(plan);
    plan.status = "REJECTED";
    plan.rejectedBy = actor.sub;
    plan.rejectedAt = new Date();
    plan.rejectionReason = reason;
    plan.updateBy = actor.sub;
    await this.plansRepository.save(plan);
    return this.detail(scope, actor, plan.id);
  }

  async materialize(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<AiWorkPlanDetail> {
    const plan = await this.findPlan(scope, actor, id);
    if (plan.status === "MATERIALIZED") return this.detail(scope, actor, plan.id);
    if (plan.status !== "APPROVED") throw new ConflictException("只有已批准的工作计划可以生成工单");
    const tasks = await this.tasksRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, planId: plan.id, isDeleted: false },
      order: { sequenceNo: "ASC" }
    });
    for (const task of tasks) {
      if (!task.confirmedAssigneeId) throw new BadRequestException(`${task.taskCode} 尚未确认责任人`);
      let workOrder = task.workOrderId
        ? await this.workOrdersRepository.findOne({ where: { id: task.workOrderId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } })
        : await this.workOrdersRepository.findOne({ where: { sourceType: "ai_work_plan", sourceId: task.id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!workOrder) {
        workOrder = await this.workOrdersService.create(scope, actor, {
          title: task.title,
          wo_type: task.workOrderType,
          priority: task.priority,
          urgency: task.urgency,
          source_type: "ai_work_plan",
          source_id: task.id,
          location: plan.locationText ?? undefined,
          description: this.workOrderDescription(plan, task),
          remark: `AI 工作计划 ${plan.planCode} / ${task.taskCode}`
        });
      }
      if (workOrder.status === "10") {
        workOrder = await this.workOrdersService.assign(scope, actor, workOrder.id, {
          assignee_id: task.confirmedAssigneeId,
          reason: `依据已批准工作计划 ${plan.planCode} 自动派单`
        });
      }
      task.workOrderId = workOrder.id;
      task.status = "MATERIALIZED";
      task.updateBy = actor.sub;
      await this.tasksRepository.save(task);
    }
    plan.status = "MATERIALIZED";
    plan.materializedBy = actor.sub;
    plan.materializedAt = new Date();
    plan.updateBy = actor.sub;
    await this.plansRepository.save(plan);
    return this.detail(scope, actor, plan.id);
  }

  async directorySnapshot(scope: TenantParkScope) {
    return this.directory.list(scope);
  }

  private async findPlan(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<AiWorkPlanEntity> {
    const plan = await this.plansRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(this.canManageAll(actor) ? {} : { createBy: actor.sub })
      }
    });
    if (!plan) throw new NotFoundException("工作计划不存在或无权访问");
    return plan;
  }

  private async findTask(scope: TenantParkScope, planId: string, taskId: string): Promise<AiWorkPlanTaskEntity> {
    const task = await this.tasksRepository.findOne({ where: { id: taskId, planId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!task) throw new NotFoundException("工作计划任务不存在");
    return task;
  }

  private async findOrg(scope: TenantParkScope, id: string): Promise<OrgEntity> {
    const org = await this.orgsRepository.findOne({ where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" } });
    if (!org) throw new NotFoundException("组织不存在或未启用");
    return org;
  }

  private assertEditable(plan: AiWorkPlanEntity): void {
    if (!EDITABLE_STATUSES.includes(plan.status)) throw new ConflictException("当前工作计划状态不允许修改或审核");
  }

  private readiness(plan: AiWorkPlanEntity, tasks: AiWorkPlanTaskEntity[]) {
    const missingAssigneeTaskCodes = tasks.filter((task) => !task.confirmedAssigneeId).map((task) => task.taskCode);
    const missingDueAtTaskCodes = tasks.filter((task) => !task.dueAt).map((task) => task.taskCode);
    return {
      ready: tasks.length > 0 && missingAssigneeTaskCodes.length === 0 && missingDueAtTaskCodes.length === 0,
      missingAssigneeTaskCodes,
      missingDueAtTaskCodes,
      clarificationQuestions: plan.clarificationQuestions
    };
  }

  private async refreshReadinessStatus(plan: AiWorkPlanEntity, actorId: string): Promise<void> {
    const tasks = await this.tasksRepository.find({ where: { tenantId: plan.tenantId, parkId: plan.parkId, planId: plan.id, isDeleted: false } });
    const readiness = this.readiness(plan, tasks);
    plan.status = readiness.ready ? "READY_FOR_REVIEW" : "NEEDS_CLARIFICATION";
    plan.updateBy = actorId;
    await this.plansRepository.save(plan);
  }

  private toDecision(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    planId: string,
    taskId: string,
    candidate: ScoredWorkforceCandidate,
    selectedUserId?: string
  ): AiAssignmentDecisionEntity {
    return this.decisionsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      planId,
      taskId,
      candidateUserId: candidate.userId,
      candidateName: candidate.displayName,
      orgId: candidate.orgId,
      orgName: candidate.orgName,
      roleCodes: candidate.roleCodes,
      postName: candidate.postName,
      activeWorkload: candidate.activeWorkload,
      score: candidate.score,
      reasons: candidate.reasons,
      isSelected: candidate.userId === selectedUserId,
      createBy: actor.sub,
      updateBy: actor.sub
    });
  }

  private async clearSelectedDecision(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    planId: string,
    taskId: string
  ): Promise<void> {
    await this.decisionsRepository.update(
      {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        planId,
        taskId,
        isDeleted: false
      },
      {
        isSelected: false,
        updateBy: actor.sub,
        remark: `责任人由 ${actor.username ?? actor.sub} 清空`
      }
    );
  }

  private async recordManualDecision(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    planId: string,
    taskId: string,
    assignee: Awaited<ReturnType<WorkforceDirectoryService["get"]>>
  ): Promise<void> {
    await this.clearSelectedDecision(scope, actor, planId, taskId);
    const existing = await this.decisionsRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        planId,
        taskId,
        candidateUserId: assignee.userId,
        isDeleted: false
      }
    });
    if (existing) {
      existing.isSelected = true;
      existing.reasons = [...new Set([...existing.reasons, "人工确认责任人"])];
      existing.updateBy = actor.sub;
      existing.remark = `由 ${actor.username ?? actor.sub} 人工确认`;
      await this.decisionsRepository.save(existing);
      return;
    }
    await this.decisionsRepository.save(this.decisionsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      planId,
      taskId,
      candidateUserId: assignee.userId,
      candidateName: assignee.displayName,
      orgId: assignee.orgId,
      orgName: assignee.orgName,
      roleCodes: assignee.roleCodes,
      postName: assignee.postName,
      activeWorkload: assignee.activeWorkload,
      score: 100,
      reasons: ["人工确认责任人"],
      isSelected: true,
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: `由 ${actor.username ?? actor.sub} 人工确认`
    }));
  }

  private canManageAll(actor: JwtPrincipal): boolean {
    return actor.isSuper === true || actor.permissions.includes("*") || actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_ASSIGN) || actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
  }

  private generatePlanCode(): string {
    const date = new Date();
    const ymd = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    return `AIWP${ymd}-${randomBytes(3).toString("hex").toUpperCase()}`;
  }

  private workOrderDescription(plan: AiWorkPlanEntity, task: AiWorkPlanTaskEntity): string {
    const due = task.dueAt?.toLocaleString("zh-CN", { hour12: false }) ?? "待确认";
    return [
      task.description,
      `工作计划：${plan.planCode}`,
      `计划截止：${due}`,
      `验收标准：${task.acceptanceCriteria}`,
      `证据要求：${task.evidenceRequirements.join("、") || "结果说明"}`,
      task.dependencyTaskCodes.length > 0 ? `前置任务：${task.dependencyTaskCodes.join("、")}` : ""
    ].filter(Boolean).join("\n");
  }
}
