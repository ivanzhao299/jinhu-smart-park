import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import type { Repository } from "typeorm";
import { ILike, In } from "typeorm";
import type { PaginatedResult, TenantParkScope, UserContext } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import type { AssignRolesDto } from "./dto/assign-roles.dto";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import { UserEntity } from "./entities/user.entity";

export interface UserView {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  isEnabled: boolean;
  status: string;
  tenantId: string;
  parkId: string;
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly usersRepository: Repository<UserEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>,
    @InjectRepository(UserOrgEntity)
    private readonly userOrgRepository: Repository<UserOrgEntity>,
    private readonly configService: ConfigService
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<UserView>> {
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const baseWhere = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      isDeleted: false,
      ...statusWhere
    };
    const where = query.keyword
      ? [
          { ...baseWhere, username: ILike(`%${query.keyword}%`) },
          { ...baseWhere, displayName: ILike(`%${query.keyword}%`) }
        ]
      : baseWhere;
    const [items, total] = await this.usersRepository.findAndCount({
      where,
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items: items.map((item) => this.toView(item)), total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateUserDto): Promise<UserView> {
    await this.assertUsernameAvailable(scope, dto.username);
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
        mobile: dto.mobile ?? null,
        email: dto.email ?? null,
        isEnabled: dto.status !== "disabled",
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
    return this.toView(user);
  }

  findByUsernameInScope(username: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: {
        username,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      }
    });
  }

  findByIdInScope(id: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: {
        id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      }
    });
  }

  async getEntityInScope(scope: TenantParkScope, id: string): Promise<UserEntity> {
    const user = await this.findByIdInScope(id, scope);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async detail(scope: TenantParkScope, id: string): Promise<UserView> {
    const user = await this.getEntityInScope(scope, id);
    return this.toView(user);
  }

  async getCurrentUserContext(scope: TenantParkScope, id: string): Promise<UserContext> {
    const user = await this.getEntityInScope(scope, id);
    const primaryOrg = await this.userOrgRepository.findOne({
      where: {
        userId: id,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        isPrimary: true
      },
      relations: { org: true }
    });
    const activeRoleLinks = user.roleLinks.filter((link) => !link.isDeleted && !link.role.isDeleted && link.role.isEnabled);
    const roleCodes = activeRoleLinks.map((link) => link.role.code);
    const basePermissions = activeRoleLinks.flatMap((link) =>
      link.role.permissionLinks
        .filter((permissionLink) => !permissionLink.isDeleted && !permissionLink.permission.isDeleted && permissionLink.permission.isEnabled)
        .map((permissionLink) => permissionLink.permission.code)
    );
    const isSuper = roleCodes.some((roleCode) => roleCode.toUpperCase() === "SUPER_ADMIN") || basePermissions.includes("*");
    const permissions = isSuper ? ["*"] : this.expandPermissionAliases([...new Set(basePermissions)]);

    return {
      id: user.id,
      username: user.username,
      real_name: user.displayName,
      mobile: user.mobile,
      email: user.email,
      tenant_id: user.tenantId,
      park_id: user.parkId,
      park_name: "金湖科创产业园",
      org_id: primaryOrg?.orgId ?? null,
      org_name: primaryOrg?.org?.orgName ?? null,
      roles: activeRoleLinks.map((link) => ({ role_code: link.role.code, role_name: link.role.name })),
      permissions,
      data_scope: isSuper ? "all" : "tenant",
      is_super: isSuper
    };
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateUserDto): Promise<UserView> {
    const user = await this.getEntityInScope(scope, id);
    Object.assign(user, {
      displayName: dto.displayName ?? user.displayName,
      mobile: dto.mobile ?? user.mobile,
      email: dto.email ?? user.email,
      status: dto.status ?? user.status,
      isEnabled: dto.status ? dto.status === "enabled" : user.isEnabled,
      remark: dto.remark ?? user.remark,
      updateBy: actorId
    });
    return this.toView(await this.usersRepository.save(user));
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const user = await this.getEntityInScope(scope, id);
    user.isDeleted = true;
    user.updateBy = actorId;
    await this.usersRepository.save(user);
    return { id };
  }

  async resetPassword(scope: TenantParkScope, actorId: string, id: string, dto: ResetPasswordDto): Promise<{ id: string }> {
    const user = await this.getEntityInScope(scope, id);
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    user.passwordHash = await bcrypt.hash(dto.password, saltRounds);
    user.updateBy = actorId;
    await this.usersRepository.save(user);
    return { id };
  }

  async assignRoles(scope: TenantParkScope, actorId: string, id: string, dto: AssignRolesDto): Promise<{ id: string }> {
    await this.getEntityInScope(scope, id);
    const roles = await this.rolesRepository.find({
      where: {
        id: In(dto.roleIds),
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false
      }
    });
    if (roles.length !== dto.roleIds.length) {
      throw new NotFoundException("Role not found in current scope");
    }

    await this.userRoleRepository.update(
      { userId: id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    const links = dto.roleIds.map((roleId) =>
      this.userRoleRepository.create({
        userId: id,
        roleId,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
    await this.userRoleRepository.save(links);
    return { id };
  }

  private async assertUsernameAvailable(scope: TenantParkScope, username: string): Promise<void> {
    const exists = await this.usersRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, username, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Username already exists");
    }
  }

  private toView(user: UserEntity): UserView {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      mobile: user.mobile,
      email: user.email,
      isEnabled: user.isEnabled,
      status: user.status,
      tenantId: user.tenantId,
      parkId: user.parkId,
      createTime: user.createTime,
      updateTime: user.updateTime,
      remark: user.remark
    };
  }

  private expandPermissionAliases(permissions: string[]): string[] {
    const aliases: Record<string, string[]> = {
      "system:org:list": ["system:read", "org:read"],
      "system:org:create": ["org:create"],
      "system:org:update": ["org:update"],
      "system:org:delete": ["org:delete"],
      "system:user:list": ["system:read", "user:read"],
      "system:user:create": ["user:create"],
      "system:user:update": ["user:update"],
      "system:user:delete": ["user:delete"],
      "system:user:reset-password": ["user:update"],
      "system:user:assign-roles": ["user:update", "role:read"],
      "system:role:list": ["system:read", "role:read"],
      "system:role:create": ["role:create"],
      "system:role:update": ["role:update"],
      "system:role:delete": ["role:delete"],
      "system:role:assign-permissions": ["role:update", "permission:read"],
      "system:permission:list": ["system:read", "permission:read"],
      "system:permission:tree": ["system:read", "permission:read"],
      "system:dict-type:list": ["system:read", "dict:read"],
      "system:dict-type:create": ["dict:create"],
      "system:dict-type:update": ["dict:update"],
      "system:dict-type:delete": ["dict:delete"],
      "system:dict-item:list": ["system:read", "dict:read"],
      "system:dict-item:create": ["dict:create"],
      "system:dict-item:update": ["dict:update"],
      "system:dict-item:delete": ["dict:delete"],
      "file:read": ["system:read"],
      "audit:read": ["system:read"],
      "system:audit:op-log:list": ["audit:read"],
      "system:audit:login-log:list": ["audit:read"],
      "system:attachment:list": ["file:read"],
      "system:attachment:create": ["file:upload"],
      "system:attachment:delete": ["file:delete"]
    };
    return [...new Set(permissions.flatMap((permission) => [permission, ...(aliases[permission] ?? [])]))];
  }
}
