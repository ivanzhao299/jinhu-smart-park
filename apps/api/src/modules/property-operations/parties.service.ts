import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SYSTEM_PERMISSIONS, type PaginatedResult, type TenantParkScope } from "@jinhu/shared";
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
import { didPartyIdentityChange } from "./party-identity.policy";

export interface PartyResponse {
  id: string;
  tenantId: string;
  parkId: string;
  partyType: string;
  displayName: string;
  mobile: string | null;
  email: string | null;
  identityDocumentType: string | null;
  identityNumberMasked: string | null;
  identityNumber?: string | null;
  sourceDomain: string | null;
  verificationStatus: string;
  consentStatus: string;
  createTime: Date;
  updateTime: Date;
  version: number;
  remark: string | null;
}

@Injectable()
export class PartiesService {
  constructor(
    @InjectRepository(PartyEntity)
    private readonly partiesRepository: Repository<PartyEntity>,
    @InjectRepository(PartyRoleEntity)
    private readonly rolesRepository: Repository<PartyRoleEntity>,
    private readonly sensitiveDataService: PartySensitiveDataService
  ) {}

  async list(scope: TenantParkScope, query: PartyQueryDto): Promise<PaginatedResult<PartyResponse>> {
    const builder = this.partiesRepository.createQueryBuilder("party")
      .where("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("party.is_deleted = false");
    if (query.party_type) builder.andWhere("party.party_type = :partyType", { partyType: query.party_type });
    if (query.keyword) {
      builder.andWhere(new Brackets((nested) => {
        nested.where("party.display_name ILIKE :keyword", { keyword: `%${query.keyword}%` })
          .orWhere("party.mobile ILIKE :keyword", { keyword: `%${query.keyword}%` });
      }));
    }
    const [items, total] = await builder.orderBy("party.update_time", "DESC")
      .skip((query.page - 1) * query.page_size)
      .take(query.page_size)
      .getManyAndCount();
    return { items: items.map((item) => this.toResponse(item)), total, page: query.page, page_size: query.page_size };
  }

  async detail(scope: TenantParkScope, actor: JwtPrincipal, id: string) {
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
      Promise.resolve(this.toResponse(
        entity,
        canReadSensitive ? this.sensitiveDataService.decrypt(entity.identityNumberEncrypted) : undefined
      ))
    ]);
    return { ...response, roles };
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, dto: CreatePartyDto) {
    const identity = dto.identity_number?.trim();
    const entity = this.partiesRepository.create({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      partyType: dto.party_type,
      displayName: dto.display_name.trim(),
      mobile: dto.mobile?.trim() ?? null,
      email: dto.email?.trim() ?? null,
      identityDocumentType: dto.identity_document_type?.trim() ?? null,
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
    const entity = await this.mustFind(scope, id, true);
    const previousIdentityDocumentType = entity.identityDocumentType;
    const previousIdentityNumberHash = entity.identityNumberHash;
    if (dto.party_type !== undefined) entity.partyType = dto.party_type;
    if (dto.display_name !== undefined) entity.displayName = dto.display_name.trim();
    if (dto.mobile !== undefined) entity.mobile = dto.mobile?.trim() ?? null;
    if (dto.email !== undefined) entity.email = dto.email?.trim() ?? null;
    if (dto.identity_document_type !== undefined) {
      entity.identityDocumentType = dto.identity_document_type?.trim() ?? null;
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
      const identity = dto.identity_number?.trim();
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
    try {
      return this.toResponse(await this.partiesRepository.save(entity));
    } catch (error) {
      if (this.isUniqueViolation(error)) throw new ConflictException("Party identity already exists in current tenant and park");
      throw error;
    }
  }

  async verify(scope: TenantParkScope, actor: JwtPrincipal, id: string, dto: VerifyPartyDto) {
    const entity = await this.mustFind(scope, id, true);
    if (dto.verification_status === "verified" && (!entity.identityDocumentType || !entity.identityNumberEncrypted)) {
      throw new ConflictException("Identity document type and number are required before verification");
    }
    entity.verificationStatus = dto.verification_status;
    if (dto.remark !== undefined) entity.remark = dto.remark?.trim() ?? null;
    entity.updateBy = actor.sub;
    return this.toResponse(await this.partiesRepository.save(entity));
  }

  async addRole(scope: TenantParkScope, actor: JwtPrincipal, dto: AddPartyRoleDto) {
    await this.mustFind(scope, dto.party_id);
    const roleType = dto.role_type.trim();
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

  private async mustFind(scope: TenantParkScope, id: string, includeSensitive = false): Promise<PartyEntity> {
    const builder = this.partiesRepository.createQueryBuilder("party")
      .where("party.id = :id", { id })
      .andWhere("party.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("party.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("party.is_deleted = false");
    if (includeSensitive) {
      builder.addSelect("party.identityNumberEncrypted").addSelect("party.identityNumberHash");
    }
    const entity = await builder.getOne();
    if (!entity) throw new NotFoundException("Party not found");
    return entity;
  }

  private toResponse(entity: PartyEntity, identityNumber?: string | null): PartyResponse {
    const response: PartyResponse = {
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
      createTime: entity.createTime,
      updateTime: entity.updateTime,
      version: entity.version,
      remark: entity.remark
    };
    if (identityNumber !== undefined) response.identityNumber = identityNumber;
    return response;
  }

  private hasPermission(actor: JwtPrincipal, permission: string): boolean {
    return Boolean(actor.isSuper || actor.permissions.includes("*") || actor.permissions.includes(permission));
  }

  private isUniqueViolation(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "23505");
  }
}
