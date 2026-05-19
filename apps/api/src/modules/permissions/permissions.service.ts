import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import { SYSTEM_PERMISSION_SEEDS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { CreatePermissionDto } from "./dto/create-permission.dto";
import type { UpdatePermissionDto } from "./dto/update-permission.dto";
import { PermissionEntity } from "./entities/permission.entity";
import { RolePermissionEntity } from "./entities/role-permission.entity";

export interface PermissionTreeNode {
  id: string;
  code: string;
  name: string;
  resource: string;
  action: string;
  permissionType: string;
  permType: number;
  parentId: string | null;
  permPath: string | null;
  level: number;
  apiMethod: string | null;
  apiPath: string | null;
  frontendRoute: string | null;
  componentKey: string | null;
  icon: string | null;
  fieldKey: string | null;
  dataDimension: string | null;
  visible: boolean;
  keepAlive: boolean;
  alwaysShow: boolean;
  isBuiltin: boolean;
  isTenantCustom: boolean;
  children: PermissionTreeNode[];
}

const PERMISSION_TYPE_NAMES: Record<number, string> = {
  10: "menu",
  20: "page",
  30: "button",
  40: "api",
  50: "data",
  60: "field",
  70: "report",
  80: "approval",
  90: "custom"
};

const SYSTEM_PERMISSION_CODES = new Set<string>(SYSTEM_PERMISSION_SEEDS.map((permission) => permission.code));

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionsRepository: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<PermissionEntity>> {
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
    const [items, total] = await this.permissionsRepository.findAndCount({
      where,
      order: { level: "ASC", sortNo: "ASC", resource: "ASC", action: "ASC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  listByScope(scope: TenantParkScope): Promise<PermissionEntity[]> {
    return this.permissionsRepository.find({
      where: {
        tenantId: scope.tenantId,
        isDeleted: false
      }
    });
  }

  async tree(scope: TenantParkScope): Promise<PermissionTreeNode[]> {
    const permissions = await this.permissionsRepository.find({
      where: {
        tenantId: scope.tenantId,
        isDeleted: false,
        isEnabled: true
      },
      order: { level: "ASC", sortNo: "ASC", resource: "ASC", action: "ASC" }
    });
    return this.buildTree(permissions);
  }

  async detail(scope: TenantParkScope, id: string): Promise<PermissionEntity> {
    const permission = await this.permissionsRepository.findOne({
      where: { id, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!permission) {
      throw new NotFoundException("Permission not found");
    }
    return permission;
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePermissionDto): Promise<PermissionEntity> {
    await this.assertCodeAvailable(scope, dto.code);
    this.assertAllowedPermissionMutation(actor, dto.permType ?? 90, dto.code);
    const parent = dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    const permType = dto.permType ?? 90;
    const permissionType = this.toPermissionTypeName(permType);
    return this.permissionsRepository.save(
      this.permissionsRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        code: dto.code,
        name: dto.name,
        parentId: parent?.id ?? null,
        resource: dto.resource ?? "tenant.custom",
        action: dto.action ?? "custom",
        permissionPath: parent ? `${parent.permissionPath ?? parent.code}/${dto.code}` : dto.code,
        permPath: parent ? `${parent.permPath ?? parent.code}/${dto.code}` : dto.code,
        permissionLevel: parent ? parent.level + 1 : 1,
        level: parent ? parent.level + 1 : 1,
        sortNo: dto.sortNo ?? 0,
        permissionType,
        permType,
        apiMethod: dto.apiMethod?.toUpperCase() ?? null,
        apiPath: dto.apiPath ?? null,
        frontendRoute: dto.frontendRoute ?? null,
        componentKey: dto.componentKey ?? null,
        icon: dto.icon ?? null,
        fieldKey: dto.fieldKey ?? null,
        dataDimension: dto.dataDimension ?? null,
        isSystem: false,
        isBuiltin: false,
        isTenantCustom: true,
        visible: dto.visible ?? true,
        keepAlive: dto.keepAlive ?? true,
        alwaysShow: dto.alwaysShow ?? true,
        isEnabled: dto.status !== "disabled",
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdatePermissionDto): Promise<PermissionEntity> {
    const permission = await this.detail(scope, id);
    if ((permission.isBuiltin || permission.isSystem) && !actor.isSuper) {
      throw new ForbiddenException("Built-in permission cannot be modified by tenant users");
    }
    if (dto.code && dto.code !== permission.code) {
      await this.assertCodeAvailable(scope, dto.code);
    }
    const nextPermType = dto.permType ?? permission.permType;
    this.assertAllowedPermissionMutation(actor, nextPermType, dto.code ?? permission.code);
    const parent = dto.parentId === undefined ? undefined : dto.parentId ? await this.mustFindParent(scope, dto.parentId) : null;
    if (parent && parent.id === permission.id) {
      throw new BadRequestException("Permission cannot use itself as parent");
    }
    const nextCode = dto.code ?? permission.code;
    const nextParentId = parent === undefined ? permission.parentId : parent?.id ?? null;
    const nextParent = nextParentId ? await this.mustFindParent(scope, nextParentId) : null;
    const nextPath = nextParent ? `${nextParent.permPath ?? nextParent.permissionPath ?? nextParent.code}/${nextCode}` : nextCode;
    Object.assign(permission, {
      code: nextCode,
      name: dto.name ?? permission.name,
      parentId: nextParentId,
      resource: dto.resource ?? permission.resource,
      action: dto.action ?? permission.action,
      permissionPath: nextPath,
      permPath: nextPath,
      permissionLevel: nextParent ? nextParent.level + 1 : 1,
      level: nextParent ? nextParent.level + 1 : 1,
      sortNo: dto.sortNo ?? permission.sortNo,
      permissionType: this.toPermissionTypeName(nextPermType),
      permType: nextPermType,
      apiMethod: dto.apiMethod === undefined ? permission.apiMethod : dto.apiMethod?.toUpperCase() ?? null,
      apiPath: dto.apiPath === undefined ? permission.apiPath : dto.apiPath ?? null,
      frontendRoute: dto.frontendRoute === undefined ? permission.frontendRoute : dto.frontendRoute ?? null,
      componentKey: dto.componentKey === undefined ? permission.componentKey : dto.componentKey ?? null,
      icon: dto.icon === undefined ? permission.icon : dto.icon ?? null,
      fieldKey: dto.fieldKey === undefined ? permission.fieldKey : dto.fieldKey ?? null,
      dataDimension: dto.dataDimension === undefined ? permission.dataDimension : dto.dataDimension ?? null,
      visible: dto.visible ?? permission.visible,
      keepAlive: dto.keepAlive ?? permission.keepAlive,
      alwaysShow: dto.alwaysShow ?? permission.alwaysShow,
      status: dto.status ?? permission.status,
      isEnabled: dto.status ? dto.status === "enabled" : permission.isEnabled,
      remark: dto.remark ?? permission.remark,
      updateBy: actor.sub
    });
    return this.permissionsRepository.save(permission);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<{ id: string }> {
    const permission = await this.detail(scope, id);
    if (permission.isBuiltin || permission.isSystem) {
      throw new ForbiddenException("Built-in permission cannot be deleted");
    }
    if (!permission.isTenantCustom && !actor.isSuper) {
      throw new ForbiddenException("Only tenant custom permission can be deleted");
    }
    const linkedRoles = await this.rolePermissionRepository.count({
      where: { tenantId: scope.tenantId, permissionId: id, isDeleted: false }
    });
    if (linkedRoles > 0) {
      throw new BadRequestException("Permission has bound roles and cannot be deleted");
    }
    const children = await this.permissionsRepository.count({
      where: { tenantId: scope.tenantId, parentId: id, isDeleted: false }
    });
    if (children > 0) {
      throw new BadRequestException("Permission has child permissions and cannot be deleted");
    }
    permission.isDeleted = true;
    permission.updateBy = actor.sub;
    await this.permissionsRepository.save(permission);
    return { id };
  }

  private buildTree(permissions: PermissionEntity[]): PermissionTreeNode[] {
    const nodes = new Map<string, PermissionTreeNode>();
    for (const permission of permissions) {
      nodes.set(permission.id, {
        id: permission.id,
        code: permission.code,
        name: permission.name,
        resource: permission.resource,
        action: permission.action,
        permissionType: permission.permissionType,
        permType: permission.permType,
        parentId: permission.parentId,
        permPath: permission.permPath ?? permission.permissionPath,
        level: permission.level ?? permission.permissionLevel,
        apiMethod: permission.apiMethod,
        apiPath: permission.apiPath,
        frontendRoute: permission.frontendRoute,
        componentKey: permission.componentKey,
        icon: permission.icon,
        fieldKey: permission.fieldKey,
        dataDimension: permission.dataDimension,
        visible: permission.visible,
        keepAlive: permission.keepAlive,
        alwaysShow: permission.alwaysShow,
        isBuiltin: permission.isBuiltin,
        isTenantCustom: permission.isTenantCustom,
        children: []
      });
    }
    const roots: PermissionTreeNode[] = [];
    for (const permission of permissions) {
      const node = nodes.get(permission.id);
      if (!node) continue;
      const parent = permission.parentId ? nodes.get(permission.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private async assertCodeAvailable(scope: TenantParkScope, code: string): Promise<void> {
    const exists = await this.permissionsRepository.exists({
      where: { tenantId: scope.tenantId, code, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Permission code already exists");
    }
  }

  private async mustFindParent(scope: TenantParkScope, id: string): Promise<PermissionEntity> {
    const parent = await this.permissionsRepository.findOne({
      where: { id, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!parent) {
      throw new NotFoundException("Parent permission not found in current scope");
    }
    return parent;
  }

  private assertAllowedPermissionMutation(actor: JwtPrincipal, permType: number, code: string): void {
    if (permType === 40 && !SYSTEM_PERMISSION_CODES.has(code)) {
      throw new BadRequestException("API permission must match a registered backend permission point");
    }
    if (!actor.isSuper && permType !== 90) {
      throw new ForbiddenException("Tenant users can only create or modify custom permissions");
    }
  }

  private toPermissionTypeName(permType: number): string {
    return PERMISSION_TYPE_NAMES[permType] ?? "custom";
  }
}
