import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import * as XLSX from "xlsx";
import {
  Between,
  Brackets,
  ILike,
  In,
  LessThanOrEqual,
  MoreThanOrEqual,
  type FindOperator,
  type FindOptionsOrder,
  type FindOptionsWhere,
  type Repository,
  type SelectQueryBuilder
} from "typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { AuditService } from "../audit/audit.service";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { DictItemEntity } from "../dicts/entities/dict-item.entity";
import { DictTypeEntity } from "../dicts/entities/dict-type.entity";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import { FilesService, type UploadedFilePayload } from "../files/files.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import type { CreateUnitDto } from "./dto/create-unit.dto";
import type { TransitionUnitStatusDto } from "./dto/transition-unit-status.dto";
import type { AssetStatisticsQueryDto } from "../assets/dto/asset-statistics-query.dto";
import type { UnitStatusBoardQueryDto } from "../assets/dto/unit-status-board-query.dto";
import type { UnitExportDto } from "./dto/unit-export.dto";
import type { UnitStatusLogQueryDto } from "./dto/unit-status-log-query.dto";
import type { UnitQueryDto } from "./dto/unit-query.dto";
import type { UpdateUnitDto } from "./dto/update-unit.dto";
import { UnitEntity } from "./entities/unit.entity";
import { UnitStatusLogEntity } from "./entities/unit-status-log.entity";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";

const SORT_COLUMNS = new Set([
  "unitCode",
  "unitName",
  "usageType",
  "unitArea",
  "useArea",
  "rentalStatus",
  "fittingStatus",
  "refPrice",
  "availableDate",
  "status",
  "createTime",
  "updateTime"
]);

const ALLOWED_RENTAL_STATUS_TRANSITIONS = new Map<number, number[]>([
  [10, [20, 50, 60]],
  [20, [10, 30, 50]],
  [30, [40, 50]],
  [40, [30, 10]],
  [50, [10, 60]],
  [60, [10, 50]]
]);

const UNIT_IMPORT_HEADERS = [
  "code",
  "unit_code",
  "building_code",
  "floor_code",
  "unit_name",
  "usage_type",
  "unit_area",
  "use_area",
  "rental_status",
  "fitting_status",
  "ref_price",
  "available_date",
  "remark"
] as const;

const UNIT_IMPORT_REQUIRED_HEADERS = UNIT_IMPORT_HEADERS.filter((header) => header !== "code");

const UNIT_EXPORT_LIMIT = 50000;

type UnitImportHeader = (typeof UNIT_IMPORT_HEADERS)[number];
type ImportSourceRow = Record<UnitImportHeader, unknown>;

export interface UnitImportRowResult {
  row_no: number;
  success: boolean;
  unit_code: string;
  id: string | null;
  errors: string[];
}

export interface UnitImportResult {
  total: number;
  success_count: number;
  fail_count: number;
  rows: UnitImportRowResult[];
}

interface ValidatedImportRow {
  unitCode: string;
  code: string;
  needsGeneratedCode: boolean;
  buildingId: string;
  floorId: string;
  unitName: string;
  usageType: number;
  unitArea: number;
  useArea: number;
  rentalStatus: number;
  fittingStatus: number;
  refPrice: number;
  availableDate?: string;
  remark?: string;
}

interface UnitImportContext {
  buildingsByCode: Map<string, BuildingEntity>;
  floorsByCode: Map<string, FloorEntity>;
  existingUnitCodes: Set<string>;
  usageTypes: Set<number>;
  rentalStatuses: Set<number>;
  fittingStatuses: Set<number>;
}

interface UnitImportValidationResult {
  unitCode: string;
  errors: string[];
  data?: ValidatedImportRow;
}

type UnitFilterQuery = Pick<UnitExportDto, "building_id" | "floor_id" | "usage_type" | "rental_status" | "fitting_status" | "keyword" | "min_area" | "max_area">;

type AssetStatisticsFilterQuery = Pick<AssetStatisticsQueryDto, "building_id" | "floor_id" | "usage_type">;

export interface UnitStatusBoardUnit {
  unit_id: string;
  unit_code: string;
  unit_name: string;
  unit_area: number;
  rental_status: number;
  rental_status_name: string;
  usage_type: number;
  usage_type_name: string;
  ref_price: number;
}

export interface UnitStatusBoardFloor {
  floor_id: string;
  floor_code: string;
  floor_name: string;
  units: UnitStatusBoardUnit[];
}

export interface UnitStatusBoardBuilding {
  building_id: string;
  building_code: string;
  building_name: string;
  floors: UnitStatusBoardFloor[];
}

@Injectable()
export class UnitsService {
  constructor(
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    @InjectRepository(UnitStatusLogEntity)
    private readonly statusLogRepository: Repository<UnitStatusLogEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(DictTypeEntity)
    private readonly dictTypesRepository: Repository<DictTypeEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemsRepository: Repository<DictItemEntity>,
    private readonly filesService: FilesService,
    private readonly auditService: AuditService,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly codeRulesService: CodeRulesService
  ) {}

  async list(scope: TenantParkScope, query: UnitQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<UnitEntity>> {
    const baseWhere = await this.dataScopeService.buildFindWhere<UnitEntity>(
      scope,
      actor,
      "unit",
      this.findWhere(scope, query),
      { unit: "id", building: "buildingId", floor: "floorId" }
    );
    const keyword = query.keyword?.trim();
    const where = keyword
      ? [
          { ...baseWhere, unitCode: ILike(`%${keyword}%`) },
          { ...baseWhere, unitName: ILike(`%${keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.unitsRepository.findAndCount({
      where,
      relations: { building: true, floor: true },
      order: this.resolveOrder(query.sort),
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "unit", items);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<UnitEntity> {
    const entity = await this.findDetail(scope, id, actor);
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "asset", "unit", entity);
  }

  private async findDetail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<UnitEntity> {
    const builder = this.scopedBuilder(scope)
      .leftJoinAndSelect("unit.building", "building")
      .leftJoinAndSelect("unit.floor", "floor")
      .leftJoinAndSelect("unit.floorplanFile", "floorplanFile")
      .andWhere("unit.id = :id", { id });
    await this.applyUnitDataScope(builder, scope, actor);
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Unit not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateUnitDto): Promise<UnitEntity> {
    const relation = await this.mustMatchBuildingAndFloor(scope, dto.buildingId, dto.floorId);
    const unitCode = await this.resolveUnitCode(scope, actorId, dto.unitCode);
    await this.assertUnitCodeAvailable(scope, unitCode);
    await this.assertFiles(scope, dto.photoFileIds);
    await this.assertFile(scope, dto.floorplanFileId);

    const entity = this.unitsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      unitCode,
      code: unitCode,
      buildingId: relation.building.id,
      floorId: relation.floor.id,
      unitName: dto.unitName.trim(),
      usageType: dto.usageType,
      unitArea: this.numberToDecimal(dto.unitArea),
      useArea: this.numberToDecimal(dto.useArea),
      rentalStatus: dto.rentalStatus,
      fittingStatus: dto.fittingStatus,
      refPrice: this.numberToDecimal(dto.refPrice),
      photoFileIds: dto.photoFileIds?.length ? dto.photoFileIds : null,
      photoUrls: dto.photoUrls?.length ? dto.photoUrls : null,
      floorplanFileId: dto.floorplanFileId ?? null,
      floorplanUrl: this.emptyToNull(dto.floorplanUrl),
      availableDate: dto.availableDate ?? null,
      status: dto.status ?? 1,
      remark: this.emptyToNull(dto.remark),
      createBy: actorId,
      updateBy: actorId
    });
    return this.unitsRepository.save(entity);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateUnitDto): Promise<UnitEntity> {
    const entity = await this.findDetail(scope, id, actor);
    const nextBuildingId = dto.buildingId ?? entity.buildingId;
    const nextFloorId = dto.floorId ?? entity.floorId;
    if (dto.buildingId || dto.floorId) {
      const relation = await this.mustMatchBuildingAndFloor(scope, nextBuildingId, nextFloorId);
      entity.buildingId = relation.building.id;
      entity.floorId = relation.floor.id;
    }

    const nextCode = dto.unitCode?.trim();
    if (nextCode && nextCode !== entity.unitCode) {
      await this.assertUnitCodeAvailable(scope, nextCode, id);
      entity.unitCode = nextCode;
      entity.code = nextCode;
    }
    if (!entity.code) {
      entity.code = entity.unitCode;
    }
    if (dto.photoFileIds !== undefined) {
      await this.assertFiles(scope, dto.photoFileIds);
      entity.photoFileIds = dto.photoFileIds.length ? dto.photoFileIds : null;
    }
    if (dto.floorplanFileId !== undefined) {
      await this.assertFile(scope, dto.floorplanFileId);
      entity.floorplanFileId = dto.floorplanFileId;
    }

    if (dto.unitName !== undefined) entity.unitName = dto.unitName.trim();
    if (dto.usageType !== undefined) entity.usageType = dto.usageType;
    if (dto.unitArea !== undefined) entity.unitArea = this.numberToDecimal(dto.unitArea);
    if (dto.useArea !== undefined) entity.useArea = this.numberToDecimal(dto.useArea);
    if (dto.rentalStatus !== undefined && dto.rentalStatus !== entity.rentalStatus) {
      throw new BadRequestException("Use change-status endpoint to update rental status");
    }
    if (dto.fittingStatus !== undefined) entity.fittingStatus = dto.fittingStatus;
    if (dto.refPrice !== undefined) entity.refPrice = this.numberToDecimal(dto.refPrice);
    if (dto.photoUrls !== undefined) entity.photoUrls = dto.photoUrls.length ? dto.photoUrls : null;
    if (dto.floorplanUrl !== undefined) entity.floorplanUrl = this.emptyToNull(dto.floorplanUrl);
    if (dto.availableDate !== undefined) entity.availableDate = dto.availableDate;
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actor.sub;

    return this.unitsRepository.save(entity);
  }

  async uploadPhoto(scope: TenantParkScope, actor: JwtPrincipal, id: string, file: UploadedFilePayload | undefined, remark?: string): Promise<FileEntity> {
    const entity = await this.findDetail(scope, id, actor);
    const uploaded = await this.filesService.upload(scope, actor.sub, { biz_type: "unit_photo", biz_id: id, remark }, file);
    entity.photoFileIds = [...(entity.photoFileIds ?? []), uploaded.id];
    entity.photoUrls = [...(entity.photoUrls ?? []), uploaded.fileUrl];
    entity.updateBy = actor.sub;
    await this.unitsRepository.save(entity);
    return uploaded;
  }

  async uploadFloorplan(scope: TenantParkScope, actor: JwtPrincipal, id: string, file: UploadedFilePayload | undefined, remark?: string): Promise<FileEntity> {
    const entity = await this.findDetail(scope, id, actor);
    const uploaded = await this.filesService.upload(scope, actor.sub, { biz_type: "unit_floorplan", biz_id: id, remark }, file);
    entity.floorplanFileId = uploaded.id;
    entity.floorplanUrl = uploaded.fileUrl;
    entity.updateBy = actor.sub;
    await this.unitsRepository.save(entity);
    return uploaded;
  }

  async changeStatus(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: TransitionUnitStatusDto
  ): Promise<{ id: string; unit_code: string; before_status: number; after_status: number; status_update_time: string }> {
    const entity = await this.findDetail(scope, id, actor);
    const beforeStatus = entity.rentalStatus;
    const afterStatus = dto.after_status;
    const reason = dto.reason.trim();

    if (!reason) {
      throw new BadRequestException("reason is required");
    }
    if (beforeStatus === afterStatus) {
      throw new BadRequestException("Rental status is unchanged");
    }

    this.assertRentalStatusTransition(beforeStatus, afterStatus, actor);

    const now = new Date();
    await this.unitsRepository.manager.transaction(async (manager) => {
      entity.rentalStatus = afterStatus;
      entity.lockReason = afterStatus === 20 ? this.emptyToNull(dto.lock_reason) : null;
      entity.lockExpireTime = afterStatus === 20 && dto.lock_expire_time ? new Date(dto.lock_expire_time) : null;
      entity.statusUpdateTime = now;
      entity.statusUpdateBy = actor.sub;
      entity.updateBy = actor.sub;
      await manager.save(UnitEntity, entity);
      await manager.save(
        UnitStatusLogEntity,
        manager.create(UnitStatusLogEntity, {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          unitId: entity.id,
          beforeStatus,
          afterStatus,
          reason,
          sourceType: "manual",
          operatorId: actor.sub,
          operatorName: actor.realName ?? actor.username,
          opTime: now,
          createBy: actor.sub,
          updateBy: actor.sub,
          remark: "房源出租状态流转"
        })
      );
    });

    return {
      id: entity.id,
      unit_code: entity.unitCode,
      before_status: beforeStatus,
      after_status: afterStatus,
      status_update_time: now.toISOString()
    };
  }

  async listStatusLogs(scope: TenantParkScope, actor: JwtPrincipal, unitId: string, query: UnitStatusLogQueryDto): Promise<PaginatedResult<UnitStatusLogEntity>> {
    await this.findDetail(scope, unitId, actor);
    const [items, total] = await this.statusLogRepository
      .createQueryBuilder("log")
      .where("log.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("log.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("log.unit_id = :unitId", { unitId })
      .andWhere("log.is_deleted = false")
      .orderBy("log.op_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items, total, page: query.page, page_size: query.page_size };
  }

  getImportTemplate(): Buffer {
    const worksheet = XLSX.utils.aoa_to_sheet([
      [...UNIT_IMPORT_HEADERS],
      ["", "UNIT_CODE", "BUILDING_CODE", "FLOOR_CODE", "示例房源", "10", "120.00", "100.00", "10", "20", "6000.00", "2026-06-01", "示例"]
    ]);
    worksheet["!cols"] = UNIT_IMPORT_HEADERS.map((header) => ({ wch: Math.max(14, header.length + 4) }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "房源导入");
    return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  }

  async importExcel(
    scope: TenantParkScope,
    actorId: string,
    file: UploadedFilePayload | undefined
  ): Promise<UnitImportResult> {
    if (!file) {
      throw new BadRequestException("file is required");
    }
    if (!this.isSupportedImportFile(file)) {
      throw new BadRequestException("Only Excel import is supported");
    }

    const records = this.readImportWorkbook(file.buffer);
    const context = await this.loadImportContext(scope, records.map(({ record }) => this.resolveImportProvidedCode(record)));
    const seenUnitCodes = new Set<string>();
    const result: UnitImportResult = { total: records.length, success_count: 0, fail_count: 0, rows: [] };

    for (const { rowNo, record } of records) {
      const validation = this.validateImportRow(record, rowNo, context, seenUnitCodes);
      if (validation.errors.length > 0) {
        result.fail_count += 1;
        result.rows.push({ row_no: rowNo, success: false, unit_code: validation.unitCode, id: null, errors: validation.errors });
        continue;
      }
      if (!validation.data) {
        result.fail_count += 1;
        result.rows.push({ row_no: rowNo, success: false, unit_code: validation.unitCode, id: null, errors: ["导入行解析失败"] });
        continue;
      }

      const resolvedCode = await this.resolveImportUnitCode(scope, actorId, validation.data, seenUnitCodes);
      if (resolvedCode.errors.length > 0) {
        result.fail_count += 1;
        result.rows.push({ row_no: rowNo, success: false, unit_code: resolvedCode.unitCode, id: null, errors: resolvedCode.errors });
        continue;
      }

      const entity = this.unitsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        unitCode: resolvedCode.unitCode,
        code: resolvedCode.unitCode,
        buildingId: validation.data.buildingId,
        floorId: validation.data.floorId,
        unitName: validation.data.unitName,
        usageType: validation.data.usageType,
        unitArea: this.numberToDecimal(validation.data.unitArea),
        useArea: this.numberToDecimal(validation.data.useArea),
        rentalStatus: validation.data.rentalStatus,
        fittingStatus: validation.data.fittingStatus,
        refPrice: this.numberToDecimal(validation.data.refPrice),
        availableDate: validation.data.availableDate ?? null,
        status: 1,
        remark: this.emptyToNull(validation.data.remark),
        createBy: actorId,
        updateBy: actorId
      });
      try {
        const saved = await this.unitsRepository.save(entity);
        result.success_count += 1;
        result.rows.push({ row_no: rowNo, success: true, unit_code: saved.unitCode, id: saved.id, errors: [] });
      } catch (error) {
        result.fail_count += 1;
        result.rows.push({
          row_no: rowNo,
          success: false,
          unit_code: resolvedCode.unitCode,
          id: null,
          errors: [this.importErrorMessage(error, "房源保存失败")]
        });
      }
    }

    return result;
  }

  private readImportWorkbook(buffer: Buffer): Array<{ rowNo: number; record: ImportSourceRow }> {
    const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException("Excel sheet is required");
    }
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new BadRequestException("Excel sheet is required");
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: true, defval: "" });
    if (rows.length < 2) {
      throw new BadRequestException("Excel has no data rows");
    }

    const headers = rows[0]?.map((cell) => this.cellToString(cell)) ?? [];
    for (const header of UNIT_IMPORT_REQUIRED_HEADERS) {
      if (!headers?.includes(header)) {
        throw new BadRequestException(`Excel header is missing: ${header}`);
      }
    }

    const headerIndexes = new Map(headers.map((header, index) => [header, index]));
    return rows
      .slice(1)
      .map((row, index) => {
        const record = Object.fromEntries(
          UNIT_IMPORT_HEADERS.map((header) => [header, row[headerIndexes.get(header) ?? -1] ?? ""])
        ) as ImportSourceRow;
        return { rowNo: index + 2, record };
      })
      .filter(({ record }) => UNIT_IMPORT_HEADERS.some((header) => this.cellToString(record[header])));
  }

  async exportCsv(scope: TenantParkScope, query: UnitQueryDto, actor?: JwtPrincipal): Promise<string> {
    const items = await this.findForExport(scope, query, 5000, actor);
    return this.toCsv([
      [
        "房源编码",
        "统一编码",
        "房源名称",
        "楼栋编码",
        "楼栋名称",
        "楼层编码",
        "楼层名称",
        "用途",
        "建筑面积",
        "使用面积",
        "出租状态",
        "装修状态",
        "参考租金",
        "可租日期",
        "状态",
        "更新时间"
      ],
      ...items.map((item) => [
        item.unitCode,
        item.code ?? item.unitCode,
        item.unitName,
        item.building?.buildingCode ?? "",
        item.building?.buildingName ?? "",
        item.floor?.floorCode ?? "",
        item.floor?.floorName ?? "",
        String(item.usageType),
        item.unitArea,
        item.useArea,
        String(item.rentalStatus),
        String(item.fittingStatus),
        item.refPrice,
        item.availableDate ?? "",
        String(item.status),
        item.updateTime.toISOString()
      ])
    ]);
  }

  async exportExcel(scope: TenantParkScope, query: UnitExportDto, actor?: JwtPrincipal): Promise<Buffer> {
    const total = await this.countForExport(scope, query, actor);
    if (total > UNIT_EXPORT_LIMIT) {
      throw new BadRequestException("导出数据超过 50000 行，请缩小筛选范围");
    }

    const [items, labels] = await Promise.all([
      this.findForExport(scope, query, UNIT_EXPORT_LIMIT, actor),
      this.loadUnitDictLabelMaps(scope)
    ]);
    const worksheet = XLSX.utils.aoa_to_sheet([
      [
        "房源编码",
        "统一编码",
        "房源名称",
        "楼栋编码",
        "楼栋名称",
        "楼层编码",
        "楼层名称",
        "用途",
        "建筑面积",
        "使用面积",
        "出租状态",
        "装修状态",
        "参考租金",
        "可租日期",
        "备注",
        "创建时间",
        "更新时间"
      ],
      ...items.map((item) => [
        item.unitCode,
        item.code ?? item.unitCode,
        item.unitName,
        item.building?.buildingCode ?? "",
        item.building?.buildingName ?? "",
        item.floor?.floorCode ?? "",
        item.floor?.floorName ?? "",
        labels.usageTypes.get(item.usageType) ?? String(item.usageType),
        item.unitArea,
        item.useArea,
        labels.rentalStatuses.get(item.rentalStatus) ?? String(item.rentalStatus),
        labels.fittingStatuses.get(item.fittingStatus) ?? String(item.fittingStatus),
        item.refPrice,
        item.availableDate ?? "",
        item.remark ?? "",
        item.createTime.toISOString(),
        item.updateTime.toISOString()
      ])
    ]);
    worksheet["!cols"] = [
      18, 18, 18, 14, 18, 16, 18, 12, 12, 12, 12, 12, 12, 14, 24, 22, 22
    ].map((wch) => ({ wch }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "房源台账");
    return XLSX.write(workbook, { bookType: "xlsx", type: "buffer" }) as Buffer;
  }

  async recordExport(
    scope: TenantParkScope,
    user: { id: string; username: string; realName?: string; roles: string[] },
    options: { method?: string; path?: string } = {}
  ): Promise<void> {
    await this.auditService.recordOperation({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      userId: user.id,
      username: user.username,
      realName: user.realName ?? null,
      roleCodes: user.roles,
      module: "房源管理",
      resource: "biz.unit",
      action: "数据导出",
      bizType: "biz_unit",
      method: options.method ?? "GET",
      path: options.path ?? "/api/v1/park-units/export",
      success: true,
      requestId: null
    });
  }

  async statistics(scope: TenantParkScope, actor?: JwtPrincipal): Promise<{
    totalUnits: number;
    totalArea: number;
    useArea: number;
    vacantUnits: number;
    rentedUnits: number;
    occupancyRate: number;
    byRentalStatus: Array<{ rentalStatus: number; count: number; area: number }>;
    byUsageType: Array<{ usageType: number; count: number; area: number }>;
    byBuilding: Array<{ buildingId: string; buildingCode: string; buildingName: string; count: number; area: number }>;
  }> {
    const base = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    const totalRow = await base
      .select("count(*)::int", "totalUnits")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "totalArea")
      .addSelect("coalesce(sum(unit.use_area), 0)::float", "useArea")
      .addSelect("count(*) filter (where unit.rental_status = 10)::int", "vacantUnits")
      .addSelect("count(*) filter (where unit.rental_status = 30)::int", "rentedUnits")
      .getRawOne<{ totalUnits: number; totalArea: number; useArea: number; vacantUnits: number; rentedUnits: number }>();
    const byRentalStatus = await this.groupStats(scope, "unit.rental_status", "rentalStatus", actor);
    const byUsageType = await this.groupStats(scope, "unit.usage_type", "usageType", actor);
    const byBuildingBuilder = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    const byBuilding = await byBuildingBuilder
      .innerJoin("unit.building", "building")
      .select("unit.building_id", "buildingId")
      .addSelect("building.building_code", "buildingCode")
      .addSelect("building.building_name", "buildingName")
      .addSelect("count(*)::int", "count")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
      .groupBy("unit.building_id")
      .addGroupBy("building.building_code")
      .addGroupBy("building.building_name")
      .orderBy("building.buildingCode", "ASC")
      .getRawMany<{ buildingId: string; buildingCode: string; buildingName: string; count: number; area: number }>();
    const totalUnits = Number(totalRow?.totalUnits ?? 0);
    const rentedUnits = Number(totalRow?.rentedUnits ?? 0);
    return {
      totalUnits,
      totalArea: Number(totalRow?.totalArea ?? 0),
      useArea: Number(totalRow?.useArea ?? 0),
      vacantUnits: Number(totalRow?.vacantUnits ?? 0),
      rentedUnits,
      occupancyRate: totalUnits === 0 ? 0 : Number(((rentedUnits / totalUnits) * 100).toFixed(2)),
      byRentalStatus,
      byUsageType,
      byBuilding
    };
  }

  async assetStatistics(scope: TenantParkScope, query: AssetStatisticsQueryDto, actor?: JwtPrincipal): Promise<{
    summary: {
      total_units: number;
      total_area: number;
      rentable_units: number;
      rentable_area: number;
      locked_units: number;
      locked_area: number;
      rented_units: number;
      rented_area: number;
      expiring_units: number;
      expiring_area: number;
      maintenance_units: number;
      maintenance_area: number;
      self_use_units: number;
      self_use_area: number;
      occupancy_rate: number;
      vacancy_rate: number;
      avg_ref_price: number;
    };
    by_building: Array<{
      building_id: string;
      building_code: string;
      building_name: string;
      total_area: number;
      rented_area: number;
      rentable_area: number;
      occupancy_rate: number;
      vacancy_rate: number;
    }>;
    by_status: Array<{ rental_status: number; status_name: string; unit_count: number; area: number }>;
    by_usage_type: Array<{ usage_type: number; usage_name: string; unit_count: number; area: number }>;
  }> {
    const [summaryBuilder, byBuildingBuilder, byStatusBuilder, byUsageBuilder] = await Promise.all([
      this.assetStatisticsBaseBuilder(scope, query, actor),
      this.assetStatisticsBaseBuilder(scope, query, actor),
      this.assetStatisticsBaseBuilder(scope, query, actor),
      this.assetStatisticsBaseBuilder(scope, query, actor)
    ]);
    const [summaryRow, byBuildingRows, byStatusRows, byUsageRows, labels] = await Promise.all([
      summaryBuilder
        .select("count(*)::int", "total_units")
        .addSelect("coalesce(sum(unit.unit_area), 0)::float", "total_area")
        .addSelect("count(*) filter (where unit.rental_status = 10)::int", "rentable_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 10), 0)::float", "rentable_area")
        .addSelect("count(*) filter (where unit.rental_status = 20)::int", "locked_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 20), 0)::float", "locked_area")
        .addSelect("count(*) filter (where unit.rental_status = 30)::int", "rented_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 30), 0)::float", "rented_area")
        .addSelect("count(*) filter (where unit.rental_status = 40)::int", "expiring_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 40), 0)::float", "expiring_area")
        .addSelect("count(*) filter (where unit.rental_status = 50)::int", "maintenance_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 50), 0)::float", "maintenance_area")
        .addSelect("count(*) filter (where unit.rental_status = 60)::int", "self_use_units")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 60), 0)::float", "self_use_area")
        .addSelect("coalesce(avg(unit.ref_price), 0)::float", "avg_ref_price")
        .getRawOne<Record<string, string | number>>(),
      byBuildingBuilder
        .innerJoin("unit.building", "building")
        .select("unit.building_id", "building_id")
        .addSelect("building.building_code", "building_code")
        .addSelect("building.building_name", "building_name")
        .addSelect("coalesce(sum(unit.unit_area), 0)::float", "total_area")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 30), 0)::float", "rented_area")
        .addSelect("coalesce(sum(unit.unit_area) filter (where unit.rental_status = 10), 0)::float", "rentable_area")
        .groupBy("unit.building_id")
        .addGroupBy("building.building_code")
        .addGroupBy("building.building_name")
        .orderBy("building.buildingCode", "ASC")
        .getRawMany<Record<string, string | number>>(),
      byStatusBuilder
        .select("unit.rental_status", "rental_status")
        .addSelect("count(*)::int", "unit_count")
        .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
        .groupBy("unit.rental_status")
        .orderBy("unit.rentalStatus", "ASC")
        .getRawMany<Record<string, string | number>>(),
      byUsageBuilder
        .select("unit.usage_type", "usage_type")
        .addSelect("count(*)::int", "unit_count")
        .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
        .groupBy("unit.usage_type")
        .orderBy("unit.usageType", "ASC")
        .getRawMany<Record<string, string | number>>(),
      this.loadUnitDictLabelMaps(scope)
    ]);

    const totalArea = this.rawNumber(summaryRow?.total_area);
    const rentedArea = this.rawNumber(summaryRow?.rented_area);
    const rentableArea = this.rawNumber(summaryRow?.rentable_area);
    const summary = {
      total_units: this.rawNumber(summaryRow?.total_units),
      total_area: totalArea,
      rentable_units: this.rawNumber(summaryRow?.rentable_units),
      rentable_area: rentableArea,
      locked_units: this.rawNumber(summaryRow?.locked_units),
      locked_area: this.rawNumber(summaryRow?.locked_area),
      rented_units: this.rawNumber(summaryRow?.rented_units),
      rented_area: rentedArea,
      expiring_units: this.rawNumber(summaryRow?.expiring_units),
      expiring_area: this.rawNumber(summaryRow?.expiring_area),
      maintenance_units: this.rawNumber(summaryRow?.maintenance_units),
      maintenance_area: this.rawNumber(summaryRow?.maintenance_area),
      self_use_units: this.rawNumber(summaryRow?.self_use_units),
      self_use_area: this.rawNumber(summaryRow?.self_use_area),
      occupancy_rate: this.rate(rentedArea, totalArea),
      vacancy_rate: this.rate(rentableArea, totalArea),
      avg_ref_price: this.round2(this.rawNumber(summaryRow?.avg_ref_price))
    };

    return {
      summary,
      by_building: byBuildingRows.map((row) => {
        const rowTotalArea = this.rawNumber(row.total_area);
        const rowRentedArea = this.rawNumber(row.rented_area);
        const rowRentableArea = this.rawNumber(row.rentable_area);
        return {
          building_id: String(row.building_id),
          building_code: String(row.building_code),
          building_name: String(row.building_name),
          total_area: rowTotalArea,
          rented_area: rowRentedArea,
          rentable_area: rowRentableArea,
          occupancy_rate: this.rate(rowRentedArea, rowTotalArea),
          vacancy_rate: this.rate(rowRentableArea, rowTotalArea)
        };
      }),
      by_status: byStatusRows.map((row) => {
        const rentalStatus = this.rawNumber(row.rental_status);
        return {
          rental_status: rentalStatus,
          status_name: labels.rentalStatuses.get(rentalStatus) ?? String(rentalStatus),
          unit_count: this.rawNumber(row.unit_count),
          area: this.rawNumber(row.area)
        };
      }),
      by_usage_type: byUsageRows.map((row) => {
        const usageType = this.rawNumber(row.usage_type);
        return {
          usage_type: usageType,
          usage_name: labels.usageTypes.get(usageType) ?? String(usageType),
          unit_count: this.rawNumber(row.unit_count),
          area: this.rawNumber(row.area)
        };
      })
    };
  }

  async unitStatusBoard(scope: TenantParkScope, query: UnitStatusBoardQueryDto, actor?: JwtPrincipal): Promise<{ buildings: UnitStatusBoardBuilding[] }> {
    const builder = await this.unitStatusBoardBuilder(scope, query, actor);
    const [units, labels] = await Promise.all([
      builder.getMany(),
      this.loadUnitDictLabelMaps(scope)
    ]);
    const buildings = new Map<string, UnitStatusBoardBuilding>();

    for (const unit of units) {
      const building = unit.building;
      const floor = unit.floor;
      if (!building || !floor) {
        continue;
      }

      let buildingNode = buildings.get(building.id);
      if (!buildingNode) {
        buildingNode = {
          building_id: building.id,
          building_code: building.buildingCode,
          building_name: building.buildingName,
          floors: []
        };
        buildings.set(building.id, buildingNode);
      }

      let floorNode = buildingNode.floors.find((item) => item.floor_id === floor.id);
      if (!floorNode) {
        floorNode = {
          floor_id: floor.id,
          floor_code: floor.floorCode,
          floor_name: floor.floorName,
          units: []
        };
        buildingNode.floors.push(floorNode);
      }

      floorNode.units.push({
        unit_id: unit.id,
        unit_code: unit.unitCode,
        unit_name: unit.unitName,
        unit_area: this.rawNumber(unit.unitArea),
        rental_status: unit.rentalStatus,
        rental_status_name: labels.rentalStatuses.get(unit.rentalStatus) ?? String(unit.rentalStatus),
        usage_type: unit.usageType,
        usage_type_name: labels.usageTypes.get(unit.usageType) ?? String(unit.usageType),
        ref_price: this.rawNumber(unit.refPrice)
      });
    }

    return { buildings: [...buildings.values()] };
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const entity = await this.findDetail(scope, id, actor);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.unitsRepository.save(entity);
    return { id };
  }

  async checkUnitAvailableForContract(scope: TenantParkScope, id: string): Promise<boolean> {
    const unit = await this.detail(scope, id);
    return unit.status === 1 && unit.rentalStatus === 10;
  }

  private findWhere(scope: TenantParkScope, query: UnitQueryDto): FindOptionsWhere<UnitEntity> {
    return {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      ...(query.building_id ? { buildingId: query.building_id } : {}),
      ...(query.floor_id ? { floorId: query.floor_id } : {}),
      ...(query.usage_type !== undefined ? { usageType: query.usage_type } : {}),
      ...(query.rental_status !== undefined ? { rentalStatus: query.rental_status } : {}),
      ...(query.fitting_status !== undefined ? { fittingStatus: query.fitting_status } : {}),
      ...this.areaWhere(query)
    };
  }

  private applyQuery(builder: SelectQueryBuilder<UnitEntity>, query: UnitFilterQuery): void {
    if (query.building_id) builder.andWhere("unit.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("unit.floor_id = :floorId", { floorId: query.floor_id });
    if (query.usage_type !== undefined) builder.andWhere("unit.usage_type = :usageType", { usageType: query.usage_type });
    if (query.rental_status !== undefined) builder.andWhere("unit.rental_status = :rentalStatus", { rentalStatus: query.rental_status });
    if (query.fitting_status !== undefined) builder.andWhere("unit.fitting_status = :fittingStatus", { fittingStatus: query.fitting_status });
    if (query.min_area !== undefined) builder.andWhere("unit.unit_area >= :minArea", { minArea: query.min_area });
    if (query.max_area !== undefined) builder.andWhere("unit.unit_area <= :maxArea", { maxArea: query.max_area });
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("unit.unit_code ILIKE :keyword", { keyword }).orWhere("unit.unit_name ILIKE :keyword", { keyword });
          qb.orWhere("unit.code ILIKE :keyword", { keyword });
        })
      );
    }
  }

  private async countForExport(scope: TenantParkScope, query: UnitFilterQuery, actor?: JwtPrincipal): Promise<number> {
    const builder = this.scopedBuilder(scope);
    await this.applyUnitDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    return builder.getCount();
  }

  private async findForExport(scope: TenantParkScope, query: UnitFilterQuery, limit: number, actor?: JwtPrincipal): Promise<UnitEntity[]> {
    const builder = this.scopedBuilder(scope)
      .leftJoinAndSelect("unit.building", "building")
      .leftJoinAndSelect("unit.floor", "floor")
      .orderBy("unit.updateTime", "DESC")
      .addOrderBy("unit.createTime", "DESC")
      .take(limit);
    await this.applyUnitDataScope(builder, scope, actor);
    this.applyQuery(builder, query);
    const items = await builder.getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "asset", "unit", items);
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<UnitEntity> {
    return this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.is_deleted = false");
  }

  private async assetStatisticsBaseBuilder(scope: TenantParkScope, query: AssetStatisticsFilterQuery, actor?: JwtPrincipal): Promise<SelectQueryBuilder<UnitEntity>> {
    const builder = this.scopedBuilder(scope).andWhere("unit.status = 1");
    await this.applyUnitDataScope(builder, scope, actor);
    if (query.building_id) builder.andWhere("unit.building_id = :buildingId", { buildingId: query.building_id });
    if (query.floor_id) builder.andWhere("unit.floor_id = :floorId", { floorId: query.floor_id });
    if (query.usage_type !== undefined) builder.andWhere("unit.usage_type = :usageType", { usageType: query.usage_type });
    return builder;
  }

  private async unitStatusBoardBuilder(scope: TenantParkScope, query: UnitStatusBoardQueryDto, actor?: JwtPrincipal): Promise<SelectQueryBuilder<UnitEntity>> {
    const builder = this.scopedBuilder(scope)
      .leftJoinAndSelect("unit.building", "building")
      .leftJoinAndSelect("unit.floor", "floor")
      .andWhere("unit.status = 1")
      .orderBy("building.buildingCode", "ASC")
      .addOrderBy("floor.floorNo", "ASC")
      .addOrderBy("unit.unitCode", "ASC");
    await this.applyUnitDataScope(builder, scope, actor);
    if (query.building_id) builder.andWhere("unit.building_id = :buildingId", { buildingId: query.building_id });
    if (query.rental_status !== undefined) builder.andWhere("unit.rental_status = :rentalStatus", { rentalStatus: query.rental_status });
    return builder;
  }

  private async applyUnitDataScope(
    builder: SelectQueryBuilder<UnitEntity>,
    _scope: TenantParkScope,
    actor?: JwtPrincipal
  ): Promise<SelectQueryBuilder<UnitEntity>> {
    if (!actor || actor.isSuper || actor.permissions.includes("*")) {
      return builder;
    }
    const filters = await Promise.all([
      this.dataScopeService.buildScopeFilter(actor, "building"),
      this.dataScopeService.buildScopeFilter(actor, "floor"),
      this.dataScopeService.buildScopeFilter(actor, "unit")
    ]);
    const columns = {
      building: "building_id",
      floor: "floor_id",
      unit: "id"
    } as const;
    for (const filter of filters) {
      if (filter.unrestricted || filter.allowed_ids.length === 0) {
        continue;
      }
      const parameterName = `unitDataScope${filter.dimension.replace(/_/g, "")}Ids`;
      builder.andWhere(`unit.${columns[filter.dimension as keyof typeof columns]} IN (:...${parameterName})`, {
        [parameterName]: filter.allowed_ids
      });
    }
    return builder;
  }

  private async mustMatchBuildingAndFloor(
    scope: TenantParkScope,
    buildingId: string,
    floorId: string
  ): Promise<{ building: BuildingEntity; floor: FloorEntity }> {
    const [building, floor] = await Promise.all([
      this.buildingsRepository.findOne({
        where: { id: buildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      }),
      this.floorsRepository.findOne({
        where: { id: floorId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      })
    ]);
    if (!building) {
      throw new BadRequestException("Building not found");
    }
    if (!floor) {
      throw new BadRequestException("Floor not found");
    }
    if (floor.buildingId !== building.id) {
      throw new BadRequestException("Building and floor do not match");
    }
    return { building, floor };
  }

  private async mustFindBuildingByCode(scope: TenantParkScope, buildingCode: string): Promise<BuildingEntity> {
    const building = await this.buildingsRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, buildingCode, isDeleted: false }
    });
    if (!building) {
      throw new BadRequestException(`Building not found: ${buildingCode}`);
    }
    return building;
  }

  private async mustFindFloorByCode(scope: TenantParkScope, floorCode: string): Promise<FloorEntity> {
    const floor = await this.floorsRepository.findOne({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, floorCode, isDeleted: false }
    });
    if (!floor) {
      throw new BadRequestException(`Floor not found: ${floorCode}`);
    }
    return floor;
  }

  private async assertUnitCodeAvailable(scope: TenantParkScope, unitCode: string, excludeId?: string): Promise<void> {
    const builder = this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("(unit.unit_code = :unitCode OR unit.code = :unitCode)", { unitCode })
      .andWhere("unit.is_deleted = false");
    if (excludeId) {
      builder.andWhere("unit.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Unit code already exists");
    }
  }

  private async resolveUnitCode(scope: TenantParkScope, actorId: string, unitCode?: string): Promise<string> {
    const providedCode = unitCode?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateCode("unit", scope.tenantId, scope.parkId, actorId);
    return generated.code;
  }

  private async assertFiles(scope: TenantParkScope, fileIds?: string[]): Promise<void> {
    if (!fileIds?.length) {
      return;
    }
    const count = await this.filesRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.is_deleted = false")
      .andWhere("file.id IN (:...fileIds)", { fileIds })
      .getCount();
    if (count !== fileIds.length) {
      throw new BadRequestException("Unit photo file not found");
    }
  }

  private async assertFile(scope: TenantParkScope, fileId?: string): Promise<void> {
    if (!fileId) {
      return;
    }
    const exists = await this.filesRepository.exists({
      where: { id: fileId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!exists) {
      throw new BadRequestException("Unit floorplan file not found");
    }
  }

  private isSupportedImportFile(file: UploadedFilePayload): boolean {
    const name = file.originalname.toLowerCase();
    return (
      file.mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel" ||
      name.endsWith(".xlsx") ||
      name.endsWith(".xls")
    );
  }

  private resolveImportProvidedCode(record: ImportSourceRow): string {
    return this.cellToString(record.code) || this.cellToString(record.unit_code);
  }

  private async resolveImportUnitCode(
    scope: TenantParkScope,
    actorId: string,
    data: ValidatedImportRow,
    seenUnitCodes: Set<string>
  ): Promise<{ unitCode: string; errors: string[] }> {
    if (!data.needsGeneratedCode) {
      return { unitCode: data.unitCode, errors: [] };
    }

    try {
      const unitCode = await this.resolveUnitCode(scope, actorId);
      const errors: string[] = [];
      if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(unitCode)) {
        errors.push("生成的房源编码格式不正确");
      }
      if (seenUnitCodes.has(unitCode)) {
        errors.push("房源编码在本次导入中重复");
      }
      await this.assertUnitCodeAvailable(scope, unitCode);
      seenUnitCodes.add(unitCode);
      return { unitCode, errors };
    } catch (error) {
      return { unitCode: data.unitCode, errors: [this.importErrorMessage(error, "房源编码生成失败")] };
    }
  }

  private async loadImportContext(scope: TenantParkScope, unitCodes: string[]): Promise<UnitImportContext> {
    const distinctUnitCodes = [...new Set(unitCodes.filter(Boolean))];
    const [buildings, floors, dictTypes, existingUnits] = await Promise.all([
      this.buildingsRepository
        .createQueryBuilder("building")
        .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("building.is_deleted = false")
        .getMany(),
      this.floorsRepository
        .createQueryBuilder("floor")
        .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("floor.is_deleted = false")
        .getMany(),
      this.dictTypesRepository
        .createQueryBuilder("dictType")
        .where("dictType.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("dictType.park_id = :parkId", { parkId: scope.parkId })
        .andWhere("dictType.is_deleted = false")
        .andWhere("dictType.status = :status", { status: "enabled" })
        .andWhere("dictType.dict_code IN (:...dictCodes)", { dictCodes: ["unit_usage_type", "unit_rental_status", "unit_fitting_status"] })
        .getMany(),
      distinctUnitCodes.length === 0
        ? Promise.resolve([])
        : this.unitsRepository
            .createQueryBuilder("unit")
            .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
            .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
            .andWhere("unit.is_deleted = false")
            .andWhere("(unit.unit_code IN (:...unitCodes) OR unit.code IN (:...unitCodes))", { unitCodes: distinctUnitCodes })
            .getMany()
    ]);

    const dictTypeIds = dictTypes.map((type) => type.id);
    const dictItems = dictTypeIds.length === 0
      ? []
      : await this.dictItemsRepository
          .createQueryBuilder("dictItem")
          .where("dictItem.tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("dictItem.park_id = :parkId", { parkId: scope.parkId })
          .andWhere("dictItem.is_deleted = false")
          .andWhere("dictItem.status = :status", { status: "enabled" })
          .andWhere("dictItem.dict_type_id IN (:...dictTypeIds)", { dictTypeIds })
          .getMany();
    const typeById = new Map(dictTypes.map((type) => [type.id, type.dictCode]));

    return {
      buildingsByCode: new Map(buildings.map((building) => [building.buildingCode, building])),
      floorsByCode: new Map(floors.map((floor) => [floor.floorCode, floor])),
      existingUnitCodes: new Set(existingUnits.flatMap((unit) => [unit.unitCode, unit.code].filter((code): code is string => Boolean(code)))),
      usageTypes: this.dictValues(dictItems, typeById, "unit_usage_type"),
      rentalStatuses: this.dictValues(dictItems, typeById, "unit_rental_status"),
      fittingStatuses: this.dictValues(dictItems, typeById, "unit_fitting_status")
    };
  }

  private validateImportRow(
    record: ImportSourceRow,
    rowNo: number,
    context: UnitImportContext,
    seenUnitCodes: Set<string>
  ): UnitImportValidationResult {
    const errors: string[] = [];
    const standardCode = this.cellToString(record.code);
    const legacyUnitCode = this.cellToString(record.unit_code);
    const unitCode = this.resolveImportProvidedCode(record);
    const buildingCode = this.cellToString(record.building_code);
    const floorCode = this.cellToString(record.floor_code);
    const unitName = this.cellToString(record.unit_name);

    if (standardCode && legacyUnitCode && standardCode !== legacyUnitCode) {
      errors.push("code 与 unit_code 不一致");
    }
    if (unitCode) {
      if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(unitCode)) {
        errors.push("房源编码格式不正确");
      }
      if (context.existingUnitCodes.has(unitCode)) {
        errors.push("房源编码已存在");
      }
      if (seenUnitCodes.has(unitCode)) {
        errors.push("房源编码在本次导入中重复");
      }
      seenUnitCodes.add(unitCode);
    }

    const building = buildingCode ? context.buildingsByCode.get(buildingCode) : undefined;
    const floor = floorCode ? context.floorsByCode.get(floorCode) : undefined;
    if (!buildingCode) errors.push("楼栋编码不能为空");
    if (buildingCode && !building) errors.push("楼栋编码不存在");
    if (!floorCode) errors.push("楼层编码不能为空");
    if (floorCode && !floor) errors.push("楼层编码不存在");
    if (building && floor && floor.buildingId !== building.id) {
      errors.push("楼层编码不属于楼栋编码");
    }
    if (!unitName) {
      errors.push("房源名称不能为空");
    }

    const unitArea = this.positiveImportNumber(record.unit_area, "建筑面积", true, errors);
    const useArea = this.positiveImportNumber(record.use_area, "使用面积", false, errors) ?? 0;
    if (unitArea !== undefined && useArea > unitArea) {
      errors.push("使用面积不能大于建筑面积");
    }

    const usageType = this.dictImportNumber(record.usage_type, "用途编码", true, context.usageTypes, errors);
    const rentalStatus = this.dictImportNumber(record.rental_status, "出租状态编码", true, context.rentalStatuses, errors);
    const fittingStatus = this.dictImportNumber(record.fitting_status, "装修状态编码", false, context.fittingStatuses, errors) ?? 10;
    const refPrice = this.nonNegativeImportNumber(record.ref_price, "参考租金", false, errors) ?? 0;
    const availableDate = this.importDate(record.available_date, errors);
    const remark = this.cellToString(record.remark) || undefined;

    if (errors.length > 0 || !building || !floor || unitArea === undefined || usageType === undefined || rentalStatus === undefined) {
      return { unitCode, errors };
    }

    return {
      unitCode,
      errors,
      data: {
        unitCode,
        code: unitCode,
        needsGeneratedCode: !unitCode,
        buildingId: building.id,
        floorId: floor.id,
        unitName,
        usageType,
        unitArea,
        useArea,
        rentalStatus,
        fittingStatus,
        refPrice,
        availableDate,
        remark
      }
    };
  }

  private dictValues(items: DictItemEntity[], typeById: Map<string, string>, dictCode: string): Set<number> {
    return new Set(
      items
        .filter((item) => typeById.get(item.dictTypeId) === dictCode)
        .map((item) => Number(item.itemValue))
        .filter((value) => Number.isFinite(value))
    );
  }

  private async loadUnitDictLabelMaps(scope: TenantParkScope): Promise<{
    usageTypes: Map<number, string>;
    rentalStatuses: Map<number, string>;
    fittingStatuses: Map<number, string>;
  }> {
    const dictTypes = await this.dictTypesRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        status: "enabled",
        dictCode: In(["unit_usage_type", "unit_rental_status", "unit_fitting_status"])
      }
    });
    const dictTypeIds = dictTypes.map((type) => type.id);
    const items = dictTypeIds.length === 0
      ? []
      : await this.dictItemsRepository.find({
          where: {
            tenantId: scope.tenantId,
            parkId: scope.parkId,
            isDeleted: false,
            status: "enabled",
            dictTypeId: In(dictTypeIds)
          }
        });
    const typeById = new Map(dictTypes.map((type) => [type.id, type.dictCode]));
    return {
      usageTypes: this.dictLabelMap(items, typeById, "unit_usage_type"),
      rentalStatuses: this.dictLabelMap(items, typeById, "unit_rental_status"),
      fittingStatuses: this.dictLabelMap(items, typeById, "unit_fitting_status")
    };
  }

  private dictLabelMap(items: DictItemEntity[], typeById: Map<string, string>, dictCode: string): Map<number, string> {
    return new Map(
      items
        .filter((item) => typeById.get(item.dictTypeId) === dictCode)
        .map((item) => [Number(item.itemValue), item.itemLabel] as const)
        .filter(([value]) => Number.isFinite(value))
    );
  }

  private dictImportNumber(value: unknown, label: string, required: boolean, allowedValues: Set<number>, errors: string[]): number | undefined {
    const parsed = this.integerImportNumber(value, label, required, errors);
    if (parsed === undefined) {
      return undefined;
    }
    if (!allowedValues.has(parsed)) {
      errors.push(`${label}不存在`);
    }
    return parsed;
  }

  private integerImportNumber(value: unknown, label: string, required: boolean, errors: string[]): number | undefined {
    const text = this.cellToString(value);
    if (!text) {
      if (required) errors.push(`${label}不能为空`);
      return undefined;
    }
    const parsed = Number(text);
    if (!Number.isInteger(parsed)) {
      errors.push(`${label}必须为整数`);
      return undefined;
    }
    return parsed;
  }

  private positiveImportNumber(value: unknown, label: string, required: boolean, errors: string[]): number | undefined {
    const text = this.cellToString(value);
    if (!text) {
      if (required) errors.push(`${label}不能为空`);
      return undefined;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push(`${label}必须为正数`);
      return undefined;
    }
    return parsed;
  }

  private nonNegativeImportNumber(value: unknown, label: string, required: boolean, errors: string[]): number | undefined {
    const text = this.cellToString(value);
    if (!text) {
      if (required) errors.push(`${label}不能为空`);
      return undefined;
    }
    const parsed = Number(text);
    if (!Number.isFinite(parsed) || parsed < 0) {
      errors.push(`${label}必须为非负数`);
      return undefined;
    }
    return parsed;
  }

  private importErrorMessage(error: unknown, fallback: string): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  }

  private importDate(value: unknown, errors: string[]): string | undefined {
    if (value === undefined || value === null || this.cellToString(value) === "") {
      return undefined;
    }
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        errors.push("可租日期不合法");
        return undefined;
      }
      return this.dateToYmd(value);
    }
    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (!parsed) {
        errors.push("可租日期不合法");
        return undefined;
      }
      return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    }
    const text = this.cellToString(value);
    const parsed = new Date(text);
    if (Number.isNaN(parsed.getTime())) {
      errors.push("可租日期不合法");
      return undefined;
    }
    return this.dateToYmd(parsed);
  }

  private cellToString(value: unknown): string {
    if (value === undefined || value === null) return "";
    if (value instanceof Date) return this.dateToYmd(value);
    return String(value).trim();
  }

  private dateToYmd(value: Date): string {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
  }

  private rawNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private rate(numerator: number, denominator: number): number {
    return denominator === 0 ? 0 : this.round2(numerator / denominator);
  }

  private round2(value: number): number {
    return Number(value.toFixed(2));
  }

  private assertRentalStatusTransition(beforeStatus: number, afterStatus: number, actor: JwtPrincipal): void {
    const forceDirectLeaseRelease = beforeStatus === 30 && afterStatus === 10;
    if (forceDirectLeaseRelease) {
      if (!this.canForceChangeStatus(actor)) {
        throw new ForbiddenException("unit:force_change_status permission is required");
      }
      return;
    }

    const allowedTargets = ALLOWED_RENTAL_STATUS_TRANSITIONS.get(beforeStatus) ?? [];
    if (!allowedTargets.includes(afterStatus)) {
      throw new BadRequestException("Rental status transition is not allowed");
    }
  }

  private canForceChangeStatus(actor: JwtPrincipal): boolean {
    return (
      actor.isSuper ||
      actor.permissions.includes("*") ||
      actor.permissions.includes(SYSTEM_PERMISSIONS.UNIT_FORCE_CHANGE_STATUS)
    );
  }

  private areaWhere(query: UnitQueryDto): { unitArea?: FindOperator<string> } {
    if (query.min_area !== undefined && query.max_area !== undefined) {
      return { unitArea: Between(String(query.min_area), String(query.max_area)) };
    }
    if (query.min_area !== undefined) {
      return { unitArea: MoreThanOrEqual(String(query.min_area)) };
    }
    if (query.max_area !== undefined) {
      return { unitArea: LessThanOrEqual(String(query.max_area)) };
    }
    return {};
  }

  private resolveOrder(sort?: string): FindOptionsOrder<UnitEntity> {
    const raw = sort?.trim();
    if (!raw) {
      return { updateTime: "DESC", createTime: "DESC" };
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      return { updateTime: "DESC", createTime: "DESC" };
    }
    return { [field]: direction } as FindOptionsOrder<UnitEntity>;
  }

  private toCsv(rows: Array<Array<string | number>>): string {
    return rows
      .map((row) =>
        row
          .map((value) => {
            const text = String(value ?? "");
            return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
          })
          .join(",")
      )
      .join("\n");
  }

  private async groupStats(scope: TenantParkScope, column: string, alias: "rentalStatus" | "usageType", actor?: JwtPrincipal) {
    const builder = await this.applyUnitDataScope(this.scopedBuilder(scope), scope, actor);
    return builder
      .select(column, alias)
      .addSelect("count(*)::int", "count")
      .addSelect("coalesce(sum(unit.unit_area), 0)::float", "area")
      .groupBy(column)
      .orderBy(column, "ASC")
      .getRawMany<Record<typeof alias, number> & { count: number; area: number }>();
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string {
    return String(value ?? 0);
  }
}
