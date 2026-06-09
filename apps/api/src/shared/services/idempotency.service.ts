import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createHash } from "node:crypto";
import { DataSource, LessThan, type Repository } from "typeorm";
import { IdempotencyRequestEntity } from "../entities/idempotency-request.entity";

const LOCK_TTL_MS = 5 * 60 * 1000;
const RETENTION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_CACHED_RESPONSE_BYTES = 256 * 1024;

export interface IdempotencyScopeInput {
  tenantId: string;
  parkId: string;
  userId: string;
  idempotencyKey: string;
  requestMethod: string;
  requestPath: string;
}

export interface IdempotencyFingerprintInput extends IdempotencyScopeInput {
  query: unknown;
  body: unknown;
}

export interface IdempotencyBeginContext extends IdempotencyScopeInput {
  requestFingerprint: string;
}

export interface IdempotencyCachedResponse {
  responseStatus: number;
  responseBody: unknown;
}

export interface IdempotencyBeginResult {
  outcome: "began" | "cached" | "processing" | "conflict";
  request: IdempotencyRequestEntity;
  cachedResponse?: IdempotencyCachedResponse;
  reason?: "fingerprint_mismatch" | "cached_response_missing" | "processing" | "unexpected_state";
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    @InjectRepository(IdempotencyRequestEntity)
    private readonly idempotencyRequestsRepository: Repository<IdempotencyRequestEntity>,
    private readonly dataSource: DataSource
  ) {}

  buildFingerprint(input: IdempotencyFingerprintInput): string {
    const normalized = {
      method: input.requestMethod.toUpperCase(),
      path: input.requestPath,
      query: normalizeValue(input.query),
      body: normalizeValue(input.body),
      userId: input.userId,
      tenantId: input.tenantId,
      parkId: input.parkId
    };
    return createHash("sha256").update(stableStringify(normalized)).digest("hex");
  }

  async tryBegin(input: IdempotencyBeginContext): Promise<IdempotencyBeginResult> {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(IdempotencyRequestEntity);
      const existing = await repository.findOne({
        where: this.scopeWhere(input),
        lock: { mode: "pessimistic_write" }
      });

      if (!existing) {
        return this.insertProcessing(repository, input);
      }

      return this.resolveExisting(repository, existing, input);
    });
  }

  async markSucceeded(id: string, responseStatus: number, responseBody: unknown): Promise<void> {
    const now = new Date();
    const persistedBody = sanitizeCachedResponse(responseBody ?? null);
    const serialized = JSON.stringify(persistedBody);
    if (serialized !== undefined) {
      const size = Buffer.byteLength(serialized, "utf8");
      if (size > MAX_CACHED_RESPONSE_BYTES) {
        this.logger.warn(`Idempotency response cache exceeds ${MAX_CACHED_RESPONSE_BYTES} bytes for request ${id}`);
      }
    }

    await this.idempotencyRequestsRepository.update(
      { id },
      {
        status: "succeeded",
        responseStatus,
        responseBody: persistedBody as never,
        errorCode: null as never,
        lockedUntil: now,
        expiresAt: new Date(now.getTime() + RETENTION_TTL_MS),
        updatedAt: now
      } as never
    );
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    const now = new Date();
    await this.idempotencyRequestsRepository.update(
      { id },
      {
        status: "failed",
        errorCode,
        responseStatus: null as never,
        responseBody: null as never,
        lockedUntil: now,
        expiresAt: new Date(now.getTime() + RETENTION_TTL_MS),
        updatedAt: now
      } as never
    );
  }

  async getSucceededResponse(input: IdempotencyBeginContext): Promise<IdempotencyCachedResponse | null> {
    const existing = await this.idempotencyRequestsRepository.findOne({
      where: this.scopeWhere(input)
    });
    if (!existing || existing.status !== "succeeded" || existing.requestFingerprint !== input.requestFingerprint) {
      return null;
    }
    if (existing.responseStatus === null || existing.responseBody === null) {
      return null;
    }
    return {
      responseStatus: existing.responseStatus,
      responseBody: existing.responseBody
    };
  }

  async cleanupExpired(limit: number): Promise<number> {
    const normalizedLimit = Number.isFinite(limit) ? Math.floor(limit) : 0;
    if (normalizedLimit < 1) {
      return 0;
    }

    const now = new Date();
    const expired = await this.idempotencyRequestsRepository.find({
      select: { id: true },
      where: {
        expiresAt: LessThan(now)
      },
      order: {
        expiresAt: "ASC",
        createdAt: "ASC"
      },
      take: normalizedLimit
    });

    if (expired.length === 0) {
      return 0;
    }

    const result = await this.idempotencyRequestsRepository.delete(expired.map((record) => record.id) as never);
    return result.affected ?? expired.length;
  }

  private async insertProcessing(
    repository: Repository<IdempotencyRequestEntity>,
    input: IdempotencyBeginContext
  ): Promise<IdempotencyBeginResult> {
    const now = new Date();
    const entity = repository.create({
      tenantId: input.tenantId,
      parkId: input.parkId,
      userId: input.userId,
      idempotencyKey: input.idempotencyKey,
      requestMethod: input.requestMethod.toUpperCase(),
      requestPath: input.requestPath,
      requestFingerprint: input.requestFingerprint,
      status: "processing",
      responseStatus: null,
      responseBody: null,
      errorCode: null,
      lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
      expiresAt: new Date(now.getTime() + RETENTION_TTL_MS)
    });

    try {
      const saved = await repository.save(entity);
      return {
        outcome: "began",
        request: saved
      };
    } catch (error) {
      if (!isUniqueViolation(error)) {
        throw error;
      }
      const existing = await repository.findOne({
        where: this.scopeWhere(input),
        lock: { mode: "pessimistic_write" }
      });
      if (!existing) {
        throw error;
      }
      return this.resolveExisting(repository, existing, input);
    }
  }

  private async resolveExisting(
    repository: Repository<IdempotencyRequestEntity>,
    existing: IdempotencyRequestEntity,
    input: IdempotencyBeginContext
  ): Promise<IdempotencyBeginResult> {
    const now = new Date();
    if (existing.requestFingerprint !== input.requestFingerprint) {
      return {
        outcome: "conflict",
        request: existing,
        reason: "fingerprint_mismatch"
      };
    }

    if (existing.status === "succeeded") {
      if (existing.responseStatus === null || existing.responseBody === null) {
        return {
          outcome: "conflict",
          request: existing,
          reason: "cached_response_missing"
        };
      }
      return {
        outcome: "cached",
        request: existing,
        cachedResponse: {
          responseStatus: existing.responseStatus,
          responseBody: existing.responseBody
        }
      };
    }

    if (existing.status === "processing" && existing.lockedUntil.getTime() > now.getTime()) {
      return {
        outcome: "processing",
        request: existing,
        reason: "processing"
      };
    }

    if (existing.status === "processing" || existing.status === "failed") {
      const refreshed = repository.create({
        ...existing,
        requestMethod: input.requestMethod.toUpperCase(),
        requestPath: input.requestPath,
        requestFingerprint: input.requestFingerprint,
        status: "processing",
        responseStatus: null,
        responseBody: null,
        errorCode: null,
        lockedUntil: new Date(now.getTime() + LOCK_TTL_MS),
        expiresAt: new Date(now.getTime() + RETENTION_TTL_MS)
      });
      const saved = await repository.save(refreshed);
      return {
        outcome: "began",
        request: saved
      };
    }

    return {
      outcome: "conflict",
      request: existing,
      reason: "unexpected_state"
    };
  }

  private scopeWhere(input: IdempotencyBeginContext) {
    return {
      tenantId: input.tenantId,
      userId: input.userId,
      requestPath: input.requestPath,
      idempotencyKey: input.idempotencyKey
    };
  }
}

let idempotencyServiceSingleton: IdempotencyService | null = null;

export function setIdempotencyService(service: IdempotencyService): void {
  idempotencyServiceSingleton = service;
}

export function getIdempotencyService(): IdempotencyService {
  if (!idempotencyServiceSingleton) {
    throw new Error("IdempotencyService has not been initialized");
  }
  return idempotencyServiceSingleton;
}

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const code = (error as { code?: string }).code;
  return code === "23505";
}

function normalizeValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => [key, normalizeValue(record[key])])
  );
}

function stableStringify(value: unknown): string {
  if (value === undefined) {
    return "null";
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sanitizeCachedResponse<T>(value: T): T {
  return sanitizeValue(value) as T;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (typeof value !== "object" || value === null || Buffer.isBuffer(value)) {
    return value;
  }
  const maskedKeys = new Set(["password", "passwordHash", "token", "accessToken", "refreshToken", "secret", "secretKey", "secretEncrypted"]);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      maskedKeys.has(key) ? "***" : sanitizeValue(entryValue)
    ])
  );
}
