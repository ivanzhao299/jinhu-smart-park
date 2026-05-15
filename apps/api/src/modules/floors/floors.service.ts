import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { BuildingEntity } from "../buildings/entities/building.entity";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { FileEntity } from "../files/entities/file.entity";
import { FilesService, type UploadedFilePayload } from "../files/files.service";
import { UnitEntity } from "../units/entities/unit.entity";
import type { CreateFloorDto } from "./dto/create-floor.dto";
import type { FloorQueryDto } from "./dto/floor-query.dto";
import type { UpdateFloorDto } from "./dto/update-floor.dto";
import { FloorEntity } from "./entities/floor.entity";

const SORT_COLUMNS = new Set(["floorCode", "floorNo", "floorName", "floorArea", "status", "sortNo", "createTime", "updateTime"]);

@Injectable()
export class FloorsService {
  constructor(
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    @InjectRepository(UnitEntity)
    private readonly unitsRepository: Repository<UnitEntity>,
    private readonly filesService: FilesService,
    private readonly codeRulesService: CodeRulesService
  ) {}

  async list(scope: TenantParkScope, query: FloorQueryDto): Promise<PaginatedResult<FloorEntity>> {
    const builder = this.scopedBuilder(scope).leftJoinAndSelect("floor.building", "building");

    if (query.building_id) {
      builder.andWhere("floor.building_id = :buildingId", { buildingId: query.building_id });
    }
    if (query.status !== undefined) {
      builder.andWhere("floor.status = :status", { status: query.status });
    }
    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("floor.floor_code ILIKE :keyword", { keyword }).orWhere("floor.floor_name ILIKE :keyword", { keyword });
        })
      );
    }

    this.applySort(builder, query.sort);

    const [items, total] = await builder
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();

    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, id: string): Promise<FloorEntity> {
    const entity = await this.scopedBuilder(scope)
      .leftJoinAndSelect("floor.building", "building")
      .leftJoinAndSelect("floor.layoutFile", "layoutFile")
      .andWhere("floor.id = :id", { id })
      .getOne();
    if (!entity) {
      throw new NotFoundException("Floor not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateFloorDto): Promise<FloorEntity> {
    const building = await this.mustFindBuilding(scope, dto.buildingId);
    const floorCode = await this.resolveFloorCode(scope, actorId, dto.floorCode);
    await this.assertFloorCodeAvailable(scope, floorCode);
    await this.assertLayoutFile(scope, dto.layoutFileId);

    const entity = this.floorsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      buildingId: building.id,
      floorCode,
      floorNo: dto.floorNo,
      floorName: dto.floorName.trim(),
      floorArea: this.numberToDecimal(dto.floorArea),
      layoutFileId: dto.layoutFileId ?? null,
      layoutUrl: this.emptyToNull(dto.layoutUrl),
      status: dto.status ?? 1,
      sortNo: dto.sortNo ?? dto.floorNo,
      remark: this.emptyToNull(dto.remark),
      createBy: actorId,
      updateBy: actorId
    });
    return this.floorsRepository.save(entity);
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateFloorDto): Promise<FloorEntity> {
    const entity = await this.detail(scope, id);
    if (dto.buildingId) {
      const building = await this.mustFindBuilding(scope, dto.buildingId);
      entity.buildingId = building.id;
    }

    const nextCode = dto.floorCode?.trim();
    if (nextCode && nextCode !== entity.floorCode) {
      await this.assertFloorCodeAvailable(scope, nextCode, id);
      entity.floorCode = nextCode;
    }
    if (dto.layoutFileId !== undefined) {
      await this.assertLayoutFile(scope, dto.layoutFileId);
      entity.layoutFileId = dto.layoutFileId;
    }
    if (dto.floorNo !== undefined) entity.floorNo = dto.floorNo;
    if (dto.floorName !== undefined) entity.floorName = dto.floorName.trim();
    if (dto.floorArea !== undefined) entity.floorArea = this.numberToDecimal(dto.floorArea);
    if (dto.layoutUrl !== undefined) entity.layoutUrl = this.emptyToNull(dto.layoutUrl);
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.sortNo !== undefined) entity.sortNo = dto.sortNo;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actorId;

    return this.floorsRepository.save(entity);
  }

  async uploadLayout(scope: TenantParkScope, actorId: string, id: string, file: UploadedFilePayload | undefined, remark?: string): Promise<FileEntity> {
    const entity = await this.detail(scope, id);
    const uploaded = await this.filesService.upload(scope, actorId, { biz_type: "floorplan", biz_id: id, remark }, file);
    entity.layoutFileId = uploaded.id;
    entity.layoutUrl = uploaded.fileUrl;
    entity.updateBy = actorId;
    await this.floorsRepository.save(entity);
    return uploaded;
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    if (await this.hasUndeletedUnits(scope, id)) {
      throw new BadRequestException("Floor has undeleted units and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.floorsRepository.save(entity);
    return { id };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<FloorEntity> {
    return this.floorsRepository
      .createQueryBuilder("floor")
      .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("floor.is_deleted = false");
  }

  private async mustFindBuilding(scope: TenantParkScope, buildingId: string): Promise<BuildingEntity> {
    const building = await this.buildingsRepository.findOne({
      where: { id: buildingId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!building) {
      throw new BadRequestException("Building not found");
    }
    return building;
  }

  private async assertLayoutFile(scope: TenantParkScope, layoutFileId?: string): Promise<void> {
    if (!layoutFileId) {
      return;
    }
    const exists = await this.filesRepository.exists({
      where: { id: layoutFileId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!exists) {
      throw new BadRequestException("Layout file not found");
    }
  }

  private async assertFloorCodeAvailable(scope: TenantParkScope, floorCode: string, excludeId?: string): Promise<void> {
    const builder = this.floorsRepository
      .createQueryBuilder("floor")
      .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("floor.floor_code = :floorCode", { floorCode })
      .andWhere("floor.is_deleted = false");
    if (excludeId) {
      builder.andWhere("floor.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Floor code already exists");
    }
  }

  private async resolveFloorCode(scope: TenantParkScope, actorId: string, floorCode?: string): Promise<string> {
    const providedCode = floorCode?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateCode("floor", scope.tenantId, scope.parkId, actorId);
    return generated.code;
  }

  private async hasUndeletedUnits(scope: TenantParkScope, floorId: string): Promise<boolean> {
    return this.unitsRepository
      .createQueryBuilder("unit")
      .where("unit.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("unit.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("unit.floor_id = :floorId", { floorId })
      .andWhere("unit.is_deleted = false")
      .getExists();
  }

  private applySort(builder: SelectQueryBuilder<FloorEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("floor.sortNo", "ASC").addOrderBy("floor.floorNo", "ASC").addOrderBy("floor.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("floor.sortNo", "ASC").addOrderBy("floor.floorNo", "ASC").addOrderBy("floor.createTime", "DESC");
      return;
    }
    builder.orderBy(`floor.${field}`, direction);
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string {
    return String(value ?? 0);
  }

}
