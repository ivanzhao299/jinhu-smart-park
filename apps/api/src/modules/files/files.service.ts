import { BadRequestException, Injectable, NotFoundException, UnsupportedMediaTypeException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { extname } from "node:path";
import type { Repository } from "typeorm";
import { ILike } from "typeorm";
import {
  formatFileSize,
  getFileUploadLimitForMime,
  resolveFileUploadPolicy,
  type PaginatedResult,
  type TenantParkScope
} from "@jinhu/shared";
import { AuditService } from "../audit/audit.service";
import type { FileQueryDto } from "./dto/file-query.dto";
import type { UploadFileDto } from "./dto/upload-file.dto";
import { FileEntity } from "./entities/file.entity";
import { FileStorageService } from "./storage/file-storage.service";

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

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileEntity)
    private readonly fileRepository: Repository<FileEntity>,
    private readonly storageService: FileStorageService,
    private readonly auditService: AuditService
  ) {}

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

    const now = new Date();
    const day = this.formatDay(now);
    const fileCode = await this.nextFileCode(scope, day);
    const originalExt = extname(file.originalname);
    const storedName = `${randomUUID()}${originalExt}`;
    const relativeDir = `${scope.tenantId}/${scope.parkId}/${day}`;
    const md5 = createHash("md5").update(file.buffer).digest("hex");
    const stored = await this.storageService.save({ buffer: file.buffer, storedName, relativeDir }, "local");

    const entity = await this.fileRepository.save(
      this.fileRepository.create({
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        fileCode,
        originalName: file.originalname,
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

  async list(scope: TenantParkScope, query: FileQueryDto): Promise<PaginatedResult<FileEntity>> {
    const [items, total] = await this.fileRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.biz_type ? { bizType: query.biz_type } : {}),
        ...(query.biz_id ? { bizId: query.biz_id } : {}),
        ...(query.keyword ? { originalName: ILike(`%${query.keyword}%`) } : {})
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
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

  async prepareDownload(scope: TenantParkScope, id: string): Promise<DownloadFileResult> {
    const file = await this.detail(scope, id);
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
