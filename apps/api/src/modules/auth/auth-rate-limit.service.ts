import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash } from "node:crypto";

export interface AuthRateLimitRequest {
  endpoint: string;
  ipAddress: string | null;
  identifier?: string | null;
  limit?: number;
  windowMs?: number;
  ipLimit?: number;
  ipWindowMs?: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 10_000;
const DEFAULT_LIMITS: Record<string, number> = {
  login: 20,
  "token-refresh": 60,
  "select-context": 30,
  "mobile-send-code": 5,
  "mobile-login": 20,
  "wechat-authorize": 20,
  "wechat-callback": 20
};
const DEFAULT_IP_LIMITS: Record<string, number> = {
  login: 100,
  "token-refresh": 300,
  "select-context": 150,
  "mobile-send-code": 30,
  "mobile-login": 100,
  "wechat-authorize": 100,
  "wechat-callback": 100
};

@Injectable()
export class AuthRateLimitService {
  private readonly buckets = new Map<string, RateBucket>();
  private now: () => number = () => Date.now();

  constructor(private readonly configService: ConfigService) {}

  assertAllowed(request: AuthRateLimitRequest): void {
    const endpoint = this.normalizePart(request.endpoint || "unknown");
    const currentTime = this.now();
    this.pruneExpired(currentTime);

    if (this.isIpBucketsEnabled()) {
      this.consumeBucket({
        key: this.buildIpKey(endpoint, request.ipAddress),
        limit: request.ipLimit ?? this.getIpLimit(endpoint),
        windowMs: request.ipWindowMs ?? this.getIpWindowMs(endpoint),
        currentTime
      });
    }
    this.consumeBucket({
      key: this.buildCredentialKey(endpoint, request.ipAddress, request.identifier),
      limit: request.limit ?? this.getLimit(endpoint),
      windowMs: request.windowMs ?? this.getWindowMs(endpoint),
      currentTime
    });
  }

  clear(): void {
    this.buckets.clear();
  }

  setClockForTest(now: () => number): void {
    this.now = now;
  }

  getBucketCountForTest(): number {
    return this.buckets.size;
  }

  private consumeBucket({
    key,
    limit,
    windowMs,
    currentTime
  }: {
    key: string;
    limit: number;
    windowMs: number;
    currentTime: number;
  }): void {
    const bucket = this.buckets.get(key);

    if (!bucket || bucket.resetAt <= currentTime) {
      if (!bucket && this.buckets.size >= this.getMaxBuckets()) {
        this.throwTooManyRequests();
      }
      this.buckets.set(key, { count: 1, resetAt: currentTime + windowMs });
      return;
    }

    if (bucket.count >= limit) {
      this.throwTooManyRequests();
    }

    bucket.count += 1;
  }

  private getLimit(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_LIMIT`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_LIMITS[endpoint] ?? 20;
  }

  private getIpLimit(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_IP_LIMIT`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_IP_LIMITS[endpoint] ?? 100;
  }

  private getWindowMs(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_WINDOW_MS`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_MS;
  }

  private getIpWindowMs(endpoint: string): number {
    const configKey = `AUTH_RATE_LIMIT_${endpoint.toUpperCase().replace(/-/g, "_")}_IP_WINDOW_MS`;
    const configured = Number(this.configService.get<string>(configKey, ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_WINDOW_MS;
  }

  private getMaxBuckets(): number {
    const configured = Number(this.configService.get<string>("AUTH_RATE_LIMIT_MAX_BUCKETS", ""));
    return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_BUCKETS;
  }

  private isIpBucketsEnabled(): boolean {
    const configured = (this.configService.get<string>("AUTH_RATE_LIMIT_IP_BUCKETS_ENABLED", "") ?? "").trim().toLowerCase();
    return ["1", "true", "yes", "on"].includes(configured);
  }

  private buildIpKey(endpoint: string, ipAddress: string | null): string {
    // Stage A uses single-process in-memory buckets only. Multi-instance deployments
    // should replace this with Redis/DB backed counters in a later WP3 phase.
    return [endpoint, this.normalizePart(ipAddress ?? "unknown-ip"), "ip"].join(":");
  }

  private buildCredentialKey(endpoint: string, ipAddress: string | null, identifier?: string | null): string {
    return [endpoint, this.normalizePart(ipAddress ?? "unknown-ip"), "credential", this.hashIdentifier(identifier ?? "anonymous")].join(":");
  }

  private pruneExpired(currentTime: number): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= currentTime) {
        this.buckets.delete(key);
      }
    }
  }

  private normalizePart(value: string): string {
    return value.trim().toLowerCase().slice(0, 256) || "empty";
  }

  private hashIdentifier(value: string): string {
    return createHash("sha256").update(this.normalizeCredentialPart(value)).digest("hex");
  }

  private normalizeCredentialPart(value: string): string {
    return value.trim().slice(0, 256) || "empty";
  }

  private throwTooManyRequests(): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: "Too many authentication attempts, please try again later",
        error: "Too Many Requests"
      },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }
}
