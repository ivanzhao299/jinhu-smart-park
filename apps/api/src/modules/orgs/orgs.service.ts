import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import type { CreateOrgDto } from "./dto/create-org.dto";
import type { UpdateOrgDto } from "./dto/update-org.dto";
import { OrgEntity } from "./entities/org.entity";

@Injectable()
export class OrgsService {
  constructor(
    @InjectRepository(OrgEntity)
    private readonly orgRepository: Repository<OrgEntity>,
    private readonly dataScopeService: DataScopeService
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<OrgEntity>> {
    const where = await this.dataScopeService.buildFindWhere<OrgEntity>(
      scope,
      actor,
      "org",
      {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword ? { orgName: ILike(`%${query.keyword}%`) } : {})
      },
      { org: "id" }
    );
    const [items, total] = await this.orgRepository.findAndCount({
      where,
      order: { sortOrder: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateOrgDto): Promise<OrgEntity> {
    await this.assertCodeAvailable(scope, dto.orgCode);
    const entity = this.orgRepository.create({
      ...dto,
      parentId: dto.parentId ?? null,
      leaderUserId: dto.leaderUserId ?? null,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? "enabled",
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      createBy: actorId,
      updateBy: actorId
    });
    return this.orgRepository.save(entity);
  }

  async detail(scope: TenantParkScope, id: string): Promise<OrgEntity> {
    const entity = await this.orgRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Org not found");
    }
    return entity;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateOrgDto): Promise<OrgEntity> {
    const entity = await this.detail(scope, id);
    if (dto.orgCode && dto.orgCode !== entity.orgCode) {
      await this.assertCodeAvailable(scope, dto.orgCode);
    }
    Object.assign(entity, dto, {
      parentId: dto.parentId ?? entity.parentId,
      leaderUserId: dto.leaderUserId ?? entity.leaderUserId,
      updateBy: actorId
    });
    return this.orgRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.orgRepository.save(entity);
    return { id };
  }

  private async assertCodeAvailable(scope: TenantParkScope, orgCode: string): Promise<void> {
    const exists = await this.orgRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, orgCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Org code already exists");
    }
  }
}
