import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import type { OrgPostOption, OrgTreeNode, PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import type { CreateOrgDto } from "./dto/create-org.dto";
import type { UpdateOrgDto } from "./dto/update-org.dto";
import { OrgEntity } from "./entities/org.entity";
import { PostEntity } from "./entities/post.entity";
import { UserOrgEntity } from "./entities/user-org.entity";
import { UserEntity } from "../users/entities/user.entity";

interface HierarchyRepositories {
  orgRepository: Repository<OrgEntity>;
  userOrgRepository: Repository<UserOrgEntity>;
  userRepository: Repository<UserEntity>;
}

@Injectable()
export class OrgsService {
  constructor(
    @InjectRepository(OrgEntity)
    private readonly orgRepository: Repository<OrgEntity>,
    @InjectRepository(PostEntity)
    private readonly postRepository: Repository<PostEntity>,
    @InjectRepository(UserOrgEntity)
    private readonly userOrgRepository: Repository<UserOrgEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
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

  async tree(scope: TenantParkScope, actor?: JwtPrincipal): Promise<OrgTreeNode[]> {
    const where = await this.dataScopeService.buildFindWhere<OrgEntity>(
      scope,
      actor,
      "org",
      { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      { org: "id" }
    );
    const items = await this.orgRepository.find({
      where,
      order: { sortOrder: "ASC", orgName: "ASC", id: "ASC" }
    });
    const nodes = new Map<string, OrgTreeNode>();
    for (const item of items) {
      nodes.set(item.id, { ...item, children: [] });
    }
    const roots: OrgTreeNode[] = [];
    for (const item of items) {
      const node = nodes.get(item.id);
      if (!node) continue;
      const parent = item.parentId ? nodes.get(item.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async listPosts(scope: TenantParkScope): Promise<OrgPostOption[]> {
    return this.postRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" },
      select: { id: true, postCode: true, postName: true, sortOrder: true, status: true },
      order: { sortOrder: "ASC", postName: "ASC" }
    });
  }

  async listLeaders(scope: TenantParkScope): Promise<Array<{ id: string; displayName: string; username: string }>> {
    return this.userRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, isEnabled: true },
      select: { id: true, displayName: true, username: true },
      order: { displayName: "ASC", username: "ASC" }
    });
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateOrgDto): Promise<OrgEntity> {
    return this.withHierarchyLock(scope, async ({ orgRepository, userRepository }) => {
      await this.assertCodeAvailable(scope, dto.orgCode, orgRepository);
      await this.assertParentAllowed(scope, dto.parentId ?? null, undefined, orgRepository);
      await this.assertLeaderAllowed(scope, dto.leaderUserId ?? null, userRepository);
      const entity = orgRepository.create({
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
      return orgRepository.save(entity);
    });
  }

  async detail(scope: TenantParkScope, id: string, repository = this.orgRepository): Promise<OrgEntity> {
    const entity = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Org not found");
    }
    return entity;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateOrgDto): Promise<OrgEntity> {
    return this.withHierarchyLock(scope, async ({ orgRepository, userRepository }) => {
      const entity = await this.detail(scope, id, orgRepository);
      if (dto.orgCode && dto.orgCode !== entity.orgCode) {
        await this.assertCodeAvailable(scope, dto.orgCode, orgRepository);
      }
      if (dto.parentId !== undefined) {
        await this.assertParentAllowed(scope, dto.parentId, id, orgRepository);
      }
      if (dto.leaderUserId !== undefined) {
        await this.assertLeaderAllowed(scope, dto.leaderUserId, userRepository);
      }
      if (dto.status === "disabled" && entity.status !== "disabled") {
        await this.assertNoActiveChildren(scope, id, "存在有效下级组织，不能停用", orgRepository);
      }
      Object.assign(entity, dto, {
        parentId: dto.parentId === undefined ? entity.parentId : dto.parentId,
        leaderUserId: dto.leaderUserId === undefined ? entity.leaderUserId : dto.leaderUserId,
        updateBy: actorId
      });
      return orgRepository.save(entity);
    });
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    return this.withHierarchyLock(scope, async ({ orgRepository, userOrgRepository }) => {
      const entity = await this.detail(scope, id, orgRepository);
      await this.assertNoActiveChildren(scope, id, "存在有效下级组织，不能删除", orgRepository);
      const activeUsers = await userOrgRepository.count({
        where: {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          orgId: id,
          isDeleted: false,
          user: { isDeleted: false }
        }
      });
      if (activeUsers > 0) {
        throw new BadRequestException("组织仍有关联用户，不能删除");
      }
      entity.isDeleted = true;
      entity.updateBy = actorId;
      await orgRepository.save(entity);
      return { id };
    });
  }

  private async assertNoActiveChildren(
    scope: TenantParkScope,
    id: string,
    message: string,
    repository = this.orgRepository
  ): Promise<void> {
    const count = await repository.count({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, parentId: id, isDeleted: false }
    });
    if (count > 0) throw new BadRequestException(message);
  }

  private async assertParentAllowed(
    scope: TenantParkScope,
    parentId: string | null,
    currentId?: string,
    repository = this.orgRepository
  ): Promise<void> {
    if (!parentId) return;
    if (currentId && parentId === currentId) {
      throw new BadRequestException("上级组织不能是当前组织自身");
    }
    let cursor: string | null = parentId;
    const visited = new Set<string>();
    while (cursor) {
      if (visited.has(cursor) || (currentId && cursor === currentId)) {
        throw new BadRequestException("上级组织关系不能形成循环");
      }
      visited.add(cursor);
      const parent: OrgEntity | null = await repository.findOne({
        where: { id: cursor, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!parent) throw new BadRequestException("上级组织不存在或不属于当前园区");
      if (parent.status !== "enabled") throw new BadRequestException("上级组织已停用");
      cursor = parent.parentId;
    }
  }

  private async assertLeaderAllowed(
    scope: TenantParkScope,
    leaderUserId: string | null,
    repository = this.userRepository
  ): Promise<void> {
    if (!leaderUserId) return;
    const exists = await repository.exists({
      where: { id: leaderUserId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, isEnabled: true }
    });
    if (!exists) throw new BadRequestException("负责人不存在、已停用或不属于当前园区");
  }

  private async assertCodeAvailable(
    scope: TenantParkScope,
    orgCode: string,
    repository = this.orgRepository
  ): Promise<void> {
    const exists = await repository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, orgCode, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Org code already exists");
    }
  }

  private withHierarchyLock<T>(
    scope: TenantParkScope,
    operation: (repositories: HierarchyRepositories) => Promise<T>
  ): Promise<T> {
    return this.orgRepository.manager.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
        `org-hierarchy:${scope.tenantId}:${scope.parkId}`
      ]);
      return operation({
        orgRepository: manager.getRepository(OrgEntity),
        userOrgRepository: manager.getRepository(UserOrgEntity),
        userRepository: manager.getRepository(UserEntity)
      });
    });
  }
}
