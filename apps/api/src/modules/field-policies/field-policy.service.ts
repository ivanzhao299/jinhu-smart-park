import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
      parkId: scope.parkId,
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
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
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
      where: { tenantId: scope.tenantId, roleId, isDeleted: false },
      relations: { fieldPolicy: true },
      order: { createTime: "ASC" }
    });
    return links.map((link) => link.fieldPolicy).filter((policy) => policy && !policy.isDeleted);
  }

  async assignRolePolicies(
    scope: TenantParkScope,
    actorId: string,
    roleId: string,
    dto: AssignRoleFieldPoliciesDto
  ): Promise<{ roleId: string; fieldPolicyIds: string[] }> {
    await this.mustFindRole(scope, roleId);
    await this.roleFieldPoliciesRepository.update(
      { tenantId: scope.tenantId, roleId, isDeleted: false },
      { isDeleted: true, updateBy: actorId }
    );
    if (dto.fieldPolicyIds.length === 0) {
      return { roleId, fieldPolicyIds: [] };
    }
    const policies = await this.fieldPoliciesRepository.find({
      where: { id: In(dto.fieldPolicyIds), tenantId: scope.tenantId, isDeleted: false, status: "enabled" }
    });
    if (policies.length !== dto.fieldPolicyIds.length) {
      throw new NotFoundException("Field policy not found in current tenant");
    }
    await this.roleFieldPoliciesRepository.save(
      dto.fieldPolicyIds.map((fieldPolicyId) =>
        this.roleFieldPoliciesRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          roleId,
          fieldPolicyId,
          createBy: actorId,
          updateBy: actorId
        })
      )
    );
    return { roleId, fieldPolicyIds: dto.fieldPolicyIds };
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
      where: { tenantId: scope.tenantId, roleId: In(roleIds), isDeleted: false },
      relations: { fieldPolicy: true }
    });
    return links.map((link) => link.fieldPolicy).filter((policy) => policy && !policy.isDeleted && policy.status === "enabled");
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
      where: { tenantId: scope.tenantId, userId: user.sub, isDeleted: false },
      relations: { role: true }
    });
    return roleLinks.filter((link) => link.role && !link.role.isDeleted && link.role.isEnabled).map((link) => link.roleId);
  }

  private async assertFieldAvailable(scope: TenantParkScope, moduleName: string, entityName: string, fieldKey: string): Promise<void> {
    const exists = await this.fieldPoliciesRepository.exists({
      where: { tenantId: scope.tenantId, module: moduleName, entity: entityName, fieldKey, isDeleted: false }
    });
    if (exists) {
      throw new ConflictException("Field policy already exists");
    }
  }

  private async mustFindRole(scope: TenantParkScope, roleId: string): Promise<RoleEntity> {
    const role = await this.rolesRepository.findOne({
      where: { id: roleId, tenantId: scope.tenantId, isDeleted: false }
    });
    if (!role) {
      throw new NotFoundException("Role not found in current tenant");
    }
    return role;
  }
}
