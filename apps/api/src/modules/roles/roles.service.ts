import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike, In } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import type { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";
import { RoleEntity } from "./entities/role.entity";

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionsRepository: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<RoleEntity>> {
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const [items, total] = await this.rolesRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...statusWhere,
        ...(query.keyword ? { name: ILike(`%${query.keyword}%`) } : {})
      },
      relations: { permissionLinks: { permission: true } },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  listByScope(scope: TenantParkScope): Promise<RoleEntity[]> {
    return this.rolesRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      relations: { permissionLinks: { permission: true } }
    });
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    await this.assertCodeAvailable(scope, dto.code);
    return this.rolesRepository.save(
      this.rolesRepository.create({
        code: dto.code,
        name: dto.name,
        isEnabled: dto.status !== "disabled",
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detail(scope: TenantParkScope, id: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      relations: { permissionLinks: { permission: true } }
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (dto.code && dto.code !== role.code) {
      await this.assertCodeAvailable(scope, dto.code);
    }
    Object.assign(role, {
      code: dto.code ?? role.code,
      name: dto.name ?? role.name,
      status: dto.status ?? role.status,
      isEnabled: dto.status ? dto.status === "enabled" : role.isEnabled,
      remark: dto.remark ?? role.remark,
      updateBy: actorId
    });
    return this.rolesRepository.save(role);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const role = await this.detail(scope, id);
    role.isDeleted = true;
    role.updateBy = actorId;
    await this.rolesRepository.save(role);
    return { id };
  }

  async assignPermissions(
    scope: TenantParkScope,
    actorId: string,
    id: string,
    dto: AssignPermissionsDto
  ): Promise<{ id: string }> {
    await this.detail(scope, id);
    const permissions = await this.permissionsRepository.find({
      where: {
        id: In(dto.permissionIds),
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (permissions.length !== dto.permissionIds.length) {
      throw new NotFoundException("Permission not found in current scope");
    }

    await this.rolePermissionRepository.update(
      { roleId: id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    const links = dto.permissionIds.map((permissionId) =>
      this.rolePermissionRepository.create({
        roleId: id,
        permissionId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
    await this.rolePermissionRepository.save(links);
    return { id };
  }

  private async assertCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.rolesRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, code, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Role code already exists");
    }
  }
}
