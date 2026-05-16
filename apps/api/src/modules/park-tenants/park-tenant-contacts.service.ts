import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository, type SelectQueryBuilder } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import type { CreateParkTenantContactDto } from "./dto/create-park-tenant-contact.dto";
import type { UpdateParkTenantContactDto } from "./dto/update-park-tenant-contact.dto";
import { ParkTenantContactEntity } from "./entities/park-tenant-contact.entity";
import { ParkTenantEntity } from "./entities/park-tenant.entity";

@Injectable()
export class ParkTenantContactsService {
  constructor(
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(ParkTenantContactEntity)
    private readonly contactsRepository: Repository<ParkTenantContactEntity>,
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<ParkTenantContactEntity[]> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const items = await this.scopedContactsBuilder(scope, parkTenantId)
      .orderBy("contact.is_primary", "DESC")
      .addOrderBy("contact.create_time", "ASC")
      .getMany();
    return this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_contact", items);
  }

  async create(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string, dto: CreateParkTenantContactDto): Promise<ParkTenantContactEntity> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const created = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ParkTenantContactEntity);
      if (dto.isPrimary) {
        await repository
          .createQueryBuilder()
          .update(ParkTenantContactEntity)
          .set({ isPrimary: false, updateBy: actor.sub })
          .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("park_id = :parkId", { parkId: scope.parkId })
          .andWhere("park_tenant_id = :parkTenantId", { parkTenantId })
          .andWhere("is_deleted = false")
          .execute();
      }
      const entity = repository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        parkTenantId,
        contactName: dto.contactName.trim(),
        contactRole: this.emptyToNull(dto.contactRole),
        mobile: this.emptyToNull(dto.mobile),
        email: this.emptyToNull(dto.email),
        position: this.emptyToNull(dto.position),
        isPrimary: dto.isPrimary ?? false,
        isEmergency: dto.isEmergency ?? false,
        status: dto.status ?? 1,
        remark: this.emptyToNull(dto.remark),
        createBy: actor.sub,
        updateBy: actor.sub
      });
      return repository.save(entity);
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant_contact", created);
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    parkTenantId: string,
    contactId: string,
    dto: UpdateParkTenantContactDto
  ): Promise<ParkTenantContactEntity> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const updated = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(ParkTenantContactEntity);
      const entity = await this.mustFindContactWithRepository(repository, scope, parkTenantId, contactId);
      if (dto.isPrimary === true) {
        await repository
          .createQueryBuilder()
          .update(ParkTenantContactEntity)
          .set({ isPrimary: false, updateBy: actor.sub })
          .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
          .andWhere("park_id = :parkId", { parkId: scope.parkId })
          .andWhere("park_tenant_id = :parkTenantId", { parkTenantId })
          .andWhere("id <> :contactId", { contactId })
          .andWhere("is_deleted = false")
          .execute();
      }
      if (dto.contactName !== undefined) entity.contactName = dto.contactName.trim();
      if (dto.contactRole !== undefined) entity.contactRole = this.emptyToNull(dto.contactRole);
      if (dto.mobile !== undefined) entity.mobile = this.emptyToNull(dto.mobile);
      if (dto.email !== undefined) entity.email = this.emptyToNull(dto.email);
      if (dto.position !== undefined) entity.position = this.emptyToNull(dto.position);
      if (dto.isPrimary !== undefined) entity.isPrimary = dto.isPrimary;
      if (dto.isEmergency !== undefined) entity.isEmergency = dto.isEmergency;
      if (dto.status !== undefined) entity.status = dto.status;
      if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
      entity.updateBy = actor.sub;
      return repository.save(entity);
    });
    return this.fieldPolicyService.applyFieldPolicies(scope, actor, "leasing", "park_tenant_contact", updated);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string, contactId: string): Promise<{ id: string }> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const entity = await this.mustFindContact(scope, parkTenantId, contactId);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.contactsRepository.save(entity);
    return { id: contactId };
  }

  private async mustFindParkTenant(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<ParkTenantEntity> {
    const builder = this.parkTenantsRepository
      .createQueryBuilder("parkTenant")
      .where("parkTenant.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("parkTenant.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("parkTenant.id = :parkTenantId", { parkTenantId })
      .andWhere("parkTenant.is_deleted = false");
    await this.dataScopeService.applyToQueryBuilder(builder, scope, actor, "tenant_company", "parkTenant", { tenantCompany: "id" });
    const entity = await builder.getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant not found");
    }
    return entity;
  }

  private scopedContactsBuilder(scope: TenantParkScope, parkTenantId: string): SelectQueryBuilder<ParkTenantContactEntity> {
    return this.contactsRepository
      .createQueryBuilder("contact")
      .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contact.park_tenant_id = :parkTenantId", { parkTenantId })
      .andWhere("contact.is_deleted = false");
  }

  private async mustFindContact(scope: TenantParkScope, parkTenantId: string, contactId: string): Promise<ParkTenantContactEntity> {
    const entity = await this.scopedContactsBuilder(scope, parkTenantId)
      .andWhere("contact.id = :contactId", { contactId })
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant contact not found");
    }
    return entity;
  }

  private async mustFindContactWithRepository(
    repository: Repository<ParkTenantContactEntity>,
    scope: TenantParkScope,
    parkTenantId: string,
    contactId: string
  ): Promise<ParkTenantContactEntity> {
    const entity = await repository
      .createQueryBuilder("contact")
      .where("contact.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("contact.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("contact.park_tenant_id = :parkTenantId", { parkTenantId })
      .andWhere("contact.id = :contactId", { contactId })
      .andWhere("contact.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant contact not found");
    }
    return entity;
  }

  private emptyToNull(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
