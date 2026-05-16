import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, type Repository, type SelectQueryBuilder } from "typeorm";
import type { TenantParkScope } from "@jinhu/shared";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import { DataScopeService } from "../data-scopes/data-scope.service";
import { FieldPolicyService } from "../field-policies/field-policy.service";
import { FileEntity } from "../files/entities/file.entity";
import type { CreateParkTenantQualificationDto } from "./dto/create-park-tenant-qualification.dto";
import type { UpdateParkTenantQualificationDto } from "./dto/update-park-tenant-qualification.dto";
import { ParkTenantQualificationEntity } from "./entities/park-tenant-qualification.entity";
import { ParkTenantEntity } from "./entities/park-tenant.entity";

const QUALIFICATION_FILE_BIZ_TYPE = "park_tenant_qualification";

@Injectable()
export class ParkTenantQualificationsService {
  constructor(
    @InjectRepository(ParkTenantEntity)
    private readonly parkTenantsRepository: Repository<ParkTenantEntity>,
    @InjectRepository(ParkTenantQualificationEntity)
    private readonly qualificationsRepository: Repository<ParkTenantQualificationEntity>,
    @InjectRepository(FileEntity)
    private readonly filesRepository: Repository<FileEntity>,
    private readonly dataSource: DataSource,
    private readonly dataScopeService: DataScopeService,
    private readonly fieldPolicyService: FieldPolicyService
  ) {}

  async list(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string): Promise<ParkTenantQualificationEntity[]> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const items = await this.scopedQualificationsBuilder(scope, parkTenantId)
      .leftJoinAndSelect("qualification.file", "file")
      .orderBy("qualification.expire_date", "ASC", "NULLS LAST")
      .addOrderBy("qualification.create_time", "DESC")
      .getMany();
    return this.applyQualificationFieldPolicies(scope, actor, items);
  }

  async create(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    parkTenantId: string,
    dto: CreateParkTenantQualificationDto
  ): Promise<ParkTenantQualificationEntity> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const created = await this.dataSource.transaction(async (manager) => {
      const qualificationRepository = manager.getRepository(ParkTenantQualificationEntity);
      const fileRepository = manager.getRepository(FileEntity);
      if (dto.fileId) {
        await this.mustFindAssignableFile(fileRepository, qualificationRepository, scope, dto.fileId);
      }
      const entity = await qualificationRepository.save(
        qualificationRepository.create({
          tenantId: scope.tenantId,
          parkId: scope.parkId,
          parkTenantId,
          qualificationType: dto.qualificationType.trim(),
          qualificationName: dto.qualificationName.trim(),
          certificateNo: this.emptyToNull(dto.certificateNo),
          issueDate: this.emptyToNull(dto.issueDate),
          expireDate: this.emptyToNull(dto.expireDate),
          fileId: dto.fileId ?? null,
          status: dto.status ?? 1,
          remark: this.emptyToNull(dto.remark),
          createBy: actor.sub,
          updateBy: actor.sub
        })
      );
      if (dto.fileId) {
        await this.bindFileToQualification(fileRepository, scope, actor.sub, dto.fileId, entity.id);
      }
      return entity;
    });
    return this.detailEntity(scope, actor, parkTenantId, created.id);
  }

  async update(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    parkTenantId: string,
    qualificationId: string,
    dto: UpdateParkTenantQualificationDto
  ): Promise<ParkTenantQualificationEntity> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    await this.dataSource.transaction(async (manager) => {
      const qualificationRepository = manager.getRepository(ParkTenantQualificationEntity);
      const fileRepository = manager.getRepository(FileEntity);
      const entity = await this.mustFindQualificationWithRepository(qualificationRepository, scope, parkTenantId, qualificationId);
      if (dto.fileId !== undefined && dto.fileId !== entity.fileId) {
        await this.mustFindAssignableFile(fileRepository, qualificationRepository, scope, dto.fileId, qualificationId);
        entity.fileId = dto.fileId;
      }
      if (dto.qualificationType !== undefined) entity.qualificationType = dto.qualificationType.trim();
      if (dto.qualificationName !== undefined) entity.qualificationName = dto.qualificationName.trim();
      if (dto.certificateNo !== undefined) entity.certificateNo = this.emptyToNull(dto.certificateNo);
      if (dto.issueDate !== undefined) entity.issueDate = this.emptyToNull(dto.issueDate);
      if (dto.expireDate !== undefined) entity.expireDate = this.emptyToNull(dto.expireDate);
      if (dto.status !== undefined) entity.status = dto.status;
      if (dto.remark !== undefined) entity.remark = this.emptyToNull(dto.remark);
      entity.updateBy = actor.sub;
      await qualificationRepository.save(entity);
      if (dto.fileId !== undefined) {
        await this.bindFileToQualification(fileRepository, scope, actor.sub, dto.fileId, qualificationId);
      }
    });
    return this.detailEntity(scope, actor, parkTenantId, qualificationId);
  }

  async softDelete(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string, qualificationId: string): Promise<{ id: string }> {
    await this.mustFindParkTenant(scope, actor, parkTenantId);
    const entity = await this.mustFindQualification(scope, parkTenantId, qualificationId);
    entity.isDeleted = true;
    entity.updateBy = actor.sub;
    await this.qualificationsRepository.save(entity);
    return { id: qualificationId };
  }

  private async detailEntity(scope: TenantParkScope, actor: JwtPrincipal, parkTenantId: string, qualificationId: string): Promise<ParkTenantQualificationEntity> {
    const entity = await this.scopedQualificationsBuilder(scope, parkTenantId)
      .leftJoinAndSelect("qualification.file", "file")
      .andWhere("qualification.id = :qualificationId", { qualificationId })
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant qualification not found");
    }
    const [secured] = await this.applyQualificationFieldPolicies(scope, actor, [entity]);
    return secured ?? entity;
  }

  private async applyQualificationFieldPolicies(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    items: ParkTenantQualificationEntity[]
  ): Promise<ParkTenantQualificationEntity[]> {
    const secured = await this.fieldPolicyService.applyFieldPoliciesToList(scope, actor, "leasing", "park_tenant_qualification", items);
    return secured.map((item) => {
      const record = item as ParkTenantQualificationEntity & Record<string, unknown>;
      if (!Object.prototype.hasOwnProperty.call(record, "fileId")) {
        record.file = null;
      }
      return record;
    });
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

  private scopedQualificationsBuilder(scope: TenantParkScope, parkTenantId: string): SelectQueryBuilder<ParkTenantQualificationEntity> {
    return this.qualificationsRepository
      .createQueryBuilder("qualification")
      .where("qualification.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("qualification.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("qualification.park_tenant_id = :parkTenantId", { parkTenantId })
      .andWhere("qualification.is_deleted = false");
  }

  private async mustFindQualification(scope: TenantParkScope, parkTenantId: string, qualificationId: string): Promise<ParkTenantQualificationEntity> {
    const entity = await this.scopedQualificationsBuilder(scope, parkTenantId)
      .andWhere("qualification.id = :qualificationId", { qualificationId })
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant qualification not found");
    }
    return entity;
  }

  private async mustFindQualificationWithRepository(
    repository: Repository<ParkTenantQualificationEntity>,
    scope: TenantParkScope,
    parkTenantId: string,
    qualificationId: string
  ): Promise<ParkTenantQualificationEntity> {
    const entity = await repository
      .createQueryBuilder("qualification")
      .where("qualification.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("qualification.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("qualification.park_tenant_id = :parkTenantId", { parkTenantId })
      .andWhere("qualification.id = :qualificationId", { qualificationId })
      .andWhere("qualification.is_deleted = false")
      .getOne();
    if (!entity) {
      throw new NotFoundException("Park tenant qualification not found");
    }
    return entity;
  }

  private async mustFindAssignableFile(
    fileRepository: Repository<FileEntity>,
    qualificationRepository: Repository<ParkTenantQualificationEntity>,
    scope: TenantParkScope,
    fileId: string,
    currentQualificationId?: string
  ): Promise<FileEntity> {
    const file = await fileRepository
      .createQueryBuilder("file")
      .where("file.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("file.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("file.id = :fileId", { fileId })
      .andWhere("file.biz_type = :bizType", { bizType: QUALIFICATION_FILE_BIZ_TYPE })
      .andWhere("file.status = 1")
      .andWhere("file.is_deleted = false")
      .getOne();
    if (!file) {
      throw new BadRequestException("Qualification file is invalid");
    }
    const bound = await qualificationRepository
      .createQueryBuilder("qualification")
      .where("qualification.tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("qualification.park_id = :parkId", { parkId: scope.parkId })
      .andWhere("qualification.file_id = :fileId", { fileId })
      .andWhere("qualification.is_deleted = false")
      .andWhere(currentQualificationId ? "qualification.id <> :currentQualificationId" : "1 = 1", { currentQualificationId })
      .getOne();
    if (bound) {
      throw new BadRequestException("Qualification file is already bound");
    }
    return file;
  }

  private async bindFileToQualification(
    fileRepository: Repository<FileEntity>,
    scope: TenantParkScope,
    actorId: string,
    fileId: string,
    qualificationId: string
  ): Promise<void> {
    await fileRepository
      .createQueryBuilder()
      .update(FileEntity)
      .set({ bizId: qualificationId, updateBy: actorId })
      .where("tenant_id = :tenantId", { tenantId: scope.tenantId })
      .andWhere("park_id = :parkId", { parkId: scope.parkId })
      .andWhere("id = :fileId", { fileId })
      .andWhere("biz_type = :bizType", { bizType: QUALIFICATION_FILE_BIZ_TYPE })
      .andWhere("is_deleted = false")
      .execute();
  }

  private emptyToNull(value: string | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }
}
