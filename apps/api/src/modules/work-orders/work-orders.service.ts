import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, type Repository, type SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService, type DataScopeFilter } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkflowService } from "../workflow/workflow.service";
import type { AssignWorkOrderDto } from "./dto/assign-work-order.dto";
import type { CloseWorkOrderDto } from "./dto/close-work-order.dto";
import type { ConfirmWorkOrderDto } from "./dto/confirm-work-order.dto";
import type { CreateWorkOrderDto } from "./dto/create-work-order.dto";
import type { EvaluateWorkOrderDto } from "./dto/evaluate-work-order.dto";
import type { FinishWorkOrderDto } from "./dto/finish-work-order.dto";
import type { ReasonWorkOrderDto } from "./dto/reason-work-order.dto";
import type { UpdateWorkOrderDto } from "./dto/update-work-order.dto";
import type { WaitMaterialWorkOrderDto } from "./dto/wait-material-work-order.dto";
import type { CreateWorkOrderLogDto, WorkOrderLogQueryDto } from "./dto/work-order-log.dto";
import type { CreateWorkOrderSlaRuleDto, UpdateWorkOrderSlaRuleDto, WorkOrderSlaRuleQueryDto } from "./dto/work-order-sla-rule.dto";
import type { WorkOrderQueryDto } from "./dto/work-order-query.dto";
import type { WorkOrderStatsQueryDto } from "./dto/work-order-stats-query.dto";
import { WorkOrderLogEntity } from "./entities/work-order-log.entity";
import { WorkOrderSlaRuleEntity } from "./entities/work-order-sla-rule.entity";
import { WorkOrderEntity } from "./entities/work-order.entity";
import { WorkOrderQueryService } from "./work-order-query.service";

const WORK_ORDER_STATUS_SUBMITTED = "10";
const WORK_ORDER_STATUS_ASSIGNED = "20";
const WORK_ORDER_STATUS_ACCEPTED = "30";
const WORK_ORDER_STATUS_PROCESSING = "40";
const WORK_ORDER_STATUS_WAIT_MATERIAL = "45";
const WORK_ORDER_STATUS_FINISHED = "50";
const WORK_ORDER_STATUS_CONFIRMED = "60";
const WORK_ORDER_STATUS_EVALUATED = "70";
const WORK_ORDER_STATUS_CANCELLED = "90";
const WORK_ORDER_STATUS_RETURNED = "91";
const WORK_ORDER_STATUS_CLOSED = "100";
const WORK_ORDER_SOURCE_MANUAL = "manual";
const WORK_ORDER_FINISH_FILE_BIZ_TYPE = "workorder_finish";
const WORK_ORDER_LOG_FILE_BIZ_TYPE = "workorder_log";
const DEFAULT_DISPATCH_SLA_MIN = 30;
const DEFAULT_FINISH_SLA_MIN = 240;
const ENABLED_STATUS = "enabled";
const DEFAULT_SORT_COLUMN = "workOrder.createTime";
const ASSIGNABLE_WORK_ORDER_STATUSES = new Set([WORK_ORDER_STATUS_SUBMITTED, WORK_ORDER_STATUS_ASSIGNED, WORK_ORDER_STATUS_RETURNED]);
const SORT_COLUMNS = new Set([
  "woCode",
  "title",
  "woType",
  "priority",
  "urgency",
  "status",
  "overdueFlag",
  "createTime",
  "updateTime",
  "dispatchTime",
  "finishTime"
]);
const SORT_COLUMN_MAP: Record<string, string> = {
  woCode: "workOrder.woCode",
  title: "workOrder.title",
  woType: "workOrder.woType",
  priority: "workOrder.priority",
  urgency: "workOrder.urgency",
  status: "workOrder.status",
  overdueFlag: "workOrder.overdueFlag",
  createTime: "workOrder.createTime",
  updateTime: "workOrder.updateTime",
  dispatchTime: "workOrder.dispatchTime",
  finishTime: "workOrder.finishTime"
};

interface WorkOrderLocationSnapshot {
  buildingId: string | null;
  floorId: string | null;
  roomLabel: string | null;
}

interface AssignableUserSnapshot {
  id: string;
  name: string;
}

interface WorkOrderTransitionOptions {
  action: string;
  afterStatus: string;
  content: string;
  apply?: (workOrder: WorkOrderEntity, now: Date) => void;
  payload?: Record<string, unknown>;
  afterSave?: (workOrder: WorkOrderEntity, manager: EntityManager) => Promise<void>;
}

interface WorkOrderSlaSettings {
  dispatchSlaMin: number;
  finishSlaMin: number;
}

interface WorkOrderOverdueCheck {
  overdue: boolean;
  reason: string | null;
}

export interface RecalculateOverdueRow {
  id: string;
  wo_code: string;
  overdue: boolean;
  overdue_reason: string | null;
}

export interface RecalculateOverdueResult {
  checked_count: number;
  overdue_count: number;
  marked_count: number;
  cleared_count: number;
  rows: RecalculateOverdueRow[];
}

export interface WorkOrderStatsSummary {
  total_count: number;
  pending_count: number;
  assigned_count: number;
  in_progress_count: number;
  done_count: number;
  overdue_count: number;
  closed_count: number;
  avg_dispatch_minutes: number;
  avg_finish_minutes: number;
  avg_satisfaction: number;
}

export interface WorkOrderStatsBucket {
  key: string;
  count: number;
}

export interface WorkOrderAssigneeStatsBucket {
  assignee_id: string | null;
  assignee_name: string;
  count: number;
  done_count: number;
  overdue_count: number;
  avg_finish_minutes: number;
}

export interface WorkOrderOverdueTopRow {
  assignee_id: string | null;
  assignee_name: string;
  overdue_count: number;
  max_overdue_minutes: number;
}

export interface WorkOrderStatsResult {
  summary: WorkOrderStatsSummary;
  by_status: WorkOrderStatsBucket[];
  by_type: WorkOrderStatsBucket[];
  by_priority: WorkOrderStatsBucket[];
  by_assignee: WorkOrderAssigneeStatsBucket[];
  overdue_top: WorkOrderOverdueTopRow[];
}

export interface WorkOrderRecentItem {
  id: string;
  wo_code: string;
  title: string;
  wo_type: string;
  priority: string;
  urgency: string | null;
  status: string;
  location: string | null;
  reporter_name: string | null;
  reporter_mobile?: string | null;
  assignee_name: string | null;
  overdue_flag: boolean;
  create_time: Date;
  update_time: Date;
}

export interface WorkOrderTenant360Node {
  available: true;
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    avg_satisfaction: number;
  };
  recent_items: WorkOrderRecentItem[];
}

export interface UnitWorkOrdersNode {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
  };
  recent_items: WorkOrderRecentItem[];
}

@Injectable()
export class WorkOrdersService {
  private readonly logger = new Logger(WorkOrdersService.name);

  constructor(
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @InjectRepository(WorkOrderLogEntity)
    private readonly workOrderLogsRepository: Repository<WorkOrderLogEntity>,
    @InjectRepository(WorkOrderSlaRuleEntity)
    private readonly workOrderSlaRulesRepository: Repository<WorkOrderSlaRuleEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly workOrderQueryService: WorkOrderQueryService,
    private readonly workflowService: WorkflowService
  ) {}

  async list(scope: TenantParkScope, query: WorkOrderQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<WorkOrderEntity>> {
    return this.workOrderQueryService.list(scope, query, actor);
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<WorkOrderEntity> {
    return this.workOrderQueryService.detail(scope, id, actor);
  }

  async listSlaRules(scope: TenantParkScope, query: WorkOrderSlaRuleQueryDto): Promise<PaginatedResult<WorkOrderSlaRuleEntity>> {
    return this.workOrderQueryService.listSlaRules(scope, query);
  }

  async createSlaRule(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateWorkOrderSlaRuleDto): Promise<WorkOrderSlaRuleEntity> {
    await this.validateSlaRuleDictionaryValues(scope, dto.wo_type, dto.priority, dto.urgency);
    await this.assertSlaRuleAvailable(scope, dto.wo_type, dto.urgency, dto.priority);
    const entity = this.workOrderSlaRulesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      woType: dto.wo_type.trim(),
      urgency: dto.urgency.trim(),
      priority: dto.priority.trim(),
      dispatchSlaMin: dto.dispatch_sla_min,
      finishSlaMin: dto.finish_sla_min,
      escalateRoleCode: this.emptyToNull(dto.escalate_role_code),
      status: dto.status?.trim() || ENABLED_STATUS,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    return this.workOrderSlaRulesRepository.save(entity);
  }

  async updateSlaRule(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateWorkOrderSlaRuleDto): Promise<WorkOrderSlaRuleEntity> {
    const entity = await this.findSlaRule(scope, id);
    const nextWoType = dto.wo_type?.trim() ?? entity.woType;
    const nextUrgency = dto.urgency?.trim() ?? entity.urgency;
    const nextPriority = dto.priority?.trim() ?? entity.priority;
    await this.validateSlaRuleDictionaryValues(scope, nextWoType, nextPriority, nextUrgency);
    if (nextWoType !== entity.woType || nextUrgency !== entity.urgency || nextPriority !== entity.priority) {
      await this.assertSlaRuleAvailable(scope, nextWoType, nextUrgency, nextPriority, entity.id);
    }
    Object.assign(entity, {
      woType: nextWoType,
      urgency: nextUrgency,
      priority: nextPriority,
      dispatchSlaMin: dto.dispatch_sla_min ?? entity.dispatchSlaMin,
      finishSlaMin: dto.finish_sla_min ?? entity.finishSlaMin,
      escalateRoleCode: dto.escalate_role_code === undefined ? entity.escalateRoleCode : this.emptyToNull(dto.escalate_role_code),
      status: dto.status?.trim() ?? entity.status,
      remark: dto.remark === undefined ? entity.remark : this.emptyToNull(dto.remark),
      updateBy: actor.sub
    });
    return this.workOrderSlaRulesRepository.save(entity);
  }

  async deleteSlaRule(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findSlaRule(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.workOrderSlaRulesRepository.save(entity);
    return { id };
  }

  async overdue(scope: TenantParkScope, query: WorkOrderQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<WorkOrderEntity>> {
    return this.workOrderQueryService.overdue(scope, query, actor);
  }

  async stats(scope: TenantParkScope, query: WorkOrderStatsQueryDto, actor?: JwtPrincipal): Promise<WorkOrderStatsResult> {
    return this.workOrderQueryService.stats(scope, query, actor);
  }

  async tenant360Workorders(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<WorkOrderTenant360Node> {
    const builder = this.scopedBuilder(scope)
      .andWhere("workOrder.park_tenant_id = :parkTenantId", { parkTenantId })
      .orderBy("workOrder.updateTime", "DESC")
      .addOrderBy("workOrder.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const workOrders = await builder.getMany();
    const satisfactionValues = workOrders
      .map((workOrder) => workOrder.satisfaction)
      .filter((value): value is number => typeof value === "number");
    return {
      available: true,
      summary: {
        total_count: workOrders.length,
        open_count: workOrders.filter((workOrder) => this.isOpenWorkOrder(workOrder.status)).length,
        overdue_count: workOrders.filter((workOrder) => workOrder.overdueFlag).length,
        avg_satisfaction: this.average(satisfactionValues)
      },
      recent_items: await this.secureRecentWorkOrders(scope, actor, workOrders.slice(0, 5))
    };
  }

  async unitWorkorders(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<UnitWorkOrdersNode> {
    const builder = this.scopedBuilder(scope)
      .andWhere("workOrder.unit_id = :unitId", { unitId })
      .orderBy("workOrder.updateTime", "DESC")
      .addOrderBy("workOrder.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const workOrders = await builder.getMany();
    return {
      summary: {
        total_count: workOrders.length,
        open_count: workOrders.filter((workOrder) => this.isOpenWorkOrder(workOrder.status)).length,
        overdue_count: workOrders.filter((workOrder) => workOrder.overdueFlag).length
      },
      recent_items: await this.secureRecentWorkOrders(scope, actor, workOrders.slice(0, 5))
    };
  }

  async recalculateOverdue(scope: TenantParkScope, actor: JwtPrincipal): Promise<RecalculateOverdueResult> {
    const activeStatuses = [WORK_ORDER_STATUS_SUBMITTED, WORK_ORDER_STATUS_ASSIGNED, WORK_ORDER_STATUS_ACCEPTED, WORK_ORDER_STATUS_PROCESSING, WORK_ORDER_STATUS_WAIT_MATERIAL];
    const workOrders = await this.workOrdersRepository
      .createQueryBuilder("workOrder")
      .where("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("workOrder.is_deleted = false")
      .andWhere("workOrder.status IN (:...statuses)", { statuses: activeStatuses })
      .getMany();
    const now = new Date();
    const rows: RecalculateOverdueRow[] = [];
    let markedCount = 0;
    let clearedCount = 0;
    await this.workOrdersRepository.manager.transaction(async (manager) => {
      const workOrderRepository = manager.getRepository(WorkOrderEntity);
      const logRepository = manager.getRepository(WorkOrderLogEntity);
      for (const workOrder of workOrders) {
        const check = this.checkOverdue(workOrder, now);
        rows.push({
          id: workOrder.id,
          wo_code: workOrder.woCode,
          overdue: check.overdue,
          overdue_reason: check.reason
        });
        if (check.overdue && !workOrder.overdueFlag) {
          workOrder.overdueFlag = true;
          workOrder.overdueReason = check.reason;
          workOrder.updateBy = actor.sub;
          await workOrderRepository.save(workOrder);
          await this.createWorkOrderLog(scope, actor, workOrder, "overdue", workOrder.status, workOrder.status, check.reason ?? "工单超时", logRepository, {
            overdueFlag: true
          });
          markedCount += 1;
          continue;
        }
        if (!check.overdue && workOrder.overdueFlag) {
          workOrder.overdueFlag = false;
          workOrder.overdueReason = null;
          workOrder.updateBy = actor.sub;
          await workOrderRepository.save(workOrder);
          await this.createWorkOrderLog(scope, actor, workOrder, "overdue_clear", workOrder.status, workOrder.status, "超时标记已清除", logRepository, {
            overdueFlag: false
          });
          clearedCount += 1;
        } else if (check.overdue && workOrder.overdueReason !== check.reason) {
          workOrder.overdueReason = check.reason;
          workOrder.updateBy = actor.sub;
          await workOrderRepository.save(workOrder);
        }
      }
    });
    return {
      checked_count: workOrders.length,
      overdue_count: rows.filter((row) => row.overdue).length,
      marked_count: markedCount,
      cleared_count: clearedCount,
      rows
    };
  }

  async logs(scope: TenantParkScope, actor: JwtPrincipal, id: string, query: WorkOrderLogQueryDto): Promise<PaginatedResult<WorkOrderLogEntity>> {
    return this.workOrderQueryService.logs(scope, actor, id, query);
  }

  async createLog(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CreateWorkOrderLogDto): Promise<WorkOrderLogEntity> {
    const entity = await this.findOne(scope, id, actor);
    const content = dto.content?.trim();
    if (!content) {
      throw new BadRequestException("work order log content is required");
    }
    const attachmentFileIds = dto.attachment_file_ids ?? [];
    await this.validateFileIds(scope, attachmentFileIds);
    let saved!: WorkOrderLogEntity;
    await this.workOrderLogsRepository.manager.transaction(async (manager) => {
      saved = await this.createWorkOrderLog(
        scope,
        actor,
        entity,
        dto.action ?? "system",
        entity.status,
        entity.status,
        content,
        manager.getRepository(WorkOrderLogEntity),
        {
          reason: this.emptyToNull(dto.reason),
          attachmentFileIds
        },
        {
          reason: this.emptyToNull(dto.reason),
          attachmentFileIds,
          remark: this.emptyToNull(dto.remark)
        }
      );
      if (attachmentFileIds.length > 0) {
        await manager
          .getRepository(FileEntity)
          .createQueryBuilder()
          .update(FileEntity)
          .set({ bizType: WORK_ORDER_LOG_FILE_BIZ_TYPE, bizId: saved.id, updateBy: actor.sub })
          .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("park_id = :parkId", { parkId: scope.parkId })
          .andWhere("id IN (:...fileIds)", { fileIds: attachmentFileIds })
          .execute();
      }
    });
    return saved;
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateWorkOrderDto): Promise<WorkOrderEntity> {
    await this.validateDictionaryValues(scope, dto.wo_type, dto.priority, dto.urgency, dto.source_type ?? WORK_ORDER_SOURCE_MANUAL, WORK_ORDER_STATUS_SUBMITTED);
    await this.validateOptionalParkTenant(scope, dto.park_tenant_id);
    const location = await this.resolveLocation(scope, dto.unit_id, dto.building_id, dto.floor_id, dto.room_label);
    await this.validateFileIds(scope, dto.image_file_ids ?? []);
    await this.validateFileIds(scope, dto.video_file_ids ?? []);
    const woCode = await this.resolveWorkOrderCode(scope, actor.sub, dto.wo_code);
    await this.assertWorkOrderCodeAvailable(scope, woCode);
    const matchedSla = await this.resolveSlaSettings(scope, dto.wo_type, dto.urgency, dto.priority);
    const entity = this.workOrdersRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: woCode,
      woCode,
      title: dto.title.trim(),
      woType: dto.wo_type.trim(),
      woSubType: this.emptyToNull(dto.wo_sub_type),
      priority: dto.priority.trim(),
      urgency: this.emptyToNull(dto.urgency),
      status: WORK_ORDER_STATUS_SUBMITTED,
      sourceType: dto.source_type ?? WORK_ORDER_SOURCE_MANUAL,
      sourceId: this.emptyToNull(dto.source_id),
      parkTenantId: dto.park_tenant_id ?? null,
      unitId: dto.unit_id ?? null,
      buildingId: location.buildingId,
      floorId: location.floorId,
      roomLabel: location.roomLabel,
      location: this.emptyToNull(dto.location),
      reporterId: dto.reporter_id ?? actor.sub,
      reporterName: this.emptyToNull(dto.reporter_name) ?? this.actorName(actor),
      reporterMobile: this.emptyToNull(dto.reporter_mobile),
      assigneeId: dto.assignee_id ?? null,
      assigneeName: this.emptyToNull(dto.assignee_name),
      assignerId: null,
      assignerName: null,
      description: dto.description.trim(),
      imageFileIds: dto.image_file_ids ?? [],
      videoFileIds: dto.video_file_ids ?? [],
      deviceId: this.emptyToNull(dto.device_id),
      robotId: this.emptyToNull(dto.robot_id),
      slaDispatchMin: dto.sla_dispatch_min ?? matchedSla.dispatchSlaMin,
      slaFinishMin: dto.sla_finish_min ?? matchedSla.finishSlaMin,
      overdueFlag: false,
      overdueReason: null,
      remark: this.emptyToNull(dto.remark),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    let saved!: WorkOrderEntity;
    await this.workOrdersRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(WorkOrderEntity).save(entity);
      await this.createWorkOrderLog(scope, actor, saved, "create", null, saved.status, "手工创建工单", manager.getRepository(WorkOrderLogEntity));
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "workorder", "work_order", saved);
  }

  async assign(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AssignWorkOrderDto): Promise<WorkOrderEntity> {
    return this.assignInternal(scope, actor, id, dto, "assign");
  }

  async reassign(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AssignWorkOrderDto): Promise<WorkOrderEntity> {
    if (!dto.reason?.trim()) {
      throw new BadRequestException("reassign reason is required");
    }
    return this.assignInternal(scope, actor, id, dto, "reassign");
  }

  async accept(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertCanHandleWorkOrder(actor, entity);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_ASSIGNED]), "Only assigned work orders can be accepted");
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "accept",
      afterStatus: WORK_ORDER_STATUS_ACCEPTED,
      content: "接单",
      apply: (workOrder, now) => {
        workOrder.acceptTime = now;
      }
    });
  }

  async start(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertCanHandleWorkOrder(actor, entity);
    this.assertStatus(
      entity,
      new Set([WORK_ORDER_STATUS_ACCEPTED, WORK_ORDER_STATUS_WAIT_MATERIAL]),
      "Only accepted or wait-material work orders can start processing"
    );
    const isResume = entity.status === WORK_ORDER_STATUS_WAIT_MATERIAL;
    return this.transitionWorkOrder(scope, actor, entity, {
      action: isResume ? "resume" : "start",
      afterStatus: WORK_ORDER_STATUS_PROCESSING,
      content: isResume ? "恢复处理" : "开始处理",
      apply: (workOrder, now) => {
        workOrder.startTime = workOrder.startTime ?? now;
      }
    });
  }

  async waitMaterial(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: WaitMaterialWorkOrderDto): Promise<WorkOrderEntity> {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("wait material reason is required");
    }
    const entity = await this.findOne(scope, id, actor);
    this.assertCanHandleWorkOrder(actor, entity);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_PROCESSING]), "Only processing work orders can wait for material");
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "wait_material",
      afterStatus: WORK_ORDER_STATUS_WAIT_MATERIAL,
      content: reason,
      apply: (workOrder, now) => {
        workOrder.waitMaterialTime = now;
      },
      payload: {
        reason
      }
    });
  }

  async finish(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: FinishWorkOrderDto): Promise<WorkOrderEntity> {
    const resolveNote = dto.resolve_note?.trim();
    if (!resolveNote) {
      throw new BadRequestException("resolve_note is required");
    }
    const finishImageFileIds = dto.image_file_ids ?? [];
    await this.validateFileIds(scope, finishImageFileIds);
    const entity = await this.findOne(scope, id, actor);
    this.assertCanHandleWorkOrder(actor, entity);
    this.assertStatus(
      entity,
      new Set([WORK_ORDER_STATUS_PROCESSING, WORK_ORDER_STATUS_WAIT_MATERIAL]),
      "Only processing or wait-material work orders can be finished"
    );
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "finish",
      afterStatus: WORK_ORDER_STATUS_FINISHED,
      content: resolveNote,
      apply: (workOrder, now) => {
        workOrder.finishTime = now;
        workOrder.resolveNote = resolveNote;
        workOrder.imageFileIds = [...new Set([...(workOrder.imageFileIds ?? []), ...finishImageFileIds])];
      },
      payload: {
        finishImageFileIds
      },
      afterSave: async (saved, manager) => {
        if (finishImageFileIds.length === 0) return;
        await manager
          .getRepository(FileEntity)
          .createQueryBuilder()
          .update(FileEntity)
          .set({ bizType: WORK_ORDER_FINISH_FILE_BIZ_TYPE, bizId: saved.id, updateBy: actor.sub })
          .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("park_id = :parkId", { parkId: scope.parkId })
          .andWhere("id IN (:...fileIds)", { fileIds: finishImageFileIds })
          .execute();
      }
    });
  }

  async confirm(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ConfirmWorkOrderDto): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertCanConfirmWorkOrder(actor, entity);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_FINISHED]), "Only finished work orders can be confirmed");
    const confirmNote = dto.confirm_note?.trim() || "确认完成";
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "confirm",
      afterStatus: WORK_ORDER_STATUS_CONFIRMED,
      content: confirmNote,
      apply: (workOrder, now) => {
        workOrder.confirmTime = now;
      },
      payload: {
        confirmNote
      }
    });
  }

  async evaluate(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: EvaluateWorkOrderDto): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    this.assertCanConfirmWorkOrder(actor, entity);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_CONFIRMED]), "Only confirmed work orders can be evaluated");
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "evaluate",
      afterStatus: WORK_ORDER_STATUS_EVALUATED,
      content: dto.evaluation?.trim() || `满意度 ${dto.satisfaction}`,
      apply: (workOrder) => {
        workOrder.satisfaction = dto.satisfaction;
        workOrder.evaluation = dto.evaluation?.trim() ?? null;
      },
      payload: {
        satisfaction: dto.satisfaction
      }
    });
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CloseWorkOrderDto): Promise<WorkOrderEntity> {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("close reason is required");
    }
    const entity = await this.findOne(scope, id, actor);
    this.assertCanCloseWorkOrder(actor);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_CONFIRMED, WORK_ORDER_STATUS_EVALUATED]), "Only confirmed or evaluated work orders can be closed");
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "close",
      afterStatus: WORK_ORDER_STATUS_CLOSED,
      content: reason,
      apply: (workOrder, now) => {
        workOrder.closeTime = now;
      },
      payload: {
        reason
      }
    });
  }

  async cancel(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonWorkOrderDto): Promise<WorkOrderEntity> {
    const reason = this.requireReason(dto.reason, "cancel reason is required");
    const entity = await this.findOne(scope, id, actor);
    this.assertStatus(entity, new Set([WORK_ORDER_STATUS_SUBMITTED, WORK_ORDER_STATUS_ASSIGNED]), "Only submitted or assigned work orders can be cancelled");
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "cancel",
      afterStatus: WORK_ORDER_STATUS_CANCELLED,
      content: reason,
      apply: (workOrder, now) => {
        workOrder.cancelTime = now;
      },
      payload: {
        reason
      }
    });
  }

  async returnWorkOrder(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonWorkOrderDto): Promise<WorkOrderEntity> {
    const reason = this.requireReason(dto.reason, "return reason is required");
    const entity = await this.findOne(scope, id, actor);
    this.assertCanHandleWorkOrder(actor, entity);
    this.assertStatus(
      entity,
      new Set([WORK_ORDER_STATUS_ACCEPTED, WORK_ORDER_STATUS_PROCESSING, WORK_ORDER_STATUS_WAIT_MATERIAL]),
      "Only accepted, processing, or wait-material work orders can be returned"
    );
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "return",
      afterStatus: WORK_ORDER_STATUS_RETURNED,
      content: reason,
      payload: {
        reason
      }
    });
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonWorkOrderDto): Promise<WorkOrderEntity> {
    const reason = this.requireReason(dto.reason, "reject reason is required");
    const entity = await this.findOne(scope, id, actor);
    this.assertCanCloseWorkOrder(actor);
    this.assertStatus(
      entity,
      new Set([
        WORK_ORDER_STATUS_SUBMITTED,
        WORK_ORDER_STATUS_ASSIGNED,
        WORK_ORDER_STATUS_ACCEPTED,
        WORK_ORDER_STATUS_PROCESSING,
        WORK_ORDER_STATUS_WAIT_MATERIAL
      ]),
      "Only active work orders can be rejected"
    );
    return this.transitionWorkOrder(scope, actor, entity, {
      action: "reject",
      afterStatus: WORK_ORDER_STATUS_RETURNED,
      content: reason,
      payload: {
        reason
      }
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateWorkOrderDto): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    await this.validateDictionaryValues(
      scope,
      dto.wo_type ?? entity.woType,
      dto.priority ?? entity.priority,
      dto.urgency ?? entity.urgency ?? undefined,
      dto.source_type ?? entity.sourceType,
      entity.status
    );
    await this.validateOptionalParkTenant(scope, dto.park_tenant_id ?? entity.parkTenantId ?? undefined);
    const nextUnitId = dto.unit_id === undefined ? entity.unitId ?? undefined : dto.unit_id;
    const location = await this.resolveLocation(
      scope,
      nextUnitId,
      dto.building_id === undefined ? entity.buildingId ?? undefined : dto.building_id,
      dto.floor_id === undefined ? entity.floorId ?? undefined : dto.floor_id,
      dto.room_label === undefined ? entity.roomLabel ?? undefined : dto.room_label
    );
    await this.validateFileIds(scope, dto.image_file_ids ?? entity.imageFileIds ?? []);
    await this.validateFileIds(scope, dto.video_file_ids ?? entity.videoFileIds ?? []);
    if (dto.wo_code && dto.wo_code !== entity.woCode) {
      await this.assertWorkOrderCodeAvailable(scope, dto.wo_code);
      entity.woCode = dto.wo_code;
      entity.code = dto.wo_code;
    }
    Object.assign(entity, {
      title: dto.title?.trim() ?? entity.title,
      woType: dto.wo_type?.trim() ?? entity.woType,
      woSubType: dto.wo_sub_type === undefined ? entity.woSubType : this.emptyToNull(dto.wo_sub_type),
      priority: dto.priority?.trim() ?? entity.priority,
      urgency: dto.urgency === undefined ? entity.urgency : this.emptyToNull(dto.urgency),
      sourceType: dto.source_type ?? entity.sourceType,
      sourceId: dto.source_id === undefined ? entity.sourceId : this.emptyToNull(dto.source_id),
      parkTenantId: dto.park_tenant_id === undefined ? entity.parkTenantId : dto.park_tenant_id ?? null,
      unitId: dto.unit_id === undefined ? entity.unitId : dto.unit_id ?? null,
      buildingId: location.buildingId,
      floorId: location.floorId,
      roomLabel: location.roomLabel,
      location: dto.location === undefined ? entity.location : this.emptyToNull(dto.location),
      reporterId: dto.reporter_id === undefined ? entity.reporterId : dto.reporter_id ?? null,
      reporterName: dto.reporter_name === undefined ? entity.reporterName : this.emptyToNull(dto.reporter_name),
      reporterMobile: dto.reporter_mobile === undefined ? entity.reporterMobile : this.emptyToNull(dto.reporter_mobile),
      assigneeId: dto.assignee_id === undefined ? entity.assigneeId : dto.assignee_id ?? null,
      assigneeName: dto.assignee_name === undefined ? entity.assigneeName : this.emptyToNull(dto.assignee_name),
      description: dto.description?.trim() ?? entity.description,
      imageFileIds: dto.image_file_ids ?? entity.imageFileIds,
      videoFileIds: dto.video_file_ids ?? entity.videoFileIds,
      deviceId: dto.device_id === undefined ? entity.deviceId : this.emptyToNull(dto.device_id),
      robotId: dto.robot_id === undefined ? entity.robotId : this.emptyToNull(dto.robot_id),
      slaDispatchMin: dto.sla_dispatch_min === undefined ? entity.slaDispatchMin : dto.sla_dispatch_min ?? null,
      slaFinishMin: dto.sla_finish_min === undefined ? entity.slaFinishMin : dto.sla_finish_min ?? null,
      remark: dto.remark === undefined ? entity.remark : this.emptyToNull(dto.remark),
      updateBy: actor.sub
    });
    let saved!: WorkOrderEntity;
    await this.workOrdersRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(WorkOrderEntity).save(entity);
      await this.createWorkOrderLog(
        scope,
        actor,
        saved,
        "update",
        saved.status,
        saved.status,
        "更新工单信息",
        manager.getRepository(WorkOrderLogEntity)
      );
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "workorder", "work_order", saved);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== WORK_ORDER_STATUS_CANCELLED) {
      throw new BadRequestException("Only cancelled work orders can be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.workOrdersRepository.save(entity);
    return { id };
  }

  private async assignInternal(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: AssignWorkOrderDto,
    action: "assign" | "reassign"
  ): Promise<WorkOrderEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (!ASSIGNABLE_WORK_ORDER_STATUSES.has(entity.status)) {
      throw new BadRequestException("Only submitted, returned, or assigned work orders can be assigned");
    }
    const assignee = await this.resolveAssignableUser(scope, dto.assignee_id);
    const beforeStatus = entity.status;
    const beforeAssigneeId = entity.assigneeId;
    const beforeAssigneeName = entity.assigneeName;
    entity.status = WORK_ORDER_STATUS_ASSIGNED;
    entity.dispatchTime = new Date();
    entity.assignerId = actor.sub;
    entity.assignerName = this.actorName(actor);
    entity.assigneeId = assignee.id;
    entity.assigneeName = assignee.name;
    entity.updateBy = actor.sub;

    let saved!: WorkOrderEntity;
    await this.workOrdersRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(WorkOrderEntity).save(entity);
      await this.createWorkOrderLog(
        scope,
        actor,
        saved,
        action,
        beforeStatus,
        saved.status,
        dto.reason?.trim() || (action === "assign" ? "派单" : "改派"),
        manager.getRepository(WorkOrderLogEntity),
        {
          beforeAssigneeId,
          beforeAssigneeName,
          assigneeId: assignee.id,
          assigneeName: assignee.name,
          assignerId: actor.sub,
          assignerName: this.actorName(actor)
        }
      );
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "workorder", "work_order", saved);
  }

  private async transitionWorkOrder(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: WorkOrderEntity,
    options: WorkOrderTransitionOptions
  ): Promise<WorkOrderEntity> {
    const beforeStatus = entity.status;
    const now = new Date();
    entity.status = options.afterStatus;
    entity.updateBy = actor.sub;
    options.apply?.(entity, now);

    let saved!: WorkOrderEntity;
    await this.workOrdersRepository.manager.transaction(async (manager) => {
      saved = await manager.getRepository(WorkOrderEntity).save(entity);
      await options.afterSave?.(saved, manager);
      await this.createWorkOrderLog(
        scope,
        actor,
        saved,
        options.action,
        beforeStatus,
        saved.status,
        options.content,
        manager.getRepository(WorkOrderLogEntity),
        options.payload ?? {}
      );
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "workorder", "work_order", saved);
  }

  private assertCanHandleWorkOrder(actor: JwtPrincipal, entity: WorkOrderEntity): void {
    if (this.canManageAllWorkOrders(actor)) {
      return;
    }
    if (entity.assigneeId && entity.assigneeId === actor.sub) {
      return;
    }
    throw new ForbiddenException("Only assignee or workorder manager can handle this work order");
  }

  private assertCanConfirmWorkOrder(actor: JwtPrincipal, entity: WorkOrderEntity): void {
    if (this.canManageAllWorkOrders(actor)) {
      return;
    }
    if (entity.reporterId && entity.reporterId === actor.sub) {
      return;
    }
    throw new ForbiddenException("Only reporter or workorder manager can confirm this work order");
  }

  private assertCanCloseWorkOrder(actor: JwtPrincipal): void {
    if (this.canManageAllWorkOrders(actor)) {
      return;
    }
    throw new ForbiddenException("Only workorder manager can close this work order");
  }

  private canManageAllWorkOrders(actor: JwtPrincipal): boolean {
    return actor.isSuper === true || actor.permissions.includes("*") || actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL);
  }

  private assertStatus(entity: WorkOrderEntity, allowedStatuses: Set<string>, message: string): void {
    if (!allowedStatuses.has(entity.status)) {
      throw new BadRequestException(message);
    }
    if (entity.status === WORK_ORDER_STATUS_CANCELLED || entity.status === WORK_ORDER_STATUS_CLOSED) {
      throw new BadRequestException("Cancelled or closed work orders cannot be handled");
    }
  }

  private requireReason(rawReason: string | undefined, message: string): string {
    const reason = rawReason?.trim();
    if (!reason) {
      throw new BadRequestException(message);
    }
    return reason;
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<WorkOrderEntity> {
    return this.workOrdersRepository
      .createQueryBuilder("workOrder")
      .leftJoinAndSelect("workOrder.parkTenant", "parkTenant")
      .leftJoinAndSelect("workOrder.unit", "unit")
      .leftJoinAndSelect("workOrder.building", "building")
      .leftJoinAndSelect("workOrder.floor", "floor")
      .where("workOrder.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("workOrder.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("workOrder.is_deleted = false");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<WorkOrderEntity> {
    const builder = this.scopedBuilder(scope).andWhere("workOrder.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Work order not found");
    }
    return entity;
  }

  private applyQuery(builder: SelectQueryBuilder<WorkOrderEntity>, query: WorkOrderQueryDto): void {
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("workOrder.wo_code ILIKE :keyword", { keyword })
            .orWhere("workOrder.title ILIKE :keyword", { keyword })
            .orWhere("workOrder.location ILIKE :keyword", { keyword })
            .orWhere("workOrder.reporter_name ILIKE :keyword", { keyword })
            .orWhere("workOrder.assignee_name ILIKE :keyword", { keyword })
            .orWhere("parkTenant.company_name ILIKE :keyword", { keyword })
            .orWhere("unit.unit_name ILIKE :keyword", { keyword })
            .orWhere("unit.unit_code ILIKE :keyword", { keyword });
        })
      );
    }
    if (query.status) builder.andWhere("workOrder.status = :status", { status: query.status });
    if (query.wo_type) builder.andWhere("workOrder.wo_type = :woType", { woType: query.wo_type });
    if (query.priority) builder.andWhere("workOrder.priority = :priority", { priority: query.priority });
    if (query.urgency) builder.andWhere("workOrder.urgency = :urgency", { urgency: query.urgency });
    if (query.assignee_id) builder.andWhere("workOrder.assignee_id = :assigneeId", { assigneeId: query.assignee_id });
    if (query.reporter_id) builder.andWhere("workOrder.reporter_id = :reporterId", { reporterId: query.reporter_id });
    if (query.park_tenant_id) builder.andWhere("workOrder.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.unit_id) builder.andWhere("workOrder.unit_id = :unitId", { unitId: query.unit_id });
    if (query.device_id) builder.andWhere("workOrder.device_id = :deviceId", { deviceId: query.device_id });
    if (query.building_id) builder.andWhere("workOrder.building_id = :buildingId", { buildingId: query.building_id });
    if (query.source_type) builder.andWhere("workOrder.source_type = :sourceType", { sourceType: query.source_type });
    if (query.overdue_only) builder.andWhere("workOrder.overdue_flag = true");
    if (query.start_date) builder.andWhere("workOrder.create_time >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("workOrder.create_time < (:endDate::date + INTERVAL '1 day')", { endDate: query.end_date });
  }

  private average(values: number[]): number {
    if (values.length === 0) return 0;
    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round((total / values.length) * 100) / 100;
  }

  private isOpenWorkOrder(status: string): boolean {
    return ![WORK_ORDER_STATUS_EVALUATED, WORK_ORDER_STATUS_CANCELLED, WORK_ORDER_STATUS_CLOSED].includes(status);
  }

  private async secureRecentWorkOrders(scope: TenantParkScope, actor: JwtPrincipal | undefined, workOrders: WorkOrderEntity[]): Promise<WorkOrderRecentItem[]> {
    const secured = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "workorder", "work_order", workOrders);
    return secured.map((workOrder) => ({
      id: workOrder.id,
      wo_code: workOrder.woCode,
      title: workOrder.title,
      wo_type: workOrder.woType,
      priority: workOrder.priority,
      urgency: workOrder.urgency,
      status: workOrder.status,
      location: workOrder.location,
      reporter_name: workOrder.reporterName,
      reporter_mobile: workOrder.reporterMobile,
      assignee_name: workOrder.assigneeName,
      overdue_flag: workOrder.overdueFlag,
      create_time: workOrder.createTime,
      update_time: workOrder.updateTime
    }));
  }

  private applySort(builder: SelectQueryBuilder<WorkOrderEntity>, sort?: string): void {
    const [field = "createTime", directionRaw = "DESC"] = (sort ?? "createTime:DESC").split(":");
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy(DEFAULT_SORT_COLUMN, "DESC");
      return;
    }
    const direction = directionRaw?.toUpperCase() === "ASC" ? "ASC" : "DESC";
    builder.orderBy(SORT_COLUMN_MAP[field] ?? DEFAULT_SORT_COLUMN, direction);
  }

  private async applyDataScope(builder: SelectQueryBuilder<WorkOrderEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, buildingFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "park_id", parkFilter, "workOrderParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "building_id", buildingFilter, "workOrderBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "unit_id", unitFilter, "workOrderUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "workOrder", "park_tenant_id", tenantCompanyFilter, "workOrderParkTenantScopeIds");
    this.applyHandlerScopeFilter(builder, handlerFilter);
    this.applyDefaultHandlerSelfScope(builder, actor);
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<WorkOrderEntity>,
    alias: string,
    column: string,
    filter: DataScopeFilter,
    parameterName: string
  ): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(`${alias}.${column} IN (:...${parameterName})`, { [parameterName]: filter.allowed_ids });
      return;
    }
    if (filter.scope_types.includes("custom")) {
      builder.andWhere("1 = 0");
    }
  }

  private applyHandlerScopeFilter(builder: SelectQueryBuilder<WorkOrderEntity>, filter: DataScopeFilter): void {
    if (filter.unrestricted) return;
    if (filter.allowed_ids.length > 0) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("workOrder.assignee_id IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids })
            .orWhere("workOrder.reporter_id IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids })
            .orWhere("workOrder.create_by IN (:...workOrderHandlerScopeIds)", { workOrderHandlerScopeIds: filter.allowed_ids });
        })
      );
      return;
    }
    if (filter.scope_types.includes("custom") || filter.scope_types.includes("self")) {
      builder.andWhere("1 = 0");
    }
  }

  private applyDefaultHandlerSelfScope(builder: SelectQueryBuilder<WorkOrderEntity>, actor: JwtPrincipal): void {
    if (actor.permissions.includes(SYSTEM_PERMISSIONS.WORKORDER_MANAGE_ALL)) return;
    builder.andWhere(
      new Brackets((qb) => {
        qb.where("workOrder.assignee_id = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub })
          .orWhere("workOrder.reporter_id = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub })
          .orWhere("workOrder.create_by = :currentWorkOrderUserId", { currentWorkOrderUserId: actor.sub });
      })
    );
  }

  private async resolveLocation(
    scope: TenantParkScope,
    unitId?: string,
    buildingId?: string,
    floorId?: string,
    roomLabel?: string
  ): Promise<WorkOrderLocationSnapshot> {
    if (unitId) {
      const unit = await this.unitsRepository.findOne({
        where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!unit) {
        throw new NotFoundException("Unit not found in current park");
      }
      return {
        buildingId: unit.buildingId,
        floorId: unit.floorId,
        roomLabel: this.emptyToNull(roomLabel) ?? unit.unitName
      };
    }
    const normalizedBuildingId = buildingId ?? null;
    const normalizedFloorId = floorId ?? null;
    if (normalizedBuildingId) {
      const buildingExists = await this.buildingsRepository.exists({
        where: { id: normalizedBuildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!buildingExists) {
        throw new NotFoundException("Building not found in current park");
      }
    }
    if (normalizedFloorId) {
      const floor = await this.floorsRepository.findOne({
        where: { id: normalizedFloorId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!floor) {
        throw new NotFoundException("Floor not found in current park");
      }
      if (normalizedBuildingId && floor.buildingId !== normalizedBuildingId) {
        throw new BadRequestException("Floor does not belong to selected building");
      }
      return { buildingId: floor.buildingId, floorId: floor.id, roomLabel: this.emptyToNull(roomLabel) };
    }
    return { buildingId: normalizedBuildingId, floorId: normalizedFloorId, roomLabel: this.emptyToNull(roomLabel) };
  }

  private async validateOptionalParkTenant(scope: TenantParkScope, parkTenantId?: string | null): Promise<void> {
    if (!parkTenantId) return;
    const exists = await this.parkTenantsRepository.exists({
      where: { id: parkTenantId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!exists) {
      throw new NotFoundException("Park tenant not found in current park");
    }
  }

  private async validateFileIds(scope: TenantParkScope, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const uniqueFileIds = [...new Set(fileIds)];
    const count = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.is_deleted = false")
      .andWhere("file.status = :status", { status: 1 })
      .andWhere("file.id IN (:...fileIds)", { fileIds: uniqueFileIds })
      .getCount();
    if (count !== uniqueFileIds.length) {
      throw new NotFoundException("File not found in current park");
    }
  }

  private async resolveAssignableUser(scope: TenantParkScope, assigneeId: string): Promise<AssignableUserSnapshot> {
    const user = await this.usersRepository.findOne({
      where: {
        id: assigneeId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        isEnabled: true,
        status: "enabled"
      }
    });
    if (!user) {
      throw new NotFoundException("Assignee user not found in current park");
    }
    return { id: user.id, name: user.displayName || user.username };
  }

  private async findSlaRule(scope: TenantParkScope, id: string): Promise<WorkOrderSlaRuleEntity> {
    const entity = await this.workOrderSlaRulesRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false")
      .andWhere("rule.id = :id", { id })
      .getOne();
    if (!entity) {
      throw new NotFoundException("Work order SLA rule not found");
    }
    return entity;
  }

  private async resolveSlaSettings(scope: TenantParkScope, woType: string, urgency: string | undefined, priority: string): Promise<WorkOrderSlaSettings> {
    const normalizedUrgency = urgency?.trim();
    if (!normalizedUrgency) {
      return { dispatchSlaMin: DEFAULT_DISPATCH_SLA_MIN, finishSlaMin: DEFAULT_FINISH_SLA_MIN };
    }
    const rule = await this.workOrderSlaRulesRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false")
      .andWhere("rule.status = :status", { status: ENABLED_STATUS })
      .andWhere("rule.wo_type = :woType", { woType: woType.trim() })
      .andWhere("rule.urgency = :urgency", { urgency: normalizedUrgency })
      .andWhere("rule.priority = :priority", { priority: priority.trim() })
      .orderBy("rule.update_time", "DESC")
      .getOne();
    return {
      dispatchSlaMin: rule?.dispatchSlaMin ?? DEFAULT_DISPATCH_SLA_MIN,
      finishSlaMin: rule?.finishSlaMin ?? DEFAULT_FINISH_SLA_MIN
    };
  }

  private async validateSlaRuleDictionaryValues(scope: TenantParkScope, woType: string, priority: string, urgency: string): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "workorder_type", woType),
      this.assertDictValue(scope, "workorder_priority", priority),
      this.assertDictValue(scope, "workorder_urgency", urgency)
    ]);
  }

  private async assertSlaRuleAvailable(
    scope: TenantParkScope,
    woType: string,
    urgency: string,
    priority: string,
    excludeId?: string
  ): Promise<void> {
    const builder = this.workOrderSlaRulesRepository
      .createQueryBuilder("rule")
      .where("rule.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("rule.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("rule.is_deleted = false")
      .andWhere("rule.wo_type = :woType", { woType: woType.trim() })
      .andWhere("rule.urgency = :urgency", { urgency: urgency.trim() })
      .andWhere("rule.priority = :priority", { priority: priority.trim() });
    if (excludeId) {
      builder.andWhere("rule.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Work order SLA rule already exists");
    }
  }

  private checkOverdue(workOrder: WorkOrderEntity, now: Date): WorkOrderOverdueCheck {
    const dispatchSlaMin = workOrder.slaDispatchMin ?? DEFAULT_DISPATCH_SLA_MIN;
    const finishSlaMin = workOrder.slaFinishMin ?? DEFAULT_FINISH_SLA_MIN;
    if (workOrder.status === WORK_ORDER_STATUS_SUBMITTED) {
      const elapsed = this.minutesBetween(workOrder.createTime, now);
      if (elapsed > dispatchSlaMin) {
        return {
          overdue: true,
          reason: `派单超时：已提交 ${elapsed} 分钟，超过派单 SLA ${dispatchSlaMin} 分钟`
        };
      }
      return { overdue: false, reason: null };
    }
    if (
      workOrder.status === WORK_ORDER_STATUS_ASSIGNED ||
      workOrder.status === WORK_ORDER_STATUS_ACCEPTED ||
      workOrder.status === WORK_ORDER_STATUS_PROCESSING ||
      workOrder.status === WORK_ORDER_STATUS_WAIT_MATERIAL
    ) {
      const baseTime = workOrder.acceptTime ?? workOrder.dispatchTime ?? workOrder.createTime;
      const elapsed = this.minutesBetween(baseTime, now);
      if (elapsed > finishSlaMin) {
        return {
          overdue: true,
          reason: `处理超时：已处理链路 ${elapsed} 分钟，超过完成 SLA ${finishSlaMin} 分钟`
        };
      }
    }
    return { overdue: false, reason: null };
  }

  private minutesBetween(start: Date, end: Date): number {
    return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 60000));
  }

  private async validateDictionaryValues(
    scope: TenantParkScope,
    woType: string,
    priority: string,
    urgency: string | undefined,
    sourceType: string,
    status: string
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "workorder_type", woType),
      this.assertDictValue(scope, "workorder_priority", priority),
      this.assertDictValue(scope, "workorder_urgency", urgency),
      this.assertDictValue(scope, "workorder_source_type", sourceType),
      this.assertDictValue(scope, "workorder_status", status)
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, rawValue?: string): Promise<void> {
    const value = rawValue?.trim();
    if (!value) return;
    const exists = await this.dictItemsRepository
      .createQueryBuilder("dictItem")
      .innerJoin("dictItem.dictType", "dictType")
      .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictItem.is_deleted = false")
      .andWhere("dictItem.status = :status", { status: "enabled" })
      .andWhere("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("dictType.status = :status", { status: "enabled" })
      .andWhere("dictType.is_deleted = false")
      .andWhere("dictItem.item_value = :value", { value })
      .getExists();
    if (!exists) {
      throw new BadRequestException(`${dictCode} value is not enabled`);
    }
  }

  private async resolveWorkOrderCode(scope: TenantParkScope, actorId: string, providedCode?: string): Promise<string> {
    const normalized = providedCode?.trim();
    if (normalized) return normalized;
    const generated = await this.codeRulesService.generateNext(scope, actorId, "WORKORDER_CODE");
    return generated.code;
  }

  private async assertWorkOrderCodeAvailable(scope: TenantParkScope, woCode: string): Promise<void> {
    const exists = await this.workOrdersRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, woCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Work order code already exists");
    }
  }

  private async createWorkOrderLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    workOrder: WorkOrderEntity,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    logsRepository = this.workOrderLogsRepository,
    payload: Record<string, unknown> = {},
    options: { reason?: string | null; attachmentFileIds?: string[]; remark?: string | null } = {}
  ): Promise<WorkOrderLogEntity> {
    const logCode = await this.codeRulesService.generateNext(scope, actor.sub, "WORKORDER_LOG_CODE");
    const saved = await logsRepository.save(
      logsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: logCode.code,
        logCode: logCode.code,
        workOrderId: workOrder.id,
        action,
        beforeStatus,
        afterStatus,
        operatorId: actor.sub,
        operatorName: this.actorName(actor),
        opTime: new Date(),
        content,
        reason: options.reason ?? this.extractLogReason(action, content, payload),
        attachmentFileIds: options.attachmentFileIds ?? [],
        payload: {
          woCode: workOrder.woCode,
          title: workOrder.title,
          sourceType: workOrder.sourceType,
          ...payload
        },
        createBy: actor.sub,
        updateBy: actor.sub,
        remark: options.remark ?? null
      })
    );
    await this.workflowService
      .publishWorkOrderLog(scope, actor, workOrder, saved, logsRepository.manager)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to publish workflow message for work order ${workOrder.id}: ${message}`);
      });
    return saved;
  }

  private extractLogReason(action: string, content: string, payload: Record<string, unknown>): string | null {
    if (typeof payload.reason === "string" && payload.reason.trim()) {
      return payload.reason.trim();
    }
    if (["reassign", "wait_material", "cancel", "return", "reject", "close", "overdue", "overdue_clear"].includes(action)) {
      return content;
    }
    return null;
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username ?? actor.sub;
  }

  private emptyToNull(value?: string | null): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
