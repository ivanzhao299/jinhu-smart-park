import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, GoneException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { EntityManager, Repository, SelectQueryBuilder } from "typeorm";
import { Brackets, In } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import {
  canonicalizePropertyRoleTemplateBundleSignature,
  findPropertyRoleTemplateDefinition,
  resolvePropertyRoleTemplatePermissionCodes,
  type PropertyRoleTemplateDefinition
} from "@jinhu/shared";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { RolePermissionEntity } from "../permissions/entities/role-permission.entity";
import { RoleFieldPermissionEntity } from "../permissions/entities/role-field-permission.entity";
import { activeTenantPermissionWhere } from "../permissions/permission-scope";
import { RoleFieldPolicyEntity } from "../field-policies/entities/role-field-policy.entity";
import { RoleDataScopeEntity } from "../data-scopes/entities/role-data-scope.entity";
import type { AssignPermissionsDto } from "./dto/assign-permissions.dto";
import type { AssignFieldPermissionsDto } from "./dto/assign-field-permissions.dto";
import type { CreateRoleDto } from "./dto/create-role.dto";
import type { CopyRoleDto } from "./dto/copy-role.dto";
import type { ListRolesQueryDto } from "./dto/list-roles-query.dto";
import type { UpdateRoleDto } from "./dto/update-role.dto";
import { canonicalizeUuidDataScopeIds, normalizeDataScopeType, normalizeScopeConfig } from "../data-scopes/data-scope-config";
import type { DataScopeConfig } from "../data-scopes/entities/data-scope-rule.entity";
import { RoleEntity } from "./entities/role.entity";
import { UserRoleEntity } from "./entities/user-role.entity";
import { evaluateRoleAssignability, type RoleAssignability } from "./role-assignability";

export type RoleManagementView = RoleEntity & RoleAssignability;
export type RoleTreeNode = Omit<RoleManagementView, "children"> & { children: RoleTreeNode[] };

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

  async list(scope: TenantParkScope, query: ListRolesQueryDto): Promise<PaginatedResult<RoleManagementView>> {
    const builder = this.rolesRepository.createQueryBuilder("role")
      .where("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("role.is_deleted=false")
      .andWhere("(role.role_scope='tenant' OR role.park_id=:parkId)", { parkId: scope.parkId });

    if (query.status === "enabled") {
      builder.andWhere("role.is_enabled=true");
    } else if (query.status === "disabled") {
      builder.andWhere("role.is_enabled=false");
    }
    if (query.keyword) {
      builder.andWhere(new Brackets((keyword) => {
        keyword
          .where("role.code ILIKE :keyword", { keyword: `%${query.keyword}%` })
          .orWhere("role.name ILIKE :keyword", { keyword: `%${query.keyword}%` });
      }));
    }
    this.applyAssignabilityFilter(builder, query.assignability);

    const [items, total] = await builder
      .orderBy("role.level", "ASC")
      .addOrderBy("role.sortNo", "ASC")
      .addOrderBy("role.createTime", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    await this.attachPermissionLinks(scope, items);
    return { items: this.toManagementViews(scope, items), total, page: query.page, page_size: query.page_size };
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
    return this.buildTree(this.toManagementViews(scope, roles));
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateRoleDto): Promise<RoleEntity> {
    await this.assertCodeAvailable(scope, dto.code);
    const parent = dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    const dataScope = dto.dataScope ?? "50";
    const dataScopeConfig = normalizeScopeConfig(dto.dataScopeConfig);
    await this.validateRoleDataScopeConfig(scope, dataScope, dataScopeConfig, this.rolesRepository);
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
        dataScope,
        dataScopeConfig: dataScopeConfig as Record<string, unknown>,
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

  async detail(scope: TenantParkScope, id: string): Promise<RoleManagementView> {
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
    return this.toManagementView(scope, role);
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
    const convertsToTemplate = dto.isTemplate === true && role.isTemplate !== true;
    const parent = dto.parentId === undefined ? undefined : dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    if (parent && parent.id === role.id) {
      throw new BadRequestException("Role cannot use itself as parent");
    }
    const nextCode = dto.code ?? role.code;
    const nextParentId = parent === undefined ? role.parentId : parent?.id ?? null;
    const nextParentPath = parent === undefined ? await this.resolveParentPath(scope, nextParentId) : parent ? parent.rolePath ?? parent.code : null;
    const nextParentLevel = parent === undefined ? await this.resolveParentLevel(scope, nextParentId) : parent ? parent.level : 0;
    const changes = {
      code: nextCode,
      name: dto.name ?? role.name,
      parentId: nextParentId,
      rolePath: nextParentPath ? `${nextParentPath}/${nextCode}` : nextCode,
      roleLevel: nextParentLevel + 1,
      level: nextParentLevel + 1,
      sortNo: dto.sortNo ?? role.sortNo,
      roleType: dto.roleType ?? role.roleType,
      roleScope: dto.roleScope ?? role.roleScope,
      isTemplate: dto.isTemplate ?? role.isTemplate,
      status: dto.status ?? role.status,
      isEnabled: dto.status ? dto.status === "enabled" : role.isEnabled,
      remark: dto.remark ?? role.remark,
      updateBy: actorId
    };
    if (convertsToTemplate) {
      return this.rolesRepository.manager.transaction(async (manager) => {
        const lockedRole = await manager.getRepository(RoleEntity).createQueryBuilder("role")
          .setLock("pessimistic_write")
          .where("role.id=:id", { id })
          .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
          .andWhere("(role.role_scope='tenant' OR (role.role_scope IN ('park','platform') AND role.park_id=:parkId))", { parkId: scope.parkId })
          .andWhere("role.is_deleted=false")
          .getOne();
        if (!lockedRole) throw new NotFoundException("Role not found");
        if (!lockedRole.isEditable || !lockedRole.editable) throw new ForbiddenException("Role is not editable");
        if (lockedRole.isTemplate) throw new BadRequestException("Role is already a template");
        const boundUsers = await manager.getRepository(UserRoleEntity).count({
          where: { tenantId: scope.tenantId, roleId: id, isDeleted: false }
        });
        if (boundUsers > 0) {
          throw new BadRequestException("Role with bound users cannot be converted to a template");
        }
        const lockedParentId = dto.parentId === undefined ? lockedRole.parentId : dto.parentId;
        const lockedParent = lockedParentId ? await manager.getRepository(RoleEntity).createQueryBuilder("parent")
          .setLock("pessimistic_read")
          .where("parent.id=:parentId", { parentId: lockedParentId })
          .andWhere("parent.tenant_id=:tenantId", { tenantId: scope.tenantId })
          .andWhere("(parent.role_scope='tenant' OR (parent.role_scope IN ('park','platform') AND parent.park_id=:parkId))", { parkId: scope.parkId })
          .andWhere("parent.is_deleted=false")
          .getOne() : null;
        if (lockedParentId && !lockedParent) throw new NotFoundException("Parent role not found in current scope");
        const lockedCode = dto.code ?? lockedRole.code;
        const lockedParentPath = lockedParent ? lockedParent.rolePath ?? lockedParent.code : null;
        const lockedParentLevel = lockedParent ? lockedParent.level : 0;
        const lockedDataScope = dto.dataScope ?? lockedRole.dataScope;
        const lockedDataScopeConfig = dto.dataScopeConfig === undefined ? normalizeScopeConfig(lockedRole.dataScopeConfig) : normalizeScopeConfig(dto.dataScopeConfig);
        if (dto.dataScope !== undefined || dto.dataScopeConfig !== undefined) {
          await this.validateRoleDataScopeConfig(
            { tenantId: scope.tenantId, parkId: lockedRole.parkId ?? scope.parkId },
            lockedDataScope,
            lockedDataScopeConfig,
            manager.getRepository(RoleEntity)
          );
        }
        Object.assign(lockedRole, {
          ...changes,
          code: dto.code ?? lockedRole.code,
          name: dto.name ?? lockedRole.name,
          sortNo: dto.sortNo ?? lockedRole.sortNo,
          roleType: dto.roleType ?? lockedRole.roleType,
          roleScope: lockedRole.roleScope,
          dataScope: lockedDataScope,
          dataScopeConfig: lockedDataScopeConfig as Record<string, unknown>,
          status: dto.status ?? lockedRole.status,
          isEnabled: dto.status ? dto.status === "enabled" : lockedRole.isEnabled,
          remark: dto.remark ?? lockedRole.remark,
          parentId: lockedParentId,
          rolePath: lockedParentPath ? `${lockedParentPath}/${lockedCode}` : lockedCode,
          roleLevel: lockedParentLevel + 1,
          level: lockedParentLevel + 1
        });
        return manager.getRepository(RoleEntity).save(lockedRole);
      });
    }
    return this.rolesRepository.manager.transaction(async (manager) => {
      const lockedRole = await manager.getRepository(RoleEntity).createQueryBuilder("role")
        .setLock("pessimistic_write")
        .where("role.id=:id", { id })
        .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("(role.role_scope='tenant' OR (role.role_scope IN ('park','platform') AND role.park_id=:parkId))", { parkId: scope.parkId })
        .andWhere("role.is_deleted=false")
        .getOne();
      if (!lockedRole) throw new NotFoundException("Role not found");
      if (!lockedRole.isEditable || !lockedRole.editable) throw new ForbiddenException("Role is not editable");
      const lockedParentId = dto.parentId === undefined ? lockedRole.parentId : dto.parentId;
      const lockedParent = lockedParentId ? await manager.getRepository(RoleEntity).createQueryBuilder("parent")
        .setLock("pessimistic_read")
        .where("parent.id=:parentId", { parentId: lockedParentId })
        .andWhere("parent.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("(parent.role_scope='tenant' OR (parent.role_scope IN ('park','platform') AND parent.park_id=:parkId))", { parkId: scope.parkId })
        .andWhere("parent.is_deleted=false")
        .getOne() : null;
      if (lockedParentId && !lockedParent) throw new NotFoundException("Parent role not found in current scope");
      const lockedCode = dto.code ?? lockedRole.code;
      const lockedParentPath = lockedParent ? lockedParent.rolePath ?? lockedParent.code : null;
      const lockedParentLevel = lockedParent ? lockedParent.level : 0;
      const lockedDataScope = dto.dataScope ?? lockedRole.dataScope;
      const lockedDataScopeConfig = dto.dataScopeConfig === undefined ? normalizeScopeConfig(lockedRole.dataScopeConfig) : normalizeScopeConfig(dto.dataScopeConfig);
      if (dto.dataScope !== undefined || dto.dataScopeConfig !== undefined) {
        await this.validateRoleDataScopeConfig(
          { tenantId: scope.tenantId, parkId: lockedRole.parkId ?? scope.parkId },
          lockedDataScope,
          lockedDataScopeConfig,
          manager.getRepository(RoleEntity)
        );
      }
      Object.assign(lockedRole, {
        code: dto.code ?? lockedRole.code,
        name: dto.name ?? lockedRole.name,
        sortNo: dto.sortNo ?? lockedRole.sortNo,
        roleType: dto.roleType ?? lockedRole.roleType,
        dataScope: lockedDataScope,
        dataScopeConfig: lockedDataScopeConfig as Record<string, unknown>,
        isTemplate: dto.isTemplate ?? lockedRole.isTemplate,
        status: dto.status ?? lockedRole.status,
        isEnabled: dto.status ? dto.status === "enabled" : lockedRole.isEnabled,
        remark: dto.remark ?? lockedRole.remark,
        parentId: lockedParentId,
        rolePath: lockedParentPath ? `${lockedParentPath}/${lockedCode}` : lockedCode,
        roleLevel: lockedParentLevel + 1,
        level: lockedParentLevel + 1,
        updateBy: actorId
      });
      return manager.getRepository(RoleEntity).save(lockedRole);
    });
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
    await this.rolesRepository.update({ id, tenantId: scope.tenantId, isDeleted: false }, { isDeleted: true, updateBy: actorId });
    return { id };
  }

  async enable(scope: TenantParkScope, actorId: string, id: string): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    await this.rolesRepository.update({ id, tenantId: scope.tenantId, isDeleted: false }, { status: "enabled", isEnabled: true, updateBy: actorId });
    return this.detail(scope, id);
  }

  async disable(scope: TenantParkScope, actorId: string, id: string): Promise<RoleEntity> {
    const role = await this.detail(scope, id);
    if (!role.isEditable || !role.editable) {
      throw new ForbiddenException("Role is not editable");
    }
    await this.rolesRepository.update({ id, tenantId: scope.tenantId, isDeleted: false }, { status: "disabled", isEnabled: false, updateBy: actorId });
    return this.detail(scope, id);
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
      const isManagedPropertyTemplate = Boolean(source.managedTemplateCode);
      const managedTemplateDefinition = isManagedPropertyTemplate
        ? this.resolveManagedPropertyTemplateDefinition(scope, source)
        : null;
      const managedTemplateDataScope = managedTemplateDefinition
        ? this.resolveManagedTemplateDataScope(managedTemplateDefinition)
        : null;
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
      const copiedDataScope = managedTemplateDataScope?.dataScope ?? dto.dataScope ?? source.dataScope;
      const copiedDataScopeConfig = normalizeScopeConfig(
        managedTemplateDataScope?.dataScopeConfig ?? dto.dataScopeConfig ?? source.dataScopeConfig ?? {}
      );
      await this.validateRoleDataScopeConfig(scope, copiedDataScope, copiedDataScopeConfig, roleRepository);
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
        dataScope: copiedDataScope,
        dataScopeConfig: copiedDataScopeConfig as Record<string, unknown>,
        isTemplate: false,
        managedTemplateCode: null,
        templateDefinitionVersion: null,
        templateDefinitionHash: null,
        // Managed template instances store effective links only; template metadata stays on the protected source.
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
      const fieldPolicyRepository = manager.getRepository(RoleFieldPolicyEntity);
      const dataScopeRepository = manager.getRepository(RoleDataScopeEntity);
      const overridesDataScope = !isManagedPropertyTemplate
        && (dto.dataScope !== undefined || dto.dataScopeConfig !== undefined);
      const [permissionIds, fieldPolicies, dataScopeRuleIds] = await Promise.all([
        managedTemplateDefinition
          ? this.resolveManagedTemplatePermissionIds(manager, scope, managedTemplateDefinition)
          : permissionRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } })
            .then((links) => links.map((link) => link.permissionId)),
        fieldPolicyRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } }),
        managedTemplateDefinition
          ? this.resolveManagedTemplateDataScopeRuleIds(manager, scope, managedTemplateDefinition)
          : overridesDataScope
          ? Promise.resolve([])
          : dataScopeRepository.find({ where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: source.id, isDeleted: false } })
            .then((links) => links.map((link) => link.ruleId))
      ]);
      await permissionRepository.save(permissionIds.map((permissionId) => permissionRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        permissionId, createBy: actorId, updateBy: actorId,
        remark: managedTemplateDefinition ? "Instantiated from shared property role template" : "Copied from role template"
      })));
      await fieldPolicyRepository.save(fieldPolicies.map((link) => fieldPolicyRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        fieldPolicyId: link.fieldPolicyId, createBy: actorId, updateBy: actorId,
        remark: "Copied from role template"
      })));
      await dataScopeRepository.save(dataScopeRuleIds.map((ruleId) => dataScopeRepository.create({
        tenantId: scope.tenantId, parkId: scope.parkId, roleId: copied.id,
        ruleId, createBy: actorId, updateBy: actorId,
        remark: managedTemplateDefinition ? "Instantiated from shared property role template" : "Copied from role template"
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
        where: { id: In(dto.permissionIds), ...activeTenantPermissionWhere(scope) }
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
  ): Promise<never> {
    void scope;
    void actorId;
    void id;
    void dto;
    throw new GoneException("The role field-permissions endpoint is deprecated; use field-policies role bindings instead");
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

  private async validateRoleDataScopeConfig(
    scope: TenantParkScope,
    dataScope: string,
    config: DataScopeConfig,
    repository: Pick<Repository<RoleEntity>, "query">
  ): Promise<void> {
    const normalizedScope = normalizeDataScopeType(dataScope);
    if (normalizedScope === "custom" && (config.ids?.length ?? 0) > 0) {
      throw new BadRequestException("Custom role dataScopeConfig must use tenantIds, parkIds, or orgIds");
    }
    const tenantIds = [
      ...(config.tenantIds ?? []),
      ...(normalizedScope === "tenant" ? config.ids ?? [] : [])
    ];
    const parkIds = [
      ...(config.parkIds ?? []),
      ...(normalizedScope === "park" ? config.ids ?? [] : [])
    ];
    const orgIds = [
      ...(config.orgIds ?? []),
      ...(["org", "org_and_children"].includes(normalizedScope) ? config.ids ?? [] : [])
    ];
    if (tenantIds.length > 0) {
      const uniqueTenantIds = [...new Set(tenantIds)];
      if (uniqueTenantIds.some((id) => id !== scope.tenantId)) {
        throw new BadRequestException("Role dataScopeConfig tenant ids must stay in current tenant");
      }
      await this.assertConfiguredIdsExist(
        repository,
        "Role dataScopeConfig tenant ids must reference enabled tenants in current scope",
        uniqueTenantIds,
        `SELECT tenant_id AS id FROM sys_tenant
          WHERE tenant_id = ANY($1::varchar[])
            AND is_deleted = false
            AND status = 1`,
        [uniqueTenantIds]
      );
    }
    if (parkIds.length > 0) {
      const uniqueParkIds = [...new Set(parkIds)];
      await this.assertConfiguredIdsExist(
        repository,
        "Role dataScopeConfig park ids must reference enabled parks in current tenant",
        uniqueParkIds,
        `SELECT park_id AS id FROM biz_park
          WHERE tenant_id = $1
            AND park_id = ANY($2::varchar[])
            AND is_deleted = false
            AND status = 1`,
        [scope.tenantId, uniqueParkIds]
      );
    }
    if (orgIds.length > 0) {
      const uniqueOrgIds = canonicalizeUuidDataScopeIds([...new Set(orgIds)], "Role dataScopeConfig org ids must be UUID strings");
      await this.assertConfiguredIdsExist(
        repository,
        "Role dataScopeConfig org ids must reference enabled orgs in current park",
        uniqueOrgIds,
        `SELECT id::text AS id FROM sys_org
          WHERE tenant_id = $1
            AND park_id = $2
            AND id = ANY($3::uuid[])
            AND is_deleted = false
            AND status = 'enabled'`,
        [scope.tenantId, scope.parkId, uniqueOrgIds]
      );
    }
  }

  private resolveManagedPropertyTemplateDefinition(scope: TenantParkScope, source: RoleEntity): PropertyRoleTemplateDefinition {
    const definition = findPropertyRoleTemplateDefinition(source.managedTemplateCode);
    if (!definition) {
      throw new ConflictException(`Unknown standard property role template: ${source.managedTemplateCode}`);
    }
    if (source.code !== definition.code || source.managedTemplateCode !== definition.code) {
      throw new ConflictException(`Standard property role template identity drifted: ${source.managedTemplateCode}`);
    }
    if (source.isTemplate !== true || source.isSystem !== true || source.isBuiltin !== true) {
      throw new ConflictException(`Standard property role template protection drifted: ${source.managedTemplateCode}`);
    }
    if (source.roleScope !== definition.roleScope || source.parkId !== scope.parkId) {
      throw new ConflictException(`Standard property role template scope drifted: ${source.managedTemplateCode}`);
    }
    if (
      source.templateDefinitionVersion !== definition.definitionVersion
      || source.templateDefinitionHash !== definition.definitionHash
      || source.appliedBundleSignature !== this.hash(canonicalizePropertyRoleTemplateBundleSignature(definition))
    ) {
      throw new ConflictException(`Standard property role template definition drifted: ${source.managedTemplateCode}`);
    }
    return definition;
  }

  private async resolveManagedTemplatePermissionIds(
    manager: EntityManager,
    scope: TenantParkScope,
    definition: PropertyRoleTemplateDefinition
  ): Promise<string[]> {
    const permissionCodes = [...resolvePropertyRoleTemplatePermissionCodes(definition)];
    const permissions = await manager.getRepository(PermissionEntity)
      .createQueryBuilder("permission")
      .setLock("pessimistic_read")
      .where("permission.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("permission.code IN (:...permissionCodes)", { permissionCodes })
      .andWhere("permission.status = 'enabled'")
      .andWhere("permission.is_enabled = true")
      .andWhere("permission.is_deleted = false")
      .getMany();
    const idsByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
    const missingCodes = permissionCodes.filter((code) => !idsByCode.has(code));
    if (missingCodes.length > 0 || permissions.length !== permissionCodes.length) {
      throw new ConflictException(`Standard property role template permissions are missing: ${missingCodes.join(", ") || definition.code}`);
    }
    return permissionCodes.map((code) => idsByCode.get(code)!);
  }

  private resolveManagedTemplateDataScope(
    definition: PropertyRoleTemplateDefinition
  ): { dataScope: string; dataScopeConfig: DataScopeConfig } {
    if (definition.dataScopeRuleCode !== "current_park") {
      throw new ConflictException(`Unsupported standard property role template data-scope rule: ${definition.dataScopeRuleCode}`);
    }
    return { dataScope: "40", dataScopeConfig: {} };
  }

  private async resolveManagedTemplateDataScopeRuleIds(
    manager: EntityManager,
    scope: TenantParkScope,
    definition: PropertyRoleTemplateDefinition
  ): Promise<string[]> {
    if (definition.dataScopeRuleCode !== "current_park") {
      throw new ConflictException(`Unsupported standard property role template data-scope rule: ${definition.dataScopeRuleCode}`);
    }
    const rules = await manager.query<Array<{ id: string }>>(`
      SELECT id FROM sys_data_scope_rule
      WHERE tenant_id=$1 AND park_id=$2 AND rule_code='current_park'
        AND dimension='park' AND scope_type='park' AND status='enabled' AND is_deleted=false
    `, [scope.tenantId, scope.parkId]);
    if (rules.length !== 1 || !rules[0]) {
      throw new ConflictException("Current park data-scope rule is missing or ambiguous");
    }
    return [rules[0].id];
  }

  private async assertConfiguredIdsExist(
    repository: Pick<Repository<RoleEntity>, "query">,
    message: string,
    expectedIds: string[],
    sql: string,
    parameters: unknown[]
  ): Promise<void> {
    const rows = await repository.query<Array<{ id: string }>>(sql, parameters);
    const actualIds = new Set(rows.map((row) => row.id));
    if (expectedIds.some((id) => !actualIds.has(id))) {
      throw new BadRequestException(message);
    }
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

  private toManagementViews(scope: TenantParkScope, roles: RoleEntity[]): RoleManagementView[] {
    return roles.map((role) => this.toManagementView(scope, role));
  }

  private toManagementView(scope: TenantParkScope, role: RoleEntity): RoleManagementView {
    return Object.assign(role, evaluateRoleAssignability(role, scope));
  }

  private applyAssignabilityFilter(builder: SelectQueryBuilder<RoleEntity>, assignability?: string): void {
    const assignableWhere = [
      "role.status='enabled'",
      "role.is_enabled=true",
      "role.is_template=false",
      "role.is_system=false",
      "role.is_builtin=false",
      "role.role_scope IN ('tenant','park')"
    ].join(" AND ");
    if (assignability === "assignable") {
      builder.andWhere(assignableWhere);
    } else if (assignability === "unassignable") {
      builder.andWhere(`NOT (${assignableWhere})`);
    } else if (assignability === "template") {
      builder.andWhere("role.is_template=true");
    } else if (assignability === "protected") {
      builder.andWhere("(role.is_template=true OR role.is_system=true OR role.is_builtin=true OR role.role_scope='platform')");
    } else if (assignability === "disabled") {
      builder.andWhere("(role.status<>'enabled' OR role.is_enabled=false)");
    }
  }

  private buildTree(roles: RoleManagementView[]): RoleTreeNode[] {
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

  private hash(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
  }
}
