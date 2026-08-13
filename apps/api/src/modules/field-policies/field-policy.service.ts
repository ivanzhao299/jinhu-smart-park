import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { In } from "typeorm";
import type { FieldPolicyContext, PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { RoleEntity } from "../roles/entities/role.entity";
import { UserRoleEntity } from "../roles/entities/user-role.entity";
import type { AssignRoleFieldPoliciesDto } from "./dto/assign-role-field-policies.dto";
import type { CreateFieldPolicyDto } from "./dto/create-field-policy.dto";
import type { UpdateFieldPolicyDto } from "./dto/update-field-policy.dto";
import { FieldPolicyEntity, type FieldPolicyType } from "./entities/field-policy.entity";
import { RoleFieldPolicyEntity } from "./entities/role-field-policy.entity";

@Injectable()
export class FieldPolicyService {
  constructor(
    @InjectRepository(FieldPolicyEntity)
    private readonly fieldPoliciesRepository: Repository<FieldPolicyEntity>,
    @InjectRepository(RoleFieldPolicyEntity)
    private readonly roleFieldPoliciesRepository: Repository<RoleFieldPolicyEntity>,
    @InjectRepository(RoleEntity)
    private readonly rolesRepository: Repository<RoleEntity>,
    @InjectRepository(UserRoleEntity)
    private readonly userRoleRepository: Repository<UserRoleEntity>
  ) {}

  async list(scope: TenantParkScope, query: PaginationQueryDto): Promise<PaginatedResult<FieldPolicyEntity>> {
    const where = {
      tenantId: scope.tenantId,
      isDeleted: false,
      ...(query.status ? { status: query.status } : {})
    };
    const [items, total] = await this.fieldPoliciesRepository.findAndCount({
      where,
      order: { module: "ASC", entity: "ASC", fieldKey: "ASC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateFieldPolicyDto): Promise<FieldPolicyEntity> {
    await this.assertFieldAvailable(scope, dto.module, dto.entity, dto.fieldKey);
    const entity = this.fieldPoliciesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      module: dto.module,
      entity: dto.entity,
      fieldKey: dto.fieldKey,
      fieldName: dto.fieldName,
      policyType: dto.policyType,
      maskRule: dto.maskRule ?? null,
      status: dto.status ?? "enabled",
      remark: dto.remark ?? null,
      createBy: actorId,
      updateBy: actorId
    });
    return this.fieldPoliciesRepository.save(entity);
  }

  async detail(scope: TenantParkScope, id: string): Promise<FieldPolicyEntity> {
    const entity = await this.fieldPoliciesRepository.findOne({
      where: { id, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Field policy not found");
    }
    return entity;
  }

  async update(scope: TenantParkScope, actorId: string, id: string, dto: UpdateFieldPolicyDto): Promise<FieldPolicyEntity> {
    const entity = await this.detail(scope, id);
    const moduleName = dto.module ?? entity.module;
    const entityName = dto.entity ?? entity.entity;
    const fieldKey = dto.fieldKey ?? entity.fieldKey;
    if (moduleName !== entity.module || entityName !== entity.entity || fieldKey !== entity.fieldKey) {
      await this.assertFieldAvailable(scope, moduleName, entityName, fieldKey);
    }
    Object.assign(entity, {
      module: moduleName,
      entity: entityName,
      fieldKey,
      fieldName: dto.fieldName ?? entity.fieldName,
      policyType: dto.policyType ?? entity.policyType,
      maskRule: dto.maskRule === undefined ? entity.maskRule : dto.maskRule,
      status: dto.status ?? entity.status,
      remark: dto.remark ?? entity.remark,
      updateBy: actorId
    });
    return this.fieldPoliciesRepository.save(entity);
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    const boundRoles = await this.roleFieldPoliciesRepository.count({
      where: { tenantId: scope.tenantId, fieldPolicyId: id, isDeleted: false }
    });
    if (boundRoles > 0) {
      throw new BadRequestException("Field policy has bound roles and cannot be deleted");
    }
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.fieldPoliciesRepository.save(entity);
    return { id };
  }

  async listRolePolicies(scope: TenantParkScope, roleId: string): Promise<FieldPolicyEntity[]> {
    await this.mustFindRole(scope, roleId);
    const links = await this.roleFieldPoliciesRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId, isDeleted: false },
      relations: { fieldPolicy: true },
      order: { createTime: "ASC" }
    });
    return links
      .map((link) => link.fieldPolicy)
      .filter(
        (policy) =>
          policy &&
          policy.tenantId === scope.tenantId &&
          !policy.isDeleted
      );
  }

  async assignRolePolicies(
    scope: TenantParkScope,
    actorId: string,
    roleId: string,
    dto: AssignRoleFieldPoliciesDto
  ): Promise<{ roleId: string; fieldPolicyIds: string[] }> {
    const fieldPolicyIds = [...new Set(dto.fieldPolicyIds)];
    if (fieldPolicyIds.length !== dto.fieldPolicyIds.length) {
      throw new BadRequestException("Field policy ids must be unique");
    }
    if (fieldPolicyIds.length > 0) {
      const policies = await this.fieldPoliciesRepository.find({
        where: {
          id: In(fieldPolicyIds),
          tenantId: scope.tenantId,
          isDeleted: false,
          status: "enabled"
        }
      });
      if (policies.length !== fieldPolicyIds.length) {
        throw new NotFoundException("Field policy not found in current tenant");
      }
    }
    await this.roleFieldPoliciesRepository.manager.transaction(async (manager) => {
      const role = await manager.getRepository(RoleEntity).createQueryBuilder("role")
        .setLock("pessimistic_write")
        .where("role.id=:roleId", { roleId })
        .andWhere("role.tenant_id=:tenantId", { tenantId: scope.tenantId })
        .andWhere("(role.role_scope='tenant' OR role.park_id=:parkId)", { parkId: scope.parkId })
        .andWhere("role.is_deleted=false")
        .getOne();
      if (!role) throw new NotFoundException("Role not found");
      if (role.isTemplate === true || role.isSystem === true || role.isBuiltin === true || role.editable === false || role.isEditable === false) {
        throw new ForbiddenException("Protected role bindings cannot be changed");
      }
      const linksRepository = manager.getRepository(RoleFieldPolicyEntity);
      await linksRepository.update(
        { tenantId: scope.tenantId, parkId: scope.parkId, roleId, isDeleted: false },
        { isDeleted: true, updateBy: actorId }
      );
      if (fieldPolicyIds.length > 0) {
        await linksRepository.save(
          fieldPolicyIds.map((fieldPolicyId) =>
            linksRepository.create({
              tenantId: scope.tenantId,
              parkId: scope.parkId,
              roleId,
              fieldPolicyId,
              createBy: actorId,
              updateBy: actorId
            })
          )
        );
      }
    });
    return { roleId, fieldPolicyIds };
  }

  async getUserFieldPolicies(scope: TenantParkScope, user: JwtPrincipal): Promise<FieldPolicyContext[]> {
    const policies = user.isSuper
      ? await this.fieldPoliciesRepository.find({
          where: { tenantId: scope.tenantId, isDeleted: false, status: "enabled" },
          order: { module: "ASC", entity: "ASC", fieldKey: "ASC" }
        })
      : await this.getPoliciesForRoles(scope, await this.resolveUserRoleIds(scope, user));
    return this.toContext(this.resolveEffectivePolicies(policies));
  }

  async applyFieldPolicies<T extends object>(
    scope: TenantParkScope,
    user: JwtPrincipal | undefined,
    moduleName: string,
    entityName: string,
    record: T
  ): Promise<T> {
    if (!user || user.isSuper) return record;
    const policies = await this.getUserFieldPolicies(scope, user);
    return this.applyResolvedFieldPolicies(moduleName, entityName, record, policies);
  }

  applyResolvedFieldPolicies<T extends object>(
    moduleName: string,
    entityName: string,
    record: T,
    policies: readonly FieldPolicyContext[]
  ): T {
    const relevant = policies.filter((policy) => policy.module === moduleName && policy.entity === entityName);
    if (relevant.length === 0) {
      return record;
    }
    const cloned: Record<string, unknown> = { ...(record as Record<string, unknown>) };
    for (const policy of relevant) {
      const recordFieldKey = this.resolveRecordFieldKey(cloned, policy.field_key);
      if (!recordFieldKey) continue;
      if (policy.policy_type === "hidden") {
        delete cloned[recordFieldKey];
      } else if (policy.policy_type === "masked") {
        cloned[recordFieldKey] = this.maskValue(cloned[recordFieldKey], policy.mask_rule);
      }
    }
    return cloned as T;
  }

  async applyFieldPoliciesToList<T extends object>(
    scope: TenantParkScope,
    user: JwtPrincipal | undefined,
    moduleName: string,
    entityName: string,
    records: T[]
  ): Promise<T[]> {
    return Promise.all(records.map((record) => this.applyFieldPolicies(scope, user, moduleName, entityName, record)));
  }

  async applyFieldPoliciesToProjection<T>(
    scope: TenantParkScope,
    user: JwtPrincipal | undefined,
    moduleName: string,
    projection: T
  ): Promise<T> {
    if (!user || user.isSuper) return projection;
    const policies = (await this.getUserFieldPolicies(scope, user))
      .filter((policy) => policy.module === moduleName && ["hidden", "masked"].includes(policy.policy_type));
    if (!policies.length) return projection;
    const cloned = structuredClone(projection) as T;
    for (const policy of policies) {
      this.applyProjectionPolicy(cloned, policy.field_key, policy.policy_type, policy.mask_rule);
    }
    return cloned;
  }

  maskValue(value: unknown, maskRule?: string | null): unknown {
    if (value === null || value === undefined) return value;
    const raw = String(value);
    if (raw.length === 0) return raw;
    switch (maskRule) {
      case "mobile":
        return raw.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
      case "email": {
        const [name, domain] = raw.split("@");
        if (!name || !domain) return raw.length <= 4 ? "****" : `${raw.slice(0, 2)}***${raw.slice(-2)}`;
        return `${name.length <= 2 ? name.slice(0, 1) : name.slice(0, 2)}***@${domain}`;
      }
      case "id_card":
        return raw.length <= 8 ? "****" : `${raw.slice(0, 4)}********${raw.slice(-4)}`;
      case "bank_account":
        return raw.length <= 8 ? "****" : `${raw.slice(0, 4)} **** **** ${raw.slice(-4)}`;
      case "amount":
        return "***";
      case "custom":
        return raw.length <= 4 ? "****" : `${raw.slice(0, 2)}***${raw.slice(-2)}`;
      case "file_name":
        return raw.replace(/(.{2}).*(\.[^.]+)$/u, "$1***$2");
      default:
        return raw.length <= 2 ? "*" : `${raw.slice(0, 1)}***${raw.slice(-1)}`;
    }
  }

  private resolveRecordFieldKey(record: Record<string, unknown>, fieldKey: string): string | null {
    return this.fieldKeyCandidates(fieldKey).find((candidate) => candidate in record) ?? null;
  }

  private applyProjectionPolicy(
    value: unknown,
    fieldKey: string,
    policyType: FieldPolicyContext["policy_type"],
    maskRule?: string | null
  ): void {
    const segments = fieldKey.split(".").filter(Boolean);
    if (!segments.length) return;
    const applyAt = (target: unknown, index: number): boolean => {
      if (Array.isArray(target)) {
        let matched = false;
        for (const item of target) matched = applyAt(item, index) || matched;
        return matched;
      }
      if (!target || typeof target !== "object") return false;
      const record = target as Record<string, unknown>;
      const segment = segments[index]!;
      const key = [segment, this.toCamelCase(segment)].find((candidate) => candidate in record);
      if (!key) return false;
      if (index < segments.length - 1) return applyAt(record[key], index + 1);
      if (policyType === "hidden") delete record[key];
      else if (policyType === "masked") record[key] = this.maskValue(record[key], maskRule);
      return true;
    };
    if (!applyAt(value, 0)) {
      const leaf = segments.at(-1)!;
      const visited = new WeakSet<object>();
      const applyLeafEverywhere = (target: unknown): void => {
        if (Array.isArray(target)) {
          for (const item of target) applyLeafEverywhere(item);
          return;
        }
        if (!target || typeof target !== "object") return;
        if (visited.has(target)) return;
        visited.add(target);
        const record = target as Record<string, unknown>;
        const key = [leaf, this.toCamelCase(leaf)].find((candidate) => candidate in record);
        if (key) {
          if (policyType === "hidden") delete record[key];
          else if (policyType === "masked") record[key] = this.maskValue(record[key], maskRule);
        }
        for (const child of Object.values(record)) applyLeafEverywhere(child);
      };
      applyLeafEverywhere(value);
    }
  }

  private fieldKeyCandidates(fieldKey: string): string[] {
    const normalized = fieldKey.trim();
    const leaf = normalized.split(".").filter(Boolean).at(-1) ?? normalized;
    return [...new Set([normalized, this.toCamelCase(normalized), leaf, this.toCamelCase(leaf)])];
  }

  private toCamelCase(value: string): string {
    return value.replace(/[_-]([a-zA-Z0-9])/g, (_match, letter: string) => letter.toUpperCase());
  }

  private async getPoliciesForRoles(scope: TenantParkScope, roleIds: string[]): Promise<FieldPolicyEntity[]> {
    if (roleIds.length === 0) {
      return [];
    }
    const links = await this.roleFieldPoliciesRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, roleId: In(roleIds), isDeleted: false },
      relations: { fieldPolicy: true }
    });
    return links
      .map((link) => link.fieldPolicy)
      .filter(
        (policy) =>
          policy &&
          policy.tenantId === scope.tenantId &&
          !policy.isDeleted &&
          policy.status === "enabled"
      );
  }

  private resolveEffectivePolicies(policies: FieldPolicyEntity[]): FieldPolicyEntity[] {
    const rank: Record<FieldPolicyType, number> = { hidden: 5, masked: 4, readonly: 3, visible: 2, editable: 1 };
    const result = new Map<string, FieldPolicyEntity>();
    for (const policy of policies) {
      const key = `${policy.module}.${policy.entity}.${policy.fieldKey}`;
      const current = result.get(key);
      if (!current || rank[policy.policyType] > rank[current.policyType]) {
        result.set(key, policy);
      }
    }
    return [...result.values()];
  }

  private toContext(policies: FieldPolicyEntity[]): FieldPolicyContext[] {
    return policies.map((policy) => ({
      module: policy.module,
      entity: policy.entity,
      field_key: policy.fieldKey,
      field_name: policy.fieldName,
      policy_type: policy.policyType,
      mask_rule: policy.maskRule
    }));
  }

  private async resolveUserRoleIds(scope: TenantParkScope, user: JwtPrincipal): Promise<string[]> {
    const roleLinks = await this.userRoleRepository.find({
      where: { tenantId: scope.tenantId, parkId: scope.parkId, userId: user.sub, isDeleted: false },
      relations: { role: true }
    });
    return roleLinks
      .filter(
        (link) =>
          link.role &&
          link.role.tenantId === scope.tenantId &&
          (link.role.roleScope === "tenant" || link.role.parkId === scope.parkId) &&
          !link.role.isDeleted &&
          link.role.isEnabled
      )
      .map((link) => link.roleId);
  }

  private async assertFieldAvailable(scope: TenantParkScope, moduleName: string, entityName: string, fieldKey: string): Promise<void> {
    const exists = await this.fieldPoliciesRepository.exists({
      where: {
        tenantId: scope.tenantId,
        module: moduleName,
        entity: entityName,
        fieldKey,
        isDeleted: false
      }
    });
    if (exists) {
      throw new ConflictException("Field policy already exists");
    }
  }

  private async mustFindRole(scope: TenantParkScope, roleId: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findOne({
      where: [
        { id: roleId, tenantId: scope.tenantId, roleScope: "tenant", isDeleted: false },
        { id: roleId, tenantId: scope.tenantId, parkId: scope.parkId, roleScope: "park", isDeleted: false }
      ]
    });
    if (!role) {
      throw new NotFoundException("Role not found in current tenant");
    }
    return role;
  }
}
