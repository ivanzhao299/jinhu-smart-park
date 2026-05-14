import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import type { CreateAttachmentDto } from "./dto/create-attachment.dto";
import { AttachmentEntity } from "./entities/attachment.entity";

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(AttachmentEntity)
    private readonly attachmentRepository: Repository<AttachmentEntity>
  ) {}

  async list(
    scope: TenantParkScope,
    query: PaginationQueryDto,
    bizType?: string,
    bizId?: string
  ): Promise<PaginatedResult<AttachmentEntity>> {
    const [items, total] = await this.attachmentRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.status ? { status: query.status } : {}),
        ...(query.keyword ? { fileName: ILike(`%${query.keyword}%`) } : {}),
        ...(bizType ? { bizType } : {}),
        ...(bizId ? { bizId } : {})
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async create(scope: TenantParkScope, actorId: string, dto: CreateAttachmentDto): Promise<AttachmentEntity> {
    return this.attachmentRepository.save(
      this.attachmentRepository.create({
        ...dto,
        bizId: dto.bizId ?? null,
        fileExt: dto.fileExt ?? null,
        mimeType: dto.mimeType ?? null,
        fileSize: String(dto.fileSize),
        sha256: dto.sha256 ?? null,
        status: dto.status ?? "enabled",
        remark: dto.remark ?? null,
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        createBy: actorId,
        updateBy: actorId
      })
    );
  }

  async detail(scope: TenantParkScope, id: string): Promise<AttachmentEntity> {
    const entity = await this.attachmentRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Attachment not found");
    }
    return entity;
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.attachmentRepository.save(entity);
    return { id };
  }
}
