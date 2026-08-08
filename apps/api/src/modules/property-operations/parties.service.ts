import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  SYSTEM_PERMISSIONS,
  type PartyDetailResponse,
  type PartyListItemResponse,
  type PartyListResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { Brackets, IsNull, Not, type Repository } from "typeorm";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type {
  AddPartyRoleDto,
  CreatePartyDto,
  PartyQueryDto,
  UpdatePartyDto,
  VerifyPartyDto
} from "./dto/party.dto";
import { PartyRoleEntity } from "./entities/party-role.entity";
import { PartyEntity } from "./entities/party.entity";
import { PartySensitiveDataService } from "./party-sensitive-data.service";
import {
  didPartyIdentityChange,
  isValidPartyIdentityNumber,
  normalizePartyIdentityNumber
} from "./party-identity.policy";

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(PartyEntity)
    private readonly partiesRepository: Repository<PartyEntity>,
    @InjectRepository(PartyRoleEntity)
    private readonly rolesRepository: Repository<PartyRoleEntity>,
    private readonly sensitiveDataService: PartySensitiveDataService
  ) {}

  async list(
    scope: TenantParkScope,
    query: PartyQueryDto,
    actor: JwtPrincipal
  ): Promise<PartyListResponse> {
    return this.listWithProjection(scope, query, actor, true);
  }

  async listForDomainProjection(
    scope: TenantParkScope,
    query: PartyQueryDto,
    actor: JwtPrincipal,
    housingUnitIds: string[] | null = null
  ): Promise<PartyListResponse> {
    if (housingUnitIds !== null && !housingUnitIds.length) {
      return { items: [], total: 0, page: query.page, page_size: query.page_size };
    }
    return this.listWithProjection(scope, query, actor, false, housingUnitIds);
  }

  private async listWithProjection(
    scope: TenantParkScope,
    query: PartyQueryDto,
    actor: JwtPrincipal,
    applyProjection: boolean,
    housingUnitIds: string[] | null = null
  ): Promise<PartyListResponse> {
    const builder = this.partiesRepository.createQueryBuilder("party")
      .where("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("party.is_deleted = false");
    if (query.party_type) builder.andWhere("party.party_type = :partyType", { partyType: query.party_type });
    if (housingUnitIds !== null) {
      builder.andWhere(
        `EXISTS (
          SELECT 1
          FROM biz_housing_lease scoped_lease
          WHERE scoped_lease.tenant_id = party.tenant_id
            AND scoped_lease.park_id = party.park_id
            AND scoped_lease.is_deleted = false
            AND (
              scoped_lease.unit_id IN (:...housingUnitIds)
              OR EXISTS (
                SELECT 1
                FROM biz_property_occupancy scoped_occupancy
                WHERE scoped_occupancy.id = scoped_lease.occupancy_id
                  AND scoped_occupancy.tenant_id = scoped_lease.tenant_id
                  AND scoped_occupancy.park_id = scoped_lease.park_id
                  AND scoped_occupancy.unit_id IN (:...housingUnitIds)
                  AND scoped_occupancy.is_deleted = false
              )
            )
            AND (
              scoped_lease.tenant_party_id = party.id
              OR EXISTS (
                SELECT 1
                FROM rel_housing_lease_occupant scoped_occupant
                WHERE scoped_occupant.tenant_id = scoped_lease.tenant_id
                  AND scoped_occupant.park_id = scoped_lease.park_id
                  AND scoped_occupant.lease_id = scoped_lease.id
                  AND scoped_occupant.party_id = party.id
                  AND scoped_occupant.is_deleted = false
              )
            )
        )`,
        { housingUnitIds }
      );
    }
    if (query.keyword) {
      builder.andWhere(new Brackets((nested) => {
        nested.where("party.display_name ILIKE :keyword", { keyword: `%${query.keyword}%` });
        if (this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ)) {
          nested.orWhere("party.mobile ILIKE :keyword", { keyword: `%${query.keyword}%` });
        }
      }));
    }
    const sortColumns = {
      displayName: "party.display_name",
      createTime: "party.create_time",
      verificationStatus: "party.verification_status"
    } as const;
    const direction = query.order
      ? (query.order === "asc" ? "ASC" : "DESC")
      : "DESC";
    const [items, total] = await builder
      .orderBy(sortColumns[query.sort ?? "createTime"], direction)
      .addOrderBy("party.id", "ASC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return {
      items: items.map((item) => this.toResponse(item, applyProjection ? actor : undefined)),
      total,
      page: query.page,
      page_size: query.page_size
    };
  }

  async detail(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<PartyDetailResponse> {
    const canReadSensitive = this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ);
    const builder = this.partiesRepository.createQueryBuilder("party")
      .where("party.id = :id", { id })
      .andWhere("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("party.is_deleted = false");
    if (canReadSensitive) builder.addSelect("party.identityNumberEncrypted");
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Party not found");
    const [roles, response] = await Promise.all([
      this.rolesRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, partyId: id, isDeleted: false },
        order: { createTime: "ASC" }
      }),
      Promise.resolve(this.toResponse(entity, actor,
        canReadSensitive
          ? this.sensitiveDataService.decrypt(entity.identityNumberEncrypted)
          : undefined))
    ]);
    return {
      ...response,
      roles: roles.map((role) => ({
        id: role.id,
        roleType: role.roleType,
        sourceType: role.sourceType,
        sourceId: role.sourceId,
        status: role.status,
        createTime: role.createTime.toISOString()
      }))
    };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePartyDto) {
    const identityDocumentType = dto.identity_document_type?.trim() ?? null;
    const identity = normalizePartyIdentityNumber(identityDocumentType, dto.identity_number);
    await this.assertNoLegacyIdentityDuplicate(this.partiesRepository, scope, identityDocumentType, identity);
    const entity = this.partiesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      partyType: dto.party_type,
      displayName: dto.display_name.trim(),
      mobile: dto.mobile?.trim() ?? null,
      email: dto.email?.trim() ?? null,
      identityDocumentType,
      identityNumberEncrypted: identity ? this.sensitiveDataService.encrypt(identity) : null,
      identityNumberHash: identity ? this.sensitiveDataService.hash(identity) : null,
      identityNumberMasked: identity ? this.sensitiveDataService.mask(identity) : null,
      sourceDomain: dto.source_domain ?? null,
      verificationStatus: "unverified",
      consentStatus: dto.consent_status ?? "pending",
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: dto.remark?.trim() ?? null
    });
    try {
      return this.toResponse(await this.partiesRepository.save(entity));
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException("Party identity already exists in current tenant and park");
      throw error;
    }
  }

  async update(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: UpdatePartyDto) {
    try {
      return await this.partiesRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(PartyEntity);
        const entity = await this.mustFind(scope, id, true, repository, true);
        const previousIdentityDocumentType = entity.identityDocumentType;
        const previousIdentityNumberHash = entity.identityNumberHash;
        const effectiveIdentityDocumentType = dto.identity_document_type !== undefined
          ? dto.identity_document_type?.trim() ?? null
          : entity.identityDocumentType;
        const identity = dto.identity_number !== undefined
          ? normalizePartyIdentityNumber(effectiveIdentityDocumentType, dto.identity_number)
          : undefined;
        if (identity && !isValidPartyIdentityNumber(effectiveIdentityDocumentType, identity)) {
          throw new BadRequestException("identity_number does not match identity_document_type");
        }
        await this.assertNoLegacyIdentityDuplicate(
          repository,
          scope,
          effectiveIdentityDocumentType,
          identity,
          entity.id
        );
        if (dto.party_type !== undefined) entity.partyType = dto.party_type;
        if (dto.display_name !== undefined) entity.displayName = dto.display_name.trim();
        if (dto.mobile !== undefined) entity.mobile = dto.mobile?.trim() ?? null;
        if (dto.email !== undefined) entity.email = dto.email?.trim() ?? null;
        if (dto.identity_document_type !== undefined) {
          entity.identityDocumentType = effectiveIdentityDocumentType;
          if (
            dto.identity_number === undefined
            && entity.identityDocumentType !== previousIdentityDocumentType
          ) {
            entity.identityNumberEncrypted = null;
            entity.identityNumberHash = null;
            entity.identityNumberMasked = null;
          }
        }
        if (dto.identity_number !== undefined) {
          entity.identityNumberEncrypted = identity ? this.sensitiveDataService.encrypt(identity) : null;
          entity.identityNumberHash = identity ? this.sensitiveDataService.hash(identity) : null;
          entity.identityNumberMasked = identity ? this.sensitiveDataService.mask(identity) : null;
          if (!identity) entity.identityDocumentType = null;
        }
        if (dto.source_domain !== undefined) entity.sourceDomain = dto.source_domain;
        if (dto.consent_status !== undefined) entity.consentStatus = dto.consent_status;
        if (dto.remark !== undefined) entity.remark = dto.remark?.trim() ?? null;
        if (didPartyIdentityChange(
          previousIdentityDocumentType,
          previousIdentityNumberHash,
          entity.identityDocumentType,
          entity.identityNumberHash
        )) {
          entity.verificationStatus = "unverified";
        }
        entity.updateBy = actor.sub;
        return this.toResponse(await repository.save(entity));
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException("Party identity already exists in current tenant and park");
      throw error;
    }
  }

  async verify(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: VerifyPartyDto) {
    return this.partiesRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(PartyEntity);
      const entity = await this.mustFind(scope, id, true, repository, true);
      if (dto.verification_status === "verified" && (!entity.identityDocumentType || !entity.identityNumberEncrypted)) {
        throw new ConflictException("Identity document type and number are required before verification");
      }
      entity.verificationStatus = dto.verification_status;
      if (dto.remark !== undefined) entity.remark = dto.remark?.trim() ?? null;
      entity.updateBy = actor.sub;
      return this.toResponse(await repository.save(entity));
    });
  }

  async addRole(scope: TenantParkScope, actor: JwtPrincipal, dto: AddPartyRoleDto) {
    const roleType = dto.role_type.trim();
    if (!roleType) throw new BadRequestException("role_type is required");
    await this.mustFind(scope, dto.party_id);
    const sourceType = dto.source_type?.trim() ?? null;
    const sourceId = dto.source_id?.trim() ?? null;
    const where = {
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      partyId: dto.party_id,
      roleType,
      sourceType: sourceType ?? IsNull(),
      sourceId: sourceId ?? IsNull(),
      isDeleted: false
    };
    const existing = await this.rolesRepository.findOne({
      where
    });
    if (existing) return existing;
    try {
      return await this.rolesRepository.save(this.rolesRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        partyId: dto.party_id,
        roleType,
        sourceType,
        sourceId,
        status: "active",
        createBy: actor.sub,
        updateBy: actor.sub,
        remark: dto.remark?.trim() ?? null
      }));
    } catch (error) {
      if (!this.isUniqueViolation(error)) throw error;
      const concurrent = await this.rolesRepository.findOne({ where });
      if (concurrent) return concurrent;
      throw error;
    }
  }

  async removeRole(scope: TenantParkScope, actor: JwtPrincipal, roleId: string) {
    const role = await this.rolesRepository.findOne({
      where: { id: roleId, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!role) throw new NotFoundException("Party role not found");
    role.isDeleted = true;
    role.status = "inactive";
    role.updateBy = actor.sub;
    return this.rolesRepository.save(role);
  }

  private async mustFind(
    scope: TenantParkScope,
    id: string,
    includeSensitive = false,
    repository: Repository<PartyEntity> = this.partiesRepository,
    lock = false
  ): Promise<PartyEntity> {
    const builder = repository.createQueryBuilder("party")
      .where("party.id = :id", { id })
      .andWhere("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("party.is_deleted = false");
    if (includeSensitive) {
      builder.addSelect("party.identityNumberEncrypted").addSelect("party.identityNumberHash");
    }
    if (lock) builder.setLock("pessimistic_write");
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Party not found");
    return entity;
  }

  projectForActor(entity: PartyListItemResponse, actor: JwtPrincipal): PartyListItemResponse {
    if (this.hasPermission(actor, SYSTEM_PERMISSIONS.PARTY_SENSITIVE_READ)) {
      return { ...entity };
    }
    const publicFields = { ...entity };
    delete publicFields.mobile;
    delete publicFields.email;
    delete publicFields.identityDocumentType;
    delete publicFields.identityNumberMasked;
    delete publicFields.identityNumber;
    return publicFields;
  }

  private toResponse(
    entity: PartyEntity,
    actor?: JwtPrincipal,
    identityNumber?: string | null
  ): PartyListItemResponse {
    const response: PartyListItemResponse = {
      id: entity.id,
      tenantId: entity.tenantId,
      parkId: entity.parkId,
      partyType: entity.partyType,
      displayName: entity.displayName,
      mobile: entity.mobile,
      email: entity.email,
      identityDocumentType: entity.identityDocumentType,
      identityNumberMasked: entity.identityNumberMasked,
      sourceDomain: entity.sourceDomain,
      verificationStatus: entity.verificationStatus,
      consentStatus: entity.consentStatus,
      createTime: entity.createTime.toISOString(),
      updateTime: entity.updateTime.toISOString(),
      version: entity.version,
      remark: entity.remark
    };
    if (identityNumber !== undefined) response.identityNumber = identityNumber;
    return actor ? this.projectForActor(response, actor) : response;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private async assertNoLegacyIdentityDuplicate(
    repository: Repository<PartyEntity>,
    scope: TenantParkScope,
    documentType: string | null,
    identity: string | null | undefined,
    excludedId?: string
  ): Promise<void> {
    if (documentType !== "id_card" || !identity?.endsWith("X")) return;
    const legacyIdentity = `${identity.slice(0, -1)}x`;
    const existing = await repository.findOne({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        identityDocumentType: documentType,
        identityNumberHash: this.sensitiveDataService.hash(legacyIdentity),
        isDeleted: false,
        ...(excludedId ? { id: Not(excludedId) } : {})
      }
    });
    if (existing) throw new ConflictException("Party identity already exists in current tenant and park");
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
