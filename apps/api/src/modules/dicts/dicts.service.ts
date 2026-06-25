import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { CreateDictItemDto } from "./dto/create-dict-item.dto";
import type { CreateDictTypeDto } from "./dto/create-dict-type.dto";
import type { UpdateDictItemDto } from "./dto/update-dict-item.dto";
import type { UpdateDictTypeDto } from "./dto/update-dict-type.dto";
import { DictItemEntity } from "./entities/dict-item.entity";
import { DictTypeEntity } from "./entities/dict-type.entity";

@Injectable()
export class DictsService {
  constructor(
    @InjectRepository(DictTypeEntity)
    private readonly dictTypeRepository: Repository<DictTypeEntity>,
    @InjectRepository(DictItemEntity)
    private readonly dictItemRepository: Repository<DictItemEntity>
  ) {}

  async listTypes(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<DictTypeEntity>> {
    const [items, total] = await this.dictTypeRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword ? { dictName: ILike(`%${query.keyword}%`) } : {})
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async createType(scope: TenantParkScope, actorId: string, dto: CreateDictTypeDto): Promise<DictTypeEntity> {
    await this.assertTypeCodeAvailable(scope, dto.dictCode);
    return this.dictTypeRepository.save(
      this.dictTypeRepository.create({
        ...dto,
        status: dto.status ?? "enabled",
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async updateType(scope: TenantParkScope, actorId: string, id: string, dto: UpdateDictTypeDto): Promise<DictTypeEntity> {
    const entity = await this.getType(scope, id);
    if (dto.dictCode && dto.dictCode !== entity.dictCode) {
      await this.assertTypeCodeAvailable(scope, dto.dictCode);
    }
    Object.assign(entity, dto, { updateBy: actorId });
    return this.dictTypeRepository.save(entity);
  }

  detailType(scope: TenantParkScope, id: string): Promise<DictTypeEntity> {
    return this.getType(scope, id);
  }

  async deleteType(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.getType(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.dictTypeRepository.save(entity);
    return { id };
  }

  async listItems(
    scope: TenantParkScope,
    query: PaginationQueryDto,
    dictTypeId?: string,
    dictCode?: string
  ): Promise<PaginatedResult<DictItemEntity>> {
    const resolvedDictTypeId = dictTypeId ?? await this.resolveTypeIdByCode(scope, dictCode);
    if (dictCode && !resolvedDictTypeId) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }

    const [items, total] = await this.dictItemRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(resolvedDictTypeId ? { dictTypeId: resolvedDictTypeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword ? { itemLabel: ILike(`%${query.keyword}%`) } : {})
      },
      relations: { dictType: true },
      order: { sortOrder: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  private async resolveTypeIdByCode(scope: TenantParkScope, dictCode?: string): Promise<string | undefined> {
    if (!dictCode) return undefined;
    const entity = await this.dictTypeRepository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        dictCode,
        isDeleted: false
      },
      select: { id: true }
    });
    return entity?.id;
  }

  async createItem(scope: TenantParkScope, actorId: string, dto: CreateDictItemDto): Promise<DictItemEntity> {
    await this.getType(scope, dto.dictTypeId);
    return this.dictItemRepository.save(
      this.dictItemRepository.create({
        ...dto,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status ?? "enabled",
        tagType: dto.tagType ?? null,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async updateItem(scope: TenantParkScope, actorId: string, id: string, dto: UpdateDictItemDto): Promise<DictItemEntity> {
    const entity = await this.getItem(scope, id);
    if (dto.dictTypeId) {
      await this.getType(scope, dto.dictTypeId);
    }
    Object.assign(entity, dto, { tagType: dto.tagType ?? entity.tagType, updateBy: actorId });
    return this.dictItemRepository.save(entity);
  }

  detailItem(scope: TenantParkScope, id: string): Promise<DictItemEntity> {
    return this.getItem(scope, id);
  }

  async deleteItem(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.getItem(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.dictItemRepository.save(entity);
    return { id };
  }

  private async getType(scope: TenantParkScope, id: string): Promise<DictTypeEntity> {
    const entity = await this.dictTypeRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Dict type not found");
    }
    return entity;
  }

  private async getItem(scope: TenantParkScope, id: string): Promise<DictItemEntity> {
    const entity = await this.dictItemRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Dict item not found");
    }
    return entity;
  }

  private async assertTypeCodeAvailable(scope: TenantParkScope, dictCode: string): Promise<void> {
    const exists = await this.dictTypeRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, dictCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Dict type code already exists");
    }
  }
}
