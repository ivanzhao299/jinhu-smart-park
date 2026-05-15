import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import { Brackets, type SelectQueryBuilder, type Repository } from "typeorm";
import type { CreateParkDto } from "./dto/create-park.dto";
import type { ParkQueryDto } from "./dto/park-query.dto";
import type { UpdateParkDto } from "./dto/update-park.dto";
import { ParkEntity } from "./entities/park.entity";

const SORT_COLUMNS = new Set(["parkCode", "parkName", "status", "createTime", "updateTime"]);

@Injectable()
export class ParksService {
  constructor(
    @InjectRepository(ParkEntity)
    private readonly parksRepository: Repository<ParkEntity>
  ) {}

  async list(scope: TenantParkScope, query: ParkQueryDto): Promise<PaginatedResult<ParkEntity>> {
    const builder = this.scopedBuilder(scope);

    if (query.status !== undefined) {
      builder.andWhere("park.status = :status", { status: query.status });
    }

    if (query.keyword?.trim()) {
      const keyword = `%${query.keyword.trim()}%`;
      builder.andWhere(
        new Brackets((qb) => {
          qb.where("park.park_code ILIKE :keyword", { keyword }).orWhere("park.park_name ILIKE :keyword", { keyword });
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

  async detail(scope: TenantParkScope, id: string): Promise<ParkEntity> {
    const entity = await this.scopedBuilder(scope).andWhere("park.id = :id", { id }).getOne();
    if (!entity) {
      throw new NotFoundException("Park not found");
    }
    return entity;
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateParkDto): Promise<ParkEntity> {
    const parkCode = dto.parkCode.trim();
    await this.assertParkCodeAvailable(parkCode);
    const entity = this.parksRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      parkCode,
      parkName: dto.parkName.trim(),
      address: this.emptyToNull(dto.address),
      province: this.emptyToNull(dto.province),
      city: this.emptyToNull(dto.city),
      district: this.emptyToNull(dto.district),
      lng: this.numberToDecimal(dto.lng),
      lat: this.numberToDecimal(dto.lat),
      totalArea: this.numberToDecimal(dto.totalArea) ?? "0",
      landArea: this.numberToDecimal(dto.landArea) ?? "0",
      status: dto.status ?? 1,
      remark: this.emptyToNull(dto.remark),
      createBy: actorId,
      updateBy: actorId
    });
    return this.parksRepository.save(entity);
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateParkDto): Promise<ParkEntity> {
    const entity = await this.detail(scope, id);
    const nextCode = dto.parkCode?.trim();
    if (nextCode && nextCode !== entity.parkCode) {
      await this.assertParkCodeAvailable(nextCode, id);
      entity.parkCode = nextCode;
    }

    if (dto.parkName !== undefined) entity.parkName = dto.parkName.trim();
    if (dto.address !== undefined) entity.address = this.emptyToNull(dto.address);
    if (dto.province !== undefined) entity.province = this.emptyToNull(dto.province);
    if (dto.city !== undefined) entity.city = this.emptyToNull(dto.city);
    if (dto.district !== undefined) entity.district = this.emptyToNull(dto.district);
    if (dto.lng !== undefined) entity.lng = this.numberToDecimal(dto.lng);
    if (dto.lat !== undefined) entity.lat = this.numberToDecimal(dto.lat);
    if (dto.totalArea !== undefined) entity.totalArea = this.numberToDecimal(dto.totalArea) ?? "0";
    if (dto.landArea !== undefined) entity.landArea = this.numberToDecimal(dto.landArea) ?? "0";
    if (dto.status !== undefined) entity.status = dto.status;
    if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
    entity.updateBy = actorId;

    return this.parksRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.parksRepository.save(entity);
    return { id };
  }

  private scopedBuilder(scope: TenantParkScope): SelectQueryBuilder<ParkEntity> {
    return this.parksRepository
      .createQueryBuilder("park")
      .where("park.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("park.is_deleted = false");
  }

  private applySort(builder: SelectQueryBuilder<ParkEntity>, sort?: string): void {
    const raw = sort?.trim();
    if (!raw) {
      builder.orderBy("park.create_time", "DESC");
      return;
    }
    const [field, direction] = raw.startsWith("-") ? [raw.slice(1), "DESC" as const] : [raw, "ASC" as const];
    if (!SORT_COLUMNS.has(field)) {
      builder.orderBy("park.create_time", "DESC");
      return;
    }
    builder.orderBy(`park.${this.toSnakeCase(field)}`, direction);
  }

  private async assertParkCodeAvailable(parkCode: string, excludeId?: string): Promise<void> {
    const builder = this.parksRepository
      .createQueryBuilder("park")
      .where("park.park_code = :parkCode", { parkCode })
      .andWhere("park.is_deleted = false");
    if (excludeId) {
      builder.andWhere("park.id <> :excludeId", { excludeId });
    }
    const exists = await builder.getExists();
    if (exists) {
      throw new ConflictException("Park code already exists");
    }
  }

  private emptyToNull(value: string | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  private numberToDecimal(value: number | undefined): string | null {
    return value === undefined ? null : String(value);
  }

  private toSnakeCase(value: string): string {
    return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }
}
