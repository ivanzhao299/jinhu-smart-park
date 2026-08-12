import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike, In } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleFieldPermissionEntity } from "../permissions/entities/role-field-permission.entity";
import { RoleDataScopeEntity } from "../data-scopes/entities/role-data-scope.entity";
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
    const scopeWhere = [
      { tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false, ...statusWhere },
      { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, ...statusWhere }
    ];
    const where = query.keyword
      ? scopeWhere.flatMap((baseWhere) => [
          { ...baseWhere, code: ILike(`%${query.keyword}%`) },
          { ...baseWhere, name: ILike(`%${query.keyword}%`) }
        ])
      : scopeWhere;
    const [items, total] = await this.rolesRepository.findAndCount({
      where,
      order: { level: "ASC", sortNo: "ASC", createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    await this.attachPermissionLinks(scope, items);
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async listByScope(scope: TenantParkScope): Promise<RoleEntity[]> {
    const roles = await this.rolesRepository.find({
      where: [
        { tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      ]
    });
    await this.attachPermissionLinks(scope, roles);
    return roles;
  }

  async tree(scope: TenantParkScope): Promise<RoleTreeNode[]> {
    const roles = await this.rolesRepository.find({
      where: [
        { tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      ],
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
      where: [
        { id, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      ]
    });
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    await this.attachPermissionLinks(scope, [role]);
    return role;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    if (
      (role.isBuiltin || role.isSystem) &&
      dto.roleScope !== undefined &&
      dto.roleScope !== role.roleScope
    ) {
      throw new ForbiddenException("Built-in role scope cannot be changed");
    }
    if (dto.roleScope !== undefined && dto.roleScope !== role.roleScope) {
      throw new ForbiddenException("Role scope cannot be changed directly");
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
    const copiedId = await this.rolesRepository.manager.transaction(async (manager) => {
      const roleRepository = manager.getRepository(RoleEntity);
      const source = await roleRepository.findOne({
        where: [
          { id, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
          { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
        ],
        lock: { mode: "pessimistic_read" }
      });
      if (!source) throw new NotFoundException("Role not found");
      const isManagedPropertyTemplate = source.isTemplate && Boolean(source.managedTemplateCode);
      if (isManagedPropertyTemplate && (dto.roleScope && dto.roleScope !== "park")) {
        throw new ForbiddenException("Standard property templates can only create park roles");
      }
      if (isManagedPropertyTemplate && dto.dataScope && dto.dataScope !== source.dataScope) {
        throw new ForbiddenException("Standard property template data scope cannot be expanded while copying");
      }
      if (await roleRepository.exists({ where: { tenantId: scope.tenantId, code: dto.code, isDeleted: false } })) {
        throw new ConflictException("Role code already exists");
      }
      const parent = dto.parentId ? await roleRepository.findOne({
        where: [
          { id: dto.parentId, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
          { id: dto.parentId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
        ],
        lock: { mode: "pessimistic_read" }
      }) : null;
      if (dto.parentId && !parent) throw new NotFoundException("Parent role not found in current scope");
      const copied = await roleRepository.save(roleRepository.create({
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
        roleScope: isManagedPropertyTemplate ? "park" : dto.roleScope ?? source.roleScope,
        dataScope: isManagedPropertyTemplate ? source.dataScope : dto.dataScope ?? source.dataScope,
        dataScopeConfig: dto.dataScopeConfig ?? source.dataScopeConfig ?? {},
        isTemplate: false,
        managedTemplateCode: null,
        templateDefinitionVersion: null,
        templateDefinitionHash: null,
        // Managed templates can intentionally exclude permissions from their source bundle.
        // A copy inherits the effective links, not raw bundle metadata that would re-add them.
        appliedBundleCodes: isManagedPropertyTemplate ? [] : source.appliedBundleCodes ?? [],
        appliedBundleSignature: isManagedPropertyTemplate ? null : source.appliedBundleSignature ?? null,
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
      }));
      const permissionRepository = manager.getRepository(RolePermissionEntity);
      const fieldRepository = manager.getRepository(RoleFieldPermissionEntity);
      const dataScopeRepository = manager.getRepository(RoleDataScopeEntity);
      const [permissions, fields, dataScopes] = await Promise.all([
        permissionRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } }),
        fieldRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } }),
        dataScopeRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } })
      ]);
      await permissionRepository.save(permissions.map((link) => permissionRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        permissionId: link.permissionId, createBy: actorId, updateBy: actorId,
        remark: "Copied from role template"
      })));
      await fieldRepository.save(fields.map((field) => fieldRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        resource: field.resource, fieldKey: field.fieldKey, fieldName: field.fieldName,
        accessMode: field.accessMode, createBy: actorId, updateBy: actorId,
        remark: "Copied from role template"
      })));
      await dataScopeRepository.save(dataScopes.map((link) => dataScopeRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        ruleId: link.ruleId, createBy: actorId, updateBy: actorId,
        remark: "Copied from role template"
      })));
      return copied.id;
    });
    return this.detail(scope, copiedId);
  }

  async assignPermissions(
    scope: TenantParkScope,
    actorId: string,
    id: string,
    dto: AssignPermissionsDto
  ): Promise<{ id: string }> {
    await this.rolePermissionRepository.manager.transaction(async (manager) => {
      const role = await this.lockEditableRole(manager, scope, id);
      const permissionsRepository = manager.getRepository(PermissionEntity);
      const linksRepository = manager.getRepository(RolePermissionEntity);
      const permissions = await permissionsRepository.find({
        where: { id: In(dto.permissionIds), tenantId: scope.tenantId, isDeleted: false }
      });
      if (permissions.length !== dto.permissionIds.length) {
        throw new NotFoundException("Permission not found in current scope");
      }
      await linksRepository.update(
        { roleId: id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        { isDeleted: true, updateBy: actorId }
      );
      const links = dto.permissionIds.map((permissionId) => linksRepository.create({
        roleId: id,
        permissionId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      }));
      await linksRepository.save(links);
      role.appliedBundleCodes = [];
      role.appliedBundleSignature = null;
      role.updateBy = actorId;
      await manager.getRepository(RoleEntity).save(role);
    });
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
    const role = await this.detail(scope, id);
    this.assertBindingsEditable(role);
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

  private assertBindingsEditable(role: RoleEntity): void {
    if (role.isTemplate === true || role.isSystem === true || role.isBuiltin === true || role.editable === false || role.isEditable === false) {
      throw new ForbiddenException("Protected role bindings cannot be changed");
    }
  }

  private async lockEditableRole(
    manager: import("typeorm").EntityManager,
    scope: TenantParkScope,
    id: string
  ): Promise<RoleEntity> {
    const role = await manager.getRepository(RoleEntity).createQueryBuilder("role")
      .setLock("pessimistic_write")
      .where("role.id=:id", { id })
      .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("(role.role_scope='tenant' OR role.park_id=:parkId)", { parkId: scope.parkId })
      .andWhere("role.is_deleted=false")
      .getOne();
    if (!role) throw new NotFoundException("Role not found");
    this.assertBindingsEditable(role);
    return role;
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
      where: [
        { id, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      ]
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

  private async attachPermissionLinks(scope: TenantParkScope, roles: RoleEntity[]): Promise<void> {
    if (roles.length === 0) return;
    const links = await this.rolePermissionRepository.find({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        roleId: In(roles.map((role) => role.id)),
        isDeleted: false
      },
      relations: { permission: true }
    });
    const linksByRole = new Map<string, RolePermissionEntity[]>();
    for (const link of links) {
      const roleLinks = linksByRole.get(link.roleId) ?? [];
      roleLinks.push(link);
      linksByRole.set(link.roleId, roleLinks);
    }
    for (const role of roles) {
      role.permissionLinks = linksByRole.get(role.id) ?? [];
    }
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
