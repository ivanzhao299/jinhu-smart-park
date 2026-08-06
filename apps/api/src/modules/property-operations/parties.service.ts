import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import {
  PROPERTY_BUSINESS_PERMISSIONS,
  SYSTEM_PERMISSIONS,
  type PartyIdentitySummary,
  type PartyDetailResponse,
  type PartyListItemResponse,
  type PartyListResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { Brackets, IsNull, type Repository } from "typeorm";
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
import { LegacyPartyIdentityAdapter } from "../property-identity/legacy-party-identity.adapter";
import {
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
    private readonly sensitiveDataService: PartySensitiveDataService,
    @Optional()
    private readonly identityAdapter?: LegacyPartyIdentityAdapter
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
    const summaries = await this.identitySummaries(scope, actor, items.map((item) => item.id));
    return {
      items: items.map((item) => this.withIdentitySummary(
        this.toResponse(item, applyProjection ? actor : undefined),
        summaries.get(item.id) ?? null
      )),
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
    const [roles, summaries] = await Promise.all([
      this.rolesRepository.find({
        where: { tenantId: scope.tenantId, parkId: scope.parkId, partyId: id, isDeleted: false },
        order: { createTime: "ASC" }
      }),
      this.identitySummaries(scope, actor, [id])
    ]);
    const response = this.withIdentitySummary(
      this.toResponse(entity, actor,
        canReadSensitive
          ? this.sensitiveDataService.decrypt(entity.identityNumberEncrypted)
          : undefined),
      summaries.get(id) ?? null
    );
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

  async create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: CreatePartyDto,
    clientKey?: string
  ) {
    const hasIdentityMutation = dto.identity_document_type !== undefined
      || dto.identity_number !== undefined;
    if (hasIdentityMutation) this.assertIdentityPermission(actor);
    const identityDocumentType = dto.identity_document_type?.trim() ?? null;
    const identity = normalizePartyIdentityNumber(identityDocumentType, dto.identity_number);
    const entity = this.partiesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      partyType: dto.party_type,
      displayName: dto.display_name.trim(),
      mobile: dto.mobile?.trim() ?? null,
      email: dto.email?.trim() ?? null,
      identityDocumentType: null,
      identityNumberEncrypted: null,
      identityNumberHash: null,
      identityNumberMasked: null,
      sourceDomain: dto.source_domain ?? null,
      verificationStatus: "unverified",
      consentStatus: dto.consent_status ?? "pending",
      createBy: actor.sub,
      updateBy: actor.sub,
      remark: dto.remark?.trim() ?? null
    });
    try {
      const saved = await this.partiesRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(PartyEntity);
        const persisted = await repository.save(entity);
        if (hasIdentityMutation) {
          if (!this.identityAdapter) throw new ConflictException("Identity runtime is unavailable");
          await this.identityAdapter.writeDraft(
            scope,
            actor,
            persisted.id,
            clientKey,
            identityDocumentType as "id_card" | "passport" | null,
            identity ?? null,
            manager
          );
        }
        return persisted;
      });
      const summaries = await this.identitySummaries(scope, actor, [saved.id]);
      return this.withIdentitySummary(this.toResponse(saved), summaries.get(saved.id) ?? null);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException("Party identity already exists in current tenant and park");
      throw error;
    }
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: UpdatePartyDto,
    clientKey?: string
  ) {
    const hasIdentityMutation = dto.identity_document_type !== undefined
      || dto.identity_number !== undefined;
    if (hasIdentityMutation) this.assertIdentityPermission(actor);
    let identityDocumentType: string | null = null;
    let identity: string | null = null;
    try {
      const updated = await this.partiesRepository.manager.transaction(async (manager) => {
        const repository = manager.getRepository(PartyEntity);
        const entity = await this.mustFind(scope, id, false, repository, true);
        identityDocumentType = dto.identity_document_type !== undefined
          ? dto.identity_document_type?.trim() ?? null
          : entity.identityDocumentType;
        identity = dto.identity_number !== undefined
          ? normalizePartyIdentityNumber(identityDocumentType, dto.identity_number) ?? null
          : null;
        if (identity && !isValidPartyIdentityNumber(identityDocumentType, identity)) {
          throw new BadRequestException("identity_number does not match identity_document_type");
        }
        if (dto.party_type !== undefined) entity.partyType = dto.party_type;
        if (dto.display_name !== undefined) entity.displayName = dto.display_name.trim();
        if (dto.mobile !== undefined) entity.mobile = dto.mobile?.trim() ?? null;
        if (dto.email !== undefined) entity.email = dto.email?.trim() ?? null;
        if (dto.source_domain !== undefined) entity.sourceDomain = dto.source_domain;
        if (dto.consent_status !== undefined) entity.consentStatus = dto.consent_status;
        if (dto.remark !== undefined) entity.remark = dto.remark?.trim() ?? null;
        entity.updateBy = actor.sub;
        const persisted = await repository.save(entity);
        if (hasIdentityMutation) {
          if (!this.identityAdapter) throw new ConflictException("Identity runtime is unavailable");
          await this.identityAdapter.writeDraft(
            scope,
            actor,
            id,
            clientKey,
            identityDocumentType as "id_card" | "passport" | null,
            identity,
            manager
          );
        }
        return persisted;
      });
      const summaries = await this.identitySummaries(scope, actor, [id]);
      return this.withIdentitySummary(this.toResponse(updated), summaries.get(id) ?? null);
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException("Party identity already exists in current tenant and park");
      throw error;
    }
  }

  async verify(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    dto: VerifyPartyDto,
    clientKey?: string
  ) {
    this.assertPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_VERIFY);
    if (!this.identityAdapter) throw new ConflictException("Identity runtime is unavailable");
    await this.partiesRepository.manager.transaction((manager) =>
      this.identityAdapter!.decide(
        scope,
        actor,
        id,
        clientKey,
        dto.verification_status,
        dto.remark,
        manager
      )
    );
    return this.detail(scope, actor, id);
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

  private identitySummaries(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    partyIds: readonly string[]
  ): Promise<Map<string, PartyIdentitySummary | null>> {
    if (this.identityAdapter) {
      return this.identityAdapter.identitySummaries(scope, actor, partyIds);
    }
    return Promise.resolve(new Map(
      partyIds.map((partyId) => [partyId, null] as const)
    ));
  }

  private withIdentitySummary(
    response: PartyListItemResponse,
    summary: PartyIdentitySummary | null
  ): PartyListItemResponse {
    return {
      ...response,
      verificationStatus: this.legacyVerificationStatus(summary, response.verificationStatus),
      identitySummary: summary
    } as PartyListItemResponse;
  }

  private legacyVerificationStatus(
    summary: PartyIdentitySummary | null,
    fallback: string
  ): string {
    if (!summary) return fallback;
    if (summary.status === "verified") return "verified";
    if (summary.status === "rejected") return "rejected";
    return "unverified";
  }

  private assertIdentityPermission(actor: JwtPrincipal): void {
    this.assertPermission(actor, PROPERTY_BUSINESS_PERMISSIONS.PARTY_IDENTITY_UPDATE);
  }

  private assertPermission(actor: JwtPrincipal, permission: string): void {
    if (!this.hasPermission(actor, permission)) {
      throw new ForbiddenException(`Permission ${permission} is required`);
    }
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

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
