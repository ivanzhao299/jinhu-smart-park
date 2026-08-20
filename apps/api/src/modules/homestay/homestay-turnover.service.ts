import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type HomestayTurnoverDetailResponse,
  type HomestayTurnoverListItem,
  type HomestayTurnoverListResponse,
  type PropertyWorkbenchFileRef,
  type TenantParkScope
} from "@jinhu/shared";
import { DataSource, type EntityManager, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { FileEntity } from "../files/entities/file.entity";
import {
  PROPERTY_OCCUPANCY_PORT,
  type PropertyOccupancyPort
} from "../property-operations/property-occupancy.port";
import { PropertyUnitAccessService } from "../property-operations/property-unit-access.service";
import { WorkOrderEntity } from "../work-orders/entities/work-order.entity";
import type { ExecuteHomestayTurnoverDto, HomestayTurnoverQueryDto } from "./dto/homestay.dto";
import {
  HomestayRateConfigEntity,
  HomestayTurnoverTaskEntity
} from "./entities/homestay.entities";
import { projectHomestayTurnover } from "./homestay-projections";
import { HomestayWorkbenchQueryService } from "./homestay-workbench-query.service";

@Injectable()
export class HomestayTurnoverService {
  constructor(
    @InjectRepository(HomestayTurnoverTaskEntity)
    private readonly turnoversRepository: Repository<HomestayTurnoverTaskEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(WorkOrderEntity)
    private readonly workOrdersRepository: Repository<WorkOrderEntity>,
    @Inject(PROPERTY_OCCUPANCY_PORT)
    private readonly propertyOccupanciesService: PropertyOccupancyPort,
    private readonly unitAccessService: PropertyUnitAccessService,
    private readonly dataSource: DataSource,
    @Optional()
    private readonly workbenchQuery?: HomestayWorkbenchQueryService
  ) {}

  async listTurnovers(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: HomestayTurnoverQueryDto
  ): Promise<HomestayTurnoverListResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    const builder = this.turnoversRepository.createQueryBuilder("task")
      .where("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    if (query.status === "open") {
      builder.andWhere("task.status IN (:...statuses)", {
        statuses: ["pending", "cleaning", "inspection", "exception"]
      });
    } else builder.andWhere("task.status = :status", { status: query.status });
    const [tasks, total] = await builder.orderBy("task.create_time", "ASC")
      .skip((query.page - 1) * query.page_size).take(query.page_size).getManyAndCount();
    const unitRows = tasks.length ? await this.dataSource.query(
      `SELECT id, unit_code AS "unitCode", unit_name AS "unitName"
         FROM biz_unit
        WHERE tenant_id = $1 AND park_id = $2 AND id = ANY($3::uuid[])`,
      [scope.tenantId, scope.parkId, tasks.map((task) => task.unitId)]
    ) as Array<{ id: string; unitCode: string | null; unitName: string | null }> : [];
    const unitDisplay = new Map(unitRows.map((unit) => [unit.id, unit]));
    const canReadFiles = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const items = tasks.map((task): HomestayTurnoverListItem => ({
      ...projectHomestayTurnover(task, canReadFiles),
      unitCode: unitDisplay.get(task.unitId)?.unitCode ?? null,
      unitName: unitDisplay.get(task.unitId)?.unitName ?? null,
      createTime: task.createTime.toISOString()
    }));
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async getTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<HomestayTurnoverDetailResponse> {
    const allowedUnitIds = await this.unitAccessService.allowedUnitIds(scope, actor);
    if (allowedUnitIds !== null && allowedUnitIds.length === 0) {
      throw new NotFoundException("Turnover task not found");
    }
    const builder = this.turnoversRepository.createQueryBuilder("task")
      .where("task.id = :id", { id })
      .andWhere("task.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("task.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("task.is_deleted = false");
    if (allowedUnitIds !== null) {
      builder.andWhere("task.unit_id IN (:...allowedUnitIds)", { allowedUnitIds });
    }
    const task = await builder.getOne();
    if (!task) throw new NotFoundException("Turnover task not found");
    if (task.assigneeId !== null) {
      await this.requireWorkbenchQuery().assertAssignedTurnoverAccess(actor, task.assigneeId);
    }
    const canReadFiles = this.hasPermission(actor, SYSTEM_PERMISSIONS.FILE_READ);
    const [unitRows, files, linkedWorkOrder] = await Promise.all([
      this.dataSource.query(
        `SELECT unit_code AS "unitCode", unit_name AS "unitName" FROM biz_unit
          WHERE tenant_id=$1 AND park_id=$2 AND id=$3 AND is_deleted=false LIMIT 1`,
        [scope.tenantId, scope.parkId, task.unitId]
      ) as Promise<Array<{ unitCode: string | null; unitName: string | null }>>,
      canReadFiles && task.photoFileIds.length > 0 ? this.filesRepository.createQueryBuilder("file")
        .select(["file.id", "file.originalName", "file.mimeType", "file.fileSize"])
        .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("file.biz_type = 'homestay_turnover'")
        .andWhere("file.biz_id = :taskId", { taskId: task.id })
        .andWhere("file.id IN (:...photoFileIds)", { photoFileIds: task.photoFileIds })
        .andWhere("file.status = 1").andWhere("file.is_deleted = false")
        .orderBy("file.create_time", "ASC").getMany() : Promise.resolve([]),
      task.linkedWorkOrderId && this.workbenchQuery
        ? this.workbenchQuery.getAuthorizedWorkOrderReference(scope, actor, task.linkedWorkOrderId)
        : Promise.resolve(undefined)
    ]);
    const unit = unitRows[0];
    return { ...projectHomestayTurnover(task, canReadFiles),
      unitCode: unit?.unitCode ?? null, unitName: unit?.unitName ?? null,
      createTime: task.createTime.toISOString(),
      ...(canReadFiles ? { evidence: files.map((file): PropertyWorkbenchFileRef => ({
        id: file.id, originalName: file.originalName, mimeType: file.mimeType,
        fileSize: file.fileSize
      })) } : {}),
      ...(linkedWorkOrder ? { linkedWorkOrder } : {})
    };
  }

  async executeTurnover(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    action: "start" | "complete" | "inspect" | "exception",
    dto: ExecuteHomestayTurnoverDto
  ) {
    if (!["start", "complete", "inspect", "exception"].includes(action)) {
      throw new BadRequestException("Unsupported turnover action");
    }
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(HomestayTurnoverTaskEntity);
      const task = await repository.findOne({ where: { id, tenantId: scope.tenantId,
        parkId: scope.parkId, isDeleted: false }, lock: { mode: "pessimistic_write" } });
      if (!task) throw new NotFoundException("Turnover task not found");
      await this.unitAccessService.assertAccess(scope, actor, task.unitId);
      if (task.assigneeId !== null) {
        await this.requireWorkbenchQuery().assertAssignedTurnoverAccess(actor, task.assigneeId);
      }
      await this.applyTransition(manager, scope, actor, task, action, dto);
      if (dto.assignee_id) task.assigneeId = dto.assignee_id;
      if (dto.assignee_name?.trim()) task.assigneeName = dto.assignee_name.trim();
      if (dto.photo_file_ids) task.photoFileIds = await this.resolvePhotoFileIds(
        manager, scope, task.id, dto.photo_file_ids);
      if (dto.consumables) task.consumables = dto.consumables;
      if (dto.linked_work_order_id) {
        const workOrder = await this.requireWorkbenchQuery().findAuthorizedOpenWorkOrderForTurnover(
          scope, actor, dto.linked_work_order_id, task.unitId, manager.getRepository(WorkOrderEntity)
        );
        if (!workOrder) {
          throw new BadRequestException("linked_work_order_id must reference a work order for this unit");
        }
        task.linkedWorkOrderId = workOrder.id;
      }
      task.updateBy = actor.sub;
      return repository.save(task);
    });
  }

  private async applyTransition(
    manager: EntityManager,
    scope: TenantParkScope,
    actor: JwtPrincipal,
    task: HomestayTurnoverTaskEntity,
    action: "start" | "complete" | "inspect" | "exception",
    dto: ExecuteHomestayTurnoverDto
  ): Promise<void> {
    if (action === "start") {
      if (task.status !== "pending") throw new ConflictException("Only pending turnover can start");
      task.status = "cleaning";
      task.startedAt = new Date();
      return;
    }
    if (action === "exception") {
      if (!["pending", "cleaning", "inspection", "exception"].includes(task.status)) {
        throw new ConflictException("Completed turnover cannot be marked as exception");
      }
      if (!dto.exception_description?.trim()) {
        throw new BadRequestException("Exception description is required");
      }
      task.status = "exception";
      task.exceptionDescription = dto.exception_description.trim();
      return;
    }
    const config = await manager.getRepository(HomestayRateConfigEntity).findOne({ where: {
      tenantId: scope.tenantId, parkId: scope.parkId, unitId: task.unitId, isDeleted: false
    } });
    if (action === "complete") {
      if (!["cleaning", "exception"].includes(task.status)) {
        throw new ConflictException("Only cleaning or exception turnover can be completed");
      }
      task.completedAt = new Date();
      task.status = config?.checkoutRequiresInspection ? "inspection" : "completed";
    } else {
      if (task.status !== "inspection") {
        throw new ConflictException("Only inspection turnover can be inspected");
      }
      task.inspectedAt = new Date();
      task.status = "completed";
    }
    if (task.status === "completed" && task.occupancyId) {
      await this.propertyOccupanciesService.releaseInTransaction(
        manager, scope, actor, task.occupancyId, "turnover_completed", "completed");
    }
  }

  private async resolvePhotoFileIds(
    manager: EntityManager,
    scope: TenantParkScope,
    turnoverTaskId: string,
    fileIds: string[]
  ): Promise<string[]> {
    const requestedIds = [...new Set(fileIds.map((fileId) => fileId.trim()).filter(Boolean))];
    const files = await manager.getRepository(FileEntity).createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.biz_type = :bizType", { bizType: "homestay_turnover" })
      .andWhere("file.biz_id = :turnoverTaskId", { turnoverTaskId })
      .andWhere("file.status = 1").andWhere("file.is_deleted = false")
      .setLock("pessimistic_write").getMany();
    const associatedIds = files.map((file) => file.id);
    const associatedIdSet = new Set(associatedIds);
    if (requestedIds.some((fileId) => !associatedIdSet.has(fileId))) {
      throw new BadRequestException(
        "photo_file_ids must be active homestay_turnover files for this task in the current scope"
      );
    }
    return associatedIds;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*")
      || actor.permissions.includes(permission));
  }

  private requireWorkbenchQuery(): HomestayWorkbenchQueryService {
    if (!this.workbenchQuery) {
      throw new ForbiddenException("Turnover authorization dependency is unavailable");
    }
    return this.workbenchQuery;
  }
}
