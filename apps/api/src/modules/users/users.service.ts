import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import * as bcrypt from "bcrypt";
import type { EntityManager, Repository } from "typeorm";
import { Brackets, ILike, In } from "typeorm";
import {
  PROPERTY_BUSINESS_SURFACES,
  PROPERTY_ACCESS_MANIFEST,
  SYSTEM_PERMISSIONS,
  type EnabledModuleContext,
  type PaginatedResult,
  type PropertyBusinessModuleCode,
  type TenantParkScope,
  type UserContext,
  type UserMenuTreeNode,
  type UserParkContext,
  type UserOrgAssignment
} from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { AuthRefreshTokenEntity } from "../auth/entities/auth-refresh-token.entity";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { UserOrgEntity } from "../orgs/entities/user-org.entity";
import { OrgEntity } from "../orgs/entities/org.entity";
import { PostEntity } from "../orgs/entities/post.entity";
import { lockOrgHierarchy, lockUserOrganizationScope } from "../orgs/org-hierarchy-lock";
import { PermissionEntity } from "../permissions/entities/permission.entity";
import { ParkEntity } from "../parks/entities/park.entity";
import { RoleEntity } from "../roles/entities/role.entity";
import { evaluateRoleAssignability, isRoleAssignmentProtected, type RoleUnassignableReason } from "../roles/role-assignability";
import {
  isProtectedTenantSuperBinding,
  isProtectedTenantSuperRole
} from "../roles/protected-super-role";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import { SaaSModulesService } from "../saas-modules/saas-modules.service";
import { TenantEntity } from "../tenants/entities/tenant.entity";
import type { UserRoleCandidatesQueryDto } from "./dto/user-role-candidates-query.dto";
import {
  clearPasswordLockoutState,
  type PasswordLockoutConfig
} from "../auth/auth-password-lockout.policy";
import type { AssignParkRolesDto, AssignRolesDto } from "./dto/assign-roles.dto";
import type { CreateUserDto } from "./dto/create-user.dto";
import type { ResetPasswordDto } from "./dto/reset-password.dto";
import type { UpdateUserDto } from "./dto/update-user.dto";
import type { ReplaceUserOrgsDto } from "./dto/replace-user-orgs.dto";
import { UserEntity } from "./entities/user.entity";
import { UserParkEntity } from "./entities/user-park.entity";
import {
  expandPermissionAliases,
  IdentityDirectoryService,
  resolveDataScope,
  type PasswordFailureRecordResult,
  type PasswordLoginSuccessResult
} from "./identity-directory.service";

export type { PasswordFailureRecordResult, PasswordLoginSuccessResult } from "./identity-directory.service";

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
  roles: UserRoleView[];
  loginContextStatus: "ready" | "missing_default_park" | "default_park_not_accessible" | "tenant_disabled" | "tenant_expired";
  createTime: Date;
  updateTime: Date;
  remark: string | null;
}

export interface UserRoleView {
  id: string;
  code: string;
  name: string;
  roleScope: string;
  status: string;
  isEnabled: boolean;
  isAssignable: boolean;
  isProtected: boolean;
  unassignableReasons: RoleUnassignableReason[];
  assignabilityLabel: string;
}

export interface UserRoleContext {
  roles: UserRoleView[];
  candidates: UserRoleView[];
  candidatePage: UserRoleCandidatePage;
}

export interface UserRoleCandidatePage extends PaginatedResult<UserRoleView> {
  hasMore: boolean;
}

const MAX_ROLE_CANDIDATES = 200;

export interface UserLoginContextCandidate {
  id: string;
  username: string;
  realName: string;
  tenantId: string;
  parkId: string;
  mobile: string | null;
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
    private readonly configService: ConfigService,
    private readonly identityDirectory: IdentityDirectoryService
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto, actor?: JwtPrincipal): Promise<PaginatedResult<UserView>> {
    const queryTenantId = typeof (query as PaginationQueryDto & { tenantId?: string }).tenantId === "string" ? (query as PaginationQueryDto & { tenantId?: string }).tenantId : "";
    const queryParkId = typeof (query as PaginationQueryDto & { parkId?: string }).parkId === "string" ? (query as PaginationQueryDto & { parkId?: string }).parkId : "";
    const statusWhere =
      query.status === "enabled" ? { isEnabled: true } : query.status === "disabled" ? { isEnabled: false } : {};
    const broadUserManager = Boolean(actor?.isSuper || actor?.permissions.includes("*"));
    const platformGlobalManager = Boolean(actor && !actor.isTenantSuper && (actor.isSuper || actor.permissions.includes("*")));
    const rawBaseWhere = broadUserManager
      ? {
          ...(platformGlobalManager && queryTenantId ? { tenantId: queryTenantId } : {}),
          ...(!platformGlobalManager && actor ? { tenantId: actor.tenantId } : {}),
          ...(queryParkId ? { parkId: queryParkId } : {}),
          isDeleted: false,
          ...statusWhere
        }
      : {
          tenantId: scope.tenantId,
          isDeleted: false,
          ...statusWhere
        };
    if (!broadUserManager) {
      const builder = this.usersRepository.createQueryBuilder("usr")
        .where("usr.tenant_id = :tenantId", { tenantId: scope.tenantId })
        .andWhere("usr.is_deleted = false")
        .andWhere(new Brackets((access) => {
          access.where("usr.park_id = :parkId", { parkId: scope.parkId })
            .orWhere(`EXISTS (
              SELECT 1 FROM rel_user_park access
               WHERE access.user_id = usr.id
                 AND access.tenant_id = :tenantId
                 AND access.park_id = :parkId
                 AND access.status = 'enabled'
                 AND access.is_deleted = false
            )`);
        }));
      if (query.status === "enabled") builder.andWhere("usr.is_enabled = true");
      if (query.status === "disabled") builder.andWhere("usr.is_enabled = false");
      if (query.keyword) {
        builder.andWhere(new Brackets((keyword) => {
          keyword.where("usr.username ILIKE :keyword", { keyword: `%${query.keyword}%` })
            .orWhere("usr.display_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        }));
      }
      await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant", "usr", { tenant: "tenant_id" });
      const [items, total] = await builder.orderBy("usr.create_time", "DESC")
        .skip((query.page - 1) * query.page_size)
        .take(query.page_size)
        .getManyAndCount();
      const views = await this.toViews(items, this.canViewRoleDiagnostics(actor), scope.parkId);
      const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "system", "user", views);
      return { items: securedItems, total, page: query.page, page_size: query.page_size };
    }
    const baseWhere = rawBaseWhere;
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
    const views = await this.toViews(items, this.canViewRoleDiagnostics(actor));
    const securedItems = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "system", "user", views);
    return { items: securedItems, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreateUserDto): Promise<UserView> {
    const targetScope = await this.resolveUserTargetScope(scope, actor, dto.tenantId, dto.parkId);
    await this.assertUsernameAvailable(targetScope, dto.username);
    await this.assertTenantUserLimit(targetScope);
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    const user = await this.usersRepository.manager.transaction(async (manager) => {
      const assignments = dto.assignments ?? [];
      this.assertOrgAssignmentShape(assignments);
      if (assignments.length > 0) {
        await lockOrgHierarchy(manager, targetScope);
      }
      const usersRepository = manager.getRepository(UserEntity);
      const savedUser = await usersRepository.save(usersRepository.create({
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
      }));
      await this.syncUserParks(
        savedUser.id,
        targetScope.tenantId,
        targetScope.parkId,
        dto.accessibleParkIds,
        actor.sub,
        manager
      );
      await this.assertOrgAssignments(targetScope, actor, assignments, manager, []);
      if (assignments.length > 0) {
        const repository = manager.getRepository(UserOrgEntity);
        await repository.save(assignments.map((item) => repository.create({
          userId: savedUser.id,
          orgId: item.orgId,
          postId: item.postId ?? null,
          isPrimary: item.isPrimary,
          tenantId: targetScope.tenantId,
          parkId: targetScope.parkId,
          createBy: actor.sub,
          updateBy: actor.sub
        })));
      }
      return savedUser;
    });
    const [view] = await this.toViews([user], this.canViewRoleDiagnostics(actor));
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return view;
  }

  findByUsernameInScope(username: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.identityDirectory.findByUsernameInScope(username, scope);
  }

  findLoginCandidatesByUsername(username: string): Promise<UserEntity[]> {
    return this.identityDirectory.findLoginCandidatesByUsername(username);
  }

  findByIdInScope(id: string, scope: TenantParkScope): Promise<UserEntity | null> {
    return this.identityDirectory.findByIdInScope(id, scope);
  }

  findByIdForIdentity(id: string, tenantId: string): Promise<UserEntity | null> {
    return this.identityDirectory.findByIdForIdentity(id, tenantId);
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
    return this.identityDirectory.listLoginUsersByMobile(tenantId, mobile, parkId);
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
    const broadRoleDiagnostics = Boolean(actor?.isSuper || actor?.permissions.includes("*"));
    const [view] = await this.toViews([user], this.canViewRoleDiagnostics(actor), broadRoleDiagnostics ? undefined : scope.parkId);
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "system", "user", view) as Promise<UserView>;
  }

  async listOrgAssignments(scope: TenantParkScope, actor: JwtPrincipal, id: string): Promise<UserOrgAssignment[]> {
    const user = await this.getEntityForActor(scope, id, actor);
    const targetScope = { tenantId: user.tenantId, parkId: user.parkId };
    return this.listOrgAssignmentsInScope(targetScope, actor, id, this.userOrgRepository.manager);
  }

  private async listOrgAssignmentsInScope(
    targetScope: TenantParkScope,
    actor: JwtPrincipal,
    userId: string,
    manager: EntityManager
  ): Promise<UserOrgAssignment[]> {
    const visibleOrgIds = await this.resolveVisibleOrgIds(targetScope, actor, manager);
    const links = await manager.getRepository(UserOrgEntity).find({
      where: {
        userId,
        tenantId: targetScope.tenantId,
        parkId: targetScope.parkId,
        isDeleted: false,
        ...(visibleOrgIds === null ? {} : { orgId: In(visibleOrgIds) })
      },
      relations: { org: true, post: true },
      order: { isPrimary: "DESC", createTime: "ASC" }
    });
    return links.map((link) => ({
      orgId: link.orgId,
      postId: link.postId,
      isPrimary: link.isPrimary,
      orgName: link.org?.orgName,
      postName: link.post?.postName ?? null
    }));
  }

  async getOrgCandidates(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
    const user = await this.getEntityForActor(scope, id, actor);
    const targetScope = { tenantId: user.tenantId, parkId: user.parkId };
    return this.listOrgCandidates(targetScope, actor);
  }

  async getCreateOrgCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    tenantId?: string,
    parkId?: string
  ) {
    const targetScope = await this.resolveUserTargetScope(scope, actor, tenantId, parkId);
    return this.listOrgCandidates(targetScope, actor);
  }

  private async listOrgCandidates(targetScope: TenantParkScope, actor: JwtPrincipal) {
    const orgWhere = await this.dataScopeService.buildFindWhere<OrgEntity>(
      targetScope,
      actor,
      "org",
      { ...targetScope, isDeleted: false, status: "enabled" },
      { org: "id" }
    );
    const [orgs, posts] = await Promise.all([
      this.userOrgRepository.manager.getRepository(OrgEntity).find({
        where: orgWhere,
        select: {
          id: true,
          parentId: true,
          orgCode: true,
          orgName: true,
          orgType: true,
          leaderUserId: true,
          sortOrder: true,
          status: true
        },
        order: { sortOrder: "ASC", orgName: "ASC", id: "ASC" }
      }),
      this.userOrgRepository.manager.getRepository(PostEntity).find({
        where: { ...targetScope, isDeleted: false, status: "enabled" },
        select: { id: true, postCode: true, postName: true, sortOrder: true, status: true },
        order: { sortOrder: "ASC", postName: "ASC" }
      })
    ]);
    return { orgs, posts };
  }

  private async resolveVisibleOrgIds(
    targetScope: TenantParkScope,
    actor: JwtPrincipal,
    manager: EntityManager = this.userOrgRepository.manager
  ): Promise<string[] | null> {
    if (actor.isSuper || actor.permissions.includes("*")) return null;
    const where = await this.dataScopeService.buildFindWhere<OrgEntity>(
      targetScope,
      actor,
      "org",
      { ...targetScope, isDeleted: false },
      { org: "id" }
    );
    const orgs = await manager.getRepository(OrgEntity).find({ where, select: { id: true } });
    return orgs.map((org) => org.id);
  }

  async replaceOrgAssignments(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: ReplaceUserOrgsDto,
    onTargetScope?: (targetScope: TenantParkScope) => void
  ): Promise<UserOrgAssignment[]> {
    this.assertOrgAssignmentShape(dto.assignments);
    return this.userOrgRepository.manager.transaction(async (manager) => {
      await lockUserOrganizationScope(manager, id);
      const user = await this.getEntityForActor(scope, id, actor, manager.getRepository(UserEntity));
      const targetScope = { tenantId: user.tenantId, parkId: user.parkId };
      onTargetScope?.(targetScope);
      await lockOrgHierarchy(manager, targetScope);
      await this.replaceOrgAssignmentsInTransaction(targetScope, actor, id, dto.assignments, manager);
      return this.listOrgAssignmentsInScope(targetScope, actor, id, manager);
    });
  }

  private async assertOrgAssignments(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    assignments: ReplaceUserOrgsDto["assignments"],
    manager: EntityManager,
    activeLinks: Array<Pick<UserOrgEntity, "orgId" | "postId" | "isPrimary">>
  ): Promise<string[] | null> {
    const relationshipKey = (item: { orgId: string; postId?: string | null }) => `${item.orgId}:${item.postId ?? ""}`;
    const retainedKeys = new Set(activeLinks.map(relationshipKey));
    const assignmentsToValidate = assignments.filter((item) => !retainedKeys.has(relationshipKey(item)));
    const orgIds = [...new Set(assignments.map((item) => item.orgId))];
    const orgIdsToValidate = [...new Set(assignmentsToValidate.map((item) => item.orgId))];
    const postIds = [...new Set(assignmentsToValidate.map((item) => item.postId).filter((id): id is string => Boolean(id)))];
    const visibleOrgIds = await this.resolveVisibleOrgIds(scope, actor, manager);
    if (orgIds.length > 0) {
      if (visibleOrgIds !== null) {
        const visibleOrgIdSet = new Set(visibleOrgIds);
        if (orgIds.some((orgId) => !visibleOrgIdSet.has(orgId))) {
          throw new BadRequestException("包含不存在、停用、跨园区或无权使用的组织");
        }
      }
    }
    if (orgIdsToValidate.length > 0) {
      const count = await manager.getRepository(OrgEntity).count({
        where: { id: In(orgIdsToValidate), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
      });
      if (count !== orgIdsToValidate.length) throw new BadRequestException("包含不存在、停用、跨园区或无权使用的组织");
    }
    if (postIds.length > 0) {
      const count = await manager.getRepository(PostEntity).count({
        where: { id: In(postIds), tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false, status: "enabled" }
      });
      if (count !== postIds.length) throw new BadRequestException("包含不存在、停用或跨园区的岗位");
    }
    return visibleOrgIds;
  }

  private async replaceOrgAssignmentsInTransaction(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    userId: string,
    assignments: ReplaceUserOrgsDto["assignments"],
    manager: EntityManager
  ): Promise<void> {
    const repository = manager.getRepository(UserOrgEntity);
    const activeLinks = await repository.find({
      where: { userId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
      select: { orgId: true, postId: true, isPrimary: true }
    });
    const visibleOrgIds = await this.assertOrgAssignments(scope, actor, assignments, manager, activeLinks);
    if (visibleOrgIds !== null) {
      const visibleOrgIdSet = new Set(visibleOrgIds);
      const hiddenPrimaryExists = activeLinks.some((link) => link.isPrimary && !visibleOrgIdSet.has(link.orgId));
      if (hiddenPrimaryExists && assignments.some((item) => item.isPrimary)) {
        throw new BadRequestException("无权变更的组织关系中已有主组织");
      }
    }
    if (visibleOrgIds === null || visibleOrgIds.length > 0) {
      await repository.update(
        {
          userId,
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          isDeleted: false,
          ...(visibleOrgIds === null ? {} : { orgId: In(visibleOrgIds) })
        },
        { isDeleted: true, updateBy: actor.sub }
      );
    }
    if (assignments.length > 0) {
      await repository.save(assignments.map((item) => repository.create({
        userId,
        orgId: item.orgId,
        postId: item.postId ?? null,
        isPrimary: item.isPrimary,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actor.sub,
        updateBy: actor.sub
      })));
    }
  }

  private assertOrgAssignmentShape(assignments: ReplaceUserOrgsDto["assignments"]): void {
    const keys = assignments.map((item) => `${item.orgId}:${item.postId ?? ""}`);
    if (new Set(keys).size !== keys.length) throw new BadRequestException("用户组织岗位关系不能重复");
    if (assignments.filter((item) => item.isPrimary).length > 1) {
      throw new BadRequestException("同一用户只能有一个主组织");
    }
  }

  async getCurrentUserContext(scope: TenantParkScope, id: string): Promise<UserContext> {
    const user = await this.usersRepository.findOne({
      where: { id, tenantId: scope.tenantId, isDeleted: false },
      relations: { roleLinks: { role: { permissionLinks: { permission: true } } } }
    });
    if (!user) throw new NotFoundException("User not found");
    const isTenantSuper = user.roleLinks.some((link) => isProtectedTenantSuperBinding(link, user.tenantId));
    const [accessibleParks, tenant] = await Promise.all([
      this.resolveAccessibleParks(user.id, user.tenantId, { homeParkId: user.parkId, isTenantSuper, roleLinks: user.roleLinks }),
      this.tenantRepository.findOne({
        where: { tenantId: user.tenantId, isDeleted: false },
        select: { contactUserId: true }
      })
    ]);
    const currentPark = accessibleParks.find((park) => park.park_id === scope.parkId) ?? null;
    const currentParkName = currentPark?.park_name?.trim();
    if (!currentPark || !currentParkName) throw new NotFoundException("User not found");
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
    const scopedUser = { ...user, parkId: scope.parkId } as UserEntity;
    const principal = this.buildJwtPrincipal(scopedUser);
    const activeRoleLinks = this.getActiveRoleLinks(scopedUser);
    const isTenantBootstrapAdmin = tenant?.contactUserId === user.id;
    const activePermissionEntities = activeRoleLinks.flatMap((link) =>
      this.getActivePermissionLinks(link.role, user.tenantId, scope.parkId)
        .map((permissionLink) => permissionLink.permission)
    );
    const { permissions } = principal;
    const dataScope = principal.dataScope ?? "self";
    const isSuper = principal.isSuper ?? false;
    const fieldPolicies = await this.fieldPolicyService.getUserFieldPolicies(scope, principal);
    const dataScopes = await this.dataScopeService.getUserDataScopes(scope, principal);
    const enabledModules = await this.saasModulesService.listEnabledModulesForTenant(user.tenantId, scope.parkId);
    const menuTree = this.buildPermissionMenuTree(activePermissionEntities, permissions, enabledModules);
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
      tenant_id: user.tenantId,
      park_id: scope.parkId,
      park_name: currentParkName,
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
      is_super: isSuper,
      is_tenant_bootstrap_admin: isTenantBootstrapAdmin
    };
  }

  async resolveJwtPrincipal(scope: TenantParkScope, id: string): Promise<JwtPrincipal> {
    return this.identityDirectory.resolveJwtPrincipal(scope, id);
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdateUserDto,
    onTargetScope?: (targetScope: TenantParkScope) => void
  ): Promise<UserView> {
    if (dto.assignments !== undefined) {
      this.assertOrgAssignmentShape(dto.assignments);
    }
    const saved = await this.usersRepository.manager.transaction(async (manager) => {
      await lockUserOrganizationScope(manager, id);
      const usersRepository = manager.getRepository(UserEntity);
      const user = await this.getEntityForActor(scope, id, actor, usersRepository);
      const previousScope = { tenantId: user.tenantId, parkId: user.parkId };
      const targetScope = await this.resolveUserTargetScope(previousScope, actor, dto.tenantId, dto.parkId);
      onTargetScope?.(targetScope);
      const scopeChanged = targetScope.tenantId !== previousScope.tenantId || targetScope.parkId !== previousScope.parkId;
      const scopesToLock = new Map<string, TenantParkScope>();
      if (scopeChanged) {
        await this.assertUsernameAvailable(targetScope, user.username, usersRepository);
        const tenantChanged = targetScope.tenantId !== previousScope.tenantId;
        const relationshipScopes = tenantChanged
          ? await manager.getRepository(UserOrgEntity).find({
              where: { userId: id, tenantId: previousScope.tenantId, isDeleted: false },
              select: { tenantId: true, parkId: true }
            })
          : [previousScope];
        scopesToLock.set(`${previousScope.tenantId}:${previousScope.parkId}`, previousScope);
        for (const relationshipScope of relationshipScopes) {
          scopesToLock.set(`${relationshipScope.tenantId}:${relationshipScope.parkId}`, {
            tenantId: relationshipScope.tenantId,
            parkId: relationshipScope.parkId
          });
        }
      }
      if (dto.assignments !== undefined) {
        scopesToLock.set(`${targetScope.tenantId}:${targetScope.parkId}`, targetScope);
      }
      for (const relationshipScope of [...scopesToLock.values()].sort((a, b) =>
        `${a.tenantId}:${a.parkId}`.localeCompare(`${b.tenantId}:${b.parkId}`)
      )) {
        await lockOrgHierarchy(manager, relationshipScope);
      }
      if (scopeChanged) {
        const tenantChanged = targetScope.tenantId !== previousScope.tenantId;
        await manager.getRepository(UserOrgEntity).update(
          tenantChanged
            ? { userId: id, tenantId: previousScope.tenantId, isDeleted: false }
            : { userId: id, ...previousScope, isDeleted: false },
          { isDeleted: true, updateBy: actor.sub }
        );
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
      const updatedUser = await usersRepository.save(user);
      if (dto.accessibleParkIds !== undefined || dto.parkId !== undefined || dto.tenantId !== undefined) {
        await this.syncUserParks(
          updatedUser.id,
          targetScope.tenantId,
          targetScope.parkId,
          dto.accessibleParkIds,
          actor.sub,
          manager
        );
      }
      if (dto.assignments !== undefined) {
        await this.replaceOrgAssignmentsInTransaction(targetScope, actor, id, dto.assignments, manager);
      }
      return updatedUser;
    });
    const [view] = await this.toViews([saved], this.canViewRoleDiagnostics(actor));
    if (!view) {
      throw new NotFoundException("User not found");
    }
    return view;
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    await this.usersRepository.manager.transaction(async (manager) => {
      await lockUserOrganizationScope(manager, id);
      const repository = manager.getRepository(UserEntity);
      const user = await repository.findOne({
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
      });
      if (!user) throw new NotFoundException("User not found");
      user.isDeleted = true;
      user.updateBy = actorId;
      await repository.save(user);
      await manager.getRepository(UserOrgEntity).update(
        { userId: id, tenantId: user.tenantId, isDeleted: false },
        { isDeleted: true, updateBy: actorId }
      );
    });
    return { id };
  }

  async resetPassword(scope: TenantParkScope, actorId: string, id: string, dto: ResetPasswordDto): Promise<{ id: string }> {
    const saltRounds = Number(this.configService.get<string>("BCRYPT_SALT_ROUNDS", "12"));
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);
    await this.usersRepository.manager.transaction(async (manager) => {
      const users = manager.getRepository(UserEntity);
      const user = await users.findOne({
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      user.passwordHash = passwordHash;
      user.authVersion = Math.max(1, user.authVersion || 1) + 1;
      Object.assign(user, clearPasswordLockoutState());
      user.updateBy = actorId;
      await users.save(user);
      await manager.getRepository(AuthRefreshTokenEntity).update(
        { tenantId: user.tenantId, userId: user.id, revoked: false, isDeleted: false },
        { revoked: true, revokedTime: new Date(), updateBy: actorId }
      );
    });
    return { id };
  }

  async recordSuccessfulLogin(scope: TenantParkScope, id: string, ipAddress: string | null): Promise<void> {
    return this.identityDirectory.recordSuccessfulLogin(scope, id, ipAddress);
  }

  async recordPasswordFailure(user: UserEntity, config: PasswordLockoutConfig, now = new Date()): Promise<PasswordFailureRecordResult> {
    return this.identityDirectory.recordPasswordFailure(user, config, now);
  }

  async clearPasswordFailures(userId: string): Promise<void> {
    const state = clearPasswordLockoutState();
    await this.usersRepository.update({ id: userId, isDeleted: false }, state);
  }

  isPasswordLocked(user: UserEntity, now: Date): boolean {
    return this.identityDirectory.isPasswordLocked(user, now);
  }

  async refreshPasswordLockoutState(user: UserEntity, now = new Date()): Promise<UserEntity> {
    return this.identityDirectory.refreshPasswordLockoutState(user, now);
  }

  async finalizePasswordLoginSuccess(user: UserEntity, config: PasswordLockoutConfig, now = new Date()): Promise<PasswordLoginSuccessResult> {
    return this.identityDirectory.finalizePasswordLoginSuccess(user, config, now);
  }

  async clearExpiredPasswordLockIfNeeded(user: UserEntity, now = new Date()): Promise<UserEntity> {
    return this.refreshPasswordLockoutState(user, now);
  }

  async getCreateRoleCandidates(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: UserRoleCandidatesQueryDto
  ): Promise<UserRoleView[] | UserRoleCandidatePage> {
    const targetScope = await this.resolveUserTargetScope(scope, actor, query.tenantId, query.parkId);
    const candidatePage = await this.listAssignableRolePage(targetScope, {
      page: query.paged ? query.page ?? 1 : 1,
      page_size: query.paged ? query.page_size ?? 20 : MAX_ROLE_CANDIDATES,
      keyword: query.keyword
    });
    return query.paged ? candidatePage : candidatePage.items;
  }

  async getUserRoleContext(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    query?: UserRoleCandidatesQueryDto
  ): Promise<UserRoleContext> {
    const user = query?.parkId
      ? await this.getTargetParkRoleUser(scope, actor, id, query.parkId)
      : await this.getEntityForActor(scope, id, actor);
    const targetScope = { tenantId: user.tenantId, parkId: query?.parkId?.trim() || user.parkId };
    const [roles, candidatePage] = await Promise.all([
      this.listAssignedRoles(targetScope, id),
      this.listAssignableRolePage(targetScope, {
        page: query?.paged ? query.page ?? 1 : 1,
        page_size: query?.paged ? query.page_size ?? 50 : MAX_ROLE_CANDIDATES,
        keyword: query?.keyword
      })
    ]);
    return { roles, candidates: candidatePage.items, candidatePage };
  }

  async assignRoles(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: AssignRolesDto,
    onTargetScope?: (scope: TenantParkScope) => void
  ): Promise<{ id: string }> {
    if (new Set(dto.roleIds).size !== dto.roleIds.length) {
      throw new BadRequestException("Duplicate role IDs are not allowed");
    }
    await this.userRoleRepository.manager.transaction(async (manager) => {
      await lockUserOrganizationScope(manager, id);
      const user = await this.getEntityForActor(scope, id, actor, manager.getRepository(UserEntity));
      const targetScope = { tenantId: user.tenantId, parkId: user.parkId };
      onTargetScope?.(targetScope);
      const roleRepository = manager.getRepository(RoleEntity);
      const userRoleRepository = manager.getRepository(UserRoleEntity);
      const roles = dto.roleIds.length === 0 ? [] : await roleRepository.createQueryBuilder("role")
        .setLock("pessimistic_read")
        .where("role.id IN (:...roleIds)", { roleIds: dto.roleIds })
        .andWhere("role.tenant_id=:tenantId", { tenantId: targetScope.tenantId })
        .andWhere("(role.role_scope='tenant' OR (role.role_scope='park' AND role.park_id=:parkId))", { parkId: targetScope.parkId })
        .andWhere("role.status='enabled' AND role.is_enabled=true")
        .andWhere("role.is_template=false AND role.is_system=false AND role.is_builtin=false")
        .andWhere("role.is_deleted=false")
        .getMany();
      if (roles.length !== dto.roleIds.length) {
        throw new NotFoundException("Role not found in current scope");
      }

      const currentLinks = await userRoleRepository.find({
        where: { userId: id, tenantId: targetScope.tenantId, parkId: targetScope.parkId, isDeleted: false },
        relations: { role: true }
      });
      const managedLinkIds = currentLinks
        .filter((link) => link.role?.tenantId === targetScope.tenantId
          && !this.isRoleAssignmentProtected(link.role)
          && (link.role.roleScope === "tenant" || (link.role.roleScope === "park" && link.role.parkId === targetScope.parkId)))
        .map((link) => link.id);
      if (managedLinkIds.length > 0) {
        await userRoleRepository.update(
          { id: In(managedLinkIds), isDeleted: false },
          { isDeleted: true, updateBy: actor.sub }
        );
      }
      if (dto.roleIds.length > 0) {
        const links = dto.roleIds.map((roleId) =>
          userRoleRepository.create({
            userId: id,
            roleId,
            tenantId: targetScope.tenantId,
            parkId: targetScope.parkId,
            createBy: actor.sub,
            updateBy: actor.sub
          })
        );
        await userRoleRepository.save(links);
      }
    });
    return { id };
  }

  async assignParkRoles(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: AssignParkRolesDto,
    onTargetScope?: (scope: TenantParkScope) => void
  ): Promise<{ id: string }> {
    return this.replaceRolesAtTargetPark(scope, actor, id, dto.parkId, dto.roleIds, onTargetScope);
  }

  private async replaceRolesAtTargetPark(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    parkId: string,
    roleIds: string[],
    onTargetScope?: (scope: TenantParkScope) => void
  ): Promise<{ id: string }> {
    if (new Set(roleIds).size !== roleIds.length) {
      throw new BadRequestException("Duplicate role IDs are not allowed");
    }
    await this.userRoleRepository.manager.transaction(async (manager) => {
      await lockUserOrganizationScope(manager, id);
      const user = await this.getTargetParkRoleUser(scope, actor, id, parkId, manager);
      const targetScope = { tenantId: user.tenantId, parkId: parkId.trim() };
      onTargetScope?.(targetScope);
      const roleRepository = manager.getRepository(RoleEntity);
      const userRoleRepository = manager.getRepository(UserRoleEntity);
      const roles = roleIds.length === 0 ? [] : await roleRepository.createQueryBuilder("role")
        .setLock("pessimistic_read")
        .where("role.id IN (:...roleIds)", { roleIds })
        .andWhere("role.tenant_id=:tenantId", { tenantId: targetScope.tenantId })
        .andWhere("(role.role_scope='tenant' OR (role.role_scope='park' AND role.park_id=:parkId))", { parkId: targetScope.parkId })
        .andWhere("role.status='enabled' AND role.is_enabled=true")
        .andWhere("role.is_template=false AND role.is_system=false AND role.is_builtin=false")
        .andWhere("role.is_deleted=false")
        .getMany();
      if (roles.length !== roleIds.length) throw new NotFoundException("Role not found in target scope");
      const currentLinks = await userRoleRepository.find({
        where: { userId: id, tenantId: targetScope.tenantId, parkId: targetScope.parkId, isDeleted: false },
        relations: { role: true }
      });
      const managedLinkIds = currentLinks
        .filter((link) => link.role?.tenantId === targetScope.tenantId
          && !this.isRoleAssignmentProtected(link.role)
          && (link.role.roleScope === "tenant" || (link.role.roleScope === "park" && link.role.parkId === targetScope.parkId)))
        .map((link) => link.id);
      if (managedLinkIds.length > 0) {
        await userRoleRepository.update({ id: In(managedLinkIds), isDeleted: false }, { isDeleted: true, updateBy: actor.sub });
      }
      if (roleIds.length > 0) {
        await userRoleRepository.save(roleIds.map((roleId) => userRoleRepository.create({
          userId: id,
          roleId,
          tenantId: targetScope.tenantId,
          parkId: targetScope.parkId,
          createBy: actor.sub,
          updateBy: actor.sub
        })));
      }
    });
    return { id };
  }

  private async listAssignableRolePage(
    scope: TenantParkScope,
    query: { page: number; page_size: number; keyword?: string }
  ): Promise<UserRoleCandidatePage> {
    const builder = this.rolesRepository.createQueryBuilder("role")
      .where("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
      .andWhere("(role.role_scope='tenant' OR (role.role_scope='park' AND role.park_id=:parkId))", { parkId: scope.parkId })
      .andWhere("role.status='enabled' AND role.is_enabled=true")
      .andWhere("role.is_template=false AND role.is_system=false AND role.is_builtin=false")
      .andWhere("role.is_deleted=false");
    if (query.keyword) {
      builder.andWhere(new Brackets((keyword) => {
        keyword
          .where("role.code ILIKE :keyword", { keyword: `%${query.keyword}%` })
          .orWhere("role.name ILIKE :keyword", { keyword: `%${query.keyword}%` });
      }));
    }
    const [roles, total] = await builder
      .orderBy("role.level", "ASC")
      .addOrderBy("role.sortNo", "ASC")
      .addOrderBy("role.name", "ASC")
      .addOrderBy("role.code", "ASC")
      .addOrderBy("role.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return {
      items: roles.map((role) => this.toUserRoleView(scope, role)),
      total,
      page: query.page,
      page_size: query.page_size,
      hasMore: query.page * query.page_size < total
    };
  }

  private async listAssignedRoles(scope: TenantParkScope, userId: string): Promise<UserRoleView[]> {
    const links = await this.userRoleRepository.find({
      where: { userId, tenantId: scope.tenantId, isDeleted: false },
      relations: { role: true },
      order: { createTime: "ASC" }
    });
    return links
      .filter((link) => link.role?.tenantId === scope.tenantId
        && (link.role.roleScope === "tenant" || (link.role.roleScope === "park" && link.role.parkId === scope.parkId)))
      .map((link) => this.toUserRoleView(scope, link.role));
  }

  private isRoleAssignmentProtected(role: RoleEntity): boolean {
    return isRoleAssignmentProtected(role);
  }

  private toUserRoleView(scope: TenantParkScope, role: RoleEntity): UserRoleView {
    const assignability = evaluateRoleAssignability(role, scope);
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      roleScope: role.roleScope,
      status: role.status,
      isEnabled: role.isEnabled && !role.isDeleted,
      isAssignable: assignability.isAssignable,
      isProtected: assignability.isProtected,
      unassignableReasons: assignability.unassignableReasons,
      assignabilityLabel: assignability.assignabilityLabel
    };
  }

  private async getEntityForActor(
    scope: TenantParkScope,
    id: string,
    actor?: JwtPrincipal,
    repository = this.usersRepository
  ): Promise<UserEntity> {
    if (actor?.isSuper || actor?.permissions.includes("*")) {
      const user = await repository.findOne({ where: { id, isDeleted: false } });
      if (!user) {
        throw new NotFoundException("User not found");
      }
      return user;
    }
    const user = await repository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  private async getTargetParkRoleUser(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    parkId: string,
    manager?: EntityManager
  ): Promise<UserEntity> {
    const targetParkId = parkId.trim();
    if (!targetParkId) throw new NotFoundException("Target park is not available");
    const userRepository = manager?.getRepository(UserEntity) ?? this.usersRepository;
    const parkRepository = manager?.getRepository(ParkEntity) ?? this.parksRepository;
    const userParkRepository = manager?.getRepository(UserParkEntity) ?? this.userParkRepository;
    const globalRoleManager = Boolean(!actor.isTenantSuper && (actor.isSuper || actor.permissions.includes("*")));
    const user = await userRepository.findOne({
      where: { id, ...(globalRoleManager ? {} : { tenantId: scope.tenantId }), isDeleted: false },
      relations: { roleLinks: { role: true } }
    });
    if (!user || (!globalRoleManager && actor.tenantId !== user.tenantId)) throw new NotFoundException("User not found");
    if (!globalRoleManager && !actor.isTenantSuper && targetParkId !== actor.parkId) {
      throw new ForbiddenException("Target park role configuration is not allowed");
    }
    const targetPark = await parkRepository.findOne({
      where: { tenantId: user.tenantId, parkId: targetParkId, status: 1, isDeleted: false }
    });
    if (!targetPark) throw new NotFoundException("Target park is not available");
    const targetLink = await userParkRepository.findOne({
      where: { userId: user.id, tenantId: user.tenantId, parkId: targetParkId, status: "enabled", isDeleted: false }
    });
    const explicitHomeRelation = targetParkId === user.parkId
      ? await userParkRepository.findOne({ where: { userId: user.id, tenantId: user.tenantId, parkId: targetParkId } })
      : null;
    const targetIsAccessible = user.roleLinks.some((link) => isProtectedTenantSuperBinding(link, user.tenantId))
      || Boolean(targetLink)
      || (targetParkId === user.parkId && !explicitHomeRelation);
    if (!targetIsAccessible) throw new NotFoundException("Target park is not available");
    return user;
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
    actorId: string,
    manager?: EntityManager
  ): Promise<void> {
    const parksRepository = manager?.getRepository(ParkEntity) ?? this.parksRepository;
    const userParkRepository = manager?.getRepository(UserParkEntity) ?? this.userParkRepository;
    const parkIds = [...new Set([defaultParkId, ...(requestedParkIds ?? [])].map((item) => item.trim()).filter(Boolean))];
    const parks = await parksRepository.find({ where: { tenantId, parkId: In(parkIds), isDeleted: false } });
    if (parks.length !== parkIds.length) {
      throw new NotFoundException("Accessible park not found in target tenant");
    }
    await userParkRepository.update({ userId, isDeleted: false }, { isDeleted: true, updateBy: actorId });
    await userParkRepository.save(
      parkIds.map((parkId) =>
        userParkRepository.create({
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
    if (!park || park.status !== 1) {
      return "missing_default_park";
    }
    const hasDefaultAccess = explicitLinks.length === 0 || explicitLinks.some((link) => link.parkId === user.parkId && link.status === "enabled");
    return hasDefaultAccess ? "ready" : "default_park_not_accessible";
  }

  private async assertUsernameAvailable(
    scope: TenantParkScope,
    username: string,
    repository = this.usersRepository
  ): Promise<void> {
    const exists = await repository.exists({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, username, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Username already exists");
    }
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

  private async toViews(users: UserEntity[], includeRoleDiagnostics = true, diagnosticParkId?: string): Promise<UserView[]> {
    if (users.length === 0) {
      return [];
    }
    const tenantIds = [...new Set(users.map((user) => user.tenantId))];
    const parkIds = [...new Set(users.map((user) => user.parkId))];
    const [tenants, parks, parkLinks, roleLinks] = await Promise.all([
      this.tenantRepository.find({ where: { tenantId: In(tenantIds), isDeleted: false } }),
      this.parksRepository.find({ where: { tenantId: In(tenantIds), parkId: In(parkIds), isDeleted: false } }),
      this.userParkRepository.find({ where: { userId: In(users.map((user) => user.id)), isDeleted: false, status: "enabled" }, order: { isDefault: "DESC", createTime: "ASC" } }),
      this.userRoleRepository.find({
        where: { userId: In(users.map((user) => user.id)), isDeleted: false },
        relations: { role: true },
        order: { createTime: "ASC" }
      })
    ]);
    const tenantMap = new Map(tenants.map((tenant) => [tenant.tenantId, tenant]));
    const parkMap = new Map(parks.map((park) => [`${park.tenantId}:${park.parkId}`, park]));
    const accessibleByUser = new Map<string, UserParkContext[]>();
    await Promise.all(
      users.map(async (user) => {
        const isTenantSuper = roleLinks.some(
          (link) => link.userId === user.id && isProtectedTenantSuperBinding(link, user.tenantId)
        );
        const userRoleLinks = roleLinks.filter((link) => link.userId === user.id
          && link.tenantId === user.tenantId
          && (!diagnosticParkId || link.role?.roleScope === "tenant" || link.parkId === diagnosticParkId));
        const accessibleParks = await this.resolveAccessibleParks(user.id, user.tenantId, {
          activeOnly: false,
          homeParkId: user.parkId,
          isTenantSuper,
          roleLinks: includeRoleDiagnostics ? userRoleLinks : undefined
        });
        accessibleByUser.set(user.id, diagnosticParkId
          ? accessibleParks.map((park) => park.park_id === diagnosticParkId ? park : { ...park, role_summary: undefined })
          : accessibleParks);
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
        roles: includeRoleDiagnostics ? roleLinks
          .filter((link) => link.userId === user.id && link.tenantId === user.tenantId && link.parkId === (diagnosticParkId ?? user.parkId))
          .filter((link) => link.role?.tenantId === user.tenantId
            && (link.role.roleScope === "tenant" || (link.role.roleScope === "park" && link.role.parkId === (diagnosticParkId ?? user.parkId))))
          .map((link) => this.toUserRoleView({ tenantId: user.tenantId, parkId: diagnosticParkId ?? user.parkId }, link.role)) : [],
        loginContextStatus: this.resolveLoginContextStatus(user, tenant, park, explicitLinks),
        createTime: user.createTime,
        updateTime: user.updateTime,
        remark: user.remark
      };
    });
  }

  private canViewRoleDiagnostics(actor?: JwtPrincipal): boolean {
    return Boolean(actor && (actor.isSuper
      || actor.permissions.includes("*")
      || actor.permissions.includes(SYSTEM_PERMISSIONS.USER_DETAIL)
      || actor.permissions.includes(SYSTEM_PERMISSIONS.USER_ASSIGN_ROLES)));
  }

  private async resolveAccessibleParks(
    userId: string,
    tenantId: string,
    options: { activeOnly?: boolean; homeParkId?: string; isTenantSuper?: boolean; roleLinks?: UserRoleEntity[] } = {}
  ): Promise<UserParkContext[]> {
    if (options.isTenantSuper === true) {
      const tenantParks = await this.parksRepository.find({
        where: {
          tenantId,
          ...(options.activeOnly === false ? {} : { status: 1 }),
          isDeleted: false
        },
        order: { createTime: "ASC" }
      });
      const parks = tenantParks.map((park) => ({
        tenant_id: park.tenantId,
        park_id: park.parkId,
        park_code: park.parkCode,
        park_name: park.parkName,
        is_default: park.parkId === options.homeParkId,
        status: park.status === 1 ? "enabled" : "disabled"
      }));
      return options.roleLinks ? this.attachParkRoleSummaries(parks, tenantId, options.roleLinks) : parks;
    }
    const links = await this.userParkRepository.find({
      where: {
        tenantId,
        userId,
        isDeleted: false,
        status: "enabled"
      },
      order: { isDefault: "DESC", createTime: "ASC" }
    });

    const hasActiveHomeLink = options.homeParkId
      ? links.some((link) => link.parkId === options.homeParkId)
      : false;
    const explicitHomeRelation = options.homeParkId && !hasActiveHomeLink
      ? await this.userParkRepository.findOne({
          where: { tenantId, userId, parkId: options.homeParkId }
        })
      : null;
    const fallbackHomeParkId = options.homeParkId && !hasActiveHomeLink && !explicitHomeRelation
      ? options.homeParkId
      : null;

    const parkIds = [...new Set([
      ...links.map((link) => link.parkId),
      ...(fallbackHomeParkId ? [fallbackHomeParkId] : [])
    ])];
    if (parkIds.length === 0) {
      return [];
    }
    const parks = await this.parksRepository.find({
      where: {
        tenantId,
        parkId: In(parkIds),
        ...(options.activeOnly === false ? {} : { status: 1 }),
        isDeleted: false
      }
    });
    const parkMap = new Map(parks.map((park) => [`${park.tenantId}:${park.parkId}`, park]));

    const contexts = links.flatMap((link) => {
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
        status: park.status === 1 ? "enabled" : "disabled"
      };
    });
    const homePark = fallbackHomeParkId
      ? parkMap.get(`${tenantId}:${fallbackHomeParkId}`)
      : null;
    if (homePark && !contexts.some((park) => park.park_id === homePark.parkId)) {
      contexts.unshift({
        tenant_id: tenantId,
        park_id: homePark.parkId,
        park_code: homePark.parkCode,
        park_name: homePark.parkName,
        is_default: true,
        status: homePark.status === 1 ? "enabled" : "disabled"
      });
    }
    return options.roleLinks ? this.attachParkRoleSummaries(contexts, tenantId, options.roleLinks) : contexts;
  }

  private attachParkRoleSummaries(
    parks: UserParkContext[],
    tenantId: string,
    roleLinks?: UserRoleEntity[]
  ): UserParkContext[] {
    if (!roleLinks) return parks;
    return parks.map((park) => {
      const roles = roleLinks
        .filter((link) => !link.isDeleted
          && link.tenantId === tenantId
          && link.role?.tenantId === tenantId
          && !link.role.isDeleted
          && link.role.isEnabled
          && link.role.status === "enabled"
          && (isProtectedTenantSuperRole(link.role)
            || (link.parkId === park.park_id
              && (link.role.roleScope === "tenant" || link.role.parkId === park.park_id))))
        .map((link) => ({ code: link.role.code, name: link.role.name }));
      const uniqueRoles = [...new Map(roles.map((role) => [role.code, role])).values()];
      return {
        ...park,
        role_summary: {
          role_names: uniqueRoles.map((role) => role.name),
          role_count: uniqueRoles.length,
          has_business_role: uniqueRoles.length > 0
        }
      };
    });
  }

  private buildJwtPrincipal(user: UserEntity): JwtPrincipal {
    const activeRoleLinks = this.getActiveRoleLinks(user);
    const basePermissions = activeRoleLinks.flatMap((link) =>
      this.getActivePermissionLinks(link.role, user.tenantId, user.parkId)
        .map((permissionLink) => permissionLink.permission.code)
    );
    const isTenantSuper = activeRoleLinks.some((link) => isProtectedTenantSuperRole(link.role));
    const isSuper = isTenantSuper || activeRoleLinks.some((link) => link.role.isSuper) || basePermissions.includes("*");
    const permissions = isSuper
      ? ["*"]
      : expandPermissionAliases([...new Set([...basePermissions, SYSTEM_PERMISSIONS.USER_ME])]);

    return {
      sub: user.id,
      username: user.username,
      realName: user.displayName,
      tenantId: user.tenantId,
      parkId: user.parkId,
      roles: activeRoleLinks.map((link) => link.role.code),
      permissions,
      dataScope: isSuper ? "all" : resolveDataScope(activeRoleLinks.map((link) => link.role.dataScope)),
      isSuper,
      isTenantSuper
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

  private getActiveRoleLinks(user: UserEntity): UserRoleEntity[] {
    return user.roleLinks.filter(
      (link) =>
        !link.isDeleted &&
        link.tenantId === user.tenantId &&
        !link.role.isDeleted &&
        link.role.isEnabled &&
        link.role.status === "enabled" &&
        link.role.tenantId === user.tenantId &&
        (
          isProtectedTenantSuperRole(link.role)
          || (
            link.parkId === user.parkId
            && (link.role.roleScope === "tenant" || link.role.parkId === user.parkId)
          )
        )
    );
  }

  private getActivePermissionLinks(role: RoleEntity, tenantId: string, parkId: string) {
    return role.permissionLinks.filter(
      (permissionLink) =>
        !permissionLink.isDeleted &&
        permissionLink.tenantId === tenantId &&
        permissionLink.parkId === parkId &&
        !permissionLink.permission.isDeleted &&
        permissionLink.permission.isEnabled &&
        permissionLink.permission.status === "enabled" &&
        permissionLink.permission.tenantId === tenantId
    );
  }

  private buildPermissionMenuTree(
    permissions: PermissionEntity[],
    permissionCodes: string[],
    enabledModules: EnabledModuleContext[]
  ): UserMenuTreeNode[] {
    const granted = new Set(permissionCodes);
    const menuPermissions = permissions
      .filter((permission) => permission.visible && permission.isEnabled && !permission.isDeleted)
      .filter((permission) => permission.permType === 10 || permission.permType === 20)
      .sort((left, right) => (left.level - right.level) || (left.sortNo - right.sortNo) || left.createTime.getTime() - right.createTime.getTime());

    const seededMenu = this.buildSeededMenuTree(menuPermissions, granted);
    const baseMenu = menuPermissions.length > 0 ? seededMenu : this.buildMenuTree(permissionCodes);
    return this.projectPropertyBusinessMenus(baseMenu, permissions, granted, enabledModules);
  }

  private projectPropertyBusinessMenus(
    menuTree: UserMenuTreeNode[],
    permissionEntities: PermissionEntity[],
    granted: Set<string>,
    enabledModules: EnabledModuleContext[]
  ): UserMenuTreeNode[] {
    const enabledModuleCodes = new Set(
      enabledModules
        .filter((module) => module.enabled !== false)
        .map((module) => module.module_code)
    );
    const propertyMenuIndexes = menuTree.flatMap((node, index) =>
      this.isPropertyBusinessMenuNode(node) ? [index] : []
    );
    const insertionIndex = propertyMenuIndexes[0]
      ?? menuTree.findIndex((node) => node.module === "iot");
    const nonPropertyMenus = menuTree.filter((node) => !this.isPropertyBusinessMenuNode(node));
    const canonicalPropertyMenus = (["homestay", "housing_rental"] as const)
      .flatMap((moduleCode) => {
        const moduleSurfaces = PROPERTY_BUSINESS_SURFACES.filter(
          (surface) => surface.moduleCode === moduleCode
        );
        const dependencies = new Set(PROPERTY_ACCESS_MANIFEST
          .filter((entry) => entry.module.required === moduleCode)
          .flatMap((entry) => entry.module.dependencies));
        if (!enabledModuleCodes.has(moduleCode)
          || [...dependencies].some((dependency) => !enabledModuleCodes.has(dependency))) {
          return [];
        }
        const children = moduleSurfaces
          .flatMap((surface) => {
            if (!granted.has("*") && !granted.has(surface.pageCode)) {
              return [];
            }
            const seededMetadata = this.resolvePropertyPageMetadata(
              permissionEntities,
              surface.pageCode,
              surface.route,
              surface.moduleCode
            );
            if (seededMetadata === null) {
              return [];
            }
            return [{
              label: surface.label,
              href: surface.route,
              permission: surface.pageCode,
              module: surface.moduleCode,
              icon: seededMetadata?.icon ?? undefined
            } satisfies UserMenuTreeNode];
          });
        if (children.length === 0) {
          return [];
        }
        return [{
          label: moduleCode === "homestay" ? "民宿管理" : "长租经营",
          module: moduleCode,
          icon: moduleCode === "homestay" ? "hotel" : "house",
          children
        } satisfies UserMenuTreeNode];
      });

    const targetIndex = insertionIndex < 0
      ? nonPropertyMenus.length
      : Math.min(insertionIndex, nonPropertyMenus.length);
    return [
      ...nonPropertyMenus.slice(0, targetIndex),
      ...canonicalPropertyMenus,
      ...nonPropertyMenus.slice(targetIndex)
    ];
  }

  private resolvePropertyPageMetadata(
    permissionEntities: PermissionEntity[],
    pageCode: string,
    route: string,
    moduleCode: PropertyBusinessModuleCode
  ): Pick<PermissionEntity, "name" | "icon"> | undefined | null {
    const definitions = [
      ...new Map(
        permissionEntities
          .filter((permission) => permission.code === pageCode)
          .map((permission) => [permission.id, permission])
      ).values()
    ];
    if (definitions.length === 0) {
      return undefined;
    }
    if (definitions.length !== 1) {
      return null;
    }
    const [definition] = definitions;
    if (
      !definition ||
      definition.isDeleted ||
      !definition.isEnabled ||
      !definition.visible ||
      definition.permissionType !== "page" ||
      definition.permType !== 20 ||
      definition.action !== "page" ||
      definition.frontendRoute !== route ||
      this.inferModuleCode(definition.frontendRoute, definition.code) !== moduleCode
    ) {
      return null;
    }
    return definition;
  }

  private isPropertyBusinessMenuNode(node: UserMenuTreeNode): boolean {
    return (
      node.module === "homestay" ||
      node.module === "housing_rental" ||
      node.href === "/homestay" ||
      node.href?.startsWith("/homestay/") ||
      node.href === "/housing" ||
      node.href?.startsWith("/housing/") ||
      node.permission === "homestay:operations" ||
      node.permission === "housing_rental:operations"
    );
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
    if (frontendRoute?.startsWith("/homestay") || permissionCode?.startsWith("homestay")) {
      return "homestay";
    }
    if (
      frontendRoute?.startsWith("/housing")
      || permissionCode?.startsWith("housing:")
      || permissionCode?.startsWith("housing_rental")
    ) {
      return "housing_rental";
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
      { label: "房间/房源管理", href: "/assets/units", permission: "asset:unit:list", module: "asset" },
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
    label: "民宿管理",
    icon: "hotel",
    module: "homestay",
    children: [
      { label: "民宿运营", href: "/homestay", permission: "homestay:operations", module: "homestay" }
    ]
  },
  {
    label: "长租经营",
    icon: "house",
    module: "housing_rental",
    children: [
      { label: "长租运营", href: "/housing", permission: "housing_rental:operations", module: "housing_rental" }
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
      { label: "附件中心", href: "/system/files", permission: "system:attachment:list", module: "system" },
      { label: "操作日志", href: "/system/audit/op-logs", permission: "audit:read", module: "system" },
      { label: "登录日志", href: "/system/audit/login-logs", permission: "audit:read", module: "system" }
    ]
  }
];
