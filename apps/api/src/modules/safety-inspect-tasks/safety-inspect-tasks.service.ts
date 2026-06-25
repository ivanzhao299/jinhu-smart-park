import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, type EntityManager, In, Repository, SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SafetyInspectPlanEntity } from "../safety-inspect-plans/entities/safety-inspect-plan.entity";
import { SafetyInspectPointEntity } from "../safety-inspect-points/entities/safety-inspect-point.entity";
import { SafetyInspectItemEntity } from "../safety-inspect-templates/entities/safety-inspect-item.entity";
import { SafetyInspectTemplateEntity } from "../safety-inspect-templates/entities/safety-inspect-template.entity";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { UserEntity } from "../users/entities/user.entity";
import type { CheckInSafetyInspectTaskDto } from "./dto/check-in-safety-inspect-task.dto";
import type { CreateSafetyInspectTaskDto } from "./dto/create-safety-inspect-task.dto";
import type { GenerateSafetyInspectTasksDto } from "./dto/generate-safety-inspect-tasks.dto";
import type { SafetyInspectTaskQueryDto } from "./dto/safety-inspect-task-query.dto";
import type { SubmitSafetyInspectResultsDto } from "./dto/submit-safety-inspect-results.dto";
import { SafetyActionLogEntity } from "./entities/safety-action-log.entity";
import { SafetyHazardEntity } from "./entities/safety-hazard.entity";
import { SafetyInspectTaskResultEntity } from "./entities/safety-inspect-task-result.entity";
import { SafetyInspectTaskEntity } from "./entities/safety-inspect-task.entity";

const TASK_STATUS_PENDING = "10";
const TASK_STATUS_IN_PROGRESS = "20";
const TASK_STATUS_COMPLETED = "30";
const TASK_STATUS_OVERDUE = "40";
const DEFAULT_DUE_HOURS = 24;
const TASK_RESULT_NORMAL = "normal";
const TASK_RESULT_ABNORMAL = "abnormal";
const HAZARD_STATUS_PENDING = "10";

export interface GenerateSafetyInspectTasksResultRow {
  point_id: string;
  point_name: string;
  handler_id: string;
  handler_name: string;
  task_code: string | null;
  id: string | null;
  status: "generated" | "skipped";
  reason?: string;
}

export interface GenerateSafetyInspectTasksResult {
  plan_id: string;
  plan_time: string;
  due_time: string;
  generated_count: number;
  skipped_count: number;
  rows: GenerateSafetyInspectTasksResultRow[];
}

export type MySafetyInspectTaskDetail = SafetyInspectTaskEntity & {
  items: SafetyInspectItemEntity[];
};

@Injectable()
export class SafetyInspectTasksService {
  constructor(
    @InjectRepository(SafetyInspectTaskEntity)
    private readonly tasksRepository: Repository<SafetyInspectTaskEntity>,
    @InjectRepository(SafetyInspectTaskResultEntity)
    private readonly taskResultsRepository: Repository<SafetyInspectTaskResultEntity>,
    @InjectRepository(SafetyInspectPlanEntity)
    private readonly plansRepository: Repository<SafetyInspectPlanEntity>,
    @InjectRepository(SafetyInspectTemplateEntity)
    private readonly templatesRepository: Repository<SafetyInspectTemplateEntity>,
    @InjectRepository(SafetyInspectItemEntity)
    private readonly itemsRepository: Repository<SafetyInspectItemEntity>,
    @InjectRepository(SafetyInspectPointEntity)
    private readonly pointsRepository: Repository<SafetyInspectPointEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(
    scope: TenantParkScope,
    query: SafetyInspectTaskQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyInspectTaskEntity>> {
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", "inspect_task", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async myTasks(scope: TenantParkScope, query: SafetyInspectTaskQueryDto, actor: JwtPrincipal): Promise<PaginatedResult<SafetyInspectTaskEntity>> {
    return this.list(scope, { ...query, handler_id: actor.sub }, actor);
  }

  async myTaskDetail(scope: TenantParkScope, id: string, actor: JwtPrincipal): Promise<MySafetyInspectTaskDetail> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.handlerId !== actor.sub) {
      throw new ForbiddenException("Only task handler can view this inspect task");
    }
    const securedTask = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_task", entity);
    const items = await this.itemsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, templateId: entity.templateId, isDeleted: false, status: "enabled" },
      order: { sortNo: "ASC", createTime: "ASC" }
    });
    return Object.assign(securedTask, { items });
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyInspectTaskEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", "inspect_task", entity);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyInspectTaskDto): Promise<SafetyInspectTaskEntity> {
    const plan = dto.plan_id ? await this.findPlan(scope, dto.plan_id) : null;
    const template = await this.assertEnabledTemplate(scope, dto.template_id);
    const point = await this.assertEnabledPoint(scope, dto.point_id);
    const handler = await this.assertEnabledUser(scope, dto.handler_id);
    if (plan && plan.templateId !== template.id) {
      throw new BadRequestException("template_id must match the inspect plan template");
    }
    if (plan && !plan.pointIds.includes(point.id)) {
      throw new BadRequestException("point_id must belong to the inspect plan");
    }
    await this.assertDictValue(scope, "safety_inspect_task_status", TASK_STATUS_PENDING);
    const planTime = this.parseDate(dto.plan_time, new Date());
    const dueTime = this.parseDate(dto.due_time, this.addHours(planTime, DEFAULT_DUE_HOURS));
    if (dto.plan_id) {
      await this.assertTaskNotDuplicated(scope, dto.plan_id, point.id, planTime);
    }
    const generated = dto.task_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_TASK_CODE");
    const taskCode = dto.task_code ?? generated?.code ?? "";
    await this.assertTaskCodeAvailable(scope, taskCode);
    const saved = await this.tasksRepository.manager.transaction(async (manager) => {
      const task = manager.getRepository(SafetyInspectTaskEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: taskCode,
        taskCode,
        planId: dto.plan_id ?? null,
        templateId: template.id,
        pointId: point.id,
        handlerId: handler.id,
        handlerName: handler.displayName,
        planTime,
        dueTime,
        scanOk: false,
        result: null,
        status: TASK_STATUS_PENDING,
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const entity = await manager.getRepository(SafetyInspectTaskEntity).save(task);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_inspect_task",
        bizId: entity.id,
        action: "create",
        afterStatus: TASK_STATUS_PENDING,
        content: "手工创建巡检任务",
        payload: { task_code: entity.taskCode, point_id: point.id, handler_id: handler.id }
      });
      return entity;
    });
    return this.detail(scope, saved.id, actor);
  }

  async generateFromPlan(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    planId: string,
    dto: GenerateSafetyInspectTasksDto
  ): Promise<GenerateSafetyInspectTasksResult> {
    const plan = await this.findPlan(scope, planId);
    if (plan.status !== "enabled") {
      throw new BadRequestException("Only enabled inspect plans can generate tasks");
    }
    await this.assertEnabledTemplate(scope, plan.templateId);
    const points = await this.findEnabledPoints(scope, plan.pointIds);
    if (points.length !== plan.pointIds.length) {
      throw new BadRequestException("Inspect plan contains invalid or disabled points");
    }
    const handlers = await this.resolvePlanHandlers(scope, plan);
    if (handlers.length === 0) {
      throw new BadRequestException("Inspect plan has no enabled handler users");
    }
    const planTime = this.parseDate(dto.plan_time, plan.nextGenerateTime ?? new Date());
    const dueTime = this.parseDate(dto.due_time, this.addHours(planTime, DEFAULT_DUE_HOURS));
    const existingTasks = await this.tasksRepository
      .createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.plan_id = :planId", { planId })
      .andWhere("task.plan_time = :planTime", { planTime })
      .andWhere("task.point_id IN (:...pointIds)", { pointIds: plan.pointIds })
      .andWhere("task.is_deleted = false")
      .getMany();
    const existingPointIds = new Set(existingTasks.map((task) => task.pointId));
    const existingByPoint = new Map(existingTasks.map((task) => [task.pointId, task]));
    const rows: GenerateSafetyInspectTasksResultRow[] = [];
    let generatedCount = 0;
    await this.tasksRepository.manager.transaction(async (manager) => {
      for (const [index, pointId] of plan.pointIds.entries()) {
        const point = points.find((item) => item.id === pointId);
        if (!point) continue;
        const handler = handlers[index % handlers.length];
        if (!handler) {
          throw new BadRequestException("Inspect plan has no enabled handler users");
        }
        const existing = existingByPoint.get(point.id);
        if (existingPointIds.has(point.id) && existing) {
          rows.push({
            point_id: point.id,
            point_name: point.pointName,
            handler_id: existing.handlerId,
            handler_name: existing.handlerName,
            task_code: existing.taskCode,
            id: existing.id,
            status: "skipped",
            reason: "同一计划、点位、计划时间已有巡检任务"
          });
          continue;
        }
        const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_INSPECT_TASK_CODE");
        const task = manager.getRepository(SafetyInspectTaskEntity).create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          code: generated.code,
          taskCode: generated.code,
          planId: plan.id,
          templateId: plan.templateId,
          pointId: point.id,
          handlerId: handler.id,
          handlerName: handler.displayName,
          planTime,
          dueTime,
          scanOk: false,
          result: null,
          status: TASK_STATUS_PENDING,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: `由巡检计划 ${plan.planCode} 生成`
        });
        const saved = await manager.getRepository(SafetyInspectTaskEntity).save(task);
        generatedCount += 1;
        rows.push({
          point_id: point.id,
          point_name: point.pointName,
          handler_id: handler.id,
          handler_name: handler.displayName,
          task_code: saved.taskCode,
          id: saved.id,
          status: "generated"
        });
        await this.createActionLog(scope, actor, manager, {
          bizType: "safety_inspect_task",
          bizId: saved.id,
          action: "generate",
          afterStatus: TASK_STATUS_PENDING,
          content: "巡检计划生成任务",
          payload: { plan_id: plan.id, plan_code: plan.planCode, point_id: point.id, handler_id: handler.id }
        });
      }
      plan.lastGenerateTime = planTime;
      plan.nextGenerateTime = this.computeNextGenerateTime(planTime, plan.frequencyType);
      plan.updateBy = actor.sub;
      await manager.getRepository(SafetyInspectPlanEntity).save(plan);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_inspect_plan",
        bizId: plan.id,
        action: "generate_tasks",
        content: "巡检计划批量生成任务",
        payload: { generated_count: generatedCount, skipped_count: rows.length - generatedCount, plan_time: planTime.toISOString() }
      });
    });
    return {
      plan_id: plan.id,
      plan_time: planTime.toISOString(),
      due_time: dueTime.toISOString(),
      generated_count: generatedCount,
      skipped_count: rows.length - generatedCount,
      rows
    };
  }

  async start(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SafetyInspectTaskEntity> {
    const task = await this.findOne(scope, id, actor);
    this.assertCanExecute(task, actor);
    if (![TASK_STATUS_PENDING, TASK_STATUS_OVERDUE].includes(task.status)) {
      throw new BadRequestException("Only pending or overdue inspect tasks can be started");
    }
    const beforeStatus = task.status;
    task.status = TASK_STATUS_IN_PROGRESS;
    task.actualStartTime = new Date();
    task.updateBy = actor.sub;
    await this.tasksRepository.manager.transaction(async (manager) => {
      await manager.getRepository(SafetyInspectTaskEntity).save(task);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_inspect_task",
        bizId: task.id,
        action: "start",
        beforeStatus,
        afterStatus: task.status,
        content: "开始巡检任务"
      });
    });
    return this.detail(scope, task.id, actor);
  }

  async checkIn(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: CheckInSafetyInspectTaskDto): Promise<SafetyInspectTaskEntity> {
    const task = await this.findOne(scope, id, actor);
    this.assertCanExecute(task, actor);
    if (![TASK_STATUS_PENDING, TASK_STATUS_IN_PROGRESS, TASK_STATUS_OVERDUE].includes(task.status)) {
      throw new BadRequestException("Only pending, in-progress or overdue inspect tasks can check in");
    }
    const point = task.point ?? (await this.assertEnabledPoint(scope, task.pointId));
    const photoIds = dto.photo_file_ids ?? [];
    if (point.requiredScan) {
      const expectedQrCode = point.qrCode ?? point.pointCode;
      if (!dto.qr_code || dto.qr_code !== expectedQrCode) {
        throw new BadRequestException("qr_code does not match the inspect point");
      }
    }
    if (point.requiredGps && (dto.gps_lng === undefined || dto.gps_lat === undefined)) {
      throw new BadRequestException("gps_lng and gps_lat are required for this inspect point");
    }
    if (photoIds.length < point.requiredPhotoCount) {
      throw new BadRequestException("photo_file_ids count is less than inspect point requirement");
    }
    await this.assertFiles(scope, photoIds);
    const beforeStatus = task.status;
    task.status = TASK_STATUS_IN_PROGRESS;
    task.actualStartTime = task.actualStartTime ?? new Date();
    task.scanOk = true;
    task.gpsLng = dto.gps_lng === undefined ? task.gpsLng : dto.gps_lng.toFixed(6);
    task.gpsLat = dto.gps_lat === undefined ? task.gpsLat : dto.gps_lat.toFixed(6);
    task.gpsOffsetMeter = this.computeGpsOffset(point, dto.gps_lng, dto.gps_lat);
    task.photoFileIds = photoIds;
    task.updateBy = actor.sub;
    await this.tasksRepository.manager.transaction(async (manager) => {
      await manager.getRepository(SafetyInspectTaskEntity).save(task);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_inspect_task",
        bizId: task.id,
        action: "check_in",
        beforeStatus,
        afterStatus: task.status,
        content: "巡检扫码打卡",
        payload: { gps_lng: task.gpsLng, gps_lat: task.gpsLat, photo_count: photoIds.length }
      });
    });
    return this.detail(scope, task.id, actor);
  }

  async saveDraft(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SubmitSafetyInspectResultsDto
  ): Promise<SafetyInspectTaskEntity> {
    return this.submitResults(scope, actor, id, { ...dto, finish_task: false });
  }

  async submitResults(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SubmitSafetyInspectResultsDto
  ): Promise<SafetyInspectTaskEntity> {
    const task = await this.findOne(scope, id, actor);
    this.assertCanExecute(task, actor);
    if (![TASK_STATUS_PENDING, TASK_STATUS_IN_PROGRESS, TASK_STATUS_OVERDUE].includes(task.status)) {
      throw new BadRequestException("Only pending, in-progress or overdue inspect tasks can submit results");
    }
    if (!dto.results || dto.results.length === 0) {
      throw new BadRequestException("results is required");
    }
    const finishTask = dto.finish_task !== false;
    const items = await this.itemsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, templateId: task.templateId, isDeleted: false, status: "enabled" },
      order: { sortNo: "ASC", createTime: "ASC" }
    });
    const itemMap = new Map(items.map((item) => [item.id, item]));
    const submittedItemIds = new Set(dto.results.map((result) => result.item_id));
    for (const item of items) {
      if (finishTask && item.required && !submittedItemIds.has(item.id)) {
        throw new BadRequestException(`Required inspect item is missing: ${item.itemName}`);
      }
    }
    for (const result of dto.results) {
      if (!itemMap.has(result.item_id)) {
        throw new BadRequestException("result item_id must belong to current inspect task template");
      }
      await this.assertDictValue(scope, "safety_inspect_item_result", result.result);
      await this.assertFiles(scope, result.photo_file_ids ?? []);
      if (finishTask && result.result === TASK_RESULT_ABNORMAL && !(result.value_text?.trim())) {
        throw new BadRequestException("abnormal inspect item requires value_text");
      }
    }
    const existingResults = await this.taskResultsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, taskId: task.id, isDeleted: false }
    });
    const existingByItem = new Map(existingResults.map((result) => [result.itemId, result]));
    let hasAbnormal = false;
    const beforeStatus = task.status;
    await this.tasksRepository.manager.transaction(async (manager) => {
      for (const payload of dto.results) {
        const item = itemMap.get(payload.item_id);
        if (!item) continue;
        const photoIds = payload.photo_file_ids ?? [];
        const isAbnormal = payload.result === TASK_RESULT_ABNORMAL;
        hasAbnormal = hasAbnormal || isAbnormal;
        const resultRepository = manager.getRepository(SafetyInspectTaskResultEntity);
        const existingResult = existingByItem.get(item.id);
        let savedResult: SafetyInspectTaskResultEntity;
        if (existingResult) {
          existingResult.taskId = task.id;
          existingResult.itemName = item.itemName;
          existingResult.result = payload.result;
          existingResult.valueText = payload.value_text?.trim() || null;
          existingResult.valueNumber = payload.value_number === undefined ? null : String(payload.value_number);
          existingResult.photoFileIds = photoIds;
          existingResult.isAbnormal = isAbnormal;
          existingResult.updateBy = actor.sub;
          savedResult = await resultRepository.save(existingResult);
        } else {
          const newResult = resultRepository.create({
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            taskId: task.id,
            itemId: item.id,
            itemName: item.itemName,
            result: payload.result,
            valueText: payload.value_text?.trim() || null,
            valueNumber: payload.value_number === undefined ? null : String(payload.value_number),
            photoFileIds: photoIds,
            isAbnormal,
            hazardCreated: false,
            hazardId: null,
            createBy: actor.sub,
            updateBy: actor.sub
          });
          savedResult = await resultRepository.save(newResult);
        }
        if (finishTask && isAbnormal && payload.create_hazard !== false && !savedResult.hazardCreated) {
          const hazard = await this.createHazardFromResult(scope, actor, manager, task, item, savedResult);
          savedResult.hazardCreated = true;
          savedResult.hazardId = hazard.id;
          savedResult = await manager.getRepository(SafetyInspectTaskResultEntity).save(savedResult);
        }
      }
      task.status = finishTask ? TASK_STATUS_COMPLETED : TASK_STATUS_IN_PROGRESS;
      task.result = hasAbnormal ? TASK_RESULT_ABNORMAL : TASK_RESULT_NORMAL;
      task.actualStartTime = task.actualStartTime ?? new Date();
      task.actualEndTime = finishTask ? new Date() : task.actualEndTime;
      task.updateBy = actor.sub;
      await manager.getRepository(SafetyInspectTaskEntity).save(task);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_inspect_task",
        bizId: task.id,
        action: finishTask ? "finish" : "save_draft",
        beforeStatus,
        afterStatus: task.status,
        content: finishTask ? "提交结果并完成巡检任务" : "保存巡检草稿",
        payload: { result: task.result, abnormal: hasAbnormal, finish_task: finishTask, result_count: dto.results.length }
      });
    });
    return this.detail(scope, task.id, actor);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyInspectTaskEntity> {
    return this.tasksRepository
      .createQueryBuilder("task")
      .leftJoinAndSelect("task.plan", "plan")
      .leftJoinAndSelect("task.template", "template")
      .leftJoinAndSelect("task.point", "point")
      .leftJoinAndSelect("task.handler", "handler")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyInspectTaskEntity>, query: SafetyInspectTaskQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("task.task_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("template.template_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("point.point_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("handler.display_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.plan_id) builder.andWhere("task.plan_id = :planId", { planId: query.plan_id });
    if (query.template_id) builder.andWhere("task.template_id = :templateId", { templateId: query.template_id });
    if (query.point_id) builder.andWhere("task.point_id = :pointId", { pointId: query.point_id });
    if (query.handler_id) builder.andWhere("task.handler_id = :handlerId", { handlerId: query.handler_id });
    if (query.status) builder.andWhere("task.status = :status", { status: query.status });
    if (query.result) builder.andWhere("task.result = :result", { result: query.result });
    if (query.plan_start) builder.andWhere("task.plan_time >= :planStart", { planStart: new Date(query.plan_start) });
    if (query.plan_end) builder.andWhere("task.plan_time <= :planEnd", { planEnd: new Date(query.plan_end) });
  }

  private applySort(builder: SelectQueryBuilder<SafetyInspectTaskEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      task_code: "task.taskCode",
      plan_time: "task.planTime",
      due_time: "task.dueTime",
      status: "task.status",
      result: "task.result",
      update_time: "task.updateTime",
      create_time: "task.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "task.planTime", direction as "ASC" | "DESC");
      return;
    }
    builder.orderBy("task.planTime", "DESC").addOrderBy("task.createTime", "DESC");
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyInspectTaskEntity> {
    const builder = this.scopedBuilder(scope).andWhere("task.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Inspect task not found");
    }
    entity.results = await this.taskResultsRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, taskId: entity.id, isDeleted: false },
      order: { createTime: "ASC" }
    });
    return entity;
  }

  private assertCanExecute(task: SafetyInspectTaskEntity, actor: JwtPrincipal): void {
    if (actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes("safety_inspect_task:manage_all")) {
      return;
    }
    if (task.handlerId !== actor.sub) {
      throw new ForbiddenException("Only task handler can execute this inspect task");
    }
  }

  private async findPlan(scope: TenantParkScope, id: string): Promise<SafetyInspectPlanEntity> {
    const entity = await this.plansRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Inspect plan not found");
    }
    return entity;
  }

  private async assertEnabledTemplate(scope: TenantParkScope, id?: string): Promise<SafetyInspectTemplateEntity> {
    if (!id) throw new BadRequestException("template_id is required");
    const entity = await this.templatesRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (!entity) {
      throw new BadRequestException("template_id must reference an enabled inspect template in current park");
    }
    return entity;
  }

  private async assertEnabledPoint(scope: TenantParkScope, id?: string): Promise<SafetyInspectPointEntity> {
    if (!id) throw new BadRequestException("point_id is required");
    const entity = await this.pointsRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (!entity) {
      throw new BadRequestException("point_id must reference an enabled inspect point in current park");
    }
    return entity;
  }

  private async findEnabledPoints(scope: TenantParkScope, ids: string[]): Promise<SafetyInspectPointEntity[]> {
    if (ids.length === 0) return [];
    return this.pointsRepository.find({
      where: { id: In(ids), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
  }

  private async assertEnabledUser(scope: TenantParkScope, id?: string): Promise<UserEntity> {
    if (!id) throw new BadRequestException("handler_id is required");
    const entity = await this.usersRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (!entity) {
      throw new BadRequestException("handler_id must reference an enabled user in current park");
    }
    return entity;
  }

  private async assertFiles(scope: TenantParkScope, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) {
      return;
    }
    const count = await this.filesRepository.count({
      where: { id: In(fileIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (count !== new Set(fileIds).size) {
      throw new BadRequestException("file_id must belong to current tenant and park");
    }
  }

  private computeGpsOffset(point: SafetyInspectPointEntity, gpsLng?: number, gpsLat?: number): string | null {
    if (gpsLng === undefined || gpsLat === undefined || !point.gpsLng || !point.gpsLat) {
      return null;
    }
    const pointLng = Number(point.gpsLng);
    const pointLat = Number(point.gpsLat);
    if (!Number.isFinite(pointLng) || !Number.isFinite(pointLat)) {
      return null;
    }
    const toRadians = (value: number) => (value * Math.PI) / 180;
    const earthRadiusMeter = 6371000;
    const deltaLat = toRadians(gpsLat - pointLat);
    const deltaLng = toRadians(gpsLng - pointLng);
    const a = Math.sin(deltaLat / 2) ** 2
      + Math.cos(toRadians(pointLat)) * Math.cos(toRadians(gpsLat)) * Math.sin(deltaLng / 2) ** 2;
    const distance = 2 * earthRadiusMeter * Math.asin(Math.sqrt(a));
    return distance.toFixed(2);
  }

  private async createHazardFromResult(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    task: SafetyInspectTaskEntity,
    item: SafetyInspectItemEntity,
    result: SafetyInspectTaskResultEntity
  ): Promise<SafetyHazardEntity> {
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_CODE");
    const point = task.point ?? (await this.assertEnabledPoint(scope, task.pointId));
    const hazard = manager.getRepository(SafetyHazardEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      hazardCode: generated.code,
      title: `${point.pointName} - ${item.itemName}`,
      hazardTitle: `${point.pointName} - ${item.itemName}`,
      hazardType: item.hazardType ?? "other",
      riskLevel: item.defaultRiskLevel ?? point.riskLevel,
      sourceType: "inspection",
      sourceId: task.id,
      inspectTaskId: task.id,
      inspectPointId: point.id,
      parkTenantId: point.parkTenantId,
      buildingId: point.buildingId,
      floorId: point.floorId,
      unitId: point.unitId,
      location: point.location ?? point.pointName,
      description: result.valueText ?? item.standardDesc ?? null,
      photoFileIds: result.photoFileIds,
      beforePhotoFileIds: result.photoFileIds,
      afterPhotoFileIds: [],
      rectifyUserId: null,
      rectifyUserName: null,
      rectifyDeadline: null,
      rectifyTime: null,
      recheckUserId: null,
      recheckUserName: null,
      recheckTime: null,
      recheckResult: null,
      overdueFlag: false,
      upgradeFlag: false,
      workOrderId: null,
      status: HAZARD_STATUS_PENDING,
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: "由巡检异常项自动创建"
    });
    const saved = await manager.getRepository(SafetyHazardEntity).save(hazard);
    await this.createHazardStatusLog(scope, actor, manager, saved.id, null, saved.status, "create", "巡检异常自动创建隐患");
    await this.createActionLog(scope, actor, manager, {
      bizType: "safety_hazard",
      bizId: saved.id,
      action: "create",
      afterStatus: saved.status,
      content: "巡检异常自动创建隐患",
      payload: { task_id: task.id, result_id: result.id, item_id: item.id }
    });
    return saved;
  }

  private async createHazardStatusLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    hazardId: string,
    beforeStatus: string | null,
    afterStatus: string,
    action: string,
    reason: string
  ): Promise<void> {
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_LOG_CODE");
    const log = manager.getRepository(SafetyHazardStatusLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      hazardId,
      beforeStatus,
      afterStatus,
      action,
      reason,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyHazardStatusLogEntity).save(log);
  }

  private async resolvePlanHandlers(scope: TenantParkScope, plan: SafetyInspectPlanEntity): Promise<UserEntity[]> {
    if (plan.handlerUserIds.length > 0) {
      return this.usersRepository.find({
        where: { id: In(plan.handlerUserIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
      });
    }
    if (plan.handlerRoleCodes.length === 0) {
      return [];
    }
    return this.usersRepository
      .createQueryBuilder("user")
      .innerJoin(UserRoleEntity, "userRole", "userRole.user_id = user.id AND userRole.is_deleted = false")
      .innerJoin("userRole.role", "role")
      .where("user.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("user.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("user.is_deleted = false")
      .andWhere("user.status = :status", { status: "enabled" })
      .andWhere("role.code IN (:...roleCodes)", { roleCodes: plan.handlerRoleCodes })
      .andWhere("role.is_deleted = false")
      .andWhere("role.status = :status", { status: "enabled" })
      .orderBy("user.display_name", "ASC")
      .getMany();
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue?: string | null): Promise<void> {
    if (!itemValue) {
      throw new BadRequestException(`${dictCode} value is required`);
    }
    const item = await this.dictItemsRepository
      .createQueryBuilder("item")
      .innerJoin("item.dictType", "dictType")
      .where("item.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("item.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("item.is_deleted = false")
      .andWhere("item.status = :status", { status: "enabled" })
      .andWhere("dictType.dict_code = :dictCode", { dictCode })
      .andWhere("item.item_value = :itemValue", { itemValue })
      .getOne();
    if (!item) {
      throw new BadRequestException(`${dictCode} value is invalid`);
    }
  }

  private async assertTaskNotDuplicated(scope: TenantParkScope, planId: string, pointId: string, planTime: Date): Promise<void> {
    const count = await this.tasksRepository
      .createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.plan_id = :planId", { planId })
      .andWhere("task.point_id = :pointId", { pointId })
      .andWhere("task.plan_time = :planTime", { planTime })
      .andWhere("task.is_deleted = false")
      .getCount();
    if (count > 0) {
      throw new ConflictException("Inspect task already exists for same plan, point and plan_time");
    }
  }

  private async assertTaskCodeAvailable(scope: TenantParkScope, taskCode: string): Promise<void> {
    const count = await this.tasksRepository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, taskCode, isDeleted: false }
    });
    if (count > 0) {
      throw new ConflictException("Inspect task code already exists");
    }
  }

  private async createActionLog(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    options: {
      bizType: string;
      bizId: string | null;
      action: string;
      beforeStatus?: string | null;
      afterStatus?: string | null;
      reason?: string | null;
      content?: string | null;
      payload?: Record<string, unknown>;
    }
  ): Promise<void> {
    const log = manager.getRepository(SafetyActionLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bizType: options.bizType,
      bizId: options.bizId,
      action: options.action,
      beforeStatus: options.beforeStatus ?? null,
      afterStatus: options.afterStatus ?? null,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      reason: options.reason ?? null,
      content: options.content ?? null,
      opTime: new Date(),
      payload: options.payload ?? {},
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyActionLogEntity).save(log);
  }

  private parseDate(value: string | Date | undefined | null, fallback: Date): Date {
    if (!value) {
      return fallback;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date value");
    }
    return date;
  }

  private addHours(value: Date, hours: number): Date {
    return new Date(value.getTime() + hours * 60 * 60 * 1000);
  }

  private computeNextGenerateTime(planTime: Date, frequencyType: string): Date {
    const next = new Date(planTime.getTime());
    if (frequencyType === "weekly") next.setUTCDate(next.getUTCDate() + 7);
    else if (frequencyType === "monthly") next.setUTCMonth(next.getUTCMonth() + 1);
    else if (frequencyType === "quarterly") next.setUTCMonth(next.getUTCMonth() + 3);
    else if (frequencyType === "yearly") next.setUTCFullYear(next.getUTCFullYear() + 1);
    else next.setUTCDate(next.getUTCDate() + 1);
    return next;
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyInspectTaskEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "task", "park_id", parkFilter, "safetyTaskParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "building_id", buildingFilter, "safetyTaskBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "floor_id", floorFilter, "safetyTaskFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "unit_id", unitFilter, "safetyTaskUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "point", "park_tenant_id", tenantCompanyFilter, "safetyTaskTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "task", "handler_id", handlerFilter, "safetyTaskHandlerScopeIds");
    if (this.isSelfScope(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_INSPECT_TASK_MANAGE_ALL)) {
      builder.andWhere("task.handler_id = :currentSafetyTaskHandlerId", { currentSafetyTaskHandlerId: actor.sub });
    }
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyInspectTaskEntity>,
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

  private isSelfScope(actor: JwtPrincipal): boolean {
    return actor.dataScope === "self" || actor.dataScope === "10";
  }
}
