import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike, In } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleFieldPermissionEntity } from "../permissions/entities/role-field-permission.entity";
import type { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import type { AssignFieldPermissionsDto } from "./dto/assign-field-permissions.dto";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { CopyRoleDto } from "./dto/copy-role.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";

export type RoleTreeNode = Omit<RoleEntity, "children"> & { children: RoleTreeNode[] };

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity)
    private readonly permissionsRepository: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,
    @InjectRepository(RoleFieldPermissionEntity)
    private readonly roleFieldPermissionRepository: Repository<RoleFieldPermissionEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<RoleEntity>> {
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const baseWhere = {
      tenantId: scope.tenantId,
      isDeleted: false,
      ...statusWhere
    };
    const where = query.keyword
      ? [
          { ...baseWhere, code: ILike(`%${query.keyword}%`) },
          { ...baseWhere, name: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.rolesRepository.findAndCount({
      where,
      relations: { permissionLinks: { permission: true } },
      order: { level: "ASC", sortNo: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  listByScope(scope: TenantParkScope): Promise<RoleEntity[]> {
    return this.rolesRepository.find({
      where: {
        tenantId: scope.tenantId,
        isDeleted: false
      },
      relations: { permissionLinks: { permission: true } }
    });
  }

  async tree(scope: TenantParkScope): Promise<RoleTreeNode[]> {
    const roles = await this.rolesRepository.find({
      where: {
        tenantId: scope.tenantId,
        isDeleted: false
      },
      order: { level: "ASC", sortNo: "ASC", createTime: "ASC" }
    });
    return this.buildTree(roles);
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    await this.assertCodeAvailable(scope, dto.code);
    const parent = dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    return this.rolesRepository.save(
      this.rolesRepository.create({
        code: dto.code,
        name: dto.name,
        parentId: parent?.id ?? null,
        rolePath: parent ? `${parent.rolePath ?? parent.code}/${dto.code}` : dto.code,
        roleLevel: parent ? parent.roleLevel + 1 : 1,
        level: parent ? parent.level + 1 : 1,
        sortNo: dto.sortNo ?? 0,
        roleType: dto.roleType ?? "custom",
        roleScope: dto.roleScope ?? "tenant",
        dataScope: dto.dataScope ?? "50",
        dataScopeConfig: dto.dataScopeConfig ?? {},
        isTemplate: dto.isTemplate ?? false,
        isSystem: false,
        isBuiltin: false,
        isSuper: false,
        editable: true,
        isEditable: true,
        isDeletable: true,
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
      where: { id, tenantId: scope.tenantId, isDeleted: false },
      relations: { permissionLinks: { permission: true } }
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    if (dto.code && dto.code !== role.code) {
      await this.assertCodeAvailable(scope, dto.code);
    }
    const parent = dto.parentId === undefined ? undefined : dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    if (parent && parent.id === role.id) {
      throw new BadRequestException("Role cannot use itself as parent");
    }
    const nextCode = dto.code ?? role.code;
    const nextParentId = parent === undefined ? role.parentId : parent?.id ?? null;
    const nextParentPath = parent === undefined ? await this.resolveParentPath(scope, nextParentId) : parent ? parent.rolePath ?? parent.code : null;
    const nextParentLevel = parent === undefined ? await this.resolveParentLevel(scope, nextParentId) : parent ? parent.level : 0;
    Object.assign(role, {
      code: nextCode,
      name: dto.name ?? role.name,
      parentId: nextParentId,
      rolePath: nextParentPath ? `${nextParentPath}/${nextCode}` : nextCode,
      roleLevel: nextParentLevel + 1,
      level: nextParentLevel + 1,
      sortNo: dto.sortNo ?? role.sortNo,
      roleType: dto.roleType ?? role.roleType,
      roleScope: dto.roleScope ?? role.roleScope,
      dataScope: dto.dataScope ?? role.dataScope,
      dataScopeConfig: dto.dataScopeConfig ?? role.dataScopeConfig,
      isTemplate: dto.isTemplate ?? role.isTemplate,
      status: dto.status ?? role.status,
      isEnabled: dto.status ? dto.status === "enabled" : role.isEnabled,
      remark: dto.remark ?? role.remark,
      updateBy: actorId
    });
    return this.rolesRepository.save(role);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const role = await this.detail(scope, id);
    if (role.isBuiltin || role.isSystem || !role.isDeletable) {
      throw new ForbiddenException("Built-in role cannot be deleted");
    }
    const boundUsers = await this.userRoleRepository.count({
      where: { tenantId: scope.tenantId, roleId: id, isDeleted: false }
    });
    if (boundUsers > 0) {
      throw new BadRequestException("Role has bound users and cannot be deleted");
    }
    const childRoles = await this.rolesRepository.count({
      where: { tenantId: scope.tenantId, parentId: id, isDeleted: false }
    });
    if (childRoles > 0) {
      throw new BadRequestException("Role has child roles and cannot be deleted");
    }
    role.isDeleted = true;
    role.updateBy = actorId;
    await this.rolesRepository.save(role);
    return { id };
  }

  async enable(scope: TenantParkScope, actorId: string, id: string): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    role.status = "enabled";
    role.isEnabled = true;
    role.updateBy = actorId;
    return this.rolesRepository.save(role);
  }

  async disable(scope: TenantParkScope, actorId: string, id: string): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    role.status = "disabled";
    role.isEnabled = false;
    role.updateBy = actorId;
    return this.rolesRepository.save(role);
  }

  async copy(scope: TenantParkScope, actorId: string, id: string, dto: CopyRoleDto): Promise<RoleEntity> {
    const source = await this.detail(scope, id);
    await this.assertCodeAvailable(scope, dto.code);
    const parent = dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    const copied = await this.rolesRepository.save(
      this.rolesRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: dto.code,
        name: dto.name,
        parentId: parent?.id ?? null,
        rolePath: parent ? `${parent.rolePath ?? parent.code}/${dto.code}` : dto.code,
        roleLevel: parent ? parent.roleLevel + 1 : 1,
        level: parent ? parent.level + 1 : 1,
        sortNo: source.sortNo,
        roleType: "custom",
        roleScope: dto.roleScope ?? source.roleScope,
        dataScope: dto.dataScope ?? source.dataScope,
        dataScopeConfig: dto.dataScopeConfig ?? source.dataScopeConfig ?? {},
        isTemplate: false,
        isSystem: false,
        isBuiltin: false,
        isSuper: false,
        editable: true,
        isEditable: true,
        isDeletable: true,
        isEnabled: true,
        status: "enabled",
        remark: `Copied from role ${source.code}`,
        createBy: actorId,
        updateBy: actorId
      })
    );
    await this.copyPermissions(scope, actorId, source.id, copied.id);
    await this.copyFieldPermissions(scope, actorId, source.id, copied.id);
    return this.detail(scope, copied.id);
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

  async listFieldPermissions(scope: TenantParkScope, id: string): Promise<RoleFieldPermissionEntity[]> {
    await this.detail(scope, id);
    return this.roleFieldPermissionRepository.find({
      where: { roleId: id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      order: { resource: "ASC", fieldKey: "ASC" }
    });
  }

  async assignFieldPermissions(
    scope: TenantParkScope,
    actorId: string,
    id: string,
    dto: AssignFieldPermissionsDto
  ): Promise<{ id: string }> {
    await this.detail(scope, id);
    await this.roleFieldPermissionRepository.update(
      { roleId: id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    const links = dto.fields.map((field) =>
      this.roleFieldPermissionRepository.create({
        roleId: id,
        resource: field.resource,
        fieldKey: field.fieldKey,
        fieldName: field.fieldName,
        accessMode: field.accessMode,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
    await this.roleFieldPermissionRepository.save(links);
    return { id };
  }

  private async assertCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.rolesRepository.exists({
      where: { tenantId: scope.tenantId, code, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Role code already exists");
    }
  }

  private async mustFindParent(scope: TenantParkScope, id: string): Promise<RoleEntity> {
    const parent = await this.rolesRepository.findOne({
      where: { id, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!parent) {
      throw new NotFoundException("Parent role not found in current scope");
    }
    return parent;
  }

  private async resolveParentPath(scope: TenantParkScope, parentId: string | null): Promise<string | null> {
    if (!parentId) return null;
    const parent = await this.mustFindParent(scope, parentId);
    return parent.rolePath ?? parent.code;
  }

  private async resolveParentLevel(scope: TenantParkScope, parentId: string | null): Promise<number> {
    if (!parentId) return 0;
    const parent = await this.mustFindParent(scope, parentId);
    return parent.level;
  }

  private async copyPermissions(scope: TenantParkScope, actorId: string, sourceRoleId: string, targetRoleId: string): Promise<void> {
    const links = await this.rolePermissionRepository.find({
      where: { tenantId: scope.tenantId, roleId: sourceRoleId, isDeleted: false }
    });
    await this.rolePermissionRepository.save(
      links.map((link) =>
        this.rolePermissionRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roleId: targetRoleId,
          permissionId: link.permissionId,
          createBy: actorId,
          updateBy: actorId,
          remark: "Copied from role template"
        })
      )
    );
  }

  private async copyFieldPermissions(scope: TenantParkScope, actorId: string, sourceRoleId: string, targetRoleId: string): Promise<void> {
    const fields = await this.roleFieldPermissionRepository.find({
      where: { tenantId: scope.tenantId, roleId: sourceRoleId, isDeleted: false }
    });
    await this.roleFieldPermissionRepository.save(
      fields.map((field) =>
        this.roleFieldPermissionRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roleId: targetRoleId,
          resource: field.resource,
          fieldKey: field.fieldKey,
          fieldName: field.fieldName,
          accessMode: field.accessMode,
          createBy: actorId,
          updateBy: actorId,
          remark: "Copied from role template"
        })
      )
    );
  }

  private buildTree(roles: RoleEntity[]): RoleTreeNode[] {
    const nodes = new Map<string, RoleTreeNode>();
    for (const role of roles) {
      nodes.set(role.id, Object.assign(role, { children: [] as RoleTreeNode[] }));
    }
    const roots: RoleTreeNode[] = [];
    for (const role of roles) {
      const node = nodes.get(role.id);
      if (!node) continue;
      const parent = role.parentId ? nodes.get(role.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }
}
