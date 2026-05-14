import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Repository } from "typeorm";
import { Between, ILike, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import type { PaginatedResult, TenantParkScope } from "@jinhu/shared";
import type { AuditQueryDto } from "./dto/audit-query.dto";
import { LoginLogEntity } from "./entities/login-log.entity";
import { OpLogEntity } from "./entities/op-log.entity";

export interface RecordOperationInput {
  tenantId: string;
  parkId: string;
  userId: string | null;
  username?: string | null;
  realName?: string | null;
  roleCodes?: string[] | string | null;
  module: string;
  resource?: string | null;
  action: string;
  bizType?: string | null;
  bizId?: string | null;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  clientIp?: string | null;
  clientUa?: string | null;
  method: string;
  path: string;
  success: boolean;
  result?: string | null;
  errorMsg?: string | null;
  requestId: string | null;
  idempotencyKey?: string | null;
}

export interface RecordLoginInput {
  tenantId: string;
  parkId: string;
  userId: string | null;
  username: string;
  ipAddress: string | null;
  userAgent: string | null;
  loginMethod?: string | null;
  success: boolean;
  message: string | null;
  requestId?: string | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(LoginLogEntity)
    private readonly loginLogRepository: Repository<LoginLogEntity>,
    @InjectRepository(OpLogEntity)
    private readonly opLogRepository: Repository<OpLogEntity>
  ) {}

  async listLoginLogs(scope: TenantParkScope, query: AuditQueryDto): Promise<PaginatedResult<LoginLogEntity>> {
    const [items, total] = await this.loginLogRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.success === undefined ? {} : { success: query.success }),
        ...(query.result ? { result: query.result } : {}),
        ...(query.username ? { username: ILike(`%${query.username}%`) } : {}),
        ...(query.keyword ? { username: ILike(`%${query.keyword}%`) } : {}),
        ...this.timeRange("loginTime", query)
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async listOperationLogs(scope: TenantParkScope, query: AuditQueryDto): Promise<PaginatedResult<OpLogEntity>> {
    const [items, total] = await this.opLogRepository.findAndCount({
      where: {
        tenantId: scope.tenantId,
        parkId: scope.parkId,
        isDeleted: false,
        ...(query.success === undefined ? {} : { success: query.success }),
        ...(query.user_id ? { userId: query.user_id } : {}),
        ...(query.username ? { username: ILike(`%${query.username}%`) } : {}),
        ...(query.biz_type ? { bizType: query.biz_type } : {}),
        ...(query.biz_id ? { bizId: query.biz_id } : {}),
        ...(query.result ? { result: query.result } : {}),
        ...(query.module ? { module: ILike(`%${query.module}%`) } : {}),
        ...(query.action ? { action: ILike(`%${query.action}%`) } : {}),
        ...(query.keyword ? { path: ILike(`%${query.keyword}%`) } : {}),
        ...this.timeRange("opTime", query)
      },
      order: { createTime: "DESC" },
      skip: (query.page - 1) * query.page_size,
      take: query.page_size
    });
    return { items, total, page: query.page, page_size: query.page_size };
  }

  async detailOperationLog(scope: TenantParkScope, id: string): Promise<OpLogEntity> {
    const entity = await this.opLogRepository.findOne({
      where: { id, tenantId: scope.tenantId, parkId: scope.parkId, isDeleted: false }
    });
    if (!entity) {
      throw new NotFoundException("Operation log not found");
    }
    return entity;
  }

  async recordOperation(input: RecordOperationInput): Promise<void> {
    try {
      const entity = this.opLogRepository.create({
        tenantId: input.tenantId,
        parkId: input.parkId,
        userId: input.userId,
        username: input.username ?? null,
        realName: input.realName ?? null,
        roleCodes: Array.isArray(input.roleCodes) ? input.roleCodes.join(",") : input.roleCodes ?? null,
        module: input.module,
        resource: input.resource ?? null,
        action: input.action,
        bizType: input.bizType ?? null,
        bizId: input.bizId ?? null,
        beforeJson: input.beforeJson ?? null,
        afterJson: input.afterJson ?? null,
        clientIp: input.clientIp ?? null,
        clientUa: input.clientUa ?? null,
        method: input.method,
        path: input.path,
        success: input.success,
        opTime: new Date(),
        result: input.result ?? (input.success ? "success" : "fail"),
        errorMsg: input.errorMsg ?? null,
        requestId: input.requestId,
        idempotencyKey: input.idempotencyKey ?? null
      });
      await this.opLogRepository.save(entity);
    } catch (error) {
      this.logger.error("Failed to record operation log", error instanceof Error ? error.stack : String(error));
    }
  }

  async recordLogin(input: RecordLoginInput): Promise<void> {
    try {
      await this.loginLogRepository.insert({
        tenantId: input.tenantId,
        parkId: input.parkId,
        userId: input.userId,
        username: input.username,
        loginTime: new Date(),
        loginIp: input.ipAddress,
        loginUa: input.userAgent,
        loginMethod: input.loginMethod ?? "password",
        result: input.success ? "success" : "fail",
        failReason: input.success ? null : input.message,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        success: input.success,
        message: input.message
      });
    } catch (error) {
      this.logger.error("Failed to record login log", error instanceof Error ? error.stack : String(error));
    }
  }

  private timeRange(column: "opTime" | "loginTime", query: AuditQueryDto) {
    const start = query.start_time ? new Date(query.start_time) : undefined;
    const end = query.end_time ? new Date(query.end_time) : undefined;
    if (start && end) {
      return { [column]: Between(start, end) };
    }
    if (start) {
      return { [column]: MoreThanOrEqual(start) };
    }
    if (end) {
      return { [column]: LessThanOrEqual(end) };
    }
    return {};
  }
}
