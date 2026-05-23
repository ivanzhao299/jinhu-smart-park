import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { Brackets, DataSource, EntityManager, In, Repository, SelectQueryBuilder } from "typeorm";
import { InjectRepository } from "@nestjs/typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyHazardStatusLogEntity } from "../safety-hazards/entities/safety-hazard-status-log.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { SafetyHazardEntity } from "../safety-inspect-tasks/entities/safety-hazard.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import type { CreateWorkOrderDto } from "../work-orders/dto/create-work-order.dto";
import type { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import { WorkOrdersService } from "../work-orders/work-orders.service";
import { CreateSafetyWorkPermitDto } from "./dto/create-safety-work-permit.dto";
import {
  CreateWorkPermitCheckHazardDto,
  CreateWorkPermitCheckWorkOrderDto,
  RejectSafetyWorkPermitDto,
  SafetyWorkPermitActionDto,
  SafetyWorkPermitCloseDto,
  SafetyWorkPermitPhotoActionDto,
  SafetyWorkPermitProcessCheckDto,
  SafetyWorkPermitStopDto
} from "./dto/safety-work-permit-action.dto";
import { SafetyWorkPermitQueryDto } from "./dto/safety-work-permit-query.dto";
import { UpdateSafetyWorkPermitDto } from "./dto/update-safety-work-permit.dto";
import { SafetyWorkPermitCheckEntity } from "./entities/safety-work-permit-check.entity";
import { SafetyWorkPermitEntity } from "./entities/safety-work-permit.entity";
import { SafetyWorkPermitLogEntity } from "./entities/safety-work-permit-log.entity";

interface ResolvedLocation {
  buildingId: string | null;
  floorId: string | null;
  unitId: string | null;
}

const WORK_PERMIT_ENTITY = "work_permit";
const WORK_PERMIT_CHECK_ENTITY = "work_permit_check";
const WORK_PERMIT_BIZ_TYPE = "work_permit";
const STATUS_DRAFT = "10";
const STATUS_PROPERTY_APPROVING = "30";
const STATUS_SAFETY_APPROVING = "40";
const STATUS_OPERATION_APPROVING = "50";
const STATUS_ISSUED = "60";
const STATUS_WORKING = "70";
const STATUS_FINISH_PENDING = "80";
const STATUS_CLOSED = "90";
const STATUS_REJECTED = "91";
const STATUS_VOID = "92";
const STATUS_STOPPED = "93";
const HIGH_RISK_LEVEL = "30";
const HIGH_RISK_PERMIT_TYPES = new Set(["hot_work", "confined_space", "height", "high_work", "lifting"]);
const APPROVAL_STATUSES = [STATUS_PROPERTY_APPROVING, STATUS_SAFETY_APPROVING, STATUS_OPERATION_APPROVING];
const VOIDABLE_STATUSES = [STATUS_DRAFT, STATUS_PROPERTY_APPROVING, STATUS_SAFETY_APPROVING, STATUS_OPERATION_APPROVING, STATUS_ISSUED, STATUS_REJECTED];
const CONFLICT_EXCLUDED_STATUSES = ["80", "90", "91", "92", "93"];
const CONVERTIBLE_CHECK_RESULTS = new Set(["fail", "violation"]);
const HAZARD_ENTITY = "safety_hazard";
const HAZARD_SOURCE_WORK_PERMIT = "work_permit";
const HAZARD_STATUS_REGISTERED = "10";
const DEFAULT_HAZARD_TYPE = "other";
const DEFAULT_WORK_ORDER_TYPE = "repair";
const DEFAULT_WORK_ORDER_PRIORITY = "medium";
const DEFAULT_WORK_ORDER_URGENCY = "normal";
const URGENT_WORK_ORDER_URGENCY = "urgent";

export interface SafetyWorkPermitSummaryRow {
  id: string;
  permit_code: string;
  permit_type: string;
  risk_level: string;
  status: string;
  location: string;
  apply_user_name: string | null;
  contractor_name: string | null;
  monitor_user_name: string | null;
  time_start: Date;
  time_end: Date;
  violation_count: number;
  update_time: Date;
}

export interface SafetyWorkPermitSummaryNode {
  available: true;
  summary: {
    total_count: number;
    in_progress_count: number;
    violation_count: number;
    closed_count: number;
  };
  recent_items: SafetyWorkPermitSummaryRow[];
}

@Injectable()
export class SafetyWorkPermitsService {
  constructor(
    @InjectRepository(SafetyWorkPermitEntity)
    private readonly permitsRepository: Repository<SafetyWorkPermitEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(SafetyWorkPermitCheckEntity)
    private readonly checksRepository: Repository<SafetyWorkPermitCheckEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly dataSource: DataSource,
    private readonly workOrdersService: WorkOrdersService
  ) {}

  async list(scope: TenantParkScope, query: SafetyWorkPermitQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<SafetyWorkPermitEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedBuilder(scope);
    await this.applyDataScope(builder, actor);
    this.applyQuery(builder, query);
    this.applySort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", WORK_PERMIT_ENTITY, items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", WORK_PERMIT_ENTITY, entity);
  }

  async tenant360WorkPermits(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<SafetyWorkPermitSummaryNode> {
    const builder = this.scopedBuilder(scope)
      .andWhere("permit.apply_park_tenant_id = :parkTenantId", { parkTenantId })
      .orderBy("permit.timeStart", "DESC")
      .addOrderBy("permit.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const permits = await builder.getMany();
    return this.buildSummaryNode(scope, actor, permits);
  }

  async unitWorkPermits(scope: TenantParkScope, actor: JwtPrincipal, unitId: string): Promise<SafetyWorkPermitSummaryNode> {
    const builder = this.scopedBuilder(scope)
      .andWhere("permit.unit_id = :unitId", { unitId })
      .orderBy("permit.timeStart", "DESC")
      .addOrderBy("permit.createTime", "DESC");
    await this.applyDataScope(builder, actor);
    const permits = await builder.getMany();
    return this.buildSummaryNode(scope, actor, permits);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyWorkPermitDto): Promise<SafetyWorkPermitEntity> {
    this.assertRequired(dto.permit_type, "permit_type is required");
    this.assertRequired(dto.location, "location is required");
    this.assertRequired(dto.time_start, "time_start is required");
    this.assertRequired(dto.time_end, "time_end is required");
    this.assertRequired(dto.risk_level, "risk_level is required");

    const timeWindow = this.parseTimeWindow(dto.time_start, dto.time_end);
    await this.validateDictionaries(scope, {
      permitType: dto.permit_type,
      applyType: dto.apply_type,
      riskLevel: dto.risk_level,
      status: STATUS_DRAFT
    });
    if (this.isHighRisk(dto.permit_type, dto.risk_level) && !dto.monitor_user_id) {
      throw new BadRequestException("High risk work permit requires monitor_user_id");
    }
    const location = await this.resolveLocation(scope, dto.building_id, dto.floor_id, dto.unit_id);
    await this.assertParkTenant(scope, dto.apply_park_tenant_id);
    const applyUser = dto.apply_user_id ? await this.findActiveUser(scope, dto.apply_user_id) : null;
    const monitorUser = dto.monitor_user_id ? await this.findActiveUser(scope, dto.monitor_user_id) : null;
    const permitCode = dto.permit_code ?? (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_WORK_PERMIT_CODE")).code;
    await this.assertPermitCodeAvailable(scope, permitCode);
    await this.assertNoHighRiskConflict(scope, dto.permit_type, dto.risk_level, timeWindow.start, timeWindow.end, dto.location, location.unitId, actor);

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SafetyWorkPermitEntity);
      const entity = repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: permitCode,
        permitCode,
        permitType: dto.permit_type,
        applyType: dto.apply_type ?? "internal",
        applyUserId: dto.apply_user_id ?? actor.sub,
        applyUserName: dto.apply_user_name ?? applyUser?.displayName ?? actor.realName ?? actor.username,
        applyMobile: dto.apply_mobile ?? applyUser?.mobile ?? null,
        applyParkTenantId: dto.apply_park_tenant_id ?? null,
        contractorName: dto.contractor_name ?? null,
        contractorContact: dto.contractor_contact ?? null,
        contractorMobile: dto.contractor_mobile ?? null,
        buildingId: location.buildingId,
        floorId: location.floorId,
        unitId: location.unitId,
        location: dto.location,
        timeStart: timeWindow.start,
        timeEnd: timeWindow.end,
        riskLevel: dto.risk_level,
        protectiveMeasures: dto.protective_measures ?? null,
        monitorUserId: dto.monitor_user_id ?? null,
        monitorUserName: dto.monitor_user_name ?? monitorUser?.displayName ?? null,
        approveRecords: [],
        startCheckPhotoFileIds: dto.start_check_photo_file_ids ?? [],
        endCheckPhotoFileIds: dto.end_check_photo_file_ids ?? [],
        processCheckCount: dto.process_check_count ?? 0,
        violationCount: dto.violation_count ?? 0,
        status: STATUS_DRAFT,
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await repository.save(entity);
      await this.writePermitLog(manager, scope, actor, result.id, "create", null, result.status, "作业许可申请已创建");
      await this.writeActionLog(manager, scope, actor, result.id, "create", null, result.status, "作业许可申请已创建");
      return result;
    });
    return this.detail(scope, saved.id, actor);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateSafetyWorkPermitDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_DRAFT) {
      throw new BadRequestException("Only draft work permits can be edited");
    }
    const nextPermitType = dto.permit_type ?? entity.permitType;
    const nextApplyType = dto.apply_type === undefined ? entity.applyType ?? undefined : dto.apply_type;
    const nextRiskLevel = dto.risk_level ?? entity.riskLevel;
    const nextTimeStart = dto.time_start ?? entity.timeStart.toISOString();
    const nextTimeEnd = dto.time_end ?? entity.timeEnd.toISOString();
    const timeWindow = this.parseTimeWindow(nextTimeStart, nextTimeEnd);
    await this.validateDictionaries(scope, {
      permitType: nextPermitType,
      applyType: nextApplyType,
      riskLevel: nextRiskLevel,
      status: entity.status
    });
    const nextMonitorUserId = dto.monitor_user_id === undefined ? entity.monitorUserId ?? undefined : dto.monitor_user_id;
    if (this.isHighRisk(nextPermitType, nextRiskLevel) && !nextMonitorUserId) {
      throw new BadRequestException("High risk work permit requires monitor_user_id");
    }
    const location = await this.resolveLocation(
      scope,
      dto.building_id === undefined ? entity.buildingId ?? undefined : dto.building_id,
      dto.floor_id === undefined ? entity.floorId ?? undefined : dto.floor_id,
      dto.unit_id === undefined ? entity.unitId ?? undefined : dto.unit_id
    );
    const nextParkTenantId = dto.apply_park_tenant_id === undefined ? entity.applyParkTenantId ?? undefined : dto.apply_park_tenant_id;
    await this.assertParkTenant(scope, nextParkTenantId);
    const nextPermitCode = dto.permit_code ?? entity.permitCode;
    if (nextPermitCode !== entity.permitCode) {
      await this.assertPermitCodeAvailable(scope, nextPermitCode, entity.id);
    }
    const applyUser = dto.apply_user_id ? await this.findActiveUser(scope, dto.apply_user_id) : null;
    const monitorUser = dto.monitor_user_id ? await this.findActiveUser(scope, dto.monitor_user_id) : null;
    const nextLocation = dto.location ?? entity.location;
    await this.assertNoHighRiskConflict(scope, nextPermitType, nextRiskLevel, timeWindow.start, timeWindow.end, nextLocation, location.unitId, actor, entity.id);

    Object.assign(entity, {
      code: nextPermitCode,
      permitCode: nextPermitCode,
      permitType: nextPermitType,
      applyType: dto.apply_type === undefined ? entity.applyType : dto.apply_type ?? null,
      applyUserId: dto.apply_user_id === undefined ? entity.applyUserId : dto.apply_user_id ?? null,
      applyUserName: dto.apply_user_name === undefined ? entity.applyUserName : dto.apply_user_name ?? applyUser?.displayName ?? null,
      applyMobile: dto.apply_mobile === undefined ? entity.applyMobile : dto.apply_mobile ?? applyUser?.mobile ?? null,
      applyParkTenantId: nextParkTenantId ?? null,
      contractorName: dto.contractor_name === undefined ? entity.contractorName : dto.contractor_name ?? null,
      contractorContact: dto.contractor_contact === undefined ? entity.contractorContact : dto.contractor_contact ?? null,
      contractorMobile: dto.contractor_mobile === undefined ? entity.contractorMobile : dto.contractor_mobile ?? null,
      buildingId: location.buildingId,
      floorId: location.floorId,
      unitId: location.unitId,
      location: nextLocation,
      timeStart: timeWindow.start,
      timeEnd: timeWindow.end,
      riskLevel: nextRiskLevel,
      protectiveMeasures: dto.protective_measures === undefined ? entity.protectiveMeasures : dto.protective_measures ?? null,
      monitorUserId: nextMonitorUserId ?? null,
      monitorUserName: dto.monitor_user_name === undefined ? entity.monitorUserName : dto.monitor_user_name ?? monitorUser?.displayName ?? null,
      startCheckPhotoFileIds: dto.start_check_photo_file_ids ?? entity.startCheckPhotoFileIds,
      endCheckPhotoFileIds: dto.end_check_photo_file_ids ?? entity.endCheckPhotoFileIds,
      processCheckCount: dto.process_check_count ?? entity.processCheckCount,
      violationCount: dto.violation_count ?? entity.violationCount,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(SafetyWorkPermitEntity).save(entity);
      await this.writePermitLog(manager, scope, actor, result.id, "update", result.status, result.status, "作业许可申请已更新");
      await this.writeActionLog(manager, scope, actor, result.id, "update", result.status, result.status, "作业许可申请已更新");
      return result;
    });
    return this.detail(scope, saved.id, actor);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findOne(scope, id, actor);
    if (![STATUS_DRAFT, STATUS_REJECTED].includes(entity.status)) {
      throw new BadRequestException("Only draft or rejected work permits can be deleted");
    }
    await this.dataSource.transaction(async (manager) => {
      entity.isDeleted = true;
      entity.updateBy = actor.sub;
      await manager.getRepository(SafetyWorkPermitEntity).save(entity);
      await this.writePermitLog(manager, scope, actor, entity.id, "delete", entity.status, entity.status, "作业许可申请已删除");
      await this.writeActionLog(manager, scope, actor, entity.id, "delete", entity.status, entity.status, "作业许可申请已删除");
    });
    return { id };
  }

  async submit(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitActionDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_DRAFT) {
      throw new BadRequestException("Only draft work permits can be submitted");
    }
    await this.validateDictionaries(scope, {
      permitType: entity.permitType,
      applyType: entity.applyType,
      riskLevel: entity.riskLevel,
      status: STATUS_PROPERTY_APPROVING
    });
    entity.submitTime = new Date();
    entity.rejectReason = null;
    return this.changePermitStatus(scope, actor, entity, STATUS_PROPERTY_APPROVING, "submit", dto, dto.opinion ?? "提交作业许可审批");
  }

  async approve(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitActionDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    let nextStatus: string;
    let action: string;
    let permission: string;
    if (entity.status === STATUS_PROPERTY_APPROVING) {
      nextStatus = STATUS_SAFETY_APPROVING;
      action = "approve_property";
      permission = SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_PROPERTY;
    } else if (entity.status === STATUS_SAFETY_APPROVING) {
      nextStatus = this.isHighRisk(entity.permitType, entity.riskLevel) ? STATUS_OPERATION_APPROVING : STATUS_ISSUED;
      action = "approve_safety";
      permission = SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_SAFETY;
    } else if (entity.status === STATUS_OPERATION_APPROVING) {
      nextStatus = STATUS_ISSUED;
      action = "approve_operation";
      permission = SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_APPROVE_OPERATION;
    } else {
      throw new BadRequestException("Only approving work permits can be approved");
    }
    this.assertPermission(actor, permission);
    await this.validateDictionaries(scope, {
      permitType: entity.permitType,
      applyType: entity.applyType,
      riskLevel: entity.riskLevel,
      status: nextStatus
    });
    if (nextStatus === STATUS_ISSUED) {
      entity.approveTime = new Date();
    }
    return this.changePermitStatus(scope, actor, entity, nextStatus, action, dto, dto.opinion ?? "审批通过");
  }

  async reject(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: RejectSafetyWorkPermitDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (!APPROVAL_STATUSES.includes(entity.status)) {
      throw new BadRequestException("Only approving work permits can be rejected");
    }
    const rejectReason = dto.reject_reason?.trim();
    if (!rejectReason) {
      throw new BadRequestException("reject_reason is required");
    }
    await this.validateDictionaries(scope, {
      permitType: entity.permitType,
      applyType: entity.applyType,
      riskLevel: entity.riskLevel,
      status: STATUS_REJECTED
    });
    entity.rejectReason = rejectReason;
    return this.changePermitStatus(scope, actor, entity, STATUS_REJECTED, "reject", dto, rejectReason, rejectReason);
  }

  async voidPermit(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitActionDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (!VOIDABLE_STATUSES.includes(entity.status)) {
      throw new BadRequestException("Current work permit status cannot be voided");
    }
    await this.validateDictionaries(scope, {
      permitType: entity.permitType,
      applyType: entity.applyType,
      riskLevel: entity.riskLevel,
      status: STATUS_VOID
    });
    return this.changePermitStatus(scope, actor, entity, STATUS_VOID, "void", dto, dto.opinion ?? "作废作业许可");
  }

  async listLogs(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyWorkPermitLogEntity[]> {
    await this.findOne(scope, id, actor);
    return this.dataSource
      .getRepository(SafetyWorkPermitLogEntity)
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.work_permit_id = :id", { id })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .getMany();
  }

  async listChecks(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyWorkPermitCheckEntity[]> {
    await this.findOne(scope, id, actor);
    const checks = await this.checksRepository
      .createQueryBuilder("check")
      .where("check.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("check.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("check.permit_id = :id", { id })
      .andWhere("check.is_deleted = false")
      .orderBy("check.check_time", "DESC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", WORK_PERMIT_CHECK_ENTITY, checks);
  }

  async createHazardFromCheck(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    checkId: string,
    dto: CreateWorkPermitCheckHazardDto
  ): Promise<{ permit: SafetyWorkPermitEntity; check: SafetyWorkPermitCheckEntity; hazard: SafetyHazardEntity }> {
    const permit = await this.findOne(scope, id, actor);
    const check = await this.findPermitCheck(scope, id, checkId);
    this.assertConvertibleCheck(check);
    if (check.hazardId || check.createHazard) {
      throw new ConflictException("This work permit check has already created a hazard");
    }
    const photoFileIds = this.normalizeFileIds(check.photoFileIds);
    await this.assertFiles(scope, photoFileIds);
    const hazardType = dto.hazard_type ?? DEFAULT_HAZARD_TYPE;
    const riskLevel = dto.risk_level ?? permit.riskLevel ?? HIGH_RISK_LEVEL;
    await Promise.all([
      this.assertDictValue(scope, "safety_hazard_source_type", HAZARD_SOURCE_WORK_PERMIT),
      this.assertDictValue(scope, "safety_hazard_type", hazardType),
      this.assertDictValue(scope, "safety_risk_level", riskLevel),
      this.assertDictValue(scope, "safety_hazard_status", HAZARD_STATUS_REGISTERED)
    ]);
    const rectifyUser = dto.rectify_user_id ? await this.findActiveUser(scope, dto.rectify_user_id) : null;
    const rectifyDeadline = this.parseOptionalDate(dto.rectify_deadline);
    const hazardTitle = dto.title ?? `${permit.permitCode} 违规巡查隐患`;
    const description = dto.description ?? check.violationDesc ?? "作业许可过程巡查发现违规或不通过项";
    const hazardCode = (await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_HAZARD_CODE")).code;

    const saved = await this.dataSource.transaction(async (manager) => {
      const hazard = manager.getRepository(SafetyHazardEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: hazardCode,
        hazardCode,
        title: hazardTitle,
        hazardTitle,
        hazardType,
        riskLevel,
        sourceType: HAZARD_SOURCE_WORK_PERMIT,
        sourceId: check.id,
        inspectTaskId: null,
        inspectPointId: null,
        parkTenantId: permit.applyParkTenantId,
        buildingId: permit.buildingId,
        floorId: permit.floorId,
        unitId: permit.unitId,
        location: permit.location,
        description,
        photoFileIds,
        beforePhotoFileIds: photoFileIds,
        afterPhotoFileIds: [],
        rectifyUserId: dto.rectify_user_id ?? null,
        rectifyUserName: rectifyUser?.displayName ?? rectifyUser?.username ?? null,
        rectifyDeadline,
        rectifyTime: null,
        recheckUserId: null,
        recheckUserName: null,
        recheckTime: null,
        recheckResult: null,
        overdueFlag: false,
        upgradeFlag: false,
        workOrderId: null,
        status: HAZARD_STATUS_REGISTERED,
        remark: dto.remark ?? `work_permit_check:${check.id}`,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyHazardEntity).save(hazard);
      Object.assign(check, {
        createHazard: true,
        hazardId: result.id,
        updateBy: actor.sub
      });
      const updatedCheck = await manager.getRepository(SafetyWorkPermitCheckEntity).save(check);
      await this.writeHazardStatusLog(manager, scope, actor, result.id, null, result.status, "create_from_work_permit", description);
      await this.writeActionLog(manager, scope, actor, result.id, "create_hazard", null, result.status, `作业许可巡查转隐患 ${result.hazardCode}`, description, HAZARD_ENTITY);
      await this.writePermitLog(manager, scope, actor, permit.id, "create_hazard", permit.status, permit.status, `巡查记录已转隐患 ${result.hazardCode}`, description, photoFileIds);
      await this.writeActionLog(manager, scope, actor, permit.id, "create_hazard", permit.status, permit.status, `巡查记录已转隐患 ${result.hazardCode}`, description);
      return { hazard: result, check: updatedCheck };
    });
    const securedHazard = await this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", HAZARD_ENTITY, saved.hazard);
    return {
      permit: await this.detail(scope, permit.id, actor),
      check: saved.check,
      hazard: securedHazard
    };
  }

  async createWorkOrderFromCheck(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    checkId: string,
    dto: CreateWorkPermitCheckWorkOrderDto
  ): Promise<{ permit: SafetyWorkPermitEntity; check: SafetyWorkPermitCheckEntity; work_order: WorkOrderEntity }> {
    const permit = await this.findOne(scope, id, actor);
    const check = await this.findPermitCheck(scope, id, checkId);
    this.assertConvertibleCheck(check);
    if (check.workOrderId || check.createWorkOrder) {
      throw new ConflictException("This work permit check has already created a work order");
    }
    const photoFileIds = this.normalizeFileIds(check.photoFileIds);
    await this.assertFiles(scope, photoFileIds);
    const assignee = dto.assignee_id ? await this.findActiveUser(scope, dto.assignee_id) : null;
    const title = dto.title ?? `${permit.permitCode} 违规巡查处理工单`;
    const description = this.buildWorkPermitWorkOrderDescription(permit, check, dto.description);
    const workOrderPayload: CreateWorkOrderDto = {
      title,
      wo_type: dto.wo_type ?? DEFAULT_WORK_ORDER_TYPE,
      priority: dto.priority ?? DEFAULT_WORK_ORDER_PRIORITY,
      urgency: dto.urgency ?? (check.result === "violation" ? URGENT_WORK_ORDER_URGENCY : DEFAULT_WORK_ORDER_URGENCY),
      source_type: HAZARD_SOURCE_WORK_PERMIT,
      source_id: check.id,
      park_tenant_id: permit.applyParkTenantId ?? undefined,
      unit_id: permit.unitId ?? undefined,
      building_id: permit.buildingId ?? undefined,
      floor_id: permit.floorId ?? undefined,
      location: permit.location,
      reporter_id: actor.sub,
      reporter_name: actor.realName ?? actor.username,
      assignee_id: dto.assignee_id,
      assignee_name: assignee?.displayName ?? assignee?.username ?? undefined,
      description,
      image_file_ids: photoFileIds,
      remark: `work_permit_check:${check.id}`
    };
    const workOrder = await this.workOrdersService.create(scope, actor, workOrderPayload);
    const savedCheck = await this.dataSource.transaction(async (manager) => {
      Object.assign(check, {
        createWorkOrder: true,
        workOrderId: workOrder.id,
        updateBy: actor.sub
      });
      const updatedCheck = await manager.getRepository(SafetyWorkPermitCheckEntity).save(check);
      await this.writePermitLog(manager, scope, actor, permit.id, "create_workorder", permit.status, permit.status, `巡查记录已转工单 ${workOrder.woCode}`, description, photoFileIds);
      await this.writeActionLog(manager, scope, actor, permit.id, "create_workorder", permit.status, permit.status, `巡查记录已转工单 ${workOrder.woCode}`, description);
      return updatedCheck;
    });
    return {
      permit: await this.detail(scope, permit.id, actor),
      check: savedCheck,
      work_order: workOrder
    };
  }

  async start(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitPhotoActionDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_ISSUED) {
      throw new BadRequestException("Only issued work permits can be started");
    }
    const photoFileIds = this.normalizeFileIds(dto.photo_file_ids);
    this.assertFileIdCount(photoFileIds, "At least one start check photo is required");
    await this.assertFiles(scope, photoFileIds);
    const content = dto.content ?? "现场防护措施已确认，作业开工";
    return this.applyLifecycleTransition(scope, actor, entity, STATUS_WORKING, "start", content, null, {
      photoFileIds,
      checkType: "start_check",
      checkResult: "pass",
      mutate: (permit) => {
        permit.startTime = new Date();
        permit.startCheckPhotoFileIds = photoFileIds;
      }
    });
  }

  async processCheck(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitProcessCheckDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_WORKING) {
      throw new BadRequestException("Only working work permits can be checked");
    }
    const photoFileIds = this.normalizeFileIds(dto.photo_file_ids ?? []);
    await this.assertFiles(scope, photoFileIds);
    const content = dto.content ?? (dto.result === "violation" ? "过程巡查发现违规" : "过程巡查完成");
    return this.applyLifecycleTransition(scope, actor, entity, STATUS_WORKING, "process_check", content, dto.result === "violation" ? content : null, {
      photoFileIds,
      checkType: "process_check",
      checkResult: dto.result,
      mutate: (permit) => {
        permit.processCheckCount = (permit.processCheckCount ?? 0) + 1;
        if (dto.result === "violation") {
          permit.violationCount = (permit.violationCount ?? 0) + 1;
        }
      }
    });
  }

  async stop(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitStopDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_WORKING) {
      throw new BadRequestException("Only working work permits can be stopped");
    }
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("reason is required");
    }
    const photoFileIds = this.normalizeFileIds(dto.photo_file_ids ?? []);
    await this.assertFiles(scope, photoFileIds);
    return this.applyLifecycleTransition(scope, actor, entity, STATUS_STOPPED, "stop", "违规停工", reason, {
      photoFileIds,
      checkType: "violation_check",
      checkResult: "violation",
      mutate: (permit) => {
        permit.violationCount = (permit.violationCount ?? 0) + 1;
      }
    });
  }

  async finish(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitPhotoActionDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_WORKING) {
      throw new BadRequestException("Only working work permits can be finished");
    }
    const photoFileIds = this.normalizeFileIds(dto.photo_file_ids);
    this.assertFileIdCount(photoFileIds, "At least one finish check photo is required");
    await this.assertFiles(scope, photoFileIds);
    const content = dto.content ?? "已完工，现场清理完成";
    return this.applyLifecycleTransition(scope, actor, entity, STATUS_FINISH_PENDING, "finish", content, null, {
      photoFileIds,
      checkType: "end_check",
      checkResult: "pass",
      mutate: (permit) => {
        permit.finishTime = new Date();
        permit.endCheckPhotoFileIds = photoFileIds;
      }
    });
  }

  async close(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: SafetyWorkPermitCloseDto): Promise<SafetyWorkPermitEntity> {
    const entity = await this.findOne(scope, id, actor);
    if (entity.status !== STATUS_FINISH_PENDING) {
      throw new BadRequestException("Only finish-pending work permits can be closed");
    }
    const content = dto.content ?? "现场核查无遗留风险，许可闭环";
    return this.applyLifecycleTransition(scope, actor, entity, STATUS_CLOSED, "close", content, null, {
      mutate: (permit) => {
        permit.closeTime = new Date();
      }
    });
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyWorkPermitEntity> {
    return this.permitsRepository
      .createQueryBuilder("permit")
      .leftJoinAndSelect("permit.applyParkTenant", "applyParkTenant")
      .leftJoinAndSelect("permit.building", "building")
      .leftJoinAndSelect("permit.floor", "floor")
      .leftJoinAndSelect("permit.unit", "unit")
      .where("permit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("permit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("permit.is_deleted = false");
  }

  private applyQuery(builder: SelectQueryBuilder<SafetyWorkPermitEntity>, query: SafetyWorkPermitQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("permit.permit_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("permit.location ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("permit.apply_user_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("permit.contractor_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("applyParkTenant.company_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.permit_type) builder.andWhere("permit.permit_type = :permitType", { permitType: query.permit_type });
    if (query.status) builder.andWhere("permit.status = :status", { status: query.status });
    if (query.risk_level) builder.andWhere("permit.risk_level = :riskLevel", { riskLevel: query.risk_level });
    if (query.apply_park_tenant_id) builder.andWhere("permit.apply_park_tenant_id = :parkTenantId", { parkTenantId: query.apply_park_tenant_id });
    if (query.building_id) builder.andWhere("permit.building_id = :buildingId", { buildingId: query.building_id });
    if (query.unit_id) builder.andWhere("permit.unit_id = :unitId", { unitId: query.unit_id });
    if (query.start_date) builder.andWhere("permit.time_start >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("permit.time_start <= :endDate", { endDate: query.end_date });
  }

  private applySort(builder: SelectQueryBuilder<SafetyWorkPermitEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      permit_code: "permit.permitCode",
      permit_type: "permit.permitType",
      risk_level: "permit.riskLevel",
      status: "permit.status",
      time_start: "permit.timeStart",
      update_time: "permit.updateTime",
      create_time: "permit.createTime"
    };
    const [field = "create_time", direction = "desc"] = (sort ?? "create_time:desc").split(":");
    builder.orderBy(sortMap[field] ?? "permit.createTime", direction.toUpperCase() === "ASC" ? "ASC" : "DESC");
  }

  private async buildSummaryNode(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    permits: SafetyWorkPermitEntity[]
  ): Promise<SafetyWorkPermitSummaryNode> {
    const recent = permits.slice(0, 5).map((permit) => ({
      id: permit.id,
      permit_code: permit.permitCode,
      permit_type: permit.permitType,
      risk_level: permit.riskLevel,
      status: permit.status,
      location: permit.location,
      apply_user_name: permit.applyUserName,
      contractor_name: permit.contractorName,
      monitor_user_name: permit.monitorUserName,
      time_start: permit.timeStart,
      time_end: permit.timeEnd,
      violation_count: permit.violationCount,
      update_time: permit.updateTime
    }));
    const recentItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", WORK_PERMIT_ENTITY, recent) as SafetyWorkPermitSummaryRow[];
    return {
      available: true,
      summary: {
        total_count: permits.length,
        in_progress_count: permits.filter((permit) => permit.status === STATUS_WORKING).length,
        violation_count: permits.reduce((sum, permit) => sum + (permit.violationCount ?? 0), 0),
        closed_count: permits.filter((permit) => permit.status === STATUS_CLOSED).length
      },
      recent_items: recentItems
    };
  }

  private async findOne(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyWorkPermitEntity> {
    const builder = this.scopedBuilder(scope).andWhere("permit.id = :id", { id });
    await this.applyDataScope(builder, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Work permit not found");
    }
    return entity;
  }

  private async findPermitCheck(scope: TenantParkScope, permitId: string, checkId: string): Promise<SafetyWorkPermitCheckEntity> {
    const check = await this.checksRepository.findOne({
      where: {
        id: checkId,
        permitId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (!check) {
      throw new NotFoundException("Work permit check not found");
    }
    return check;
  }

  private assertConvertibleCheck(check: SafetyWorkPermitCheckEntity): void {
    if (!CONVERTIBLE_CHECK_RESULTS.has(check.result)) {
      throw new BadRequestException("Only failed or violation checks can create hazards or work orders");
    }
  }

  private async resolveLocation(scope: TenantParkScope, buildingId?: string, floorId?: string, unitId?: string): Promise<ResolvedLocation> {
    if (unitId) {
      const unit = await this.unitsRepository.findOne({ where: { id: unitId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!unit) throw new NotFoundException("Unit not found in current park");
      return { buildingId: unit.buildingId, floorId: unit.floorId, unitId: unit.id };
    }
    let resolvedBuildingId = buildingId ?? null;
    if (buildingId) {
      const building = await this.buildingsRepository.findOne({ where: { id: buildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!building) throw new NotFoundException("Building not found in current park");
    }
    if (floorId) {
      const floor = await this.floorsRepository.findOne({ where: { id: floorId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
      if (!floor) throw new NotFoundException("Floor not found in current park");
      if (buildingId && floor.buildingId !== buildingId) {
        throw new BadRequestException("Floor does not belong to selected building");
      }
      resolvedBuildingId = floor.buildingId;
    }
    return { buildingId: resolvedBuildingId, floorId: floorId ?? null, unitId: null };
  }

  private async assertParkTenant(scope: TenantParkScope, parkTenantId?: string): Promise<void> {
    if (!parkTenantId) return;
    const exists = await this.parkTenantsRepository.exists({ where: { id: parkTenantId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false } });
    if (!exists) {
      throw new NotFoundException("Park tenant not found in current park");
    }
  }

  private async findActiveUser(scope: TenantParkScope, userId: string): Promise<UserEntity> {
    const user = await this.usersRepository.findOne({ where: { id: userId, tenantId: scope.tenantId, isDeleted: false, isEnabled: true } });
    if (!user) {
      throw new NotFoundException("User not found in current tenant");
    }
    return user;
  }

  private async validateDictionaries(
    scope: TenantParkScope,
    values: { permitType: string; applyType?: string | null; riskLevel: string; status: string }
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_work_permit_type", values.permitType),
      values.applyType ? this.assertDictValue(scope, "safety_work_permit_apply_type", values.applyType) : Promise.resolve(),
      this.assertDictValue(scope, "safety_risk_level", values.riskLevel),
      this.assertDictValue(scope, "safety_work_permit_status", values.status)
    ]);
  }

  private async assertDictValue(scope: TenantParkScope, dictCode: string, itemValue: string): Promise<void> {
    const item = await this.dictItemsRepository
      .createQueryBuilder("item")
      .innerJoin("item.dictType", "type")
      .where("type.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("type.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("type.dict_code = :dictCode", { dictCode })
      .andWhere("type.is_deleted = false")
      .andWhere("item.item_value = :itemValue", { itemValue })
      .andWhere("item.is_deleted = false")
      .getOne();
    if (!item) {
      throw new BadRequestException(`Invalid dictionary value ${dictCode}:${itemValue}`);
    }
  }

  private parseTimeWindow(timeStart: string, timeEnd: string): { start: Date; end: Date } {
    const start = new Date(timeStart);
    const end = new Date(timeEnd);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("Invalid work permit time window");
    }
    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException("time_start must be earlier than time_end");
    }
    return { start, end };
  }

  private parseOptionalDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("Invalid date value");
    }
    return date;
  }

  private isHighRisk(permitType: string, riskLevel: string): boolean {
    return riskLevel === HIGH_RISK_LEVEL || HIGH_RISK_PERMIT_TYPES.has(permitType);
  }

  private async assertNoHighRiskConflict(
    scope: TenantParkScope,
    permitType: string,
    riskLevel: string,
    timeStart: Date,
    timeEnd: Date,
    location: string,
    unitId: string | null,
    actor: JwtPrincipal,
    excludeId?: string
  ): Promise<void> {
    if (!this.isHighRisk(permitType, riskLevel) || actor.isSuper || actor.permissions.includes("*")) return;
    if (actor.permissions.includes(SYSTEM_PERMISSIONS.SAFETY_WORK_PERMIT_OVERRIDE_CONFLICT)) return;
    const builder = this.permitsRepository
      .createQueryBuilder("permit")
      .where("permit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("permit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("permit.is_deleted = false")
      .andWhere("permit.status NOT IN (:...excludedStatuses)", { excludedStatuses: CONFLICT_EXCLUDED_STATUSES })
      .andWhere("(permit.risk_level = :highRiskLevel OR permit.permit_type IN (:...highRiskTypes))", {
        highRiskLevel: HIGH_RISK_LEVEL,
        highRiskTypes: [...HIGH_RISK_PERMIT_TYPES]
      })
      .andWhere("permit.time_start < :timeEnd", { timeEnd })
      .andWhere("permit.time_end > :timeStart", { timeStart });
    if (unitId) {
      builder.andWhere("permit.unit_id = :unitId", { unitId });
    } else {
      builder.andWhere("permit.location = :location", { location });
    }
    if (excludeId) {
      builder.andWhere("permit.id <> :excludeId", { excludeId });
    }
    const count = await builder.getCount();
    if (count > 0) {
      throw new ConflictException("High risk work permit conflicts with an existing permit in the same time window");
    }
  }

  private async assertPermitCodeAvailable(scope: TenantParkScope, permitCode: string, excludeId?: string): Promise<void> {
    const builder = this.permitsRepository
      .createQueryBuilder("permit")
      .where("permit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("permit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("permit.permit_code = :permitCode", { permitCode })
      .andWhere("permit.is_deleted = false");
    if (excludeId) {
      builder.andWhere("permit.id <> :excludeId", { excludeId });
    }
    if ((await builder.getCount()) > 0) {
      throw new ConflictException("Work permit code already exists");
    }
  }

  private async applyDataScope(builder: SelectQueryBuilder<SafetyWorkPermitEntity>, actor?: JwtPrincipal): Promise<void> {
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
    this.applyConfiguredIdScopeFilter(builder, "permit", "park_id", parkFilter, "workPermitParkScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "building_id", buildingFilter, "workPermitBuildingScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "floor_id", floorFilter, "workPermitFloorScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "unit_id", unitFilter, "workPermitUnitScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "apply_park_tenant_id", tenantCompanyFilter, "workPermitTenantScopeIds");
    this.applyConfiguredIdScopeFilter(builder, "permit", "monitor_user_id", handlerFilter, "workPermitHandlerScopeIds");
    if (this.isSelfScope(actor)) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("permit.apply_user_id = :currentSafetyWorkPermitUserId", { currentSafetyWorkPermitUserId: actor.sub })
            .orWhere("permit.monitor_user_id = :currentSafetyWorkPermitUserId", { currentSafetyWorkPermitUserId: actor.sub })
            .orWhere("permit.create_by = :currentSafetyWorkPermitUserId", { currentSafetyWorkPermitUserId: actor.sub });
        })
      );
    }
  }

  private applyConfiguredIdScopeFilter(
    builder: SelectQueryBuilder<SafetyWorkPermitEntity>,
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
    const scope = actor.dataScope;
    return scope === "self" || scope === "10";
  }

  private normalizeFileIds(fileIds: string[] | undefined): string[] {
    return Array.from(new Set((fileIds ?? []).map((item) => String(item).trim()).filter(Boolean)));
  }

  private assertFileIdCount(fileIds: string[], message: string): void {
    if (fileIds.length === 0) {
      throw new BadRequestException(message);
    }
  }

  private async assertFiles(scope: TenantParkScope, fileIds: string[]): Promise<void> {
    const uniqueIds = this.normalizeFileIds(fileIds);
    if (uniqueIds.length === 0) return;
    const count = await this.filesRepository.count({
      where: {
        id: In(uniqueIds),
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (count !== uniqueIds.length) {
      throw new BadRequestException("file_id must belong to current tenant and park");
    }
  }

  private async writePermitCheck(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    permitId: string,
    checkType: string,
    result: string,
    content: string | null,
    photoFileIds: string[] = []
  ): Promise<void> {
    const check = manager.getRepository(SafetyWorkPermitCheckEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      permitId,
      checkType,
      checkUserId: actor.sub,
      checkUserName: actor.realName ?? actor.username,
      checkTime: new Date(),
      result,
      violationDesc: result === "violation" || result === "fail" ? content : null,
      photoFileIds,
      createHazard: false,
      hazardId: null,
      createWorkOrder: false,
      workOrderId: null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyWorkPermitCheckEntity).save(check);
  }

  private async applyLifecycleTransition(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: SafetyWorkPermitEntity,
    nextStatus: string,
    action: string,
    content: string,
    reason: string | null,
    options: {
      photoFileIds?: string[];
      checkType?: string;
      checkResult?: string;
      mutate?: (permit: SafetyWorkPermitEntity) => void;
    } = {}
  ): Promise<SafetyWorkPermitEntity> {
    await this.validateDictionaries(scope, {
      permitType: entity.permitType,
      applyType: entity.applyType,
      riskLevel: entity.riskLevel,
      status: nextStatus
    });
    const beforeStatus = entity.status;
    entity.status = nextStatus;
    entity.updateBy = actor.sub;
    options.mutate?.(entity);
    const photoFileIds = this.normalizeFileIds(options.photoFileIds);
    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(SafetyWorkPermitEntity).save(entity);
      if (options.checkType && options.checkResult) {
        await this.writePermitCheck(manager, scope, actor, result.id, options.checkType, options.checkResult, reason ?? content, photoFileIds);
      }
      await this.writePermitLog(manager, scope, actor, result.id, action, beforeStatus, nextStatus, content, reason, photoFileIds);
      await this.writeActionLog(manager, scope, actor, result.id, action, beforeStatus, nextStatus, content, reason);
      return result;
    });
    return this.detail(scope, saved.id, actor);
  }

  private async writePermitLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    workPermitId: string,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    reason?: string | null,
    attachmentFileIds: string[] = []
  ): Promise<void> {
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_WORK_PERMIT_LOG_CODE");
    const log = manager.getRepository(SafetyWorkPermitLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: generated.code,
      workPermitId,
      action,
      beforeStatus,
      afterStatus,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      content,
      reason: reason ?? null,
      attachmentFileIds,
      opTime: new Date(),
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyWorkPermitLogEntity).save(log);
  }

  private async writeHazardStatusLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
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

  private async writeActionLog(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    bizId: string,
    action: string,
    beforeStatus: string | null,
    afterStatus: string | null,
    content: string,
    reason?: string | null,
    bizType = WORK_PERMIT_BIZ_TYPE
  ): Promise<void> {
    const log = manager.getRepository(SafetyActionLogEntity).create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      bizType,
      bizId,
      action,
      beforeStatus,
      afterStatus,
      operatorId: actor.sub,
      operatorName: actor.realName ?? actor.username,
      reason: reason ?? null,
      content,
      opTime: new Date(),
      payload: {},
      createBy: actor.sub,
      updateBy: actor.sub
    });
    await manager.getRepository(SafetyActionLogEntity).save(log);
  }

  private buildWorkPermitWorkOrderDescription(
    permit: SafetyWorkPermitEntity,
    check: SafetyWorkPermitCheckEntity,
    description?: string
  ): string {
    const parts = [
      description?.trim() || "作业许可巡查违规后续处理",
      `许可编号：${permit.permitCode}`,
      `巡查结果：${check.result}`,
      check.violationDesc ? `巡查说明：${check.violationDesc}` : null,
      `作业位置：${permit.location}`
    ].filter((item): item is string => Boolean(item));
    return parts.join("\n");
  }

  private async changePermitStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    entity: SafetyWorkPermitEntity,
    nextStatus: string,
    action: string,
    dto: SafetyWorkPermitActionDto,
    content: string,
    rejectReason?: string | null
  ): Promise<SafetyWorkPermitEntity> {
    const beforeStatus = entity.status;
    const opTime = new Date();
    const record = {
      action,
      before_status: beforeStatus,
      after_status: nextStatus,
      opinion: dto.opinion ?? content,
      reject_reason: rejectReason ?? null,
      operator_id: actor.sub,
      operator_name: actor.realName ?? actor.username,
      op_time: opTime.toISOString()
    };
    entity.status = nextStatus;
    entity.approveRecords = [...(entity.approveRecords ?? []), record];
    entity.updateBy = actor.sub;
    const saved = await this.dataSource.transaction(async (manager) => {
      const result = await manager.getRepository(SafetyWorkPermitEntity).save(entity);
      await this.writePermitLog(manager, scope, actor, result.id, action, beforeStatus, nextStatus, content, rejectReason ?? dto.opinion ?? null);
      await this.writeActionLog(manager, scope, actor, result.id, action, beforeStatus, nextStatus, content, rejectReason ?? dto.opinion ?? null);
      return result;
    });
    return this.detail(scope, saved.id, actor);
  }

  private assertPermission(actor: JwtPrincipal, permission: string): void {
    if (actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission)) return;
    throw new ForbiddenException(`Missing permission ${permission}`);
  }

  private assertRequired(value: unknown, message: string): void {
    if (value === null || value === undefined || String(value).trim().length === 0) {
      throw new BadRequestException(message);
    }
  }
}
