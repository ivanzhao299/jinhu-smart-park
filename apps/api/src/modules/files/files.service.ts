import { BadRequestException, Injectable, NotFoundException, UnsupportedMediaTypeException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { extname } from "node:path";
import type { Repository } from "typeorm";
import { ILike, In, IsNull, Not } from "typeorm";
import {
  formatFileSize,
  getFileUploadLimitForMime,
  resolveFileUploadPolicy,
  type PaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { AuditService } from "../audit/audit.service";
import type { JwtPrincipal } from "../../shared/types/jwt-principal";
import type { FileQueryDto } from "./dto/file-query.dto";
import type { UploadFileDto } from "./dto/upload-file.dto";
import { FileEntity } from "./entities/file.entity";
import { FileStorageService } from "./storage/file-storage.service";
import {
  FileBusinessAccessService,
  PROPERTY_BUSINESS_FILE_TYPES
} from "./file-business-access.service";

export interface UploadedFilePayload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface DownloadFileResult {
  file: FileEntity;
  absolutePath: string;
}

export const TENANT_BRAND_LOGO_BIZ_TYPE = "tenant_brand_logo";

export function normalizeMultipartFileName(originalName: string): string {
  if (![...originalName].some((character) => character.charCodeAt(0) > 0x7f)) {
    return originalName;
  }
  const decoded = Buffer.from(originalName, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) return originalName;
  return Buffer.from(decoded, "utf8").toString("latin1") === originalName
    ? decoded
    : originalName;
}

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly fileRepository: Repository<FileEntity>,
    private readonly storageService: FileStorageService,
    private readonly auditService: AuditService,
    private readonly businessAccessService: FileBusinessAccessService
  ) {}

  async uploadForActor(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    dto: UploadFileDto,
    file: UploadedFilePayload | undefined
  ): Promise<FileEntity> {
    await this.businessAccessService.assertReferenceAccess(
      scope,
      actor,
      dto.biz_type,
      dto.biz_id,
      "write",
      actor.sub
    );
    return this.upload(scope, actor.sub, dto, file);
  }

  async upload(
    scope: TenantParkScope,
    actorId: string,
    dto: UploadFileDto,
    file: UploadedFilePayload | undefined
  ): Promise<FileEntity> {
    if (!file) {
      throw new BadRequestException("file is required");
    }
    this.validateFile(dto.biz_type, file);
    const originalName = normalizeMultipartFileName(file.originalname);

    const now = new Date();
    const day = this.formatDay(now);
    const fileCode = await this.nextFileCode(scope, day);
    const originalExt = extname(originalName);
    const storedName = `${randomUUID()}${originalExt}`;
    const relativeDir = `${scope.tenantId}/${scope.parkId}/${day}`;
    const md5 = createHash("md5").update(file.buffer).digest("hex");
    const stored = await this.storageService.save({ buffer: file.buffer, storedName, relativeDir }, "local");

    const entity = await this.fileRepository.save(
      this.fileRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        fileCode,
        originalName,
        storedName,
        fileUrl: "",
        fileSize: String(file.size),
        mimeType: file.mimetype,
        md5,
        bizType: dto.biz_type,
        bizId: dto.biz_id ?? null,
        storageType: stored.storageType,
        storageBucket: stored.storageBucket,
        storagePath: stored.storagePath,
        isEncrypted: false,
        status: 1,
        remark: dto.remark ?? null,
        createBy: actorId,
        updateBy: actorId
      })
    );
    entity.fileUrl = `/api/v1/files/${entity.id}/download`;
    return this.fileRepository.save(entity);
  }

  async list(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    query: FileQueryDto
  ): Promise<PaginatedResult<FileEntity>> {
    const isPendingPurchaseList = query.biz_type === "housing_purchase" && !query.biz_id;
    if (query.biz_type && this.businessAccessService.isProtectedBizType(query.biz_type)) {
      await this.businessAccessService.assertReferenceAccess(
        scope,
        actor,
        query.biz_type,
        query.biz_id,
        "read",
        isPendingPurchaseList ? actor.sub : undefined
      );
    }
    const [items, total] = await this.fileRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.biz_type
          ? { bizType: query.biz_type }
          : { bizType: Not(In([...PROPERTY_BUSINESS_FILE_TYPES])) }),
        ...(query.biz_id
          ? { bizId: query.biz_id }
          : isPendingPurchaseList
            ? { bizId: IsNull(), createBy: actor.sub }
            : {}),
        ...(query.keyword ? { originalName: ILike(`%${query.keyword}%`) } : {})
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detailForActor(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string,
    action: "read" | "write" = "read"
  ): Promise<FileEntity> {
    const file = await this.detail(scope, id);
    this.businessAccessService.assertPendingFileOwner(actor, file);
    await this.businessAccessService.assertReferenceAccess(
      scope,
      actor,
      file.bizType,
      file.bizId,
      action,
      file.createBy ?? undefined
    );
    return file;
  }

  async detail(scope: TenantParkScope, id: string): Promise<FileEntity> {
    const entity = await this.fileRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("File not found");
    }
    return entity;
  }

  async prepareDownload(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<DownloadFileResult> {
    const file = await this.detailForActor(scope, actor, id);
    return {
      file,
      absolutePath: this.storageService.resolve(file.storagePath, this.toStorageType(file.storageType))
    };
  }

  async assertBrandLogoReference(scope: TenantParkScope, id: string): Promise<FileEntity> {
    const file = await this.detail(scope, id);
    if (file.bizType !== TENANT_BRAND_LOGO_BIZ_TYPE || file.status !== 1 || !file.mimeType.startsWith("image/")) {
      throw new BadRequestException("品牌 Logo 引用无效");
    }
    return file;
  }

  async preparePublicBrandLogo(id: string): Promise<DownloadFileResult> {
    const file = await this.fileRepository.findOne({
      where: {
        id,
        bizType: TENANT_BRAND_LOGO_BIZ_TYPE,
        status: 1,
        isDeleted: false
      }
    });
    if (!file || !file.mimeType.startsWith("image/")) {
      throw new NotFoundException("Brand logo not found");
    }
    return {
      file,
      absolutePath: this.storageService.resolve(file.storagePath, this.toStorageType(file.storageType))
    };
  }

  async recordDownload(
    scope: TenantParkScope,
    user: { id: string; username: string; realName?: string; roles: string[] },
    file: FileEntity,
    requestId: string | null
  ): Promise<void> {
    await this.auditService.recordOperation({
      tenantId: scope.tenantId,
      parkId: scope.parkId,
      userId: user.id,
      username: user.username,
      realName: user.realName ?? null,
      roleCodes: user.roles,
      module: "FilesController",
      resource: "system.file",
      action: "download",
      bizType: file.bizType,
      bizId: file.bizId,
      method: "GET",
      path: file.fileUrl,
      success: true,
      requestId
    });
  }

  async softDelete(scope: TenantParkScope, actorId: string, id: string): Promise<{ id: string }> {
    const entity = await this.detail(scope, id);
    entity.isDeleted = true;
    entity.updateBy = actorId;
    await this.fileRepository.save(entity);
    return { id };
  }

  async softDeleteForActor(
    scope: TenantParkScope,
    actor: JwtPrincipal,
    id: string
  ): Promise<{ id: string }> {
    return this.fileRepository.manager.transaction(async (manager) => {
      const repository = manager.getRepository(FileEntity);
      const file = await repository.findOne({
        where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false },
        lock: { mode: "pessimistic_write" }
      });
      if (!file) throw new NotFoundException("File not found");
      this.businessAccessService.assertPendingFileOwner(actor, file);
      await this.businessAccessService.assertReferenceAccess(
        scope,
        actor,
        file.bizType,
        file.bizId,
        "write",
        file.createBy ?? undefined
      );
      await this.businessAccessService.assertDeletionAllowed(scope, file, manager);
      await this.businessAccessService.detachReferencesOnDelete(scope, file, actor.sub, manager);
      file.isDeleted = true;
      file.updateBy = actor.sub;
      await repository.save(file);
      return { id };
    });
  }

  createReadStream(absolutePath: string) {
    return createReadStream(absolutePath);
  }

  private validateFile(bizType: string, file: UploadedFilePayload): void {
    const policy = resolveFileUploadPolicy(bizType);
    if (!policy.mimeTypes.includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(`${policy.label}不支持该文件类型`);
    }
    const sizeLimit = getFileUploadLimitForMime(policy, file.mimetype);
    if (file.size > sizeLimit) {
      throw new BadRequestException(`${policy.label}大小不能超过 ${formatFileSize(sizeLimit)}`);
    }
  }

  private async nextFileCode(scope: TenantParkScope, day: string): Promise<string> {
    const prefix = `FILE${day}`;
    const count = await this.fileRepository.count({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        fileCode: ILike(`${prefix}%`)
      }
    });
    return `${prefix}${String(count + 1).padStart(6, "0")}`;
  }

  private formatDay(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}${month}${day}`;
  }

  private toStorageType(storageType: string): "local" | "minio" | "oss" {
    if (storageType === "local" || storageType === "minio" || storageType === "oss") {
      return storageType;
    }
    throw new UnsupportedMediaTypeException(`Unsupported storage type: ${storageType}`);
  }
}
