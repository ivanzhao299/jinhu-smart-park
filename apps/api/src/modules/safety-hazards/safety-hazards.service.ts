import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, DataSource, In, type EntityManager, Repository, SelectQueryBuilder } from "typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyEmergencyEventEntity } from "../safety-emergency/entities/safety-emergency-event.entity";
import { SafetyEmergencyTimelineEntity } from "../safety-emergency/entities/safety-emergency-timeline.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type { CreateWorkOrderDto } from "../work-orders/dto/create-work-order.dto";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { AssignRectifySafetyHazardDto } from "./dto/assign-rectify-safety-hazard.dto";
import { CreateHazardEmergencyDto } from "./dto/create-hazard-emergency.dto";
import { CreateHazardWorkOrderDto } from "./dto/create-hazard-work-order.dto";
import { CreateSafetyHazardDto } from "./dto/create-safety-hazard.dto";
import { RectifySafetyHazardDto } from "./dto/rectify-safety-hazard.dto";
import { ReasonSafetyHazardActionDto } from "./dto/reason-safety-hazard-action.dto";
import { RecheckSafetyHazardDto } from "./dto/recheck-safety-hazard.dto";
import { SafetyHazardQueryDto } from "./dto/safety-hazard-query.dto";
import { UpdateSafetyHazardDto } from "./dto/update-safety-hazard.dto";
import { SafetyHazardStatusLogEntity } from "./entities/safety-hazard-status-log.entity";

const HAZARD_STATUS_REGISTERED = "10";
const HAZARD_STATUS_ASSIGNED = "20";
const HAZARD_STATUS_RECTIFYING = "30";
const HAZARD_STATUS_RECTIFIED = "40";
const HAZARD_STATUS_CLOSED = "60";
const HAZARD_STATUS_OVERDUE = "70";
const HAZARD_STATUS_UPGRADED = "80";
const HAZARD_STATUS_WORK_ORDER = "91";
const HAZARD_STATUS_EMERGENCY = "92";
const HAZARD_SOURCE_MANUAL = "manual";
const WORK_ORDER_SOURCE_INSPECTION = "inspection";
const EMERGENCY_SOURCE_HAZARD = "hazard";
const EMERGENCY_STATUS_REPORTED = "10";
const DEFAULT_HAZARD_WORK_ORDER_TYPE = "repair";
const SAFETY_MODULE = "safety";
const HAZARD_ENTITY = "safety_hazard";
const RECHECK_PASS = "pass";
const RECHECK_FAIL = "fail";
const RECTIFIABLE_STATUSES = new Set([
  HAZARD_STATUS_ASSIGNED,
  HAZARD_STATUS_RECTIFYING,
  HAZARD_STATUS_OVERDUE,
  HAZARD_STATUS_UPGRADED
]);

interface ResolvedLocation {
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
  location: string;
}

export interface SafetyHazardRecentItem {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  source_type: string;
  status: string;
  location: string;
  description?: string | null;
  rectify_user_name: string | null;
  rectify_deadline: Date | null;
  overdue_flag: boolean;
  before_photo_file_ids?: string[] | null;
  after_photo_file_ids?: string[] | null;
  update_time: Date;
}

export interface TenantHazardsNode {
  available: true;
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
    closed_count: number;
  };
  recent_items: SafetyHazardRecentItem[];
}

export interface UnitHazardsNode {
  summary: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
  };
  recent_items: SafetyHazardRecentItem[];
}

@Injectable()
export class SafetyHazardsService {
  constructor(
    @InjectRepository(SafetyHazardEntity)
    private readonly hazardsRepository: Repository<SafetyHazardEntity>,
    @InjectRepository(SafetyHazardStatusLogEntity)
    private readonly statusLogsRepository: Repository<SafetyHazardStatusLogEntity>,
    @InjectRepository(SafetyActionLogEntity)
    private readonly actionLogsRepository: Repository<SafetyActionLogEntity>,
    @InjectRepository(SafetyEmergencyEventEntity)
    private readonly emergencyEventsRepository: Repository<SafetyEmergencyEventEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly workOrdersService: WorkOrdersService,
    private readonly dataSource: DataSource
  ) {}

  async list(scope: TenantParkScope, query: SafetyHazardQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<SafetyHazardEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, SAFETY_MODULE, HAZARD_ENTITY, items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async overdue(scope: TenantParkScope, query: SafetyHazardQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<SafetyHazardEntity>> {
    return this.list(scope, { ...query, overdue_only: true }, actor);
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, SAFETY_MODULE, HAZARD_ENTITY, entity);
  }

  async statusLogs(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyHazardStatusLogEntity[]> {
    await this.detail(scope, id, actor);
    return this.statusLogsRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.hazard_id = :id", { id })
      .andWhere("log.is_deleted = false")
      .orderBy("log.opTime", "DESC")
      .getMany();
  }

  async tenant360Hazards(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<TenantHazardsNode> {
    const builder = this.scopedBuilder(scope)
      .andWhere("hazard.park_tenant_id = :parkTenantId", { parkTenantId })
      .orderBy("hazard.updateTime", "DESC")
      .addOrderBy("hazard.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const hazards = await builder.getMany();
    const closedHazards = hazards.filter((hazard) => this.isClosedHazard(hazard));
    return {
      available: true,
      summary: {
        total_count: hazards.length,
        open_count: hazards.length - closedHazards.length,
        overdue_count: hazards.filter((hazard) => hazard.overdueFlag).length,
        major_count: hazards.filter((hazard) => this.isMajorHazard(hazard)).length,
        closed_count: closedHazards.length
      },
      recent_items: await this.secureRecentHazards(scope, actor, hazards.slice(0, 5))
    };
  }

  async unitHazards(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<UnitHazardsNode> {
    const builder = this.scopedBuilder(scope)
      .andWhere("hazard.unit_id = :unitId", { unitId })
      .orderBy("hazard.updateTime", "DESC")
      .addOrderBy("hazard.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const hazards = await builder.getMany();
    return {
      summary: {
        total_count: hazards.length,
        open_count: hazards.filter((hazard) => !this.isClosedHazard(hazard)).length,
        overdue_count: hazards.filter((hazard) => hazard.overdueFlag).length,
        major_count: hazards.filter((hazard) => this.isMajorHazard(hazard)).length
      },
      recent_items: await this.secureRecentHazards(scope, actor, hazards.slice(0, 5))
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyHazardDto): Promise<SafetyHazardEntity> {
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.hazard_type, "hazard_type is required");
    this.assertRequired(dto.risk_level, "risk_level is required");
    this.assertRequired(dto.description, "description is required");
    this.assertRequired(dto.location, "location is required");
    const sourceType = dto.source_type ?? HAZARD_SOURCE_MANUAL;
    const status = dto.status ?? HAZARD_STATUS_REGISTERED;
    await this.validateDictionaries(scope, dto.hazard_type, dto.risk_level, sourceType, status);
    this.assertMajorDeadline(dto.risk_level, dto.rectify_deadline);
    const location = await this.resolveLocation(scope, dto.building_id, dto.floor_id, dto.unit_id, dto.location);
    await this.assertParkTenant(scope, dto.park_tenant_id);
    await this.assertFiles(scope, [...(dto.before_photo_file_ids ?? []), ...(dto.after_photo_file_ids ?? [])]);
    const rectifyUser = await this.assertUser(scope, dto.rectify_user_id);
    const recheckUser = await this.assertUser(scope, dto.recheck_user_id);
    await this.assertWorkOrder(scope, dto.work_order_id);
    const generated = dto.hazard_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_CODE");
    const hazardCode = dto.hazard_code ?? generated?.code ?? "";
    await this.assertHazardCodeAvailable(scope, hazardCode);

    const saved = await this.dataSource.transaction(async (manager) => {
      const hazard = manager.getRepository(SafetyHazardEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: hazardCode,
        hazardCode,
        title: dto.title,
        hazardTitle: dto.title,
        hazardType: dto.hazard_type,
        riskLevel: dto.risk_level,
        sourceType,
        sourceId: dto.source_id ?? null,
        inspectTaskId: sourceType === "inspection" ? dto.source_id ?? null : null,
        inspectPointId: null,
        parkTenantId: dto.park_tenant_id ?? null,
        buildingId: location.buildingId,
        floorId: location.floorId,
        unitId: location.unitId,
        location: location.location,
        description: dto.description,
        photoFileIds: dto.before_photo_file_ids ?? [],
        beforePhotoFileIds: dto.before_photo_file_ids ?? [],
        afterPhotoFileIds: dto.after_photo_file_ids ?? [],
        rectifyUserId: dto.rectify_user_id ?? null,
        rectifyUserName: dto.rectify_user_name ?? rectifyUser?.displayName ?? null,
        rectifyDeadline: this.parseDate(dto.rectify_deadline),
        rectifyTime: this.parseDate(dto.rectify_time),
        recheckUserId: dto.recheck_user_id ?? null,
        recheckUserName: dto.recheck_user_name ?? recheckUser?.displayName ?? null,
        recheckTime: this.parseDate(dto.recheck_time),
        recheckResult: dto.recheck_result ?? null,
        overdueFlag: dto.overdue_flag ?? false,
        upgradeFlag: dto.upgrade_flag ?? false,
        workOrderId: dto.work_order_id ?? null,
        status,
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(hazard);
      await this.createStatusLog(scope, actor, manager, result.id, null, result.status, "create", "隐患登记");
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "create",
        afterStatus: result.status,
        content: "人工登记隐患"
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async findBySource(
    scope: TenantParkScope,
    sourceType: string,
    sourceId: string | null | undefined
  ): Promise<SafetyHazardEntity | null> {
    if (!sourceId) return null;
    return this.hazardsRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        sourceType,
        sourceId,
        isDeleted: false
      }
    });
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSafetyHazardDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    const nextHazardType = dto.hazard_type ?? entity.hazardType ?? "";
    const nextRiskLevel = dto.risk_level ?? entity.riskLevel ?? "";
    const nextSourceType = dto.source_type ?? entity.sourceType;
    const nextStatus = dto.status ?? entity.status;
    await this.validateDictionaries(scope, nextHazardType, nextRiskLevel, nextSourceType, nextStatus);
    this.assertMajorDeadline(nextRiskLevel, dto.rectify_deadline ?? entity.rectifyDeadline?.toISOString());
    const nextCode = dto.hazard_code ?? entity.hazardCode;
    if (nextCode !== entity.hazardCode) {
      await this.assertHazardCodeAvailable(scope, nextCode, entity.id);
    }
    const location = await this.resolveLocation(
      scope,
      dto.building_id === undefined ? entity.buildingId : dto.building_id,
      dto.floor_id === undefined ? entity.floorId : dto.floor_id,
      dto.unit_id === undefined ? entity.unitId : dto.unit_id,
      dto.location === undefined ? entity.location : dto.location
    );
    await this.assertParkTenant(scope, dto.park_tenant_id === undefined ? entity.parkTenantId : dto.park_tenant_id);
    await this.assertFiles(scope, [
      ...(dto.before_photo_file_ids ?? entity.beforePhotoFileIds ?? []),
      ...(dto.after_photo_file_ids ?? entity.afterPhotoFileIds ?? [])
    ]);
    const rectifyUser = await this.assertUser(scope, dto.rectify_user_id === undefined ? entity.rectifyUserId ?? undefined : dto.rectify_user_id);
    const recheckUser = await this.assertUser(scope, dto.recheck_user_id === undefined ? entity.recheckUserId ?? undefined : dto.recheck_user_id);
    await this.assertWorkOrder(scope, dto.work_order_id === undefined ? entity.workOrderId ?? undefined : dto.work_order_id);
    const beforeStatus = entity.status;

    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        code: nextCode,
        hazardCode: nextCode,
        title: dto.title ?? entity.title,
        hazardTitle: dto.title ?? entity.hazardTitle,
        hazardType: nextHazardType,
        riskLevel: nextRiskLevel,
        sourceType: nextSourceType,
        sourceId: dto.source_id === undefined ? entity.sourceId : dto.source_id ?? null,
        parkTenantId: dto.park_tenant_id === undefined ? entity.parkTenantId : dto.park_tenant_id ?? null,
        buildingId: location.buildingId,
        floorId: location.floorId,
        unitId: location.unitId,
        location: location.location,
        description: dto.description ?? entity.description,
        photoFileIds: dto.before_photo_file_ids ?? entity.photoFileIds,
        beforePhotoFileIds: dto.before_photo_file_ids ?? entity.beforePhotoFileIds,
        afterPhotoFileIds: dto.after_photo_file_ids ?? entity.afterPhotoFileIds,
        rectifyUserId: dto.rectify_user_id === undefined ? entity.rectifyUserId : dto.rectify_user_id ?? null,
        rectifyUserName: dto.rectify_user_name ?? rectifyUser?.displayName ?? entity.rectifyUserName,
        rectifyDeadline: dto.rectify_deadline === undefined ? entity.rectifyDeadline : this.parseDate(dto.rectify_deadline),
        rectifyTime: dto.rectify_time === undefined ? entity.rectifyTime : this.parseDate(dto.rectify_time),
        recheckUserId: dto.recheck_user_id === undefined ? entity.recheckUserId : dto.recheck_user_id ?? null,
        recheckUserName: dto.recheck_user_name ?? recheckUser?.displayName ?? entity.recheckUserName,
        recheckTime: dto.recheck_time === undefined ? entity.recheckTime : this.parseDate(dto.recheck_time),
        recheckResult: dto.recheck_result === undefined ? entity.recheckResult : dto.recheck_result ?? null,
        overdueFlag: dto.overdue_flag ?? entity.overdueFlag,
        upgradeFlag: dto.upgrade_flag ?? entity.upgradeFlag,
        workOrderId: dto.work_order_id === undefined ? entity.workOrderId : dto.work_order_id ?? null,
        status: nextStatus,
        remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      if (beforeStatus !== result.status) {
        await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "update", "更新隐患状态");
      }
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "update",
        beforeStatus,
        afterStatus: result.status,
        content: "更新隐患登记信息"
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id);
    if (entity.status !== HAZARD_STATUS_REGISTERED && entity.status !== "draft" && entity.status !== "0") {
      throw new BadRequestException("Hazard has been issued for rectification and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: entity.id,
        action: "delete",
        beforeStatus: entity.status,
        afterStatus: entity.status,
        content: "软删除隐患"
      });
    });
    return { id };
  }

  async assignRectify(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: AssignRectifySafetyHazardDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status !== HAZARD_STATUS_REGISTERED) {
      throw new BadRequestException("Only registered hazards can be assigned for rectification");
    }
    this.assertRequired(dto.rectify_user_id, "rectify_user_id is required");
    this.assertRequired(dto.rectify_deadline, "rectify_deadline is required");
    this.assertRequired(dto.reason, "reason is required");
    const rectifyUser = await this.assertUser(scope, dto.rectify_user_id);
    const rectifyDeadline = this.parseDate(dto.rectify_deadline);
    if (!rectifyDeadline) throw new BadRequestException("rectify_deadline is required");
    const beforeStatus = entity.status;

    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        rectifyUserId: dto.rectify_user_id,
        rectifyUserName: rectifyUser?.displayName ?? rectifyUser?.username ?? null,
        rectifyDeadline,
        status: HAZARD_STATUS_ASSIGNED,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "assign_rectify", dto.reason);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "assign_rectify",
        beforeStatus,
        afterStatus: result.status,
        content: dto.reason
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async rectify(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RectifySafetyHazardDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Closed hazards cannot be rectified again");
    }
    if (!RECTIFIABLE_STATUSES.has(entity.status)) {
      throw new BadRequestException("Only assigned or in-progress hazards can be rectified");
    }
    if (!this.canRectifyHazard(actor, entity)) {
      throw new ForbiddenException("Only the rectification owner or safety manager can rectify this hazard");
    }
    this.assertRequired(dto.rectify_note, "rectify_note is required");
    if (!dto.after_photo_file_ids || dto.after_photo_file_ids.length === 0) {
      throw new BadRequestException("after_photo_file_ids must contain at least one photo");
    }
    await this.assertFiles(scope, dto.after_photo_file_ids);
    const beforeStatus = entity.status;

    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        afterPhotoFileIds: dto.after_photo_file_ids,
        rectifyTime: new Date(),
        status: HAZARD_STATUS_RECTIFIED,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "rectify", dto.rectify_note);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "rectify",
        beforeStatus,
        afterStatus: result.status,
        content: dto.rectify_note
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async recheck(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RecheckSafetyHazardDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Closed hazards cannot be rechecked");
    }
    if (entity.status !== HAZARD_STATUS_RECTIFIED) {
      throw new BadRequestException("Only rectified hazards can be rechecked");
    }
    this.assertRequired(dto.reason, "reason is required");
    const beforeStatus = entity.status;
    const afterStatus = dto.recheck_result === RECHECK_PASS ? HAZARD_STATUS_CLOSED : HAZARD_STATUS_RECTIFYING;
    const action = dto.recheck_result === RECHECK_PASS ? "recheck_pass" : "recheck_fail";
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        recheckUserId: actor.sub,
        recheckUserName: actor.realName ?? actor.username,
        recheckTime: new Date(),
        recheckResult: dto.recheck_result,
        status: afterStatus,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, action, dto.reason);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action,
        beforeStatus,
        afterStatus: result.status,
        content: dto.reason
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async rejectRectify(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonSafetyHazardActionDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Closed hazards cannot be returned for rectification");
    }
    if (entity.status !== HAZARD_STATUS_RECTIFIED) {
      throw new BadRequestException("Only rectified hazards can be returned for rectification");
    }
    this.assertRequired(dto.reason, "reason is required");
    const beforeStatus = entity.status;
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        recheckUserId: actor.sub,
        recheckUserName: actor.realName ?? actor.username,
        recheckTime: new Date(),
        recheckResult: RECHECK_FAIL,
        status: HAZARD_STATUS_RECTIFYING,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "reject_rectify", dto.reason);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "reject_rectify",
        beforeStatus,
        afterStatus: result.status,
        content: dto.reason
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonSafetyHazardActionDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Hazard is already closed");
    }
    this.assertRequired(dto.reason, "reason is required");
    if (entity.recheckResult !== RECHECK_PASS && !this.canForceCloseHazard(actor)) {
      throw new ForbiddenException("Only recheck-passed hazards can be closed, or force close permission is required");
    }
    const beforeStatus = entity.status;
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        status: HAZARD_STATUS_CLOSED,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "close", dto.reason);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "close",
        beforeStatus,
        afterStatus: result.status,
        content: dto.reason
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async recalculateOverdue(
    scope: TenantParkScope,
    actor: JwtPrincipal
  ): Promise<{ checked_count: number; updated_count: number; overdue_count: number; rows: Array<{ id: string; hazard_code: string; before_status: string; after_status: string; overdue_flag: boolean }> }> {
    const now = new Date();
    const hazards = await this.hazardsRepository
      .createQueryBuilder("hazard")
      .where("hazard.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("hazard.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("hazard.is_deleted = false")
      .andWhere("hazard.status <> :closedStatus", { closedStatus: HAZARD_STATUS_CLOSED })
      .andWhere("hazard.rectify_deadline IS NOT NULL")
      .andWhere("hazard.rectify_deadline < :now", { now })
      .getMany();

    const rows: Array<{ id: string; hazard_code: string; before_status: string; after_status: string; overdue_flag: boolean }> = [];
    let updatedCount = 0;

    await this.dataSource.transaction(async (manager) => {
      for (const hazard of hazards) {
        const beforeStatus = hazard.status;
        const wasOverdue = hazard.overdueFlag;
        hazard.overdueFlag = true;
        if (![HAZARD_STATUS_UPGRADED, HAZARD_STATUS_WORK_ORDER].includes(hazard.status)) {
          hazard.status = HAZARD_STATUS_OVERDUE;
        }
        hazard.updateBy = actor.sub;
        await manager.getRepository(SafetyHazardEntity).save(hazard);
        rows.push({
          id: hazard.id,
          hazard_code: hazard.hazardCode,
          before_status: beforeStatus,
          after_status: hazard.status,
          overdue_flag: hazard.overdueFlag
        });
        if (!wasOverdue || beforeStatus !== hazard.status) {
          updatedCount += 1;
          await this.createStatusLog(scope, actor, manager, hazard.id, beforeStatus, hazard.status, "overdue", "隐患超期重算");
          await this.createActionLog(scope, actor, manager, {
            bizType: "safety_hazard",
            bizId: hazard.id,
            action: "overdue",
            beforeStatus,
            afterStatus: hazard.status,
            content: "隐患超期重算"
          });
        }
      }
    });

    return {
      checked_count: hazards.length,
      updated_count: updatedCount,
      overdue_count: rows.length,
      rows
    };
  }

  async upgrade(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: ReasonSafetyHazardActionDto): Promise<SafetyHazardEntity> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Closed hazards cannot be upgraded");
    }
    if (!entity.overdueFlag && entity.status !== HAZARD_STATUS_OVERDUE) {
      throw new BadRequestException("Only overdue hazards can be upgraded");
    }
    if (!this.isMajorHazard(entity)) {
      throw new BadRequestException("Only major hazards can be upgraded");
    }
    this.assertRequired(dto.reason, "reason is required");
    const beforeStatus = entity.status;

    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        upgradeFlag: true,
        overdueFlag: true,
        status: HAZARD_STATUS_UPGRADED,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "upgrade", dto.reason);
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "upgrade",
        beforeStatus,
        afterStatus: result.status,
        content: dto.reason
      });
      return result;
    });

    return this.detail(scope, saved.id, actor);
  }

  async createWorkOrder(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: CreateHazardWorkOrderDto
  ): Promise<{ hazard: SafetyHazardEntity; work_order: WorkOrderEntity }> {
    const entity = await this.findOne(scope, id);
    if (entity.workOrderId) {
      throw new ConflictException("Hazard has already been converted to a work order");
    }
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.priority, "priority is required");
    this.assertRequired(dto.urgency, "urgency is required");
    this.assertRequired(dto.description, "description is required");
    const assignee = await this.assertUser(scope, dto.assignee_id);
    const workOrderPayload: CreateWorkOrderDto = {
      title: dto.title.trim(),
      wo_type: dto.wo_type?.trim() || DEFAULT_HAZARD_WORK_ORDER_TYPE,
      priority: dto.priority.trim(),
      urgency: dto.urgency.trim(),
      source_type: WORK_ORDER_SOURCE_INSPECTION,
      source_id: entity.id,
      park_tenant_id: entity.parkTenantId ?? undefined,
      unit_id: entity.unitId ?? undefined,
      building_id: entity.buildingId ?? undefined,
      floor_id: entity.floorId ?? undefined,
      location: entity.location,
      reporter_id: actor.sub,
      reporter_name: actor.realName ?? actor.username,
      assignee_id: dto.assignee_id,
      assignee_name: assignee?.displayName ?? assignee?.username ?? undefined,
      description: this.buildHazardWorkOrderDescription(entity, dto.description),
      image_file_ids: entity.beforePhotoFileIds ?? [],
      remark: `hazard:${entity.hazardCode}`
    };
    const workOrder = await this.workOrdersService.create(scope, actor, workOrderPayload);
    const beforeStatus = entity.status;
    const saved = await this.dataSource.transaction(async (manager) => {
      Object.assign(entity, {
        workOrderId: workOrder.id,
        status: HAZARD_STATUS_WORK_ORDER,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, result.id, beforeStatus, result.status, "create_workorder", dto.description.trim());
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: result.id,
        action: "create_workorder",
        beforeStatus,
        afterStatus: result.status,
        content: `隐患已转工单 ${workOrder.woCode}`
      });
      return result;
    });
    return {
      hazard: await this.detail(scope, saved.id, actor),
      work_order: workOrder
    };
  }

  async toEmergency(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: CreateHazardEmergencyDto
  ): Promise<{ hazard: SafetyHazardEntity; emergency_id: string; emergency: SafetyEmergencyEventEntity }> {
    const entity = await this.findOne(scope, id);
    if (entity.status === HAZARD_STATUS_CLOSED) {
      throw new BadRequestException("Closed hazard cannot be converted to emergency event");
    }
    if (entity.status === HAZARD_STATUS_EMERGENCY) {
      throw new ConflictException("Hazard has already been converted to an emergency event");
    }
    if (!this.isMajorHazard(entity)) {
      throw new BadRequestException("Only major hazards can be converted to emergency events");
    }
    this.assertRequired(dto.incident_type, "incident_type is required");
    this.assertRequired(dto.severity_level, "severity_level is required");
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.description, "description is required");
    this.assertRequired(dto.reason, "reason is required");
    await Promise.all([
      this.assertDictValue(scope, "safety_emergency_incident_type", dto.incident_type),
      this.assertDictValue(scope, "safety_emergency_severity", dto.severity_level),
      this.assertDictValue(scope, "safety_emergency_source_type", EMERGENCY_SOURCE_HAZARD),
      this.assertDictValue(scope, "safety_emergency_status", EMERGENCY_STATUS_REPORTED),
      this.assertDictValue(scope, "safety_hazard_status", HAZARD_STATUS_EMERGENCY)
    ]);
    const existingEmergency = await this.emergencyEventsRepository
      .createQueryBuilder("event")
      .where("event.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("event.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("event.source_type = :sourceType", { sourceType: EMERGENCY_SOURCE_HAZARD })
      .andWhere("event.source_id = :sourceId", { sourceId: entity.id })
      .andWhere("event.is_deleted = false")
      .getOne();
    if (existingEmergency) {
      throw new ConflictException("Hazard has already been converted to an emergency event");
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const emergencyCode = (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_EVENT_CODE")).code;
      const emergency = manager.getRepository(SafetyEmergencyEventEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: emergencyCode,
        emergencyCode,
        sourceType: EMERGENCY_SOURCE_HAZARD,
        sourceId: entity.id,
        incidentType: dto.incident_type,
        severityLevel: dto.severity_level,
        responseLevel: null,
        title: dto.title.trim(),
        description: dto.description.trim(),
        buildingId: entity.buildingId,
        floorId: entity.floorId,
        unitId: entity.unitId,
        parkTenantId: entity.parkTenantId,
        location: entity.location,
        gpsLng: null,
        gpsLat: null,
        reporterId: actor.sub,
        reporterName: actor.realName ?? actor.username,
        reporterMobile: null,
        commanderId: null,
        commanderName: null,
        responseTeamUserIds: [],
        emergencyPlanId: null,
        photosFileIds: entity.beforePhotoFileIds ?? [],
        videosFileIds: [],
        status: EMERGENCY_STATUS_REPORTED,
        reportTime: new Date(),
        remark: `hazard:${entity.hazardCode}`,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const event = await manager.getRepository(SafetyEmergencyEventEntity).save(emergency);
      await this.createEmergencyTimeline(scope, actor, manager, {
        emergencyId: event.id,
        action: "create",
        beforeStatus: null,
        afterStatus: event.status,
        reason: dto.reason.trim(),
        content: `重大隐患 ${entity.hazardCode} 转为应急事件`
      });

      const beforeStatus = entity.status;
      Object.assign(entity, {
        status: HAZARD_STATUS_EMERGENCY,
        updateBy: actor.sub
      });
      const hazard = await manager.getRepository(SafetyHazardEntity).save(entity);
      await this.createStatusLog(scope, actor, manager, hazard.id, beforeStatus, hazard.status, "to_emergency", dto.reason.trim());
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_hazard",
        bizId: hazard.id,
        action: "to_emergency",
        beforeStatus,
        afterStatus: hazard.status,
        content: `隐患已转应急事件 ${event.emergencyCode}`
      });
      await this.createActionLog(scope, actor, manager, {
        bizType: "safety_emergency_event",
        bizId: event.id,
        action: "create_from_hazard",
        afterStatus: event.status,
        content: `来源隐患 ${entity.hazardCode}`
      });
      return { hazard, emergency: event };
    });

    return {
      hazard: await this.detail(scope, saved.hazard.id, actor),
      emergency_id: saved.emergency.id,
      emergency: saved.emergency
    };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyHazardEntity> {
    return this.hazardsRepository
      .createQueryBuilder("hazard")
      .leftJoinAndSelect("hazard.building", "building")
      .leftJoinAndSelect("hazard.floor", "floor")
      .leftJoinAndSelect("hazard.unit", "unit")
      .leftJoinAndSelect("hazard.parkTenant", "parkTenant")
      .where("hazard.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("hazard.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("hazard.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyHazardEntity>, query: SafetyHazardQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("hazard.hazard_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("hazard.title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("hazard.description ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("hazard.location ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("unit.unit_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("parkTenant.company_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.hazard_type) builder.andWhere("hazard.hazard_type = :hazardType", { hazardType: query.hazard_type });
    if (query.risk_level) builder.andWhere("hazard.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.status) builder.andWhere("hazard.status = :status", { status: query.status });
    if (query.source_type) builder.andWhere("hazard.source_type = :sourceType", { sourceType: query.source_type });
    if (query.building_id) builder.andWhere("hazard.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("hazard.floor_id = :floorId", { floorId: query.floor_id });
    if (query.unit_id) builder.andWhere("hazard.unit_id = :unitId", { unitId: query.unit_id });
    if (query.park_tenant_id) builder.andWhere("hazard.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.overdue_only) builder.andWhere("hazard.overdue_flag = true");
    if (query.start_date) builder.andWhere("hazard.create_time >= :startDate", { startDate: this.parseDate(query.start_date) });
    if (query.end_date) builder.andWhere("hazard.create_time <= :endDate", { endDate: this.parseDate(query.end_date) });
  }

  private applySort(builder: SelectQueryBuilder<SafetyHazardEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      hazard_code: "hazard.hazardCode",
      title: "hazard.title",
      risk_level: "hazard.riskLevel",
      status: "hazard.status",
      rectify_deadline: "hazard.rectifyDeadline",
      update_time: "hazard.updateTime",
      create_time: "hazard.createTime"
    };
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? "hazard.createTime", direction as "ASC" | "DESC");
      builder.addOrderBy("hazard.updateTime", "DESC");
      return;
    }
    builder.orderBy("hazard.updateTime", "DESC");
  }

  private async findOne(scope: TenantParkScope, id: string): Promise<SafetyHazardEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("hazard.id = :id", { id }).getOne();
    if (!entity) throw new NotFoundException("Hazard not found");
    return entity;
  }

  private async resolveLocation(
    scope: TenantParkScope,
    buildingId?: string | null,
    floorId?: string | null,
    unitId?: string | null,
    location?: string | null
  ): Promise<ResolvedLocation> {
    let resolvedBuildingId = buildingId ?? null;
    let resolvedFloorId = floorId ?? null;
    let resolvedLocation = location ?? "";
    if (unitId) {
      const unit = await this.unitsRepository.findOne({
        where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!unit) throw new BadRequestException("unit_id does not belong to current park");
      resolvedBuildingId = unit.buildingId ?? resolvedBuildingId;
      resolvedFloorId = unit.floorId ?? resolvedFloorId;
      if (!resolvedLocation) resolvedLocation = unit.unitName ?? unit.unitCode;
    }
    if (resolvedBuildingId) {
      const building = await this.buildingsRepository.findOne({
        where: { id: resolvedBuildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!building) throw new BadRequestException("building_id does not belong to current park");
    }
    if (resolvedFloorId) {
      const floor = await this.floorsRepository.findOne({
        where: { id: resolvedFloorId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!floor) throw new BadRequestException("floor_id does not belong to current park");
      if (resolvedBuildingId && floor.buildingId !== resolvedBuildingId) {
        throw new BadRequestException("floor_id does not belong to building_id");
      }
      resolvedBuildingId = floor.buildingId ?? resolvedBuildingId;
    }
    if (!resolvedLocation) throw new BadRequestException("location is required");
    return { buildingId: resolvedBuildingId, floorId: resolvedFloorId, unitId: unitId ?? null, location: resolvedLocation };
  }

  private async assertParkTenant(scope: TenantParkScope, parkTenantId?: string | null): Promise<void> {
    if (!parkTenantId) return;
    const tenant = await this.parkTenantsRepository.findOne({
      where: { id: parkTenantId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!tenant) throw new BadRequestException("park_tenant_id does not belong to current park");
  }

  private async assertUser(scope: TenantParkScope, userId?: string | null): Promise<UserEntity | null> {
    if (!userId) return null;
    const user = await this.usersRepository.findOne({
      where: { id: userId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
    });
    if (!user) throw new BadRequestException("user_id must reference an enabled user in current park");
    return user;
  }

  private async assertWorkOrder(scope: TenantParkScope, workOrderId?: string | null): Promise<void> {
    if (!workOrderId) return;
    const order = await this.workOrdersRepository.findOne({
      where: { id: workOrderId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!order) throw new BadRequestException("work_order_id does not belong to current park");
  }

  private async assertFiles(scope: TenantParkScope, fileIds: string[]): Promise<void> {
    if (fileIds.length === 0) return;
    const uniqueIds = [...new Set(fileIds)];
    const count = await this.filesRepository.count({
      where: { id: In(uniqueIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (count !== uniqueIds.length) throw new BadRequestException("file_id must belong to current tenant and park");
  }

  private async assertHazardCodeAvailable(scope: TenantParkScope, hazardCode: string, ignoreId?: string): Promise<void> {
    if (!hazardCode) throw new BadRequestException("hazard_code is required");
    const builder = this.hazardsRepository
      .createQueryBuilder("hazard")
      .where("hazard.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("hazard.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("hazard.hazard_code = :hazardCode", { hazardCode })
      .andWhere("hazard.is_deleted = false");
    if (ignoreId) builder.andWhere("hazard.id <> :ignoreId", { ignoreId });
    const count = await builder.getCount();
    if (count > 0) throw new ConflictException("Hazard code already exists");
  }

  private async validateDictionaries(
    scope: TenantParkScope,
    hazardType: string,
    riskLevel: string,
    sourceType: string,
    status: string
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_hazard_type", hazardType),
      this.assertDictValue(scope, "safety_risk_level", riskLevel),
      this.assertDictValue(scope, "safety_hazard_source_type", sourceType),
      this.assertDictValue(scope, "safety_hazard_status", status)
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue: string): Promise<void> {
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
    if (!item) throw new BadRequestException(`${dictCode} value is invalid`);
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) throw new BadRequestException(message);
  }

  private assertMajorDeadline(riskLevel: string, deadline?: string | null): void {
    if (["major", "30", "critical", "40"].includes(riskLevel) && !deadline) {
      throw new BadRequestException("rectify_deadline is required for major hazard");
    }
  }

  private buildHazardWorkOrderDescription(entity: SafetyHazardEntity, description: string): string {
    return [
      description.trim(),
      "",
      `隐患编号：${entity.hazardCode}`,
      `隐患标题：${entity.title}`,
      `隐患位置：${entity.location}`,
      entity.description ? `隐患描述：${entity.description}` : null
    ].filter((item): item is string => Boolean(item)).join("\n");
  }

  private canRectifyHazard(actor: JwtPrincipal, entity: SafetyHazardEntity): boolean {
    return (
      actor.isSuper ||
      actor.permissions.includes("*") ||
      actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_HAZARD_MANAGE_ALL) ||
      actor.sub === entity.rectifyUserId
    );
  }

  private canForceCloseHazard(actor: JwtPrincipal): boolean {
    return (
      actor.isSuper ||
      actor.permissions.includes("*") ||
      actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_HAZARD_FORCE_CLOSE)
    );
  }

  private isClosedHazard(hazard: SafetyHazardEntity): boolean {
    return hazard.status === HAZARD_STATUS_CLOSED;
  }

  private isMajorHazard(hazard: SafetyHazardEntity): boolean {
    return ["major", "30", "critical", "40"].includes(hazard.riskLevel ?? "");
  }

  private async secureRecentHazards(scope: TenantParkScope, actor: JwtPrincipal | undefined, hazards: SafetyHazardEntity[]): Promise<SafetyHazardRecentItem[]> {
    const secured = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, SAFETY_MODULE, HAZARD_ENTITY, hazards);
    return secured.map((hazard) => ({
      id: hazard.id,
      hazard_code: hazard.hazardCode,
      title: hazard.title,
      hazard_type: hazard.hazardType,
      risk_level: hazard.riskLevel,
      source_type: hazard.sourceType,
      status: hazard.status,
      location: hazard.location,
      description: hazard.description,
      rectify_user_name: hazard.rectifyUserName,
      rectify_deadline: hazard.rectifyDeadline,
      overdue_flag: hazard.overdueFlag,
      before_photo_file_ids: hazard.beforePhotoFileIds,
      after_photo_file_ids: hazard.afterPhotoFileIds,
      update_time: hazard.updateTime
    }));
  }

  private parseDate(value?: string | Date | null): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid date value");
    return date;
  }

  private async createStatusLog(
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
      content?: string | null;
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
      content: options.content ?? null,
      opTime: new Date(),
      payload: {},
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyActionLogEntity).save(log);
  }

  private async createEmergencyTimeline(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager,
    options: {
      emergencyId: string;
      action: string;
      beforeStatus: string | null;
      afterStatus: string | null;
      reason?: string | null;
      content?: string | null;
    }
  ): Promise<void> {
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_LOG_CODE");
    const log = manager.getRepository(SafetyEmergencyTimelineEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      emergencyId: options.emergencyId,
      action: options.action,
      beforeStatus: options.beforeStatus,
      afterStatus: options.afterStatus,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      reason: options.reason ?? null,
      content: options.content ?? null,
      attachmentFileIds: [],
      gpsLng: null,
      gpsLat: null,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyEmergencyTimelineEntity).save(log);
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyHazardEntity>, actor?: JwtPrincipal): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) return;
    const [parkFilter, buildingFilter, floorFilter, unitFilter, tenantCompanyFilter, handlerFilter] = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "park"),
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit"),
      this.dataScopeService.buildScopeFilter(actor, "tenant_company"),
      this.dataScopeService.buildScopeFilter(actor, "workorder_handler")
    ]);
    this.applyConfiguredIdScopeFilter(builder, "hazard", "park_id", parkFilter, "safetyHazardParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "building_id", buildingFilter, "safetyHazardBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "floor_id", floorFilter, "safetyHazardFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "unit_id", unitFilter, "safetyHazardUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "park_tenant_id", tenantCompanyFilter, "safetyHazardTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "hazard", "rectify_user_id", handlerFilter, "safetyHazardHandlerScopeIds");
    if (this.isSelfScope(actor) && !actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_HAZARD_MANAGE_ALL)) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("hazard.create_by = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub })
            .orWhere("hazard.rectify_user_id = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub })
            .orWhere("hazard.recheck_user_id = :currentSafetyHazardUserId", { currentSafetyHazardUserId: actor.sub });
        })
      );
    }
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyHazardEntity>,
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
    if (filter.scope_types.includes("custom")) builder.andWhere("1 = 0");
  }

  private isSelfScope(actor: JwtPrincipal): boolean {
    return actor.dataScope === "self" || actor.dataScope === "10";
  }
}
