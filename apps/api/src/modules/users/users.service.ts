import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import type { Repository } from "typeorm";
import { ILike, In } from "typeorm";
import type { PaginatedResult, TenantParkScope, UserContext, UserMenuTreeNode, UserParkContext } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import { TenantEntity } from "../tenants/entities/tenant.entity";
import {
  clearPasswordLockoutState,
  evaluatePasswordFailure,
  isPasswordLocked,
  resetExpiredPasswordLock,
  type PasswordLockoutConfig
} from "../auth/auth-password-lockout.policy";
import type { AssignRolesDto } from "./dto/assign-roles.dto";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import { UserEntity } from "./entities/user.entity";
import { UserParkEntity } from "./entities/user-park.entity";

export interface UserView {
  id: string;
  username: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  avatarUrl: string | null;
  gender: string | null;
  lastLoginIp: string | null;
  lastLoginTime: Date | null;
  isEnabled: boolean;
  status: string;
  tenantId: string;
  parkId: string;
  tenantName: string | null;
  parkName: string | null;
  accessibleParks: UserParkContext[];
  loginContextStatus: "ready" | "missing_default_park" | "default_park_not_accessible" | "tenant_disabled" | "tenant_expired";
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}

export interface UserLoginContextCandidate {
  id: string;
  username: string;
  realName: string;
  tenantId: string;
  parkId: string;
  mobile: string | null;
}

export interface PasswordFailureRecordResult {
  user: UserEntity;
  lockoutTriggered: boolean;
}

export interface PasswordLoginSuccessResult {
  user: UserEntity;
  allowed: boolean;
  lockoutActive: boolean;
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
    @InjectRepository(UserParkEntity)
    private readonly userParkRepository: Repository<UserParkEntity>,
    @InjectRepository(ParkEntity)
    private readonly parksRepository: Repository<ParkEntity>,
    @InjectRepository(TenantEntity)
    private readonly tenantRepository: Repository<TenantEntity>,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService,
    private readonly saasModulesService: SaaSModulesService,
    private readonly configService: ConfigService
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<UserView>> {
    const queryTenantId = typeof (query as PaginationQueryDto & { tenantId?: string }).tenantId === "string" ? (query as PaginationQueryDto & { tenantId?: string }).tenantId : "";
    const queryParkId = typeof (query as PaginationQueryDto & { parkId?: string }).parkId === "string" ? (query as PaginationQueryDto & { parkId?: string }).parkId : "";
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const superUser = Boolean(actor?.isSuper || actor?.permissions.includes("*"));
    const rawBaseWhere = superUser
      ? {
          ...(queryTenantId ? { tenantId: queryTenantId } : {}),
          ...(queryParkId ? { parkId: queryParkId } : {}),
          isDeleted: false,
          ...statusWhere
        }
      : {
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          isDeleted: false,
          ...statusWhere
        };
    const baseWhere = superUser
      ? rawBaseWhere
      : await this.dataScopeService.buildFindWhere<UserEntity>(scope, actor, "tenant", rawBaseWhere, { tenant: "tenantId", park: "parkId" });
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
    const views = await this.toViews(items);
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "system", "user", views);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateUserDto): Promise<UserView> {
    const targetScope = await this.resolveUserTargetScope(scope, actor, dto.tenantId, dto.parkId);
    await this.assertUsernameAvailable(targetScope, dto.username);
    await this.assertTenantUserLimit(targetScope);
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    const user = await this.usersRepository.save(
      this.usersRepository.create({
        username: dto.username,
        displayName: dto.displayName,
        passwordHash,
        mobile: dto.mobile ?? null,
        email: dto.email ?? null,
        avatarUrl: dto.avatarUrl ?? null,
        gender: dto.gender ?? null,
        isEnabled: dto.status !== "disabled",
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        tenantId: targetScope.tenantId,
        parkId: targetScope.parkId,
        createBy: actor.sub,
        updateBy: actor.sub
      })
    );
    await this.syncUserParks(user.id, targetScope.tenantId, targetScope.parkId, dto.accessibleParkIds, actor.sub);
    const [view] = await this.toViews([user]);
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return view;
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

  findLoginCandidatesByUsername(username: string): Promise<UserEntity[]> {
    return this.usersRepository.find({
      where: {
        username,
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
      },
      order: { tenantId: "ASC", parkId: "ASC", createTime: "ASC" }
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

  findByMobileInScope(mobile: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.usersRepository.findOne({
      where: {
        mobile,
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

  async listLoginUsersByMobile(tenantId: string, mobile: string, parkId?: string): Promise<UserEntity[]> {
    return this.usersRepository.find({
      where: {
        tenantId,
        ...(parkId ? { parkId } : {}),
        mobile,
        isDeleted: false,
        isEnabled: true
      },
      relations: {
        roleLinks: {
          role: {
            permissionLinks: {
              permission: true
            }
          }
        }
      },
      order: { parkId: "ASC", createTime: "ASC" }
    });
  }

  toLoginContextCandidate(user: UserEntity): UserLoginContextCandidate {
    return {
      id: user.id,
      username: user.username,
      realName: user.displayName,
      tenantId: user.tenantId,
      parkId: user.parkId,
      mobile: user.mobile
    };
  }

  async getEntityInScope(scope: TenantParkScope, id: string): Promise<UserEntity> {
    const user = await this.findByIdInScope(id, scope);
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async detail(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<UserView> {
    const user = await this.getEntityForActor(scope, id, actor);
    const [view] = await this.toViews([user]);
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "system", "user", view) as Promise<UserView>;
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
    const principal = this.buildJwtPrincipal(user);
    const activeRoleLinks = user.roleLinks.filter((link) => !link.isDeleted && !link.role.isDeleted && link.role.isEnabled);
    const activePermissionEntities = activeRoleLinks.flatMap((link) =>
      link.role.permissionLinks
        .filter((permissionLink) => !permissionLink.isDeleted && !permissionLink.permission.isDeleted && permissionLink.permission.isEnabled)
        .map((permissionLink) => permissionLink.permission)
    );
    const { permissions } = principal;
    const dataScope = principal.dataScope ?? "self";
    const isSuper = principal.isSuper ?? false;
    const menuTree = this.buildPermissionMenuTree(activePermissionEntities, permissions);
    const accessibleParks = await this.resolveAccessibleParks(user.id, user.tenantId);
    const currentPark = accessibleParks.find((park) => park.is_default) ?? accessibleParks[0] ?? null;
    const fieldPolicies = await this.fieldPolicyService.getUserFieldPolicies(scope, principal);
    const dataScopes = await this.dataScopeService.getUserDataScopes(scope, principal);
    const enabledModules = await this.saasModulesService.listEnabledModulesForTenant(user.tenantId, user.parkId);
    const securedSelf = await this.fieldPolicyService.applyFieldPolicies(
      scope,
      principal,
      "system",
      "user",
      {
        mobile: user.mobile,
        email: user.email
      }
    );

    return {
      id: user.id,
      username: user.username,
      real_name: user.displayName,
      mobile: (securedSelf.mobile as string | null | undefined) ?? null,
      email: (securedSelf.email as string | null | undefined) ?? null,
      avatar_url: user.avatarUrl,
      gender: user.gender,
      last_login_ip: user.lastLoginIp,
      last_login_time: user.lastLoginTime?.toISOString() ?? null,
      tenant_id: currentPark?.tenant_id ?? user.tenantId,
      park_id: currentPark?.park_id ?? user.parkId,
      park_name: currentPark?.park_name ?? "当前园区",
      accessible_parks: accessibleParks,
      current_park: currentPark,
      org_id: primaryOrg?.orgId ?? null,
      org_name: primaryOrg?.org?.orgName ?? null,
      roles: activeRoleLinks.map((link) => ({ role_code: link.role.code, role_name: link.role.name })),
      permissions,
      menu_tree: menuTree,
      menus: menuTree,
      data_scope: dataScope,
      data_scopes: dataScopes,
      field_permissions: [],
      field_policies: fieldPolicies,
      enabled_modules: enabledModules,
      is_super: isSuper
    };
  }

  async resolveJwtPrincipal(scope: TenantParkScope, id: string): Promise<JwtPrincipal> {
    const user = await this.getEntityInScope(scope, id);
    if (!user.isEnabled || user.status !== "enabled") {
      throw new NotFoundException("User not found");
    }
    return this.buildJwtPrincipal(user);
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdateUserDto): Promise<UserView> {
    const user = await this.getEntityForActor(scope, id, actor);
    const targetScope = await this.resolveUserTargetScope({ tenantId: user.tenantId, parkId: user.parkId }, actor, dto.tenantId, dto.parkId);
    if (targetScope.tenantId !== user.tenantId || targetScope.parkId !== user.parkId) {
      await this.assertUsernameAvailable(targetScope, user.username);
    }
    Object.assign(user, {
      tenantId: targetScope.tenantId,
      parkId: targetScope.parkId,
      displayName: dto.displayName ?? user.displayName,
      mobile: dto.mobile ?? user.mobile,
      email: dto.email ?? user.email,
      avatarUrl: dto.avatarUrl ?? user.avatarUrl,
      gender: dto.gender ?? user.gender,
      status: dto.status ?? user.status,
      isEnabled: dto.status ? dto.status === "enabled" : user.isEnabled,
      remark: dto.remark ?? user.remark,
      updateBy: actor.sub
    });
    const saved = await this.usersRepository.save(user);
    if (dto.accessibleParkIds !== undefined || dto.parkId !== undefined || dto.tenantId !== undefined) {
      await this.syncUserParks(saved.id, targetScope.tenantId, targetScope.parkId, dto.accessibleParkIds, actor.sub);
    }
    const [view] = await this.toViews([saved]);
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return view;
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
    Object.assign(user, clearPasswordLockoutState());
    user.updateBy = actorId;
    await this.usersRepository.save(user);
    return { id };
  }

  async recordSuccessfulLogin(scope: TenantParkScope, id: string, ipAddress: string | null): Promise<void> {
    await this.usersRepository.update(
      { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      { lastLoginIp: ipAddress, lastLoginTime: new Date() }
    );
  }

  async recordPasswordFailure(user: UserEntity, config: PasswordLockoutConfig, now = new Date()): Promise<PasswordFailureRecordResult> {
    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return { user, lockoutTriggered: false };
      }
      if (this.isPasswordLocked(lockedUser, now)) {
        return { user: lockedUser, lockoutTriggered: false };
      }

      const currentState = resetExpiredPasswordLock(this.toPasswordLockoutState(lockedUser), now);
      const result = evaluatePasswordFailure(currentState, config, now);
      Object.assign(lockedUser, result.state);
      const savedUser = await repository.save(lockedUser);
      return { user: savedUser, lockoutTriggered: result.lockoutTriggered };
    });
  }

  async clearPasswordFailures(userId: string): Promise<void> {
    const state = clearPasswordLockoutState();
    await this.usersRepository.update({ id: userId, isDeleted: false }, state);
  }

  isPasswordLocked(user: UserEntity, now: Date): boolean {
    return isPasswordLocked(this.toPasswordLockoutState(user), now);
  }

  async refreshPasswordLockoutState(user: UserEntity, now = new Date()): Promise<UserEntity> {
    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return user;
      }

      const currentState = this.toPasswordLockoutState(lockedUser);
      const state = resetExpiredPasswordLock(currentState, now);
      if (this.samePasswordLockoutState(currentState, state)) {
        return Object.assign(user, currentState);
      }
      Object.assign(lockedUser, state);
      await repository.save(lockedUser);
      return Object.assign(user, state);
    });
  }

  async finalizePasswordLoginSuccess(user: UserEntity, config: PasswordLockoutConfig, now = new Date()): Promise<PasswordLoginSuccessResult> {
    if (!config.enabled) {
      return { user, allowed: true, lockoutActive: false };
    }
    const expectedState = this.toPasswordLockoutState(user);

    return this.usersRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserEntity);
      const lockedUser = await repository.findOne({
        where: { id: user.id, tenantId: user.tenantId, parkId: user.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!lockedUser) {
        return { user, allowed: false, lockoutActive: false };
      }

      const currentState = this.toPasswordLockoutState(lockedUser);
      const latestState = resetExpiredPasswordLock(currentState, now);
      if (!this.samePasswordLockoutState(currentState, latestState)) {
        Object.assign(lockedUser, latestState);
        await repository.save(lockedUser);
      }
      Object.assign(user, latestState);

      const lockoutActive = isPasswordLocked(latestState, now);
      if (lockoutActive || !this.samePasswordLockoutState(latestState, expectedState)) {
        return { user, allowed: false, lockoutActive };
      }

      if (!config.resetOnSuccess) {
        return { user, allowed: true, lockoutActive: false };
      }

      const clearState = clearPasswordLockoutState();
      Object.assign(lockedUser, clearState);
      await repository.save(lockedUser);
      return { user: Object.assign(user, clearState), allowed: true, lockoutActive: false };
    });
  }

  async clearExpiredPasswordLockIfNeeded(user: UserEntity, now = new Date()): Promise<UserEntity> {
    return this.refreshPasswordLockoutState(user, now);
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

  private async getEntityForActor(scope: TenantParkScope, id: string, actor?: JwtPrincipal): Promise<UserEntity> {
    if (actor?.isSuper || actor?.permissions.includes("*")) {
      const user = await this.usersRepository.findOne({ where: { id, isDeleted: false } });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      return user;
    }
    return this.getEntityInScope(scope, id);
  }

  private async resolveUserTargetScope(
    fallbackScope: TenantParkScope,
    actor: JwtPrincipal,
    tenantId?: string,
    parkId?: string
  ): Promise<TenantParkScope> {
    if (!(actor.isSuper || actor.permissions.includes("*"))) {
      return fallbackScope;
    }
    const resolvedTenantId = tenantId?.trim() || fallbackScope.tenantId;
    const resolvedParkId = parkId?.trim() || (await this.resolveTenantDefaultParkId(resolvedTenantId));
    await this.assertParkBelongsToTenant(resolvedTenantId, resolvedParkId);
    return { tenantId: resolvedTenantId, parkId: resolvedParkId };
  }

  private async resolveTenantDefaultParkId(tenantId: string): Promise<string> {
    const tenant = await this.tenantRepository.findOne({ where: { tenantId, isDeleted: false } });
    const configuredParkId = tenant?.featureConfig?.defaultParkId;
    if (typeof configuredParkId === "string" && configuredParkId.trim()) {
      const configuredPark = await this.parksRepository.findOne({ where: { tenantId, parkId: configuredParkId.trim(), isDeleted: false } });
      if (configuredPark) {
        return configuredPark.parkId;
      }
    }
    const park = await this.parksRepository.findOne({ where: { tenantId, isDeleted: false }, order: { createTime: "ASC" } });
    if (!park) {
      throw new NotFoundException("Tenant park not found");
    }
    return park.parkId;
  }

  private async assertParkBelongsToTenant(tenantId: string, parkId: string): Promise<void> {
    const exists = await this.parksRepository.exists({ where: { tenantId, parkId, isDeleted: false } });
    if (!exists) {
      throw new NotFoundException("Park not found in target tenant");
    }
  }

  private async syncUserParks(
    userId: string,
    tenantId: string,
    defaultParkId: string,
    requestedParkIds: string[] | undefined,
    actorId: string
  ): Promise<void> {
    const parkIds = [...new Set([defaultParkId, ...(requestedParkIds ?? [])].map((item) => item.trim()).filter(Boolean))];
    const parks = await this.parksRepository.find({ where: { tenantId, parkId: In(parkIds), isDeleted: false } });
    if (parks.length !== parkIds.length) {
      throw new NotFoundException("Accessible park not found in target tenant");
    }
    await this.userParkRepository.update({ userId, isDeleted: false }, { isDeleted: true, updateBy: actorId });
    await this.userParkRepository.save(
      parkIds.map((parkId) =>
        this.userParkRepository.create({
          userId,
          tenantId,
          parkId,
          isDefault: parkId === defaultParkId,
          status: "enabled",
          createBy: actorId,
          updateBy: actorId,
          remark: "User login context binding"
        })
      )
    );
  }

  private resolveLoginContextStatus(
    user: UserEntity,
    tenant: TenantEntity | null,
    park: ParkEntity | null,
    explicitLinks: UserParkEntity[]
  ): UserView["loginContextStatus"] {
    if (!tenant || tenant.status === 0) {
      return "tenant_disabled";
    }
    if (tenant.status === 2 || (tenant.expireTime && tenant.expireTime.getTime() <= Date.now())) {
      return "tenant_expired";
    }
    if (!park) {
      return "missing_default_park";
    }
    const hasDefaultAccess = explicitLinks.length === 0 || explicitLinks.some((link) => link.parkId === user.parkId && link.status === "enabled");
    return hasDefaultAccess ? "ready" : "default_park_not_accessible";
  }

  private async assertUsernameAvailable(scope: TenantParkScope, username: string): Promise<void> {
    const exists = await this.usersRepository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, username, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Username already exists");
    }
  }

  private toPasswordLockoutState(user: UserEntity) {
    return {
      passwordFailedCount: user.passwordFailedCount,
      passwordFailedWindowStartedAt: user.passwordFailedWindowStartedAt,
      passwordLockedUntil: user.passwordLockedUntil,
      lastPasswordFailedAt: user.lastPasswordFailedAt
    };
  }

  private samePasswordLockoutState(left: ReturnType<UsersService["toPasswordLockoutState"]>, right: ReturnType<UsersService["toPasswordLockoutState"]>): boolean {
    return (
      left.passwordFailedCount === right.passwordFailedCount &&
      left.passwordFailedWindowStartedAt?.getTime() === right.passwordFailedWindowStartedAt?.getTime() &&
      left.passwordLockedUntil?.getTime() === right.passwordLockedUntil?.getTime() &&
      left.lastPasswordFailedAt?.getTime() === right.lastPasswordFailedAt?.getTime()
    );
  }

  private async assertTenantUserLimit(scope: TenantParkScope): Promise<void> {
    const tenant = await this.tenantRepository.findOne({ where: { tenantId: scope.tenantId, isDeleted: false } });
    if (!tenant?.maxUsers) {
      return;
    }
    const currentUsers = await this.usersRepository.count({
      where: { tenantId: scope.tenantId, isDeleted: false }
    });
    if (currentUsers >= tenant.maxUsers) {
      throw new BadRequestException("Tenant user limit exceeded");
    }
  }

  private async toViews(users: UserEntity[]): Promise<UserView[]> {
    if (users.length === 0) {
      return [];
    }
    const tenantIds = [...new Set(users.map((user) => user.tenantId))];
    const parkIds = [...new Set(users.map((user) => user.parkId))];
    const [tenants, parks, parkLinks] = await Promise.all([
      this.tenantRepository.find({ where: { tenantId: In(tenantIds), isDeleted: false } }),
      this.parksRepository.find({ where: { tenantId: In(tenantIds), parkId: In(parkIds), isDeleted: false } }),
      this.userParkRepository.find({ where: { userId: In(users.map((user) => user.id)), isDeleted: false, status: "enabled" }, order: { isDefault: "DESC", createTime: "ASC" } })
    ]);
    const tenantMap = new Map(tenants.map((tenant) => [tenant.tenantId, tenant]));
    const parkMap = new Map(parks.map((park) => [`${park.tenantId}:${park.parkId}`, park]));
    const accessibleByUser = new Map<string, UserParkContext[]>();
    await Promise.all(
      users.map(async (user) => {
        accessibleByUser.set(user.id, await this.resolveAccessibleParks(user.id, user.tenantId));
      })
    );

    return users.map((user) => {
      const tenant = tenantMap.get(user.tenantId) ?? null;
      const park = parkMap.get(`${user.tenantId}:${user.parkId}`) ?? null;
      const accessibleParks = accessibleByUser.get(user.id) ?? [];
      const explicitLinks = parkLinks.filter((link) => link.userId === user.id && link.tenantId === user.tenantId);
      return {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        mobile: user.mobile,
        email: user.email,
        avatarUrl: user.avatarUrl,
        gender: user.gender,
        lastLoginIp: user.lastLoginIp,
        lastLoginTime: user.lastLoginTime,
        isEnabled: user.isEnabled,
        status: user.status,
        tenantId: user.tenantId,
        parkId: user.parkId,
        tenantName: tenant?.tenantName ?? null,
        parkName: park?.parkName ?? null,
        accessibleParks,
        loginContextStatus: this.resolveLoginContextStatus(user, tenant, park, explicitLinks),
        createTime: user.createTime,
        updateTime: user.updateTime,
        remark: user.remark
      };
    });
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
      "role:read": ["system:role:list", "system:role:detail"],
      "role:create": ["system:role:create"],
      "role:update": ["system:role:update", "system:role:assign-permissions"],
      "role:copy": ["system:role:create"],
      "role:disable": ["system:role:update"],
      "role:delete": ["system:role:delete"],
      "tenant:read": ["system:read"],
      "tenant:manage": ["system:update"],
      "system:permission:list": ["system:read", "permission:read"],
      "system:permission:tree": ["system:read", "permission:read"],
      "system:permission:create": ["permission:create"],
      "system:permission:update": ["permission:update"],
      "system:permission:delete": ["permission:delete"],
      "permission:read": ["system:permission:list", "system:permission:tree"],
      "permission:create": ["system:permission:create"],
      "permission:update": ["system:permission:update"],
      "permission:delete": ["system:permission:delete"],
      "system:data-scope:read": ["system:read", "data_scope:read", "data-scope:read"],
      "system:data-scope:create": ["data_scope:create", "data-scope:create"],
      "system:data-scope:update": ["data_scope:update", "data-scope:update"],
      "system:data-scope:delete": ["data_scope:delete", "data-scope:delete"],
      "system:data-scope:assign": ["role:assign_data_scope", "data-scope:assign", "role:update"],
      "data_scope:read": ["system:data-scope:read", "system:read"],
      "data_scope:create": ["system:data-scope:create"],
      "data_scope:update": ["system:data-scope:update"],
      "data_scope:delete": ["system:data-scope:delete"],
      "role:assign_data_scope": ["system:data-scope:assign", "role:update"],
      "system:field-policy:read": ["system:read", "field_policy:read", "field-policy:read"],
      "system:field-policy:create": ["field_policy:create", "field-policy:create"],
      "system:field-policy:update": ["field_policy:update", "field-policy:update"],
      "system:field-policy:delete": ["field_policy:delete", "field-policy:delete"],
      "system:field-policy:assign": ["role:assign_field_policy", "field-policy:assign", "role:update"],
      "field_policy:read": ["system:field-policy:read", "system:read"],
      "field_policy:create": ["system:field-policy:create"],
      "field_policy:update": ["system:field-policy:update"],
      "field_policy:delete": ["system:field-policy:delete"],
      "role:assign_field_policy": ["system:field-policy:assign", "role:update"],
      "system:code-rule:read": ["system:read", "code_rule:read"],
      "system:code-rule:create": ["system:update", "code_rule:create"],
      "system:code-rule:update": ["system:update", "code_rule:update"],
      "system:code-rule:delete": ["system:update"],
      "system:code-rule:generate": ["system:update", "code_rule:generate"],
      "code_rule:read": ["system:code-rule:read", "system:read"],
      "code_rule:create": ["system:code-rule:create"],
      "code_rule:update": ["system:code-rule:update"],
      "code_rule:generate": ["system:code-rule:generate"],
      "system:module:read": ["system:read", "module:read"],
      "system:module:create": ["system:update", "module:manage"],
      "system:module:update": ["system:update", "module:manage"],
      "module:read": ["system:module:read", "system:read"],
      "module:manage": ["system:module:create", "system:module:update", "system:update"],
      "system:plan:read": ["system:read", "plan:read"],
      "system:plan:create": ["system:update", "plan:manage"],
      "system:plan:update": ["system:update", "plan:manage"],
      "plan:read": ["system:plan:read", "system:read"],
      "plan:manage": ["system:plan:create", "system:plan:update", "system:update"],
      "system:tenant-module:read": ["system:read", "tenant_module:read"],
      "system:tenant-module:assign": ["system:update", "tenant_module:manage"],
      "tenant_module:read": ["system:tenant-module:read", "system:read"],
      "tenant_module:manage": ["system:tenant-module:assign", "system:update"],
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
      "system:attachment:delete": ["file:delete"],
      "park:read": ["asset:read"],
      "park:create": ["asset:create"],
      "park:update": ["asset:update"],
      "park:delete": ["asset:delete"],
      "building:read": ["asset:read"],
      "building:create": ["asset:create"],
      "building:update": ["asset:update"],
      "building:delete": ["asset:delete"],
      "floor:read": ["asset:read"],
      "floor:create": ["asset:create"],
      "floor:update": ["asset:update"],
      "floor:delete": ["asset:delete"],
      "floor:upload_layout": ["asset:update", "file:upload"],
      "unit:read": ["asset:read"],
      "unit:create": ["asset:create"],
      "unit:update": ["asset:update", "file:upload"],
      "unit:delete": ["asset:delete"],
      "unit:transition_status": ["asset:update"],
      "unit:change_status": ["asset:update"],
      "unit:force_change_status": ["asset:update"],
      "unit:status_log": ["asset:read"],
      "unit:import": ["asset:create"],
      "unit:import_template": ["asset:create"],
      "unit:export": ["asset:read"],
      "asset:status_board": ["asset:read", "unit:read"],
      "asset:statistics": ["asset:read"],
      "asset:statistics:read": ["asset:read"],
      "asset:park:list": ["asset:read", "park:read"],
      "asset:park:create": ["asset:create", "park:create"],
      "asset:park:update": ["asset:update", "park:update"],
      "asset:park:delete": ["asset:delete", "park:delete"],
      "asset:building:list": ["asset:read", "building:read"],
      "asset:building:create": ["asset:create", "building:create"],
      "asset:building:update": ["asset:update", "building:update"],
      "asset:building:delete": ["asset:delete", "building:delete"],
      "asset:floor:list": ["asset:read", "floor:read"],
      "asset:floor:create": ["asset:create", "floor:create"],
      "asset:floor:update": ["asset:update", "floor:update"],
      "asset:floor:delete": ["asset:delete", "floor:delete"],
      "asset:unit:list": ["asset:read", "unit:read"],
      "asset:unit:create": ["asset:create", "unit:create"],
      "asset:unit:update": ["asset:update", "unit:update"],
      "asset:unit:delete": ["asset:delete", "unit:delete"]
    };
    return [...new Set(permissions.flatMap((permission) => [permission, ...(aliases[permission] ?? [])]))];
  }

  private async resolveAccessibleParks(userId: string, tenantId: string): Promise<UserParkContext[]> {
    let links = await this.userParkRepository.find({
      where: {
        tenantId,
        userId,
        isDeleted: false,
        status: "enabled"
      },
      order: { isDefault: "DESC", createTime: "ASC" }
    });

    if (links.length === 0) {
      links = await this.userParkRepository.find({
        where: {
          userId,
          isDeleted: false,
          status: "enabled"
        },
        order: { isDefault: "DESC", createTime: "ASC" }
      });
    }

    const activeLinks = links.length > 0 ? links : [];
    if (activeLinks.length === 0) {
      return [];
    }

    const parkIds = [...new Set(activeLinks.map((link) => link.parkId))];
    const tenantIds = [...new Set(activeLinks.map((link) => link.tenantId))];
    const parks = await this.parksRepository.find({
      where: {
        tenantId: In(tenantIds),
        parkId: In(parkIds),
        isDeleted: false
      }
    });
    const parkMap = new Map(parks.map((park) => [`${park.tenantId}:${park.parkId}`, park]));

    return activeLinks.flatMap((link) => {
      const park = parkMap.get(`${link.tenantId}:${link.parkId}`);
      if (!park) {
        return [];
      }
      return {
        tenant_id: link.tenantId,
        park_id: link.parkId,
        park_code: park.parkCode,
        park_name: park.parkName,
        is_default: link.isDefault,
        status: link.status
      };
    });
  }

  private resolveDataScope(scopes: string[]): string {
    const normalize = (scope: string): string =>
      ({ "10": "self", "20": "org", "30": "org_and_children", "40": "park", "50": "tenant", "60": "custom" })[scope] ?? scope;
    const rank: Record<string, number> = { self: 1, org: 2, org_and_children: 3, park: 4, tenant: 5, custom: 6, all: 7 };
    return scopes
      .map(normalize)
      .reduce((current, scope) => ((rank[scope] ?? 0) > (rank[current] ?? 0) ? scope : current), "self");
  }

  private buildJwtPrincipal(user: UserEntity): JwtPrincipal {
    const activeRoleLinks = user.roleLinks.filter(
      (link) => !link.isDeleted && !link.role.isDeleted && link.role.isEnabled
    );
    const basePermissions = activeRoleLinks.flatMap((link) =>
      link.role.permissionLinks
        .filter(
          (permissionLink) =>
            !permissionLink.isDeleted &&
            !permissionLink.permission.isDeleted &&
            permissionLink.permission.isEnabled
        )
        .map((permissionLink) => permissionLink.permission.code)
    );
    const isSuper = activeRoleLinks.some((link) => link.role.isSuper) || basePermissions.includes("*");
    const permissions = isSuper ? ["*"] : this.expandPermissionAliases([...new Set(basePermissions)]);

    return {
      sub: user.id,
      username: user.username,
      realName: user.displayName,
      tenantId: user.tenantId,
      parkId: user.parkId,
      roles: activeRoleLinks.map((link) => link.role.code),
      permissions,
      dataScope: isSuper ? "all" : this.resolveDataScope(activeRoleLinks.map((link) => link.role.dataScope)),
      isSuper
    };
  }

  private buildMenuTree(permissions: string[]): UserMenuTreeNode[] {
    const granted = new Set(permissions);
    const filter = (nodes: UserMenuTreeNode[]): UserMenuTreeNode[] =>
      nodes.reduce<UserMenuTreeNode[]>((items, node) => {
        const children = node.children ? filter(node.children) : undefined;
        if (!this.canAccessMenuNode(granted, node) && (!children || children.length === 0)) {
          return items;
        }
        items.push({ ...node, children });
        return items;
      }, []);
    return filter(USER_MENU_TREE);
  }

  private buildPermissionMenuTree(permissions: PermissionEntity[], permissionCodes: string[]): UserMenuTreeNode[] {
    const granted = new Set(permissionCodes);
    const menuPermissions = permissions
      .filter((permission) => permission.visible && permission.isEnabled && !permission.isDeleted)
      .filter((permission) => permission.permType === 10 || permission.permType === 20)
      .sort((left, right) => (left.level - right.level) || (left.sortNo - right.sortNo) || left.createTime.getTime() - right.createTime.getTime());

    if (menuPermissions.length === 0 || granted.has("*")) {
      const seededMenu = this.buildSeededMenuTree(menuPermissions, granted);
      return seededMenu.length > 0 ? seededMenu : this.buildMenuTree(permissionCodes);
    }

    const seededMenu = this.buildSeededMenuTree(menuPermissions, granted);
    return seededMenu.length > 0 ? seededMenu : this.buildMenuTree(permissionCodes);
  }

  private buildSeededMenuTree(menuPermissions: PermissionEntity[], granted: Set<string>): UserMenuTreeNode[] {
    const childrenByParent = new Map<string | null, PermissionEntity[]>();
    for (const permission of menuPermissions) {
      const siblings = childrenByParent.get(permission.parentId) ?? [];
      siblings.push(permission);
      childrenByParent.set(permission.parentId, siblings);
    }

    const toNode = (permission: PermissionEntity): UserMenuTreeNode => {
      const children = (childrenByParent.get(permission.id) ?? []).map(toNode).filter((child) => this.canAccessMenuNode(granted, child) || Boolean(child.children?.length));
      const node: UserMenuTreeNode = {
        label: permission.name,
        href: permission.frontendRoute ?? undefined,
        permission: this.resolveMenuPermission(permission.frontendRoute ?? undefined, permission.code),
        module: this.inferModuleCode(permission.frontendRoute ?? undefined, permission.code),
        icon: permission.icon ?? undefined,
        children: children.length > 0 ? children : undefined
      };
      return node;
    };

    const roots = (childrenByParent.get(null) ?? []).map(toNode).filter((node) => this.canAccessMenuNode(granted, node) || Boolean(node.children?.length));
    const hasNavigableNode = roots.some((node) => node.href || node.children?.some((child) => child.href));
    return hasNavigableNode ? roots : [];
  }

  private canAccessMenuNode(granted: Set<string>, node: UserMenuTreeNode): boolean {
    if (granted.has("*")) {
      return true;
    }
    if (node.href === "/safety/emergency-dashboard") {
      return granted.has("safety_emergency_statistics:read") && granted.has("safety_work_permit_statistics:read");
    }
    if (!node.permission) {
      return true;
    }
    return granted.has(node.permission);
  }

  private resolveMenuPermission(frontendRoute: string | undefined, permissionCode: string): string {
    if (frontendRoute === "/operations/terminal") {
      return "safety_inspect_task:my";
    }
    if (frontendRoute === "/safety/hazards/overdue") {
      return "safety_hazard:overdue";
    }
    if (frontendRoute === "/safety/emergency-dashboard") {
      return "safety_emergency_statistics:read";
    }
    return permissionCode;
  }

  private inferModuleCode(frontendRoute?: string, permissionCode?: string): string | undefined {
    if (frontendRoute?.startsWith("/system") || permissionCode?.startsWith("system") || permissionCode?.startsWith("module:") || permissionCode?.startsWith("plan:")) {
      return "system";
    }
    if (frontendRoute?.startsWith("/assets") || permissionCode?.startsWith("asset") || permissionCode?.startsWith("unit:") || permissionCode?.startsWith("park:") || permissionCode?.startsWith("building:") || permissionCode?.startsWith("floor:")) {
      return "asset";
    }
    if (
      frontendRoute?.startsWith("/leasing") ||
      frontendRoute?.startsWith("/invest") ||
      frontendRoute?.startsWith("/contracts") ||
      frontendRoute?.startsWith("/finance") ||
      permissionCode?.startsWith("park_tenant:") ||
      permissionCode?.startsWith("park_tenant_contact:") ||
      permissionCode?.startsWith("park_tenant_qualification:") ||
      permissionCode?.startsWith("leasing_lead:") ||
      permissionCode?.startsWith("leasing_lead_pool:") ||
      permissionCode?.startsWith("leasing_follow:") ||
      permissionCode?.startsWith("leasing_visit:") ||
      permissionCode?.startsWith("leasing_quote:") ||
      permissionCode?.startsWith("leasing_contract:") ||
      permissionCode?.startsWith("leasing_contract_unit:") ||
      permissionCode?.startsWith("leasing_contract_change:") ||
      permissionCode?.startsWith("leasing_checkout:") ||
      permissionCode?.startsWith("leasing_refund:") ||
      permissionCode?.startsWith("leasing_receivable:") ||
      permissionCode?.startsWith("leasing_payment:") ||
      permissionCode?.startsWith("leasing_waiver:") ||
      permissionCode?.startsWith("leasing_invoice:") ||
      permissionCode?.startsWith("leasing_statistics:")
    ) {
      return "leasing";
    }
    if (frontendRoute?.startsWith("/workorders") || permissionCode?.startsWith("workorder")) {
      return "workorder";
    }
    if (frontendRoute?.startsWith("/safety") || permissionCode?.startsWith("safety")) {
      return "safety";
    }
    if (frontendRoute?.startsWith("/iot") || permissionCode?.startsWith("iot")) {
      return "iot";
    }
    if (frontendRoute?.startsWith("/energy") || permissionCode?.startsWith("energy")) {
      return "energy";
    }
    if (frontendRoute?.startsWith("/robots") || permissionCode?.startsWith("robot")) {
      return "robot";
    }
    if (frontendRoute?.startsWith("/video") || permissionCode?.startsWith("video")) {
      return "video";
    }
    if (frontendRoute?.startsWith("/cockpit") || permissionCode?.startsWith("cockpit")) {
      return "cockpit";
    }
    if (frontendRoute?.startsWith("/bim") || permissionCode?.startsWith("bim")) {
      return "bim";
    }
    if (frontendRoute?.startsWith("/ai") || permissionCode?.startsWith("ai")) {
      return "ai";
    }
    return undefined;
  }
}

const USER_MENU_TREE: UserMenuTreeNode[] = [
  {
    label: "总览",
    icon: "home",
    children: [
      { label: "首页", href: "/dashboard" }
    ]
  },
  {
    label: "经营驾驶舱",
    icon: "layout-dashboard",
    module: "cockpit",
    children: [
      { label: "经营总览", href: "/cockpit/overview", permission: "cockpit:read", module: "cockpit" }
    ]
  },
  {
    label: "资产管理",
    icon: "building-2",
    module: "asset",
    children: [
      { label: "园区管理", href: "/assets/parks", permission: "park:read", module: "asset" },
      { label: "楼栋管理", href: "/assets/buildings", permission: "building:read", module: "asset" },
      { label: "楼层管理", href: "/assets/floors", permission: "floor:read", module: "asset" },
      { label: "房间/房源管理", href: "/assets/units", permission: "unit:read", module: "asset" },
      { label: "房源状态看板", href: "/assets/unit-status-board", permission: "asset:status_board", module: "asset" },
      { label: "资产统计", href: "/assets/statistics", permission: "asset:statistics", module: "asset" }
    ]
  },
  {
    label: "招商租赁",
    icon: "file-text",
    module: "leasing",
    children: [
      { label: "租户企业档案", href: "/leasing/tenants", permission: "park_tenant:read", module: "leasing" },
      { label: "招商线索", href: "/leasing/leads", permission: "leasing_lead:read", module: "leasing" },
      { label: "公海池", href: "/leasing/lead-pool", permission: "leasing_lead_pool:read", module: "leasing" },
      { label: "招商漏斗", href: "/leasing/funnel", permission: "leasing_statistics:funnel", module: "leasing" },
      { label: "合同管理", href: "/leasing/contracts", permission: "leasing_contract:read", module: "leasing" },
      { label: "合同变更", href: "/leasing/contract-changes", permission: "leasing_contract_change:read", module: "leasing" },
      { label: "退租结算", href: "/leasing/checkouts", permission: "leasing_checkout:read", module: "leasing" },
      { label: "退款登记", href: "/leasing/refunds", permission: "leasing_refund:read", module: "leasing" },
      { label: "应收账单", href: "/leasing/receivables", permission: "leasing_receivable:read", module: "leasing" },
      { label: "收款登记", href: "/leasing/payments", permission: "leasing_payment:read", module: "leasing" },
      { label: "欠费账龄", href: "/leasing/aging", permission: "leasing_receivable:aging", module: "leasing" },
      { label: "豁免管理", href: "/leasing/waivers", permission: "leasing_waiver:read", module: "leasing" },
      { label: "发票登记", href: "/leasing/invoices", permission: "leasing_invoice:read", module: "leasing" }
    ]
  },
  {
    label: "IoT 平台",
    icon: "cpu",
    module: "iot",
    children: [
      { label: "IoT 看板", href: "/iot/dashboard", permission: "iot_dashboard:read", module: "iot" },
      { label: "网关管理", href: "/iot/gateways", permission: "iot_gateway:read", module: "iot" },
      { label: "设备管理", href: "/iot/devices", permission: "iot_device:read", module: "iot" },
      { label: "协议配置", href: "/admin/iot/protocol-configs", permission: "iot_protocol_config:read", module: "iot" },
      { label: "指标管理", href: "/iot/metrics", permission: "iot_metric:read", module: "iot" },
      { label: "告警规则", href: "/iot/alert-rules", permission: "iot_alert_rule:read", module: "iot" },
      { label: "规则引擎", href: "/admin/iot/rules", permission: "iot_rule:read", module: "iot" },
      { label: "场景联动", href: "/admin/iot/scenes", permission: "iot_scene:read", module: "iot" },
      { label: "场景模板库", href: "/admin/iot/scenes/templates", permission: "iot_scene_template:read", module: "iot" },
      { label: "设备告警", href: "/iot/alerts", permission: "iot_alert:read", module: "iot" }
    ]
  },
  {
    label: "机器人运营",
    icon: "bot",
    module: "robot",
    children: [
      { label: "机器人总览", href: "/robots/overview", permission: "robot:read", module: "robot" },
      { label: "清洁机器人", href: "/robots/cleaning", permission: "robot:read", module: "robot" }
    ]
  },
  {
    label: "视频安防",
    icon: "video",
    module: "video",
    children: [
      { label: "安防指挥中心", href: "/admin/video-security/dashboard", permission: "video_security_dashboard:read", module: "video" },
      { label: "视频点位管理", href: "/admin/video-security/cameras", permission: "video_camera:read", module: "video" },
      { label: "视频告警中心", href: "/admin/video-security/alerts", permission: "video_alert:read", module: "video" },
      { label: "视频平台配置", href: "/admin/video-security/platform-configs", permission: "video_platform_config:read", module: "video" }
    ]
  },
  {
    label: "数字孪生",
    icon: "database",
    module: "bim",
    children: [
      { label: "BIM 总览", href: "/bim/overview", permission: "bim:overview", module: "bim" }
    ]
  },
  {
    label: "AI 助手",
    icon: "brain-circuit",
    module: "ai",
    children: [
      { label: "AI 工作台", href: "/ai/assistant", permission: "ai:assistant", module: "ai" }
    ]
  },
  {
    label: "工单管理",
    icon: "wrench",
    module: "workorder",
    children: [
      { label: "工单看板", href: "/workorders", permission: "workorder:read", module: "workorder" },
      { label: "工单列表", href: "/workorders/list", permission: "workorder:read", module: "workorder" },
      { label: "SLA 规则", href: "/workorders/sla-rules", permission: "workorder_sla:read", module: "workorder" },
      { label: "超时工单", href: "/workorders/overdue", permission: "workorder:overdue", module: "workorder" },
      { label: "工单统计", href: "/workorders/stats", permission: "workorder:stats", module: "workorder" }
    ]
  },
  {
    label: "工程管理",
    icon: "hard-hat",
    module: "engineering",
    children: [
      { label: "工程看板", href: "/engineering/dashboard", permission: "ENGINEERING_DASHBOARD_VIEW", module: "engineering" },
      { label: "工程项目", href: "/engineering/projects", permission: "ENGINEERING_PROJECT_VIEW", module: "engineering" },
      { label: "工程计划", href: "/engineering/plans", permission: "ENGINEERING_PLAN_VIEW", module: "engineering" },
      { label: "施工日报", href: "/engineering/daily-reports", permission: "ENGINEERING_DAILY_REPORT_VIEW", module: "engineering" },
      { label: "工程巡检", href: "/engineering/inspections", permission: "ENGINEERING_INSPECTION_VIEW", module: "engineering" },
      { label: "整改任务", href: "/engineering/rectifications", permission: "ENGINEERING_RECTIFICATION_VIEW", module: "engineering" },
      { label: "工程验收", href: "/engineering/acceptances", permission: "ENGINEERING_ACCEPTANCE_VIEW", module: "engineering" }
    ]
  },
  {
    label: "安全管理",
    icon: "shield-alert",
    module: "safety",
    children: [
      { label: "安全看板", href: "/safety/dashboard", permission: "safety_statistics:read", module: "safety" },
      { label: "现场工作台", href: "/operations/terminal", permission: "safety_inspect_task:my", module: "safety" },
      { label: "应急作业看板", href: "/safety/emergency-dashboard", permission: "safety_emergency_statistics:read", module: "safety" },
      { label: "巡检点位", href: "/safety/inspect-points", permission: "safety_inspect_point:read", module: "safety" },
      { label: "巡检模板", href: "/safety/inspect-templates", permission: "safety_inspect_template:read", module: "safety" },
      { label: "巡检计划", href: "/safety/inspect-plans", permission: "safety_inspect_plan:read", module: "safety" },
      { label: "巡检任务", href: "/safety/inspect-tasks", permission: "safety_inspect_task:read", module: "safety" },
      { label: "我的巡检", href: "/safety/my-inspect-tasks", permission: "safety_inspect_task:my", module: "safety" },
      { label: "隐患整改", href: "/safety/hazards", permission: "safety_hazard:read", module: "safety" },
      { label: "超期隐患", href: "/safety/hazards/overdue", permission: "safety_hazard:overdue", module: "safety" },
      { label: "应急联系人", href: "/safety/emergency-contacts", permission: "safety_emergency_contact:read", module: "safety" },
      { label: "应急预案", href: "/safety/emergency-plans", permission: "safety_emergency_plan:read", module: "safety" },
      { label: "应急事件", href: "/safety/emergencies", permission: "safety_emergency:read", module: "safety" },
      { label: "作业许可", href: "/safety/work-permits", permission: "safety_work_permit:read", module: "safety" }
    ]
  },
  {
    label: "系统管理",
    icon: "shield-check",
    permission: "system:read",
    module: "system",
    children: [
      { label: "组织管理", href: "/system/orgs", permission: "org:read", module: "system" },
      { label: "用户管理", href: "/system/users", permission: "user:read", module: "system" },
      { label: "角色管理", href: "/system/roles", permission: "role:read", module: "system" },
      { label: "权限点", href: "/system/permissions", permission: "permission:read", module: "system" },
      { label: "数据权限", href: "/system/data-scopes", permission: "data_scope:read", module: "system" },
      { label: "字段权限", href: "/system/field-policies", permission: "field_policy:read", module: "system" },
      { label: "编码规则", href: "/system/code-rules", permission: "system:code-rule:read", module: "system" },
      { label: "模块授权", href: "/system/modules", permission: "module:read", module: "system" },
      { label: "字典管理", href: "/system/dicts", permission: "dict:read", module: "system" },
      { label: "附件中心", href: "/system/files", permission: "file:read", module: "system" },
      { label: "操作日志", href: "/system/audit/op-logs", permission: "audit:read", module: "system" },
      { label: "登录日志", href: "/system/audit/login-logs", permission: "audit:read", module: "system" }
    ]
  }
];
