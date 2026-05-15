import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, type Repository, type SelectQueryBuilder } from "typeorm";
import { CodeRulesService } from "../code-rules/code-rules.service";
import { FloorEntity } from "../floors/entities/floor.entity";
import type { BuildingQueryDto } from "./dto/building-query.dto";
import type { CreateBuildingDto } from "./dto/create-building.dto";
import type { UpdateBuildingDto } from "./dto/update-building.dto";
import { BuildingEntity } from "./entities/building.entity";

const SORT_COLUMNS = new Set(["buildingCode", "buildingName", "floorCount", "buildArea", "status", "sortNo", "createTime", "updateTime"]);

@Injectable()
export class BuildingsService {
  constructor(
    @InjectRepository(BuildingEntity)
    private readonly buildingsRepository: Repository<BuildingEntity>,
    @InjectRepository(FloorEntity)
    private readonly floorsRepository: Repository<FloorEntity>,
    private readonly codeRulesService: CodeRulesService
  ) {}

  async list(scope: TenantParkScope, query: BuildingQueryDto): Promise<PaginatedResult<BuildingEntity>> {
    const builder = this.scopedBuilder(scope);

    if (query.status !== undefined) {
      builder.andWhere("building.status = :status", { status: query.status });
    }

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("building.building_code ILIKE :keyword", { keyword }).orWhere("building.building_name ILIKE :keyword", { keyword });
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

  async detail(scope: TenantParkScope, id: string): Promise<BuildingEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("building.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Building not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateBuildingDto): Promise<BuildingEntity> {
    const buildingCode = await this.resolveBuildingCode(scope, actorId, dto.buildingCode);
    await this.assertBuildingCodeAvailable(scope, buildingCode);
    const entity = this.buildingsRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      buildingCode,
      buildingName: dto.buildingName.trim(),
      floorCount: dto.floorCount ?? 0,
      buildArea: this.numberToDecimal(dto.buildArea),
      status: dto.status ?? 1,
      sortNo: dto.sortNo ?? 0,
      remark: this.emptyToNull(dto.remark),
      createBy: actorId,
      updateBy: actorId
    });
    return this.buildingsRepository.save(entity);
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateBuildingDto): Promise<BuildingEntity> {
    const entity = await this.detail(scope, id);
    const nextCode = dto.buildingCode?.trim();
    if (nextCode && nextCode !== entity.buildingCode) {
      await this.assertBuildingCodeAvailable(scope, nextCode, id);
      entity.buildingCode = nextCode;
    }

    if (dto.buildingName !== undefined) entity.buildingName = dto.buildingName.trim();
    if (dto.floorCount !== undefined) entity.floorCount = dto.floorCount;
    if (dto.buildArea !== undefined) entity.buildArea = this.numberToDecimal(dto.buildArea);
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.sortNo !== undefined) entity.sortNo = dto.sortNo;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actorId;

    return this.buildingsRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    if (await this.hasUndeletedFloors(scope, id)) {
      throw new BadRequestException("Building has undeleted floors and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.buildingsRepository.save(entity);
    return { id };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<BuildingEntity> {
    return this.buildingsRepository
      .createQueryBuilder("building")
      .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("building.is_deleted = false");
  }

  private applySort(builder: SelectQueryBuilder<BuildingEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("building.sortNo", "ASC").addOrderBy("building.createTime", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("building.sortNo", "ASC").addOrderBy("building.createTime", "DESC");
      return;
    }
    builder.orderBy(`building.${field}`, direction);
  }

  private async assertBuildingCodeAvailable(scope: TenantParkScope, buildingCode: string, excludeId?: string): Promise<void> {
    const builder = this.buildingsRepository
      .createQueryBuilder("building")
      .where("building.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("building.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("building.building_code = :buildingCode", { buildingCode })
      .andWhere("building.is_deleted = false");
    if (excludeId) {
      builder.andWhere("building.id <> :excludeId", { excludeId });
    }
    if (await builder.getExists()) {
      throw new ConflictException("Building code already exists");
    }
  }

  private async resolveBuildingCode(scope: TenantParkScope, actorId: string, buildingCode?: string): Promise<string> {
    const providedCode = buildingCode?.trim();
    if (providedCode) {
      return providedCode;
    }
    const generated = await this.codeRulesService.generateCode("building", scope.tenantId, scope.parkId, actorId);
    return generated.code;
  }

  private async hasUndeletedFloors(scope: TenantParkScope, buildingId: string): Promise<boolean> {
    return this.floorsRepository
      .createQueryBuilder("floor")
      .where("floor.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("floor.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("floor.building_id = :buildingId", { buildingId })
      .andWhere("floor.is_deleted = false")
      .getExists();
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string {
    return String(value ?? 0);
  }

}
