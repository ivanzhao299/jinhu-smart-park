import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, DataSource, Repository, SelectQueryBuilder, type EntityManager, type ObjectLiteral } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import type { DataScopeFilter } from "../data-scopes/data-scope.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FilesService } from "../files/files.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import { ParkTenantEntity } from "../park-tenants/entities/park-tenant.entity";
import { SafetyActionLogEntity } from "../safety-inspect-tasks/entities/safety-action-log.entity";
import { UnitEntity } from "../units/entities/unit.entity";
import { UserEntity } from "../users/entities/user.entity";
import { CreateSafetyEmergencyContactDto } from "./dto/create-safety-emergency-contact.dto";
import { CreateSafetyEmergencyEventDto } from "./dto/create-safety-emergency-event.dto";
import { CreateSafetyEmergencyPlanDto } from "./dto/create-safety-emergency-plan.dto";
import { SafetyEmergencyContactQueryDto } from "./dto/safety-emergency-contact-query.dto";
import {
  CreateSafetyEmergencyTimelineDto,
  SafetyEmergencyActionDto,
  SafetyEmergencyReviewDto
} from "./dto/safety-emergency-action.dto";
import { SafetyEmergencyEventQueryDto } from "./dto/safety-emergency-event-query.dto";
import { SafetyEmergencyPlanQueryDto } from "./dto/safety-emergency-plan-query.dto";
import { SosSafetyEmergencyEventDto } from "./dto/sos-safety-emergency-event.dto";
import { UpdateSafetyEmergencyContactDto } from "./dto/update-safety-emergency-contact.dto";
import { UpdateSafetyEmergencyEventDto } from "./dto/update-safety-emergency-event.dto";
import { UpdateSafetyEmergencyPlanDto } from "./dto/update-safety-emergency-plan.dto";
import { SafetyEmergencyContactEntity } from "./entities/safety-emergency-contact.entity";
import { SafetyEmergencyEventEntity } from "./entities/safety-emergency-event.entity";
import { SafetyEmergencyPlanEntity } from "./entities/safety-emergency-plan.entity";
import { SafetyEmergencyTimelineEntity } from "./entities/safety-emergency-timeline.entity";

const CONTACT_ENTITY = "emergency_contact";
const PLAN_ENTITY = "emergency_plan";
const EVENT_ENTITY = "emergency_event";
const EVENT_STATUS_REPORTED = "10";
const EVENT_STATUS_RESPONDING = "20";
const EVENT_STATUS_DISPOSING = "30";
const EVENT_STATUS_CONTROLLED = "40";
const EVENT_STATUS_REVIEWING = "50";
const EVENT_STATUS_CLOSED = "60";
const EVENT_STATUS_UPGRADED = "80";
const EVENT_STATUS_CANCELLED = "90";
const EVENT_STATUS_FALSE_ALARM = "91";
const EVENT_SOURCE_MANUAL = "manual";

@Injectable()
export class SafetyEmergencyService {
  constructor(
    @InjectRepository(SafetyEmergencyContactEntity)
    private readonly contactsRepository: Repository<SafetyEmergencyContactEntity>,
    @InjectRepository(SafetyEmergencyPlanEntity)
    private readonly plansRepository: Repository<SafetyEmergencyPlanEntity>,
    @InjectRepository(SafetyEmergencyEventEntity)
    private readonly eventsRepository: Repository<SafetyEmergencyEventEntity>,
    @InjectRepository(SafetyEmergencyTimelineEntity)
    private readonly timelinesRepository: Repository<SafetyEmergencyTimelineEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
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
    @InjectRepository(SafetyActionLogEntity)
    private readonly actionLogsRepository: Repository<SafetyActionLogEntity>,
    private readonly codeRulesService: CodeRulesService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly filesService: FilesService,
    private readonly dataSource: DataSource
  ) {}

  async listContacts(
    scope: TenantParkScope,
    query: SafetyEmergencyContactQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyEmergencyContactEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedContactBuilder(scope);
    await this.applyParkDataScope(builder, actor, "contact");
    this.applyContactQuery(builder, query);
    this.applyContactSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", CONTACT_ENTITY, items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async contactDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyEmergencyContactEntity> {
    const entity = await this.findContact(scope, id);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", CONTACT_ENTITY, entity);
  }

  async createContact(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateSafetyEmergencyContactDto
  ): Promise<SafetyEmergencyContactEntity> {
    this.assertRequired(dto.contact_name, "contact_name is required");
    this.assertRequired(dto.mobile, "mobile is required");
    const status = dto.status ?? "enabled";
    await this.validateContactDictionaries(scope, dto.contact_role, dto.duty_type, status);
    const generated = dto.contact_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_CONTACT_CODE");
    const contactCode = dto.contact_code ?? generated?.code ?? "";
    await this.assertContactCodeAvailable(scope, contactCode);
    const entity = this.contactsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: contactCode,
      contactCode,
      contactName: dto.contact_name,
      contactRole: dto.contact_role ?? null,
      mobile: dto.mobile,
      email: dto.email ?? null,
      orgId: dto.org_id ?? null,
      userId: dto.user_id ?? null,
      dutyType: dto.duty_type ?? null,
      priorityLevel: dto.priority_level ?? 0,
      notifyChannels: dto.notify_channels ?? [],
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.contactsRepository.save(entity);
    return this.contactDetail(scope, saved.id, actor);
  }

  async updateContact(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateSafetyEmergencyContactDto
  ): Promise<SafetyEmergencyContactEntity> {
    const entity = await this.findContact(scope, id);
    const nextContactCode = dto.contact_code ?? entity.contactCode;
    const nextRole = dto.contact_role === undefined ? entity.contactRole ?? undefined : dto.contact_role;
    const nextDutyType = dto.duty_type === undefined ? entity.dutyType ?? undefined : dto.duty_type;
    const nextStatus = dto.status ?? entity.status;
    await this.validateContactDictionaries(scope, nextRole, nextDutyType, nextStatus);
    if (nextContactCode !== entity.contactCode) {
      await this.assertContactCodeAvailable(scope, nextContactCode, entity.id);
    }
    Object.assign(entity, {
      code: nextContactCode,
      contactCode: nextContactCode,
      contactName: dto.contact_name ?? entity.contactName,
      contactRole: dto.contact_role === undefined ? entity.contactRole : dto.contact_role ?? null,
      mobile: dto.mobile ?? entity.mobile,
      email: dto.email === undefined ? entity.email : dto.email ?? null,
      orgId: dto.org_id === undefined ? entity.orgId : dto.org_id ?? null,
      userId: dto.user_id === undefined ? entity.userId : dto.user_id ?? null,
      dutyType: dto.duty_type === undefined ? entity.dutyType : dto.duty_type ?? null,
      priorityLevel: dto.priority_level ?? entity.priorityLevel,
      notifyChannels: dto.notify_channels ?? entity.notifyChannels,
      status: nextStatus,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.contactsRepository.save(entity);
    return this.contactDetail(scope, saved.id, actor);
  }

  async softDeleteContact(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findContact(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.contactsRepository.save(entity);
    return { id };
  }

  async listPlans(
    scope: TenantParkScope,
    query: SafetyEmergencyPlanQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyEmergencyPlanEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedPlanBuilder(scope);
    await this.applyParkDataScope(builder, actor, "plan");
    this.applyPlanQuery(builder, query);
    this.applyPlanSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", PLAN_ENTITY, items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async planDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyEmergencyPlanEntity> {
    const entity = await this.findPlan(scope, id);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", PLAN_ENTITY, entity);
  }

  async createPlan(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateSafetyEmergencyPlanDto): Promise<SafetyEmergencyPlanEntity> {
    this.assertRequired(dto.plan_name, "plan_name is required");
    this.assertRequired(dto.incident_type, "incident_type is required");
    this.assertRequired(dto.severity_level, "severity_level is required");
    const status = dto.status ?? "enabled";
    await this.validatePlanDictionaries(scope, dto.incident_type, dto.severity_level, dto.response_level, status);
    await this.assertFilesBelongToScope(scope, dto.attachment_file_ids);
    const generated = dto.plan_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_PLAN_CODE");
    const planCode = dto.plan_code ?? generated?.code ?? "";
    await this.assertPlanCodeAvailable(scope, planCode);
    const entity = this.plansRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      code: planCode,
      planCode,
      planName: dto.plan_name,
      incidentType: dto.incident_type,
      severityLevel: dto.severity_level,
      responseLevel: dto.response_level ?? null,
      commanderRole: dto.commander_role ?? null,
      responseTeamRoleCodes: dto.response_team_role_codes ?? [],
      stepsJson: this.normalizeSteps(dto.steps_json),
      attachmentFileIds: dto.attachment_file_ids ?? [],
      status,
      remark: dto.remark ?? null,
      createBy: actor.sub,
      updateBy: actor.sub
    });
    const saved = await this.plansRepository.save(entity);
    return this.planDetail(scope, saved.id, actor);
  }

  async updatePlan(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateSafetyEmergencyPlanDto
  ): Promise<SafetyEmergencyPlanEntity> {
    const entity = await this.findPlan(scope, id);
    const nextPlanCode = dto.plan_code ?? entity.planCode;
    const nextIncidentType = dto.incident_type ?? entity.incidentType;
    const nextSeverityLevel = dto.severity_level ?? entity.severityLevel;
    const nextResponseLevel = dto.response_level === undefined ? entity.responseLevel ?? undefined : dto.response_level;
    const nextStatus = dto.status ?? entity.status;
    await this.validatePlanDictionaries(scope, nextIncidentType, nextSeverityLevel, nextResponseLevel, nextStatus);
    await this.assertFilesBelongToScope(scope, dto.attachment_file_ids);
    if (nextPlanCode !== entity.planCode) {
      await this.assertPlanCodeAvailable(scope, nextPlanCode, entity.id);
    }
    Object.assign(entity, {
      code: nextPlanCode,
      planCode: nextPlanCode,
      planName: dto.plan_name ?? entity.planName,
      incidentType: nextIncidentType,
      severityLevel: nextSeverityLevel,
      responseLevel: dto.response_level === undefined ? entity.responseLevel : dto.response_level ?? null,
      commanderRole: dto.commander_role === undefined ? entity.commanderRole : dto.commander_role ?? null,
      responseTeamRoleCodes: dto.response_team_role_codes ?? entity.responseTeamRoleCodes,
      stepsJson: dto.steps_json === undefined ? entity.stepsJson : this.normalizeSteps(dto.steps_json),
      attachmentFileIds: dto.attachment_file_ids ?? entity.attachmentFileIds,
      status: nextStatus,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.plansRepository.save(entity);
    return this.planDetail(scope, saved.id, actor);
  }

  async softDeletePlan(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findPlan(scope, id);
    await this.assertNoOpenEmergencyEvents(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.plansRepository.save(entity);
    return { id };
  }

  async listEvents(
    scope: TenantParkScope,
    query: SafetyEmergencyEventQueryDto,
    actor?: JwtPrincipal
  ): Promise<PaginatedResult<SafetyEmergencyEventEntity>> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    const builder = this.scopedEventBuilder(scope);
    await this.applyParkDataScope(builder, actor, "event");
    this.applyEventQuery(builder, query);
    this.applyEventSort(builder, query.sort);
    const [items, total] = await builder.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "safety", EVENT_ENTITY, items);
    return { items: securedItems, total, page, page_size: pageSize };
  }

  async eventDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyEmergencyEventEntity> {
    const entity = await this.findEvent(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "safety", EVENT_ENTITY, entity);
  }

  async createEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreateSafetyEmergencyEventDto
  ): Promise<SafetyEmergencyEventEntity> {
    this.assertRequired(dto.title, "title is required");
    this.assertRequired(dto.incident_type, "incident_type is required");
    this.assertRequired(dto.severity_level, "severity_level is required");
    this.assertRequired(dto.location, "location is required");
    this.assertRequired(dto.description, "description is required");
    const status = EVENT_STATUS_REPORTED;
    const sourceType = dto.source_type ?? EVENT_SOURCE_MANUAL;
    await this.validateEventDictionaries(scope, {
      incidentType: dto.incident_type,
      severityLevel: dto.severity_level,
      responseLevel: dto.response_level,
      sourceType,
      status
    });
    const context = await this.resolveEventContext(scope, dto);
    await this.assertFilesBelongToScope(scope, [...(dto.photos_file_ids ?? []), ...(dto.videos_file_ids ?? []), dto.review_file_id].filter(Boolean) as string[]);
    const generated = dto.emergency_code ? null : await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_EVENT_CODE");
    const emergencyCode = dto.emergency_code ?? generated?.code ?? "";
    await this.assertEventCodeAvailable(scope, emergencyCode);
    const matchedPlanId = dto.emergency_plan_id ?? (await this.matchEmergencyPlan(scope, dto.incident_type, dto.severity_level));

    const saved = await this.dataSource.transaction(async (manager) => {
      const entity = manager.getRepository(SafetyEmergencyEventEntity).create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: emergencyCode,
        emergencyCode,
        sourceType,
        sourceId: dto.source_id ?? null,
        incidentType: dto.incident_type,
        severityLevel: dto.severity_level,
        responseLevel: dto.response_level ?? null,
        title: dto.title,
        description: dto.description,
        buildingId: context.buildingId,
        floorId: context.floorId,
        unitId: dto.unit_id ?? null,
        parkTenantId: dto.park_tenant_id ?? null,
        location: dto.location,
        gpsLng: dto.gps_lng === undefined ? null : String(dto.gps_lng),
        gpsLat: dto.gps_lat === undefined ? null : String(dto.gps_lat),
        reporterId: dto.reporter_id ?? actor.sub,
        reporterName: dto.reporter_name ?? this.actorName(actor),
        reporterMobile: dto.reporter_mobile ?? null,
        commanderId: dto.commander_id ?? null,
        commanderName: context.commanderName,
        responseTeamUserIds: dto.response_team_user_ids ?? [],
        emergencyPlanId: matchedPlanId,
        photosFileIds: dto.photos_file_ids ?? [],
        videosFileIds: dto.videos_file_ids ?? [],
        status,
        reportTime: new Date(),
        reviewFileId: dto.review_file_id ?? null,
        conclusion: dto.conclusion ?? null,
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      });
      const result = await manager.getRepository(SafetyEmergencyEventEntity).save(entity);
      await this.writeEmergencyTimeline(manager, scope, actor, {
        emergencyId: result.id,
        action: "create",
        beforeStatus: null,
        afterStatus: result.status,
        reason: "应急事件上报",
        content: result.description
      });
      await this.writeSafetyActionLog(manager, scope, actor, {
        bizType: "emergency_event",
        bizId: result.id,
        action: "create",
        beforeStatus: null,
        afterStatus: result.status,
        reason: "应急事件上报",
        content: result.title
      });
      return result;
    });

    return this.eventDetail(scope, saved.id, actor);
  }

  async sosEvent(scope: TenantParkScope, actor: JwtPrincipal, dto: SosSafetyEmergencyEventDto): Promise<SafetyEmergencyEventEntity> {
    this.assertRequired(dto.incident_type, "incident_type is required");
    this.assertRequired(dto.location, "location is required");
    this.assertRequired(dto.description, "description is required");
    const severityLevel = dto.severity_level ?? "30";
    return this.createEvent(scope, actor, {
      source_type: EVENT_SOURCE_MANUAL,
      incident_type: dto.incident_type,
      severity_level: severityLevel,
      response_level: dto.response_level,
      title: dto.title ?? "一键应急上报",
      location: dto.location,
      description: dto.description,
      building_id: dto.building_id,
      floor_id: dto.floor_id,
      unit_id: dto.unit_id,
      park_tenant_id: dto.park_tenant_id,
      gps_lng: dto.gps_lng,
      gps_lat: dto.gps_lat,
      reporter_id: actor.sub,
      reporter_name: dto.reporter_name ?? this.actorName(actor),
      reporter_mobile: dto.reporter_mobile,
      photos_file_ids: dto.photos_file_ids,
      videos_file_ids: dto.videos_file_ids
    });
  }

  async updateEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateSafetyEmergencyEventDto
  ): Promise<SafetyEmergencyEventEntity> {
    const entity = await this.findEvent(scope, id, actor);
    const nextIncidentType = dto.incident_type ?? entity.incidentType;
    const nextSeverityLevel = dto.severity_level ?? entity.severityLevel;
    const nextResponseLevel = dto.response_level === undefined ? entity.responseLevel ?? undefined : dto.response_level;
    const nextSourceType = dto.source_type ?? entity.sourceType;
    await this.validateEventDictionaries(scope, {
      incidentType: nextIncidentType,
      severityLevel: nextSeverityLevel,
      responseLevel: nextResponseLevel,
      sourceType: nextSourceType,
      status: entity.status
    });
    const context = await this.resolveEventContext(scope, dto, entity);
    await this.assertFilesBelongToScope(scope, [...(dto.photos_file_ids ?? []), ...(dto.videos_file_ids ?? []), dto.review_file_id].filter(Boolean) as string[]);
    const nextEmergencyCode = dto.emergency_code ?? entity.emergencyCode;
    if (nextEmergencyCode !== entity.emergencyCode) {
      await this.assertEventCodeAvailable(scope, nextEmergencyCode, entity.id);
    }
    let nextPlanId = dto.emergency_plan_id === undefined ? entity.emergencyPlanId : dto.emergency_plan_id ?? null;
    if (!nextPlanId && (dto.incident_type || dto.severity_level)) {
      nextPlanId = await this.matchEmergencyPlan(scope, nextIncidentType, nextSeverityLevel);
    }
    Object.assign(entity, {
      code: nextEmergencyCode,
      emergencyCode: nextEmergencyCode,
      sourceType: nextSourceType,
      sourceId: dto.source_id === undefined ? entity.sourceId : dto.source_id ?? null,
      incidentType: nextIncidentType,
      severityLevel: nextSeverityLevel,
      responseLevel: dto.response_level === undefined ? entity.responseLevel : dto.response_level ?? null,
      title: dto.title ?? entity.title,
      description: dto.description ?? entity.description,
      buildingId: context.buildingId,
      floorId: context.floorId,
      unitId: dto.unit_id === undefined ? entity.unitId : dto.unit_id ?? null,
      parkTenantId: dto.park_tenant_id === undefined ? entity.parkTenantId : dto.park_tenant_id ?? null,
      location: dto.location ?? entity.location,
      gpsLng: dto.gps_lng === undefined ? entity.gpsLng : String(dto.gps_lng),
      gpsLat: dto.gps_lat === undefined ? entity.gpsLat : String(dto.gps_lat),
      reporterId: dto.reporter_id === undefined ? entity.reporterId : dto.reporter_id ?? null,
      reporterName: dto.reporter_name === undefined ? entity.reporterName : dto.reporter_name ?? null,
      reporterMobile: dto.reporter_mobile === undefined ? entity.reporterMobile : dto.reporter_mobile ?? null,
      commanderId: dto.commander_id === undefined ? entity.commanderId : dto.commander_id ?? null,
      commanderName: context.commanderName,
      responseTeamUserIds: dto.response_team_user_ids ?? entity.responseTeamUserIds,
      emergencyPlanId: nextPlanId,
      photosFileIds: dto.photos_file_ids ?? entity.photosFileIds,
      videosFileIds: dto.videos_file_ids ?? entity.videosFileIds,
      reviewFileId: dto.review_file_id === undefined ? entity.reviewFileId : dto.review_file_id ?? null,
      conclusion: dto.conclusion === undefined ? entity.conclusion : dto.conclusion ?? null,
      remark: dto.remark === undefined ? entity.remark : dto.remark ?? null,
      updateBy: actor.sub
    });
    const saved = await this.eventsRepository.save(entity);
    return this.eventDetail(scope, saved.id, actor);
  }

  async softDeleteEvent(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findEvent(scope, id, actor);
    if (![EVENT_STATUS_CANCELLED, EVENT_STATUS_FALSE_ALARM].includes(entity.status)) {
      throw new BadRequestException("Only cancelled or false-alarm emergency events can be deleted");
    }
    await this.dataSource.transaction(async (manager) => {
      entity.isDeleted = true;
      entity.updateBy = actor.sub;
      await manager.getRepository(SafetyEmergencyEventEntity).save(entity);
      await this.writeEmergencyTimeline(manager, scope, actor, {
        emergencyId: entity.id,
        action: "delete",
        beforeStatus: entity.status,
        afterStatus: entity.status,
        reason: "删除应急事件",
        content: entity.title
      });
      await this.writeSafetyActionLog(manager, scope, actor, {
        bizType: "emergency_event",
        bizId: entity.id,
        action: "delete",
        beforeStatus: entity.status,
        afterStatus: entity.status,
        reason: "删除应急事件",
        content: entity.title
      });
    });
    return { id };
  }

  async eventTimeline(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<SafetyEmergencyTimelineEntity[]> {
    await this.findEvent(scope, id, actor);
    return this.timelinesRepository
      .createQueryBuilder("timeline")
      .where("timeline.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("timeline.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("timeline.is_deleted = false")
      .andWhere("timeline.emergency_id = :id", { id })
      .orderBy("timeline.op_time", "DESC")
      .addOrderBy("timeline.create_time", "DESC")
      .getMany();
  }

  async addEventTimeline(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: CreateSafetyEmergencyTimelineDto
  ): Promise<SafetyEmergencyTimelineEntity> {
    this.assertRequired(dto.content, "content is required");
    const entity = await this.findEvent(scope, id, actor);
    await this.assertFilesBelongToScope(scope, dto.attachment_file_ids);
    return this.dataSource.transaction(async (manager) => {
      const saved = await this.writeEmergencyTimeline(manager, scope, actor, {
        emergencyId: entity.id,
        action: "add_log",
        beforeStatus: entity.status,
        afterStatus: entity.status,
        reason: dto.reason ?? null,
        content: dto.content,
        attachmentFileIds: dto.attachment_file_ids ?? [],
        gpsLng: dto.gps_lng === undefined ? null : String(dto.gps_lng),
        gpsLat: dto.gps_lat === undefined ? null : String(dto.gps_lat)
      });
      await this.writeSafetyActionLog(manager, scope, actor, {
        bizType: "emergency_event",
        bizId: entity.id,
        action: "add_log",
        beforeStatus: entity.status,
        afterStatus: entity.status,
        reason: dto.reason ?? null,
        content: dto.content,
        payload: {
          attachment_file_ids: dto.attachment_file_ids ?? [],
          gps_lng: dto.gps_lng ?? null,
          gps_lat: dto.gps_lat ?? null
        }
      });
      return saved;
    });
  }

  async respondEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "respond",
      allowedStatuses: [EVENT_STATUS_REPORTED],
      afterStatus: EVENT_STATUS_RESPONDING,
      defaultReason: "应急事件响应",
      body: dto,
      mutate: (event, now) => {
        event.responseTime = now;
      }
    });
  }

  async startDisposalEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "start_disposal",
      allowedStatuses: [EVENT_STATUS_RESPONDING, EVENT_STATUS_UPGRADED],
      afterStatus: EVENT_STATUS_DISPOSING,
      defaultReason: "开始应急处置",
      body: dto
    });
  }

  async controlEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "control",
      allowedStatuses: [EVENT_STATUS_DISPOSING, EVENT_STATUS_UPGRADED],
      afterStatus: EVENT_STATUS_CONTROLLED,
      defaultReason: "事件已控制",
      body: dto,
      mutate: (event, now) => {
        event.controlTime = now;
      }
    });
  }

  async reviewEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyReviewDto
  ): Promise<SafetyEmergencyEventEntity> {
    this.assertRequired(dto.conclusion, "conclusion is required");
    await this.assertFilesBelongToScope(scope, dto.review_file_id ? [dto.review_file_id] : []);
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "review",
      allowedStatuses: [EVENT_STATUS_CONTROLLED],
      afterStatus: EVENT_STATUS_REVIEWING,
      defaultReason: "应急事件复盘",
      body: {
        reason: "应急事件复盘",
        content: dto.conclusion,
        attachment_file_ids: dto.review_file_id ? [dto.review_file_id] : []
      },
      mutate: (event) => {
        event.conclusion = dto.conclusion;
        event.reviewFileId = dto.review_file_id ?? null;
      }
    });
  }

  async closeEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "close",
      allowedStatuses: [EVENT_STATUS_REVIEWING],
      afterStatus: EVENT_STATUS_CLOSED,
      defaultReason: "应急事件闭环",
      body: dto,
      mutate: (event, now) => {
        event.closeTime = now;
      }
    });
  }

  async upgradeEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "upgrade",
      allowedStatuses: [
        EVENT_STATUS_REPORTED,
        EVENT_STATUS_RESPONDING,
        EVENT_STATUS_DISPOSING,
        EVENT_STATUS_CONTROLLED,
        EVENT_STATUS_REVIEWING
      ],
      afterStatus: EVENT_STATUS_UPGRADED,
      defaultReason: "应急事件升级",
      body: dto
    });
  }

  async cancelEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: SafetyEmergencyActionDto
  ): Promise<SafetyEmergencyEventEntity> {
    this.assertRequired(dto.reason, "reason is required");
    return this.transitionEmergencyEvent(scope, actor, id, {
      action: "cancel",
      allowedStatuses: [
        EVENT_STATUS_REPORTED,
        EVENT_STATUS_RESPONDING,
        EVENT_STATUS_DISPOSING,
        EVENT_STATUS_CONTROLLED,
        EVENT_STATUS_REVIEWING,
        EVENT_STATUS_UPGRADED
      ],
      afterStatus: EVENT_STATUS_CANCELLED,
      defaultReason: "应急事件取消或误报",
      body: dto,
      mutate: (event, now) => {
        event.cancelTime = now;
      }
    });
  }

  private async transitionEmergencyEvent(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    options: {
      action: string;
      allowedStatuses: string[];
      afterStatus: string;
      defaultReason: string;
      body?: SafetyEmergencyActionDto;
      mutate?: (event: SafetyEmergencyEventEntity, now: Date) => void;
    }
  ): Promise<SafetyEmergencyEventEntity> {
    const entity = await this.findEvent(scope, id, actor);
    if ([EVENT_STATUS_CLOSED, EVENT_STATUS_CANCELLED, EVENT_STATUS_FALSE_ALARM].includes(entity.status)) {
      throw new BadRequestException("Emergency event is already closed or cancelled");
    }
    if (!options.allowedStatuses.includes(entity.status)) {
      throw new BadRequestException("Emergency event status transition is not allowed");
    }
    await this.assertFilesBelongToScope(scope, options.body?.attachment_file_ids);
    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SafetyEmergencyEventEntity);
      const beforeStatus = entity.status;
      const now = new Date();
      entity.status = options.afterStatus;
      entity.updateBy = actor.sub;
      options.mutate?.(entity, now);
      const result = await repository.save(entity);
      const reason = options.body?.reason?.trim() || options.defaultReason;
      const content = options.body?.content?.trim() || null;
      const attachmentFileIds = options.body?.attachment_file_ids ?? [];
      await this.writeEmergencyTimeline(manager, scope, actor, {
        emergencyId: result.id,
        action: options.action,
        beforeStatus,
        afterStatus: result.status,
        reason,
        content,
        attachmentFileIds
      });
      await this.writeSafetyActionLog(manager, scope, actor, {
        bizType: "emergency_event",
        bizId: result.id,
        action: options.action,
        beforeStatus,
        afterStatus: result.status,
        reason,
        content,
        payload: { attachment_file_ids: attachmentFileIds }
      });
      return result;
    });
    return this.eventDetail(scope, saved.id, actor);
  }

  private scopedContactBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyEmergencyContactEntity> {
    return this.contactsRepository
      .createQueryBuilder("contact")
      .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contact.is_deleted = false");
  }

  private scopedPlanBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyEmergencyPlanEntity> {
    return this.plansRepository
      .createQueryBuilder("plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.is_deleted = false");
  }

  private scopedEventBuilder(scope: TenantParkScope): SelectQueryBuilder<SafetyEmergencyEventEntity> {
    return this.eventsRepository
      .createQueryBuilder("event")
      .leftJoinAndSelect("event.building", "building")
      .leftJoinAndSelect("event.floor", "floor")
      .leftJoinAndSelect("event.unit", "unit")
      .leftJoinAndSelect("event.parkTenant", "parkTenant")
      .leftJoinAndSelect("event.emergencyPlan", "emergencyPlan")
      .where("event.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("event.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("event.is_deleted = false");
  }

  private applyContactQuery(
    builder: SelectQueryBuilder<SafetyEmergencyContactEntity>,
    query: SafetyEmergencyContactQueryDto
  ): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("contact.contact_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("contact.contact_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("contact.mobile ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("contact.email ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.contact_role) builder.andWhere("contact.contact_role = :contactRole", { contactRole: query.contact_role });
    if (query.duty_type) builder.andWhere("contact.duty_type = :dutyType", { dutyType: query.duty_type });
    if (query.user_id) builder.andWhere("contact.user_id = :userId", { userId: query.user_id });
    if (query.status) builder.andWhere("contact.status = :status", { status: query.status });
  }

  private applyPlanQuery(builder: SelectQueryBuilder<SafetyEmergencyPlanEntity>, query: SafetyEmergencyPlanQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("plan.plan_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("plan.plan_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("plan.commander_role ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.incident_type) builder.andWhere("plan.incident_type = :incidentType", { incidentType: query.incident_type });
    if (query.severity_level) builder.andWhere("plan.severity_level = :severityLevel", { severityLevel: query.severity_level });
    if (query.response_level) builder.andWhere("plan.response_level = :responseLevel", { responseLevel: query.response_level });
    if (query.status) builder.andWhere("plan.status = :status", { status: query.status });
  }

  private applyEventQuery(builder: SelectQueryBuilder<SafetyEmergencyEventEntity>, query: SafetyEmergencyEventQueryDto): void {
    if (query.keyword) {
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("event.emergency_code ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("event.title ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("event.description ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("event.location ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("event.reporter_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        })
      );
    }
    if (query.status) builder.andWhere("event.status = :status", { status: query.status });
    if (query.incident_type) builder.andWhere("event.incident_type = :incidentType", { incidentType: query.incident_type });
    if (query.severity_level) builder.andWhere("event.severity_level = :severityLevel", { severityLevel: query.severity_level });
    if (query.source_type) builder.andWhere("event.source_type = :sourceType", { sourceType: query.source_type });
    if (query.building_id) builder.andWhere("event.building_id = :buildingId", { buildingId: query.building_id });
    if (query.unit_id) builder.andWhere("event.unit_id = :unitId", { unitId: query.unit_id });
    if (query.park_tenant_id) builder.andWhere("event.park_tenant_id = :parkTenantId", { parkTenantId: query.park_tenant_id });
    if (query.start_date) builder.andWhere("event.report_time >= :startDate", { startDate: query.start_date });
    if (query.end_date) builder.andWhere("event.report_time <= :endDate", { endDate: query.end_date });
  }

  private applyContactSort(builder: SelectQueryBuilder<SafetyEmergencyContactEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      contact_code: "contact.contactCode",
      contact_name: "contact.contactName",
      contact_role: "contact.contactRole",
      priority_level: "contact.priorityLevel",
      update_time: "contact.updateTime",
      create_time: "contact.createTime"
    };
    this.applySort(builder, sort, sortMap, "contact.priorityLevel", "contact.updateTime");
  }

  private applyPlanSort(builder: SelectQueryBuilder<SafetyEmergencyPlanEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      plan_code: "plan.planCode",
      plan_name: "plan.planName",
      incident_type: "plan.incidentType",
      severity_level: "plan.severityLevel",
      update_time: "plan.updateTime",
      create_time: "plan.createTime"
    };
    this.applySort(builder, sort, sortMap, "plan.updateTime", "plan.updateTime", "DESC");
  }

  private applyEventSort(builder: SelectQueryBuilder<SafetyEmergencyEventEntity>, sort?: string): void {
    const sortMap: Record<string, string> = {
      emergency_code: "event.emergencyCode",
      incident_type: "event.incidentType",
      severity_level: "event.severityLevel",
      report_time: "event.reportTime",
      status: "event.status",
      update_time: "event.updateTime",
      create_time: "event.createTime"
    };
    this.applySort(builder, sort, sortMap, "event.reportTime", "event.updateTime", "DESC");
  }

  private applySort<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    sort: string | undefined,
    sortMap: Record<string, string>,
    defaultField: string,
    tieBreaker: string,
    defaultDirection: "ASC" | "DESC" = "ASC"
  ): void {
    if (sort) {
      const [field, direction] = sort.startsWith("-") ? [sort.slice(1), "DESC"] : [sort, "ASC"];
      builder.orderBy(sortMap[field] ?? defaultField, direction as "ASC" | "DESC");
      builder.addOrderBy(tieBreaker, "DESC");
      return;
    }
    builder.orderBy(defaultField, defaultDirection).addOrderBy(tieBreaker, "DESC");
  }

  private async findContact(scope: TenantParkScope, id: string): Promise<SafetyEmergencyContactEntity> {
    const entity = await this.scopedContactBuilder(scope).andWhere("contact.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Emergency contact not found");
    }
    return entity;
  }

  private async findPlan(scope: TenantParkScope, id: string): Promise<SafetyEmergencyPlanEntity> {
    const entity = await this.scopedPlanBuilder(scope).andWhere("plan.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Emergency plan not found");
    }
    return entity;
  }

  private async findEvent(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<SafetyEmergencyEventEntity> {
    const builder = this.scopedEventBuilder(scope).andWhere("event.id = :id", { id });
    await this.applyParkDataScope(builder, actor, "event");
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Emergency event not found");
    }
    return entity;
  }

  private async validateContactDictionaries(
    scope: TenantParkScope,
    contactRole?: string | null,
    dutyType?: string | null,
    status?: string | null
  ): Promise<void> {
    await Promise.all([
      contactRole ? this.assertDictValue(scope, "safety_emergency_contact_role", contactRole) : Promise.resolve(),
      dutyType ? this.assertDictValue(scope, "safety_emergency_duty_type", dutyType) : Promise.resolve(),
      status ? this.assertDictValue(scope, "safety_emergency_contact_status", status) : Promise.resolve()
    ]);
  }

  private async validatePlanDictionaries(
    scope: TenantParkScope,
    incidentType: string,
    severityLevel: string,
    responseLevel?: string | null,
    status?: string | null
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_emergency_incident_type", incidentType),
      this.assertDictValue(scope, "safety_emergency_severity", severityLevel),
      responseLevel ? this.assertDictValue(scope, "safety_emergency_response_level", responseLevel) : Promise.resolve(),
      status ? this.assertDictValue(scope, "safety_emergency_plan_status", status) : Promise.resolve()
    ]);
  }

  private async validateEventDictionaries(
    scope: TenantParkScope,
    values: {
      incidentType: string;
      severityLevel: string;
      responseLevel?: string | null;
      sourceType: string;
      status: string;
    }
  ): Promise<void> {
    await Promise.all([
      this.assertDictValue(scope, "safety_emergency_incident_type", values.incidentType),
      this.assertDictValue(scope, "safety_emergency_severity", values.severityLevel),
      values.responseLevel ? this.assertDictValue(scope, "safety_emergency_response_level", values.responseLevel) : Promise.resolve(),
      this.assertDictValue(scope, "safety_emergency_source_type", values.sourceType),
      this.assertDictValue(scope, "safety_emergency_status", values.status)
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
    if (!item) {
      throw new BadRequestException(`${dictCode} value is invalid`);
    }
  }

  private async assertContactCodeAvailable(scope: TenantParkScope, contactCode: string, ignoreId?: string): Promise<void> {
    const builder = this.contactsRepository
      .createQueryBuilder("contact")
      .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contact.contact_code = :contactCode", { contactCode })
      .andWhere("contact.is_deleted = false");
    if (ignoreId) builder.andWhere("contact.id <> :ignoreId", { ignoreId });
    if ((await builder.getCount()) > 0) {
      throw new ConflictException("Emergency contact code already exists");
    }
  }

  private async assertPlanCodeAvailable(scope: TenantParkScope, planCode: string, ignoreId?: string): Promise<void> {
    const builder = this.plansRepository
      .createQueryBuilder("plan")
      .where("plan.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("plan.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("plan.plan_code = :planCode", { planCode })
      .andWhere("plan.is_deleted = false");
    if (ignoreId) builder.andWhere("plan.id <> :ignoreId", { ignoreId });
    if ((await builder.getCount()) > 0) {
      throw new ConflictException("Emergency plan code already exists");
    }
  }

  private async assertEventCodeAvailable(scope: TenantParkScope, emergencyCode: string, ignoreId?: string): Promise<void> {
    const builder = this.eventsRepository
      .createQueryBuilder("event")
      .where("event.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("event.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("event.emergency_code = :emergencyCode", { emergencyCode })
      .andWhere("event.is_deleted = false");
    if (ignoreId) builder.andWhere("event.id <> :ignoreId", { ignoreId });
    if ((await builder.getCount()) > 0) {
      throw new ConflictException("Emergency event code already exists");
    }
  }

  private async assertFilesBelongToScope(scope: TenantParkScope, fileIds?: string[]): Promise<void> {
    if (!fileIds || fileIds.length === 0) {
      return;
    }
    const uniqueFileIds = [...new Set(fileIds.filter(Boolean))];
    await Promise.all(uniqueFileIds.map((fileId) => this.filesService.detail(scope, fileId)));
  }

  private async resolveEventContext(
    scope: TenantParkScope,
    dto: Partial<CreateSafetyEmergencyEventDto>,
    current?: SafetyEmergencyEventEntity
  ): Promise<{ buildingId: string | null; floorId: string | null; commanderName: string | null }> {
    let buildingId = dto.building_id === undefined ? current?.buildingId ?? null : dto.building_id ?? null;
    let floorId = dto.floor_id === undefined ? current?.floorId ?? null : dto.floor_id ?? null;

    if (dto.unit_id) {
      const unit = await this.findScopedUnit(scope, dto.unit_id);
      buildingId = unit.buildingId;
      floorId = unit.floorId;
    }

    if (buildingId) {
      await this.findScopedBuilding(scope, buildingId);
    }
    if (floorId) {
      const floor = await this.findScopedFloor(scope, floorId);
      if (buildingId && floor.buildingId !== buildingId) {
        throw new BadRequestException("floor_id does not belong to building_id");
      }
    }
    if (dto.park_tenant_id) {
      await this.findScopedParkTenant(scope, dto.park_tenant_id);
    }
    if (dto.reporter_id) {
      await this.findScopedUser(scope, dto.reporter_id);
    }
    let commanderName = current?.commanderName ?? null;
    if (dto.commander_id) {
      const commander = await this.findScopedUser(scope, dto.commander_id);
      commanderName = dto.commander_name ?? commander.displayName;
    } else if (dto.commander_name !== undefined) {
      commanderName = dto.commander_name ?? null;
    }
    if (dto.response_team_user_ids?.length) {
      await Promise.all(dto.response_team_user_ids.map((userId) => this.findScopedUser(scope, userId)));
    }
    if (dto.emergency_plan_id) {
      await this.findPlan(scope, dto.emergency_plan_id);
    }
    return { buildingId, floorId, commanderName };
  }

  private async findScopedBuilding(scope: TenantParkScope, id: string): Promise<BuildingEntity> {
    const entity = await this.buildingsRepository
      .createQueryBuilder("building")
      .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("building.is_deleted = false")
      .andWhere("building.id = :id", { id })
      .getOne();
    if (!entity) throw new BadRequestException("building_id is invalid");
    return entity;
  }

  private async findScopedFloor(scope: TenantParkScope, id: string): Promise<FloorEntity> {
    const entity = await this.floorsRepository
      .createQueryBuilder("floor")
      .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("floor.is_deleted = false")
      .andWhere("floor.id = :id", { id })
      .getOne();
    if (!entity) throw new BadRequestException("floor_id is invalid");
    return entity;
  }

  private async findScopedUnit(scope: TenantParkScope, id: string): Promise<UnitEntity> {
    const entity = await this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.is_deleted = false")
      .andWhere("unit.id = :id", { id })
      .getOne();
    if (!entity) throw new BadRequestException("unit_id is invalid");
    return entity;
  }

  private async findScopedParkTenant(scope: TenantParkScope, id: string): Promise<ParkTenantEntity> {
    const entity = await this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.is_deleted = false")
      .andWhere("parkTenant.id = :id", { id })
      .getOne();
    if (!entity) throw new BadRequestException("park_tenant_id is invalid");
    return entity;
  }

  private async findScopedUser(scope: TenantParkScope, id: string): Promise<UserEntity> {
    const entity = await this.usersRepository
      .createQueryBuilder("user")
      .where("user.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("user.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("user.is_deleted = false")
      .andWhere("user.id = :id", { id })
      .getOne();
    if (!entity) throw new BadRequestException("user id is invalid");
    return entity;
  }

  private async matchEmergencyPlan(scope: TenantParkScope, incidentType: string, severityLevel: string): Promise<string | null> {
    const exact = await this.scopedPlanBuilder(scope)
      .andWhere("plan.status = :status", { status: "enabled" })
      .andWhere("plan.incident_type = :incidentType", { incidentType })
      .andWhere("plan.severity_level = :severityLevel", { severityLevel })
      .orderBy("plan.updateTime", "DESC")
      .getOne();
    if (exact) return exact.id;
    const fallback = await this.scopedPlanBuilder(scope)
      .andWhere("plan.status = :status", { status: "enabled" })
      .andWhere("plan.incident_type = :incidentType", { incidentType })
      .orderBy("plan.updateTime", "DESC")
      .getOne();
    return fallback?.id ?? null;
  }

  private async assertNoOpenEmergencyEvents(scope: TenantParkScope, planId: string): Promise<void> {
    const runner = this.dataSource.createQueryRunner();
    try {
      const hasTable = await runner.hasTable("biz_safety_emergency_event");
      if (!hasTable || !(await runner.hasColumn("biz_safety_emergency_event", "emergency_plan_id"))) {
        return;
      }
    } finally {
      await runner.release();
    }
    const row = await this.dataSource
      .createQueryBuilder()
      .select("COUNT(1)", "count")
      .from("biz_safety_emergency_event", "event")
      .where("event.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("event.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("event.emergency_plan_id = :planId", { planId })
      .andWhere("event.is_deleted = false")
      .andWhere("event.status NOT IN (:...closedStatuses)", {
        closedStatuses: ["60", "90", "91", "closed", "cancelled", "false_alarm"]
      })
      .getRawOne<{ count: string }>();
    if (Number(row?.count ?? 0) > 0) {
      throw new BadRequestException("Emergency plan has open events and cannot be deleted");
    }
  }

  private async writeEmergencyTimeline(
    manager: EntityManager | DataSource,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    values: {
      emergencyId: string;
      action: string;
      beforeStatus: string | null;
      afterStatus: string | null;
      reason?: string | null;
      content?: string | null;
      attachmentFileIds?: string[];
      gpsLng?: string | null;
      gpsLat?: string | null;
    }
  ): Promise<SafetyEmergencyTimelineEntity> {
    const generated = await this.codeRulesService.generateNext(scope, actor.sub, "SAFETY_EMERGENCY_LOG_CODE");
    const repository = manager.getRepository(SafetyEmergencyTimelineEntity);
    return repository.save(
      repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: generated?.code ?? null,
        emergencyId: values.emergencyId,
        action: values.action,
        beforeStatus: values.beforeStatus,
        afterStatus: values.afterStatus,
        operatorId: actor.sub,
        operatorName: this.actorName(actor),
        reason: values.reason ?? null,
        content: values.content ?? null,
        attachmentFileIds: values.attachmentFileIds ?? [],
        gpsLng: values.gpsLng ?? null,
        gpsLat: values.gpsLat ?? null,
        opTime: new Date(),
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
  }

  private async writeSafetyActionLog(
    manager: EntityManager | DataSource,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    values: {
      bizType: string;
      bizId: string;
      action: string;
      beforeStatus: string | null;
      afterStatus: string | null;
      reason?: string | null;
      content?: string | null;
      payload?: Record<string, unknown>;
    }
  ): Promise<void> {
    const repository = manager.getRepository(SafetyActionLogEntity);
    await repository.save(
      repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        bizType: values.bizType,
        bizId: values.bizId,
        action: values.action,
        beforeStatus: values.beforeStatus,
        afterStatus: values.afterStatus,
        operatorId: actor.sub,
        operatorName: this.actorName(actor),
        reason: values.reason ?? null,
        content: values.content ?? null,
        opTime: new Date(),
        payload: values.payload ?? {},
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
  }

  private normalizeSteps(value: unknown): unknown {
    if (value === undefined || value === null || value === "") {
      return [];
    }
    return value;
  }

  private assertRequired(value: string | undefined, message: string): void {
    if (!value || value.trim().length === 0) {
      throw new BadRequestException(message);
    }
  }

  private actorName(actor: JwtPrincipal): string {
    return actor.realName ?? actor.username;
  }

  private async applyParkDataScope<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
    actor: JwtPrincipal | undefined,
    alias: string
  ): Promise<void> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return;
    }
    const parkFilter = await this.dataScopeService.buildScopeFilter(actor, "park");
    this.applyConfiguredIdScopeFilter(builder, alias, "park_id", parkFilter, `${alias}ParkScopeIds`);
  }

  private applyConfiguredIdScopeFilter<Entity extends ObjectLiteral>(
    builder: SelectQueryBuilder<Entity>,
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
}
